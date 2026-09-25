/**
 * The graph factory and its loop on the gap (docs/observateur-et-usines.fr.md,
 * section 5): the parametric graph (formulas, measured inputs, the variables
 * the harness fits), the residual measured by code, and the loop through the
 * broker on the telemetry of a stand-in world of two zones whose truth the
 * test keeps: the first candidate, the library's habitat graph with a clean
 * filter (the ventilation at its design flow), is refused by its residual
 * whatever the volumes; the second, the same graph with the filter's
 * loading fitted (what the ventilation delivers), holds the threshold and
 * finds the world's volume and flow; a claim on the refused candidate is
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
import { earlySlopeOf, evaluateCandidate, inflowsOf, plausibilityOf, residualsOf, specProblems, type Candidate } from "../harness/topics/graph/evaluate.js";
import { validateGraph } from "../harness/topics/graph/index.js";
import { estimatorFor } from "../harness/topics/graph/fit.js";
import { compareStructure, referenceOfSpec } from "../harness/topics/graph/reference.js";
import { cabinReference, stationReference } from "../harness/topics/graph/evaluate.js";
import { labCandidate } from "../harness/scripted/graph.js";
import { deliveredFlowM3PerMinute, readHabitatParameters } from "../lib/habitat.js";
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
        assert.equal(resolveParam("tau", { tau: 3.33 }, rows), 3.33, "a bare variable name reads as its variable");
        assert.equal(resolveParam("light_work", { tau: 3.33 }, rows), "light_work", "any other string stays a string");
    });

    it("the grid is every combination, bounded", () => {
        assert.equal(combinations({ g: 1 }, { V: [1, 2, 3], q: [0, 1] }, 80).length, 6);
        assert.throws(() => combinations({}, { a: [1, 2, 3, 4, 5, 6, 7, 8, 9], b: [1, 2, 3, 4, 5, 6, 7, 8, 9], c: [1, 2] }, 80), /at most 80/);
    });

    it("the two estimators are interchangeable: same question, same answer shape, their costs and limits as documented", async () => {
        const cost = async (v: Record<string, number>) => (v.V - 30) ** 2 + 100 * (v.q - 0.6) ** 2;
        const bounds = { V: { min: 10, max: 100 }, q: { min: 0, max: 2 } };
        const nm = await estimatorFor("nelder-mead").estimate(bounds, cost, 40);
        assert.ok(Math.abs(nm.best.V - 30) < 1 && Math.abs(nm.best.q - 0.6) < 0.05, JSON.stringify(nm.best));
        assert.ok(nm.runs <= 40);
        const grid = await estimatorFor("grid").estimate(bounds, cost, 80, { levels: 7 });
        assert.equal(grid.runs, 49, "levels ^ parameters");
        assert.ok(grid.score >= nm.score, "the grid is blind between its levels");
        await assert.rejects(estimatorFor("grid").estimate({ a: { min: 0, max: 1 }, b: { min: 0, max: 1 }, c: { min: 0, max: 1 } }, cost, 80), /125 runs, above the 80 allowed/);
        assert.equal(estimatorFor(undefined).id, "nelder-mead");
        assert.throws(() => estimatorFor("gradient"), /no estimator "gradient" \(grid, nelder-mead\)/);
    });

    it("the residual is measured per compared column, minute by minute, with where it is worst", () => {
        const [r] = residualsOf({ "lab.co2Ppm": [100, 110, 150] }, [{ node: "lab", property: "co2Ppm", column: "c" }], [{ minute: 0, c: 100 }, { minute: 1, c: 100 }, { minute: 2, c: 100 }]);
        assert.equal(r.worst, 50);
        assert.equal(r.worstMinute, 2);
        assert.ok(Math.abs(r.rmse - Math.sqrt((0 + 100 + 2500) / 3)) < 1e-9);
    });

    it("the plausibility check: a twin that parts from the first minute has a rate in the wrong unit, and is told so by numbers", () => {
        const rows = [0, 1, 2, 3, 4, 5, 6].map((minute) => ({ minute, co2_lab_ppm: 1480 + 25 * minute }));
        const compare = { node: "lab", property: "co2Ppm", column: "co2_lab_ppm" };
        // Qe given where Qe / V was meant: the twin empties the room at once.
        const wrong = earlySlopeOf({ "lab.co2Ppm": [1480, 1300, 1100, 950, 820, 730, 660] }, compare, rows);
        assert.deepEqual(wrong, { column: "co2_lab_ppm", minutes: 5, predicted: -150, measured: 25 });
        assert.match(plausibilityOf(wrong).join(), /^units: over the first 5 minutes the twin moves -150 ppm\/min where co2_lab_ppm moves 25 ppm\/min, the other way\. .*Qe \/ V \(1\/min\)/);
        // The terms of the balance at the first minute name the one out of scale: a concentration wired into an emission.
        const spec = { nodes: [], connections: [{ from: ["habb_co2", "value"], to: ["lab", "emissionB"] }, { from: ["crew", "co2Emission"], to: ["lab", "emissionA"] }, { from: ["scrubber", "command"], to: ["other", "x"] }] } as never;
        const inflows = inflowsOf({ "habb_co2.value": [1500, 1501], "crew.co2Emission": [33.3] }, spec, "lab");
        assert.deepEqual(inflows, [{ from: "habb_co2.value", into: "emissionB", value: 1500 }, { from: "crew.co2Emission", into: "emissionA", value: 33.3 }]);
        assert.match(plausibilityOf({ ...wrong!, inflows }).join(), /What enters the node at the first minute: habb_co2\.value into emissionB = 1500; crew\.co2Emission into emissionA = 33\.3\./);
        // A right start and a late parting (an exchange) is not a unit's fault: nothing said.
        const right = earlySlopeOf({ "lab.co2Ppm": [1480, 1506, 1531, 1555, 1580, 1602, 1600] }, compare, rows);
        assert.deepEqual(plausibilityOf(right), []);
    });

    it("a constant the request gives as known is never fitted: the evaluation refuses before any run, and says why", async () => {
        const task = { objective: { required_outputs: [], constraints: { residualPpmMax: 25 } }, requirements: { known: [{ symbol: "tau", name: "scrubber lag", value: 3.33, unit: "min", source: "scrubber-1-datasheet" }] } } as unknown as TaskFile["task"];
        const rows = [0, 1, 2].map((minute) => ({ minute, co2_lab_ppm: 1480 }));
        let calls = 0;
        const broker = { call: async () => (calls++, { ok: false, outcome: "refused" }) } as never;
        const input = { label: "x", spec: { nodes: [{ id: "lab", typeId: "Physics.LifeSupport:cabin-air" }], connections: [] }, compare: [{ node: "lab", property: "co2Ppm", column: "co2_lab_ppm" }], variables: { V: 30 }, fit: { TAU: { min: 1, max: 60 } } };
        await assert.rejects(evaluateCandidate(input, { broker, taskId: "t", task, rows, remaining: 40, n: 1 }), /the request gives TAU \(scrubber lag = 3\.33 min, scrubber-1-datasheet\) as known: a documented constant is held in variables, never fitted/);
        assert.equal(calls, 0, "refused before the sandbox");
    });

    it("a constant documented as a band may be placed within it by the fit, never searched outside", async () => {
        const task = { objective: { required_outputs: [], constraints: { residualPpmMax: 25 } }, requirements: { known: [{ symbol: "g", name: "CO2 per person awake", value: 0.38, unit: "L/min", source: "nasa-crew-metabolic-loads", min: 0.26, max: 0.45 }] } } as unknown as TaskFile["task"];
        const rows = [0, 1, 2].map((minute) => ({ minute, co2_lab_ppm: 1480 }));
        let calls = 0;
        const broker = { call: async () => (calls++, { ok: false, outcome: "refused", error: "no sandbox here" }) } as never;
        const spec = { nodes: [{ id: "lab", typeId: "Physics.LifeSupport:cabin-air" }], connections: [] };
        const compare = [{ node: "lab", property: "co2Ppm", column: "co2_lab_ppm" }];
        await assert.rejects(evaluateCandidate({ label: "x", spec, compare, fit: { g: { min: 0.1, max: 1 } } }, { broker, taskId: "t", task, rows, remaining: 40, n: 1 }), /a documented band bounds the search: g searched over 0\.1 to 1, documented 0\.26 to 0\.45 L\/min \(nasa-crew-metabolic-loads\)/);
        assert.equal(calls, 0);
        // Within the band the search is allowed: it reaches the sandbox (which, here, refuses).
        await assert.rejects(evaluateCandidate({ label: "x", spec, compare, fit: { g: { min: 0.26, max: 0.45 } } }, { broker, taskId: "t", task, rows, remaining: 40, n: 1 }), /the candidate does not build/);
        assert.ok(calls > 0);
    });

    it("the station's reference graph is read from the library's shelf by types and ports, and a candidate is compared with it; the cabin twin stays readable", () => {
        const station = stationReference();
        assert.ok(station, "the library's habitat graph is readable");
        const wires = station!.wires.map((w) => `${w.from} -> ${w.to}`);
        assert.ok(wires.includes("Logic.Time:timeline.value -> Physics.Habitat:scrubber.command"));
        assert.ok(wires.includes("Physics.Habitat:scrubber.co2Delta -> Physics.Scene:atmosphere.delta_CO2_1"));
        assert.ok(wires.includes("Physics.Habitat:person.co2Delta -> Physics.Habitat:crew.person_0"), "the persons into their crew");
        assert.ok(wires.includes("Physics.Scene:atmosphere.atmosphere_out -> Physics.Scene:atmosphere-gate.atmosphere_A_in"), "the gates bound to the airs");
        assert.ok(!station!.types.some((t) => /Scene:moon|Control\.Sim/.test(t)), "the scene preset and the solver are the frame, not the physics");
        assert.ok(station!.types.includes("Physics.Scene:atmosphere") && station!.types.includes("DSP.Sensor:transducer"));
        const hand = compareStructure(labCandidate(true) as never, station!);
        assert.equal(hand.sharedWires.length, 0, "the life-support form shares no typed wire with the reference");
        assert.equal(hand.wiringMatch, 0);
        const cabin = cabinReference();
        assert.ok(cabin && cabin.wires.map((w) => `${w.from} -> ${w.to}`).includes("Logic.Time:timeline.value -> Physics.LifeSupport:scrubber.command"), "graphs/cabin.spikypanda, still read for comparison");
        assert.equal(referenceOfSpec(labCandidate(false) as never, "x").wires.length, 3);
    });

    it("a spec the runtime would take silently and wrongly is refused before any run: a formula as a segment's text, segments that end in seconds", () => {
        const spec = { nodes: [{ id: "speed", typeId: "Logic.Time:timeline", params: { segments: JSON.stringify([{ from: 0, to: 60, value: "speed_percent * 0.01" }]) } }, { id: "crew", typeId: "Logic.Time:timeline", params: { segments: JSON.stringify([{ from: 0, to: 3600, value: "light_work" }]) } }], connections: [] } as never;
        const problems = specProblems(spec, ["V"], ["minute", "speed_percent"], 60);
        assert.equal(problems.length, 2);
        assert.match(problems[0], /node "speed": a segment's value is the text "speed_percent \* 0\.01"/);
        assert.match(problems[1], /node "speed": its segments end at 60 s, and the telemetry runs 60 min/);
        assert.deepEqual(specProblems(labCandidate(true) as never, ["V"], ["minute"], 60), [], "the $series form is not literal segments");
    });

    it("the stand-in world rises at 30 %, decays at 100 %, and its neighbour moves", () => {
        assert.equal(TELEMETRY.length, 51);
        assert.ok(TELEMETRY[20].co2_lab_ppm > TELEMETRY[0].co2_lab_ppm + 150, "the rise");
        assert.ok(TELEMETRY[50].co2_lab_ppm < TELEMETRY[20].co2_lab_ppm - 200, "the decay");
        assert.ok(TELEMETRY[50].co2_habb_ppm > TELEMETRY[0].co2_habb_ppm + 50, "Hab-B is not a constant");
    });

    it("the validator accepts only a candidate the harness built and found under the threshold", () => {
        const progress = newProgress();
        const c = (n: number, pass: boolean): Candidate => ({ n, label: "", path: `candidate-${n}.spikypanda`, sha256: String(n).repeat(64), nodes: 4, types: [], connections: 3, variables: {}, residuals: [{ column: "c", probe: "lab.co2Ppm", rmse: pass ? 3 : 45, worst: 0, worstMinute: 0 }], threshold: 25, pass, combinations: 1, fitted: [], estimator: "given", warnings: [], at: "" });
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

    it("the library lists the habitat graph with its words in the caller's language, and refuses to fit its known constants", async () => {
        const en = await broker.call("library", "graphs", {});
        assert.ok(en.ok, en.error);
        const graphs = (en.output as { graphs: Array<{ id: string; wording: string; description: string; variables: Record<string, { status: string; description: string }>; settings: Record<string, unknown>; probes: Array<{ node: string; column?: string; name?: string }> }> }).graphs;
        const habitat = graphs.find((g) => g.id === "habitat");
        assert.ok(habitat, "the habitat graph is on the shelf");
        assert.equal(habitat!.wording, "default:en");
        assert.match(habitat!.description, /two-module lunar habitat/);
        assert.equal(habitat!.variables.Qe.status, "known");
        assert.match(habitat!.variables.L.description, /filter's loading/);
        assert.ok(habitat!.probes.some((p) => p.node === "co2-1" && p.column === "co2_lab_ppm" && /sensor/.test(String(p.name))));
        const fr = await broker.call("library", "graphs", { grammar: "claude:fr" });
        const habitatFr = (fr.output as { graphs: Array<{ wording: string; variables: Record<string, { description: string }> }> }).graphs[0];
        assert.equal(habitatFr.wording, "default:fr", "no wording for the claude family in French: the default of the locale");
        assert.match(habitatFr.variables.L.description, /la charge du filtre/);
        const one = await broker.call("library", "graph", { id: "habitat" });
        assert.ok(one.ok && (one.output as { template: { spec: { nodes: unknown[] } } }).template.spec.nodes.length >= 20, "the template comes whole");
        const missing = await broker.call("library", "graph", { id: "cabin" });
        assert.ok(!missing.ok && /no graph "cabin"/.test(missing.error ?? ""));
        // The harness holds a library graph's known constants: a fit on one is refused before any run.
        const task = { objective: { required_outputs: [], constraints: { residualPpmMax: 10 } }, observations: {}, requirements: {} } as unknown as TaskFile["task"];
        await assert.rejects(evaluateCandidate({ label: "x", graph: "habitat", fit: { Qe: { min: 0.5, max: 2 } } }, { broker, taskId: "t", task, rows: TELEMETRY as never, remaining: 40, n: 1 }), /"Qe" is a known constant of graph "habitat"/);
        await assert.rejects(evaluateCandidate({ label: "x", graph: "habitat", fit: { V: { min: 1, max: 5000 } } }, { broker, taskId: "t", task, rows: TELEMETRY as never, remaining: 40, n: 1 }), /"V" searched over 1 to 5000, but graph "habitat" bounds it/);
        await assert.rejects(evaluateCandidate({ label: "x", spec: labCandidate(false) as never, graph: "habitat", compare: [] }, { broker, taskId: "t", task, rows: TELEMETRY as never, remaining: 40, n: 1 }), /a spec or a library graph, not both/);
    });

    it("the ventilation at its design flow is refused by its residual, the same graph with the filter's loading fitted holds and finds the world's volume and flow", async () => {
        const r = await broker.call("factory", "request", {
            // 10 ppm, a few times the sensors' noise: at 25 the design flow passes too (about 19 ppm, the volume compensating).
            objective: { required_outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm" }], constraints: { residualPpmMax: 10 } },
            observations: { labOccupants: 2 },
            data: [{ file: "telemetry.json", rows: TELEMETRY }],
            requirements: { objective: "reproduce the Lab CO2 during the decay test", missing_information: ["the flow the inter-module ventilation delivers, hatch closed"] },
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
        const [nominal, coupled] = candidates;
        const alone = nominal;
        assert.equal(alone.graph, "habitat", "the library's graph, instantiated");
        assert.deepEqual(alone.settings, { labOccupants: 2, habOccupants: 2 });
        assert.deepEqual([...(alone.defaulted ?? [])].sort(), ["Qe", "eta", "gRest", "lag"], "the known constants at the graph's defaults");
        assert.equal(alone.pass, false);
        assert.ok(alone.residuals[0].rmse > 10, `the design flow: ${alone.residuals[0].rmse} ppm at V ${alone.variables.V}`);
        assert.equal(coupled.pass, true);
        assert.ok(coupled.residuals.every((r) => r.rmse < 10), `with the delivered flow: ${coupled.residuals.map((r) => `${r.column} ${r.rmse}`).join(", ")} ppm`);
        assert.ok(Math.abs(coupled.variables.V - LAB_WORLD.VLab) / LAB_WORLD.VLab < 0.1, `V ${coupled.variables.V} for ${LAB_WORLD.VLab}`);
        const delivered = deliveredFlowM3PerMinute(readHabitatParameters(), coupled.variables.L);
        assert.ok(Math.abs(delivered - LAB_WORLD.q) / LAB_WORLD.q < 0.15, `the loading ${coupled.variables.L} kg delivers ${delivered.toFixed(2)} m3/min for ${LAB_WORLD.q}`);
        assert.equal(coupled.estimator, "nelder-mead");
        assert.ok(coupled.combinations <= 61, `${coupled.combinations} runs`);
        assert.ok(coupled.nodes === alone.nodes && coupled.fitted.includes("L") && !alone.fitted.includes("L"), "the structure is the reference's in both; what changed is that the flow is measured");
        assert.ok(result.manifest.artifacts.some((a) => a.kind === "graph" && a.path === coupled.path && a.sha256 === coupled.sha256));
        assert.ok(result.manifest.artifacts.some((a) => a.kind === "graph" && a.path === alone.path), "the refused candidate stays, as evidence");
        const said = JSON.parse((await (await broker.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://mother" })).contents[0].text) as MotherLine[];
        const lines = said.filter((l) => l.key.startsWith("mother.candidate")).map((l) => l.text.en);
        const worst = (c: Candidate) => Math.round(Math.max(...c.residuals.map((r) => r.rmse)));
        assert.deepEqual(lines, [`Simulator 1. ${alone.nodes} nodes. Residual ${worst(alone)} ppm, above the threshold of 10. Rejected.`, `Simulator 2. ${coupled.nodes} nodes. Residual ${worst(coupled)} ppm, under the threshold of 10. Accepted.`]);
    });
});
