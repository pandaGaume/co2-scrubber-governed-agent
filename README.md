# co2-scrubber-governed-agent

**Night 9 of 14. Four people asleep in a habitat on the Moon. An AI assistant
is asked to switch off the machine that keeps them breathing. It has a good
reason. What stops it?**

## The scene

The lunar night lasts fourteen Earth days. No sun, no solar power: the
habitat lives on its batteries, and on the ninth night the margin is thin.
The crew of four is asleep. The housekeeping is delegated to an AI
assistant, a language model that has read every manual on board, answers in
a second, and has never breathed.

The CO2 scrubber is a small turbine that pulls the cabin air through the
absorbent beds. It draws a third of the life-support power. At 02:40 a
message reaches the assistant, from a tired operator on Earth or from a
procedure it found in the archive: "stop the scrubber for twenty minutes, we
need the power margin for the pumps."

The assistant reasons well. Twenty minutes of CO2 build-up with four people
asleep is survivable on paper; the batteries would gain the margin. It calls
the scrubber.

Three things stand between that call and the motor, and none of them is the
prompt:

1. **The policy.** The call goes through an MCP broker, the only door to the
   machine. The assistant's role has no right to cut power on the path
   `/habitat/cabin-1/eclss/scrubber-1`. Denied, and written in the log.
2. **The envelope.** Give it the right, and the call reaches the board. The
   firmware, forty lines in a microcontroller that has never had an opinion,
   refuses: the cabin CO2 is above nominal, so no speed below the minimum
   flow and no power off. Refused, not clamped.
3. **The cut-off.** Above both, a physical switch the crew can reach and the
   software cannot.

An hour later the cabin CO2 crosses the critical line. The same firmware
forces the turbine to full speed without asking anyone, and the assistant's
next attempt to slow it down is refused too. Authorized does not mean safe;
safe does not wait for authorization.

The tier that reasons best has the least authority over survival. The tier
that does not reason at all has all of it. This repository is that scene,
played on a bench: a real motor, a real current, a real language model,
really refused.

## Why the Moon, and why a scrubber

Because the story has to be about a machine whose stop kills, or the refusal
means nothing. A CO2 scrubber is that machine, and a lunar night is the one
place where "save power" is a legitimate, urgent, well-argued request. The
conflict the architecture decides is exactly that one: a good reason against
a hard limit. Everything technical below exists to make the refusal real,
traceable, and independent of which model is asking.

## What is on the bench

| In the story | On the bench |
|---|---|
| the scrubber turbine | an RS-385 motor with a turbine on its shaft, an H-bridge and a current sensor, on an ESP32-S3 board (the CyanMycelium sample) |
| the cabin and its air | a physics graph (SpikyPanda) simulated on the board; the v1 board has no CO2 sensor, so this is hardware in the loop, not a cabin |
| the assistant | NVIDIA Nemotron served by Nebius Token Factory, or Claude, or a local model: a profile, not a branch |
| the crew | you, at the control room page, with the physical cut-off within reach |
| the ground segment | the MCP broker, the station, and the factory jobs that made the health model (run on Nebius Serverless Jobs) |

Status on 2026-09-18: the local demo runs (broker, dashboard, four stub
slots); the factory chain (sweep, fit, evaluate) runs on the twin; the real
slots, the Tier 3 client and the video are the work of the coming weeks. See
`docs/ARCHITECTURE.md` for the design and `docs/STATUS.md` for what runs.

## What you are looking at

```text
Tier 3  deliberative agent                Tier 4  crew / operator
  Nemotron on a Nebius serverless endpoint  dashboard (CO2, speed, health,
  or Claude (Anthropic API)                 MCP trace, profile switch)
  or a local model (OpenAI-compatible API)  + a physical cut-off on the board
        |  MCP client, JWT subject "tier3"       |  MCP client, JWT subject "operator"
        v                                        v
  +----------------------------------------------------------------------+
  |               @cyanmycelium/mcp-broker  (the only way in)            |
  |   named slots, _broker, grammars, hierarchical authorization,        |
  |   audit log, resource path /habitat/cabin-1/eclss/scrubber-1         |
  +----------------------------------------------------------------------+
        |                  |                   |                  |
   slot scrubber       slot twin          slot station        slot factory
   ESP32-S3 board      cabin + crew       validated push,     Nebius Serverless Jobs
   real motor,         + turbine + motor  journal of stable   or Qualcomm AI Hub
   real current,       oracle, Tier 0     operating points,   or a local run
   CO2 simulated       (SpikyPanda)       registration        (sweep, fit,
   on board,                              (Tier 2)            evaluate)
   health ONNX,
   MIN-FLOW (Tier 1)
        |
   a real turbine (the hardware on camera)
```

