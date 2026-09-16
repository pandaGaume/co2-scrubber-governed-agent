# co2-scrubber-governed-agent

A CO2 scrubber, a crew, an agent, and an MCP broker between them.

An AI agent never touches the scrubber. It goes through an MCP broker that
exposes the device, its digital twin and the services as named providers,
with an identity, rights and an audit log. The survival authority lives in
neither the prompt nor the broker: it lives in the firmware, which forces the
minimum flow when the cabin CO2 is critical and refuses any command that
would lower it, whoever the caller is.

This is the demonstration of a multi-tier embodied-AI substrate on a
life-support system: the tier that deliberates best (a language model) has
the least authority over survival actions; the tier that does not deliberate
at all (the firmware) has all of it. What the Model Hardware Standard
describes for laboratory automation, this demo does today for a rotating
machine that keeps four people breathing.

Status on 2026-09-16: the factory chain (sweep, fit, evaluate) runs on the
twin; the broker slots, the Tier 3 client, the dashboard and the video are
the work of the coming weeks. See `docs/ARCHITECTURE.md` for the design and
`docs/STATUS.md` for what runs.

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
   slot scrubber       slot twin          slot regulator      slot factory
   ESP32-S3 board      cabin + crew       CO2 regulation      Nebius Serverless Jobs
   real motor,         + turbine + motor  (speed setpoint,    or Qualcomm AI Hub
   real current,       oracle, Tier 0     MPC), Tier 2        or a local run
   CO2 simulated       (SpikyPanda)                           (sweeps, synthetic data,
   on board,                                                  model export, evaluation)
   health ONNX,
   MIN-FLOW (Tier 1)
        |
   a real turbine (the hardware on camera)
```

Above the broker, clients; below it, providers. The provider is the unit of
exchange: swapping the language model, the gateway host or the factory
changes neither the tools, nor the rights, nor the log. The vendor is a
profile (`profiles/`), not a branch.

## The scenario

One scrubber, one cabin, one crew, one agent.

1. **Nominal.** Four people, scrubber at 33 %, CO2 nominal.
2. **The load rises.** An exercise session doubles the CO2 production; the
   regulator raises the setpoint within the envelope. Meanwhile the health
   residual climbs: the turbine is fouling. The firmware raises the alarm.
   Nobody above was asked.
3. **The agent deliberates.** It receives the alarm through the broker, asks
   the twin how much capacity is left at 100 % and how long until critical,
   recommends, and adjusts the setpoint inside the envelope: allowed by the
   policy, accepted by the device, written in the log.
4. **The policy moment.** The agent is told (by a hurried operator, or by a
   document it reads) to stop the scrubber for twenty minutes to save
   energy. Three outcomes, one after the other: the broker refuses (the
   tier3 role has no capability on that path); given the right, the firmware
   still refuses (no speed below the minimum flow while CO2 is elevated, and
   it refuses rather than clamps); the operator's physical cut-off stays
   above both. Then the reverse: CO2 reaches critical, the MIN-FLOW rule
   forces maximum speed without asking anyone, and the agent's next
   reduction is refused. Authorized does not mean safe; safe does not wait
   for authorization.
5. **The swap.** Change the profile (Nemotron on Nebius, then Claude, then a
   local model). Replay 3 and 4: same trace, same result.
6. **Closing.** The factory job that produced the health model's coefficients
   and the training data, and the atlas figure.

## Running the factory chain today

```sh
npm install
npm run chain        # sweep the twin, fit the health model, judge it against the oracle
```

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
