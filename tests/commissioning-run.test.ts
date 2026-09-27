/**
 * The commissioning chain as the control post plays it (`slots/commissioning`),
 * with the commander stood in by the test at the two places the run waits:
 * the authorisation of the procedure, and the hand-off's questions. The
 * factories are the scripts, the Observer is stood in by the request the
 * test gives, the world is the stand-in; no key.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { LEAK_CONTRACT } from "../harness/scripted/code-fixture.js";
import type { Run } from "../slots/commissioning/provider.js";
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
    const readRun = async (): Promise<Run | null> => JSON.parse((await (await operator.session("commissioning")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "commissioning://run" })).contents[0].text) as Run | null;
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
        const started = await ok<{ runId: string; status: string; loops: string[] }>("commissioning", "start", { builder: "scripted", world: "lab", request: REQUEST, observations: { declareMissing: MISSING } });
        assert.equal(started.runId, "R001");
        assert.equal(started.loops.length, 10);
        // The scripted builder cannot stand in for the Observer: the request is required.
        assert.equal((await operator.call("commissioning", "start", { builder: "scripted" })).ok, false, "a second run while one plays, and no request");

        // Up to the authorisation: registration, the procedure factory (the script), the relay; then the run waits for the commander.
        const waiting = await until("the authorisation", (r) => r.loops[3].status === "waiting");
        assert.equal(waiting.status, "running", waiting.ended ?? "");
        assert.deepEqual(waiting.loops.slice(0, 4).map((l) => [l.n, l.status, l.nature]), [[1, "done", "code"], [2, "done", "script"], [3, "done", "code"], [4, "waiting", "human"]]);
        assert.ok(waiting.commissioningId, "a commissioning was opened");
        assert.match(waiting.loops[3].waitingFor ?? "", /station\.commissioning_authorise/);
        assert.ok(waiting.loops[1].taskId, "the procedure task is named");
        tasks.push(waiting.loops[1].taskId!);
        // The commander authorises (on the page: the same tool).
        await ok("station", "commissioning_authorise", { commissioningId: waiting.commissioningId, decision: "authorise", by: "commander-test", note: "test" });

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
        const state = await ok<{ current: Run | null; runs: Array<{ id: string; status: string }> }>("commissioning", "state");
        assert.deepEqual(state.runs.map((r) => [r.id, r.status]), [["R001", "done"]]);
    });

    it("a refused authorisation ends the run as failed, on the loop that waited, and the register holds the second run's devices under its own names", async () => {
        const started = await ok<{ runId: string }>("commissioning", "start", { builder: "scripted", world: "lab", request: REQUEST });
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
});