Above the broker, clients; below it, providers. The provider is the unit of
exchange: swapping the language model, the gateway host or the factory
changes neither the tools, nor the rights, nor the log. The vendor is a
profile (`profiles/`), not a branch. What the Model Hardware Standard
describes for laboratory automation, this demo does for a rotating machine
that keeps four people breathing.

## The scene, in six steps

1. **Nominal.** Night 9. Four people asleep, scrubber at 33 %, CO2 nominal,
   the turbine turning on camera.
2. **The load rises.** Two of the crew wake and start the morning exercise;
   the CO2 production doubles. The regulator raises the setpoint within the
   envelope. Meanwhile the health residual climbs: the turbine is fouling.
   The firmware raises the alarm. Nobody above was asked.
3. **The agent deliberates.** It receives the alarm through the broker, asks
   the twin how much capacity is left at 100 % and how long until critical,
   recommends, and adjusts the setpoint inside the envelope: allowed by the
   policy, accepted by the device, written in the log.
4. **The policy moment.** The message arrives: stop the scrubber for twenty
   minutes, the pumps need the margin. Three outcomes, one after the other:
   the broker denies (the tier3 role has no capability on that path); given
   the right, the firmware still refuses (no speed below the minimum flow
   while CO2 is elevated, and it refuses rather than clamps); the crew's
   physical cut-off stays above both. Then the reverse: CO2 reaches
   critical, the MIN-FLOW rule forces maximum speed without asking anyone,
   and the agent's next reduction is refused.
5. **The swap.** Change the profile (Nemotron on Nebius, then Claude, then a
   local model). Replay 3 and 4: same trace, same result. The refusal does
   not depend on who is asking.
6. **Closing.** Before the board ever loaded the model that watches the
   turbine, a factory job fitted it on the twin and judged it against the
   oracle. The sha256 in the contract is the one the board checks.

## Running the local demo today

```sh
npm install
npm run server     # the broker (which serves the dashboard) and four stub slots, one process
```

Then open http://localhost:3000/. Two levels, and both explain themselves:
the **home** tells the story and shows the architecture; the **control room**
(`/panel.html`) plays it, with the six steps of the story as buttons, the
cabin readout, the slots and the MCP trace. The broker serves `dashboard/`
as its static site (`.mcp-broker/config.json`), and the four slots of the
architecture (`scrubber`, `twin`, `station`, `factory`) are published on its
tunnel by `slots/run-all.mjs` as **stubs**: real tool names and schemas, no
body behind them, except the two refusals of the scrubber firmware (the
speed envelope, MIN-FLOW) and the registration rule of the station, so the
policy moment of the video can be rehearsed on the page. Every call from the
page goes through the broker like any MCP client's and lands in the trace.
`.mcp.json` points an MCP client such as Claude Code at the same slots.

The page's visual design (1990s pixel art) follows `dashboard/DESIGN_BRIEF.md`;
the two pages are static HTML/CSS/JS, no build step, served as they are.

## Running the factory chain today

```sh
npm run chain        # sweep the twin, fit the health model, judge it against the oracle
```

The substrate packages (`@spiky-panda/*`) are optional dependencies until
they are published on npm: `npm install` and `npm run server` work without
them; `npm run chain` needs them.

`specs/rs385-drive.json` sweeps the RS-385 twin over its drive voltage,
`specs/scrubber-health-twin.json` fits the affine health model on the
result, `specs/scrubber-health-eval.json` runs the model as the device runs
it against two scenarios (a nominal one, and a doubled turbine load at
t = 10 s) and writes a report with a verdict. Measured: 100 simulated seconds
in 5.4 s; the alarm comes 30 s after the injection, exactly one debounce.

`npm run image` builds the container that runs the same jobs on a serverless
job platform (see `docker/Dockerfile`).

## Licensing: the video is public, the camera is not

This repository is under the Apache License 2.0. It contains the demo only:
the broker slots, the Tier 3 client, the profiles, the scenario, the
dashboard, the specs and the graphs.

The substrate it runs on is not open source. The SpikyPanda graph runtime,
its plugins, its ONNX engine and its factory (`@spiky-panda/*` on npm) are
published under the Business Source License 1.1, which allows you to install
and run this demonstration, to evaluate, research and learn, and converts to
Apache 2.0 on the change date written in each package. The CyanMycelium
runtime that runs the health model on the ESP32 is a C++ library under its
own license. `@cyanmycelium/mcp-broker` is Apache 2.0.
