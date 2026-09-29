/**
 * The commissioning chain as a scenario the scenario slot plays (`specs/scenario-commissioning.json`, `slots/scenario/commissioning.ts`),
 * with the commander stood in by the test at the two places the run waits:
 * the authorisation of the procedure, and the hand-off's questions. The
 * factories are the scripts, the Observer is stood in by the request the
 * test gives, the world is the stand-in; no key.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { LEAK_CONTRACT } from "../stand-ins/builders/code-fixture.js";
import type { Run } from "../slots/scenario/commissioning.js";
import { taskDir } from "../slots/tools/lib/workshop.js";

const PORT = 3133;

/** The twin request the Observer would write, as the test gives it (no script stands in for the Observer). */
const REQUEST = {
    objective: "reproduce the Lab CO2 during the decay test, and expose the CO2 leaking through a seal",
    entities: [{ name: "lab", kind: "volume" }, { name: "scrubber", kind: "device" }, { name: "hab-b", kind: "volume" }],
    observables: [{ name: "co2_lab", quantity: "Concentration", unit: "ppm", column: "co2_lab_ppm" }],
    inputs: [{ name: "speed", quantity: "Ratio", unit: "percent", column: "speed_percent" }],
    outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm" }, { name: "leak_co2", quantity: "MassFlow", unit: "kg/s" }],
    required_behaviors: ["the Lab CO2 rises when the scrubber slows and decays when it runs"],
    missing_information: ["the flow the inter-module ventilation delivers, hatch closed"],
    validation: { criteria: ["the residual against co2_lab_ppm under the threshold"], compare: [{ output: "predicted_co2", against: "co2_lab_ppm" }] },
};
const MISSING = { required_output: "leak_co2", quantity: "MassFlow", unit: "kg/s", topic: "code", reason: "no node of the catalogue takes CO2 out of a volume at a constant mass flow scaled by a command", contract: LEAK_CONTRACT };

