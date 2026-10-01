# The evaluator's second corpus: the repository's workshop

The procedure tasks of the repository's workshop, from 23 to 28 September 2026: Haiku's (71) and one of Opus. They are copied from `outputs/forks/snapshot-repository-workshop`, a snapshot of `outputs/factory` whose record names no commit. As in the repository, the version of the contract these tasks ran under is not known.

Copied by:

```
node scripts/evaluator/corpus.mjs --out tests/fixtures/evaluator-repository --skip-model ^scripted/ --topics procedure snapshot-repository-workshop
```

The scripted stand-ins' tasks are left out, as the evaluator leaves them out: their mistakes are written on purpose. So are the other topics, which the evaluator does not read.

Their labels are with the first corpus's, in `../evaluator/labels.json` (corpus `evaluator-repository`).
