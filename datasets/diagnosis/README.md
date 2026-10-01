# The diagnoses' dataset

What the diagnosis factory's models sent, and what the harness observed of it: one file per diagnosis task, written when the task ends, however it ended (accepted, refused, stuck). It is the input of the calibration of the confidence (`docs/evaluateur.fr.md`, E5.3 and E5.4): joined with the labels (`tests/fixtures/evaluator/labels.json`), it says how often a diagnosis is right at each confidence. A model is paid once; the calibration is computed again as often as needed.

An entry keeps, read from the task's own files and never from a model's word (`lib/diagnosis-dataset.ts`):

- what the factory was given (`asked`, whole, and its sha256), the forks it was read in, and the labelled corpus they are, when they are one;
- the model and how it ran (provider, settings, profile), and the harness's version (the commits);
- every step as the manifest has it: the capability, what the model sent, the outcome, the refusal's words, the tokens;
- every diagnosis submitted, refused or accepted, with the guard's words;
- the diagnosis the guard accepted, each prediction with the result the harness observed;
- what the station decided of it (diagnosed: checked again on its own graph, and kept).

It does not keep the state the model read at each step (the task's trace does): that is reproducible from the forks and the commits, what the model sent is not. An entry is never overwritten: what a model sent is a measure, not a draft.

Written by the factory when a diagnosis task ends. For the tasks it missed (a fork's workshop, a task of before):

    node scripts/evaluator/dataset.mjs

The calibration, offline, under the configuration of `specs/harness/diagnosis.json` or another:

    node scripts/evaluator/calibrate.mjs [--config other.json] [--recheck] [--likely] [--json]

`--recheck` checks each accepted diagnosis again as the code is now, on the corpus it was made on: a change of the predicates or of the guard is measured without a model.
