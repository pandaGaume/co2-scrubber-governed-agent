/**
 * The diagnosis factory (2026-10-01, docs/evaluateur.fr.md, E5.2), on the real tasks of 29 and 30 September (tests/fixtures/evaluator):
 *
 *   the guard alone: a diagnosis of D2:8cba194716f8 as the labels give it (a composite reference refused with a false message, the
 *   decay renumbered from steps.1 to steps.2, both closed today) accepted, each prediction confirmed by the harness; the two errors
 *   of the first trials refused as refuted predictions (the refusal's message said true, the speed said unchanged at steps.1);
 *   a diagnosis of the wrong form refused before anything is run; a prediction the sources cannot settle kept as unknown;
 *
 *   the factory through the station, on its script: the station gives the lead read from the graph, the factory's guard runs the
 *   predictions, the station runs them again on its own graph and keeps the diagnosis; a lead diagnosed already is not asked again.
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
import { evaluate } from "../lib/evaluator.js";
import { loadRegister } from "../lib/rules-register.js";
import { diagnosisAskedFor, diagnosisIdOf } from "../lib/diagnosis.js";
import { DIAGNOSIS_TOPIC, diagnosisCheck, diagnosisRecord, readingsOf, type Diagnosis, type DiagnosisPrediction } from "../harness/topics/diagnosis/index.js";
import { compactOutput } from "../harness/core/compact.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import type { TaskFile } from "../harness/core/task.js";
import type { JsonValue } from "@spiky-panda/harness";
import { TOPIC_DEFINITIONS } from "../harness/core/runner.js";
import { loadDataset } from "../lib/diagnosis-dataset.js";
import { calibrationRows, diagnosesOfDataset, recheck } from "../lib/calibration.js";
import { loadLabels } from "../lib/evaluator-labels.js";

const PORT = 3211;
const CORPUS = fromRepository("tests", "fixtures", "evaluator");
const FORKS = readdirSync(CORPUS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
const T10 = "exp3-baseline/t-2026-09-29-0010";
const LEAD = "D2:8cba194716f8";

const graph = (): HarnessGraph => {
    const workshops = FORKS.map((name) => ({ name, dir: path.join(CORPUS, name), createdAt: (JSON.parse(readFileSync(path.join(CORPUS, name, "fork.json"), "utf8")) as { createdAt: string }).createdAt }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(({ name, dir }) => ({ name, dir }));
    return new HarnessGraph(workshops, readingsOf(TOPIC_DEFINITIONS));
};

describe("the diagnosis factory's guard, on the corpus", () => {
    const g = graph();
    const lead = evaluate(g).findings.find((f) => f.id === LEAD)!;
    const asked = diagnosisAskedFor(g, lead, null);
    const ctx = { registers: { procedure: loadRegister("procedure") } };
    const p = (role: DiagnosisPrediction["role"], predicate: DiagnosisPrediction["predicate"], args: Record<string, unknown>, expect = true, alternative?: string): DiagnosisPrediction => ({ role, predicate, args, expect, ...(alternative ? { alternative } : {}) });
    const right: Diagnosis = {
        id: asked.id,
        verdict: "right",
        cause: "The model cited the right bound and a second fact in one reference; the guard of the time answered that it was not a fact of the library, which was false. The same refusal showed the decay justified under steps.1 instead of steps.2, and the model renumbered at the retry: no speed changed.",
        class: "contract-gap",
        current: "closed",
        evidence: [lead.form!.id, `task:${T10}`, `attempt:${T10}:8`, `attempt:${T10}:9`],
        predictions: [
            p("cause", "refused-with", { task: T10, step: 8, phrase: "is not a fact of the library" }),
            p("cause", "sent", { task: T10, step: 8, pointer: "/justifications/[constant=steps.1.speedPercent]/reference", compare: "contains", value: "test.speedFloorPercent" }),
            p("cause", "sent", { task: T10, step: 9, pointer: "/justifications/[constant=steps.2.speedPercent]/value", compare: "=", value: 100 }),
            p("current", "stated-at", { rule: "REFERENCE_NOT_A_FACT", at: "today" }),
            p("current", "stated-at", { rule: "path-keys", at: "today" }),
            p("rules-out", "fact", { id: "test.speedFloorPercent", at: T10 }, true, "the reference named a fact the library did not hold"),
            p("rules-out", "stated-at", { rule: "REFERENCE_NOT_A_FACT", at: T10 }, false, "the model's own mistake: the rule was stated in what it read"),
        ],
        justifications: [],
    };

    it("what the factory is given: the lead whole, its tasks by id, the rule it touches stated today, its neighbourhood", () => {
        assert.equal(asked.id, diagnosisIdOf(lead));
        assert.deepEqual(asked.lead.tasks, [`task:${T10}`, "task:exp4-sonnet-a/t-2026-09-29-0008"]);
        assert.equal(asked.lead.form?.id, lead.form?.id);
        const rule = asked.rules.find((r) => r.code === "REFERENCE_NOT_A_FACT");
        assert.ok(rule && rule.statedToday.length && rule.statedToday.every((s) => s.holds), "stated today, where the register says");
        const ids = new Set(asked.neighbourhood.nodes.map((n) => n.split(" ")[0]));
        for (const id of [lead.form!.id, `task:${T10}`, "rule:procedure:REFERENCE_NOT_A_FACT"]) assert.ok(ids.has(id), id);
        assert.ok(asked.neighbourhood.links.every((l) => ids.has(l.split(" ")[0]) && ids.has(l.split(" ").at(-1)!)));
        assert.ok(asked.neighbourhood.nodes.length <= 50 && JSON.stringify(asked.neighbourhood).length < 20_000, "what a call carries of it");
    });

    it("the diagnosis the labels give, accepted: every prediction confirmed by the harness, the record counting them", () => {
        const { problems, results } = diagnosisCheck(right, asked, g, ctx);
        assert.deepEqual(problems, []);
        assert.deepEqual(results.map((r) => r?.truth), ["true", "true", "true", "true", "true", "true", "false"]);
        const record = diagnosisRecord(asked, right, results) as { lead: { id: string; path: string[] }; checked: { confirmed: number; unknown: number; alternativesRuledOut: string[]; byRole: Record<string, { confirmed: number; of: number }> } };
        assert.equal(record.lead.id, LEAD);
        assert.deepEqual(record.lead.path, lead.path, "the lead is the evaluator's, not the model's");
        assert.deepEqual([record.checked.confirmed, record.checked.unknown], [7, 0]);
        assert.deepEqual(record.checked.byRole["rules-out"], { confirmed: 2, of: 2 });
        assert.equal(record.checked.alternativesRuledOut.length, 2);
    });

    it("the errors of the first trials, refused as refuted predictions with what the harness observed", () => {
        // Sonnet: the refusal's message was true (it said the code that says two facts); GPT: the speed at steps.1 did not change.
        const wrong = { ...right, predictions: [...right.predictions, p("cause", "refused-with", { task: T10, step: 8, rule: "INVALID_REFERENCE_CARDINALITY" }), p("rules-out", "sent", { task: T10, step: 9, pointer: "/justifications/[constant=steps.1.speedPercent]/value", compare: "=", value: 100 }, true, "a renumbering")] };
        const { problems } = diagnosisCheck(wrong, asked, g, ctx);
        assert.equal(problems.length, 2);
        assert.match(problems[0], /^prediction 8 \(cause\) expected true, the harness observed false: the refusal at step 8 falls under REFERENCE_NOT_A_FACT/);
        assert.match(problems[1], /^prediction 9 \(rules-out, ruling out "a renumbering"\) expected true, the harness observed false: step 9 \(procedure\.revise\) sent 30/);
    });

    it("a diagnosis of the wrong form, refused before anything is run", () => {
        const bad = {
            ...right,
            class: "bug",
            evidence: ["task:no-such-task"],
            predictions: [
                p("cause", "same-form", { tasks: [T10], form: lead.form!.id }),
                p("current", "stated-at", { rule: "REFERENCE_NOT_A_FACT", at: T10 }),
                p("cause", "outcome-at", { task: T10, step: 8, outcome: "refused" }),
            ],
        };
        const { problems, results } = diagnosisCheck(bad, asked, g, ctx);
        assert.deepEqual(results, [null, null, null], "nothing run");
        assert.ok(problems.some((x) => x.startsWith("the class is one of contract-gap")));
        assert.ok(problems.includes("task:no-such-task is not a node of the harness's graph (diagnosis.graph reads it)"));
        assert.ok(problems.some((x) => x.startsWith("prediction 1 only repeats what made the lead")));
        assert.ok(problems.some((x) => x.startsWith('prediction 2 is on whether the cause holds today: give it at "today"')));
        assert.ok(problems.some((x) => x.startsWith("prediction 3: outcome-at: outcome is one of cut")));
        assert.ok(problems.some((x) => x.startsWith("the predictions miss a role")));
        const dash = diagnosisCheck({ ...right, cause: `the cause ${String.fromCharCode(0x2014)} in French: épurateur` }, asked, g, ctx).problems;
        assert.deepEqual(dash, ["the cause is read by a model next: write it in English (it holds é)", "the cause holds an em dash: use a comma, a colon or a semicolon"]);
    });

    it("a prediction the sources cannot settle is kept as unknown: it refutes nothing and confirms nothing", () => {
        const unsure = { ...right, predictions: [...right.predictions, p("cause", "in-state", { task: T10, step: 8, pointer: "/hypothesis/safetyBounds/a/b" })] };
        const { problems, results } = diagnosisCheck(unsure, asked, g, ctx);
        assert.deepEqual(problems, []);
        assert.equal(results.at(-1)?.truth, "unknown");
        const record = diagnosisRecord(asked, unsure, results) as { checked: { confirmed: number; unknown: number } };
        assert.deepEqual([record.checked.confirmed, record.checked.unknown], [7, 1]);
    });
});

describe("the diagnosis factory through the station, on its script", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let operator: Broker;
    let forksDir = "";
    let recipesDir = "";
    let datasetDir = "";
    const tasks: string[] = [];
    const ok = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const r = await operator.call(slot, tool, args);
        assert.ok(r.ok, `${slot}.${tool}: ${r.error}`);
        return r.output as T;
    };
    type Task = { state: string; run?: { ended?: string | null }; manifest?: { ended?: string | null; steps?: Array<{ capability?: string; reason?: string | null }>; artifacts?: Array<{ kind: string; path: string }>; proposal?: { status?: string } } };
    const ended = async (taskId: string, ms = 90_000): Promise<Task> => {
        const t0 = Date.now();
        for (;;) {
            const s = await ok<Task>("factory", "task", { taskId });
            if (s.run?.ended) return s;
            if (Date.now() - t0 > ms) throw new Error(`task ${taskId} did not end in ${ms} ms`);
            await new Promise((r) => setTimeout(r, 300));
        }
    };
    const read = async <T>(uri: string): Promise<T> => JSON.parse((await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri })).contents[0].text) as T;
    const diagnose = async (lead: string) => {
        const r = await ok<{ taskId: string; diagnosis: string }>("station", "diagnose", { forks: FORKS, lead, builder: "scripted" });
        tasks.push(r.taskId);
        return { ...r, task: await ended(r.taskId) };
    };

    before(async () => {
        forksDir = mkdtempSync(path.join(tmpdir(), "forks-diagnosis-"));
        for (const f of FORKS) {
            mkdirSync(path.join(forksDir, f, "outputs"), { recursive: true });
            cpSync(path.join(CORPUS, f), path.join(forksDir, f, "outputs", "factory"), { recursive: true });
            cpSync(path.join(CORPUS, f, "fork.json"), path.join(forksDir, f, "fork.json"));
        }
        process.env.FORKS_DIR = forksDir;
        process.env.SPEECH_PROVIDER = "silent";
        process.env.BIOMED_PROVIDER = "simulated";
        recipesDir = mkdtempSync(path.join(tmpdir(), "recipes-diagnosis-"));
        process.env.FACTORY_RECIPES_DIR = recipesDir;
        // What the diagnosis tasks record goes to a directory of the test's own, never the repository's dataset.
        datasetDir = mkdtempSync(path.join(tmpdir(), "dataset-diagnosis-"));
        process.env.DIAGNOSIS_DATASET_DIR = datasetDir;
        ({ broker: local, slots } = await startAllOrFail(PORT));
        operator = new Broker(local.httpBase, { name: "operator-test", version: "0", locale: "en" });
    });
    after(async () => {
        for (const k of ["FORKS_DIR", "SPEECH_PROVIDER", "BIOMED_PROVIDER", "FACTORY_RECIPES_DIR", "DIAGNOSIS_DATASET_DIR"]) delete process.env[k];
        await operator?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
        for (const t of tasks) rmSync(taskDir(t), { recursive: true, force: true });
        rmSync(recipesDir, { recursive: true, force: true });
        rmSync(datasetDir, { recursive: true, force: true });
        rmSync(forksDir, { recursive: true, force: true });
    });

    it("the read tools answer in pages the socle keeps whole: the refusal, one justification, a text around its words (E5.4: a step read whole showed only its beginning)", async () => {
        const g = graph();
        const asked = diagnosisAskedFor(g, evaluate(g).findings.find((f) => f.id === LEAD)!, FORKS);
        const context = { broker: operator, taskId: "t-reads", task: { objective: { required_outputs: [] }, observations: { diagnosis: asked } } as unknown as TaskFile["task"], progress: newProgress(), runtimeSlot: "twin" };
        const tools = new Map((DIAGNOSIS_TOPIC.local?.(context) ?? []).map((c) => [c.id, c]));
        const read = async (id: string, input: Record<string, unknown>) => {
            const r = await tools.get(id)!.execute(input as unknown as JsonValue, {} as never);
            assert.ok(r.ok, `${id} ${JSON.stringify(input)}: ${r.error}`);
            const c = compactOutput(id, input as unknown as JsonValue, r.output);
            assert.equal(c.reduced, false, `${id} ${JSON.stringify(input)}: ${c.bytes} characters, cut by the socle`);
            return (r.output as { value: Record<string, unknown> }).value;
        };
        const outline = await read("diagnosis.step", { task: `task:${T10}`, step: 8 });
        assert.equal(outline.outcome, "guard-refused");
        const reason = (await read("diagnosis.step", { task: `task:${T10}`, step: 8, part: "reason" })).reason as { text: string; next?: number };
        assert.match(reason.text, /is not a fact of the library/);
        const all = [reason.text];
        for (let next = reason.next; next !== undefined; ) {
            const p = (await read("diagnosis.step", { task: `task:${T10}`, step: 8, part: "reason", from: next })).reason as { text: string; next?: number };
            all.push(p.text);
            next = p.next;
        }
        assert.match(all.join(""), /steps\.2\.speedPercent = 100 is a safety constant with no justification/, "the whole refusal, page by page");
        const one = await read("diagnosis.step", { task: `task:${T10}`, step: 8, part: "sent", pointer: "/justifications/[constant=steps.1.speedPercent]" });
        assert.match(String((one.value as { text: string }).text), /"value":100.*test\.speedFloorPercent; scrubber\.effectiveFlowAtFull/);
        const received = await read("diagnosis.step", { task: `task:${T10}`, step: 8, part: "received", pointer: "/hypothesis" });
        assert.ok(((received.received as { shown: string[] }).shown).includes("/hypothesis/safetyBounds"));
        const text = await read("diagnosis.text", { file: "specs/procedure/words.json", pointer: "/brief/safetyBounds", at: "today", find: "by its id alone" });
        assert.match(String((text.text as { text: string }).text), /by its id alone/);
        const node = await read("diagnosis.graph", { id: asked.lead.form!.id });
        assert.ok((node.links as number) > (node.shown as string[]).length && node.next === 10, "a form's many links, a page at a time");
    });

    it("a lead of a rule said nowhere then: diagnosed, its predictions run by the factory's guard and again by the station, kept; not asked twice", async () => {
        // The leads as a person reads them first, then one asked for.
        const leads = (await ok<{ findings: Array<{ id: string }> }>("station", "harness_evaluate", { forks: FORKS })).findings;
        assert.ok(leads.some((f) => f.id === LEAD));
        const { diagnosis: id, task } = await diagnose(LEAD);
        assert.equal(task.state, "proposed", String(task.manifest?.ended ?? task.run?.ended));
        assert.deepEqual((task.manifest?.steps ?? []).map((s) => s.capability).filter((c) => c === "task.plan" || c === "diagnosis.submit" || c === "task.done"), ["task.plan", "diagnosis.submit", "task.done"]);
        assert.equal(task.manifest?.proposal?.status, "diagnosed");
        const artifact = task.manifest?.artifacts?.find((a) => a.kind === "diagnosis");
        assert.equal(artifact?.path, `diagnoses/${id}.json`);
        const record = JSON.parse(readFileSync(path.join(taskDir(tasks[0]), artifact!.path), "utf8")) as { lead: { id: string }; class: string; current: string; predictions: Array<{ role: string; result: { truth: string } }>; checked: { confirmed: number } };
        assert.deepEqual([record.lead.id, record.class, record.current], [LEAD, "contract-gap", "closed"]);
        assert.deepEqual(record.predictions.map((x) => `${x.role}:${x.result.truth}`), ["cause:true", "current:true", "rules-out:false"]);
        assert.equal(record.checked.confirmed, 3);
        const mother = await read<Array<{ key: string; text: { en: string } }>>("station://mother");
        assert.ok(mother.some((l) => l.key === "mother.diagnosis.asked" && l.text.en.includes(id)));
        assert.ok(mother.some((l) => l.key === "mother.diagnosis.received" && l.text.en.includes(`The diagnosis ${id} is in: contract-gap, closed`) && l.text.en.includes("confirmed 3 of its 3 predictions")));
        const again = await operator.call("station", "diagnose", { forks: FORKS, lead: LEAD, builder: "scripted" });
        assert.equal(again.ok, false);
        assert.match(String(again.error), /is diagnosed already, by scripted\/diagnosis: ask a second diagnosis \(second\), made by another model/);

        // A second diagnosis, blind to the first (E5.3): the same model here, counted once, so the confidence is capped as a single one.
        const second = await ok<{ taskId: string; first: string }>("station", "diagnose", { forks: FORKS, lead: LEAD, second: true, builder: "scripted" });
        tasks.push(second.taskId);
        assert.equal(second.first, "scripted/diagnosis");
        assert.equal((await ended(second.taskId)).manifest?.proposal?.status, "diagnosed");
        const { leads: weighed } = await ok<{ leads: Array<{ lead: string; diagnoses: Array<{ model: string; class: string }>; confidence: { weighed: unknown[]; cap: { why: string } | null; decision: string; why: string } }> }>("station", "diagnoses", { lead: LEAD });
        assert.equal(weighed.length, 1);
        assert.deepEqual(weighed[0].diagnoses.map((d) => `${d.model}:${d.class}`), ["scripted/diagnosis:contract-gap", "scripted/diagnosis:contract-gap"]);
        assert.deepEqual([weighed[0].confidence.weighed.length, weighed[0].confidence.cap?.why, weighed[0].confidence.decision], [1, "single", "person"]);
    });

    it("a refuted diagnosis comes back to the factory as a refusal; sent again unchanged, it is refused on the same points until the task is stuck", async () => {
        const g = graph();
        const lead = evaluate(g).findings.find((f) => f.detector === "D2" && f.id !== LEAD)!;
        const asked = diagnosisAskedFor(g, lead, FORKS);
        const r = await ok<{ taskId: string }>("factory", "request", {
            objective: { required_outputs: [{ name: asked.id, quantity: "Diagnosis" }] },
            observations: {
                diagnosis: asked,
                script: { diagnosis: { verdict: "wrong", cause: "The model never cited a fact.", class: "model-error", current: "still", evidence: [lead.form!.id], predictions: [{ role: "cause", predicate: "outcome-at", args: { task: lead.tasks[0], step: 1, outcome: "cut" }, expect: true }, { role: "current", predicate: "stated-at", args: { rule: "REFERENCE_NOT_A_FACT", at: "today" }, expect: false }, { role: "rules-out", predicate: "fact", args: { id: "test.speedFloorPercent", at: "today" }, expect: false, alternative: "a fact the library holds" }], justifications: [] } },
            },
            topics: ["diagnosis"],
            builder: "scripted",
            requestedBy: "test",
        });
        tasks.push(r.taskId);
        const task = await ended(r.taskId);
        assert.equal(task.state, "failed");
        const refused = (task.manifest?.steps ?? []).find((s) => s.capability === "diagnosis.submit");
        assert.match(String(refused?.reason), /prediction 1 \(cause\) expected true, the harness observed false/);
        assert.match(String(refused?.reason), /prediction 2 \(current\) expected false, the harness observed true/);
        assert.match(String(refused?.reason), /prediction 3 \(rules-out, ruling out "a fact the library holds"\) expected false/);
    });

    it("every diagnosis task recorded once it ended, however it ended: what the model sent and what the harness observed, for a calibration made again without a model", () => {
        const entries = loadDataset(datasetDir);
        assert.deepEqual(entries.map((e) => e.taskId).sort(), [...tasks].sort(), "one entry per task, the failed one too");
        const kept = entries.filter((e) => e.station?.status === "diagnosed");
        assert.equal(kept.length, 2);
        for (const e of kept) {
            assert.deepEqual([e.corpus, e.lead, e.model, e.family, e.state], ["evaluator", LEAD, "scripted/diagnosis", "scripted", "proposed"]);
            assert.deepEqual(e.forks, FORKS);
            assert.match(e.askedSha256, /^[0-9a-f]{64}$/);
            assert.deepEqual(e.submissions.map((x) => x.refused), [false]);
            assert.deepEqual((e.accepted as { predictions: Array<{ result: { truth: string } }> }).predictions.map((x) => x.result.truth), ["true", "true", "false"]);
            assert.ok(e.steps.some((x) => x.capability === "diagnosis.submit" && x.input));
        }
        const failed = entries.find((e) => e.state === "failed")!;
        // Refused three times on the same points, the task stuck: every refused submission kept, with its words.
        assert.deepEqual([failed.accepted, failed.station, failed.submissions.map((x) => x.refused)], [null, null, [true, true, true]]);
        assert.match(String(failed.submissions[0].reason), /expected true, the harness observed false/);
        // The calibration, from the entries and the labels alone: the scripted diagnosis says what the label of D2:8cba says.
        const rows = calibrationRows(diagnosesOfDataset(entries), loadLabels(fromRepository("tests", "fixtures", "evaluator", "labels.json")));
        assert.equal(rows.length, 1);
        assert.deepEqual([rows[0].corpus, rows[0].lead, rows[0].right, rows[0].confidence.cap?.why], ["evaluator", LEAD, true, "single"]);
        // Checked again as the code is now, on the corpus it was made on: the same results, without the model.
        const again = recheck(kept[0], graph(), { registers: { procedure: loadRegister("procedure") } });
        assert.ok("record" in again);
        assert.deepEqual(again.record.predictions.map((x) => x.result?.truth), ["true", "true", "false"]);
        assert.deepEqual(recheck(failed, graph(), { registers: {} }), { why: "no diagnosis was accepted in this task" });
    });
});
