/**
 * The Twin Requirement Observer (`harness/observer/`): the guard of a
 * TWIN_FACTORY_REQUEST (the shape, the separation from the node catalogue,
 * the facts of the telemetry), the summary of the telemetry the model is
 * given instead of the rows, and the Observer through the broker, a task of
 * the factories' harness since 2026-10-10: a model whose first request names
 * a node of the catalogue is refused with the reason in its next prompt, its
 * second is accepted, handed over, and becomes a factory task carrying the
 * requirements whole; its conduct (read first, so many attempts) is the
 * playbook's. The model here is a stand-in; the demo's is the one behind the
 * reasoner slot, and the slot says so plainly when that one is not ready.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { Provider, ProviderExchange } from "../harness/lib/provider.js";
import { checkTwinRequest, factoryContractOf, type TwinFactoryRequest, hedgedNumbers, withFactIds } from "../harness/observer/request.js";
import { summarizeTelemetry } from "../harness/observer/telemetry.js";
import { observe } from "../harness/observer/observer.js";
import { taskDir } from "../slots/tools/lib/workshop.js";

const PORT = 3122;

const REQUEST: TwinFactoryRequest = {
    objective: "Reproduce the CO2 dynamics of the Lab well enough to evaluate scrubber speed strategies.",
    entities: [{ name: "lab air volume" }, { name: "scrubber" }, { name: "occupants" }, { name: "hatch to hab-b" }],
    relationships: [{ from: "occupants", to: "lab air volume", relation: "produce CO2 into" }, { from: "scrubber", to: "lab air volume", relation: "removes CO2 from" }],
    observables: [{ name: "lab CO2", quantity: "Concentration", unit: "ppm", column: "co2_ppm" }],
    controls: [{ name: "scrubber speed", quantity: "Ratio", unit: "percent", column: "speed_percent" }],
    external_influences: [{ name: "occupancy", quantity: "Count", unit: "1" }],
    inputs: [{ name: "scrubber speed", quantity: "Ratio", unit: "percent", column: "speed_percent" }],
    outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm", horizonMinutes: 30 }],
    required_behaviors: ["CO2 accumulation from the occupants", "CO2 removal by the scrubber, faster at higher speed"],
    missing_information: ["the served volume", "the flow the inter-module ventilation delivers, hatch closed"],
    assumptions: ["the Lab air is well mixed"],
    validation: { criteria: ["residual under 150 ppm over the test"], compare: [{ output: "predicted_co2", against: "co2_ppm" }] },
};
const COLUMNS = ["minute", "co2_ppm", "speed_percent"];
const ROWS = Array.from({ length: 25 }, (_, m) => ({ minute: m, co2_ppm: m <= 12 ? 1480 + 105 * m : 800 + 1940 * Math.exp(-(m - 12) / 18.4), speed_percent: m <= 12 ? 30 : 100 }));

describe("the Observer's guard and its telemetry", () => {
    it("accepts a request that states needs, with its quantities, against the telemetry it was given", () => {
        assert.deepEqual(checkTwinRequest(REQUEST, { catalogueTypes: ["Physics.LifeSupport:cabin-air"], telemetryColumns: COLUMNS }), { ok: true, problems: [] });
        // Scope: an output no measurement judges quotes the description's words that ask for it; a flow nobody asked for is not required.
        const leakDescription = "The Lab and its scrubber. Also required: the twin must expose the CO2 that leaves the Lab through a leak in a seal, as a mass flow out of the volume.";
        const extra = (asked?: string) => ({ ...REQUEST, outputs: [...REQUEST.outputs, { name: "leak", quantity: "MassFlow", unit: "kg/s", ...(asked ? { asked } : {}) }] });
        assert.match(checkTwinRequest(extra(), { description: leakDescription }).problems.join(), /scope: output "leak" is compared with no measurement and quotes no words of the description/);
        assert.match(checkTwinRequest(extra("the inter-module CO2 flow"), { description: leakDescription }).problems.join(), /scope: output "leak": asked "the inter-module CO2 flow" is not in the description as written/);
        assert.equal(checkTwinRequest(extra("expose the CO2 that leaves the Lab through a leak in a seal"), { description: leakDescription }).ok, true);
        // The words quoted name the output: "The Lab and its scrubber" is in the description and names no leak.
        assert.match(checkTwinRequest(extra("The Lab and its scrubber"), { description: leakDescription }).problems.join(), /scope: output "leak": the words quoted \("The Lab and its scrubber"\) do not name it/);
        assert.equal(checkTwinRequest(extra(), {}).ok, true, "without the description the rule does not apply");
    });

    it("separation: a request that names a node of the catalogue is refused, by its id or by the id's shape", () => {
        const named = { ...REQUEST, required_behaviors: [...REQUEST.required_behaviors, "use Physics.LifeSupport:cabin-air for the room"] };
        const c = checkTwinRequest(named, { catalogueTypes: ["Physics.LifeSupport:cabin-air"] });
        assert.equal(c.ok, false);
        assert.match(c.problems[0], /^separation: the request names node types of the catalogue \(Physics\.LifeSupport:cabin-air\)/);
        assert.equal(checkTwinRequest({ ...REQUEST, objective: "Build it with Thermal.Room:rc-two-node" }).ok, false, "an id the catalogue does not hold yet is still a node, not a need");
    });

    it("facts: a column the telemetry does not have is refused; shape: quantities keep their units, validation is not optional", () => {
        const invented = { ...REQUEST, observables: [...REQUEST.observables, { name: "hab-b CO2", quantity: "Concentration", unit: "ppm", column: "co2_habb_ppm" }] };
        assert.match(checkTwinRequest(invented, { telemetryColumns: COLUMNS }).problems.join(), /facts: observables "hab-b CO2" is read from column "co2_habb_ppm", which the telemetry does not have/);
        const shapeless = { ...REQUEST, outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "" }], validation: { criteria: [] } };
        const problems = checkTwinRequest(shapeless).problems;
        assert.ok(problems.some((p) => /outputs "predicted_co2" does not say its quantity and unit/.test(p)));
        assert.ok(problems.some((p) => /no validation criterion/.test(p)));
    });

    it("vocabulary: an output named outside the quantities the factories share is refused, with the vocabulary to name it by", () => {
        const vocabulary = [{ quantity: "Concentration", units: ["ppm"] }, { quantity: "Volume", units: ["m3"] }];
        assert.equal(checkTwinRequest(REQUEST, { vocabulary }).ok, true);
        const own = { ...REQUEST, outputs: [{ name: "predicted_co2", quantity: "CO2 mole fraction", unit: "ppm" }] };
        assert.match(checkTwinRequest(own, { vocabulary }).problems.join(), /^vocabulary: output "predicted_co2" is a "CO2 mole fraction", which is not a quantity of the shared vocabulary; name it with one of: Concentration \(ppm\); Volume \(m3\)/);
        const unit = { ...REQUEST, outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "percent" }] };
        // Another unit of the same quantity converts, and passes; a unit of another quantity does not.
        assert.equal(checkTwinRequest(unit, { vocabulary }).ok, true, "percent converts to ppm: the factory's to convert");
        const foreign = { ...REQUEST, outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "kg" }] };
        assert.match(checkTwinRequest(foreign, { vocabulary }).problems.join(), /is a Concentration in "kg", which is not a unit of that quantity.*the shared vocabulary writes it in ppm, or any unit that converts to them/);
    });

    it("provenance: a known constant names a document the Observer read; a number obtained under an assumption is not a constraint", () => {
        const description = "Test just run: 50 % for 30 min, then 100 % for 30 min, hatch closed. Apparent volume from the decay, one room assumed: 35 m3 (tau 35.0 min over 31 samples, residual 7.8 ppm).";
        assert.deepEqual(hedgedNumbers(description).sort((a, b) => a - b), [7.8, 31, 35]);
        const known = [{ symbol: "Qe", name: "effective flow at full speed", value: 1.0, unit: "m3/min", source: "scrubber-1-datasheet" }];
        assert.equal(checkTwinRequest({ ...REQUEST, known }, { description, documentsRead: ["scrubber-1-datasheet"] }).ok, true);
        assert.match(checkTwinRequest({ ...REQUEST, known }, { description, documentsRead: [] }).problems.join(), /provenance: known constant "Qe" cites "scrubber-1-datasheet", a document you did not read/);
        const fixed = { ...REQUEST, constraints: ["Lab volume: 35 m3 (measured from decay test)", "The test lasts 60 minutes"] };
        const problems = checkTwinRequest(fixed, { description }).problems;
        assert.equal(problems.length, 1);
        assert.match(problems[0], /^provenance: constraints "Lab volume: 35 m3 \(measured from decay test\)" cites 35, which the description gives only under an assumption/);
        assert.match(checkTwinRequest({ ...REQUEST, known: [{ symbol: "V", name: "Lab volume", value: 35, unit: "m3", source: "x" }] }, { description }).problems.join(), /known constant "V" = 35 is a value the description gives only under an assumption/);
    });

    it("what the harness reads itself in a request (2026-10-10, run 7): the fact one fact alone of the cited document holds, a band whose end is the value; never a guess", () => {
        const fact = (id: string, value: number, unit: string, quantity: string) => ({ id, semantic: id, quantity, unit, value });
        const facts = { "scrubber-1-datasheet": [fact("scrubber.effectiveFlowAtFull", 1, "m3/min", "VolumeFlow"), fact("scrubber.flowAtFull", 3.3, "m3/min", "VolumeFlow"), fact("scrubber.lagTimeConstant", 3.33, "min", "Time"), fact("scrubber.singlePassEfficiency", 0.3, "1", "Ratio"), fact("scrubber.runFloor", 30, "%", "Ratio")] };
        const known = [
            { symbol: "Qe_full", name: "effective flow", value: 1, unit: "m3/min", source: "scrubber-1-datasheet", max: 1 },
            { symbol: "tau", name: "lag", value: 3.33, unit: "min", source: "scrubber-1-datasheet", min: 3.33, max: 3.33 },
            { symbol: "eta_sp", name: "efficiency", value: 0.3, unit: "dimensionless", source: "scrubber-1-datasheet" },
            { symbol: "G", name: "a band", value: 0.3, unit: "L/min", source: "nasa-crew-metabolic-loads", min: 0.2, max: 0.4 },
            // Run 9: the fields filled in with zeros around a value that is not.
            { symbol: "N", name: "crew", value: 4, unit: "1", source: "nasa-crew-metabolic-loads", min: 0, max: 0 },
        ];
        const { input, read } = withFactIds({ ...REQUEST, known }, facts) as { input: TwinFactoryRequest; read: string[] };
        assert.deepEqual(input.known!.map((k) => [k.symbol, k.factId ?? null, k.min ?? null, k.max ?? null]), [
            ["Qe_full", "scrubber.effectiveFlowAtFull", null, null],
            ["tau", "scrubber.lagTimeConstant", null, null],
            // A unit the unit system does not know: no fact holds it for sure, left to the guard and its list.
            ["eta_sp", null, null, null],
            // A real band, and a document without typed facts here: untouched.
            ["G", null, 0.2, 0.4],
            ["N", null, null, null],
        ]);
        assert.equal(read.length, 6);
        assert.match(read.join("; "), /known "Qe_full" = 1 m3\/min is the fact "scrubber.effectiveFlowAtFull" of "scrubber-1-datasheet" \(1 m3\/min\): factId written/);
        // Read, the request no longer carries the two points the guard refused on.
        const problems = checkTwinRequest(input, { documentsRead: ["scrubber-1-datasheet"], facts }).problems.join("; ");
        assert.doesNotMatch(problems, /Qe_full|tau|band/);
        assert.match(problems, /known constant "eta_sp"/);
    });

    it("the telemetry is summarised by code: counts, ends, range, mean, and whether a column moves", () => {
        const s = summarizeTelemetry(ROWS);
        assert.equal(s.rows, 25);
        const co2 = s.columns.find((c) => c.column === "co2_ppm")!;
        assert.equal(co2.first, 1480);
        assert.equal(co2.max, 2740);
        assert.equal(co2.varies, true);
        assert.equal(summarizeTelemetry([{ a: 1 }, { a: 1 }]).columns[0].varies, false);
    });

    it("the factory's contract from a request: the outputs required, the rest carried whole", () => {
        const c = factoryContractOf(REQUEST);
        assert.deepEqual(c.objective.required_outputs, [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm", horizonMinutes: 30 }]);
        assert.equal(c.requirements, REQUEST);
    });
});

/** What a stand-in reads of the state the harness rebuilds at every step. */
interface Seen {
    brief: string;
    lastCapability: string;
    state: {
        hypothesis: { description: string; telemetry: { rows?: number } | string; quantities: string; documents: string; needs: Array<{ need: string; candidates: Array<{ id: string; value: number }>; chosen?: unknown }> };
        requirements: Record<string, boolean>;
        marchingOrder: { stages: Array<{ step: number; status: string }>; allowedNow: string[]; closedNow: Array<{ tools: string[]; why: string }> };
        lastRefusal: { capability: string; reason: string } | null;
    };
}

