/**
 * The graph factory and its loop on the gap (docs/observateur-et-usines.fr.md,
 * section 5): the parametric graph (formulas, measured inputs, the variables
 * the harness fits), the residual measured by code, and the loop through the
 * broker on the telemetry of a stand-in world of two zones whose truth the
 * test keeps: the first candidate, the Lab alone, is refused by its residual
 * whatever its volume; the second, with the exchange through the hatch and
 * the neighbour's measured CO2 as an input, holds the threshold and finds the
 * world's volume and exchange flow; a claim on the refused candidate is
 * refused; Mother says both verdicts. The builder is the test's script; the
 * demo's is the model behind the reasoner slot.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import { runTask, type BuilderContext } from "../harness/core/runner.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import { topicFor, type TaskFile } from "../harness/core/task.js";
import { combinations, evaluateExpression, resolveParam } from "../harness/topics/graph/params.js";
import { residualsOf, type Candidate } from "../harness/topics/graph/evaluate.js";
import { validateGraph } from "../harness/topics/graph/index.js";
import { ScriptedGraphBuilder } from "../harness/scripted/graph.js";
import { LAB_WORLD, twoZoneTelemetry } from "../harness/stand-in/two-zone-world.js";
import type { MotherLine } from "../slots/station/provider.js";
import { taskDir } from "../slots/tools/lib/workshop.js";

const PORT = 3123;
const TELEMETRY = twoZoneTelemetry(LAB_WORLD, [
    { speedPercent: 30, minutes: 20 },
    { speedPercent: 100, minutes: 30 },
]);

describe("the parametric graph and its residual", () => {
    it("formulas are evaluated over the variables, and nothing else", () => {
        assert.equal(evaluateExpression("0.5 * 1e3 / V", { V: 25 }), 20);
        assert.equal(evaluateExpression("(Qe + q) ^ 2 - -1", { Qe: 1, q: 1 }), 5);
        assert.throws(() => evaluateExpression("process.exit(1)", {}), /unexpected|no variable/);
        assert.throws(() => evaluateExpression("q / V", { q: 1 }), /no variable "V"/);
        assert.throws(() => evaluateExpression("1 / V", { V: 0 }), /not a finite number/);
    });

    it("a measured column becomes a timeline's segments; a first value an initial state", () => {
        const rows = [{ minute: 0, s: 30 }, { minute: 1, s: 100 }];
        assert.deepEqual(JSON.parse(String(resolveParam({ $series: { column: "s", scale: "0.01" } }, {}, rows))), [{ from: 0, to: 60, value: 0.3 }, { from: 60, to: 1e9, value: 1 }]);
        assert.equal(resolveParam({ $first: "s" }, {}, rows), 30);
        assert.equal(resolveParam(0.4, {}, rows), 0.4);
    });

    it("the grid is every combination, bounded", () => {
        assert.equal(combinations({ g: 1 }, { V: [1, 2, 3], q: [0, 1] }, 80).length, 6);
        assert.throws(() => combinations({}, { a: [1, 2, 3, 4, 5, 6, 7, 8, 9], b: [1, 2, 3, 4, 5, 6, 7, 8, 9], c: [1, 2] }, 80), /at most 80/);
    });

    it("the residual is measured per compared column, minute by minute, with where it is worst", () => {
        const [r] = residualsOf({ "lab.co2Ppm": [100, 110, 150] }, [{ node: "lab", property: "co2Ppm", column: "c" }], [{ minute: 0, c: 100 }, { minute: 1, c: 100 }, { minute: 2, c: 100 }]);
        assert.equal(r.worst, 50);
        assert.equal(r.worstMinute, 2);
        assert.ok(Math.abs(r.rmse - Math.sqrt((0 + 100 + 2500) / 3)) < 1e-9);
    });

    it("the stand-in world rises at 30 %, decays at 100 %, and its neighbour moves", () => {
        assert.equal(TELEMETRY.length, 51);
        assert.ok(TELEMETRY[20].co2_lab_ppm > TELEMETRY[0].co2_lab_ppm + 300, "the rise");
        assert.ok(TELEMETRY[50].co2_lab_ppm < TELEMETRY[20].co2_lab_ppm - 300, "the decay");
        assert.ok(TELEMETRY[50].co2_habb_ppm > TELEMETRY[0].co2_habb_ppm + 50, "Hab-B is not a constant");
    });

    it("the validator accepts only a candidate the harness built and found under the threshold", () => {
        const progress = newProgress();
        const c = (n: number, pass: boolean): Candidate => ({ n, label: "", path: `candidate-${n}.spikypanda`, sha256: String(n).repeat(64), nodes: 4, types: [], connections: 3, variables: {}, residuals: [{ column: "c", probe: "lab.co2Ppm", rmse: pass ? 3 : 45, worst: 0, worstMinute: 0 }], threshold: 25, pass, combinations: 1, at: "" });
        progress.topic.graph = { candidates: [c(1, false), c(2, true)], runs: 2 } as never;
        const files = [1, 2].map((n) => ({ path: `candidate-${n}.spikypanda`, bytes: 1, sha256: String(n).repeat(64) }));
        assert.match(validateGraph({ summary: "", artifacts: [{ kind: "graph", path: "candidate-1.spikypanda" }] }, files, progress).problems.join(), /residual of 45 ppm, above the threshold of 25/);
        assert.equal(validateGraph({ summary: "", artifacts: [{ kind: "graph", path: "candidate-2.spikypanda" }] }, files, progress).ok, true);
        assert.match(validateGraph({ summary: "", artifacts: [{ kind: "graph", path: "hand-written.spikypanda" }] }, [...files, { path: "hand-written.spikypanda", bytes: 1, sha256: "f".repeat(64) }], progress).problems.join(), /not a candidate graph\.evaluate built/);
    });

    it("the dispatch: a task with an Observer's requirements goes to the graph factory, a named topic is kept", () => {
        const base = { topics: "auto" } as unknown as TaskFile["task"];
        assert.equal(topicFor(base), "onnx");
        assert.equal(topicFor({ ...base, requirements: { objective: "x" } }), "graph");
        assert.equal(topicFor({ ...base, topics: ["procedure"] }), "procedure");
    });
});

describe("the graph factory's loop on the gap, through the broker", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let broker: Broker;
    let recipesDir = "";
    const tasks: string[] = [];

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        recipesDir = mkdtempSync(path.join(tmpdir(), "recipes-"));
        ({ broker: local, slots } = await startAllOrFail(PORT));
        broker = new Broker(local.httpBase, { name: "graph-test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        await broker?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
        for (const t of tasks) if (existsSync(taskDir(t))) rmSync(taskDir(t), { recursive: true, force: true });
        if (recipesDir) rmSync(recipesDir, { recursive: true, force: true });
    });

    it("the Lab alone is refused by its residual, the Lab with the exchange holds and finds the world's volume and flow", async () => {
        const r = await broker.call("factory", "request", {
            objective: { required_outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm" }], constraints: { residualPpmMax: 25 } },
            observations: { labOccupants: 2 },
            data: [{ file: "telemetry.json", rows: TELEMETRY }],
            requirements: { objective: "reproduce the Lab CO2 during the decay test", missing_information: ["the exchange through the closed hatch"] },
            budget: { iterations: 12, twinPoints: 200 },
            builder: "scripted",
            requestedBy: "graph-test",
            run: false,
        });
        assert.ok(r.ok, r.error);
        const taskId = (r.output as { taskId: string }).taskId;
        tasks.push(taskId);
        const result = await runTask({ broker, taskId, recipesDir, provider: (ctx: BuilderContext) => new ScriptedGraphBuilder(ctx) });
        assert.equal(result.manifest.topic, "graph", "dispatched by the requirements");
        assert.equal(result.state, "proposed", result.manifest.ended ?? "");
        const candidates = JSON.parse(readFileSync(path.join(taskDir(taskId), "candidates.json"), "utf8")) as Candidate[];
        assert.equal(candidates.length, 2, result.manifest.steps.map((s) => `${s.n} ${s.capability} ${s.outcome} ${String(s.reason).slice(0, 300)}`).join("\n"));
        const [alone, coupled] = candidates;
        assert.equal(alone.pass, false);
        assert.ok(alone.residuals[0].rmse > 25, `the Lab alone: ${alone.residuals[0].rmse} ppm at V ${alone.variables.V}`);
        assert.equal(coupled.pass, true);
        assert.ok(coupled.residuals[0].rmse < 10, `with the exchange: ${coupled.residuals[0].rmse} ppm`);
        assert.equal(coupled.variables.V, LAB_WORLD.VLab);
        assert.equal(coupled.variables.q, LAB_WORLD.q);
        assert.ok(coupled.types.includes("Logic.Time:timeline") && coupled.nodes === alone.nodes + 1, "the topology changed: one more node");
        assert.ok(result.manifest.artifacts.some((a) => a.kind === "graph" && a.path === coupled.path && a.sha256 === coupled.sha256));
        assert.ok(result.manifest.artifacts.some((a) => a.kind === "graph" && a.path === alone.path), "the refused candidate stays, as evidence");
        const said = JSON.parse((await (await broker.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://mother" })).contents[0].text) as MotherLine[];
        const lines = said.filter((l) => l.key.startsWith("mother.candidate")).map((l) => l.text.en);
        assert.deepEqual(lines, [`Simulator 1. 4 nodes. Residual ${Math.round(alone.residuals[0].rmse)} ppm, above the threshold of 25. Rejected.`, `Simulator 2. 5 nodes. Residual ${Math.round(coupled.residuals[0].rmse)} ppm, under the threshold of 25. Accepted.`]);
    });
});
