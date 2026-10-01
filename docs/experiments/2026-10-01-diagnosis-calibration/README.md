# E5.4: the diagnosis by two models on the labelled leads (2026-10-01)

The diagnosis factory (`docs/evaluateur.fr.md`, E5.2) was run on the 20 leads whose label is established (17) or likely (3), in the two labelled corpora presented as forks, once with Sonnet 5.5 (`profiles/anthropic-sonnet.json`) and once with GPT 5.6 (`profiles/openai-gpt.json`, `gpt-5.6-sol`), each blind to the other. Each server ran on a workshop of its own (`outputs/e54/`, not kept); every task is recorded in `datasets/diagnosis/` (40 entries). The driver is `driver.mjs`; the runs' summaries are `sonnet-run.json`, `sonnet-run-missing.json`, `gpt-pilot.json`, `gpt-run.json`; the calibration computed from the dataset alone is `calibration.json` (`node scripts/evaluator/calibrate.mjs --likely --json`).

## Before the run: three pilots, five fixes

Three pilots on `D2:8cba194716f8` with Sonnet, kept in `datasets/diagnosis/pilot/` (paid once, left out of the calibration: made with the harness before its fixes).

| Pilot | Calls | Input tokens | What it showed |
|---|---|---|---|
| 1 | 7 | 350 984 | the lead given twice at every call (48 000 characters in the invariants, a topic's own observation shown again), and a neighbourhood of 45 000 characters |
| 2 | 16 | 373 850 | stuck: the read tools' answers cut by the socle to their first 1 200 characters (the step's refusal never seen), and two reads of two tasks filed under one key, each erasing the other |
| 3 | 8 | 187 142 | the diagnosis made; a neighbourhood still of 34 000 characters |

Fixed before the run (`32aa6b3`, `f29cb0c`, `b253fbd`): a topic's own observation no longer repeated; the read tools answer in pages under the socle's compaction; a read kept under its arguments; the neighbourhood in lines, 50 nodes, 16 700 characters; a diagnosis's id naming its forks (one lead's id named a lead of each corpus). And the flaky "fetch failed" of the test suite, found on the way (`77fd9ea`): a connection kept open between requests, closed by the broker's server while the station built a graph.

## The run

All 40 diagnoses were accepted by the factory's guard and checked again by the station. Ten submissions were refused first (4 by Sonnet, 6 by GPT): an em dash, a prediction of the wrong form, a prediction the harness refuted; each model revised and was accepted.

| | Sonnet 5.5 | GPT 5.6 |
|---|---|---|
| Input tokens | 4 273 257 | 3 813 329 |
| Output tokens | 122 489 | 48 052 |
| Calls per diagnosis | 6 to 20 | 5 to 20 |
| Verdict as the label | 16 / 20 | 7 / 20 |
| Class as the label | 14 / 20 | 14 / 20 |
| Currency as the label (where the label knows it) | 11 / 18 | 12 / 18 |
| All three as the label | 8 / 20 | 2 / 20 |

At Sonnet's usual price (3 and 15 dollars a million tokens in and out) its run cost about 15 dollars, and the pilots about 2; GPT's is its own tariff's, for 3.8 million tokens in.

## What the confidence does with them

Equal weights, nothing calibrated (`specs/harness/diagnosis.json`). The agreement of the two models is what tells: of the 12 leads where they agree, 7 are right on all three; of the 8 where they disagree (capped at 0.5), 1.

| Threshold | Sent on | Right | Precision |
|---|---|---|---|
| 0.75 | 12 | 7 | 58 % |
| 0.80 | 9 | 6 | 67 % |
| 0.85 | 4 | 3 | 75 % |
| 0.90 | 2 | 2 | 100 % |

No threshold reaches nine in ten on more than two leads: **the threshold stays unset**, and every diagnosis goes to a person.

## What the diagnoses get wrong

- **The verdict "stale".** GPT says stale for most causes closed today, also when the lead asks nothing more to be done (9 of its 20 verdicts, 8 of them against the label). The verdict could be derived by the harness (the lead's class right or not, closed or not, asking to act or not): GPT would then be right 12 times, but Sonnet 13 instead of 16. Not adopted.
- **The harness's artefacts and the rates (D4, D5).** Both models are wrong on most of them, as in the first trial: a cut fixed since by a profile, a refusal of the harness read as a model's mistake. All eight disagreements are there.
- **What the cause says and no prediction tests.** On `D2:8cba`, both missed the renumbering of the paths, though the prompt asks to compare paths between submissions; Sonnet writes that the refusal's words were true (they were not), GPT that the speed was changed for nothing. The harness confirmed every prediction they made: the confidence measures the predictions, not the sentences of the cause.
- **The labels.** Some misses may be the labels': `D4:92b3a81902a4` (both say contract-gap; the label says harness-artefact, with a cause that reads as a gap of the description), `D6:93cf26da851b` (both say closed; the label says still), `D4:d77a2a5a7508` of the repository's corpus, and two labels whose currency is unknown. They are to be read again by a person; the calibration is then computed again from the dataset, without a model.
