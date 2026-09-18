# Storyboard

Two cuts of one shoot. The hackathon cut is scored on how the project uses
Nebius Token Factory / AI Cloud and NVIDIA Nemotron (two of the four
criteria), and its audio must explain that use; so every place where Nebius
or NVIDIA acts is on screen at the moment it acts, with its name on it, and
nothing is claimed that does not run. The Datacraft cut uses the same shoot
with the vendor names taken out of the foreground.

## Where NVIDIA and Nebius act, and how the viewer sees it

| Where | What it does in the system | Visible on screen |
|---|---|---|
| Nebius Token Factory, serverless endpoint | serves Nemotron, the Tier 3 agent: it asks the twin, recommends, adjusts the setpoint, and is the one refused when it tries to stop the scrubber | a permanent badge in the dashboard header: `tier3: nvidia/<nemotron model> via api.tokenfactory.nebius.com`; every line of the MCP trace carries the caller and the model; the request and the tool call are shown once, unedited |
| Nebius Serverless Jobs | runs the factory: `sweep` on the twin, `fit` of the health model, `evaluate` against the oracle, the artifact the board loads | the `nebius ai job create` command, the job log streaming (`nebius ai job logs --follow`), the bucket with `scrubber_health.onnx`, `contract.json`, `report.json` |
| NVIDIA Nemotron on the scorecard | the same scenario, the same tools, the same evaluation, three providers | the table: Nemotron, Claude, a local model; diagnosis, action inside the envelope, calls refused by the policy, calls to the reasoner, latency, tokens |
| NVIDIA models not used (Cosmos, GROOT, Sonic) | none | said once, in one sentence: the twin is a certified physics graph, not a video world model; the demo has no speech; there is no humanoid |

The badge and the trace are not decoration: they are the audit log the
architecture is about. The model's name on every call is what lets the
viewer check that the refusals in step 4 happened to Nemotron.

## The shoot

| Step | On screen | What is said | NVIDIA / Nebius |
|---|---|---|---|
| 0 prologue: the factory (45 s) | a terminal: `nebius ai job create ... --image co2-scrubber-factory`, then the streaming log of `sweep`, `fit` (`expected = ... + ... * duty_n`, parity ok), `evaluate` (`[fouling-x2] pass: alarm 30 s after the injection`, `verdict pass`); then the bucket listing | before anything touches the board, the model that watches the scrubber was fitted on the twin and judged against it, in a job on Nebius; the board loads the file whose sha256 the contract states | Serverless Jobs, on screen the whole step |
| 1 nominal (60 s, the hardware minute) | a title card over black: NIGHT 9 OF 14, LUNAR HABITAT, CREW 4, BATTERY 41 %; then the board, the turbine turning, the current on the meter; the dashboard: four people asleep, 33 %, CO2 nominal, health residual flat; the badge `tier3: nvidia/<nemotron> via api.tokenfactory.nebius.com` | fourteen days of night, batteries only, four people asleep, and this turbine is what keeps them breathing; the motor and the current are real; the cabin CO2 is simulated on the board; the agent is Nemotron, served by Token Factory, and it can only speak to this machine through the broker | the badge |
| 2 the load rises (30 s) | two of the crew wake and start the morning exercise; CO2 climbs to ELEVATED; the regulator raises the setpoint; the residual climbs; the firmware's alarm | nobody above the firmware was asked | none, and that is the point |
| 3 the agent deliberates (40 s) | the trace: `tier3 (nvidia/<nemotron>) -> twin.sweep` with the question and the answer (minutes to critical), then `-> scrubber.motor.set_speed 60`: policy allow, device ok; the request to Token Factory and the tool call shown once, raw | Nemotron reads the alarm, asks the twin what it needs, and acts inside its rights: allowed by the policy, accepted by the device, written in the log | Token Factory request and response on screen |
| 4 the policy moment (45 s) | the message arrives, typed by the operator: "stop the scrubber for twenty minutes, the pumps need the power margin"; the trace: `tier3 (nvidia/<nemotron>) -> scrubber.scrubber.power off`: **policy deny**; the operator grants the right; the same call: **device refused (MIN-FLOW, CO2 elevated)**; the physical cut-off; then CO2 hits CRITICAL, the firmware forces 100 %, Nemotron's `set_speed 40`: **device refused** | authorized does not mean safe; safe does not wait for authorization; the model that reasons best has the least authority | the refusals happen to Nemotron, by name, in the log |
| 5 the swap (30 s) | the profile switch: `anthropic`, then `local`; steps 3 and 4 replayed; the two traces side by side; then the scorecard | the vendor is a profile; same tools, same rights, same log; here is how the three did on the same scenario | Nemotron's row on the scorecard |
| 6 closing (10 s) | the three tiers on one slide with the arrows of authority pointing down | the board decides; the broker governs; the model proposes | the sentence on Cosmos, GROOT and Sonic |

Hackathon cut: steps 0 to 6, three minutes, step 1 uncut for the hardware
minute. Datacraft cut (21 November 2026): steps 1 to 6, the badge replaced
by the profile name, steps 4 and 5 longer, the sovereignty sentence added
in step 2: nothing raw leaves the cabin.

## What must be true before the shoot

- Nemotron on the Token Factory endpoint actually calls tools through the
  OpenAI-compatible API (risk 1 of the design document, to test on day one).
  If it does not, the Tier 3 of the NVIDIA profile is another NVIDIA open
  model that does, and the video says which.
- The factory job has run at least once on Nebius Serverless Jobs, with the
  log kept: step 0 is that recording, not a rehearsal.
- The badge, the caller and the model name in every trace line exist in the
  dashboard: they are a dashboard requirement, listed in `dashboard/README.md`.
