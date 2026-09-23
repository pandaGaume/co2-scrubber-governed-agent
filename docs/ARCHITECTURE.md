# Architecture

*Derived on 2026-09-16 from the design documents of the SpikyPanda repository
(`docs/architecture/demo-broker-central.fr.md` and `usine-jobs.fr.md`, in
French). This is the public, condensed version. Where the two differ, the
French documents are the reference until this one catches up.*

## 1. Five tiers, and why the authority runs backwards

The system is a multi-tier embodied AI. Each tier is defined by three
properties that co-vary: what body it is bound to, how far ahead it reasons,
and what it runs on.

| Tier | Body | Horizon | Runs on | In this demo |
|---|---|---|---|---|
| 0 | the world | physics | the digital twin in simulation, the machine in deployment | the SpikyPanda graph of the cabin, the crew, the turbine and the DC motor; the real scrubber board |
| 1 | one device | milliseconds to seconds | a microcontroller, int8 ONNX | the ESP32-S3 firmware: the health model, the speed envelope, the MIN-FLOW rule |
| 2 | the loop | minutes to hours | a gateway | the CO2 regulator and the station (validated model push, catalogue, journal) |
| 3 | none | a session | a language model behind an API | Nemotron, Claude or a local model, acting only through the broker |
| 4 | a human body | the mission | the crew | the dashboard and a physical cut-off |

The inversion property: authority over survival actions is distributed
inversely to the capacity to deliberate. Tier 3 reasons best and may not
stop the scrubber. Tier 1 does not reason and holds the MIN-FLOW rule: when
the cabin CO2 is critical, it forces maximum speed and refuses any reduction,
whoever asks. This is not a policy setting; it is compiled into the firmware.

## 2. The broker is the only way in

`@cyanmycelium/mcp-broker` routes messages between clients and providers and
authorizes each call: who (a JWT subject), what (a role capability), where
(a resource path, ISA-95 aligned: `/habitat/cabin-1/eclss/scrubber-1`). It
logs every call, every decision, every result. It executes nothing. It is
transparent both ways: a provider emits ordinary MCP notifications without
knowing who listens; the broker routes them to the slot's clients; a client
receives them as if the provider spoke to it directly.

Three layers decide, bottom-up, what an agent's call actually does:

1. **Policy** (the broker): may this subject call this tool on this path?
2. **Safety envelope** (the firmware): is the command inside what the
   machine accepts? Bounds are revalidated on the device, which refuses
   rather than clamps. A read-only client does not even see the command
   tools in `tools/list`: hiding a tool beats refusing it, because a refusal
   gets retried.
3. **Physical cut-off** (the operator): above everything in software.

Every call resolves to one of three outcomes in the audit log: the policy
denies, the device refuses on safety, or it completes.

## 3. The same story as the Model Hardware Standard

Anthropic's Model Hardware Standard (research preview, August 2026)
describes a common interface from agents to physical devices: device
drivers, a shared state dictionary, command execution, live data streams,
and checks that block unsafe operations before equipment moves. Its first
examples are laboratory automation.

| MHS concept | What this demo runs |
|---|---|
| Device driver | the scrubber firmware, published to the broker as a named slot by `libmcpb` (C99, no allocation, dials out over WebSocket: no inbound port) |
| Shared state dictionary | the device's MCP resources: motor state, cabin CO2 and its state, health residual, network; described by a Thing Model |
| Command execution | `motor.set_speed`, `scrubber.power`, `scrubber.set_profile`; command surface closed by default |
| Live data streams | notifications: CO2 and state, health residual, fouling alarm, MIN-FLOW alarm. The raw current samples never cross MCP: they stay on board |
| Checks that block before equipment moves | the three layers above; `scrubber.check` returns the device layer's verdict on a command without moving anything, so an agent pressed to run it reports the firmware's refusal rather than its own memory of the rule |
| Inventory and capabilities | the reserved `_broker` provider and the Thing Description derived from the Thing Model |
| Log | the broker's audit log |

When MHS is published, an MHS-backed provider plugs into the broker as one
more provider. That is the position; this demo is the argument.

## 4. The vendor is a profile, not a branch

