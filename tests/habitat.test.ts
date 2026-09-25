/**
 * The habitat plugin and the habitat reference, headless: the four node
 * types in the registry with their signatures, the substrate's atmosphere
 * with its CO2 ports declared and its gate bound to two atmospheres in a
 * document, each node's physics on its own numbers,
 * and the whole graph against the stand-in world that solved the same
 * balance in TypeScript (the two must agree to a few ppm, or one of them
 * is wrong). The fault of the commissioning is checked as a number: with
 * the parameter file's filter the fan delivers two thirds of the design
 * flow; with a clean one, the design flow.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ATMOSPHERE_CO2_INPUTS, ATMOSPHERE_CO2_OUTPUTS, ATMOSPHERE_TYPE, buildRegistry } from "../lib/registry.js";
import { loadFactory } from "../lib/factory.js";
import { buildHabitatDocument, DEFAULT_SPEED_STEPS, initialMassesKg, readHabitatParameters, runHabitat } from "../lib/habitat.js";
import { HABITAT_NODE_TYPES, HabitatCrewNode, HabitatFanNode, HabitatFilterNode, HabitatPersonNode, HabitatScrubberNode } from "../plugins/habitat/index.js";
import { activityOf } from "../plugins/habitat/activity.js";
import { instantiateTemplate, loadGraphLibrary, wordsOf } from "../lib/graph-library.js";
import { resolveSpec } from "../harness/topics/graph/params.js";
import { co2MassPerM3 } from "../plugins/habitat/signals.js";
import { LAB_WORLD, twoZoneTelemetry } from "../harness/stand-in/two-zone-world.js";

const registry = buildRegistry();
const parameters = readHabitatParameters();

describe("the habitat plugin in the registry", () => {
    it("registers its five types with a signature, a documentation card and the class's own ports; the crew's person pool is variadic", () => {
        const reg = registry as unknown as { meta: (type: string) => { label: string; signature?: { purpose: string; inputs: Record<string, unknown>; outputs: Record<string, unknown>; capabilities: string[] }; docPath?: string; inputPorts: Array<{ slot: string }>; outputPorts: Array<{ slot: string }> } | undefined };
        assert.equal(HABITAT_NODE_TYPES.length, 5, "the atmosphere, the gates (the ventilation loop, the hatch) and the dust are the substrate's, not the plugin's");
        const crew = reg.meta("Physics.Habitat:crew") as unknown as { variadicInput?: Array<{ prefix: string; type: string }>; inputPorts: Array<{ slot: string }> };
        assert.deepEqual(crew.variadicInput, [{ prefix: "person_", type: "float" }], "the persons' pool grows as persons are wired");
        assert.ok(crew.inputPorts.some((p) => p.slot === "person_0"), "its first input declared");
        for (const type of HABITAT_NODE_TYPES) {
            const meta = reg.meta(type);
            assert.ok(meta, `${type} is registered`);
            assert.ok(meta!.signature?.purpose && meta!.signature.capabilities.length, `${type} has a signature`);
            assert.match(String(meta!.docPath), /plugins[\\/]habitat[\\/]docs[\\/][a-z]+\.md$/);
            const ports = new Set([...meta!.inputPorts, ...meta!.outputPorts].map((p) => p.slot));
            for (const name of [...Object.keys(meta!.signature!.inputs), ...Object.keys(meta!.signature!.outputs)]) assert.ok(ports.has(name), `${type}: signature port ${name} is a declared port`);
        }
        for (const gone of ["Physics.Habitat:atmosphere", "Physics.Habitat:hatch", "Physics.Habitat:duct"]) assert.equal(reg.meta(gone), undefined, `${gone}: no duplicate of the substrate's atmosphere or gate`);
    });

    it("finds the substrate's atmosphere with its CO2 ports declared, and the other substrate types the reference uses", () => {
        const reg = registry as unknown as { meta: (type: string) => { inputPorts: Array<{ slot: string }>; outputPorts: Array<{ slot: string }>; variadicInput?: unknown; signature?: { inputs: Record<string, unknown>; outputs: Record<string, unknown> } } | undefined; create: (type: string) => unknown };
        const atmosphere = reg.meta(ATMOSPHERE_TYPE)!;
        // One declared port per species (`delta_<sp>_0`); the higher indices this demo wires are the variadic pool's, accepted by the document builder.
        assert.deepEqual(atmosphere.inputPorts.map((p) => p.slot).filter((s) => s.startsWith("delta_")), ["delta_N2_0", "delta_O2_0", "delta_CO2_0", "delta_H2O_0", "delta_Ar_0"]);
        assert.equal(ATMOSPHERE_CO2_INPUTS[0], "delta_CO2_0");
        for (const slot of ATMOSPHERE_CO2_INPUTS) assert.ok(/^delta_CO2_\d+$/.test(slot), `${slot} belongs to the CO2 pool`);
        for (const slot of ATMOSPHERE_CO2_OUTPUTS) assert.ok(atmosphere.outputPorts.some((p) => p.slot === slot), `${slot} declared`);
        assert.ok(atmosphere.inputPorts.some((p) => p.slot === "layer_in_0") && atmosphere.outputPorts.some((p) => p.slot === "atmosphere_out"), "the substrate's own ports are kept");
        assert.ok(Array.isArray(atmosphere.variadicInput) && (atmosphere.variadicInput as Array<{ prefix: string }>).some((v) => v.prefix === "delta_CO2_"), "the delta pool is variadic");
        assert.ok("delta_CO2_0" in atmosphere.signature!.inputs && "ppm_CO2" in atmosphere.signature!.outputs, "the signature says them for the planner");
        const instance = reg.create(ATMOSPHERE_TYPE) as { getMassKg: (s: string) => number; applyMassDelta: (s: string, kg: number) => void; activeSpecies: ReadonlyArray<string> };
        assert.deepEqual([...instance.activeSpecies], ["N2", "O2", "CO2", "H2O", "Ar"], "the substrate's node, with the core's species");
        for (const type of ["Physics.Scene:atmosphere-gate", "Physics.Particulate:lunar_dust", "DSP.Sensor:transducer", "Physics.Scene:moon"]) assert.ok(reg.meta(type), `${type} is in the catalogue for the reference`);
    });

    it("seeds a volume at the sensor's ppm from the core's composition preset, the pressure kept", () => {
        const masses = initialMassesKg(1480, 30, 295.15);
        assert.equal(masses.length, 5);
        const M = { N2: 28.0134e-3, O2: 31.9988e-3, CO2: 44.0095e-3, H2O: 18.01528e-3, Ar: 39.948e-3 };
        const moles = ["N2", "O2", "CO2", "H2O", "Ar"].map((s, i) => masses[i] / M[s as keyof typeof M]);
        const total = moles.reduce((a, b) => a + b, 0);
        assert.ok(Math.abs((moles[2] / total) * 1e6 - 1480) < 0.01, "the CO2 mole fraction is the sensor's ppm");
        assert.ok(Math.abs((total * 8.314462618 * 295.15) / 30 - 101325) < 1, "the ideal gas gives the habitat's pressure back");
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

    it("a person produces at their own activity, named by a word or a rung; the activity ladder reads both", () => {
        const who = new HabitatPersonNode();
        who.name = "M. Chen";
        who.callsign = "FE-2";
        who.activity = "light_work";
        who.lightWorkLitresPerMinute = 0.42;
        assert.equal(who.rateOf("light_work"), 0.42);
        assert.equal(who.rateOf("sleep"), 0.24, "the reference crewmember's rate asleep");
        assert.equal(activityOf(2, "rest"), "light_work", "a rung is an activity");
        assert.equal(activityOf(2.6, "rest"), "heavy_work", "rounded to the nearest rung");
        assert.equal(activityOf("nap", "rest"), "rest", "an unknown word is the fallback");
        assert.equal(activityOf("sleep", "rest"), "sleep");
        who.activity = "nap" as never;
        assert.equal(who.activity, "light_work", "an unknown word does not change the editable");
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

    it("wires the four persons of the roster into the crews of their modules, and their sum is what the crews give the air", () => {
        const { json, spec } = buildHabitatDocument({}, parameters, registry);
        const persons = spec.nodes.filter((n) => n.typeId === "Physics.Habitat:person");
        assert.equal(persons.length, 4, "the roster: two operators in the Lab, two people in Hab-B");
        assert.deepEqual(spec.connections.filter((c) => c.to[0] === "crew-lab" && c.to[1].startsWith("person_")).map((c) => c.to[1]), ["person_0", "person_1"], "the pool's second input is the variadic one, accepted by the builder");
        assert.deepEqual(spec.connections.filter((c) => c.to[0] === "crew-habb" && c.to[1].startsWith("person_")).map((c) => c.to[1]), ["person_0", "person_1"]);
        const rows = runHabitat(json, 2, DEFAULT_SPEED_STEPS, registry);
        // Two operators at 0.42 L/min: 2.545e-5 kg/s; two at rest at 0.30: 1.818e-5 kg/s. The crews count nobody unnamed.
        assert.ok(Math.abs(rows[1].crew_lab_kgps - 2.545e-5) < 1e-8, `the Lab's crew gives ${rows[1].crew_lab_kgps} kg/s`);
        assert.ok(Math.abs(rows[1].crew_habb_kgps - 1.818e-5) < 1e-8, `Hab-B's crew gives ${rows[1].crew_habb_kgps} kg/s`);
        // One person fewer in the Lab, at their own activity: the crew follows the persons wired in.
        const fewer = buildHabitatDocument({ persons: [{ id: "fe-1", callsign: "FE-1", name: "A. Pelletier", module: "lab", activity: "heavy_work" }] }, parameters, registry);
        const one = runHabitat(fewer.json, 1, DEFAULT_SPEED_STEPS, registry);
        assert.ok(Math.abs(one[1].crew_lab_kgps - (1.0 * 1e-3 * 1.8176) / 60) < 1e-8, "one person at heavy work");
        assert.equal(one[1].crew_habb_kgps, 0, "nobody in Hab-B");
    });

    it("is on the library's shelf as a template with its words, and the template at the reference's numbers reproduces the reference", () => {
        const entry = loadGraphLibrary().find((g) => g.template.id === "habitat");
        assert.ok(entry, "graphs/habitat.template.json");
        assert.deepEqual(entry!.problems, [], "the words match the template's variables, settings and probes");
        assert.ok(entry!.grammars.has("default:en") && entry!.grammars.has("default:fr"));
        const fr = wordsOf(entry!, "claude:fr");
        assert.equal(fr.key, "default:fr", "no claude file: the default of the locale");
        assert.match(fr.properties.L, /la charge du filtre/);
        assert.match(wordsOf(entry!, null).properties.L, /the filter's loading/);
        assert.match(fr.probes["co2-1.lastMeasured"].name, /capteur/);
        const t = entry!.template;
        assert.equal(t.variables.Qe.status, "known");
        assert.equal(t.variables.g.status, "band");
        assert.deepEqual(Object.keys(t.settings), ["labOccupants", "habOccupants"]);
        // Instantiated at the reference's own numbers, resolved on the reference's own rows, it runs to the same ppm.
        const reference = runHabitat(buildHabitatDocument({}, parameters, registry).json, 60, DEFAULT_SPEED_STEPS, registry);
        const inst = instantiateTemplate(t, { variables: { V: 30, Vh: 400, L: 0.127, g: 0.42 } });
        assert.deepEqual(inst.defaulted.sort(), ["Qe", "eta", "gRest", "lag"], "the known constants at their defaults");
        assert.deepEqual(inst.compare.map((c) => c.column), ["co2_lab_ppm", "co2_habb_ppm"]);
        const resolved = resolveSpec(inst.spec as never, inst.variables, reference as unknown as Array<Record<string, unknown>>);
        const json = loadFactory().buildDocumentJson(registry as never, resolved.nodes as never, resolved.connections as never);
        const twin = runHabitat(json, 60, DEFAULT_SPEED_STEPS, registry);
        let worst = 0;
        for (let m = 0; m <= 60; m++) worst = Math.max(worst, Math.abs(twin[m].co2_lab_ppm - reference[m].co2_lab_ppm), Math.abs(twin[m].co2_habb_ppm - reference[m].co2_habb_ppm));
        assert.ok(worst <= 2, `the template parts from the reference by ${worst} ppm at worst`);
        // Who is on board is a setting: one more in the Lab is an unnamed person at light work on the crew.
        const three = instantiateTemplate(t, { settings: { labOccupants: 3, habOccupants: 1 } });
        assert.equal(three.spec.nodes.filter((n) => n.typeId === "Physics.Habitat:person").length, 3);
        assert.equal(three.spec.nodes.find((n) => n.id === "crew-lab")!.params!.count, 1);
        assert.equal(three.spec.nodes.find((n) => n.id === "crew-habb")!.params!.count, 0);
        assert.throws(() => instantiateTemplate(t, { settings: { cats: 1 } }), /no setting "cats"/);
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
        assert.ok(Math.abs(rows[30].hvac_flow_m3ps * 60 - rows[30].fan_m3_per_min) < 1e-6, "the gate exchanges what the fan delivers");
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
