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
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    type Status = { state: string; manifest?: { ended?: string; artifacts?: Array<{ kind: string; path: string }>; steps?: Array<{ capability: string | null; outcome: string; reason?: string | null }> } | null; run?: { ended: string | null; handoff?: { codeTask?: string; replayTask?: string; parent?: string; reason?: string } } | null };
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
        // The graph task ends failed on the missing capability, its plan carrying the contract; the factory opened the code task.
        const parent = await ended(parentId);
        assert.equal(parent.state, "failed", parent.manifest?.ended ?? "");
        assert.match(parent.manifest?.ended ?? "", /^MISSING_CAPABILITY: "leak_co2" for the code factory; this task ends here/);
        assert.equal(parent.manifest?.steps?.filter((x) => x.capability === "graph.evaluate").length, 0, "nothing evaluated: the twin is built on the replay");
        assert.ok(parent.run?.handoff?.codeTask, "a code task was opened");
        const codeId = parent.run!.handoff!.codeTask!;
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
        // The request replayed on the forge, the generated type named; the replay selects it and holds.
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
        assert.equal(replay.run?.handoff?.codeTask, undefined, "nothing missing any more: no further code task");
    });
});
