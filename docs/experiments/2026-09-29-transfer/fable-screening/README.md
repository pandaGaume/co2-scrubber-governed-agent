# Fable 5.1 screening, condition A (2026-09-29)

Guillaume's screening came before any full Fable validation. The question was whether Fable, a model that never learned, makes Sonnet's mistake (a composite reference).

## Setup

- 5 tasks from the training variants (t1 to t5), so the 10 validation tasks stay unseen.
- Fork `exp5-fable-screen-a`, cloned from the frozen `exp4-train`.
- Previous tasks' working memory off, long-term memory not read, no recipes, no learning.
- `claude-fable-5-1` with an 8192 output limit.
- C, the guard, the contracts and the prompts unchanged.

## Result

**5/5 accepted at the first guard-evaluated submission.** No composite reference was sent, there were no truncations, and every task took 8 steps (43 to 58 k input tokens, 5.7 to 6.3 k output). The memory, ledger and settings were unchanged.

The rule was set before the run:

| Screening outcome | Decision |
|---|---|
| 5/5 | stop: the rule has nothing to teach this model |
| 4/5 | stop: the mistake is too rare |
| 3/5 or fewer, with composite references | run the full validation, Fable without and with Sonnet's memory, 10 tasks each |

By that rule, the screening stops here and no full Fable validation is run.

Like `gpt-5.6-sol`, Fable does not reproduce the mistake Sonnet learned from. So the cross-model positive transfer stays untested for this rule: no available target model makes the mistake.