describe("the commissioning chain played by the slot, the commander deciding", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let operator: Broker;
    let recipesDir = "";
    const tasks: string[] = [];
    const ok = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const r = await operator.call(slot, tool, args);
        assert.ok(r.ok, `${slot}.${tool}: ${r.error}`);
        return r.output as T;
    };
    const readRun = async (): Promise<Run | null> => JSON.parse((await (await operator.session("scenario")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "scenario://run" })).contents[0].text) as Run | null;
    /** The run once a loop reached a status (or the run ended). */
    const until = async (what: string, test: (run: Run) => boolean, ms = 240_000): Promise<Run> => {
        const t0 = Date.now();
        for (;;) {
            const run = await readRun();
            if (run && (test(run) || run.status !== "running")) return run;
            if (Date.now() - t0 > ms) throw new Error(`${what}: not reached in ${ms} ms (${JSON.stringify(run?.loops.map((l) => [l.n, l.status, l.note ?? ""]))})`);
            await new Promise((r) => setTimeout(r, 500));
        }
    };
    type Question = { id: string; taskId: string | null; kind: string; status: string };
    const openQuestion = async (kind: string, ms = 60_000): Promise<Question> => {
        const t0 = Date.now();
        for (;;) {
            const qs = JSON.parse((await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://questions" })).contents[0].text) as Question[];
            const q = qs.find((x) => x.kind === kind && x.status === "open");
            if (q) return q;
            if (Date.now() - t0 > ms) throw new Error(`no open question of kind ${kind} in ${ms} ms`);
            await new Promise((r) => setTimeout(r, 500));
        }
    };

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        process.env.BIOMED_PROVIDER = "simulated";
        recipesDir = mkdtempSync(path.join(tmpdir(), "recipes-run-"));
        process.env.FACTORY_RECIPES_DIR = recipesDir;
        ({ broker: local, slots } = await startAllOrFail(PORT));
        operator = new Broker(local.httpBase, { name: "operator-test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        delete process.env.BIOMED_PROVIDER;
        delete process.env.FACTORY_RECIPES_DIR;
        await operator?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
        for (const t of tasks) rmSync(taskDir(t), { recursive: true, force: true });
        rmSync(recipesDir, { recursive: true, force: true });
    });

    it("registration, the procedure written and relayed, the commander's authorisation waited for, the test run, the twin requested, the node missing, the commander's two answers, the code factory, the replay, the proposal", async () => {
        const started = await ok<{ runId: string; status: string; loops: string[] }>("scenario", "play", { id: "commissioning", builder: "scripted", request: REQUEST, observations: { declareMissing: MISSING } });
        assert.equal(started.runId, "R001");
        assert.equal(started.loops.length, 10);
        // The scripted builder cannot stand in for the Observer: the request is required.
        assert.equal((await operator.call("scenario", "play", { id: "commissioning", builder: "scripted" })).ok, false, "a second run while one plays, and no request");
        assert.equal((await operator.call("scenario", "play", { id: "night-9" })).ok, false, "the night is not played by this slot");

        // Up to the authorisation: registration, the procedure factory (the script), the relay; then the run waits for the commander.
        const waiting = await until("the authorisation", (r) => r.loops[3].status === "waiting");
        assert.equal(waiting.status, "running", waiting.ended ?? "");
        assert.deepEqual(waiting.loops.slice(0, 4).map((l) => [l.n, l.status, l.nature]), [[1, "done", "code"], [2, "done", "script"], [3, "done", "code"], [4, "waiting", "human"]]);
        assert.ok(waiting.commissioningId, "a commissioning was opened");
        assert.match(waiting.loops[3].waitingFor ?? "", /station\.commissioning_authorise/);
        assert.ok(waiting.loops[1].taskId, "the procedure task is named");
        tasks.push(waiting.loops[1].taskId!);
        // The commander authorises (on the page: the same tool, or the answer to Mother's question, which the direct call settles).
        await ok("station", "commissioning_authorise", { commissioningId: waiting.commissioningId, decision: "authorise", by: "commander-test", note: "test" });
        const settled = (JSON.parse((await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://questions" })).contents[0].text) as Array<Question & { answer: { how: string } | null }>).find((q) => q.kind === "authorise");
        assert.equal(settled?.status, "answered", "the authorise question is settled by the direct call");
        assert.equal(settled?.answer?.how, "script");

        // The execution, the report, the Observer stood in, the graph factory (the script) declaring the leak missing with its contract; then the hand-off waits for the commander.
        const handoff = await until("the hand-off's first question", (r) => r.loops[8].status === "waiting");
        assert.equal(handoff.status, "running", handoff.ended ?? "");
        assert.deepEqual(handoff.loops.slice(3, 9).map((l) => [l.n, l.status]), [[4, "done"], [5, "done"], [6, "done"], [7, "done"], [8, "done"], [9, "waiting"]]);
        assert.equal(handoff.loops[6].nature, "script", "the request given stands in for the Observer");
        assert.match(String((handoff.loops[7].output as { ended?: string } | undefined)?.ended ?? ""), /^MISSING_CAPABILITY: "leak_co2"/);
        tasks.push(handoff.loops[7].taskId!);
        const q1 = await openQuestion("open-code");
        assert.equal(q1.taskId, handoff.loops[7].taskId);
        await ok("station", "answer", { questionId: q1.id, choice: "open", by: "commander-test", how: "script" });
        // The code factory (the script) writes the node; the run asks again before the replay.
        const replaying = await until("the replay question", (r) => r.loops[8].status === "waiting" && /replay/.test(r.loops[8].waitingFor ?? ""));
        assert.equal(replaying.status, "running", replaying.ended ?? "");
        const q2 = await openQuestion("replay");
        await ok("station", "answer", { questionId: q2.id, choice: "replay", by: "commander-test", how: "script" });

        // The replay on the forge holds; the twin is proposed; the run is done.
        const done = await until("the end", (r) => r.status !== "running", 300_000);
        assert.equal(done.status, "done", done.ended ?? "");
        assert.deepEqual(done.loops.map((l) => l.status), ["done", "done", "done", "done", "done", "done", "done", "done", "done", "done"]);
        assert.equal(done.tasks.length, 4, "the procedure task, the graph task, the code task, the replay");
        tasks.push(...done.tasks.filter((t) => !tasks.includes(t)));
        const last = done.loops[9].output as { task: string; state: string; artifacts: Array<{ kind: string }> };
        assert.equal(last.state, "proposed");
        assert.ok(last.artifacts.some((a) => a.kind === "graph"));
        assert.match(done.ended ?? "", /^the twin proposed/);
        // The state tool says the same, and a second run may start now.
        const state = await ok<{ current: Run | null; runs: Array<{ id: string; status: string }> }>("scenario", "runs");
        assert.deepEqual(state.runs.map((r) => [r.id, r.status]), [["R001", "done"]]);
    });

    it("a refused authorisation ends the run as failed, on the loop that waited, and the register holds the second run's devices under its own names", async () => {
        const started = await ok<{ runId: string }>("scenario", "play", { id: "commissioning", builder: "scripted", request: REQUEST });
        assert.equal(started.runId, "R002");
        const waiting = await until("the authorisation", (r) => r.loops[3].status === "waiting");
        tasks.push(waiting.loops[1].taskId!);
        assert.match(waiting.loops[0].note ?? "", /scrubber-1-r002/, "the scene registers again under this run's names");
        await ok("station", "commissioning_authorise", { commissioningId: waiting.commissioningId, decision: "refuse", by: "commander-test" });
        const failed = await until("the end", (r) => r.status !== "running");
        assert.equal(failed.status, "failed", JSON.stringify({ id: failed.id, ended: failed.ended, commissioning: failed.commissioningId, loops: failed.loops.map((l) => [l.n, l.status, l.note ?? ""]) }));
        // The commander decided: the loop that waited is done, with the decision; the run failed on it.
        assert.equal(failed.loops[3].status, "done");
        assert.match(failed.loops[3].note ?? "", /refuse by commander-test/);
        assert.match(failed.ended ?? "", /the commander refused/);
        assert.deepEqual(failed.loops.slice(4).map((l) => l.status), ["skipped", "skipped", "skipped", "skipped", "skipped", "skipped"]);
    });

    it("a critical alarm aborts the test; the process playbook asks the commander, never a standing order; on a new test the factory analyses the abort first, and the second test runs through (2026-09-29, P1 bis)", async () => {
        // The twin asked for without the leak: what is tested here ends at the report; the rest runs as in the first run, the hand-off aside.
        const request = { ...REQUEST, objective: "reproduce the Lab CO2 during the decay test", outputs: [REQUEST.outputs[0]] };
        const started = await ok<{ runId: string }>("scenario", "play", { id: "commissioning", builder: "scripted", request });
        const waiting = await until("the authorisation", (r) => r.loops[3].status === "waiting");
        assert.equal(waiting.status, "running", waiting.ended ?? "");
        tasks.push(waiting.loops[1].taskId!);
        // FE-1, in the Lab under test, is unwell: someone raises the alarm from the medical panel; the commander authorises all the same, and the test stops at its first reading.
        await ok("biomed", "alarm", { subjectId: "fe-1", what: "chest pain", by: "the medical panel" });
        await ok("station", "commissioning_authorise", { commissioningId: waiting.commissioningId, decision: "authorise", by: "commander-test" });
        const asking = await until("the recover question", (r) => r.conduct?.stage === "ask");
        assert.equal(asking.status, "running", asking.ended ?? "");
        assert.deepEqual(
            [asking.conduct?.playbook, asking.conduct?.aborts, asking.conduct?.aborted, asking.conduct?.answer],
            ["specs/commissioning/recovery.playbook.json", 1, true, null],
            "the position kept in the run between the two events: one abort, no answer yet",
        );
        assert.match(asking.loops[4].waitingFor ?? "", /the commander's decision after the abort/);
        const q = await openQuestion("recover");
        // Dealt with first: the alarm cleared; then the commander asks for a new test.
        await ok("biomed", "alarm_clear", { subjectId: "fe-1", by: "the medical panel" });
        await ok("station", "answer", { questionId: q.id, choice: "rewrite", by: "commander-test", how: "script" });
        const again = await until("the second authorisation", (r) => r.loops[3].status === "waiting" && r.tasks.length === 2);
        assert.equal(again.status, "running", again.ended ?? "");
        assert.deepEqual(again.conduct?.stages.map((s) => s.stage), ["ask", "rewrite-test"]);
        const second = again.loops[1].taskId!;
        tasks.push(second);
        // The second procedure task was told what stopped the first, and analysed it before any procedure.
        const task = await ok<{ manifest?: { steps?: Array<{ capability?: string; outcome?: string }> } }>("factory", "task", { taskId: second });
        const capabilities = (task.manifest?.steps ?? []).map((s) => s.capability);
        assert.ok(capabilities.includes("procedure.analyse"), JSON.stringify(capabilities));
        assert.ok(capabilities.indexOf("procedure.analyse") < capabilities.indexOf("procedure.submit"), "the analysis before the procedure");
        await ok("station", "commissioning_authorise", { commissioningId: again.commissioningId, decision: "authorise", by: "commander-test" });
        const report = await until("the report", (r) => r.loops[5].status === "done");
        assert.equal(report.status, "running", report.ended ?? "");
        assert.equal(report.conduct?.aborted, false);
        assert.deepEqual(report.conduct?.stages.map((s) => s.stage), ["ask", "rewrite-test", "report"]);
        assert.equal(started.runId, report.id);
        const done = await until("the end", (r) => r.status !== "running", 300_000);
        tasks.push(...done.tasks.filter((t) => !tasks.includes(t)));
        assert.equal(done.status, "done", done.ended ?? "");
        assert.match(done.ended ?? "", /^the twin proposed/);
    });
});

describe("a run that starts with the library unsigned, the commander signing in Mother's chat", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let operator: Broker;
    const tasks: string[] = [];
    let recipesDir = "";
    const ok = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const r = await operator.call(slot, tool, args);
        assert.ok(r.ok, `${slot}.${tool}: ${r.error}`);
        return r.output as T;
    };
    const read = async <T>(slot: string, uri: string): Promise<T> => JSON.parse((await (await operator.session(slot)).request<{ contents: Array<{ text: string }> }>("resources/read", { uri })).contents[0].text) as T;
    const until = async (what: string, test: (run: Run) => boolean, ms = 240_000): Promise<Run> => {
        const t0 = Date.now();
        for (;;) {
            const run = await read<Run | null>("scenario", "scenario://run");
            if (run && (test(run) || run.status !== "running")) return run;
            if (Date.now() - t0 > ms) throw new Error(`${what}: not reached in ${ms} ms (${JSON.stringify(run?.loops.map((l) => [l.n, l.status, l.note ?? ""]))})`);
            await new Promise((r) => setTimeout(r, 500));
        }
    };
    type Question = { id: string; taskId: string | null; kind: string; status: string };
    const openQuestion = async (kind: string, ms = 60_000): Promise<Question> => {
        const t0 = Date.now();
        for (;;) {
            const q = (await read<Question[]>("station", "station://questions")).find((x) => x.kind === kind && x.status === "open");
            if (q) return q;
            if (Date.now() - t0 > ms) throw new Error(`no open question of kind ${kind} in ${ms} ms`);
            await new Promise((r) => setTimeout(r, 500));
        }
    };

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        process.env.BIOMED_PROVIDER = "simulated";
        // Recipes of its own: the suite never learns into the workshop's, nor replays them.
        recipesDir = mkdtempSync(path.join(tmpdir(), "recipes-signature-"));
        process.env.FACTORY_RECIPES_DIR = recipesDir;
        ({ broker: local, slots } = await startAllOrFail(PORT + 1));
        operator = new Broker(local.httpBase, { name: "operator-test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        delete process.env.BIOMED_PROVIDER;
        delete process.env.FACTORY_RECIPES_DIR;
        await operator?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
        for (const t of tasks) rmSync(taskDir(t), { recursive: true, force: true });
        rmSync(recipesDir, { recursive: true, force: true });
    });

    it("a run with the library unsigned: the procedure is refused, Mother asks the commander to sign the safety card with its values, no standing order signs it; signed, the factory writes again; the repository's signatures are given back at the end", async () => {
        type Facts = { facts: Array<{ id: string; signed: { by: string; valid: boolean } | null }> };
        const card = async () => (await ok<Facts>("library", "facts", { id: "commissioning-test-safety" })).facts[0].signed;
        assert.equal((await card())?.by, "the test suite", "the suite's own signature, before the run");
        // A standing order that answers every question does not answer a signature.
        await ok("station", "questions_policy", { mode: "auto" });
        const started = await ok<{ runId: string }>("scenario", "play", { id: "commissioning-signature", builder: "scripted", request: REQUEST });
        const asking = await until("the signature's question", (r) => r.loops[1].status === "waiting");
        assert.equal(asking.status, "running", asking.ended ?? "");
        assert.match(asking.loops[1].waitingFor ?? "", /signature of commissioning-test-safety/);
        tasks.push(...asking.tasks);
        assert.equal(await card(), null, "the run's own signatures start empty");
        const q = (await openQuestion("sign")) as Question & { context: { document: string; facts: Array<{ id: string; value: number; bound: string | null }> } };
        assert.equal(q.context.document, "commissioning-test-safety");
        assert.ok(q.context.facts.some((f) => f.id === "test.co2AbortCeilingPpm" && f.value === 3200 && f.bound === "upper"), "the card's values are shown to the commander");
        await ok("station", "questions_policy", { mode: "ask" });
        await ok("station", "answer", { questionId: q.id, choice: "sign", by: "commander-test", how: "script" });
        assert.match((await card())?.by ?? "", /commander, from the control room/);
        // Signed: the factory writes again, the procedure passes, the run waits for the authorisation.
        const waiting = await until("the authorisation", (r) => r.loops[3].status === "waiting");
        assert.equal(waiting.status, "running", waiting.ended ?? "");
        assert.equal(waiting.loops[1].status, "done");
        tasks.push(...waiting.tasks.filter((t) => !tasks.includes(t)));
        assert.ok(waiting.tasks.length >= 2, "the refused procedure task, then the one written again");
        await ok("station", "commissioning_authorise", { commissioningId: waiting.commissioningId, decision: "refuse", by: "commander-test" });
        const ended = await until("the end", (r) => r.status !== "running");
        assert.equal(ended.id, started.runId);
        assert.equal((await card())?.by, "the test suite", "the repository's signatures are back; the run's signature stayed in the run");
    });

    it("runs in a row: once the recipes replay the reads, each procedure is still written for the run's own device and occupants, never replayed from another task", async () => {
        type Step = { capability: string; source: string };
        for (let k = 0; k < 4; k++) {
            const started = await ok<{ runId: string }>("scenario", "play", { id: "commissioning", builder: "scripted", request: REQUEST });
            const waiting = await until(`run ${started.runId}: the authorisation`, (r) => r.id === started.runId && r.loops[3].status === "waiting");
            tasks.push(...waiting.tasks.filter((t) => !tasks.includes(t)));
            assert.equal(waiting.status, "running", `${started.runId}: ${waiting.ended ?? ""}`);
            const manifest = JSON.parse(readFileSync(path.join(taskDir(waiting.tasks[0]), "manifest.json"), "utf8")) as { steps: Step[] };
            const replayed = manifest.steps.filter((s) => s.source === "policy").map((s) => s.capability);
            assert.ok(!replayed.includes("procedure.submit") && !replayed.includes("task.done"), `${started.runId}: the procedure is the builder's, not a replay (${replayed.join(", ")})`);
            if (k === 3) assert.ok(replayed.length > 0, "by the fourth run the recipes replay the reads");
            await ok("station", "commissioning_authorise", { commissioningId: waiting.commissioningId, decision: "refuse", by: "commander-test" });
            await until(`run ${started.runId}: the end`, (r) => r.id === started.runId && r.status !== "running");
        }
    });
});
