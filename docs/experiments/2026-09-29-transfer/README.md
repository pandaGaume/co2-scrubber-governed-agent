# Learning with Sonnet, transfer to GPT (2026-09-29)

**Question.** A rule is learned from Sonnet's experience and consolidated into the harness's memory, scoped to the domain `procedure_authoring`. Does it improve Sonnet on unseen tasks? And given as it is to a model of another family and provider (`gpt-5.6-sol`), which neither learned nor reflected, is it useful, neutral, or harmful?

**What did not change.** C, the guard, the tool contracts, the schema and the factories' prompts are identical in every condition and every phase. An attempt to state the one-fact rule in the contract was reverted before any run.

Both models had an 8192-token output limit. In every validation condition:

- the previous tasks' working memory was off;
- learning was off (no reflection, no consolidation);
- the forks started with no recipes;
- the memory, ledger and settings had the same fingerprints before and after (`memoryUnchanged: true`).

## Phase 1: Sonnet without memory

This is the earlier baseline (`../2026-09-29-baseline`): 2 of 10 tasks accepted at the first guard-evaluated submission. The 8 failures were composite references (two library facts in one reference), each corrected in one retry.

## Phase 2: Sonnet learns

The training fork was `exp4-train` (`train.json`, `train-driver.txt`, `ledger.json`), running Sonnet with the reflection also run by Sonnet.

- **t1, t2:** both refused for a composite reference, each corrected in its task. The reflection read the two episodes (X refused, Y accepted).
  - Its first `reflection.remember` was refused by its own guard: the rule was 457 characters, and a rule is one sentence of 20 to 400.
  - Its second was accepted and entered as a candidate.
  - The candidate went straight to trial: 2 failures and 2 successes answering them.
- **The entry**, in `memory-procedure_authoring.json`, domain `procedure_authoring`, applying to `procedure.submit` and `procedure.revise`:
  > In the justification of each safety constant, cite as reference only the bare id of the single signed fact that bounds it (test.speedFloorPercent for every speed field, test.co2AbortCeilingPpm for the CO2 limit), never a second fact, a datasheet, a comparison sign or a value in the same reference.
- **t3 to t5:** the trial.
  - t3 and t5 were accepted at the first try.
  - t4 was refused for another reason: justifications missing, not a composite reference.
- **Consolidated:** "the mistake showed in 0 of the 3 task(s) since its trial, against 2 of 2 before", confidence 1.0 over 3 tasks. Learning then froze.

## Phases 2 and 3: validation on the same 10 unseen tasks

The condition forks were `exp4-sonnet-a`, `exp4-sonnet-c`, `exp4-gpt-a` and `exp4-gpt-c`, all cloned from the frozen fork: the same memory and ledger, no recipes. Only the settings and the model differ. GPT without memory ran first, then GPT with memory.

| Task | Sonnet, no memory | Sonnet + memory | GPT, no memory | GPT + Sonnet's memory |
|---|---|---|---|---|
| v1: 800 ppm, four people | fail (composite) | pass | pass | pass |
| v2: 2000 ppm, two | fail (composite, and three other justification problems) | pass | pass | pass |
| v3: 1200 ppm, one | fail (composite) | pass | pass | pass |
| v4: 1550 ppm, after a CO2 abort | pass | pass | pass | pass |
| v5: 950 ppm, after a heart-rate abort | fail (composite) | pass | pass | pass |
| v6: 1800 ppm, three | fail (composite) | pass | pass | pass |
| v7: 1050 ppm, three | pass | fail (shape: a quantity not in the unit system) | pass | pass |
| v8: 1900 ppm, one | fail (justification missing, a unit) | pass | pass | pass |
| v9: 1250 ppm, three, after a CO2 abort | pass | pass | pass | pass |
| v10: 1450 ppm, one | fail (composite) | pass | pass | fail (justification: steps indexed from 0) |

| | Sonnet, no memory | Sonnet + memory | GPT, no memory | GPT + Sonnet's memory |
|---|---|---|---|---|
| **First guard-evaluated submission passed** | **3/10** | **9/10** | **10/10** | **9/10** |
| Guard problems at that submission | 18 | 1 | 0 | 3 |
| Tasks refused for the composite reference | 6 | 0 | 0 | 0 |
| Other error types | justification 1, shape 1 | shape 1 | none | justification 1 |
| Average steps | 12.7 | 11.7 | 8.3 | 8.4 |
| Average input tokens | 103 889 | 83 027 | 64 194 | 66 110 |
| Average output tokens | 8 394 | 7 622 | 2 487 | 2 456 |
| Largest output of one step | 6 673 | 6 165 | 2 330 | 2 434 |
| Truncations | 0 | 0 | 0 | 0 |
| Memory in the state (learned / previous episodes) | 0 / 0 | 1 / 0 each task | 0 / 0 | 1 / 0 each task |

## What it shows

- **Sonnet.** The consolidated memory generalises to unseen tasks.
  - The first guard-evaluated submission passed 3/10 without it and 9/10 with it (one-sided Fisher p ≈ 0.01).
  - The composite reference fell from 6/10 to 0/10 (p ≈ 0.005).
  - Sonnet's one failure with the memory is of another kind (a unit).
  - Paired by task: with the memory, 6 tasks go from fail to pass and 1 from pass to fail (v7, on a unit, not a reference).
  - The memory saves steps and tokens, since fewer retries are needed.
- **GPT.** `gpt-5.6-sol` does not make Sonnet's mistake: 10/10 without the memory.
  - With Sonnet's memory it passes 9/10. The composite reference appears 0 times in both conditions.
  - The one difference, v10, is a failure of another kind. It justified `steps.0` and `steps.1`, where the guard numbers the steps from 1. Every reference it sent was a single fact id, which complies with the rule.
  - Nothing in the entry's wording (bare ids, no second fact, no value) is about indexing. With one occurrence, the memory can be neither blamed nor cleared; 10/10 against 9/10 is within noise.
  - The memory cost GPT nothing measurable: 8.3 against 8.4 steps, 64k against 66k input tokens.
- **The transfer question.** The outcome is the first of Guillaume's three cases: GPT already succeeds without the memory, and the transferred memory stays neutral.
  - It did not force an inappropriate behaviour: GPT's references stayed single ids, and no new error form attributable to the entry appeared.
  - The experiment cannot show that the memory *helps* GPT, because GPT has nothing to learn here.
  - To test a useful transfer, a target model is needed that reproduces the mistake without the memory.

## Limits

- **Sample size.** There are 10 tasks per condition, one learned entry and one training run. The Sonnet effect is large. The GPT difference (one task) is not.
- **One domain, one fact library.** The facts were not varied, since that needs a person's signature.
- **One regression per memory condition.** Sonnet v7 and GPT v10 are each a single failure of another kind: a unit, and step indexing. Neither was seen in the matching condition without the memory. They are listed as new error types to watch, not attributed.
- **The contract gap is still open.** The rule the memory learned is the guard's unstated contract (a reference names exactly one fact). The memory closed it for Sonnet without touching the contract. Whether it should also be written in the schema is a separate decision, and was deliberately left out of this experiment.
