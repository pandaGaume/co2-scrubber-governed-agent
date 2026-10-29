# Repository review guide

Reviewed against the source tree on 2026-10-29. This is a navigation aid, not a live-run certification. Read source, fixtures and recorded results together.

## Architecture and evidence

| Property | Implementation | Relevant verification |
|---|---|---|
| Model reasoning through Nebius | [Reasoner slot](../slots/reasoner/provider.ts), [routing](../specs/reasoner/routing.json), [Super profile](../profiles/nvidia-nebius-super.json) | [Routing tests](../tests/reasoner-routing.test.ts); actual provider use requires a live exchange |
| Executable decision graph | [Graph flow](../harness/lib/flow.ts), [harness agent](../harness/core/agent.ts) | [Mission tests](../tests/mission.test.ts), [transport integration fixture](../tests/mission-slot.test.ts) |
| Semantic interpretation through Physics | [Interpreter](../harness/lib/semantic-interpretation.ts), [Physics provider](../slots/physics/provider.ts) | [Interpreter fixtures](../tests/semantic-interpretation.test.ts); no host-side quantity alias table is supplied by that interpreter |
| Human authorization | [Station decisions](../slots/agent/station-decisions.ts), [station provider](../slots/station/provider.ts) | [Crew questions](../tests/crew-questions.test.ts), [station event tests](../tests/mission-station-events.test.ts) |
| Observed test completion | [Procedure executor](../slots/agent/procedure-execution.ts), [completion checks](../slots/agent/procedure-completion.ts) | [Completion tests](../tests/procedure-completion.test.ts); inspect actual speed observations for a hardware claim |
| Broker and device boundary | [Policy](../broker/security.json), [server board selection](../slots/run-all.ts), [broker client](../harness/lib/broker.ts) | [Broker policy tests](../tests/broker-policy.test.ts); firmware behavior also requires device evidence |
| Model-independent role | [Provider interface](../harness/lib/provider.ts), [adapters](../harness/providers/), [role prompt](../specs/agent/prompt.mission.md) | Inspect adapters and routing separately from the graph and policy |
| Graph and neural artifacts | [Graph topic](../harness/topics/graph/), [ONNX specification](../specs/onnx/), [graphs](../graphs/) | Artifact existence is separate from validation, installation and MCU deployment |
| Audit trail | [Existing logger](../harness/lib/run-log.ts), [mission provider](../slots/agent/provider.ts), [factory runner](../harness/core/runner.ts) | Logs must show the actual model request, tools offered, response, tool result and outcome |

## Distinctions that matter

- **Model versus system:** Nemotron provides reasoning. The harness, graph, policy, broker and board define capabilities and execution boundaries.
- **Hardware versus environment:** the motor, turbine and board are physical in board mode. Cabin CO2 is supplied by a model. Software-device tests use a separate implementation.
- **Request versus result:** human approval does not start a test by itself. A requested speed is not an observed plateau. A successful tool call proves only what its returned report supports.
- **Scenario versus mission:** initial scene delivery can end while the supervisor mission remains active. A factory task ending does not complete its parent mission.
- **Mission versus later factory work:** the dimensioning mission stops at its test and report. Building, validating and installing a twin are separate work.
- **Declared requirements versus scripted decisions:** requested test points and observation durations are operator requirements in [the commissioning specification](../specs/scenario-commissioning.json). They must not be mistaken for measurements or successful execution. The model chooses its tool calls and proposals; inspect the prompt and trace to evaluate how constrained that choice is.
- **Fixtures versus live reasoning:** [stand-ins](../stand-ins/) and tests deliberately contain scripted responses. They exercise transport and contracts. They do not establish live model reasoning or hardware performance.

## Inspecting a run

1. Identify the mission and factory task IDs, revision, prompt hashes, provider profiles and operating mode.
2. Read the full model request, including tool schemas, before attributing a failure to the model. Compare the tools offered with the graph's current allowed capabilities.
3. Follow proposals into broker results and station decisions. A refusal is evidence that an operation did not execute.
4. Check the final report, real timestamps and recorded speed observations before concluding that a test met its requirements.
5. Keep pending, failed and incomplete outcomes visible. A README still marked running is not evidence of completion.

Mission journals are local under `.logs/mission-*/`; factory files are local under `outputs/factory/<taskId>/`. They are ignored by Git. Historical examples in [docs/exemples](exemples/) are available in the repository, but each applies to its own revision and inputs. A fresh clone cannot establish a recent live result without an accompanying reviewed export.

## Known limitations at this review

The source contains the end-to-end paths, but a documentation cleanup does not establish a successful live commissioning. The latest local journal inspected for this review, started on 2026-10-28 at 21:51:32 UTC, has no final outcome in its README and records procedure failures involving an unknown quantity and exhausted budgets. Those logs remain intact.

The optional paged-context provider is not wired into the active reasoner. Its presence in the source does not mean pagination is running. Current model defaults are the values in configuration; historical notes document earlier experiments.

The board firmware, physical assembly, cloud credentials and optional graph-editor checkout are external prerequisites. Dependency licenses remain distinct from this repository's Apache-2.0 license. This demonstrator does not establish safety certification or general validity outside its checked operating envelope.

## Development history and video materials

[STATUS.md](STATUS.md) preserves dated development findings. The [previous README](archive/README-before-2026-10-29.md) is a historical document containing planned scenes and older component status. [Video materials](../video/) include production scripts and rendered imagery; a rendered lunar scene is presentation material, not telemetry from a habitat.

Use each run's revision, inputs and recorded outcomes when assessing what it demonstrates.
