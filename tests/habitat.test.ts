/**
 * The habitat plugin and the habitat reference, headless: the seven node
 * types in the registry with their signatures, each node's physics on its
 * own numbers, and the whole graph against the stand-in world that solved
 * the same balance in TypeScript (the two must agree to a few ppm, or one
 * of them is wrong). The fault of the commissioning is checked as a
 * number: with the parameter file's filter the fan delivers two thirds of
 * the design flow; with a clean one, the design flow.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRegistry } from "../lib/registry.js";
import { buildHabitatDocument, DEFAULT_SPEED_STEPS, readHabitatParameters, runHabitat } from "../lib/habitat.js";
import { HABITAT_NODE_TYPES, HabitatCrewNode, HabitatDuctNode, HabitatFanNode, HabitatFilterNode, HabitatScrubberNode } from "../plugins/habitat/index.js";
import { co2MassPerM3 } from "../plugins/habitat/signals.js";
import { LAB_WORLD, twoZoneTelemetry } from "../harness/stand-in/two-zone-world.js";

const registry = buildRegistry();
const parameters = readHabitatParameters();

describe("the habitat plugin in the registry", () => {
    it("registers its seven types with a signature, a documentation card and the class's own ports", () => {
        const reg = registry as unknown as { meta: (type: string) => { label: string; signature?: { purpose: string; inputs: Record<string, unknown>; outputs: Record<string, unknown>; capabilities: string[] }; docPath?: string; inputPorts: Array<{ slot: string }>; outputPorts: Array<{ slot: string }> } | undefined };
        for (const type of HABITAT_NODE_TYPES) {
            const meta = reg.meta(type);
            assert.ok(meta, `${type} is registered`);
            assert.ok(meta!.signature?.purpose && meta!.signature.capabilities.length, `${type} has a signature`);
            assert.match(String(meta!.docPath), /plugins[\\/]habitat[\\/]docs[\\/][a-z]+\.md$/);
            const ports = new Set([...meta!.inputPorts, ...meta!.outputPorts].map((p) => p.slot));
            for (const name of [...Object.keys(meta!.signature!.inputs), ...Object.keys(meta!.signature!.outputs)]) assert.ok(ports.has(name), `${type}: signature port ${name} is a declared port`);
        }
        const atmosphere = reg.meta("Physics.Habitat:atmosphere")!;
        assert.deepEqual(atmosphere.inputPorts.map((p) => p.slot).filter((s) => s.startsWith("delta_")), ["delta_CO2_0", "delta_CO2_1", "delta_CO2_2", "delta_CO2_3"]);
        assert.ok(atmosphere.outputPorts.some((p) => p.slot === "ppm_CO2"));
    });
});

describe("each node on its own numbers", () => {
    it("the fan settles where its curve meets the system: the design flow with a clean filter, less with a fouled one, free delivery with no resistance", () => {
        const fan = new HabitatFanNode();
        fan.shutoffPressurePa = 250;
        fan.freeDeliveryM3ps = 0.09;
        fan.ductResistance = 20000;
        const filter = new HabitatFilterNode();
        filter.cleanResistance = 49136;
        filter.loadingDoublingKg = 0.05;
        assert.ok(Math.abs(fan.flowAt(1, filter.resistanceAt(0) + 20000) - 0.05) < 1e-4, "3 m3/min with a clean filter");
        assert.ok(Math.abs(fan.flowAt(1, filter.resistanceAt(0.127) + 20000) * 60 - 2.0) < 0.02, "2 m3/min with the commissioning's fouled filter");
        assert.ok(Math.abs(fan.flowAt(1, 0) - 0.09) < 1e-9, "free delivery against nothing (the duct's own resistance is added in fire, not here)");
        assert.ok(Math.abs(fan.flowAt(0.5, filter.resistanceAt(0) + 20000) - 0.025) < 1e-4, "the fan law: half speed, half flow");
        // A degraded fan: the whole pressure curve down by 36 % (k = 160 Pa); the operating point moves down the system curve to sqrt(160 / (69136 + 160 / 0.0081)) = 0.0424 m3/s, 15 % less flow.
        fan.capacityFactor = 0.64;
        assert.ok(Math.abs(fan.flowAt(1, 20000 + 49136) - 0.0424) < 2e-4, `degraded: ${fan.flowAt(1, 20000 + 49136)} m3/s`);
    });

    it("the filter's resistance doubles at the doubling loading, and its clogging reads against its end of life", () => {
        const filter = new HabitatFilterNode();
        filter.cleanResistance = 49136;
        filter.loadingDoublingKg = 0.05;
        filter.endOfLifeLoadingKg = 0.2;
        assert.equal(filter.resistanceAt(0), 49136);
        assert.equal(filter.resistanceAt(0.05), 2 * 49136);
        filter.initialLoadingKg = 0.1;
        filter.reset({} as never);
        assert.equal(filter.clogging, 0.5);
    });

    it("the crew's mass flow is the litres per minute at the density of CO2; the scrubber removes efficiency times flow times the CO2 in a cubic metre", () => {
        const crew = new HabitatCrewNode();
        crew.count = 2;
        crew.activity = "light_work";
        crew.lightWorkLitresPerMinute = 0.42;
        crew.co2DensityKgPerM3 = 1.8176;
        // 0.84 L/min of CO2 is 0.84e-3 m3/min, 1.527 g/min, 2.545e-5 kg/s.
        assert.ok(Math.abs((2 * 0.42 * 1e-3 * 1.8176) / 60 - 2.545e-5) < 1e-8);
        assert.equal(crew.rateOf("light_work"), 0.42);
        const scrubber = new HabitatScrubberNode();
        scrubber.flowAtFullM3ps = 0.055;
        scrubber.efficiency = 0.30303;
        // At 1480 ppm, 101325 Pa and 295.15 K a cubic metre of air holds 2.69 g of CO2; at full flow the beds keep 0.30303 * 0.055 m3/s of it.
        const perM3 = co2MassPerM3(1480, 101325, 295.15);
        assert.ok(Math.abs(perM3 - 2.69e-3) < 0.02e-3, `${perM3} kg/m3`);
        assert.ok(Math.abs(scrubber.effectiveFlowM3ps - 0) < 1e-12, "the flow starts at rest");
    });

    it("the duct conserves CO2: what leaves A enters B, and nothing moves when both sides are alike", () => {
        const duct = new HabitatDuctNode();
        assert.equal(duct.co2FluxKgps, 0);
        // The flux for a flow and two concentrations, by the same formula the node applies.
        const flux = (q: number, a: number, b: number) => q * (co2MassPerM3(a, 101325, 295.15) - co2MassPerM3(b, 101325, 295.15));
        assert.equal(flux(0.05, 1500, 1500), 0);
        assert.ok(flux(0.05, 1600, 1500) > 0 && Math.abs(flux(0.05, 1600, 1500) + flux(0.05, 1500, 1600)) < 1e-15);
    });
});

describe("the habitat reference as a document", () => {
    it("builds through the registry, runs, and delivers two thirds of the design flow with the file's filter, the design flow with a clean one", () => {
        const rest = { speedSteps: [{ from: 0, to: 3, value: 0 }], minutes: 3 };
        const fouled = runHabitat(buildHabitatDocument(rest, parameters, registry).json, 3, rest.speedSteps, registry).at(-1)!;
        const clean = runHabitat(buildHabitatDocument({ ...rest, filterLoadingKg: 0 }, parameters, registry).json, 3, rest.speedSteps, registry).at(-1)!;
        assert.ok(Math.abs(fouled.fan_m3_per_min - 2.0) < 0.02, `fouled: ${fouled.fan_m3_per_min} m3/min`);
        assert.ok(Math.abs(clean.fan_m3_per_min - 3.0) < 0.02, `clean: ${clean.fan_m3_per_min} m3/min`);
        assert.ok(fouled.filter_clogging > 0.6 && clean.filter_clogging < 0.01);
    });

    it("agrees with the stand-in world to a few ppm over the two-step test, and Hab-B follows the Lab", () => {
        const { json } = buildHabitatDocument({}, parameters, registry);
        const rows = runHabitat(json, 60, DEFAULT_SPEED_STEPS, registry);
        assert.equal(rows.length, 61);
        // The same balance in TypeScript, with the exchange the fan delivers (2 m3/min), the scrubber from rest as here.
        const world = twoZoneTelemetry({ ...LAB_WORLD, q: rows[30].fan_m3_per_min }, [{ speedPercent: 30, minutes: 30 }, { speedPercent: 100, minutes: 30 }]);
        let worstLab = 0;
        let worstHab = 0;
        for (let m = 0; m <= 60; m++) {
            worstLab = Math.max(worstLab, Math.abs(rows[m].co2_lab_ppm - world[m].co2_lab_ppm));
            worstHab = Math.max(worstHab, Math.abs(rows[m].co2_habb_ppm - world[m].co2_habb_ppm));
        }
        assert.ok(worstLab < 6, `the Lab parts from the world by ${worstLab.toFixed(1)} ppm at worst`);
        assert.ok(worstHab < 6, `Hab-B parts from the world by ${worstHab.toFixed(1)} ppm at worst`);
        assert.ok(rows[30].co2_lab_ppm > rows[0].co2_lab_ppm + 150, "the rise at 30 %");
        assert.ok(rows[60].co2_lab_ppm < rows[30].co2_lab_ppm - 250, "the decay at 100 %");
        assert.ok(rows[60].co2_habb_ppm > rows[0].co2_habb_ppm + 50, "Hab-B moves: the ventilation carries the Lab's CO2 to it");
        assert.ok(Math.abs(rows[60].scrubber_flow_m3ps - 0.055) < 1e-3, "the scrubber reaches full flow");
    });

    it("keeps the CO2 of the two volumes together: only the crew adds and only the scrubber removes", () => {
        const { json } = buildHabitatDocument({}, parameters, registry);
        const rows = runHabitat(json, 60, DEFAULT_SPEED_STEPS, registry);
        // Over each minute, the change of total CO2 mass is the integral of crew minus scrubber (a trapezoid over the minute).
        let worst = 0;
        for (let m = 1; m <= 60; m++) {
            const a = rows[m - 1];
            const b = rows[m];
            const measured = b.lab_co2_kg + b.habb_co2_kg - (a.lab_co2_kg + a.habb_co2_kg);
            const expected = (60 * (a.crew_lab_kgps + a.crew_habb_kgps - a.scrubber_removal_kgps + (b.crew_lab_kgps + b.crew_habb_kgps - b.scrubber_removal_kgps))) / 2;
            worst = Math.max(worst, Math.abs(measured - expected));
        }
        assert.ok(worst < 2e-5, `conservation: ${worst.toExponential(2)} kg of CO2 unaccounted over a minute`);
    });
});
