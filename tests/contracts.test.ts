/**
 * The contract layer (2026-09-25, night): typed facts, the hierarchy of
 * sources, the conflicts between them, generic; and where the demo uses
 * it: the library's fact sidecars, the Observer's guard (a known constant
 * cites a fact and is judged against that fact alone), the graph factory
 * (a SOURCE_CONFLICT refuses the plan and says who must revise).
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import { AUTHORITY, checkKnownAgainstFact, conflictsOf, reviewContracts, taskFacts, type Fact, type LibraryFact } from "../harness/core/contracts.js";
import { loadFacts, LIBRARY_DIR } from "../slots/tools/library/provider.js";
import { checkTwinRequest, type TwinFactoryRequest } from "../harness/observer/request.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import { reasoningStateOf } from "../harness/core/reasoning-state.js";
import { requirementsOf } from "../harness/topics/graph/index.js";
import { GRAPH_TOPIC } from "../harness/topics/graph/index.js";
import type { TaskFile } from "../harness/core/task.js";
import { fromRoot } from "../lib/paths.js";
import { existsSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { runTask, type BuilderContext } from "../harness/core/runner.js";
import { ScriptedGraphBuilder } from "../harness/scripted/graph.js";
import { taskDir } from "../slots/tools/lib/workshop.js";

const PORT = 3128;
const DEVICES = (JSON.parse(readFileSync(fromRoot("specs", "commissioning-devices.json"), "utf8")) as { devices: unknown[] }).devices;
const library = (): Array<LibraryFact & { source: string }> => ["scrubber-1-datasheet", "station-topology", "nasa-crew-metabolic-loads"].flatMap((id) => loadFacts(LIBRARY_DIR, id).map((f) => ({ ...f, source: id })));

const fact = (id: string, value: number, unit: string, status: Fact["status"], producer: string, extra: Partial<Fact> = {}): Fact => ({ id, unit, value, status, producer, source: producer, ...extra });

describe("the contract layer, generic: facts, authority, conflicts", () => {
    it("the same fact from three sources: the device and the datasheet agree within the tolerance, the Observer's 40 percent does not, and it is the Observer who revises", () => {
        assert.deepEqual([...AUTHORITY], ["measured", "device", "documented", "library", "derived", "assumed"]);
        const facts = [fact("scrubber.singlePassEfficiency", 40, "percent", "documented", "observer", { semantic: "SinglePassRemovalEfficiency" }), fact("scrubber.singlePassEfficiency", 0.30303, "ratio", "device", "register"), fact("scrubber.singlePassEfficiency", 0.3, "ratio", "library", "library")];
        const conflicts = conflictsOf(facts);
        assert.equal(conflicts.length, 1);
        const c = conflicts[0];
        assert.equal(c.authoritative.producer, "register");
        assert.deepEqual(c.values.map((v) => [v.producer, v.agrees]), [["register", true], ["observer", false], ["library", true]]);
        assert.equal(c.values[1].converted, 0.4, "40 percent read as a ratio");
        assert.equal(c.revise, "observer");
        assert.match(c.reason, /observer \(documented, observer\) says 40 percent against register \(device, register\) 0.30303 ratio: REQUIRE_RESOLUTION, observer to revise/);
        // Consistent when the Observer copies the fact, in the fact's unit or converted.
        assert.deepEqual(conflictsOf([facts[1], facts[2], fact("scrubber.singlePassEfficiency", 30, "percent", "documented", "observer")]), []);
        assert.deepEqual(conflictsOf([fact("scrubber.effectiveFlowAtFull", 1, "m3/min", "library", "library"), fact("scrubber.effectiveFlowAtFull", 1000, "L/min", "documented", "observer"), fact("scrubber.effectiveFlowAtFull", 0.016667, "m3ps", "device", "register")]), []);
        // A band: a value within it agrees; a unit that does not convert is a conflict too.
        assert.deepEqual(conflictsOf([fact("crew.co2Rate.awake", 0.38, "L/min", "library", "library", { min: 0.26, max: 0.45 }), fact("crew.co2Rate.awake", 0.42, "L/min", "documented", "observer")]), []);
        assert.equal(conflictsOf([fact("crew.co2Rate.awake", 0.38, "L/min", "library", "library", { min: 0.26, max: 0.45 }), fact("crew.co2Rate.awake", 0.6, "L/min", "documented", "observer")]).length, 1);
        assert.match(conflictsOf([fact("x", 1, "m3/min", "device", "register"), fact("x", 1, "kg/s", "documented", "observer")])[0].reason, /not convertible/);
        const report = reviewContracts(facts, ["scrubber.lagTimeConstant"]);
        assert.deepEqual([report.status, report.missing, report.reviewed], ["CONFLICT", ["scrubber.lagTimeConstant"], 1]);
        assert.equal(reviewContracts([facts[1]], ["scrubber.lagTimeConstant"]).status, "MISSING");
        assert.equal(reviewContracts([facts[1], facts[2]]).status, "CONSISTENT");
    });

    it("the facts of a task: the request's known constants by fact id, the register's properties named through the library's sidecars, the library's own", () => {
        const task = { requirements: { known: [{ symbol: "eta", value: 40, unit: "percent", source: "scrubber-1-datasheet", factId: "scrubber.singlePassEfficiency" }, { symbol: "Qe", value: 1, unit: "m3/min", source: "scrubber-1-datasheet", factId: "scrubber.effectiveFlowAtFull" }] }, observations: { devices: DEVICES } };
        const facts = taskFacts(task, library());
        const eta = facts.filter((f) => f.id === "scrubber.singlePassEfficiency");
        assert.deepEqual(eta.map((f) => [f.producer, f.status, f.value, f.unit]), [["observer", "documented", 40, "percent"], ["register", "device", 0.30303, "ratio"], ["library", "library", 0.3, "ratio"]]);
        assert.equal(eta[0].semantic, "SinglePassRemovalEfficiency", "the Observer's fact takes the library's semantic");
        assert.ok(!facts.some((f) => f.id === "speed"), "a property no sidecar names is nobody's claim");
        const report = reviewContracts(facts);
        assert.equal(report.status, "CONFLICT");
        assert.deepEqual(report.conflicts.map((c) => [c.id, c.revise]), [["scrubber.singlePassEfficiency", "observer"]]);
        const fixed = taskFacts({ ...task, requirements: { known: [{ symbol: "eta", value: 0.30303, unit: "ratio", source: "scrubber-1-datasheet", factId: "scrubber.singlePassEfficiency" }] } }, library());
        assert.equal(reviewContracts(fixed).status, "CONSISTENT");
    });

    it("a known constant against the fact it cites: the value, the unit converted, a band; an efficiency is never judged against a speed", () => {
        const [efficiency] = loadFacts(LIBRARY_DIR, "scrubber-1-datasheet").filter((f) => f.id === "scrubber.singlePassEfficiency");
        assert.equal(checkKnownAgainstFact({ value: 0.30303, unit: "ratio" }, efficiency).verdict, "OK");
        assert.equal(checkKnownAgainstFact({ value: 30, unit: "percent" }, efficiency).verdict, "OK");
        const wrong = checkKnownAgainstFact({ value: 40, unit: "percent" }, efficiency);
        assert.equal(wrong.verdict, "CONFLICT");
        assert.match(wrong.reason, /40 percent is 0.4 ratio; the fact scrubber.singlePassEfficiency \(SinglePassRemovalEfficiency\) is 0.3 ratio/);
        const [awake] = loadFacts(LIBRARY_DIR, "nasa-crew-metabolic-loads").filter((f) => f.id === "crew.co2Rate.awake");
        assert.equal(checkKnownAgainstFact({ value: 0.42, unit: "L/min" }, awake).verdict, "OK", "within the band");
        assert.equal(checkKnownAgainstFact({ value: 0.0115, unit: "kg/s" }, awake).verdict, "CONFLICT");
    });

    it("the Observer's guard: a constant from a document with typed facts cites one and is judged against it; the modules are not isolated with the hatch closed", () => {
        const facts = { "scrubber-1-datasheet": loadFacts(LIBRARY_DIR, "scrubber-1-datasheet"), "station-topology": loadFacts(LIBRARY_DIR, "station-topology") };
        const base: Partial<TwinFactoryRequest> = {
            objective: "reproduce the Lab CO2",
            entities: [{ name: "Lab" }],
            observables: [{ name: "co2", quantity: "Concentration", unit: "ppm", column: "co2_lab_ppm" }],
            inputs: [{ name: "speed", quantity: "Dimensionless", unit: "percent" }],
            outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm" }],
            required_behaviors: ["the CO2 decays at full speed"],
            validation: { criteria: ["predicted_co2 against co2_lab_ppm"] },
        } as unknown as Partial<TwinFactoryRequest>;
        const context = { documentsRead: ["scrubber-1-datasheet", "station-topology"], documents: { "scrubber-1-datasheet": "", "station-topology": "" }, facts };
        const check = (known: unknown[], more: Partial<TwinFactoryRequest> = {}) => checkTwinRequest({ ...base, ...more, known } as unknown as Partial<TwinFactoryRequest>, context);
        assert.match(check([{ symbol: "eta", name: "efficiency", value: 0.3, unit: "ratio", source: "scrubber-1-datasheet" }]).problems.join("; "), /^facts: known constant "eta" cites "scrubber-1-datasheet", which states its facts by id: give factId, one of scrubber.flowAtFull/);
        assert.match(check([{ symbol: "eta", name: "efficiency", value: 0.3, unit: "ratio", source: "scrubber-1-datasheet", factId: "scrubber.efficiency" }]).problems.join("; "), /cites fact "scrubber.efficiency", which "scrubber-1-datasheet" does not state/);
        // The fifth passage's mistake: 40 % is the speed floor, not the efficiency; with the fact cited, the guard says so.
        const forty = check([{ symbol: "eta", name: "efficiency", value: 40, unit: "percent", source: "scrubber-1-datasheet", factId: "scrubber.singlePassEfficiency" }]);
        assert.match(forty.problems.join("; "), /^facts: known constant "eta" = 40 percent conflicts with the fact it cites: 40 percent is 0.4 ratio; the fact scrubber.singlePassEfficiency \(SinglePassRemovalEfficiency\) is 0.3 ratio \(single-pass removal efficiency/);
        assert.equal(check([{ symbol: "eta", name: "efficiency", value: 30, unit: "percent", source: "scrubber-1-datasheet", factId: "scrubber.singlePassEfficiency" }]).ok, true);
        assert.equal(check([{ symbol: "Qe", name: "effective flow", value: 1000, unit: "L/min", source: "scrubber-1-datasheet", factId: "scrubber.effectiveFlowAtFull" }]).ok, true);
        // The fourth passage: the awake rate written in mass while citing the volume fact; the guard names the mass fact to cite.
        const nasa = { ...facts, "nasa-crew-metabolic-loads": loadFacts(LIBRARY_DIR, "nasa-crew-metabolic-loads") };
        const mass = checkTwinRequest({ ...base, known: [{ symbol: "G", name: "awake rate", value: 0.69, unit: "g/min", source: "nasa-crew-metabolic-loads", factId: "crew.co2Rate.awake" }] } as unknown as Partial<TwinFactoryRequest>, { ...context, documentsRead: [...context.documentsRead, "nasa-crew-metabolic-loads"], facts: nasa });
        assert.match(mass.problems.join("; "), /does not convert into the fact's unit L\/min.*the document states that fact in g\/min as "crew.co2Rate.awake.mass" \(0.69 g\/min\): cite that id/);
        // The hatch: an assumption of isolated modules contradicts the documented ventilation; one about the hatchway alone does not.
        const isolated = check([], { assumptions: ["no air exchange between the Lab and Hab-B with the hatch closed"] });
        assert.match(isolated.problems.join("; "), /^facts: assumptions "no air exchange between the Lab and Hab-B with the hatch closed" treats the modules as isolated with the hatch closed; the station documents the opposite \(station-topology, habitat.interModuleVentilation.designFlow.hatchClosed/);
        assert.equal(check([], { assumptions: ["no exchange through the hatchway while it is closed; what the ventilation delivers is unknown"] }).ok, true);
        assert.equal(check([], { required_behaviors: ["the CO2 decays at full speed", "Hab-B is isolated: zero coupling between the modules"] }).ok, false);
    });

    it("the graph factory: a SOURCE_CONFLICT in the task's facts refuses the plan and names who must revise; the state carries the report", async () => {
        const task = { objective: { required_outputs: [], constraints: { rmsePpmMax: 10 } }, observations: { devices: DEVICES }, requirements: { known: [{ symbol: "eta", value: 40, unit: "percent", source: "scrubber-1-datasheet", factId: "scrubber.singlePassEfficiency" }] }, budget: { iterations: 12, minutes: 10 } } as unknown as TaskFile["task"];
        const progress = newProgress();
        progress.context = { shelf: [{ id: "habitat", description: "", types: [], variables: {}, settings: [], probes: [] }], telemetry: { file: "t", rows: 1, columns: ["minute"], minutes: 1 }, contracts: reviewContracts(taskFacts(task, library())) };
        assert.equal(requirementsOf(progress, task).sourcesConsistent, false);
        const refusals = await GRAPH_TOPIC.guard!("task.plan", { selected_nodes: [], missing_capabilities: [] }, { broker: null as never, taskId: "t", task, progress });
        assert.match(refusals.join("; "), /the plan needs sourcesConsistent: SOURCE_CONFLICT: the task's sources disagree on a fact/);
        const state = reasoningStateOf({ task, progress, budget: task.budget, nextActions: [], shelf: progress.context.shelf, telemetry: progress.context.telemetry, contracts: progress.context.contracts });
        assert.equal(state.invariants.contracts?.status, "CONFLICT");
        assert.deepEqual(state.invariants.contracts?.conflicts.map((c) => [c.id, c.revise]), [["scrubber.singlePassEfficiency", "observer"]]);
        progress.context.contracts = reviewContracts(taskFacts({ ...task, requirements: {} }, library()));
        assert.equal(requirementsOf(progress, task).sourcesConsistent, true);
    });
});

describe("the library's typed facts, through the broker", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let broker: Broker;
    let recipesDir = "";
    const tasks: string[] = [];

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        recipesDir = mkdtempSync(path.join(tmpdir(), "recipes-"));
        ({ broker: local, slots } = await startAllOrFail(PORT));
        broker = new Broker(local.httpBase, { name: "contracts-test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        await broker?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
        for (const t of tasks) if (existsSync(taskDir(t))) rmSync(taskDir(t), { recursive: true, force: true });
        if (recipesDir) rmSync(recipesDir, { recursive: true, force: true });
    });

    it("a task whose sources conflict ends before any step: SOURCE_CONFLICT, REQUIRE_RESOLUTION, the producer to revise named", async () => {
        const r = await broker.call("factory", "request", {
            objective: { required_outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm" }], constraints: { rmsePpmMax: 10 } },
            observations: { devices: DEVICES },
            data: [{ file: "telemetry.json", rows: [{ minute: 0, co2_lab_ppm: 1000, co2_habb_ppm: 1000, speed_percent: 30 }, { minute: 1, co2_lab_ppm: 1010, co2_habb_ppm: 1000, speed_percent: 30 }] }],
            requirements: { objective: "reproduce the Lab CO2", known: [{ symbol: "eta", name: "efficiency", value: 40, unit: "percent", source: "scrubber-1-datasheet", factId: "scrubber.singlePassEfficiency" }] },
            budget: { iterations: 6, twinPoints: 20 },
            builder: "scripted",
            requestedBy: "contracts-test",
            run: false,
        });
        assert.ok(r.ok, r.error);
        const taskId = (r.output as { taskId: string }).taskId;
        tasks.push(taskId);
        const result = await runTask({ broker, taskId, recipesDir, provider: (ctx: BuilderContext) => new ScriptedGraphBuilder(ctx) });
        assert.equal(result.state, "failed");
        assert.equal(result.manifest.steps.length, 0, "no step: the conflict is settled upstream, not planned over");
        assert.match(String(result.manifest.ended), /^SOURCE_CONFLICT: scrubber\.singlePassEfficiency: observer \(documented, scrubber-1-datasheet\) says 40 percent against register \(device, \/habitat\/lab\/eclss\/scrubber-1\) 0\.30303 ratio: REQUIRE_RESOLUTION, observer to revise; REQUIRE_RESOLUTION: observer to revise, upstream of this task/);
    });

    it("library.facts lists every fact with its document; library.read carries a document's facts; the catalogue counts them", async () => {
        const all = await broker.call("library", "facts", {});
        assert.ok(all.ok, all.error);
        const facts = (all.output as { facts: Array<LibraryFact & { source: string }> }).facts;
        assert.ok(facts.length >= 12, String(facts.length));
        const eta = facts.find((f) => f.id === "scrubber.singlePassEfficiency");
        assert.deepEqual([eta?.source, eta?.semantic, eta?.value, eta?.unit, eta?.device], ["scrubber-1-datasheet", "SinglePassRemovalEfficiency", 0.3, "ratio", { type: "Scrubber", property: "singlePassEfficiency" }]);
        const one = await broker.call("library", "facts", { id: "station-topology" });
        assert.ok(one.ok && (one.output as { facts: unknown[] }).facts.length === 4);
        const read = await broker.call("library", "read", { id: "scrubber-1-datasheet" });
        assert.ok(read.ok && (read.output as { facts: unknown[] }).facts.length === 5);
        const list = await broker.call("library", "list", {});
        const doc = (list.output as { documents: Array<{ id: string; facts: number }> }).documents.find((d) => d.id === "scrubber-1-datasheet");
        assert.equal(doc?.facts, 5);
        const none = await broker.call("library", "facts", { id: "nowhere" });
        assert.ok(!none.ok);
    });
});
