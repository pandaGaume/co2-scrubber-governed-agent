# The recommendation factory's first real run (2026-10-01)

The recommendation factory (`docs/evaluateur.fr.md`, E3) was run with a model for the first time:

- **Model:** Sonnet 5.5 (`profiles/anthropic-sonnet.json`).
- **Forks:** each run had its own (`exp9-recommend`, then `exp9-recommend-2`), so nothing reached the repository's shelf.
- **Findings:** three, read from the 12 forks of the experiments of 29 and 30 September.

| Finding | Detector, class |
|---|---|
| `procedure.analyse` refused by its schema in 10 tasks (`data/evidence must be array`) | D4, an artefact of the harness |
| `expected`: stated, read, and refused all the same, in 2 tasks | D1, stated and not followed |
| The memory entry Sonnet learned, which compensates `REFERENCE_NOT_A_FACT` | D6, a gap of the contract |

The driver is `driver.mjs`. Each run's recommendations, as the shelf holds them, are in `run1/` and `run2/`, with the tasks' steps and tokens.

## Run 1

The factory's guard accepted all three recommendations at the first try, in 3 or 4 model calls and under 30 seconds each.

**None reached the shelf.** The station refused all three with "the library did not take it: fetch failed".

- The cause was in the harness, not the model. The station had asked for its session with the library at startup, before the library was published. The `Broker` kept that failed session, so every later call of the station to the library failed the same way.
- The station's own reads of the shelf failed the same way, unseen: in `station.recommend` and `harness_evaluate` the shelf simply looked empty.
- Fixed in `36e1a3f`:
  - a session that could not be opened is dropped, and opened again at the next call;
  - a tool call is never sent twice;
  - the station refuses to go on when the library cannot be read.
- The recommendations accepted by the guard were then filed again by hand on the fixed station, with no new model call, and reached the shelf, awaiting signature.

**What the model wrote:**

- **`procedure.analyse`:** relevant. It appends to the capability's description that `evidence` and `changes` are arrays, never a single string, with an example that keeps the conventions. One claim is not quite right: it says no text states that they are arrays, but the capability's input schema does; only its description does not.
- **`expected`:** it overreached. It asked for numeric predictions with units and a refutation condition, where the guard only checks that `expected` is not empty (`nonEmpty`). Signed, it would have put in the contract a rule nothing enforces. The model had been given the rule's words, not what the guard checks.
- **The memory entry:** retire it, with the right reasons.
- **Cost of the memory task:** 86 000 input tokens, against 7 000 for the first task. It had been given `harness/core/justify.ts` whole (28 000 characters of code) as a text it could change, which a contract recommendation cannot replace.

Fixed in `36e1a3f`:
- the factory is given only texts a recommendation can change (a JSON value by its pointer, a document whole);
- it is given what the guard checks (a signed rule's check, or a refusal a rule written in code makes);
- its prompt says to recommend what the guard enforces, and no more.

## Run 2

Same model, same findings, the fixes in.

- **Acceptance:** all three accepted at the first try, and on the shelf, awaiting signature, at once.
- **`expected`:** now says only what the guard checks: "Required: this field must not be empty, and the procedure is refused if it is."
- **The memory task:** 19 000 input tokens (86 000 in run 1).
- **The other two:** as relevant as in run 1.

| Run | Task | Calls | Input tokens | Output tokens |
|---|---|---|---|---|
| 1 | analyse | 3 | 7 264 | 2 037 |
| 1 | expected | 4 | 20 609 | 2 301 |
| 1 | memory | 3 | 86 068 | 2 095 |
| 2 | analyse | 3 | 7 296 | 1 984 |
| 2 | expected | 3 | 14 084 | 1 676 |
| 2 | memory | 3 | 19 117 | 2 119 |

## What the trial found about the evaluator itself

Reading the two `expected` tasks again showed that the finding was wrong. In both (exp-control t-0003, exp-learn t-0006), the first submission had been cut at the 4096-token limit. The model then sent a `procedure.revise` with no whole procedure behind it, and that is what the guard refused for an empty `expected`.

So it was not a rule stated and not followed: it was what a truncation left, fixed already by the 8192 limit. D1 counted as a first try the first attempt the guard judged, even when a cut one came before it.

Now an attempt that follows a truncation or a refusal by the harness is no first try on the contract:

- **`expected`:** it is no longer a finding. It stays unclassified, its two tasks marked as not at a first try.
- **`REFERENCE_NOT_A_FACT`:** 16 tasks at a first try, not 23.
- **`UNKNOWN_UNIT`:** 2 tasks, not 3.

**Neither run's `expected` recommendation should be signed.** They answer a finding that is no longer one.

## Still to see
- **Nothing signed has been applied or measured.** That is E4.
- **The other `fetch failed`.** The intermittent failure of the commissioning tests (`factory.task: fetch failed` under the full suite) is a session already open, not one that could not be opened. The Broker fix does not cover it.

## Run 3: harder findings

Three findings of the repository's workshop (Haiku's tasks of 28 September), each a test of judgement more than of writing:

- **The tasks' copy.** They were copied into a snapshot of their own (`outputs/forks/snapshot-repository-workshop`), whose record names no commit. As in the repository, the version of the contract they ran under stays not known; copied into a fork, they would have taken its commit, today's.
- **The run.** Fork `exp9-recommend-3`, Sonnet 5.5, `driver-named.mjs`. The recommendations, as the shelf holds them, are in `run3-hard/`.

| Finding | What the model wrote | Verdict |
|---|---|---|
| D5: the regression of `monitoring.occupied` for Haiku, a rule stated nowhere (a gap of the register) | A section appended to the procedure's prompt: read the occupancy before submitting; name every occupant in `monitoring.subjects`; stop on the vitals (an `abort` with id `vitals`, source `biomed.verdict`); no test on a person under an alarm | **Good.** What the guard's check says and no more, the convention kept. |
| D7: `FACT_UNSIGNED` in 5 tasks, about `commissioning-test-safety` and `scrubber-1-datasheet` | Sign `scrubber-1-datasheet`. "Once signed, a step's speed may cite `scrubber.minimumSpeedElevated`." | **Wrong.** The datasheet is signed already (28 September, 14:04), after Haiku's refusals. And the claim is false: `floor.step` bounds a step's speed by `test.speedFloorPercent`, and the guard refuses any other fact (`FACT_NOT_BOUNDING`). A signatory would have been misled. |
| D4: 18 calls cut at the output limit in 4 tasks | Ask for a short procedure in `procedure.submit`'s description, and list four rules of the guard there too | **Too broad.** Asking for a short procedure is a fair answer. The four rules are other findings, which makes the change impossible to measure. The cause, the output limit, is no text. |

What it cost: D5 3 calls, 17 832 input tokens; D7 7 calls (it read the library, and its first proposal was refused for a justification missing), 52 775; D4 5 calls, 19 465.

**What was wrong on our side, and fixed:**

- **D7 did not close.** A gap of the library stayed open after its documents were signed. It now closes when every document it names is signed today, and stays listed, signed since.
- **Signatures were not given.** The factory was not told whether a document is signed. It is now, and the guard refuses to recommend signing a document already signed.
- **Cases.** Outside an experiment, who asked ("station", "scenario") names no case. The cases to replay are then the tasks themselves.
- **One change per finding.** The prompt now asks for it, and says that a signature makes possible only what the guard's rules say.

On the same snapshot, the station now refuses to ask for D7 again: nothing to recommend, both documents signed since.

**Still to see.** Whether a model keeps to one change per finding cannot be checked by a guard. It is for the signatory, who reads the recommendation before signing it.

