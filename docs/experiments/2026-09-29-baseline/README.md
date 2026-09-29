# Baseline in condition A: which failures occur by themselves (2026-09-29)

The run was Guillaume's request: 10 tasks, Sonnet 5.5 with an 8192-token output limit, witness C on. The previous-task working memory, the long-term memory and the reflection were all off. The guard and the prompts were the repository's, and no retry was suppressed.

The purpose was to discover a recurring behaviour worth learning, not to demonstrate learning, so no target was chosen in advance. No reflection ran and no memory entry was created. The fork is `exp3-baseline` (`initial-state.json`). The analysis uses `scripts/learning-experiment/patterns.mjs`, which reads episodes and involves no model; its output is `patterns.txt` and `patterns.json`.

## The 10 tasks

| | |
|---|---|
| First guard-judged submission accepted | 2 of 10 |
| First guard-judged submission refused | 8 of 10, every one corrected in the same task, each after one retry |
| Accepted in the end | 10 of 10 |
| Truncations | 0 |
| Attempts stopped before the guard | 0 |

## The failure patterns, ranked

These are the first guard failures, classified by form: fields, ids, quotes and numbers are taken out.

| # | Form | Occurrences | Tasks | Corrected in task | X/Y contrast extracted | Same correction repeated | Harness signs |
|---|---|---|---|---|---|---|---|
| 1 | `justification: *: … is not a fact of the library`, in every occurrence a **composite reference** (two fact ids in one reference) | 17 | 8 | 8/8, 1 retry each | 8/8 | yes: `test.speedFloorPercent` 12 times, `test.co2AbortCeilingPpm` 5 times | no truncation or pre-guard attempt; see the caveat below |
| 2 | `justification: * = # is a safety constant with no justification` | 1 | 1 | 1/1 | 1/1 | no | none |
| 3 | `justification: *: the justification says #, what you sent sets #` | 1 | 1 | 1/1 | 1/1 | no | none |
| 4 | `justification: * = # has no justification: say its source and why` | 1 | 1 | 1/1 | 1/1 | no | none |

Patterns 2 to 4 all come from one task (t10) and are not recurring.

### Pattern 1: what was sent (X) and what was accepted (Y)

Each occurrence joins the signed rule that bounds the constant to an engineering fact of the datasheet or the habitat. For example:

| Field | X, refused | Y, accepted |
|---|---|---|
| `limits.minSpeedPercent` | `"test.speedFloorPercent (signed); scrubber.minimumSpeedElevated 40"` | `"test.speedFloorPercent"` |
| `limits.co2MaxPpm` | `"test.co2AbortCeilingPpm (at most 3200, signed); habitat.co2.elevatedPpm 3500"` | `"test.co2AbortCeilingPpm"` |
| `steps.2.speedPercent` | `"test.speedFloorPercent; scrubber.effectiveFlowAtFull 1 m3/min (scrubber-1-datasheet)"` | `"test.speedFloorPercent"` |
| `steps.2.speedPercent` | `"scrubber.flowAtFull / test.speedFloorPercent"` | `"test.speedFloorPercent"` |

The fields touched were `limits.minSpeedPercent`, `limits.co2MaxPpm`, `limits.co2AbortPpm`, `steps.1.speedPercent` and `steps.2.speedPercent`.

### Cost

- The retry costs one step per failing task: about 20 k input tokens and 0.6 k output tokens per task, over 8 steps in total.
- Tasks with the failure averaged 11 steps, 72 k input and 7.1 k output tokens. The 2 clean tasks averaged 11 steps, 78 k input and 8.5 k output tokens. With so few clean tasks, the difference is within noise.

## The five criteria, for pattern 1

1. **It occurs naturally with the clean 8192 configuration**: yes, with 0 truncations.
2. **It recurs across independent tasks**: yes, in 8 of 10 tasks and on 5 different fields.
3. **Sonnet corrects it after the guard's feedback**: yes, 8 of 8, in one retry each.
4. **The correction is observable in the episode**: yes, 8 of 8 contrasts were extracted deterministically, and the same Y recurs.
5. **It is not primarily caused by the harness**: no truncation and no pre-guard artefact. There is a caveat, though.

The caveat: the harness enforces a rule it never states before the refusal, and it misnames the refusal.

- The guard (`factOf`, `harness/core/justify.ts`) accepts a reference that names exactly one library fact, whatever surrounds it: `"test.speedFloorPercent (commissioning-test-safety, signed)"` passes. It refuses one that names two.
- The refusal then says the reference "is not a fact of the library", which is not the reason: two facts are named, not none. The end of the message does say which fact to cite, and Sonnet follows it.
- Before the first submission, the socle, the brief and C speak of "the fact" to cite, but never say that a reference names one fact alone. Nor do they say that a supporting engineering fact belongs in `reason`.

So this is a genuine model behaviour: Sonnet adds the engineering rationale to the bound, the way an engineer would. It happens at an interface with an unstated rule and a misleading refusal, and those two harness points plausibly contribute. A one-sentence clarification of the rule, or a refusal message naming both facts, might remove it without any learning.

## Verdict

- **One pattern meets criteria 1 to 4 clearly, and meets 5 with the caveat above:** the composite reference.
- **Nothing else recurs.**
- **The composite reference was not privileged.** It stands out because it is the only failure that recurs.

The earlier 4-task sample under the same settings showed it once in 4 tasks. Across the 14 tasks at 8192 it appears in 9. It is the only candidate target.

Two decisions belong to Guillaume:

- whether a rule the harness never states counts as a behaviour worth learning, or as a specification gap to close by hand;
- whether to correct the misleading refusal message first. That would change the guard's words, not its decisions.