/**
 * A stand-in for the model on the factories' harness: it reads the datasheet, hands over its requests in turn, and hands the
 * accepted one over; when the request is closed to it (no attempt left), it ends with task.fail. `eager` hands a request over
 * before reading, as a model that skips the marching order would. It reads what it is shown, like a model.
 */
class StandIn implements Provider {
    readonly name = "stand-in:observer";
    readonly model = "stand-in";
    readonly family = "stand-in";
    readonly exchanges: ProviderExchange[] = [];
    readonly contextMode = "state" as const;
    calls = 0;
    sent = 0;
    seen: Seen[] = [];
    constructor(
        private readonly requests: TwinFactoryRequest[],
        private readonly eager = false,
    ) {}
    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        const seen = input.state.features as unknown as Seen;
        this.seen.push(seen);
        // Each answer recorded as a provider records it: the runner reads a refused proposal there.
        const call = (capabilityId: string, x: unknown): PolicyDecision => {
            const decision: PolicyDecision = { action: { id: capabilityId, description: capabilityId }, invocation: { actionId: capabilityId, capabilityId, input: x as JsonValue }, rationale: "stand-in" };
            this.exchanges.push({ decisionId: input.decisionId, model: this.model, request: null, response: null, decision, proposedCapabilityId: capabilityId, proposedInput: x as JsonValue, latencyMs: 0, tokens: null } as unknown as ProviderExchange);
            return decision;
        };
        const s = seen.state;
        if (s.requirements.requestAccepted) return call("task.done", { summary: "the twin factory request, accepted", artifacts: [{ kind: "request", path: "requests/twin-request.json" }] });
        // The way out: task.fail its only tool.
        if (s.marchingOrder.allowedNow.length === 1 && s.marchingOrder.allowedNow[0] === "task.fail") return call("task.fail", { reason: s.marchingOrder.closedNow.map((c) => c.why).join("; ") });
        if (!s.requirements.documentRead && !(this.eager && this.sent === 0)) return call("library.read", { id: "scrubber-1-datasheet" });
        if (s.requirements.documentRead && !s.requirements.needsListed) return call("observer.needs", { needs: [{ name: "effective removal flow of the scrubber at full speed" }, { name: "volume of the Lab" }] });
        // The nearest fact for each need when the library found one, none otherwise.
        if (s.requirements.documentRead && !s.requirements.needsChosen) return call("observer.choose", { choices: s.hypothesis.needs.map((n) => ({ need: n.need, factId: n.need.includes("flow") ? (n.candidates[0]?.id ?? "") : "", why: n.need.includes("flow") ? "the nearest fact" : "no document gives it" })) });
        return call("observer.submit", this.requests[Math.min(this.sent++, this.requests.length - 1)]);
    }
}

