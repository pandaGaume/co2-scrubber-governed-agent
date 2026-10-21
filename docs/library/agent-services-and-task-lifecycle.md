# Agent services: contracts, task lifecycle and returned evidence

A capability's successful call establishes only what its result actually reports. The table below separates requested work, produced artifacts, human decisions and physical execution. It is an interface reference, not an executable workflow or a required order of actions.

## Service reference

| Capability | What it provides | What it does not establish |
|---|---|---|
| `library.list`, `search`, `read`, `facts` | documents and typed claims with origin and signature status | a newly measured value or approval of an experiment |
| `library.methods` | method cards indexed by the quantities they can measure | that every requested quantity name is canonical, or that the available sensors implement the method |
| `physics.units_normalize` | quantity/unit interpretation supported by the registry | a physical measurement or permission to alter a device |
| `factory.inventory` | installed devices, quantities, paths and unresolved installation information | a test result |
| `observer.observe` | requirements for a twin | an executable test procedure, a logger or an authorisation |
| `observer.observe` with `forward` | a created, unstarted graph task | execution of that graph task |
| `factory.request` with topic `procedure` | factory work to write a checked test proposal | running the test or receiving its data |
| `factory.request` with topic `graph` | factory work to build a twin from the supplied contract and data | generating missing telemetry |
| `factory.request` with topic `onnx` | factory work on a learned model | deployment of that model to a board |
| `factory.start` | launches an existing created task, subject to prerequisites and capacity | protected hardware execution |
| `factory.task` | selected topic, current or final status, input prerequisites and manifest | success if the returned state is failed or only created |
| `crew.ask` | a conversational human answer returned to the reasoner | protected test authorisation, telemetry or a commander's identity |
| `station.operation_request` | an explicit human decision on one proposed operation, followed by its device outcome | timed recording, a complete test or a telemetry file |
| `station.commissioning_state` | the station's concrete procedure, checks, authorisation and execution report | that a merely discussed procedure exists |
| `agent.procedure_execute` | execution of the exact authorised procedure, if supported | authority to authorise itself or override a refused command |
| `agent.procedure_result` | the recorded status, provenance and rows of that execution | a completed dataset when the status is failed or aborted |
| `station.twin_validate` | independent checks on an exact candidate and held-out telemetry | installation |
| `station.twin_admit` | requests the commander's installation decision on a validated artifact | that installation succeeded before its result |
| `station.twin_state` | actual active deployment and supporting identifiers | broader validity than the artifact's operating scope |

## A task's status

`created` means a task file exists. `running` means a factory loop is working. `waiting` can mean an outstanding human question; read its question and context. `proposed` means an artifact was handed over, not that all station checks or installation succeeded. `failed` means the requested artifact was not successfully produced. The manifest gives the termination reason, rejected steps and budget.

The in-memory manifest returned by `factory.task` can be newer than the disk file while a task runs. The on-disk manifest is written at the start and end; an unchanged modification time is therefore not proof that the model is stuck. A request-stage indicator means a model call is underway, not that a specific tool or physical step has completed.

## Diagnosing a failure without inventing a result

- An empty method search means that no matching index entry was found for that query. Check the quantity spelling, canonical unit-system name, relevant cards and measurement capability. It does not prove that the needed physics is impossible or that a previously read card was never read.
- A library document id, a typed fact id and a tool name are different references. Use the identifier the result returns. A fact's source document is not the fact's own id; the library can also resolve a known fact id directly where its interface says so.
- A guard refusal identifies an unmet requirement. Inspect its actual reason and existing proposal before deciding what to revise. Do not repeatedly create the same task as a substitute for addressing the refusal.
- Budget exhaustion says execution stopped at a resource limit. It is not a scientific finding, an approval or successful completion. A different budget alone does not repair an inconsistent method or an unavailable sensor.
- An HTTP 429 or quota error is a provider resource failure. More simultaneous tasks cannot create missing quota. Report the provider failure and available operator options; do not claim that another model or a script took over unless it actually did.
- A stale decision was rejected before dispatch. Reobserve and reason from the new state; do not assume the proposed call executed.

## Asynchronous results

The mission receives factory results and station decisions as observations. A station operation result includes the actual device outcome. Test authorisation is distinct from deciding to execute the authorised test. Waiting does not create work, start a logger or supply a missing human answer.

The supervisory harness retains experience for inspection but does not automatically replay its learned actions: each supervisory proposal must come from the reasoning provider. Incoming results do not replenish its decision budget. The factory also enforces a configurable capacity limit. These constraints limit execution resources; they supply no domain answer or successful mission conclusion.

Source contracts: `slots/agent/provider.ts`, `tier3/mission.ts`, `tier3/agent.ts`, `slots/factory/provider.ts`, `slots/observer/provider.ts` and `slots/station/provider.ts`.
