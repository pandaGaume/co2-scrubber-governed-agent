# The evaluator's corpus

The real tasks of the experiments of 29 and 30 September 2026. A human and a model read them by hand to find why they failed. `tests/evaluator.test.ts` checks that the evaluator (`lib/evaluator.ts`) reaches the same conclusions alone.

Each directory is one fork (`outputs/forks/<id>/outputs/factory`, which git does not keep), copied by:

```
node scripts/evaluator/corpus.mjs exp-learn exp-control exp3-baseline exp4-sonnet-a exp4-gpt-a exp4-gpt-c exp6-contract exp7-fixes exp8-paths
```

Nothing is rewritten, fields are only dropped:

- **manifests:** step summaries are dropped, and so are the inputs of every capability no guard judged;
- **task files:** only who asked, the objective and the observations are kept;
- **traces:** only the lines the graph reads are kept (a refused call's stop reason, and the memory's entries a state held);
- **inherited tasks:** a task a fork inherited from its parent is copied once, under the first fork that holds it.

| Fork | What it was |
|---|---|
| exp-learn, exp-control | the first learning protocol, Sonnet at 4096 output tokens: the truncations |
| exp3-baseline | Sonnet at 8192, no memory: the composite reference |
| exp4-sonnet-a (with exp4-train's tasks), exp4-gpt-a, exp4-gpt-c | the transfer: Sonnet and GPT on the same 10 tasks, without and with the learned memory |
| exp6-contract | after the reference's contract: the speed declared a Speed, the read loop after an abort |
| exp7-fixes | after the quantities, the history and the JSON pointer: v9's abort thresholds named by position |
| exp8-paths | after the path convention: v4's analysis at odds with its procedure |

The run the `/steps/0/reason` example primed is not here: its fork was removed with its traces. The test rebuilds it from the account in `docs/experiments/2026-09-30-fixes/README.md` and says so.
