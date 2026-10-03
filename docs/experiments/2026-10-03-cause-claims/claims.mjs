// The factual claims of the 40 recorded causes of E5.4 (datasets/diagnosis/, causes.md) that no prediction of theirs tests, read by
// hand (2026-10-03). fixed: what the first reading of a claim got wrong (the claim held; its encoding did not).
// kind C: checkable with today's predicates (encoded, expect = what the cause asserts); N: a fact of the sources no predicate says;
// I: an interpretation, not a fact of the sources. n is the cause's number in causes.md.
const R = "snapshot-repository-workshop/";
const T10 = "exp3-baseline/t-2026-09-29-0010";
export const CLAIMS = [
    // 1 D4:4f5d claude
    { n: 1, kind: "C", says: "0017 steps 11 and 15 refused too", p: { predicate: "outcome-at", args: { task: `${R}t-2026-09-25-0017`, step: 11, outcome: "harness-refused" } }, expect: true },
    { n: 1, kind: "C", says: "0017 step 15 refused", p: { predicate: "outcome-at", args: { task: `${R}t-2026-09-25-0017`, step: 15, outcome: "harness-refused" } }, expect: true },
    { n: 1, kind: "C", says: "0026 read manifest.json at step 9", p: { predicate: "sent", args: { task: `${R}t-2026-09-25-0026`, step: 9, pointer: "/path", compare: "=", value: "manifest.json" } }, expect: true },
    { n: 1, kind: "C", says: "the identical call from step 10", p: { predicate: "sent", args: { task: `${R}t-2026-09-25-0026`, step: 10, pointer: "/path", compare: "=", value: "results/step-009-procedure-submit.json" } }, expect: true },
    { n: 1, kind: "N", says: "the two tasks ran under fingerprints 433bbb9878a7 and e189827ff35b" },
    { n: 1, kind: "I", says: "the refusal does not list the files that exist; the harness does not stop an identical repeat" },
    // 2 D4:4f5d gpt
    { n: 2, kind: "N", says: "evaluation.procedure was requested after its submission failed" },
    // 3 D4:a016 claude
    { n: 3, kind: "C", says: "the refusal names abort entry 1", p: { predicate: "refused-with", args: { task: `${R}t-2026-09-25-0017`, step: 10, phrase: "data/abort/1/threshold" } }, expect: true },
    { n: 3, kind: "C", says: "entry 0 passes (not named)", p: { predicate: "refused-with", args: { task: `${R}t-2026-09-25-0017`, step: 10, phrase: "data/abort/0/threshold" } }, expect: false },
    { n: 3, kind: "C", says: "step 8 also names data/occupancy", fixed: "first read at 0067 step 8; the step is 0017's", p: { predicate: "refused-with", args: { task: `${R}t-2026-09-25-0017`, step: 8, phrase: "data/occupancy" } }, expect: true },
    { n: 3, kind: "N", says: "7 times in 2 tasks" },
    { n: 3, kind: "I", says: "the model left the threshold off on entries that have no natural number (inferred, said so)" },
    // 4 D4:a016 gpt
    { n: 4, kind: "N", says: "the thresholds were encoded as non-numeric values (what was sent is not kept)" },
    // 5 D4:d77a repository claude
    { n: 5, kind: "N", says: "completion = 1024 tokens at 0003 step 5, 0002 step 3, 0005 step 10" },
    { n: 5, kind: "C", says: "0002 step 3 was cut", p: { predicate: "outcome-at", args: { task: `${R}t-2026-09-23-0002`, step: 3, outcome: "cut" } }, expect: true },
    { n: 5, kind: "C", says: "0005 step 10 was cut", p: { predicate: "outcome-at", args: { task: `${R}t-2026-09-23-0005`, step: 10, outcome: "cut" } }, expect: true },
    { n: 5, kind: "I", says: "the refusal words describe the truncated draft" },
    // 6 D4:d77a repository gpt
    { n: 6, kind: "N", says: "a later 1,217-token procedure.submit call was accepted" },
    // 7 D4:e694 claude
    { n: 7, kind: "C", says: "24-0019 refused at step 14", p: { predicate: "outcome-at", args: { task: `${R}t-2026-09-24-0019`, step: 14, outcome: "harness-refused" } }, expect: true },
    { n: 7, kind: "C", says: "24-0019 refused at step 15", p: { predicate: "outcome-at", args: { task: `${R}t-2026-09-24-0019`, step: 15, outcome: "harness-refused" } }, expect: true },
    { n: 7, kind: "C", says: "24-0019 refused at step 18", p: { predicate: "outcome-at", args: { task: `${R}t-2026-09-24-0019`, step: 18, outcome: "harness-refused" } }, expect: true },
    { n: 7, kind: "N", says: "the tools were not shown in detail (toolsDetailed false); 23-0004 and 23-0005 hit the neighbouring form" },
    // 8 D4:e694 gpt
    { n: 8, kind: "N", says: "five calls failed the validation" },
    // 9 D7 claude
    { n: 9, kind: "C", says: "the tasks cited test.maxMinutesCeiling", p: { predicate: "sent", args: { task: `${R}t-2026-09-28-0005`, step: 10, pointer: "/justifications", compare: "contains", value: "test.maxMinutesCeiling" } }, expect: true },
    { n: 9, kind: "C", says: "the tasks cited scrubber.minimumSpeedElevated", p: { predicate: "sent", args: { task: `${R}t-2026-09-28-0005`, step: 10, pointer: "/justifications", compare: "contains", value: "scrubber.minimumSpeedElevated" } }, expect: true },
    { n: 9, kind: "C", says: "the same refusals carried a reference of two ids", fixed: "first read at step 10; the refusals of 0005 that carry it are steps 8 and 9", p: { predicate: "refused-with", args: { task: `${R}t-2026-09-28-0005`, step: 9, rule: "REFERENCE_NOT_A_FACT" } }, expect: true },
    { n: 9, kind: "C", says: "neither document had been signed then", p: { predicate: "signed", args: { document: "commissioning-test-safety", at: `${R}t-2026-09-28-0005` } }, expect: false },
    { n: 9, kind: "N", says: "signed by Guillaume Pelletier at 2026-09-28T14:04Z and 2026-09-29T10:17Z" },
    // 10 D7 gpt: covered
    // 11 D8:f695 claude
    { n: 11, kind: "C", says: "the refusal at step 4 named the co2 abort", p: { predicate: "refused-with", args: { task: `${R}t-2026-09-23-0002`, step: 4, phrase: "co2" } }, expect: true },
    { n: 11, kind: "N", says: "it gave up after 9 refusals; tried several formats of when (not kept)" },
    // 12 D8:f695 gpt: covered
    // 13 D1:97a3 claude
    { n: 13, kind: "C", says: "the schema described quantities as 'What the test measures.'", p: { predicate: "stated-at", args: { file: "specs/procedure/procedure.schema.json", pointer: "/properties/quantities/description", phrase: "What the test measures", at: "exp6-contract/t-2026-09-30-0008" } }, expect: true },
    { n: 13, kind: "C", says: "the model sent quantity Speed", p: { predicate: "sent", args: { task: "exp6-contract/t-2026-09-30-0008", step: 10, pointer: "/quantities", compare: "contains", value: "Speed" } }, expect: true },
    { n: 13, kind: "C", says: "refused with UNKNOWN_UNIT", p: { predicate: "refused-with", args: { task: "exp6-contract/t-2026-09-30-0008", step: 10, rule: "UNKNOWN_UNIT" } }, expect: true },
    { n: 13, kind: "C", says: "the refusal listed knots among Speed's units", fixed: "first read as the word knots; the refusal says [kn_i] (knot)", p: { predicate: "refused-with", args: { task: "exp6-contract/t-2026-09-30-0008", step: 10, phrase: "(knot)" } }, expect: true },
    { n: 13, kind: "C", says: "the same form hit exp-learn 0009 step 17", p: { predicate: "refused-with", args: { task: "exp-learn/t-2026-09-29-0009", step: 17, rule: "UNKNOWN_UNIT" } }, expect: true },
    { n: 13, kind: "I", says: "the model was misled by a word in the property's name" },
    // 14 D1:97a3 gpt
    { n: 14, kind: "C", says: "the register accepts velocity units for Speed (m/s in the refusal)", p: { predicate: "refused-with", args: { task: "exp4-sonnet-a/t-2026-09-29-0014", step: 9, phrase: "m/s" } }, expect: true },
    // 15 D1:ec5a claude
    { n: 15, kind: "C", says: "the refusal names test.speedFloorPercent = 30 percent", p: { predicate: "refused-with", args: { task: "exp3-baseline/t-2026-09-29-0002", step: 8, phrase: "test.speedFloorPercent = 30 percent" } }, expect: true },
    { n: 15, kind: "C", says: "the guard answers 'is not a fact of the library'", p: { predicate: "refused-with", args: { task: "exp3-baseline/t-2026-09-29-0002", step: 8, phrase: "is not a fact of the library" } }, expect: true },
    { n: 15, kind: "C", says: "the model corrected itself on the next try", p: { predicate: "outcome-at", args: { task: "exp3-baseline/t-2026-09-29-0002", step: 9, outcome: "accepted" } }, expect: true },
    { n: 15, kind: "C", says: "the safety card said to cite 'the fact's id as its reference'", fixed: "first read without the backquotes the card puts around reference", p: { predicate: "stated-at", args: { file: "docs/library/commissioning-test-safety.md", phrase: "the fact's id as its `reference`", at: "exp3-baseline/t-2026-09-29-0002" } }, expect: true },
    { n: 15, kind: "I", says: "that wording is misleading" },
    // 16 D1:ec5a gpt
    { n: 16, kind: "C", says: "the correction retained the value 40", p: { predicate: "sent", args: { task: "exp3-baseline/t-2026-09-29-0002", step: 9, pointer: "/justifications/[constant=limits.minSpeedPercent]/value", compare: "=", value: 40 } }, expect: true },
    { n: 16, kind: "C", says: "and changed only the reference to test.speedFloorPercent", p: { predicate: "sent", args: { task: "exp3-baseline/t-2026-09-29-0002", step: 9, pointer: "/justifications/[constant=limits.minSpeedPercent]/reference", compare: "=", value: "test.speedFloorPercent" } }, expect: true },
    // 17 D2:0ed9 claude
    { n: 17, kind: "C", says: "the model narrowed the reference to the one id at the first retry", p: { predicate: "sent", args: { task: "exp-learn/t-2026-09-29-0001", step: 10, pointer: "/justifications/[constant=steps.2.speedPercent]/reference", compare: "=", value: "test.speedFloorPercent" } }, expect: true },
    { n: 17, kind: "I", says: "its refusal was true" },
    // 18 D2:0ed9 gpt: covered
    // 19 D2:8cba claude
    { n: 19, kind: "C", says: "exp4-sonnet-a t-0008 step 9 joined test.speedFloorPercent with scrubber.effectiveFlowAtFull", p: { predicate: "sent", args: { task: "exp4-sonnet-a/t-2026-09-29-0008", step: 9, pointer: "/justifications/[constant=steps.1.speedPercent]/reference", compare: "contains", value: "scrubber.effectiveFlowAtFull" } }, expect: true },
    { n: 19, kind: "C", says: "replaced the value 100 with 30 (under steps.1)", p: { predicate: "sent", args: { task: T10, step: 9, pointer: "/justifications/[constant=steps.1.speedPercent]/value", compare: "=", value: 30 } }, expect: true },
    { n: 19, kind: "I", says: "the refusal's own words were true" },
    // 20 D2:8cba gpt
    { n: 20, kind: "C", says: "the speed was changed from 100 to 30 (under steps.1)", p: { predicate: "sent", args: { task: T10, step: 9, pointer: "/justifications/[constant=steps.1.speedPercent]/value", compare: "=", value: 30 } }, expect: true },
    { n: 20, kind: "I", says: "unnecessarily (the decay kept 100 under steps.2: a renumbering)" },
    // 21 D2:dc0b claude
    { n: 21, kind: "C", says: "sent steps.2.minutes = 30", p: { predicate: "sent", args: { task: T10, step: 8, pointer: "/steps/[n=2]/minutes", compare: "=", value: 30 } }, expect: true },
    { n: 21, kind: "C", says: "the refusal said steps.2.minutes has no justification", p: { predicate: "refused-with", args: { task: T10, step: 8, phrase: "steps.2.minutes = 30 has no justification" } }, fixed: "first read with the words of another refusal (is a safety constant with no justification)", expect: true },
    { n: 21, kind: "C", says: "on the retry steps.1.minutes justified at 25", p: { predicate: "sent", args: { task: T10, step: 9, pointer: "/justifications/[constant=steps.1.minutes]/value", compare: "=", value: 25 } }, expect: true },
    { n: 21, kind: "C", says: "and steps.2.minutes added", p: { predicate: "sent", args: { task: T10, step: 9, pointer: "/justifications/[constant=steps.2.minutes]", compare: "present" } }, expect: true },
    { n: 21, kind: "C", says: "the path-keying rule is already in what the model reads", p: { predicate: "stated-at", args: { rule: "path-keys", at: T10 } }, expect: true },
    // 22 D2:dc0b gpt
    { n: 22, kind: "C", says: "the models repaired the justification value", p: { predicate: "sent", args: { task: T10, step: 9, pointer: "/justifications/[constant=steps.1.minutes]/value", compare: "=", value: 25 } }, expect: true },
    // 23 D3 claude
    { n: 23, kind: "N", says: "gpt refused in 0 of 10 cases, sonnet in 6 of 10: the lead's own counts (D3 compares the same cases); no predicate restricts a rate to the same cases", fixed: "first read as rates over the whole corpus (23 of 70 for sonnet)" },
    // 25 D4:4673 claude
    { n: 25, kind: "C", says: "at step 10 library.read commissioning-test-safety completed", p: { predicate: "sent", args: { task: "exp-control/t-2026-09-29-0005", step: 10, pointer: "/id", compare: "=", value: "commissioning-test-safety" } }, expect: true },
    { n: 25, kind: "C", says: "the same call again at step 17", p: { predicate: "sent", args: { task: "exp-control/t-2026-09-29-0005", step: 17, pointer: "/id", compare: "=", value: "commissioning-test-safety" } }, expect: true },
    { n: 25, kind: "C", says: "step 14 refused", p: { predicate: "outcome-at", args: { task: "exp-control/t-2026-09-29-0005", step: 14, outcome: "harness-refused" } }, expect: true },
    { n: 25, kind: "C", says: "exp6 0004 the same pattern at step 15", p: { predicate: "outcome-at", args: { task: "exp6-contract/t-2026-09-30-0004", step: 15, outcome: "harness-refused" } }, expect: true },
    { n: 25, kind: "N", says: "three refusals on the same point ended the task" },
    // 27 D4:92b3 claude
    { n: 27, kind: "C", says: "the words of analyse say 'the evidence in the last test's record'", p: { predicate: "stated-at", args: { file: "specs/procedure/words.json", pointer: "/capabilities/analyse", phrase: "the evidence in the last test's record", at: "today" } }, expect: true },
    { n: 27, kind: "C", says: "exp7 0004: step 8 completed after the refusal", p: { predicate: "outcome-at", args: { task: "exp7-fixes/t-2026-09-30-0004", step: 8, outcome: "completed" } }, expect: true },
    { n: 27, kind: "N", says: "evidence in 7 tasks, changes in 5 of them" },
    // 29 D4:d77a claude
    { n: 29, kind: "C", says: "exp-learn 0009 step 16 cut", p: { predicate: "outcome-at", args: { task: "exp-learn/t-2026-09-29-0009", step: 16, outcome: "cut" } }, expect: true },
    { n: 29, kind: "C", says: "exp-control 0004 step 17 cut", p: { predicate: "outcome-at", args: { task: "exp-control/t-2026-09-29-0004", step: 17, outcome: "cut" } }, expect: true },
    { n: 29, kind: "N", says: "completion = 4096 at those steps; every task later ended with the contract held" },
    // 31 D5:8d5e claude
    { n: 31, kind: "C", says: "each cut labelled 'Provider proposed a capability outside the allowlist'", p: { predicate: "refused-with", args: { task: "exp-control/t-2026-09-29-0001", step: 8, phrase: "outside the allowlist" } }, expect: true },
    { n: 31, kind: "N", says: "the prompt has the same length at both versions (3501 chars); about 26 files changed" },
    // 32 D5:8d5e gpt
    { n: 32, kind: "C", says: "not exhaustion of the model's output-token limit", p: { predicate: "outcome-at", args: { task: "exp-control/t-2026-09-29-0001", step: 8, outcome: "cut" } }, expect: false },
    // 33 D5:c6d7 claude
    { n: 33, kind: "C", says: "the same form hit two exp-learn tasks before the change", p: { predicate: "same-form", args: { tasks: ["exp-learn/t-2026-09-29-0001", "exp-learn/t-2026-09-29-0002"], form: "$D5c6" } }, expect: true },
    { n: 33, kind: "I", says: "the rise from 2/9 to 5/6 is a coincidence" },
    // 35 D5:cecb claude
    { n: 35, kind: "N", says: "which of the changed slots did the work (said not isolated)" },
    // 37 D6 claude
    { n: 37, kind: "C", says: "two ids joined by ';'", p: { predicate: "sent", args: { task: "exp4-sonnet-a/t-2026-09-29-0001", step: 9, pointer: "/justifications/[constant=steps.2.speedPercent]/reference", compare: "contains", value: ";" } }, expect: true },
    { n: 37, kind: "C", says: "refused with REFERENCE_NOT_A_FACT", p: { predicate: "refused-with", args: { task: "exp4-sonnet-a/t-2026-09-29-0001", step: 9, rule: "REFERENCE_NOT_A_FACT" } }, expect: true },
    // 39 D8:bbec claude
    { n: 39, kind: "C", says: "the analysis listed a change to steps.2.minutes", p: { predicate: "sent", args: { task: "exp8-paths/t-2026-09-30-0004", step: 8, pointer: "/changes", compare: "contains", value: "steps.2.minutes" } }, expect: true },
    { n: 39, kind: "C", says: "and a change to the device", p: { predicate: "sent", args: { task: "exp8-paths/t-2026-09-30-0004", step: 8, pointer: "/changes", compare: "contains", value: "device" } }, expect: true },
    { n: 39, kind: "C", says: "at step 9 steps.2.minutes still 30", p: { predicate: "sent", args: { task: "exp8-paths/t-2026-09-30-0004", step: 9, pointer: "/steps/[n=2]/minutes", compare: "=", value: 30 } }, expect: true },
    { n: 39, kind: "C", says: "the texts said 'the procedure must change what it names'", p: { predicate: "stated-at", args: { file: "specs/procedure/words.json", phrase: "must change what it names", at: "exp8-paths/t-2026-09-30-0004" } }, expect: true },
];
