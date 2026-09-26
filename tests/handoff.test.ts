/**
 * The hand-off between the graph factory and the code factory
 * (docs/observateur-et-usines.fr.md, section 6.5): a graph task whose plan
 * declares a required output no node produces, with the topic `code` and a
 * contract, ends failed on it; the factory opens the code task on the
 * contract; the code task ends proposed with the plugin the forge accepted;
 * the factory replays the graph request on the forge's catalogue with the
 * generated type named; the replay ends proposed. Scripted, no key: the
 * graph builder declares the leak missing through the test's hook, the
 * code builder writes the leak fixture, the replay selects the generated
 * type. The plan's guard refuses a missing capability for the code factory
 * without a contract, or with one the forge could not run.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { fromRoot } from "../lib/paths.js";
import { LAB_WORLD, twoZoneTelemetry } from "../harness/stand-in/two-zone-world.js";
import { LEAK_CONTRACT, LEAK_TYPE } from "../harness/scripted/code-fixture.js";
import { planProblems } from "../harness/core/builder-guard.js";
import { GRAPH_TOPIC } from "../harness/topics/graph/index.js";
import { codeTaskRequest, missingForCode, replayRequest } from "../slots/factory/handoff.js";
import { taskDir } from "../slots/tools/lib/workshop.js";
import type { TaskFile } from "../harness/core/task.js";

const PORT = 3132;
const DEVICES = (JSON.parse(readFileSync(fromRoot("specs", "commissioning-devices.json"), "utf8")) as { devices: unknown[] }).devices;
const PERSONS = [
    { id: "fe-1", callsign: "FE-1", name: "A. Pelletier", module: "lab", activity: "light_work" },
    { id: "fe-2", callsign: "FE-2", name: "M. Chen", module: "lab", activity: "light_work" },
    { id: "cdr", callsign: "CDR", name: "J. Picard", module: "hab-b", activity: "rest" },
    { id: "fe-3", callsign: "FE-3", name: "G. La Forge", module: "hab-b", activity: "rest" },
];
const TELEMETRY = twoZoneTelemetry(LAB_WORLD, [
    { speedPercent: 30, minutes: 20 },
    { speedPercent: 100, minutes: 30 },
]);
const MISSING = { required_output: "leak_co2", quantity: "MassFlow", unit: "kg/s", topic: "code", reason: "no node of the catalogue takes CO2 out of a volume at a constant mass flow scaled by a command", contract: LEAK_CONTRACT };

describe("the hand-off's rules, without a broker", () => {
    it("a plan's missing capability for the code factory carries a contract the forge can run; the requests are built from the task", async () => {
        const task = { id: "t", objective: { required_outputs: [{ name: "leak_co2", quantity: "MassFlow", unit: "kg/s" }], constraints: {} }, observations: {}, data: [], budget: { iterations: 1, minutes: 1, twinPoints: 1 }, requestedBy: "x", requestedAt: "t" } as unknown as TaskFile["task"];
        const options = { broker: { call: async () => ({ ok: false, outcome: "refused" }) } as never, task, topic: GRAPH_TOPIC };
        const noContract = await planProblems({ selected_nodes: [], missing_capabilities: [{ required_output: "leak_co2", quantity: "MassFlow", unit: "kg/s", reason: "nothing produces it", topic: "code" }] }, options);
        assert.deepEqual(noContract, ['missing capability "leak_co2" is for the code factory and carries no contract: write contract {inputs, outputs, parameters, behaviors} (the schema of task.plan says its shape); the forge runs it on the generated node']);
        const badContract = await planProblems({ selected_nodes: [], missing_capabilities: [{ ...MISSING, contract: { ...LEAK_CONTRACT, behaviors: ["output(flow=1) == 2"] } }] }, options);
        assert.match(badContract[0], /^missing capability "leak_co2", contract: "output\(flow=1\) == 2": "flow" is not an input of the contract/);
        const wrongQuantity = await planProblems({ selected_nodes: [], missing_capabilities: [{ ...MISSING, quantity: "Volume" }] }, options);
        assert.ok(wrongQuantity.some((p) => /no output carries the required quantity Volume/.test(p)), wrongQuantity.join(" | "));
        assert.deepEqual(await planProblems({ selected_nodes: [], missing_capabilities: [MISSING] }, options), []);
        assert.deepEqual(missingForCode({ selected_nodes: [], missing_capabilities: [MISSING, { ...MISSING, required_output: "other", topic: "procedure" }] }).map((m) => m.required_output), ["leak_co2"]);
        const code = codeTaskRequest("t-parent", task, { ...MISSING, topic: "code" }, "scripted");
        assert.deepEqual(code.topics, ["code"]);
        assert.deepEqual((code.requirements as { capability: unknown }).capability, LEAK_CONTRACT);
        assert.equal((code.observations as { parentTask: string }).parentTask, "t-parent");
        const replay = replayRequest("t-parent", task, "t-code", [{ type: LEAK_TYPE, plugin: "leak", sha256: "s", task: "t-code" }], [], "scripted");
        assert.equal(replay.runtime, "forge");
        assert.deepEqual((replay.observations as { generated: unknown[]; handoffDepth: number }).generated, [{ type: LEAK_TYPE, plugin: "leak", sha256: "s", task: "t-code" }]);
        assert.equal((replay.observations as { handoffDepth: number }).handoffDepth, 1);
    });
});

describe("the hand-off through the factory, scripted", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let operator: Broker;
    let recipesDir = "";
    const tasks: string[] = [];
    type Status = { state: string; manifest?: { ended?: string; artifacts?: Array<{ kind: string; path: string }>; steps?: Array<{ capability: string | null; outcome: string; reason?: string | null }> } | null; run?: { ended: string | null; waiting?: string; handoff?: { question?: string; codeTask?: string; replayTask?: string; parent?: string; reason?: string; stopped?: string } } | null };
    type Question = { id: string; taskId: string | null; kind: string; status: string; options: Array<{ id: string; label: string }>; context: { contract?: unknown; generated?: unknown[] }; answer: { choice: string; by: string; how: string } | null; resumed: unknown };
    const questions = async (): Promise<Question[]> => JSON.parse((await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://questions" })).contents[0].text) as Question[];
    /** The open question of a kind about a task, once the factory asked it. */
    const asked = async (taskId: string, kind: string, ms = 30_000): Promise<Question> => {
        const t0 = Date.now();
        for (;;) {
            const q = (await questions()).find((x) => x.taskId === taskId && x.kind === kind && x.status === "open");
            if (q) return q;
            if (Date.now() - t0 > ms) throw new Error(`no open question of kind ${kind} for ${taskId} in ${ms} ms`);
            await new Promise((r) => setTimeout(r, 300));
        }
    };
    const answer = async (questionId: string, choice: string) => {
        const r = await operator.call("station", "answer", { questionId, choice, by: "commander-test", how: "script" });
        assert.ok(r.ok, r.error);
        return r.output as { status: string; resumed: unknown };
    };
    const status = async (taskId: string): Promise<Status> => {
        const r = await operator.call("factory", "task", { taskId });
        assert.ok(r.ok, r.error);
        return r.output as Status;
    };
    const ended = async (taskId: string, ms = 180_000): Promise<Status> => {
        const t0 = Date.now();
        for (;;) {
            const s = await status(taskId);
            if (s.run?.ended) return s;
            if (Date.now() - t0 > ms) throw new Error(`task ${taskId} did not end in ${ms} ms (${s.state})`);
            await new Promise((r) => setTimeout(r, 500));
        }
    };

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        process.env.BIOMED_PROVIDER = "simulated";
        recipesDir = mkdtempSync(path.join(tmpdir(), "recipes-handoff-"));
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

    it("a graph task short of a node opens the code task on its contract; the code task proposed replays the request on the forge with the generated type; the replay holds", async () => {
        const r = await operator.call("factory", "request", {
            objective: { required_outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm" }, { name: "leak_co2", quantity: "MassFlow", unit: "kg/s" }], constraints: { residualPpmMax: 10 } },
            observations: { persons: PERSONS, devices: DEVICES, declareMissing: MISSING },
            data: [{ file: "telemetry.json", rows: TELEMETRY }],
            requirements: { objective: "reproduce the Lab CO2 during the decay test, with a leak the catalogue cannot express", missing_information: ["the flow the inter-module ventilation delivers, hatch closed"] },
            budget: { iterations: 12, twinPoints: 200 },
            builder: "scripted",
            requestedBy: "handoff-test",
        });
        assert.ok(r.ok, r.error);
        const parentId = (r.output as { taskId: string }).taskId;
        tasks.push(parentId);
        // The graph task ends failed on the missing capability, its plan carrying the contract; the factory asks the commander before opening the code factory.
        const parent = await ended(parentId);
        assert.equal(parent.state, "failed", parent.manifest?.ended ?? "");
        assert.match(parent.manifest?.ended ?? "", /^MISSING_CAPABILITY: "leak_co2" for the code factory; this task ends here/);
        assert.equal(parent.manifest?.steps?.filter((x) => x.capability === "graph.evaluate").length, 0, "nothing evaluated: the twin is built on the replay");
        const q1 = await asked(parentId, "open-code");
        assert.deepEqual(q1.options.map((o) => o.id), ["open", "amend", "stop"]);
        assert.deepEqual(q1.context.contract, LEAK_CONTRACT, "the commander sees the contract the graph factory wrote");
        assert.equal((await status(parentId)).run?.handoff?.codeTask, undefined, "nothing opened before the answer");
        const a1 = await answer(q1.id, "open");
        assert.equal(a1.status, "answered");
        assert.equal((a1.resumed as { taken?: boolean }).taken, true, JSON.stringify(a1.resumed));
        const opened = await status(parentId);
        assert.ok(opened.run?.handoff?.codeTask, "the code task was opened on the answer");
        const codeId = opened.run!.handoff!.codeTask!;
        tasks.push(codeId);
        const codeTask = JSON.parse(readFileSync(path.join(taskDir(codeId), "task.json"), "utf8")) as TaskFile;
        assert.deepEqual(codeTask.task.topics, ["code"]);
        assert.equal(codeTask.task.runtime, "forge");
        assert.deepEqual((codeTask.task.requirements as { capability: unknown }).capability, LEAK_CONTRACT);
        assert.equal((codeTask.task.observations as { parentTask: string }).parentTask, parentId);
        // The code task ends proposed with the plugin the forge accepted against that contract.
        const code = await ended(codeId);
        assert.equal(code.state, "proposed", `${code.manifest?.ended ?? ""}: ${JSON.stringify(code.manifest?.steps?.map((x) => [x.capability, x.outcome, x.reason ?? ""]))}`);
        assert.equal(code.run?.handoff?.parent, parentId);
        assert.ok(code.manifest?.artifacts?.some((a) => a.kind === "plugin"));
        // The commander is asked again before the request is replayed; on the answer, the replay runs on the forge with the generated type named, selects it and holds.
        const q2 = await asked(parentId, "replay");
        assert.deepEqual(q2.options.map((o) => o.id), ["replay", "stop"]);
        assert.equal((q2.context.generated as Array<{ type: string }>)[0]?.type, LEAK_TYPE);
        assert.equal((await status(parentId)).run?.handoff?.replayTask, undefined, "nothing replayed before the answer");
        await answer(q2.id, "replay");
        const again = await status(parentId);
        assert.ok(again.run?.handoff?.replayTask, "the request was replayed");
        const replayId = again.run!.handoff!.replayTask!;
        tasks.push(replayId);
        const replayTask = JSON.parse(readFileSync(path.join(taskDir(replayId), "task.json"), "utf8")) as TaskFile;
        assert.equal(replayTask.task.runtime, "forge");
        assert.deepEqual(replayTask.task.objective, codeTask.task.observations.parentObjective);
        assert.deepEqual((replayTask.task.observations as { generated: Array<{ type: string; task: string }> }).generated.map((g) => [g.type, g.task]), [[LEAK_TYPE, codeId]]);
        assert.equal((replayTask.task.observations as { handoffDepth: number }).handoffDepth, 1);
        assert.deepEqual(replayTask.task.data.map((d) => d.file), ["telemetry.json"]);
        const replay = await ended(replayId);
        assert.equal(replay.state, "proposed", `${replay.manifest?.ended ?? ""}: ${JSON.stringify(replay.manifest?.steps?.map((x) => [x.capability, x.outcome, x.reason ?? ""]))}`);
        const plan = JSON.parse(readFileSync(path.join(taskDir(replayId), "plan.json"), "utf8")) as { selected_nodes: string[]; missing_capabilities: unknown[] };
        assert.ok(plan.selected_nodes.includes(LEAK_TYPE));
        assert.deepEqual(plan.missing_capabilities, []);
        assert.equal(replay.run?.handoff?.question, undefined, "nothing missing any more: no further question");
        const said = JSON.parse((await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://mother" })).contents[0].text) as Array<{ key: string }>;
        assert.deepEqual(said.filter((l) => l.key.startsWith("mother.question")).map((l) => l.key), ["mother.question.asked", "mother.question.answered", "mother.question.asked", "mother.question.answered"]);
    });

    it("the commander may stop the hand-off: the code factory is not opened, and the task says so", async () => {
        const r = await operator.call("factory", "request", {
            objective: { required_outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm" }, { name: "leak_co2", quantity: "MassFlow", unit: "kg/s" }], constraints: { residualPpmMax: 10 } },
            observations: { persons: PERSONS, devices: DEVICES, declareMissing: MISSING },
            data: [{ file: "telemetry.json", rows: TELEMETRY }],
            topics: ["graph"],
            budget: { iterations: 12, twinPoints: 200 },
            builder: "scripted",
            requestedBy: "handoff-test",
        });
        assert.ok(r.ok, r.error);
        const parentId = (r.output as { taskId: string }).taskId;
        tasks.push(parentId);
        await ended(parentId);
        const q = await asked(parentId, "open-code");
        const a = await answer(q.id, "stop");
        assert.equal((a.resumed as { taken?: boolean }).taken, false);
        const s = await status(parentId);
        assert.equal(s.run?.handoff?.codeTask, undefined);
        assert.match(s.run?.handoff?.stopped ?? "", /did not open the code factory/);
    });

    it("a standing order answers the questions at once: the whole chain runs without the commander, each question kept as answered by the order", async () => {
        const policy = await operator.call("station", "questions_policy", { mode: "auto" });
        assert.ok(policy.ok, policy.error);
        try {
            const r = await operator.call("factory", "request", {
                objective: { required_outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm" }, { name: "leak_co2", quantity: "MassFlow", unit: "kg/s" }], constraints: { residualPpmMax: 10 } },
                observations: { persons: PERSONS, devices: DEVICES, declareMissing: MISSING },
                data: [{ file: "telemetry.json", rows: TELEMETRY }],
                topics: ["graph"],
                budget: { iterations: 12, twinPoints: 200 },
                builder: "scripted",
                requestedBy: "handoff-test",
            });
            assert.ok(r.ok, r.error);
            const parentId = (r.output as { taskId: string }).taskId;
            tasks.push(parentId);
            await ended(parentId);
            const t0 = Date.now();
            let s: Status;
            do {
                await new Promise((x) => setTimeout(x, 500));
                s = await status(parentId);
            } while (!(s.run?.handoff?.replayTask && (await status(s.run.handoff.replayTask)).run?.ended) && Date.now() - t0 < 180_000);
            assert.ok(s.run?.handoff?.codeTask && s.run?.handoff?.replayTask, JSON.stringify(s.run?.handoff));
            tasks.push(s.run!.handoff!.codeTask!, s.run!.handoff!.replayTask!);
            const rs = await status(s.run!.handoff!.replayTask!);
            assert.equal(rs.state, "proposed", `${rs.manifest?.ended ?? ""}: ${JSON.stringify(rs.manifest?.steps?.map((x) => [x.capability, x.outcome, x.reason ?? ""]))}`);
            const mine = (await questions()).filter((q) => q.taskId === parentId);
            assert.deepEqual(mine.map((q) => [q.kind, q.status, q.answer?.choice, q.answer?.how]), [["open-code", "auto", "open", "policy"], ["replay", "auto", "replay", "policy"]]);
        } finally {
            await operator.call("station", "questions_policy", { mode: "ask" });
        }
    });

    it("a factory may ask the commander itself (task.ask): the task waits, the answer goes into its observations and the loop goes on; under a standing order the answer comes at once", async () => {
        const request = (askFirst: string) => operator.call("factory", "request", {
            objective: { required_outputs: [{ name: "leak_co2", quantity: "MassFlow", unit: "kg/s" }] },
            observations: { gap: "no node removes CO2 at a constant rate", askFirst },
            requirements: { capability: LEAK_CONTRACT },
            topics: ["code"],
            builder: "scripted",
            requestedBy: "handoff-test",
        });
        // Waiting for the commander: the task ends as waiting, the question is open, the answer starts the loop again with the answer in the observations.
        const r = await request("May I write the leak node now?");
        assert.ok(r.ok, r.error);
        const taskId = (r.output as { taskId: string }).taskId;
        tasks.push(taskId);
        const waiting = await ended(taskId);
        assert.equal(waiting.state, "waiting", waiting.manifest?.ended ?? "");
        assert.match(waiting.manifest?.ended ?? "", /^WAITING: question q\d+ for the commander: May I write the leak node now\?/);
        const q = await asked(taskId, "ask");
        assert.deepEqual(q.options.map((o) => o.id), ["go", "stop"]);
        assert.equal((await status(taskId)).run?.waiting, q.id);
        await answer(q.id, "go");
        const t0 = Date.now();
        let s: Status;
        do {
            await new Promise((x) => setTimeout(x, 500));
            s = await status(taskId);
        } while ((s.state === "waiting" || s.state === "running" || !s.run?.ended || s.run.ended === "waiting") && Date.now() - t0 < 120_000);
        assert.equal(s.state, "proposed", `${s.manifest?.ended ?? ""}: ${JSON.stringify(s.manifest?.steps?.map((x) => [x.capability, x.outcome]))}`);
        const task = JSON.parse(readFileSync(path.join(taskDir(taskId), "task.json"), "utf8")) as TaskFile;
        assert.deepEqual((task.task.observations.answers as Array<{ questionId: string; choice: string }>).map((a) => [a.questionId, a.choice]), [[q.id, "go"]]);
        assert.ok(existsSync(path.join(taskDir(taskId), `manifest.waiting-${q.id}.json`)), "the manifest of the run that waited is kept");
        // Under a standing order the answer comes at once and the loop goes on in the same run.
        await operator.call("station", "questions_policy", { mode: "auto", kind: "ask", choice: "go" });
        try {
            const r2 = await request("May I write the leak node now, again?");
            assert.ok(r2.ok, r2.error);
            const id2 = (r2.output as { taskId: string }).taskId;
            tasks.push(id2);
            const s2 = await ended(id2);
            assert.equal(s2.state, "proposed", s2.manifest?.ended ?? "");
            assert.deepEqual(s2.manifest?.steps?.slice(0, 2).map((x) => [x.capability, x.outcome]), [["task.ask", "completed"], ["forge.registry_search", "completed"]]);
        } finally {
            await operator.call("station", "questions_policy", { mode: "ask" });
        }
    });
});
