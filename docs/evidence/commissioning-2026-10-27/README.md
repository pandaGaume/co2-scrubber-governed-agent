# Recorded commissioning evidence

This dossier reconstructs an existing successful execution. It was exported on 2026-10-29 without running another mission, contacting a model or commanding hardware. Original journals and execution records remain unchanged.

## Reference execution

- Mission journal: `mission-scenario-r001-20261027-184317-qkws`.
- Execution: `procedure-a29f1798-89d2-4948-9c48-39e6efd31bae`.
- Procedure: `scrubber-dimensioning-2026-10-20-01`.
- Supervisor: Nemotron 3 Super through Nebius Token Factory. Procedure factory: Nemotron 3 Ultra.
- Final mission state: `completed`, outcome `success`, 21 supervisory decisions.
- Recorded procedure start: 2026-10-27 18:45:03.056 UTC, 13:45:03.056 in Houston.
- Recorded procedure end: 18:47:01.548 UTC. Duration: 118.492 wall-clock seconds.
- 49 telemetry rows and 49 timestamped motor-speed observations.

The reference journal includes the first factory task's exhausted budget and the subsequent successful task. Those attempts are not removed from the execution history. The first task's files are also organized separately under [essais](essais/README.md).

## Human decisions and execution

| Event | Recorded UTC time | Evidence |
|---|---|---|
| Scientific approval, application holder `Commander Spock` | 18:44:50.460 | [Approvals](reference/approvals.json), matching procedure hash |
| Launch authorization, application holder `James T. Kirk` | 18:45:00.255 | [Approvals](reference/approvals.json), before execution |
| Procedure execution | 18:45:03.056 to 18:47:01.548 | [Execution record and report](reference/execution.json) |
| Mission completion | 18:47:15.334 | [Source summary](reference/source-README.md), [final mission state](reference/final-mission-state.json) |

The names above are identities recorded by the application. This export does not independently authenticate the people behind those role assignments.

## Observed operating points

The original completion requirement is an ordered staircase with at least 10 seconds observed within a tolerance of 1 percentage point at every requested speed. These are recorded timestamp spans, not durations copied from the proposed procedure.

| Speed | Verified observed span, seconds |
|---|---:|
| 30% | 10.688 |
| 40% | 10.063 |
| 50% | 11.875 |
| 60% | 11.939 |
| 70% | 11.869 |
| 80% | 11.969 |
| 90% | 11.756 |
| 100% | 11.775 |

See [motor observations](reference/motor-observations.csv), [completion check](reference/plateau-check.json), [cabin telemetry](reference/cabin-telemetry.csv) and the [exact proposed procedure](reference/procedure.json).

Motor observations are device readings through MCP. Cabin CO2 is modeled, as explicitly recorded in the source. The CSV's model minutes are not wall-clock timestamps. Discrete observations do not establish behavior between samples. The sizing result in the execution report is an estimate under the cabin model's assumptions, not an independent physical measurement of volume or removal efficiency.

## Prompts, tools and provenance

- [Compressed full journal](reference/journal.md.gz): model requests, prompts, tool schemas, responses, stage events and results.
- [Supervisor action index](reference/actions.json): actual calls, inputs, outcomes and original journal line numbers.
- [Factory trace](reference/factory/trace.jsonl.gz), [manifest](reference/factory/manifest.json) and [task](reference/factory/task.json).
- [Recorded context](reference/run-context.json) and [base-commit configuration](reference/base-commit/).
- [Source and exported-content hashes](provenance.json); [export summary](export-summary.json).

The source journal reports base revision `f1efa72` **with uncommitted changes**. Base-commit files are included for reference, but the exact historical dirty working tree is unavailable. Actual prompts and settings sent to the model remain in the full journal. SHA-256 checks establish consistency and integrity of the packaged evidence; they do not provide external timestamp certification or firmware attestation.

## Trials and the hatch interaction

[essais/](essais/README.md) contains other recorded executions, the preceding factory attempt and journal summaries, with their original statuses retained. A separate [28 October hatch-closure case](essais/2026-10-28-sas/README.md) documents Nemotron's response to a refused execution, the closure message and the missing interactive reply path. It is not presented as another completed commissioning.

## Verify offline

From the repository root, using Node.js with no additional packages:

```sh
node docs/evidence/commissioning-2026-10-27/verify.mjs
```

The verifier checks packaged source digests, the execution record's internal digest, the exact procedure hash, approval ordering, the final mission state and all eight recorded plateaus. It also checks that the hatch case contains a recorded refusal and a model response, and that its proposed procedure uses an open hatch. Verification reads files only.