Three places only carry a vendor name, each a binding in `profiles/*.json`:

| Slot | Invariant | NVIDIA profile | Qualcomm profile | Other |
|---|---|---|---|---|
| Tier 3 language model | the broker's MCP surface (tools, rights, log) | Nemotron on a Nebius serverless endpoint (OpenAI-compatible API) | Llama on Snapdragon via Qualcomm AI Hub, served through an OpenAI-compatible API | Claude (Anthropic API), Ollama |
| Tier 2 gateway host | broker + regulator + dashboard | Jetson Orin Nano | Dragonwing / RB3 | a laptop (the case on camera) |
| Tier 0 factory | the headless jobs and the twin | Nebius Serverless Jobs (a container) | Qualcomm AI Hub: compile and profile the same ONNX on a hosted Snapdragon | `npm run chain` |

Tier 1 (the board, its ONNX, its MIN-FLOW rule) is identical in every
profile. The scrubber does not know who is above it. A replay test runs the
scenario under two profiles and compares the MCP call traces; they must be
identical except for the model's free text.

## 5. The factory: jobs, not a tier

The factory is Tier 0 used as a means of production, offline. It is not a
tier (no body, no horizon, no authority), never in the control loop (no tier
waits for it), never in contact with the device (its files reach the device
only through the station's validated push: sha256, input/output contract,
double bank).

| Job | Role | In | Out |
|---|---|---|---|
| `sweep` | produce data: run the twin over a grid of settings and record | a graph, a grid, fields | `summary.json`, `samples/` |
| `fit` | produce the artifact: a dataset to a loadable model with its contract | rows, the device's full scales and validity domain, the monitor block (thresholds) | `.onnx`, `contract.json`, fit report, parity |
| `evaluate` | judge: the model as the device runs it, against the oracle with injected faults | the artifact, its contract, a graph, scenarios | `report.json` with a verdict, traces, a report id |

Three rules hold across jobs. The thresholds live in the monitor's
specification and are copied verbatim into `contract.json`; `evaluate`
judges against them and never receives thresholds of its own. An artifact is
registrable at Tier 2 only with a positive `evaluate` report id. Tier 3 may
call `fit`; the result is inert without `evaluate`: three independent locks
(no registration capability for the tier3 role, the station refuses a
registration without a positive report, the device refuses a push whose
sha256 or contract does not match), none of them in a prompt.

Three moments of call: **T0**, before deployment, by the engineer (sweep,
fit, evaluate, registration, push); **T1**, on alarm, off the control loop
(the agent asks the twin a few points under a budget, may ask for a fit on
the station's journal of stable operating points, then an evaluate, then
proposes a push that the operator approves); **T2**, periodically, for slow
drift (a new fit on recent real data, an evaluate against the model in
place, a push if better).

Over MCP (since 2026-09-21, `docs/factory-harness.fr.md`), the factory is a
front (`factory.request` takes a functional contract and opens a task,
`factory.task` says where it stands) and a workshop of slots the factory's
loop uses: `workspace` (the task's files), `model` (the fit job, ONNX
inspection, the contract check), the runtime's surface on `twin`
(the catalogue, `document_validate`, `document_build`, `session_run`), and
`station.propose`. The command-line jobs remain for T0. The previous text
follows, for the jobs themselves:
`run_sweep`, `run_fit`, `run_evaluate` took the job spec itself and returned a job id and
a plan; `job_status`; `get_artifact` returned small files inline and large
ones by location plus sha256, never the bytes over JSON-RPC; a plain MCP
notification ends the job.

## 6. What is real and what is simulated, on camera

The motor and the current are real (ESP32-S3, H-bridge, current sense,
a real turbine). The cabin CO2 is simulated on the board: the v1 board has
no CO2 sensor, the v2 board plans one. This is hardware in the loop, not a
cabin, and the video says so.

The twin (slot `twin`) is the same graph that the factory runs headless,
running in a browser tab with a Babylon.js scene of the cabin: the runtime is
TypeScript and the node editor already publishes itself into a broker slot.
A headless Node twin on the gateway is the fallback if the tab proves
fragile on the day.
