# The contract gap closed by hand: Sonnet, no memory, same 10 unseen tasks (2026-09-30)

The earlier baseline found a rule the guard enforced but the contract never stated: a reference names exactly one library fact. Commit `287f5bc` closed that gap for every model:

- the schema's `reference` now says so;
- the witness C says "the single fact to cite, by its id alone";
- the guard's refusal names the facts (`INVALID_REFERENCE_CARDINALITY`).

What the guard accepts is unchanged.

The verification ran in fork `exp6-contract`, created fresh from the corrected repository, with Sonnet 5.5 at an 8192-token output limit. There was no working memory of previous tasks, no long-term memory, no recipes and no learning. It used the same 10 unseen tasks as `../2026-09-29-transfer`.

## Result: the first guard-evaluated submission

| Task | Sonnet, no memory, contract as before | Sonnet + learned memory | Sonnet, no memory, contract corrected |
|---|---|---|---|
| v1 | fail (composite) | pass | pass |
| v2 | fail (composite) | pass | pass |
| v3 | fail (composite) | pass | pass |
| v4, after a CO2 abort | pass | pass | no submission: STUCK re-reading `workspace.read` |
| v5, after a heart-rate abort | fail (composite) | pass | pass |
| v6 | fail (composite) | pass | pass |
| v7 | pass | fail (shape) | pass |
| v8 | fail (justification, shape) | pass | fail (shape: a unit) |
| v9, after a CO2 abort | pass | pass | pass |
| v10 | fail (composite) | pass | pass |
| **Passed** | **3/10** | **9/10** | **8/10** |
| Composite reference refused | 6 | 0 | 0 |
| Average steps / input / output tokens | 12.7 / 104 k / 8.4 k | 11.7 / 83 k / 7.6 k | 12.2 / 89 k / 7.4 k |
| Truncations | 0 | 0 | 0 |

## How Sonnet wrote its safety references at the first submission

| | Bare id | One id with notes around it | Two ids or more (composite) |
|---|---|---|---|
| Contract as before, no memory | 36 | 54 | 9 |
| Learned memory | 97 | 0 | 0 |
| Contract corrected, no memory | 88 | 0 | 0 |

## What it shows

- **Stating the contract removes the error as completely as the learned memory did.** No composite reference was refused and none was sent. Sonnet's reference style changed entirely: every reference became a bare id, the notes included.
- **The pass rate is not the whole story.** 8/10 with the contract against 9/10 with the memory is within noise. The two failures of the corrected run are of other kinds:
  - a unit, seen before in other conditions;
  - a task stuck re-reading after an abort. This is the second such case, after exp-control v5, and a candidate behaviour for later study.
- **What each fix does.**
  - The contract fix is model-agnostic. It needs no learning phase and holds for every model: GPT and Fable already wrote bare ids.
  - The memory reached the same result for Sonnet without anyone touching the contract. Its entry *was* a statement of the gap.
  - In Guillaume's words: the memory is not redundant when it finds a contract gap. It should also flag it, so the contract can be corrected. That is the role foreseen for a post-procedure evaluator: read the episodes and the consolidated entries, classify each as a contract gap, a learned policy or domain knowledge, and recommend changes to the harness and the RAG library, for a person to approve.
- **Limits.** One run of 10 tasks per condition and one gap. The comparison with the earlier runs is across forks, but the tasks, model and settings are the same.
