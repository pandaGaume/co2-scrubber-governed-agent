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
import { checkTwinRequest, factoryContractOf, type TwinFactoryRequest } from "../harness/observer/request.js";
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
    missing_information: ["the served volume", "the exchange through the closed hatch"],
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

    it("the observer slot says plainly when no model is ready, rather than answering without one", async () => {
        if (process.env.ANTHROPIC_API_KEY) return; // a machine with a key would reach the model; the point here is the machine without one
        const r = await broker.call("observer", "observe", { description: "anything" });
        assert.equal(r.ok, false);
        assert.match(String(r.error), /reasoner is not ready/);
    });
});
