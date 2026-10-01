/**
 * The evaluator's factory writes a recommendation, and its signature is asked of the role that signs (2026-10-01,
 * docs/evaluateur.fr.md, E3), on the real tasks of 29 and 30 September (tests/fixtures/evaluator, laid out as forks):
 *
 *   the station reads the findings of the forks together, asks the recommendation factory (its script) for one finding, gives it
 *   what the harness's graph says (the finding whole, the texts it may change with what they hold now, the memory entry); the
 *   factory's guard checks the recommendation against the finding and its target as it is now; the station checks it again, puts
 *   it on the library's proposals shelf, unsigned, and asks the role authorised-signatory to sign it. Nothing is applied: the
 *   contract and the memory are as they were. A finding recommended on already, or with nothing to recommend, is not asked again.
 *
 * And the guard alone, on what a model could send: an example a convention contradicts (the lesson of /steps/0/reason), a stale
 * current text, a target not offered, an em dash, a word in French, a kind the finding's class does not take, a change of what a
 * guard accepts not said as such, a verification that replays other cases or too few.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { taskDir } from "../slots/tools/lib/workshop.js";
import { fromRepository } from "../lib/paths.js";
import { HarnessGraph } from "../lib/harness-graph.js";
import { evaluate, type Finding } from "../lib/evaluator.js";
import { guardWordsOf } from "../lib/working-memory.js";
import { loadRegister } from "../lib/rules-register.js";
import { askedFor, recommendationIdOf } from "../lib/recommendation.js";
import { conventionProblems, recommendationProblems, textNow, type Proposal } from "../harness/topics/recommendation/index.js";
import { PROCEDURE_TOPIC } from "../harness/topics/procedure/index.js";

const PORT = 3197;
const CORPUS = fromRepository("tests", "fixtures", "evaluator");
const FORKS = readdirSync(CORPUS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

describe("the evaluator's factory writes a recommendation, and an authorised signatory is asked to sign it", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let operator: Broker;
    let forksDir = "";
    let recipesDir = "";
    const tasks: string[] = [];
    const ok = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const r = await operator.call(slot, tool, args);
        assert.ok(r.ok, `${slot}.${tool}: ${r.error}`);
        return r.output as T;
    };
    type Task = { state: string; run?: { ended?: string | null }; manifest?: { ended?: string | null; steps?: Array<{ capability?: string }>; proposal?: { status?: string } } };
    const ended = async (taskId: string, ms = 60_000): Promise<Task> => {
        const t0 = Date.now();
        for (;;) {
            const s = await ok<Task>("factory", "task", { taskId });
            if (s.run?.ended) return s;
            if (Date.now() - t0 > ms) throw new Error(`task ${taskId} did not end in ${ms} ms`);
            await new Promise((r) => setTimeout(r, 300));
        }
    };
    type Question = { id: string; kind: string; status: string; role: string | null; holders?: string[]; context: { document?: string; finding?: string; kind?: string } };
    const read = async <T>(uri: string): Promise<T> => JSON.parse((await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri })).contents[0].text) as T;
    const findings = async () => (await ok<{ findings: Finding[] }>("station", "harness_evaluate", { forks: FORKS })).findings;
    const recommend = async (finding: string) => {
        const r = await ok<{ taskId: string; recommendation: string }>("station", "recommend", { forks: FORKS, finding, builder: "scripted" });
        tasks.push(r.taskId);
        return { ...r, task: await ended(r.taskId) };
    };

    before(async () => {
        // The corpus as forks: each a fork's record and its workshop, where the station reads forks.
        forksDir = mkdtempSync(path.join(tmpdir(), "forks-recommendation-"));
        for (const f of FORKS) {
            mkdirSync(path.join(forksDir, f, "outputs"), { recursive: true });
            cpSync(path.join(CORPUS, f), path.join(forksDir, f, "outputs", "factory"), { recursive: true });
            cpSync(path.join(CORPUS, f, "fork.json"), path.join(forksDir, f, "fork.json"));
        }
        process.env.FORKS_DIR = forksDir;
        process.env.SPEECH_PROVIDER = "silent";
        process.env.BIOMED_PROVIDER = "simulated";
        recipesDir = mkdtempSync(path.join(tmpdir(), "recipes-recommendation-"));
        process.env.FACTORY_RECIPES_DIR = recipesDir;
        ({ broker: local, slots } = await startAllOrFail(PORT));
        operator = new Broker(local.httpBase, { name: "operator-test", version: "0", locale: "en" });
    });
    after(async () => {
        for (const k of ["FORKS_DIR", "SPEECH_PROVIDER", "BIOMED_PROVIDER", "FACTORY_RECIPES_DIR"]) delete process.env[k];
        await operator?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
        for (const t of tasks) rmSync(taskDir(t), { recursive: true, force: true });
        rmSync(recipesDir, { recursive: true, force: true });
        rmSync(forksDir, { recursive: true, force: true });
    });

    it("the memory entry Sonnet learned, a gap of the contract now closed: retire it; proposed unsigned, signed by the role, the memory untouched", async () => {
        const d6 = (await findings()).find((f) => f.detector === "D6")!;
        assert.ok(d6, "the evaluator's D6 finding");
        const memoryFile = path.join(forksDir, "exp4-sonnet-a", "outputs", "factory", "memory", "procedure.json");
        const memoryBefore = readFileSync(memoryFile, "utf8");
        const { recommendation: id, task } = await recommend(d6.id);
        assert.equal(id, recommendationIdOf(d6));
        assert.equal(task.state, "proposed", String(task.manifest?.ended ?? task.run?.ended));
        assert.deepEqual((task.manifest?.steps ?? []).map((s) => s.capability).filter((c) => c === "task.plan" || c === "recommendation.propose" || c === "task.done"), ["task.plan", "recommendation.propose", "task.done"]);
        assert.equal(task.manifest?.proposal?.status, "awaiting-signature");

        // On the proposals' shelf, unsigned: the page a person reads and the recommendation itself, the finding attached by the harness.
        const list = await ok<{ documents: Array<{ id: string; proposed: boolean; recommendation: boolean; signature: unknown }> }>("library", "list");
        const doc = list.documents.find((d) => d.id === id);
        assert.deepEqual([doc?.proposed, doc?.recommendation, doc?.signature], [true, true, null]);
        const review = await ok<{ files: Array<{ name: string; text: string }> }>("library", "review", { id });
        assert.deepEqual(review.files.map((f) => f.name), [`${id}.md`, `${id}.recommendation.json`]);
        assert.match(review.files[0].text, /It is not signed: it changes nothing until an authorised signatory reads it and signs it/);
        assert.match(review.files[0].text, /\*\*Kind:\*\* memory, \*\*action:\*\* retire, \*\*target:\*\* the memory entry `m-e26243b3d5`/);
        const record = JSON.parse(review.files[1].text) as { finding: { id: string; class: string; path: string[] }; kind: string; rule: { code: string } };
        assert.deepEqual([record.finding.id, record.finding.class, record.kind, record.rule.code], [d6.id, "contract-gap", "memory", "REFERENCE_NOT_A_FACT"]);
        assert.deepEqual(record.finding.path, d6.path, "the path is the evaluator's, not the model's");

        // The signature is asked of the role; Mother says where it is.
        const q = (await read<Question[]>("station://questions")).find((x) => x.kind === "sign" && x.status === "open" && x.context.document === id);
        assert.ok(q, "a sign question for the recommendation");
        assert.deepEqual([q.role, q.context.finding, q.context.kind], ["authorised-signatory", d6.id, "memory"]);
        const mother = await read<Array<{ key: string; text: { en: string } }>>("station://mother");
        assert.ok(mother.some((l) => l.key === "mother.recommendation.asked" && l.text.en.includes(id)));
        assert.ok(mother.some((l) => l.key === "mother.recommendation.proposed" && l.text.en.includes(`The recommendation ${id} is on the library's proposals shelf, unsigned: memory`)));
        await ok("station", "answer", { questionId: q.id, choice: "sign", by: "signatory-test", how: "script" });
        const signed = await ok<{ documents: Array<{ id: string; signature: { by: string; valid: boolean } | null }> }>("library", "list");
        assert.deepEqual([signed.documents.find((d) => d.id === id)?.signature?.by, signed.documents.find((d) => d.id === id)?.signature?.valid], ["signatory-test", true]);
        // Signed, it changes nothing yet: applied in a fork and measured (E4).
        assert.equal(readFileSync(memoryFile, "utf8"), memoryBefore);

        // Recommended on already: not asked again.
        const again = await operator.call("station", "recommend", { forks: FORKS, finding: d6.id, builder: "scripted" });
        assert.equal(again.ok, false);
        assert.match(String(again.error), /is recommended on already/);
    });

    it("a schema the harness refused calls by: what it asks added to the capability's description; the contract as it was", async () => {
        const analyse = (await findings()).find((f) => f.detector === "D4" && /data\/evidence must be array/.test(f.title))!;
        const words = readFileSync(fromRepository("specs", "procedure", "words.json"), "utf8");
        const { recommendation: id, task } = await recommend(analyse.id);
        assert.equal(task.state, "proposed", String(task.manifest?.ended ?? task.run?.ended));
        const review = await ok<{ files: Array<{ name: string; text: string }> }>("library", "review", { id });
        const record = JSON.parse(review.files[1].text) as Proposal;
        assert.deepEqual([record.kind, record.action, record.target.file, record.target.pointer], ["contract", "append", "specs/procedure/words.json", "/capabilities/analyse"]);
        assert.equal(record.current, textNow("specs/procedure/words.json", "/capabilities/analyse"));
        assert.equal(record.proposed, " In its arguments, evidence is an array, even of one element.");
        assert.ok(record.verification.tasks >= 5);
        assert.equal(readFileSync(fromRepository("specs", "procedure", "words.json"), "utf8"), words, "nothing applied");
    });

    it("a model's own mistake has nothing to recommend", async () => {
        const v4 = (await findings()).find((f) => f.detector === "D8")!;
        const r = await operator.call("station", "recommend", { forks: FORKS, finding: v4.id, builder: "scripted" });
        assert.equal(r.ok, false);
        assert.match(String(r.error), /has nothing to recommend/);
    });
});

describe("the recommendation's guard, on what a model could send", () => {
    const forks = FORKS.map((name) => ({ name, dir: path.join(CORPUS, name), createdAt: (JSON.parse(readFileSync(path.join(CORPUS, name, "fork.json"), "utf8")) as { createdAt: string }).createdAt })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const g = new HarnessGraph(forks, { procedure: { judges: PROCEDURE_TOPIC.judges ?? [], digest: PROCEDURE_TOPIC.digest, guardWords: guardWordsOf(fromRepository("specs", "procedure", "words.json")), register: loadRegister("procedure") } });
    const e = evaluate(g);
    const analyse = e.findings.find((f) => f.detector === "D4" && /data\/evidence must be array/.test(f.title))!;
    const asked = askedFor(g, analyse);
    const target = asked.targets.find((t) => t.pointer === "/capabilities/analyse")!;
    const good: Proposal = {
        id: asked.id,
        kind: "contract",
        target: { file: target.file, pointer: target.pointer },
        action: "append",
        current: textNow(target.file, target.pointer),
        proposed: " Its evidence and its changes are arrays, even of one element.",
        why: "the harness refused the analysis's arguments in 10 tasks",
        effect: "no refusal of the analysis's arguments",
        changesAcceptance: false,
        verification: { replay: asked.cases, models: asked.models, tasks: 5, measure: `${asked.measures[0]}: refusals per task` },
        justifications: [],
    };
    const problems = (p: Partial<Proposal>) => recommendationProblems({ ...good, ...p }, asked);

    it("what the graph gives the factory: the finding whole, the texts it may change with what they hold, the cases, the conventions", () => {
        assert.equal(asked.finding.id, analyse.id);
        assert.equal(asked.rule, null, "a refusal of the harness, no rule of the register");
        assert.deepEqual(asked.targets.map((t) => `${t.file} ${t.pointer ?? ""}`), ["specs/procedure/words.json /capabilities/analyse"]);
        assert.deepEqual(asked.measures, ["Invalid capability arguments: data/evidence must be array"]);
        assert.deepEqual(asked.conventions, [{ list: "steps", key: "n" }, { list: "abort", key: "id" }]);
        // Who asked does not tell these tasks apart (the first protocol's share one name for different requests): the cases are the tasks.
        assert.equal(asked.cases.length, analyse.tasks.length);
        assert.ok(asked.cases.includes("exp7-fixes/t-2026-09-30-0004"));
        assert.deepEqual(problems({}), []);
    });

    it("an example a convention contradicts is refused: an element named by its position, in a pointer or a path", () => {
        assert.match(problems({ proposed: " For example, read /steps/0/reason." }).join(" "), /names \/steps\/0, which the convention of steps contradicts/);
        assert.match(problems({ proposed: " As abort.0.threshold." }).join(" "), /names abort\.0, which the convention of abort contradicts: a path names an element of abort by its id/);
        assert.deepEqual(conventionProblems("steps.1.speedPercent and abort.co2.threshold", asked.conventions), []);
    });

    it("the target as it is now, one the state offers, changed by the text proposed", () => {
        assert.match(problems({ current: "what it said once" }).join(" "), /is not what it holds now/);
        assert.match(problems({ target: { file: "specs/procedure/words.json", pointer: "/intention" } }).join(" "), /is not one the state gives/);
        assert.match(problems({ action: "replace", proposed: String(good.current) }).join(" "), /the proposed text is the text .* holds already/);
    });

    it("in English, without an em dash; a kind the class takes; a change of what a guard accepts said as such", () => {
        assert.match(problems({ proposed: " Ses preuves sont une liste, même d'un élément." }).join(" "), /a text a model reads is written in English: the proposed text holds ê é/);
        assert.match(problems({ proposed: ` Its evidence is an array ${String.fromCharCode(0x2014)} even of one element.` }).join(" "), /holds an em dash/);
        assert.deepEqual(problems({ proposed: " Its evidence is an array since 2014, even of one element." }).filter((x) => /em dash/.test(x)), []);
        assert.match(problems({ kind: "memory" }).join(" "), /a finding of class harness-artefact takes a recommendation of kind contract, guard-message, guard-decision, not "memory"/);
        assert.match(problems({ changesAcceptance: true }).join(" "), /changesAcceptance true/);
        assert.deepEqual(problems({ kind: "guard-decision", changesAcceptance: true }).filter((x) => /changesAcceptance/.test(x)), []);
    });

    it("a library document signed already is not recommended for a signature", () => {
        const library = { ...asked, finding: { ...asked.finding, class: "library-gap" }, library: { documents: ["scrubber-1-datasheet"], signatures: { "scrubber-1-datasheet": { by: "signatory-test", at: "2026-09-28T14:04:18Z", valid: true } } } };
        const sign = { ...good, kind: "library" as const, target: { library: "scrubber-1-datasheet" }, action: "sign", current: null, proposed: "A person signs scrubber-1-datasheet." };
        assert.match(recommendationProblems(sign, library).join(" "), /the document scrubber-1-datasheet is signed already \(signatory-test, 2026-09-28T14:04:18Z\)/);
        const unsigned = { ...library, library: { documents: ["scrubber-1-datasheet"], signatures: { "scrubber-1-datasheet": null } } };
        assert.deepEqual(recommendationProblems(sign, unsigned).filter((x) => /signed already/.test(x)), []);
    });

    it("a verification that replays the finding's cases, five tasks at least, and measures what the finding is about", () => {
        assert.match(problems({ verification: { ...good.verification, replay: ["experiment validate v99"] } }).join(" "), /experiment validate v99 are not among them/);
        assert.match(problems({ verification: { ...good.verification, tasks: 2 } }).join(" "), /replays 2 task\(s\): 5 at least/);
        assert.match(problems({ verification: { ...good.verification, measure: "something else" } }).join(" "), /name Invalid capability arguments: data\/evidence must be array/);
    });
});
