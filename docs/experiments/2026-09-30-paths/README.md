# The path convention of a list's element, stated and measured (2026-09-30)

The guard names a step by its number `n` and an abort condition by its `id` (the keys in `specs/procedure/format.json`). The contract never said so:

- GPT justified the steps as `steps.0` and `steps.1`;
- Sonnet did the same under a JSON Pointer example;
- in v9, Sonnet named the abort thresholds by their position (`abort.0.threshold`).

Commit `43e1fe8` states the convention in three places, each with an example the guard reads the same way:

- the procedure schema (`n`, `id`);
- the analysis schema (`path`);
- the witness C.

What the guard accepts is unchanged.

The run was Sonnet 5.5 at an 8192-token output limit, fork `exp8-paths`, no working memory of previous tasks, no long-term memory, no recipes, no learning. It used the same 10 unseen tasks as the previous run (`../2026-09-30-fixes`), v4, v5 and v9 with their history.

## Result

| | + the fixes (previous run) | + the path convention |
|---|---|---|
| First guard-evaluated submission passed | 9/10 | **9/10** |
| Guard problems at that submission | 3 | 2 |
| Kinds | justification (paths by position), analysis | analysis |
| Average steps / input / output tokens | 10.9 / 92 k / 8.6 k | 11.1 / 89 k / 8.2 k |
| Truncations | 0 | 0 |

**The convention was followed completely.** Every path in the first submissions named a step by its `n` (40 of 40) and an abort condition by its `id` (20 of 20); none named them by position. v9, refused in the previous run, passed.

## The failure left: v4, the analysis and the procedure disagree

The procedure was refused because its analysis named two changes the procedure does not make:

- **`steps.2.minutes`**: the analysis says 30 becomes 35, and the procedure keeps 30.
- **`device`**: listed to mean a correction of the text (the devices named in the expectations and hypotheses), while the field's value stays the same.

The brief states the rule ("it must change every field the analysis names"). The refusal names both points, and the task was accepted at its next submission.

This is an inconsistency of the model's own, not a gap in the contract. It is the only failure of the run, and nothing like it was seen in the previous run on the same task.

## Where Sonnet stands, with no memory, on the same unseen tasks

| Contract | Passed at the first guard-evaluated submission |
|---|---|
| as it was | 3/10 |
| + the reference said (one fact, its id) | 8/10 |
| + quantities, the aborted test's history, JSON fields readable | 9/10 |
| + the path convention of a list's element | 9/10 |

Every gap closed was a rule the guard enforced and the contract did not state. Each was found by reading the episodes of the failures, and each was closed for every model rather than for Sonnet.
