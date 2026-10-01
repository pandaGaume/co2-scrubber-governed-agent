# Recommendation rec-5372d1dbbafa: memory for REFERENCE_NOT_A_FACT

The entry was learned from two refused attempts (exp4-train t-2026-09-29-0001 and -0002) of REFERENCE_NOT_A_FACT, when no text told the model that one id alone is accepted (the safety card said "the fact's id as its reference", which a model read as allowing two ids joined). That gap is closed: since 287f5bc, words.json /brief/safetyBounds and justify.ts state the rule the guard enforces. The entry now only repeats the contract, so it is redundant and a second source of the same rule that can drift from it.

**Proposed by:** the recommendation factory, task t-2026-10-01-0003, proposal p0003-7cfc3ca4, sha256 76234308a30f1abc9e36b10c20ebfbda7f92145f9607f38908036892613e319b. It is not signed: it changes nothing until an authorised signatory reads it and signs it, and a signed one is applied in a fork and measured before a person commits it.

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

> Retire memory entry m-e26243b3d5 (topic procedure): "In the justification of each safety constant, cite as reference only the bare id of the single signed fact that bounds it (test.speedFloorPercent for every speed field, test.co2AbortCeilingPpm for the CO2 limit), never a second fact, a datasheet, a comparison sign or a value in the same reference." The rule it carries is now written where the model reads it: specs/procedure/words.json /brief/safetyBounds ("which is the single fact to cite, by its id alone as the reference") and the justification contract in harness/core/justify.ts ("Exactly one: for library, one id as library.facts lists it"). No text of the contract changes; only the redundant entry is removed. The guard's check is unchanged: a safety constant's reference must be one fact id as library.facts lists it, and nothing else.

## The effect expected

REFERENCE_NOT_A_FACT refusals stay at 0 on the replayed cases without the memory entry, because the contract states the rule. The finding's count (told: 0, not: 2) falls to no entry compensating for a gap of the contract. No change in what the guard accepts.

## How it is verified

- Replay `experiment train t1`, `experiment train t2`, 5 task(s), on claude-sonnet-5-5.
- Measure: REFERENCE_NOT_A_FACT: the number of refusals for a justification reference that is not a single fact id, over the replayed tasks with the entry retired.

The recommendation itself is the file beside this one, `rec-5372d1dbbafa.recommendation.json`: a signature binds both.
