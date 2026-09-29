# Memory experiment (A/B/C/D), stopped at training: the premise changed

2026-09-29, Sonnet 5.5, witness C on, the guard unchanged. This is Guillaume's matrix: A is the control, B working memory, C consolidated long-term memory, D both, all on the same 6 unseen tasks.

The experiment was stopped after 4 training tasks. The reason is methodological: the failure the long-term memory was meant to learn became rare once the output limit was raised. The planned comparison could no longer show an effect.

## What the 4 training tasks show (output limit 8192)

| Task | First guard-judged submission | Output tokens (largest single step) | Truncations | Steps | Input / output tokens |
|---|---|---|---|---|---|
| t1 | accepted | 4357 | 0 | 11 | 73 919 / 5 763 |
| t2 | accepted | 6037 | 0 | 9 | 59 276 / 7 006 |
| t3 | accepted | 4814 | 0 | 10 | 79 284 / 6 822 |
| t4 | refused: `steps.2.speedPercent` cites `"test.speedFloorPercent; scrubber.effectiveFlowAtFull 1 m3/min"` | 4901 | 0 | 10 | 89 120 / 6 286 |

- Every complete submission needed more than 4096 output tokens. Under the old limit, each of them would have been cut.
- The composite reference still occurs without any truncation (t4), but in 1 task of 4 rather than in nearly every task.
- Raising the limit removed an artefact rather than doubling consumption.

| | 4096, 15 tasks (exp-learn, exp-control) | 8192, 4 tasks (this run) |
|---|---|---|
| Average input tokens | 96 103 | 75 400 |
| Average output tokens | 7 984 | 6 469 |
| Average steps | 13.0 | 10.0 |

## Where the composite reference came from under the 4096 limit

This counts every Sonnet procedure task of trial-7, trial-8, exp-learn and exp-control.

- There were 19 first refusals for a composite reference.
- All 19 followed a `procedure.submit` cut at 4096 tokens:
  - 18 were in the `procedure.revise` that re-wrote the justifications the cut call lost;
  - 1 was in a resubmission after the cut.
- None was in a complete first submission.

The earlier experiment's "failure at nearly every task" was therefore mostly a product of the truncation. Once cut, the model wrote the justifications separately, and there it joined a datasheet fact to the signed rule.

## Why this invalidates the planned comparison

- **Training.** A trial needs 2 failures of the form answered by retries. At about 1 failure in 4 tasks, that takes around 8 tasks. Judging the entry then needs 3 more, compared against a low baseline rate.
- **Validation.** With a base rate of about 25 % (from 1 task in 4, so very uncertain), A would show 1 or 2 composite failures in 6 tasks. C's best possible result, 0 of 6, would not be distinguishable from A: a one-sided Fisher test gives p of about 0.23 for 0/6 against 2/6. The primary contrast C versus A has almost no power at 6 tasks per condition.

Files: `initial-state.json` (the clean state of exp2-train), `training-4-tasks.json`, `training-driver.txt` (the driver's log up to t3; t4 was recorded from its manifest after the driver was stopped).
