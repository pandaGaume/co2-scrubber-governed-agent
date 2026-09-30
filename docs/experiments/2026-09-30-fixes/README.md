# The two failures left after the reference's contract, fixed and measured (2026-09-30)

The run was Sonnet 5.5 at an 8192-token output limit, in fork `exp7-fixes` created from the repository at `86e03ab`. There was no working memory of previous tasks, no long-term memory, no recipes and no learning. It used the same 10 unseen tasks as before, but three of them changed (see below).

**The fixes** (`48b237d`, `86e03ab`):

- **Quantities.** A refused quantity now says which quantity its unit alone belongs to, and what the register declares for the property it is named after. The schema says the same. The physics slot presents itself as the tool to ask when a unit or a quantity is refused.
- **After an abort.** The next task receives the aborted procedure and a short record of the test, as the brief had always promised. The state no longer cuts them at 3000 characters.
- **Reading JSON.** `workspace.read` reads one field of a JSON file by a JSON Pointer.
- **The validation tasks v4, v5 and v9** carry a coherent history: a real accepted procedure and a plausible record, instead of an invented procedure id.

## Result: the first guard-evaluated submission

| Task | Contract as before | Reference contract said | + the fixes |
|---|---|---|---|
| v1 | fail (composite) | pass | pass |
| v2 | fail (composite) | pass | pass |
| v3 | fail (composite) | pass | pass |
| v4, after a CO2 abort* | pass | no submission (stuck re-reading) | pass |
| v5, after a heart-rate abort* | fail (composite) | pass | pass |
| v6 | fail (composite) | pass | pass |
| v7 | pass | pass | pass |
| v8 | fail | fail (Speed in percent) | pass |
| v9, after a CO2 abort* | pass | pass | fail (abort thresholds named by position) |
| v10 | fail (composite) | pass | pass |
| **Passed** | **3/10** | **8/10** | **9/10** |
| Average steps / input / output tokens | 12.7 / 104 k / 8.4 k | 12.2 / 89 k / 7.4 k | 10.9 / 92 k / 8.6 k |

\* In the last column, v4, v5 and v9 carry the new history, so they are not the same inputs as in the first two columns. On the 7 unchanged tasks, the last column passes 7/7.

## What the fixes did

- **Quantities.** In every task where Sonnet declared the scrubber's speed, it used `Ratio` in `percent` (5 of 5). It never used `Speed`, and no quantity was refused.
- **After an abort.** v4 and v5 passed in 10 and 15 steps, and no task got stuck re-reading. The aborted procedure is in the state at every step, so the input tokens of those tasks are high (136 k and 232 k).

## A priming effect, found and removed

The first attempt of this run used `/steps/0/reason` as the example of a JSON Pointer, in `workspace.read`'s description, which a model reads with every call. Sonnet then justified `steps.0` and `steps.1` in 3 tasks of 3, although it had used `steps.1` and `steps.2` in 3 of 3 before. The guard names the steps by their number `n`, so two of those tasks were refused.

That run was stopped and its fork removed; the fork's tasks are not kept. The example became `/field/subfield`, and a test forbids a list index in it. The measurement above is the run started again.

## The failure left: how a list element is named in a path

In v9, Sonnet justified `abort.0.threshold` and `abort.2.threshold`, and its analysis said `abort.0.threshold` changes. The guard names the abort conditions by their id (`abort.co2.threshold`, `abort.battery.threshold`) and the steps by their number (`steps.1`, `steps.2`), so it found neither.

The contract says this nowhere. It is the same gap as the steps indexed from 0: GPT's failure in v10 of the transfer experiment, and the one the example above induced. It is a candidate for the same treatment: state the path convention in the contract, for every model.
