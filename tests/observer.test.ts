/**
 * The Twin Requirement Observer (`harness/observer/`): the guard of a
 * TWIN_FACTORY_REQUEST (the shape, the separation from the node catalogue,
 * the facts of the telemetry), the summary of the telemetry the model is
 * given instead of the rows, and the loop through the broker: a model whose
 * first request names a node of the catalogue is refused with the reason,
 * its second is accepted and becomes a factory task carrying the
 * requirements whole. The model here is a stand-in that plays two answers;
 * the demo's is the one behind the reasoner slot, and the slot says so
 * plainly when that one is not ready.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { Provider, ProviderExchange } from "../harness/lib/provider.js";
import { checkTwinRequest, factoryContractOf, type TwinFactoryRequest, hedgedNumbers } from "../harness/observer/request.js";
import { summarizeTelemetry } from "../harness/observer/telemetry.js";
import { numericLines, observe, observerBrief } from "../harness/observer/observer.js";
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
        assert.match(checkTwinRequest(unit, { vocabulary }).problems.join(), /is a Concentration in "percent"; the shared vocabulary writes it in ppm/);
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

/** A stand-in for the model: its first request names a node, its second does not. It reads what it is shown, like a model. */
class TwoAnswers implements Provider {
    readonly name = "stand-in:observer";
    readonly model = "stand-in";
    readonly family = "stand-in";
    readonly exchanges: ProviderExchange[] = [];
    calls = 0;
    seen: Array<Record<string, JsonValue>> = [];
    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        this.seen.push(input.state.features as Record<string, JsonValue>);
        const request = this.calls === 1 ? { ...REQUEST, entities: [...REQUEST.entities, { name: "Physics.LifeSupport:cabin-air" }] } : REQUEST;
        const capabilityId = input.allowedCapabilities[0].id;
        return { action: { id: capabilityId, description: capabilityId }, invocation: { actionId: capabilityId, capabilityId, input: request as unknown as JsonValue }, rationale: "stand-in" };
    }
}

/** The same stand-in on the state: it reads a datasheet first, and its second request is what the state hands it back, corrected. */
class OnTheState extends TwoAnswers {
    readonly contextMode = "state" as const;
    override async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        const features = input.state.features as { state?: { evidence?: Record<string, string>; lastAttempt?: { proposed?: JsonValue } | null } };
        const read = Object.keys(features.state?.evidence ?? {});
        if (!read.length) {
            this.seen.push(input.state.features as Record<string, JsonValue>);
            return { action: { id: "library.read", description: "" }, invocation: { actionId: "library.read", capabilityId: "library.read", input: { id: "scrubber-1-datasheet" } }, rationale: "the datasheet first" };
        }
        const decision = await super.resolve(input);
        // After the refusal, the model corrects what the state hands it, rather than writing again from nothing.
        const proposed = features.state?.lastAttempt?.proposed as { entities?: Array<{ name: string }> } | undefined;
        if (!proposed) return decision;
        const corrected = { ...proposed, entities: proposed.entities!.filter((e) => !/:/.test(e.name)) } as unknown as JsonValue;
        return { ...decision, invocation: { ...decision.invocation, input: corrected } };
    }
}

describe("the Observer on the reasoning state (2026-09-25)", () => {
    it("the brief and the numeric lines are deterministic", () => {
        assert.match(observerBrief({ step: 1, attemptsLeft: 3, readsLeft: 6, read: [] }), /^Step 1\. Read in the library.*You read nothing yet\. 6 read\(s\) left\.$/);
        assert.match(observerBrief({ step: 3, attemptsLeft: 2, readsLeft: 4, read: ["a", "b"], last: { n: 1, ok: false, problems: ["separation: x"], proposed: "" } }), /^Step 3\. Your request 1 was refused: separation: x\. The state holds it whole \(lastAttempt\.proposed\).*You read a, b/);
        assert.equal(numericLines("# Title\nno number here\nFlow at full speed: 3.3 m3/min\n\nEfficiency 0.85"), "Flow at full speed: 3.3 m3/min\nEfficiency 0.85");
        assert.equal(numericLines("a 1\nb 2\nc 3", 4), "a 1\n...");
    });
});

describe("the Observer, through the broker", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let broker: Broker;
    const tasks: string[] = [];

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
    });

    it("a request naming a node of the real catalogue is refused with the reason, the corrected one becomes a factory task with its requirements", async () => {
        const model = new TwoAnswers();
        const result = await observe({ provider: model, broker, description: "The Lab of a lunar habitat: one CO2 scrubber, a CO2 sensor, a hatch to hab-b.", telemetry: ROWS });
        assert.equal(result.ok, true);
        assert.deepEqual(result.attempts.map((a) => a.ok), [false, true]);
        assert.match(result.attempts[0].problems[0], /separation/);
        // What the model was shown: the description and the computed summary, never the rows and never the catalogue.
        assert.equal(model.seen[0].description, "The Lab of a lunar habitat: one CO2 scrubber, a CO2 sensor, a hatch to hab-b.");
        assert.equal((model.seen[0].telemetry as { rows: number }).rows, 25);
        assert.doesNotMatch(JSON.stringify(model.seen), /registry|Physics\.Transform/);
        assert.match(String(model.seen[1].lastRefusal), /^observer\.request: separation/);
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

    it("on the state: each step carries the documents read and the last refused request whole, nothing is replayed", async () => {
        const model = new OnTheState();
        const result = await observe({ provider: model, broker, description: "The Lab of a lunar habitat: one CO2 scrubber, a CO2 sensor, a hatch to hab-b.", telemetry: ROWS });
        assert.equal(result.ok, true, JSON.stringify(result.attempts));
        assert.deepEqual(result.reads, ["library.read scrubber-1-datasheet"]);
        assert.deepEqual(result.attempts.map((a) => a.ok), [false, true]);
        const states = model.seen.map((f) => f.state as { evidence: Record<string, string>; lastAttempt: { n: number; problems: string[]; proposed: { entities: Array<{ name: string }> } } | null; nextActions: string[] });
        assert.equal(states.length, 3);
        // Step 1: nothing read, the brief says to read; the features carry only the brief and the state.
        assert.deepEqual(Object.keys(model.seen[0]).sort(), ["brief", "state"]);
        assert.match(String(model.seen[0].brief), /^Step 1\. Read in the library/);
        assert.deepEqual(states[0].evidence, {});
        // Step 2: the datasheet read is in the state, whole (the last read), and its numbers are there.
        assert.match(states[1].evidence["library.read scrubber-1-datasheet"], /m3\/min/);
        assert.equal(states[1].lastAttempt, null);
        // Step 3: the refused request is in the state whole, with its reasons; the model corrected it from there.
        assert.match(String(model.seen[2].brief), /^Step 3\. Your request 1 was refused: separation/);
        assert.equal(states[2].lastAttempt?.n, 1);
        assert.ok(states[2].lastAttempt?.proposed.entities.some((e) => e.name === "Physics.LifeSupport:cabin-air"), "the refused request whole, node name included");
        assert.doesNotMatch(JSON.stringify(model.seen), /registry|Physics\.Transform/);
    });

    it("the observer slot says plainly when no model is ready, rather than answering without one", async () => {
        if (process.env.ANTHROPIC_API_KEY) return; // a machine with a key would reach the model; the point here is the machine without one
        const r = await broker.call("observer", "observe", { description: "anything" });
        assert.equal(r.ok, false);
        assert.match(String(r.error), /reasoner is not ready/);
    });
});
