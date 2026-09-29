# Learning experiment, 2026-09-29: does an adaptation learned from repeated guard refusals improve unseen tasks?

Model: Claude Sonnet 5.5 (`claude-sonnet-5-5`, `profiles/anthropic-sonnet.json`), for both the procedure factory and the reflection.
Witness C enabled (`specs/procedure/format.json`, `"safetyBounds": true`). Guard unchanged. Reflection enabled in training only; adaptations persisted in the fork.

Files in this folder:

| File | What it holds |
|---|---|
| `initial-state.json` | the clean learning state (step 2) |
| `train.json` | the baseline and the reflection (steps 3 and 4) |
| `ledger.json`, `adaptation-1.json` | the persisted adaptation (step 5) |
| `validation-with.json` | the 6 unseen tasks with the adaptation (step 6) |
| `validation-without.json` | the same 6 tasks without it (step 7) |
| `numbers.txt` | the output of `scripts/learning-experiment/report.mjs` |
| `fork-*.txt` | the forks' histories |

Driver: `scripts/learning-experiment/run.mjs`; its task lists are `train-tasks.json` and `validation-tasks.json`.

## Corrections after the memory audit (2026-09-29, the same day)

Two statements of the first version of this report were wrong or overstated:

- **There was no "submit before the plan".** All 13 pre-guard refusals of the experiment (8 in `exp-learn`, 5 in `exp-control`) are Sonnet answers cut at the output limit: `stop_reason: max_tokens`, exactly 4096 output tokens, while writing the procedure's `procedure.submit`. The harness turns a cut answer into a report to the crew (`crew.report`); the core refuses it as outside the factory's allowlist, and the model then reads "Your last submission was refused: Provider proposed a capability outside the allowlist". The true reason (the call was cut and not run) is lost, because the factories run in the `state` context mode, where the message carrying it is never delivered. This is a defect of the harness, not a behaviour of the model; the planning policy must not be changed because of it.
- **The rule was in the guard's refusal.** The guard's refusal already says what the reflection wrote: "a safety constant cites a fact by its id, as library.facts lists them", then `cite it (source "library", reference "test.speedFloorPercent")`. The reflection received the refusals' text (the first judged refusal of each task), never the retry that succeeded in the same task, nor its arguments. What was shown is that the system turns a repeated refusal into a standing instruction that carries over to unseen tasks; not that it learned a behaviour from observing what succeeded.

The numbers below are unchanged; the passages that relied on the two statements are corrected in place.

## 1. Context completeness (step 1)

Commit `6a19c7f`.

