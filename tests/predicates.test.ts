/**
 * The predictions of a diagnosis, checked by the harness (2026-10-01, docs/evaluateur.fr.md, E5.1): each predicate of the closed
 * language on the real tasks of the evaluator's corpus, where a label says what happened (D2:8cba194716f8, a composite reference and
 * a path renumbered; D4:d77a2a5a7508, Sonnet cut at the Anthropic wire's 4096; D5:c6d772db8922, a rate from 2 in 9 to 5 in 6), what
 * says unknown when the sources do not tell, and the form a prediction must have. The signatures are read from a directory of the
 * test's own, never the library's.
 *
 *     node --test dist/tests/
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { HarnessGraph } from "../lib/harness-graph.js";
import { guardWordsOf } from "../lib/working-memory.js";
import { loadRegister, textAt } from "../lib/rules-register.js";
import { evaluatePrediction, predictionProblems, stateSkeleton, type Prediction, type PredicateName } from "../lib/predicates.js";
import { fromRepository } from "../lib/paths.js";
import { digestOf, signDocument } from "../harness/lib/signatures.js";
import { PROCEDURE_TOPIC } from "../harness/topics/procedure/index.js";

const register = loadRegister("procedure");
const READINGS = { procedure: { judges: PROCEDURE_TOPIC.judges ?? [], digest: PROCEDURE_TOPIC.digest, guardWords: guardWordsOf(fromRepository("specs", "procedure", "words.json")), register } };
const graphOf = (corpus: string): HarnessGraph => {
    const dir = fromRepository("tests", "fixtures", corpus);
    const forks = readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({ name: d.name, dir: path.join(dir, d.name), createdAt: (JSON.parse(readFileSync(path.join(dir, d.name, "fork.json"), "utf8")) as { createdAt: string }).createdAt }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return new HarnessGraph(forks, READINGS);
};
const temp = mkdtempSync(path.join(tmpdir(), "predicates-"));
const sigDir = path.join(temp, "signatures");
mkdirSync(sigDir);
after(() => rmSync(temp, { recursive: true, force: true }));
const ctx = { registers: { procedure: register }, signaturesDir: sigDir };

const T10 = "exp3-baseline/t-2026-09-29-0010";
const LEARN1 = "exp-learn/t-2026-09-29-0001";
const p = (predicate: PredicateName, args: Record<string, unknown>): Prediction => ({ predicate, args });

describe("the predictions, on the evaluator's corpus", () => {
    const g = graphOf("evaluator");
    const check = (pr: Prediction) => evaluatePrediction(g, pr, ctx);

    it("sent: the decay justified under steps.1 at the refusal, under steps.2 at the retry, and steps.1 given the rise (D2:8cba, a renumbering, no speed changed)", () => {
        const before = check(p("sent", { task: T10, step: 8, pointer: "/justifications/[constant=steps.1.speedPercent]/value", compare: "=", value: 100 }));
        assert.equal(before.truth, "true");
        assert.deepEqual(before.nodes, [`task:${T10}`, `attempt:${T10}:8`]);
        assert.equal(check(p("sent", { task: T10, step: 8, pointer: "/justifications/[constant=steps.2.speedPercent]", compare: "absent" })).truth, "true");
        assert.equal(check(p("sent", { task: T10, step: 9, pointer: "/justifications/[constant=steps.2.speedPercent]/value", compare: "=", value: 100 })).truth, "true");
        assert.equal(check(p("sent", { task: T10, step: 9, pointer: "/justifications/[constant=steps.1.speedPercent]/value", compare: "=", value: 30 })).truth, "true");
        assert.equal(check(p("sent", { task: T10, step: 9, pointer: "/justifications/[constant=steps.1.speedPercent]/value", compare: "=", value: 100 })).truth, "false");
    });

    it("refused-with and fact: the refusal said the reference was not a fact, when it named a fact the library held at the task's version (the false message of D2:8cba)", () => {
        assert.equal(check(p("sent", { task: T10, step: 8, pointer: "/justifications/[constant=steps.1.speedPercent]/reference", compare: "contains", value: "test.speedFloorPercent" })).truth, "true");
        assert.equal(check(p("refused-with", { task: T10, step: 8, phrase: "is not a fact of the library" })).truth, "true");
        const rule = check(p("refused-with", { task: T10, step: 8, rule: "REFERENCE_NOT_A_FACT" }));
        assert.equal(rule.truth, "true");
        assert.ok(rule.nodes.includes("rule:procedure:REFERENCE_NOT_A_FACT"));
        assert.equal(check(p("refused-with", { task: T10, step: 8, rule: "INVALID_REFERENCE_CARDINALITY" })).truth, "false", "the code that says two facts came later");
        assert.equal(check(p("refused-with", { task: T10, step: 9, phrase: "not a fact" })).truth, "false", "step 9 was accepted");
        const fact = check(p("fact", { id: "test.speedFloorPercent", at: T10, compare: "=", value: 30 }));
        assert.equal(fact.truth, "true");
        assert.deepEqual(fact.read, ["docs/library/commissioning-test-safety.facts.json"]);
        assert.equal(check(p("fact", { id: "test.noSuchFact", at: "today" })).truth, "false");
        assert.equal(check(p("fact", { id: "test.noSuchFact", at: "today", compare: "absent" })).truth, "true");
    });

    it("stated-at: the one-id rule and the path convention said in none of the task's texts, and both said today", () => {
        const then = check(p("stated-at", { rule: "REFERENCE_NOT_A_FACT", at: T10 }));
        assert.equal(then.truth, "false");
        assert.ok(then.read.every((r) => r.endsWith("@4e3458b732ebb757929df0cfc9e36a8c010329a8")), "read at the fork's commit");
        assert.equal(check(p("stated-at", { rule: "REFERENCE_NOT_A_FACT", at: "today" })).truth, "true");
        assert.equal(check(p("stated-at", { rule: "path-keys", at: T10 })).truth, "false");
        assert.equal(check(p("stated-at", { rule: "path-keys", at: "today" })).truth, "true");
        assert.equal(check(p("stated-at", { file: "specs/procedure/procedure.schema.json", pointer: "/properties/steps/items/properties/n/description", phrase: "never by its position", at: "today" })).truth, "true");
        // A rule the register finds stated nowhere: false today too, never unknown.
        assert.equal(check(p("stated-at", { rule: "monitoring.occupied", at: "today" })).truth, "false");
        assert.equal(check(p("stated-at", { file: "../outside.txt", phrase: "x", at: "today" })).truth, "unknown", "only the texts of the contract");
    });

    it("outcome-at, preceded-by and run-setting: Sonnet's submission cut at 4096 tokens, the Anthropic wire's, its profile setting none (D4:d77a)", () => {
        assert.equal(check(p("outcome-at", { task: LEARN1, step: 8, outcome: "cut" })).truth, "true");
        assert.equal(check(p("preceded-by", { task: LEARN1, step: 9, outcome: "cut" })).truth, "true");
        assert.equal(check(p("preceded-by", { task: LEARN1, step: 9, outcome: "guard-refused" })).truth, "false");
        const limit = check(p("run-setting", { task: LEARN1, setting: "maxTokens", compare: "=", value: 4096 }));
        assert.equal(limit.truth, "true");
        assert.match(limit.observed, /profiles\/anthropic\.json sets none: the Anthropic wire's 4096/);
        assert.equal(check(p("run-setting", { task: LEARN1, setting: "maxTokens", compare: ">=", value: 8192 })).truth, "false");
        assert.equal(check(p("outcome-at", { task: "exp-learn/t-2026-09-29-0009", step: 14, outcome: "harness-refused" })).truth, "true");
        assert.equal(check(p("outcome-at", { task: T10, step: 8, outcome: "guard-refused" })).truth, "true");
        assert.equal(check(p("outcome-at", { task: T10, step: 1, outcome: "completed" })).truth, "true");
    });

    it("rate and same-form: the composite reference refused in 2 tasks of 9, then 5 of 6, under the two fingerprints D5 compares (D5:c6d7)", () => {
        const form = "form:procedure:33231b945eef";
        const before = check(p("rate", { form, model: "claude-sonnet-5-5", fingerprint: "fingerprint:6c3cf12c2da9", compare: "<", value: 0.25 }));
        assert.equal(before.truth, "true");
        assert.match(before.observed, /^2 of 9 tasks/);
        const afterIt = check(p("rate", { form, model: "claude-sonnet-5-5", fingerprint: "fingerprint:f6f379ac8445", compare: ">=", value: 0.8 }));
        assert.equal(afterIt.truth, "true");
        assert.match(afterIt.observed, /^5 of 6 tasks/);
        assert.equal(check(p("same-form", { tasks: [T10, "exp4-sonnet-a/t-2026-09-29-0008"], form })).truth, "true");
        assert.equal(check(p("same-form", { tasks: [T10, "exp4-sonnet-a/t-2026-09-29-0008", "exp8-paths/t-2026-09-30-0004"], form })).truth, "false");
    });

    it("in-state and read-before: what the model received at a step, and what it read before submitting", () => {
        const holds = check(p("in-state", { task: T10, step: 8, pointer: "/hypothesis/safetyBounds" }));
        assert.equal(holds.truth, "true");
        const absent = check(p("in-state", { task: T10, step: 8, pointer: "/history" }));
        assert.equal(absent.truth, "false");
        assert.match(absent.observed, /its fields: .*\/hypothesis/);
        assert.equal(check(p("in-state", { task: T10, step: 8, pointer: "/hypothesis/safetyBounds/x/y" })).truth, "unknown", "deeper than what is kept is unknown, not false");
        assert.equal(check(p("in-state", { task: T10, step: 1, pointer: "/hypothesis" })).truth, "unknown", "a step the harness decided: no model received anything");
        assert.equal(check(p("read-before", { task: T10, document: "method-concentration-decay" })).truth, "true");
        assert.equal(check(p("read-before", { task: T10, document: "commissioning-test-safety" })).truth, "false");
    });

    it("signed: today from the signature and the document as they are; at a task, only a signature made before it, binding the document as the task's version held it", () => {
        const doc = "commissioning-test-safety";
        const version = g.sourceOf(`task:${T10}`)!.version!;
        const then = digestOf(doc, (name) => textAt(version, `docs/library/${name}`))!;
        const sign = (signedAt: string, digest: string) => writeFileSync(path.join(sigDir, `${doc}.json`), JSON.stringify({ document: doc, digest, signedBy: "a person", signedAt, scope: "safety" }));
        sign("2026-09-29T10:00:00.000Z", then);
        assert.equal(check(p("signed", { document: doc, at: T10 })).truth, "true");
        sign("2026-09-29T10:00:00.000Z", "0".repeat(64));
        assert.equal(check(p("signed", { document: doc, at: T10 })).truth, "false", "signed, but another text than the task's");
        sign("2026-09-30T10:00:00.000Z", then);
        assert.equal(check(p("signed", { document: doc, at: T10 })).truth, "unknown", "signed after the task: an earlier signature would not be seen");
        rmSync(path.join(sigDir, `${doc}.json`));
        assert.equal(check(p("signed", { document: doc, at: T10 })).truth, "unknown");
        assert.equal(check(p("signed", { document: doc, at: "today" })).truth, "false");
    });
});

describe("the predictions, where the sources do not tell", () => {
    it("a task whose version is not known (the repository's workshop before E0): stated-at and fact unknown, never false", () => {
        const g = graphOf("evaluator-repository");
        const task = "snapshot-repository-workshop/t-2026-09-23-0002";
        assert.equal(evaluatePrediction(g, p("stated-at", { rule: "REFERENCE_NOT_A_FACT", at: task }), ctx).truth, "unknown");
        assert.equal(evaluatePrediction(g, p("fact", { id: "test.speedFloorPercent", at: task }), ctx).truth, "unknown");
        assert.equal(evaluatePrediction(g, p("outcome-at", { task: "no/such-task", step: 1, outcome: "cut" }), ctx).truth, "unknown");
    });

    it("a workshop of the test's own: the settings the manifest keeps (E5.0), and a document signed today then changed", () => {
        const workshop = path.join(temp, "workshop");
        mkdirSync(path.join(workshop, "t-2026-10-01-0001"), { recursive: true });
        writeFileSync(
            path.join(workshop, "t-2026-10-01-0001", "manifest.json"),
            JSON.stringify({ taskId: "t-2026-10-01-0001", topic: "procedure", startedAt: "2026-10-01T10:00:00Z", provider: { name: "reasoner:claude", model: "claude-sonnet-5-5", family: "claude", settings: { maxTokens: 8192, maxTokensParam: "max_tokens", reasoningEffort: null, temperature: null, timeoutMs: 120000 } }, steps: [{ n: 1, capability: "procedure.submit", input: {}, outcome: "completed", judged: "accepted", reason: null }] }),
        );
        const g = new HarnessGraph(workshop, READINGS);
        const check = (pr: Prediction) => evaluatePrediction(g, pr, ctx);
        assert.equal(check(p("run-setting", { task: "t-2026-10-01-0001", setting: "maxTokens", compare: "=", value: 8192 })).truth, "true");
        assert.match(check(p("run-setting", { task: "t-2026-10-01-0001", setting: "maxTokens", compare: "=", value: 8192 })).observed, /the manifest's settings/);
        assert.equal(check(p("run-setting", { task: "t-2026-10-01-0001", setting: "reasoningEffort", compare: "absent" })).truth, "true");

        const library = path.join(temp, "library");
        mkdirSync(library);
        writeFileSync(path.join(library, "a-document.md"), "# A document\n\nIt says one thing.\n");
        signDocument("a-document", "a person", { dir: library, sigDir });
        const today = { ...ctx, libraryDir: library };
        assert.equal(evaluatePrediction(g, p("signed", { document: "a-document", at: "today" }), today).truth, "true");
        writeFileSync(path.join(library, "a-document.md"), "# A document\n\nIt says another thing.\n");
        const changed = evaluatePrediction(g, p("signed", { document: "a-document", at: "today" }), today);
        assert.equal(changed.truth, "false");
        assert.match(changed.observed, /changed since/);
    });

    it("the skeleton of a state: its fields three levels deep, a list's elements as *", () => {
        assert.deepEqual(stateSkeleton({ a: { b: { c: { d: 1 } } }, l: [{ x: 1 }, { y: 2 }] }), ["/a", "/a/b", "/a/b/c", "/l", "/l/*", "/l/*/x", "/l/*/y"]);
    });
});

describe("the form of a prediction, before anything is evaluated", () => {
    it("a closed language: an unknown predicate or argument, a missing or mistyped one, refused with what is wrong", () => {
        assert.deepEqual(predictionProblems({ predicate: "agrees-with", args: {} }), [`unknown predicate "agrees-with" (one of outcome-at, preceded-by, sent, in-state, refused-with, stated-at, read-before, signed, fact, run-setting, rate, same-form)`]);
        assert.deepEqual(predictionProblems(p("outcome-at", { task: T10, step: 8, outcome: "refused", why: "x" })), ['outcome-at: unknown argument "why"', "outcome-at: outcome is one of cut, harness-refused, guard-refused, accepted, completed, failed"]);
        assert.deepEqual(predictionProblems(p("sent", { task: T10, step: 0, pointer: "justifications", compare: "=" })), ["sent: step is a step number, an integer from 1", 'sent: pointer is a JSON Pointer ("" or starting with /)', "sent: value is required with ="]);
        assert.deepEqual(predictionProblems(p("refused-with", { task: T10, step: 8, rule: "X", phrase: "y" })), ["refused-with: one of rule or phrase"]);
        assert.deepEqual(predictionProblems(p("stated-at", { at: "today" })), ["stated-at: a rule, or a file with its phrase"]);
        assert.deepEqual(predictionProblems(p("rate", { form: "f", compare: ">", value: 2 })), ["rate: value is a number between 0 and 1"]);
        assert.deepEqual(predictionProblems(p("same-form", { tasks: [T10], form: "f" })), []);
        const g = graphOf("evaluator");
        const r = evaluatePrediction(g, p("same-form", { tasks: [], form: "f" }), ctx);
        assert.equal(r.truth, "unknown");
        assert.match(r.observed, /^not a prediction the harness can check/);
    });
});