const WITH_NODE = { ...REQUEST, entities: [...REQUEST.entities, { name: "Physics.LifeSupport:cabin-air" }] } as TwinFactoryRequest;
const DESCRIPTION = "The Lab of a lunar habitat: one CO2 scrubber, a CO2 sensor, a hatch to hab-b.";

describe("the Observer, a task of the factories' harness, through the broker", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let broker: Broker;
    const tasks: string[] = [];
    // The recipes of these tasks, kept apart: a read replayed from another test would not be the stand-in's.
    const recipesDir = mkdtempSync(path.join(tmpdir(), "observer-recipes-"));

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        ({ broker: local, slots } = await startAllOrFail(PORT));
        broker = new Broker(local.httpBase, { name: "observer-test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        await broker?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
        for (const t of tasks) if (existsSync(taskDir(t))) rmSync(taskDir(t), { recursive: true, force: true });
        rmSync(recipesDir, { recursive: true, force: true });
    });

    it("a request naming a node of the real catalogue is refused with the reason in the next prompt, the corrected one is handed over and becomes a factory task with its requirements", async () => {
        const model = new StandIn([WITH_NODE, REQUEST]);
        const result = await observe({ provider: model, broker, description: DESCRIPTION, telemetry: ROWS, recipesDir });
        tasks.push(result.observerTask);
        assert.equal(result.ok, true, JSON.stringify(result.attempts));
        assert.equal(result.state, "proposed", String(result.ended));
        assert.deepEqual(result.attempts.map((a) => a.ok), [false, true]);
        assert.match(result.attempts[0].problems[0], /^separation/);
        assert.deepEqual(result.reads, ["library.read scrubber-1-datasheet"]);
        // The selection (2026-10-10): the needs said, the library's nearest facts given back, the flow's fact chosen, the volume's none.
        const chosen = model.seen.at(-1)!.state.hypothesis.needs;
        assert.deepEqual(chosen.map((n) => n.need), ["effective removal flow of the scrubber at full speed", "volume of the Lab"]);
        assert.equal(chosen[0].candidates[0].id, "scrubber.effectiveFlowAtFull");
        assert.deepEqual((chosen[0].chosen as { id: string; value: number }).id, "scrubber.effectiveFlowAtFull");
        assert.equal(chosen[1].chosen, "none answers it");
        // What the model was shown: the description and the computed summary, never the rows and never the catalogue.
        assert.equal(model.seen[0].state.hypothesis.description, DESCRIPTION);
        assert.equal((model.seen[0].state.hypothesis.telemetry as { rows: number }).rows, 25);
        assert.match(model.seen[0].state.hypothesis.quantities, /Concentration \(/);
        assert.match(model.seen[0].state.hypothesis.documents, /scrubber-1-datasheet/);
        assert.doesNotMatch(JSON.stringify(model.seen), /registry_list|Physics\.Transform/);
        // After the refusal: the brief opens on it, the state holds it.
        const after = model.seen[4];
        assert.match(after.brief, /^Your last observer\.submit was refused, on \d+ point\(s\):.*separation/s);
        assert.equal(after.state.lastRefusal?.capability, "observer.submit");
        // The request handed over is the accepted file, and the station received it.
        const manifest = JSON.parse(readFileSync(path.join(taskDir(result.observerTask), "manifest.json"), "utf8")) as { artifacts: Array<{ kind: string; path: string }>; topic: string; proposal: { status: string } | null };
        assert.equal(manifest.topic, "observer");
        assert.deepEqual(manifest.artifacts.filter((a) => a.kind === "request").map((a) => a.path), ["requests/twin-request.json"]);
        assert.equal(manifest.proposal?.status, "received");
        // The contract names no factory: the Observer does not know which one will build.
        assert.equal("topics" in factoryContractOf(result.request!), false);
        const r = await broker.call("factory", "request", { ...factoryContractOf(result.request!), requestedBy: "observer", run: false });
        assert.ok(r.ok, r.error);
        const taskId = (r.output as { taskId: string }).taskId;
        tasks.push(taskId);
        const task = JSON.parse(readFileSync(path.join(taskDir(taskId), "task.json"), "utf8")) as { task: { requestedBy: string; topics: unknown; requirements: TwinFactoryRequest; objective: { required_outputs: unknown[] } } };
        assert.equal(task.task.requestedBy, "observer");
        assert.equal(task.task.topics, "auto", "the factory side chooses");
        assert.deepEqual(task.task.requirements.required_behaviors, REQUEST.required_behaviors);
        assert.equal(task.task.objective.required_outputs.length, 1);
    });

    it("its conduct: the marching order shows reading first with the request closed, a request before any read is refused by the playbook's gate and is not an attempt", async () => {
        const model = new StandIn([REQUEST], true);
        const result = await observe({ provider: model, broker, description: DESCRIPTION, telemetry: ROWS, recipesDir });
        tasks.push(result.observerTask);
        assert.equal(result.ok, true, JSON.stringify(result.attempts));
        const first = model.seen[0].state.marchingOrder;
        assert.deepEqual(first.stages.map((s) => `${s.step}:${s.status}`), ["1:current", "2:next", "3:next", "4:next", "5:next"]);
        assert.ok(!first.allowedNow.includes("observer.submit"));
        assert.match(first.closedNow.map((c) => c.why).join("; "), /^read first/);
        // The request sent anyway is refused by the gate, said in the next prompt; it is not one of the attempts.
        assert.match(model.seen[1].brief, /^Your last observer\.submit was refused, on \d+ point\(s\):.*read first/s);
        assert.deepEqual(result.attempts.map((a) => a.ok), [true]);
    });

    it("so many attempts and no more: the request closed once they are spent, the task ends with task.fail", async () => {
        const model = new StandIn([WITH_NODE]);
        const result = await observe({ provider: model, broker, description: DESCRIPTION, telemetry: ROWS, attempts: 2, recipesDir });
        tasks.push(result.observerTask);
        assert.equal(result.ok, false);
        assert.equal(result.state, "failed");
        assert.deepEqual(result.attempts.map((a) => a.ok), [false, false]);
        // The way out (2026-10-10, run 7): the whole marching order, task.fail its only tool, every other closed with its words.
        const last = model.seen.at(-1)!.state.marchingOrder;
        assert.deepEqual(last.stages.map((s) => `${s.step}:${s.status}`), ["1:current"]);
        assert.deepEqual(last.allowedNow, ["task.fail"]);
        assert.match(last.closedNow.map((c) => c.why).join("; "), /no attempt left \(2 request\(s\) refused\)/);
        assert.ok(last.closedNow.some((c) => c.tools.includes("*") && /^No attempt left: 2 request\(s\) refused\. End with task\.fail/.test(c.why)));
        assert.match(model.seen.at(-1)!.brief, /^No attempt left|No attempt left: 2 request/);
    });

    it("the observer slot says plainly when no model is ready, rather than answering without one", async () => {
        if (process.env.ANTHROPIC_API_KEY) return; // a machine with a key would reach the model; the point here is the machine without one
        const r = await broker.call("observer", "observe", { description: "anything" });
        assert.equal(r.ok, false);
        assert.match(String(r.error), /reasoner is not ready/);
    });
});