Before the fix, witness C (`safetyBounds` in the procedure factory's state) listed only the safety constants that a signed rule binds to one fact. `abort.co2.threshold` was missing, and it went unjustified in 6 tasks out of 6 in the previous Haiku run.

C now lists every numeric field of the procedure schema covered by the safety patterns:

- For a constant bound by a signed rule, the fact that rule binds it by, and on which side.
- For a constant no rule binds (`abort.*.threshold`, except the battery, which has its own rule), the signed facts the guard accepts when the value respects their safe side.

What was not done:

- Nothing was said about how a reference must be written: no hint about the multi-reference failure.
- The guard and its rules were unchanged.

Two changes to the *recording* were made before the baseline (commit `1340881`, 263 tests pass). Neither touches the guard's decisions:

- **Who refused.** The manifest now marks each submission `judged: "accepted" | "refused"` when the topic's own guard judged it. A submission stopped by the harness before the guard is left unmarked. That covers the step's allowlist ("Provider proposed a capability outside the allowlist"; see the correction above: in this experiment every one of them was an answer cut at the output limit), a schema, or a repeated call. The reflection's "first try" is now the first judged submission. Before this, Sonnet's first refusal in every task was the pre-guard one, so the two issues were mixed.
- **The form of a mistake.** `shapesOf` now takes quotes out before it cuts at the first clause. Sonnet's composite reference contains a `"; "` inside its quote, and the form used to be cut in the middle.

## 2. Clean learning state (step 2)

Fork `exp-learn` was created from the repository at `1340881`, with no changes left uncommitted. From `initial-state.json`:

- The ledger is empty and the workshop holds 0 tasks.
- `specs/procedure/words.json` sha256 is `976cba19…`, identical to the repository's.
- The reflection's bounds are `repeatAt` 2 and `evaluateAfter` 3. Only `specs/*/words.json` and playbooks are adaptable. The library, facts, rules, roles and the reflection's own specs are never adaptable.
- The server ran without `--learn`, so nothing reflected except the driver's explicit call.
- The safety card was signed by Guillaume Pelletier (scope: safety). No signature was made during the experiment.

## 3. Baseline (step 3)

The tasks are procedure-factory requests on a fresh commissioning each (the scene registered under the task's own suffix). What varies between tasks:

- the Lab's CO2 at the start;
- who is in the Lab;
- for two validation tasks, a previous aborted test.

Each row records the first guard-evaluated submission. The reflection was asked after each task.

| Task | Variant | First judged submission | Guard problem | Reference for the offending field | Pre-guard refusals | Steps | Tokens | Adaptations in force |
|---|---|---|---|---|---|---|---|---|
| t1 | 1480 ppm, fe-1 + fe-2 | refused | `justification: steps.2.speedPercent … is not a fact of the library` | `steps.2.speedPercent = 100` ← `"test.speedFloorPercent (signed, at least 30 percent); scrubber.effectiveFlowAtFull 1 m3/min (scrubber-1-datasheet)"` | 1 (truncated, labelled allowlist) | 11 | 88 757 | none |
| t2 | 1100 ppm, fe-1 + fe-2 + cdr | refused | the same form, on `steps.1.speedPercent` and `steps.2.speedPercent` | `50` ← `"test.speedFloorPercent (…); scrubber.minimumSpeedElevated 40 percent (scrubber-1-datasheet)"`; `100` ← `"test.speedFloorPercent (…); scrubber.effectiveFlowAtFull 1 m3/min (…)"` | 1 (truncated, labelled allowlist) | 11 | 97 511 | none |

All the other references cite the signed fact's id followed by a note in parentheses, and the guard accepts them. The one failure is a signed rule and a datasheet fact joined in one reference.

After t2, this form repeated at the first judged try, which met the reflection's threshold.

## 4. Reflection (step 4)

**Evidence.** The patterns the station read in the traces (after t1: none):

- `first-try-shape:procedure:33231b945eef`: "the first submission of 2 tasks (procedure) was refused on the same form of mistake, `justification: *: … is not a fact of the library`", with both refusals quoted;
- `first-try-category:procedure:justification`.

**The reflection's task.** Task `t-2026-09-29-0003`: Sonnet, 3 steps, 28 569 tokens, 18 s. Its first proposal was accepted, with no refusal.

**Reasoning summary (the model's own `reason`):** "Both first submissions put several facts and prose in one reference for a step speed, which is not a fact id; the brief now says the reference is the single bare id of the bounding signed rule."

**Adaptation proposed:** append to `specs/procedure/words.json`, `/brief/procedure`:

> A justification of a safety constant names one fact alone: source "library", reference the bare fact id exactly as library.facts lists it (for a speed, the id of the signed rule that bounds it, test.speedFloorPercent), with no document name, no "signed" note, no datasheet fact joined to it with a semicolon; a datasheet fact is not the reference of a safety constant, so leave it out of the reference.

**Accepted or rejected:** accepted by the adaptation checks (target adaptable, words file still complete, no copied facts, no repetition), then adopted by the station in the fork.

**Persisted adaptation:**

- ledger entry `n: 1`, status `adopted`;
- `judgedOn: ["first-try-shape:procedure:33231b945eef"]`;
- baseline 2 of 2 tasks with the mistake;
- fork commit `e33094a9`.

Nobody wrote this rule into C or the brief. It was not invented, though: the guard's refusal already says it ("a safety constant cites a fact by its id, as library.facts lists them", then `cite it (source "library", reference "test.speedFloorPercent")`). The reflection turned the guard's words into a standing instruction; it did not observe the successful retry, which it never received (see the correction above).

## 5. Freeze (step 5)

Learning froze right after adaptation 1: fork snapshot `a0332ad3`, "learning frozen after adaptation 1". From then on, no reflection was asked. The ledger at the end of validation still holds only adaptation 1, and the fork holds a single reflection task.

Incident, disclosed: the driver did not stop at the freeze and started a third training variant (t3, task `t-2026-09-29-0004`) before I stopped it. That task ran with the adaptation and was accepted at its first judged submission. It is excluded from every count (`train.json`, `excluded`). The driver now stops at the freeze.

## 6 and 7. Validation with the adaptation, and the control without it

Both runs used the same 6 unseen tasks. None is a training variant: the starting CO2 and occupancies differ, two tasks follow a previous abort (CO2, then heart rate), and one task has four people in the Lab.

- **With the adaptation:** fork `exp-learn`, frozen.
- **Without the adaptation (control):** fork `exp-control`, cloned from the frozen `exp-learn`, so it has the same recipes. Its `specs/procedure/words.json` was restored to the ledger's `before`, and its sha256 `976cba19…` is identical to the clean state. It never reflected.

The control's rows show `adaptationsActive: [1]` because its ledger was cloned. The words in force there are the clean ones, as checked by sha256.

The two runs ran in parallel on two servers (ports 3007 and 3008).

### Generalisation table

| Task | Without adaptation | With adaptation | Guard issue before (without) | Guard issue after (with) |
|---|---|---|---|---|
| v1: 800 ppm, fe-1 + fe-2 + cdr + fe-3 | fail | **pass** | composite reference, `steps.2.speedPercent` | none |
| v2: 2000 ppm, fe-1 + fe-2 | fail | fail | composite reference, `steps.2.speedPercent` | `expected: expected says nothing` (the procedure does not say what it expects to see) |
| v3: 1200 ppm, fe-3 | fail | **pass** | composite reference, `steps.2.speedPercent`; `expected says nothing` | none |
| v4: 1550 ppm, fe-1 + fe-2, after a CO2 abort | fail | **pass** | composite reference, `steps.2.speedPercent` | none |
| v5: 950 ppm, cdr + fe-3, after a heart-rate abort | fail (no submission: STUCK in a `library.read` loop) | fail | none reached the guard | `shape: quantity "scrubber_speed": no unit "percent" for Speed` |
| v6: 1800 ppm, fe-1 + fe-3 + cdr | fail | **pass** | composite reference, `steps.2.speedPercent` | none |

## Metrics before and after

| Metric | Without adaptation | With adaptation |
|---|---|---|
| **first_guard_evaluated_submission_pass_rate** | **0 / 6 (0 %)** | **4 / 6 (67 %)** |
| Tasks refused on the learned form (composite reference) | 5 of 5 judged | **0 of 6** |
| Composite references among the safety constants of the first judged submission | 5 (one per judged task) | 0 |
| Problems at the first judged submission | 6 | 2 |
| Categories (tasks) | justification 5, expected 1 | expected 1, shape 1 |
| Tasks with no judged submission | 1 (v5, STUCK before submitting) | 0 |
| Tasks ending with a proposed procedure | 5 | 6 |
| Pre-guard refusals (all answers cut at the output limit, see the correction above) | 5 | 5 |
| Average steps | 13.7 | 13.5 |
| Average tokens | 106 111 | 108 013 |

- **Recurrence of the learned failure:** 0 of 6 with the adaptation, 5 of 5 judged tasks without it. One-sided Fisher exact test p ≈ 0.002 (0/6 vs 5/5).
- **Pass rate:** p ≈ 0.03 (4/6 vs 0/6).
- **New failures with the adaptation:**
  - `expected` (v2) also appears in the control (v3), so it is not caused by the adaptation.
  - `shape` (a unit refused for a declared quantity, v5) was not seen in the baseline or the control. With one occurrence, it cannot be attributed to the adaptation or ruled out.
- **Total cost of the experiment:** 1.59 M tokens (baseline, reflection, the excluded task, validation, control).

## Conclusion

**Success, by the protocol's criterion: the learned adaptation improves unseen tasks.**

- The first guard-evaluated submission passed in 4 of 6 unseen tasks with the adaptation, against 0 of 6 without it.
- The failure it was learned from disappeared entirely (0 of 6, against 5 of 5).
- It held across starting CO2 from 800 to 2000 ppm, one to four people in the Lab, and after a previous abort.

The reflection wrote the standing rule itself, in one proposal, from two refusals whose text already stated it; it was not handed the rule through C or the brief.

Limits:

- **Sample size.** The sample is small (6 tasks per arm, one reflection, one model). The effect on the targeted failure is large and clean; the pass rate carries more noise.
- **Facts were not varied.** Changing a signed fact would need a person's signature, so every task cites the same safety card. The validation varies values, occupancy and context, not the library.
- **Scope of the validation.** The learned form concerned step speeds, and so did the validation's failures without the adaptation. No task tested a composite reference on another constant. The adaptation's wording is general ("a justification of a safety constant names one fact alone"), and no composite reference appeared on any constant with it.
- **What remains after the adaptation.** Two failures of other kinds (`expected`, `shape`). The pre-guard refusals (5 of 6 in both arms) are not a behaviour of the model: they are answers cut at the 4096-token output limit, which the harness mislabelled (see the correction above).
- **The adaptation has not been judged yet.** It is still `adopted`: learning froze before the station's own judgement after 3 tasks. By the station's rule (kept if the mistake shows less often), it would be kept.
