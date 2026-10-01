/**
 * The confidence in a lead's diagnoses (2026-10-01, docs/evaluateur.fr.md, E5.3), on diagnoses of D2:8cba194716f8 checked on the
 * evaluator's corpus: two models of different families that agree (the same class, the same currency, a node of both causes besides the
 * lead's form and tasks), one that disagrees, two of one family, one alone; what the harness confirmed, the alternatives ruled out, the tasks;
 * and while nothing is calibrated, every diagnosis goes to a person.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fromRepository } from "../lib/paths.js";
import { HarnessGraph } from "../lib/harness-graph.js";
import { evaluate } from "../lib/evaluator.js";
import { loadRegister } from "../lib/rules-register.js";
import { diagnosisAskedFor } from "../lib/diagnosis.js";
import { agreementOf, causeNodes, confidenceOf, diagnosisConfig, type Diagnosed, type DiagnosisConfig } from "../lib/confidence.js";
import { diagnosisCheck, diagnosisRecord, readingsOf, type Diagnosis, type DiagnosisPrediction } from "../harness/topics/diagnosis/index.js";
import { TOPIC_DEFINITIONS } from "../harness/core/runner.js";

const CORPUS = fromRepository("tests", "fixtures", "evaluator");
const T10 = "exp3-baseline/t-2026-09-29-0010";
const S8 = "exp4-sonnet-a/t-2026-09-29-0008";

const workshops = readdirSync(CORPUS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, dir: path.join(CORPUS, d.name), createdAt: (JSON.parse(readFileSync(path.join(CORPUS, d.name, "fork.json"), "utf8")) as { createdAt: string }).createdAt }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(({ name, dir }) => ({ name, dir }));
const g = new HarnessGraph(workshops, readingsOf(TOPIC_DEFINITIONS));
const lead = evaluate(g).findings.find((f) => f.id === "D2:8cba194716f8")!;
const asked = diagnosisAskedFor(g, lead, null);
const ctx = { registers: { procedure: loadRegister("procedure") } };
const p = (role: DiagnosisPrediction["role"], predicate: DiagnosisPrediction["predicate"], args: Record<string, unknown>, expect = true, alternative?: string): DiagnosisPrediction => ({ role, predicate, args, expect, ...(alternative ? { alternative } : {}) });

/** A diagnosis checked as the guard checks it, kept as the factory keeps it, made by a model. */
const diagnosed = (model: string, family: string, d: Omit<Diagnosis, "id" | "justifications">): Diagnosed => {
    const full = { id: asked.id, justifications: [], ...d };
    const { problems, results } = diagnosisCheck(full, asked, g, ctx);
    assert.deepEqual(problems, [], `${model}'s diagnosis is accepted`);
    return { taskId: `t-${model}`, model, family, record: diagnosisRecord(asked, full, results) as unknown as Diagnosed["record"] };
};

// One model reads the refusal and the renumbering; another, blind to it, reaches the same cause by the second task.
const sonnet = diagnosed("claude-sonnet-5-5", "claude", {
    verdict: "right",
    cause: "The reference named the right bound and a second fact; the refusal said it was no fact of the library, which was false.",
    class: "contract-gap",
    current: "closed",
    evidence: [`attempt:${T10}:8`, "rule:procedure:REFERENCE_NOT_A_FACT"],
    predictions: [
        p("cause", "refused-with", { task: T10, step: 8, phrase: "is not a fact of the library" }),
        p("current", "stated-at", { rule: "REFERENCE_NOT_A_FACT", at: "today" }),
        p("rules-out", "fact", { id: "test.speedFloorPercent", at: T10 }, true, "a fact the library did not hold"),
    ],
});
const gpt = diagnosed("gpt-5", "openai", {
    verdict: "right",
    cause: "Two facts joined in one reference were refused; the rule of one id was said nowhere then, and is said today.",
    class: "contract-gap",
    current: "closed",
    evidence: [`attempt:${S8}:9`],
    predictions: [
        p("cause", "refused-with", { task: S8, step: 9, rule: "REFERENCE_NOT_A_FACT" }),
        p("cause", "in-state", { task: S8, step: 9, pointer: "/hypothesis/safetyBounds/x/y" }),
        p("current", "stated-at", { rule: "REFERENCE_NOT_A_FACT", at: "today" }),
        p("rules-out", "stated-at", { rule: "REFERENCE_NOT_A_FACT", at: S8 }, false, "the model's own mistake"),
    ],
});
const contrary = diagnosed("gpt-5", "openai", {
    verdict: "wrong",
    cause: "The model did not follow a rule its texts stated.",
    class: "model-error",
    current: "closed",
    evidence: [`attempt:${T10}:8`],
    predictions: [p("cause", "refused-with", { task: T10, step: 8, rule: "REFERENCE_NOT_A_FACT" }), p("current", "stated-at", { rule: "REFERENCE_NOT_A_FACT", at: "today" }), p("rules-out", "outcome-at", { task: T10, step: 8, outcome: "cut" }, false, "a cut")],
});
const calibrated = (threshold: number): DiagnosisConfig => ({ ...diagnosisConfig(), calibrated: true, calibratedOn: "a test", threshold });

