/**
 * The physical units (2026-09-25): a facade over the substrate's unit
 * system, deterministic, transversal.
 *
 *   resolve      any spelling a person or a model writes, the quantity given or not;
 *   convert      within a quantity, refused across;
 *   validate     a restated value against its source: OK or INVALID_CONVERSION;
 *   documents    the numbers with a unit a library document states, and a
 *                constant copied from it checked against them;
 *   the guards   the Observer refuses a known constant converted wrongly, the
 *                procedure topic a quantity in a unit the system does not know;
 *   the slot     the four tools through the broker.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import { canonicalQuantity, checkAgainstDocument, compatibleUnits, convertValue, normalizeUnitText, quantitiesIn, resolveUnitRef, validateConnection } from "../harness/lib/units.js";
import { checkTwinRequest, type TwinFactoryRequest } from "../harness/observer/request.js";
import { loadGraphLibrary } from "../lib/graph-library.js";
import { fromRoot } from "../lib/paths.js";

const PORT = 3127;

describe("the units: the substrate's tables behind one deterministic service", () => {
    it("resolves a unit from its key, its UCUM code or its symbol, typographic characters normalised, the quantity given or not", () => {
        assert.equal(normalizeUnitText(" m³ / min "), "m3/min");
        assert.equal(normalizeUnitText("m^3 per s"), "m3/s");
        for (const spelling of ["m3/min", "m³/min", "m3pmin", "m³ / min"]) {
            const r = resolveUnitRef({ unit: spelling });
            assert.ok(r.ok, `${spelling}: ${JSON.stringify(r)}`);
            assert.deepEqual([r.unit.quantity, r.unit.ucum, r.unit.kind], ["VolumetricFlow", "m3/min", "VolumeFlowRate"]);
        }
        const flow = resolveUnitRef({ quantity: "VolumetricFlow", unit: "m3ps" });
        assert.ok(flow.ok && flow.unit.ucum === "m3/s", "the older key the demo wrote resolves to its UCUM code");
        const ppm = resolveUnitRef({ quantity: "Concentration", unit: "ppm" });
        assert.ok(ppm.ok && ppm.unit.ucum === "[ppm]" && ppm.unit.quantity === "Dimensionless", "an industrial quantity name over the core's");
        assert.deepEqual([canonicalQuantity("MassFlow"), canonicalQuantity("mass flow rate"), canonicalQuantity("Flow"), canonicalQuantity("Nothing")], ["MassFlow", "MassFlow", "VolumetricFlow", null]);
        const persons = resolveUnitRef({ quantity: "Count", unit: "person" });
        assert.ok(persons.ok && persons.unit.ucum === "{person}");
        // "m" is the metre's code and the minute's display symbol: the code wins, no ambiguity.
        const m = resolveUnitRef({ unit: "m" });
        assert.ok(m.ok && m.unit.quantity === "Length");
        const unknown = resolveUnitRef({ unit: "mg/m3 per ppm" });
        assert.ok(!unknown.ok && unknown.code === "UNKNOWN_UNIT", "an invented unit is said unknown, never guessed");
        const wrongQuantity = resolveUnitRef({ quantity: "Volume", unit: "L/min" });
        assert.ok(!wrongQuantity.ok && /its units are m3/.test(wrongQuantity.reason));
    });

    it("converts within a quantity by the core's factors, refuses across quantities, and validates a restated value", () => {
        const c = convertValue(1, { unit: "m3/min" }, { unit: "L/min" });
        assert.ok(c.ok && Math.abs(c.value - 1000) < 1e-9, JSON.stringify(c));
        const g = convertValue(0.69, { unit: "g/min" }, { unit: "kg/s" });
        assert.ok(g.ok && Math.abs(g.value - 1.15e-5) < 1e-12);
        const across = convertValue(1, { unit: "m3/min" }, { unit: "kg/s" });
        assert.ok(!across.ok && across.code === "INCOMPATIBLE_QUANTITY");
        assert.equal(compatibleUnits({ unit: "ppm" }, { unit: "%" }).ok && (compatibleUnits({ unit: "ppm" }, { unit: "%" }) as { compatible: boolean }).compatible, true);
        // The review's case: the datasheet says 1.0 m3/min, the request says 60 L/min.
        const wrong = validateConnection({ value: 1.0, unit: "m3/min" }, { value: 60, unit: "L/min" });
        assert.ok(!wrong.ok && wrong.code === "INVALID_CONVERSION");
        assert.match((wrong as { reason: string }).reason, /1 m3\/min, which is 1000 L\/min; the request says 60 L\/min/);
        const right = validateConnection({ value: 1.0, unit: "m3/min" }, { value: 1000, unit: "L/min" });
        assert.ok(right.ok && right.code === "OK" && right.expected === 1000);
        const seconds = validateConnection({ value: 1.0, unit: "m3/min" }, { value: 0.01667, unit: "m3ps" });
        assert.ok(seconds.ok, "0.01667 m3/s is 1.0 m3/min within the tolerance");
    });

    it("reads the numbers with a unit a library document states, and checks a copied constant against them", () => {
        const datasheet = readFileSync(fromRoot("docs", "library", "scrubber-1-datasheet.md"), "utf8");
        const stated = quantitiesIn(datasheet).map((q) => `${q.text} [${q.unit.ucum}]`);
        assert.ok(stated.includes("0.055 m3/s [m3/s]") && stated.includes("3.3 m3/min [m3/min]") && stated.includes("1.0 m3/min [m3/min]") && stated.includes("3.33 min [min]"), stated.join(", "));
        assert.equal(checkAgainstDocument({ value: 0.01667, unit: "m3ps" }, datasheet).verdict, "OK", "the effective flow in m3/s: 1.0 m3/min converted right");
        assert.equal(checkAgainstDocument({ value: 3.33, unit: "min" }, datasheet).verdict, "OK");
        const wrong = checkAgainstDocument({ value: 60, unit: "L/min" }, datasheet);
        assert.equal(wrong.verdict, "INVALID_CONVERSION");
        assert.match(wrong.reason, /the request says 60 L\/min/);
        assert.equal(checkAgainstDocument({ value: 5, unit: "kg" }, datasheet).verdict, "NOT_STATED", "no mass in the datasheet: no verdict");
        assert.equal(checkAgainstDocument({ value: 0.3, unit: "dimensionless" }, datasheet).verdict, "NOT_STATED", "a ratio is not checked: the datasheet's percents are not it");
        // The fourth passage's Observer wrote the awake rate as 0.0115 kg/s: the document says 0.69 g/min, a thousand times less.
        const nasa = readFileSync(fromRoot("docs", "library", "nasa-crew-metabolic-loads.md"), "utf8");
        const rate = checkAgainstDocument({ value: 0.0115, unit: "kg/s" }, nasa);
        assert.equal(rate.verdict, "INVALID_CONVERSION");
        assert.match(rate.reason, /0\.69 g\/min/);
        assert.doesNotMatch(rate.reason, /-4 kg\/min/, "an exponent's digits are not a value");
        assert.equal(checkAgainstDocument({ value: 1.15e-5, unit: "kg/s" }, nasa).verdict, "OK");
    });

    it("every variable of the library's graphs is declared in a unit the system knows", () => {
        for (const entry of loadGraphLibrary()) {
            for (const [name, v] of Object.entries(entry.template.variables)) {
                if (!v.unit) continue;
                const r = resolveUnitRef({ unit: v.unit });
                assert.ok(r.ok, `${entry.template.id}.${name}: ${v.unit} (${JSON.stringify(r)})`);
            }
        }
    });

    it("the guards: the Observer refuses a known constant converted wrongly from the document it cites; the procedure topic refuses a quantity in an unknown unit", () => {
        const datasheet = readFileSync(fromRoot("docs", "library", "scrubber-1-datasheet.md"), "utf8");
        const request: Partial<TwinFactoryRequest> = {
            objective: "reproduce the Lab CO2",
            entities: [{ name: "Lab" }],
            observables: [{ name: "co2", quantity: "Concentration", unit: "ppm", column: "co2_lab_ppm" }],
            inputs: [{ name: "speed", quantity: "Dimensionless", unit: "percent" }],
            outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm" }],
            required_behaviors: ["the CO2 decays at full speed"],
            validation: { criteria: ["predicted_co2 against co2_lab_ppm"] },
            known: [{ symbol: "Qe_full", name: "effective flow at full speed", value: 60, unit: "L/min", source: "scrubber-1-datasheet" }],
        } as unknown as Partial<TwinFactoryRequest>;
        const context = { documentsRead: ["scrubber-1-datasheet"], documents: { "scrubber-1-datasheet": datasheet } };
        const refused = checkTwinRequest(request, context);
        assert.equal(refused.ok, false);
        assert.match(refused.problems.join("; "), /^units: known constant "Qe_full" = 60 L\/min is an INVALID_CONVERSION of what "scrubber-1-datasheet" states/);
        const right = checkTwinRequest({ ...request, known: [{ symbol: "Qe_full", name: "effective flow at full speed", value: 1000, unit: "L/min", source: "scrubber-1-datasheet" }] } as unknown as Partial<TwinFactoryRequest>, context);
        assert.equal(right.ok, true, right.problems.join("; "));
        const invented = checkTwinRequest({ ...request, known: [{ symbol: "k", name: "a factor", value: 1.8, unit: "mg/m3 per ppm", source: "scrubber-1-datasheet" }] } as unknown as Partial<TwinFactoryRequest>, context);
        assert.match(invented.problems.join("; "), /units: known constant "k" is written in "mg\/m3 per ppm", a unit the unit system does not know/);
        // The procedure's quantities go through the same table (the topic's guard, before checkProcedure's rules): the story's quantity resolves, an invented unit does not.
        assert.ok(resolveUnitRef({ quantity: "Volume", unit: "m3" }).ok);
        assert.ok(!resolveUnitRef({ quantity: "Volume", unit: "cubic feet per fortnight" }).ok);
    });
});

describe("the physics slot, through the broker", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let broker: Broker;

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        ({ broker: local, slots } = await startAllOrFail(PORT));
        broker = new Broker(local.httpBase, { name: "units-test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        await broker?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
    });

    it("the four tools answer the same as the service, and an unknown unit is a refusal with the reason", async () => {
        const n = await broker.call("physics", "units_normalize", { unit: "m³/min" });
        assert.ok(n.ok, n.error);
        assert.equal((n.output as { ucum: string }).ucum, "m3/min");
        const c = await broker.call("physics", "units_convert", { value: 1, from: { unit: "m3/min" }, to: { quantity: "VolumetricFlow", unit: "L/min" } });
        assert.ok(c.ok, c.error);
        assert.ok(Math.abs((c.output as { value: number }).value - 1000) < 1e-9);
        const k = await broker.call("physics", "units_compatible", { a: { unit: "kg/s" }, b: { unit: "g/min" } });
        assert.ok(k.ok && (k.output as { compatible: boolean }).compatible === true);
        const v = await broker.call("physics", "units_validate_connection", { source: { value: 1.0, unit: "m3/min" }, target: { value: 60, unit: "L/min" } });
        assert.ok(v.ok, v.error);
        assert.equal((v.output as { code: string }).code, "INVALID_CONVERSION");
        assert.equal((v.output as { expected: number }).expected, 1000);
        const bad = await broker.call("physics", "units_convert", { value: 1, from: { unit: "furlongs" }, to: { unit: "m" } });
        assert.ok(!bad.ok && /UNKNOWN_UNIT/.test(bad.error ?? ""));
        const across = await broker.call("physics", "units_convert", { value: 1, from: { unit: "m3/min" }, to: { unit: "kg/s" } });
        assert.ok(!across.ok && /INCOMPATIBLE_QUANTITY/.test(across.error ?? ""));
    });
});
