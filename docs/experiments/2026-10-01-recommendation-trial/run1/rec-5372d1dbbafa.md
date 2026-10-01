# Recommendation rec-5372d1dbbafa: memory for REFERENCE_NOT_A_FACT

The entry was learned from two refusals (exp4-train t-2026-09-29-0001 and -0002) for REFERENCE_NOT_A_FACT, when no text stated that a reference is exactly one fact id. That was a gap in the contract, filled by memory instead of by writing. Since commit 287f5bc, the procedure brief (words.json /brief/safetyBounds) and the justification schema (justify.ts) both say it: one id, nothing joined, supporting facts in reason. Keeping the entry now duplicates the contract. It also risks drifting from it: it hard-codes fact ids such as test.speedFloorPercent, which the state already gives per constant.

**Proposed by:** the recommendation factory, task t-2026-10-01-0003, proposal p0003-a6630c3b, sha256 420f14dd4fec1f019525ba82e83e23fb00fa1e4211d43cd9cde7c57bb2b4daad. It is not signed: it changes nothing until an authorised signatory reads it and signs it, and a signed one is applied in a fork and measured before a person commits it.

**The finding:** D6, contract-gap, rule `REFERENCE_NOT_A_FACT`: the memory entry "In the justification of each safety constant, cite as reference only the bare id of the single signed fact that bounds i…" compensates REFERENCE_NOT_A_FACT, which no text its failures were given stated: a gap of the contract, learned instead of written; stated since, by specs/procedure/words.json /brief/safetyBounds: "which is the single fact to cite, by its id alone as the reference"; harness/core/justify.ts: "Exactly one: for library, one id as library.facts lists it": the entry is now redundant (2 task(s); claude-sonnet-5-5 2)

## Its path in the harness's graph

- `memory:procedure:m-e26243b3d5 -rests-on-> episode:exp4-train/t-2026-09-29-0001, episode:exp4-train/t-2026-09-29-0002`
- `<-of- attempts -refused-for-> forms -of-> rule:procedure:REFERENCE_NOT_A_FACT`
- `told: 0, not: 2, not known: 0`

## What it changes

- **Kind:** memory, **action:** retire, **target:** the memory entry `m-e26243b3d5`.
- It changes no decision of a guard.

### Now

> (none)

### Proposed

> Retire the memory entry m-e26243b3d5 (topic procedure): "In the justification of each safety constant, cite as reference only the bare id of the single signed fact that bounds it (test.speedFloorPercent for every speed field, test.co2AbortCeilingPpm for the CO2 limit), never a second fact, a datasheet, a comparison sign or a value in the same reference." The rule REFERENCE_NOT_A_FACT is now written where the models read: specs/procedure/words.json /brief/safetyBounds ("which is the single fact to cite, by its id alone as the reference (the facts that support the value and the engineering rationale go in reason)") and the justification schema of harness/core/justify.ts ("Exactly one: for library, one id as library.facts lists it (a safety constant's is the one signed fact that bounds it), nothing joined to it"). No text change is needed; the entry only duplicates them.

## The effect expected

The finding's counts go from told 0 / not told 2 to the rule being told by the contract and not by memory. With the entry retired, REFERENCE_NOT_A_FACT refusals in procedure tasks should stay at zero for claude-sonnet-5-5 on the replayed cases, as they were with the entry. The guard's acceptance does not change.

## How it is verified

- Replay `experiment train t1`, `experiment train t2`, 5 task(s), on claude-sonnet-5-5.
- Measure: REFERENCE_NOT_A_FACT: the number of procedure submissions refused because a safety-constant reference is not exactly one signed fact id, with the entry retired, compared with the two original failures. Success is none refused for this rule across the replays..

The recommendation itself is the file beside this one, `rec-5372d1dbbafa.recommendation.json`: a signature binds both.
