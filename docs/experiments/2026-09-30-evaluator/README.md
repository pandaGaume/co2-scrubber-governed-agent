# The evaluator's first detectors on two days of tasks (2026-09-30)

The post-procedure evaluator (`docs/evaluateur.fr.md`, E1) reads the harness's graph with deterministic detectors, and no model:

- **D4:** artefacts of the harness;
- **D5:** a form of failure that changed with the harness;
- **D2:** a correction repeated at the first retry;
- **D3:** a form one model makes and another does not;
- **D8:** a model's own mistake.

The evaluator was run on two sources:

- **the forks:** the 12 forks of the experiments of 29 and 30 September, read together;
- **the repository's workshop:** `outputs/factory`, the tasks of 28 and 29 September.

It changed nothing. The raw output is in `forks.txt` and `repository.txt` (`node scripts/evaluator/run.mjs`).

## The forks: 105 procedure tasks, Sonnet 80, GPT 20, Fable 5

The evaluator reaches alone the conclusions that two days of reading by hand reached:

| Found | Detector | What it was |
|---|---|---|
| 13 calls cut at the output limit in 13 tasks; gone at the next fingerprint, whose changes include `profiles/anthropic-sonnet.json` | D4, D5 | the 4096-token limit |
| The composite reference, answered in 22 tasks by narrowing it to one fact, always at the first retry; 6 of 10 under Sonnet, 0 of 10 under GPT on the same cases | D2, D3 | the gap of the contract fixed in `287f5bc` |
| The same form, 6 of 10 tasks before and 0 of 10 after the harness changed, with `specs/procedure/words.json` among the changes | D5 | that fix, measured |
| Two tasks ended in a loop of refused re-reads | D4 | the read loop after an abort (exp6), and one in exp-control |
| A safety constant left without a justification, answered by adding it, in Sonnet's tasks and GPT's (v10) | D2 | among them, GPT's steps indexed from 0; D1 (E2) settles which are gaps |
| v4, the analysis at odds with its procedure, in one task | D8 | the model's own mistake, nothing to recommend |

It also found two things nobody had read:

- **A schema refusal.** `procedure.analyse` was refused by its schema in 10 Sonnet tasks, because `evidence` was not sent as a list.
- **Repeated reads.** 25 reads were refused as repeats, in 19 tasks.

## What it does not settle yet

- **The speed declared a Speed** (3 tasks). It recurs, but the guard's refusal names no path, so no correction is tied to it. It is left unclassified for D1.
- **"The analysis says * changes"** (2 tasks). It covers two causes: v4 (the model's mistake) and v9 (the path convention). The register's conventions (E2) will tell them apart.
- **The history written for the validation tasks.** No detector of E1 compares what a brief promises with what the state holds.
- **A regression that is not one.** exp-learn and exp-control ran in parallel, as the learning arm and the control arm. The evaluator sees them as two states of the harness in a row and reports the control's composite references as a regression. That is the protocol's own result (4/6 vs 0/6) read the wrong way round.

## The repository's workshop: 72 model tasks (Haiku 71, Opus 1), 57 scripted ones left out

The scripted tasks are stand-ins whose mistakes are written on purpose, so the evaluator does not read them (`specs/harness/evaluator.json`, `models.ignore`).

In the model tasks, the evaluator finds:

- **truncations:** 18 calls cut, in 4 tasks;
- **refusals before any guard, recurring:**
  - schemas: `data/expected`, `data/abort/#/threshold`, `version`;
  - a file not found by `workspace.read`, 19 times;
  - stale decisions;
- **a regression of the monitoring rule** for Haiku, after the tools changed;
- **11 mistakes seen once each.**

Most of Haiku's forms (the floor in 47 tasks, the CO2 bounds in 28, the duration in 25) are left unclassified. Haiku's tasks were rarely accepted, so there are no corrections for D2 to read. These forms are D1's.

## What had to change for this

- **Fingerprints of old manifests.** Before E0, a manifest's `tools.sha256` left the input schemas out, so exp3 and exp6 had the same fingerprint although the contract changed between them. For those manifests, the fork's origin commit is now part of the fingerprint, and D5 reads the changed files from git.
- **Guard refusals in old manifests.** A manifest written before the `judged` mark had its guard refusals read as the harness's. The guard's own words (`guard.refused` of the topic) now tell them apart.
- **The case of a task.** Outside the experiments, `requestedBy` names who asked, not the case. The case is now the request itself, without its measurements and times. D8 keeps only a form seen in a single task.