describe("the confidence in a lead's diagnoses", () => {
    it("agreement by nodes: the same class, the same currency, and a node of both causes besides the lead's form and tasks", () => {
        assert.deepEqual(causeNodes(sonnet.record), [`attempt:${T10}:8`, "rule:procedure:REFERENCE_NOT_A_FACT"]);
        // The refusal of the other task falls under the same rule: the rule's node is what both causes rest on.
        assert.ok(causeNodes(gpt.record).includes("rule:procedure:REFERENCE_NOT_A_FACT"));
        assert.deepEqual(agreementOf(sonnet.record, gpt.record), { agree: true, sameClass: true, sameCurrent: true, shared: ["rule:procedure:REFERENCE_NOT_A_FACT"] });
        assert.deepEqual(agreementOf(sonnet.record, contrary.record), { agree: false, sameClass: false, sameCurrent: true, shared: [`attempt:${T10}:8`, "rule:procedure:REFERENCE_NOT_A_FACT"] });
        // Both naming only what made the lead (its form, its tasks) is no agreement: they would both name them.
        const own = { ...sonnet.record, evidence: [lead.form!.id, `task:${T10}`], predictions: [] };
        assert.deepEqual(causeNodes(own), []);
        assert.equal(agreementOf(own, { ...gpt.record, evidence: [lead.form!.id], predictions: [] }).agree, false);
    });

    it("two families that agree: the parts weighed, no cap; and while nothing is calibrated, it goes to a person all the same", () => {
        const c = confidenceOf([sonnet, gpt], lead.tasks.length);
        assert.deepEqual(c.weighed.map((d) => d.model), ["claude-sonnet-5-5", "gpt-5"]);
        // Confirmed: 3 of 3, and 3 of 4 (an unknown confirms nothing); two alternatives ruled out of the saturation's two; 2 tasks of 2 + 5.
        assert.equal(c.parts.confirmed, (1 + 3 / 4) / 2);
        assert.equal(c.parts.ruledOut, 1);
        assert.equal(c.parts.sample, 2 / 7);
        assert.equal(c.parts.agreement, 1);
        assert.equal(c.raw, (7 / 8 + 1 + 2 / 7 + 1) / 4);
        assert.equal(c.cap, null);
        assert.equal(c.confidence, c.raw);
        assert.deepEqual([c.decision, c.why], ["person", "not calibrated yet: every diagnosis goes to a person"]);
        // Calibrated, at or above its threshold: to the recommendation factory; below it: to a person.
        assert.equal(confidenceOf([sonnet, gpt], 2, calibrated(0.7)).decision, "recommend");
        assert.deepEqual([confidenceOf([sonnet, gpt], 2, calibrated(0.8)).decision, confidenceOf([sonnet, gpt], 2, calibrated(0.8)).why], ["person", "below the threshold 0.8"]);
    });

    it("a disagreement caps the confidence and sends both to a person, whatever the threshold", () => {
        const c = confidenceOf([sonnet, contrary], 2, calibrated(0.1));
        assert.equal(c.agreement?.agree, false);
        assert.deepEqual(c.cap, { why: "disagreement", at: 0.5 });
        assert.ok(c.confidence <= 0.5);
        assert.deepEqual([c.decision, c.why], ["person", "two models disagree: both diagnoses go to a person"]);
    });

    it("one diagnosis alone, the same model twice, or two models of one family: capped, the agreement of two families missing", () => {
        const alone = confidenceOf([sonnet], 2, calibrated(0.1));
        assert.deepEqual([alone.weighed.length, alone.agreement, alone.parts.agreement, alone.cap], [1, null, null, { why: "single", at: 0.7 }]);
        assert.equal(alone.raw, (1 + 0.5 + 2 / 7) / 3, "without the agreement's part");
        const twice = confidenceOf([sonnet, { ...sonnet, taskId: "t-again" }], 2);
        assert.deepEqual([twice.weighed.length, twice.cap?.why], [1, "single"], "a model that diagnosed twice is counted once");
        const opus = { ...gpt, model: "claude-opus-5-5", family: "claude" };
        assert.deepEqual(confidenceOf([sonnet, opus], 2).cap, { why: "sameFamily", at: 0.7 });
        // Of three, two of different families are weighed.
        assert.deepEqual(confidenceOf([sonnet, opus, gpt], 2).weighed.map((d) => d.model), ["claude-sonnet-5-5", "gpt-5"]);
    });

    it("the weights and the threshold are the file's, not the code's: not calibrated, no threshold", () => {
        const cfg = diagnosisConfig();
        assert.deepEqual([cfg.calibrated, cfg.threshold], [false, null]);
        assert.throws(() => confidenceOf([], 2), /no diagnosis to weigh/);
    });
});
