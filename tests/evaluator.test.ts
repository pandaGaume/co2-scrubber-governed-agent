/**
 * The post-procedure evaluator (2026-09-30, docs/evaluateur.fr.md, E1 and E2), on its corpus: the real tasks of the experiments of
 * 29 and 30 September (tests/fixtures/evaluator, copied from their forks by scripts/evaluator/corpus.mjs), which a human and a model
 * read by hand for two days. The evaluator must reach the same conclusions alone, with the path that justifies each, and recommend
 * nothing on a model's own mistake. With the register of the guard's rules (E2), it says which rule no text a task was given stated,
 * and what the memory's entry really is. What it cannot settle is said.
 *
 * Whether a task was told a rule is read from the contract at the commit it ran under (git): the assertions that need a text of
 * before to be found there are made only when git holds those commits.
 *
 * One case is reconstituted: the example `/steps/0/reason` in workspace.read's description, whose fork was removed with its traces.
 * Its texts are the real ones (git, 287f5bc and 86e03ab, the example put back as the README of 2026-09-30-fixes tells it); its tasks
 * are written here from that account, and say so.
 *
 *     node --test dist/tests/
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { H, HarnessGraph, harnessShapeOf } from "../lib/harness-graph.js";
import { correctionSignature, evaluate, type Finding } from "../lib/evaluator.js";
import { fromRepository } from "../lib/paths.js";
import { guardWordsOf } from "../lib/working-memory.js";
import { loadRegister } from "../lib/rules-register.js";
import { PROCEDURE_TOPIC } from "../harness/topics/procedure/index.js";
import { signDocument } from "../harness/lib/signatures.js";

const READINGS = { procedure: { judges: PROCEDURE_TOPIC.judges ?? [], digest: PROCEDURE_TOPIC.digest, guardWords: guardWordsOf(fromRepository("specs", "procedure", "words.json")), register: loadRegister("procedure") } };
const CORPUS = fromRepository("tests", "fixtures", "evaluator");
const forks = readdirSync(CORPUS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, dir: path.join(CORPUS, d.name), createdAt: (JSON.parse(readFileSync(path.join(CORPUS, d.name, "fork.json"), "utf8")) as { createdAt: string }).createdAt }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
/** Whether git holds a commit: the files a change of fingerprint touched are read from it, which a shallow clone may not have. */
const known = (commit: string): boolean => {
    try {
        execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: fromRepository(), stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};

describe("the evaluator on its corpus: the tasks of 29 and 30 September, classed as they were by hand", () => {
    const g = new HarnessGraph(forks, READINGS);
    const e = evaluate(g);
    const of = (detector: Finding["detector"], shape: RegExp, cls?: Finding["class"]) => e.findings.filter((f) => f.detector === detector && shape.test(f.form?.shape ?? f.title) && (!cls || f.class === cls));
    const requestOf = (taskId: string) => String(g.get(taskId)?.bag?.requestedBy);

    it("reads 9 forks, 90 tasks once each (a task a fork inherited is the one it was made from), three models' worth of manifests", () => {
        assert.equal(forks.length, 9);
        assert.equal(e.counts.tasks, 90);
        assert.deepEqual(e.counts.models, { "claude-sonnet-5-5": 70, "gpt-5.6-sol": 20 });
    });

    it("the cut at 4096 tokens: an artefact of the harness (D4), 13 calls in 13 tasks; gone at the next fingerprint, where the model's profile changed (D5)", () => {
        const [cut] = of("D4", /^cut at the output limit$/);
        assert.equal(cut.class, "harness-artefact");
        assert.equal(cut.tasks.length, 13);
        assert.deepEqual(cut.evidence.capabilities, ["procedure.submit"]);
        const [gone] = of("D5", /^cut at the output limit$/, "improvement");
        assert.deepEqual([gone.evidence.before, gone.evidence.after].map((x) => (x as { withForm: number; tasks: number }).withForm), [5, 0]);
        if (known("13408813b64a8f96368b3b5c935cad78b061dc22") && known("4e3458b732ebb757929df0cfc9e36a8c010329a8")) assert.ok((gone.evidence.changed as Array<{ slot: string }>).some((c) => c.slot === "run:profiles/anthropic-sonnet.json"), JSON.stringify(gone.evidence.changed));
    });

    it("the composite reference: answered by narrowing it in 22 tasks at the first retry (D2), 6 of 10 under Sonnet and 0 of 10 under GPT on the same cases (D3): a gap of the contract; gone after the contract said it (D5)", () => {
        const [narrowed] = e.findings.filter((f) => f.detector === "D2" && f.evidence.signature === "reference:narrowed");
        assert.equal(narrowed.form?.shape, "justification: *: … is not a fact of the library");
        assert.equal(narrowed.class, "contract-gap");
        assert.equal(narrowed.settledBy, null);
        assert.equal(narrowed.tasks.length, 22);
        assert.equal(narrowed.evidence.firstRetryShare, 1);
        assert.equal((narrowed.evidence.example as { accepted: { reference: string } }).accepted.reference, "test.speedFloorPercent");
        const [divergence] = of("D3", /is not a fact of the library/);
        assert.deepEqual([divergence.evidence.frequent, divergence.evidence.rare], [
            { model: "claude-sonnet-5-5", rate: 0.6, tasks: 10 },
            { model: "gpt-5.6-sol", rate: 0, tasks: 10 },
        ]);
        const [fixed] = of("D5", /is not a fact of the library/, "improvement").filter((f) => (f.evidence.before as { withForm: number }).withForm === 6);
        assert.equal((fixed.evidence.after as { withForm: number }).withForm, 0);
        if (known("08a954e557281e4701ceb4ebb0f72da5a1fdee2c") && known("287f5bcc1d3be2439ee45d5107360f13349813d7")) assert.ok((fixed.evidence.changed as Array<{ slot: string }>).some((c) => c.slot === "file:specs/procedure/words.json"), JSON.stringify(fixed.evidence.changed));
    });

    it("the composite reference, by the register: REFERENCE_NOT_A_FACT refused at the first try of 16 tasks none of whose texts said a reference is one id alone (D1), stated since by the words and the justification's schema", () => {
        const [d1] = e.findings.filter((f) => f.detector === "D1" && f.evidence.code === "REFERENCE_NOT_A_FACT");
        assert.equal(d1.class, "contract-gap");
        // 16, not the 22 D2 counts: a task whose first submission the output limit cut had no first try on the contract.
        assert.equal(d1.evidence.untold, 16);
        assert.deepEqual(d1.evidence.missing, ["rule:procedure:REFERENCE_NOT_A_FACT"]);
        assert.deepEqual(d1.evidence.statedNow, ['specs/procedure/words.json /brief/safetyBounds: "which is the single fact to cite, by its id alone as the reference"', 'harness/core/justify.ts: "Exactly one: for library, one id as library.facts lists it"']);
        // D3's text read two ways was said to neither model.
        const [divergence] = of("D3", /is not a fact of the library/);
        assert.equal(divergence.settledBy, null);
        assert.deepEqual((divergence.evidence.register as { rules: string[] }).rules, ["REFERENCE_NOT_A_FACT"]);
    });

    it("the speed in percent declared a Speed: UNKNOWN_UNIT refused at the first try of 2 tasks whose schema did not say a property's quantity is the register's (D1), stated since", () => {
        const [d1] = e.findings.filter((f) => f.detector === "D1" && f.evidence.code === "UNKNOWN_UNIT");
        assert.equal(d1.class, "contract-gap");
        assert.equal(d1.evidence.untold, 2);
        assert.deepEqual(d1.evidence.statedNow, ['specs/procedure/procedure.schema.json /properties/quantities/description: "the quantity and the unit its register declares"']);
        assert.equal(e.unclassified.filter((u) => /for Speed/.test(u.shape)).length, 0);
    });

    it("the read loops: two tasks ended stuck on the harness's refusal of a repeated read, an artefact of the harness (D4), with the refused reads that made them", () => {
        const [loop] = e.findings.filter((f) => f.detector === "D4" && "loops" in f.evidence);
        assert.equal(loop.class, "harness-artefact");
        assert.deepEqual(loop.tasks.sort(), ["task:exp-control/t-2026-09-29-0005", "task:exp6-contract/t-2026-09-30-0004"]);
        assert.deepEqual((loop.evidence.loops as Record<string, number[]>)["task:exp6-contract/t-2026-09-30-0004"], [13, 15, 17]);
        assert.match(loop.form?.shape ?? "", /with the same input was the previous step/);
    });

    it("GPT's steps indexed from 0: a safety constant left without a justification, answered by adding it (D2); the rule was said, the path convention it assumes was not (D1): a gap of the contract", () => {
        const [added] = e.findings.filter((f) => f.detector === "D2" && f.evidence.signature === "added" && /is a safety constant with no justification/.test(f.form?.shape ?? ""));
        assert.ok(added.tasks.some((t) => requestOf(t) === "experiment validate v10" && /exp4-gpt-c/.test(t)), JSON.stringify(added.tasks));
        assert.deepEqual(Object.keys(added.models).sort(), ["claude-sonnet-5-5", "gpt-5.6-sol"]);
        assert.equal(added.class, "contract-gap");
        assert.equal(added.settledBy, null);
        const [d1] = e.findings.filter((f) => f.detector === "D1" && f.evidence.code === "SAFETY_UNJUSTIFIED");
        assert.deepEqual(d1.evidence.missing, ["convention:procedure:path-keys"]);
        assert.ok(d1.tasks.includes("task:exp4-gpt-c/t-2026-09-29-0016"));
    });

    it("v4, the analysis and the procedure at odds: the model's own mistake (D8), counted, nothing recommended on it", () => {
        const [v4] = of("D8", /the analysis says device changes/);
        assert.equal(v4.class, "model-error");
        assert.equal(v4.recommend, false);
        assert.equal(v4.evidence.requestedBy, "experiment validate v4");
        // The rule was said to it, and it read it: the mistake is its own (D1).
        if (known("43e1fe8")) {
            assert.equal(v4.settledBy, null);
            assert.deepEqual((v4.evidence.register as { told: number }).told, 1);
            // The form the analysis shares with v9 covers two causes, which the register tells apart: v9 was not given the path
            // convention, v4 was given everything.
            const [shared] = e.unclassified.filter((u) => /the analysis says \* changes/.test(u.shape));
            assert.deepEqual(shared.rules, ["ANALYSIS_NOT_APPLIED"]);
            assert.deepEqual(Object.fromEntries((shared.tasksTold ?? []).map((t) => [t.requestedBy, t.missing])), { "experiment validate v9": ["the convention path-keys"], "experiment validate v4": [] });
        }
        // Nothing recommended on the analysis at odds with its procedure, and nothing on v4 alone: what the harness did in the same
        // case (the read loop of exp6-contract) is recommended with the other loop like it, as the harness's.
        assert.equal(e.findings.filter((f) => f.recommend && /the analysis says/.test(f.form?.shape ?? "")).length, 0);
        assert.equal(e.findings.filter((f) => f.recommend && f.tasks.length && f.tasks.every((t) => requestOf(t) === "experiment validate v4")).length, 0);
    });

    it("what nobody had read: procedure.analyse refused by its schema in 7 tasks, and 22 reads refused as repeats in 16 (D4)", () => {
        const [schema] = of("D4", /^Invalid capability arguments: data\/evidence must be array$/);
        assert.equal(schema.tasks.length, 7);
        assert.deepEqual(schema.evidence.capabilities, ["procedure.analyse"]);
        const [repeats] = of("D4", /with the same input was the previous step/);
        assert.deepEqual([repeats.evidence.refusals, repeats.tasks.length], [22, 16]);
    });

    it("the memory's entry, what it really is: it compensates REFERENCE_NOT_A_FACT, which no text its failures were given stated, and the contract states it now (D6)", () => {
        const [d6] = e.findings.filter((f) => f.detector === "D6");
        assert.equal(d6.class, "contract-gap");
        assert.deepEqual(d6.evidence.rules, ["REFERENCE_NOT_A_FACT"]);
        assert.equal(d6.evidence.entry, "m-e26243b3d5");
        assert.equal((d6.evidence.statedNow as string[]).length, 2);
        assert.match(d6.title, /learned instead of written; stated since.*the entry is now redundant/);
        assert.deepEqual(d6.tasks.sort(), ["task:exp4-sonnet-a/t-2026-09-29-0001", "task:exp4-sonnet-a/t-2026-09-29-0002"]);
    });

    it("what a cut submission left: an empty expected, refused on the revise sent after the 4096-token limit cut the submission, at no first try on the contract (the real run of the factory found it, 2026-10-01)", () => {
        assert.equal(e.findings.filter((f) => f.evidence.code === "expected").length, 0);
        const [expected] = e.unclassified.filter((u) => /expected says nothing/.test(u.shape));
        assert.deepEqual(expected.rules, ["expected"]);
        assert.deepEqual((expected.tasksTold ?? []).map((t) => t.firstTry), [false, false]);
    });

    it("derived only: the same sources give the same findings", () => {
        assert.deepEqual(evaluate(new HarnessGraph(forks, READINGS)).findings.map((f) => f.id), e.findings.map((f) => f.id));
    });
});

describe("the example that primed Sonnet (reconstituted: the fork was removed, its traces lost)", () => {
    const workshop = mkdtempSync(path.join(tmpdir(), "evaluator-primed-"));
    after(() => rmSync(workshop, { recursive: true, force: true }));
    const sha = (t: string) => createHash("sha256").update(t).digest("hex");
    // workspace.read's description and schema as a model read them: before the pointer (287f5bc), with the example that primed
    // (the pointer of 86e03ab, its example as it first was), and with the example that replaced it (86e03ab).
    const read = (pointer: string | null) => {
        const description = pointer
            ? "The content of one file of the task, as text (or base64 for a binary), with its size and sha256; or, with pointer, one field of a JSON file (its value). 256 KB at most per read; a bigger file is refused with its size."
            : "The content of one file of the task, as text (or base64 for a binary), with its size and sha256. 256 KB at most per read; a bigger file is refused with its size.";
        const inputSchema = { type: "object", properties: { taskId: { type: "string", description: "the task" }, path: { type: "string", description: "a path relative to the task's directory" }, ...(pointer ? { pointer: { type: "string", description: `one field of a JSON file, by a JSON Pointer (${pointer}; ~1 for a slash in a key): its value alone, for a detail of a file whose whole the state does not show` } } : {}) } };
        const statement = { id: "workspace.read", description, inputSchema };
        return { sha: sha(JSON.stringify(statement)), statement };
    };
    const versions = [read(null), read("/steps/0/reason"), read("/field/subfield")];
    mkdirSync(path.join(workshop, "_statements"), { recursive: true });
    for (const v of versions) writeFileSync(path.join(workshop, "_statements", `${v.sha}.json`), JSON.stringify({ kind: "tool", ...v.statement }));
    const refusal = 'procedure refused: justification: steps.2.speedPercent = 100 is a safety constant with no justification (a justification names it by its path, constant "steps.2.speedPercent"): cite the fact of a signed library document it respects (source "library", the fact\'s id as reference); the signed rules bound it by test.speedFloorPercent = 30 percent (at or above it): cite it (source "library", reference "test.speedFloorPercent")';
    const justification = (at: string) => ({ constant: at, value: at.endsWith("1.speedPercent") ? 30 : 100, source: "library", reference: "test.speedFloorPercent" });
    let k = 0;
    // Three tasks under each version; under the example, Sonnet named steps.0 and steps.1 in all three, and two were refused.
    versions.forEach((v, i) => {
        for (let j = 0; j < 3; j++) {
            const id = `t-2026-09-30-${String(++k).padStart(4, "0")}`;
            const primed = i === 1;
            const refused = primed && j < 2;
            const named = primed ? ["steps.0.speedPercent", "steps.1.speedPercent"] : ["steps.1.speedPercent", "steps.2.speedPercent"];
            const steps = [
                { n: 1, capability: "workspace.read", input: {}, outcome: "completed", reason: null },
                { n: 2, capability: "procedure.submit", input: { justifications: named.map(justification) }, outcome: refused ? "refused" : "completed", judged: refused ? "refused" : "accepted", reason: refused ? refusal : null },
                ...(refused ? [{ n: 3, capability: "procedure.revise", input: { changes: {}, justifications: ["steps.1.speedPercent", "steps.2.speedPercent"].map(justification) }, outcome: "completed", judged: "accepted", reason: null }] : []),
            ];
            mkdirSync(path.join(workshop, id), { recursive: true });
            writeFileSync(
                path.join(workshop, id, "manifest.json"),
                JSON.stringify({
                    note: "reconstituted from docs/experiments/2026-09-30-fixes/README.md: the traces of this run were lost with its fork",
                    taskId: id,
                    topic: "procedure",
                    state: "proposed",
                    startedAt: `2026-09-30T1${i}:${String(10 * j).padStart(2, "0")}:00Z`,
                    ended: "contract held",
                    provider: { name: "reasoner:claude", model: "claude-sonnet-5-5", family: "claude" },
                    tools: { sha256: `v${i}`, contract: `contract-${v.sha}`, list: [{ id: "procedure.submit", sha256: "submit" }, { id: "workspace.read", sha256: v.sha }] },
                    words: { file: "specs/procedure/words.json", sha256: "words" },
                    prompt: { file: "specs/procedure/prompt.md", sha256: "prompt" },
                    steps,
                }),
            );
            writeFileSync(path.join(workshop, id, "task.json"), JSON.stringify({ task: { requestedBy: `experiment validate v${j + 1}`, objective: { required_outputs: [] } } }));
        }
    });

    it("a regression after the fingerprint changed, and the text that changed named: workspace.read's description, its example kept in the store", () => {
        const e = evaluate(new HarnessGraph(workshop, READINGS));
        const d5 = e.findings.filter((f) => f.detector === "D5");
        const regression = d5.find((f) => f.class === "regression")!;
        assert.equal(regression.form?.shape, "justification: * = # is a safety constant with no justification: cite the fact of a signed library document it respects");
        assert.deepEqual([regression.evidence.before, regression.evidence.after].map((x) => (x as { withForm: number }).withForm), [0, 2]);
        const changed = regression.evidence.changed as Array<{ slot: string; stored: string | null; statement: string }>;
        assert.deepEqual(changed.map((c) => c.slot), ["tool:workspace.read"]);
        assert.match(readFileSync(path.join(workshop, changed[0].stored!), "utf8"), /\/steps\/0\/reason/);
        assert.equal(regression.recommend, true);
        // And the next fingerprint, the example replaced: the form gone, the same text named again.
        const improvement = d5.find((f) => f.class === "improvement")!;
        assert.deepEqual((improvement.evidence.changed as Array<{ slot: string }>).map((c) => c.slot), ["tool:workspace.read"]);
    });
});

describe("the evaluator's reading of a refusal and of a correction", () => {
    it("the harness's refusals by their form: a cut, a label and its first detail, ids and numbers out", () => {
        assert.equal(harnessShapeOf("TRUNCATED", "anything"), "cut at the output limit");
        assert.equal(harnessShapeOf("PRE_GUARD_REJECTED", "Invalid capability arguments: data/evidence must be array, data/changes must be array"), "Invalid capability arguments: data/evidence must be array");
        assert.equal(harnessShapeOf("PRE_GUARD_REJECTED", "library.read with the same input was the previous step, and completed: its answer is in the state"), "* with the same input was the previous step, and completed");
    });

    it("a correction by what it did, whatever the values: narrowed, added, removed, replaced", () => {
        assert.equal(correctionSignature({ refused: { value: 100, reference: "a.b; c.d 1 m3/min" }, accepted: { value: 100, reference: "a.b" } }), "reference:narrowed");
        assert.equal(correctionSignature({ refused: null, accepted: { value: 1 } }), "added");
        assert.equal(correctionSignature({ removed: true, refused: { quantity: "Speed" }, accepted: null }), "removed");
        assert.equal(correctionSignature({ refused: { value: 30, reference: "x" }, accepted: { value: 25, reference: "y" } }), "reference:replaced,value:replaced");
    });

    it("a manifest written before the judged mark: the guard's refusal told by its words, the harness's schema refusal left the harness's", () => {
        const workshop = mkdtempSync(path.join(tmpdir(), "evaluator-unmarked-"));
        try {
            mkdirSync(path.join(workshop, "t-2026-09-28-0001"));
            const steps = [
                { n: 1, capability: "procedure.submit", input: {}, outcome: "refused", reason: "Invalid capability arguments: data must have required property 'version'" },
                { n: 2, capability: "procedure.submit", input: {}, outcome: "refused", reason: "procedure refused: floor: steps.1.speedPercent = 0 stops the scrubber" },
                { n: 3, capability: "procedure.submit", input: {}, outcome: "completed", reason: null },
            ];
            writeFileSync(path.join(workshop, "t-2026-09-28-0001", "manifest.json"), JSON.stringify({ taskId: "t-2026-09-28-0001", topic: "procedure", startedAt: "2026-09-28T10:00:00Z", steps }));
            const g = new HarnessGraph(workshop, READINGS);
            assert.deepEqual(g.nodesOf(H.attempt).map((a) => a.bag?.outcome), ["PRE_GUARD_REJECTED", "GUARD_REJECTED", "ACCEPTED"]);
            assert.deepEqual(g.nodesOf(H.form).map((f) => `${f.bag?.by}: ${f.bag?.shape}`).sort(), ["guard: floor: * = # stops the scrubber", "harness: Invalid capability arguments: data must have required property 'version'"]);
        } finally {
            rmSync(workshop, { recursive: true, force: true });
        }
    });

    it("the graph holds the steps a harness refused outside the guard's capabilities, and the memory a state held", () => {
        const g = new HarnessGraph(forks.filter((f) => ["exp6-contract", "exp4-gpt-c"].includes(f.name)), READINGS);
        assert.ok(g.nodesOf(H.step).some((s) => s.bag?.capability === "workspace.read" && s.bag?.outcome === "PRE_GUARD_REJECTED"));
        const memory = g.nodesOf(H.statement).filter((s) => s.bag?.kind === "memory");
        assert.equal(memory.length, 1);
        assert.match(String(memory[0].bag?.text), /^In the justification of each safety constant, cite as reference only the bare id/);
    });
});

describe("a gap of the library closed once its documents are signed (D7)", () => {
    const workshop = mkdtempSync(path.join(tmpdir(), "evaluator-library-"));
    const sigDir = mkdtempSync(path.join(tmpdir(), "evaluator-signatures-"));
    const saved = process.env.LIBRARY_SIGNATURES_DIR;
    process.env.LIBRARY_SIGNATURES_DIR = sigDir;
    after(() => {
        if (saved === undefined) delete process.env.LIBRARY_SIGNATURES_DIR;
        else process.env.LIBRARY_SIGNATURES_DIR = saved;
        rmSync(workshop, { recursive: true, force: true });
        rmSync(sigDir, { recursive: true, force: true });
    });
    // Two tasks refused for citing a fact of a document nobody had signed, as Haiku's were on 28 September.
    for (const id of ["t-2026-09-28-0001", "t-2026-09-28-0002"]) {
        mkdirSync(path.join(workshop, id));
        const steps = [
            { n: 1, capability: "procedure.submit", input: {}, outcome: "refused", judged: "refused", reason: 'procedure refused: justification: steps.1.speedPercent: the fact scrubber.minimumSpeedElevated is in "scrubber-1-datasheet", which no person has signed as valid: cite instead a fact of a signed document that bounds this constant' },
            { n: 2, capability: "procedure.submit", input: {}, outcome: "completed", judged: "accepted", reason: null },
        ];
        writeFileSync(path.join(workshop, id, "manifest.json"), JSON.stringify({ taskId: id, topic: "procedure", startedAt: `2026-09-28T1${id.slice(-1)}:00:00Z`, provider: { model: "claude-haiku-4-5" }, steps }));
    }

    it("named by its refusals, recommended on while unsigned; signed since, nothing left to recommend", () => {
        const before = evaluate(new HarnessGraph(workshop, READINGS)).findings.find((f) => f.detector === "D7")!;
        assert.deepEqual([before.evidence.code, before.evidence.documents, before.recommend], ["FACT_UNSIGNED", ["scrubber-1-datasheet"], true]);
        signDocument("scrubber-1-datasheet", "signatory-test", { sigDir });
        const after = evaluate(new HarnessGraph(workshop, READINGS)).findings.find((f) => f.detector === "D7")!;
        assert.equal(after.recommend, false);
        assert.match(after.title, /signed since: nothing left to recommend/);
        assert.match(String((after.evidence.closedSince as string[])[0]), /^scrubber-1-datasheet signed by signatory-test at /);
    });
});
