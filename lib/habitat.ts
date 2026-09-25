/**
 * The habitat reference: the two-module habitat as a document of the
 * catalogue, built from one reviewable parameter file and run headless.
 * It is the physical reference the demo measures against: the
 * commissioning's telemetry comes from it, and a twin is judged by how
 * close it comes to what this graph did.
 *
 *     specs/habitat-parameters.json  ->  habitatDocumentSpec  ->  buildDocumentJson  ->  graphs/habitat.spikypanda
 *                                                                       |
 *                                                          runHabitat: rows a minute, as a logger would record them
 *
 * The nodes are the substrate's wherever it has them: the lunar scene
 * preset (gravity, the ambient frame), the atmosphere (a mass per species,
 * ideal gas, seeded from the core's Earth-air composition with the CO2 the
 * sensor read), the gate twice (the ventilation loop in its exchange mode,
 * at the flow the fan wires into it; the hatch, closed), a particulate for
 * the dust, the DSP transducer for the two CO2 sensors (the station's
 * resolution as its quantisation). The habitat plugin adds what the
 * catalogue lacked: the crew and the scrubber in mass, the fan, the filter
 * and its fouling (`plugins/habitat`).
 *
 * Nothing is typed here: every constant goes through the node's editable
 * setters from the parameter file; the graph's structure is the one
 * thing this file owns. The stand-in world of `harness/stand-in` solved
 * the same balance in TypeScript until this ran; the tests keep the two
 * within a few ppm.
 */
import type { DocumentConnectionSpec, DocumentNodeSpec } from "@spiky-panda/factory";
import { ATMOSPHERE_PRESETS, CHEMICAL_SPECIES_V1, GAS_CONSTANT_R, V1_SPECIES_ORDER } from "@spiky-panda/core";
import { readJson } from "./files.js";
import { loadFactory, param, type CabinParameters } from "./factory.js";
import { fromRoot } from "./paths.js";
import { buildRegistry, type Registry } from "./registry.js";

export const HABITAT_PARAMETERS_FILE = fromRoot("specs", "habitat-parameters.json");
export const HABITAT_DOCUMENT_FILE = fromRoot("graphs", "habitat.spikypanda");
export const HABITAT_MANIFEST_FILE = fromRoot("graphs", "habitat.manifest.json");

const MINUTE = 60;

/** A step of the scrubber's command in story minutes, value 0 to 1. */
export interface CommandStep {
    from: number;
    to: number;
    value: number;
}

export interface HabitatOptions {
    /** The scrubber's command over the run; the default is the commissioning's two steps, 30 % then 100 %. */
    speedSteps?: CommandStep[];
    /** Story minutes the timelines cover (the last segment is held after). */
    minutes?: number;
    /** The fan's command, 0 to 1 (the parameter file's when absent). */
    fanCommand?: number;
    /** The filter's loading at the start, kg (the parameter file's fault when absent; 0 for a clean filter). */
    filterLoadingKg?: number;
    /** The scrubber's flow at the start, m3/s (0 when absent: it starts from rest, as the stand-in world does). */
    scrubberInitialFlowM3ps?: number;
}

export const DEFAULT_SPEED_STEPS: CommandStep[] = [
    { from: 0, to: 30, value: 0.3 },
    { from: 30, to: 60, value: 1 },
];

export interface HabitatDocumentSpec {
    nodes: DocumentNodeSpec[];
    connections: DocumentConnectionSpec[];
    minutes: number;
}

/**
 * The initial mass of each species of a volume of air, kg, in the
 * atmosphere's own species order: the core's composition preset with its
 * CO2 replaced by what the sensor read, the other fractions scaled so the
 * whole still sums to one, the ideal gas for the moles. This is what the
 * atmosphere derives itself from a bound composition at reset; written
 * into the document it holds in every path, the studio's binding included.
 */
export function initialMassesKg(co2Ppm: number, volumeM3: number, temperatureK: number, preset = "earthHumidAirSeaLevel", pressurePa = 101325): number[] {
    const fractions = { ...(ATMOSPHERE_PRESETS as Record<string, { moleFractions: Record<string, number> }>)[preset].moleFractions } as Record<string, number>;
    const co2 = Math.max(0, co2Ppm) * 1e-6;
    const others = Object.entries(fractions).filter(([s]) => s !== "CO2");
    const sum = others.reduce((a, [, x]) => a + x, 0);
    for (const [s, x] of others) fractions[s] = (x * (1 - co2)) / sum;
    fractions.CO2 = co2;
    const moles = (pressurePa * volumeM3) / (GAS_CONSTANT_R * temperatureK);
    return (V1_SPECIES_ORDER as ReadonlyArray<string>).map((s) => (fractions[s] ?? 0) * moles * (CHEMICAL_SPECIES_V1 as Record<string, { molarMass: number }>)[s].molarMass);
}

/** The document's spec: type ids, parameters from the file, the wiring of the habitat. */
export function habitatDocumentSpec(parameters: CabinParameters, options: HabitatOptions = {}): HabitatDocumentSpec {
    const p = <T = number>(dotted: string) => param<T>(parameters, dotted);
    const steps = options.speedSteps ?? DEFAULT_SPEED_STEPS;
    const minutes = options.minutes ?? Math.max(...steps.map((s) => s.to));
    const segments = (list: Array<{ from: number; to: number; value: unknown }>) => JSON.stringify(list.map((s) => ({ from: s.from * MINUTE, to: s.to * MINUTE, value: s.value })));
    const fanCommand = options.fanCommand ?? p("ventilation.fan.command");
    const preset = p<string>("atmosphere.preset");
    const pressure = p("atmosphere.pressurePa");
    const air = (volume: number, temperature: number, ppm: number) => ({ volume, temperature_k: temperature, initial_atmosphere_preset: preset, _initialMassKg: initialMassesKg(ppm, volume, temperature, preset, pressure) });
    const sensor = { cutoffHz: p("sensors.cutoffHz"), noiseStdev: p("sensors.noisePpm"), quantizationStep: p("sensors.resolutionPpm"), driftPerSec: 0 };
    const litres = (activity: string) => p(`crew.litresPerMinute.${activity}`);
    const crewParams = {
        sleepLitresPerMinute: litres("sleep"),
        restLitresPerMinute: litres("rest"),
        lightWorkLitresPerMinute: litres("light_work"),
        heavyWorkLitresPerMinute: litres("heavy_work"),
        co2DensityKgPerM3: p("crew.co2DensityKgPerM3"),
    };
    const nodes: DocumentNodeSpec[] = [
        { id: "scene", typeId: p<string>("scene.preset"), x: -520, y: -160, label: "Lunar habitat" },
        { id: "solver", typeId: "Control.Sim:rk4-solver", x: -820, y: -160, label: "Solver", params: { tolerance: 1e-6, maxStep: p("time.solverStepSeconds") } },
        { id: "lab", typeId: "Physics.Scene:atmosphere", x: 0, y: 0, label: "Lab air", params: air(p("lab.volumeM3"), p("lab.temperatureK"), p("lab.initialCo2Ppm")) },
        { id: "habb", typeId: "Physics.Scene:atmosphere", x: 0, y: 420, label: "Hab-B air", params: air(p("habB.volumeM3"), p("habB.temperatureK"), p("habB.initialCo2Ppm")) },
        { id: "co2-1", typeId: "DSP.Sensor:transducer", x: 300, y: 0, label: "CO2 sensor co2-1 (Lab)", params: sensor },
        { id: "co2-2", typeId: "DSP.Sensor:transducer", x: 300, y: 420, label: "CO2 sensor co2-2 (Hab-B)", params: sensor },
        { id: "crew-lab", typeId: "Physics.Habitat:crew", x: -520, y: 40, label: "Crew in the Lab", params: { count: p("crew.lab.count"), activity: p<string>("crew.lab.activity"), ...crewParams } },
        { id: "crew-habb", typeId: "Physics.Habitat:crew", x: -520, y: 460, label: "Crew in Hab-B", params: { count: p("crew.habB.count"), activity: p<string>("crew.habB.activity"), ...crewParams } },
        { id: "speed", typeId: "Logic.Time:timeline", x: -820, y: 200, label: "Scrubber command", params: { segments: segments(steps), defaultValue: steps[steps.length - 1]?.value ?? 0 } },
        {
            id: "scrubber",
            typeId: "Physics.Habitat:scrubber",
            x: -520,
            y: 200,
            label: "CO2 scrubber",
            params: {
                flowAtFullM3ps: p("scrubber.flowAtFullM3ps"),
                efficiency: p("scrubber.efficiency"),
                lagTimeConstantMinutes: p("scrubber.lagTimeConstantMinutes"),
                initialFlowM3ps: options.scrubberInitialFlowM3ps ?? 0,
                supplyVolts: p("scrubber.power.supplyVolts"),
                interceptAmps: p("scrubber.power.interceptAmps"),
                slopeAmps: p("scrubber.power.slopeAmps"),
                habitatScale: p("scrubber.power.habitatScale"),
                defaultPressurePa: pressure,
                defaultTemperatureK: p("lab.temperatureK"),
            },
        },
        { id: "fan-command", typeId: "Logic.Time:timeline", x: 300, y: -160, label: "Fan command", params: { segments: segments([{ from: 0, to: minutes, value: fanCommand }]), defaultValue: fanCommand } },
        {
            id: "fan",
            typeId: "Physics.Habitat:fan",
            x: 560,
            y: -160,
            label: "HVAC fan",
            params: {
                shutoffPressurePa: p("ventilation.fan.shutoffPressurePa"),
                freeDeliveryM3ps: p("ventilation.fan.freeDeliveryM3ps"),
                ductResistance: p("ventilation.fan.ductResistance"),
                spinUpSeconds: p("ventilation.fan.spinUpSeconds"),
                fanEfficiency: p("ventilation.fan.fanEfficiency"),
                standbyPowerW: p("ventilation.fan.standbyPowerW"),
                capacityFactor: p("ventilation.fan.capacityFactor"),
                initialSpeedRatio: fanCommand,
            },
        },
        {
            id: "filter",
            typeId: "Physics.Habitat:filter",
            x: 820,
            y: -160,
            label: "HVAC filter",
            params: {
                cleanResistance: p("ventilation.filter.cleanResistance"),
                loadingDoublingKg: p("ventilation.filter.loadingDoublingKg"),
                captureEfficiency: p("ventilation.filter.captureEfficiency"),
                ambientDustKgPerM3: p("ventilation.filter.ambientDustKgPerM3"),
                endOfLifeLoadingKg: p("ventilation.filter.endOfLifeLoadingKg"),
                initialLoadingKg: options.filterLoadingKg ?? p("ventilation.filter.initialLoadingKg"),
                particulateId: p<string>("ventilation.filter.particulate"),
            },
        },
        { id: "dust", typeId: `Physics.Particulate:${p<string>("ventilation.filter.particulate")}`, x: 1080, y: -160, label: "The dust the filter captures" },
        // The ventilation loop: the substrate's gate in its exchange mode, the fan's delivered flow wired into it; the air of each module goes to the other and comes back, the CO2 from the richer to the poorer.
        { id: "hvac", typeId: "Physics.Scene:atmosphere-gate", x: 560, y: 200, label: "Inter-module ventilation", params: { mode: "exchange", trackThroughput: true } },
        { id: "hatch", typeId: "Physics.Scene:atmosphere-gate", x: 560, y: 420, label: "Hatch Lab / Hab-B", params: { mode: p<string>("ventilation.hatch.mode") } },
    ];
    const connections: DocumentConnectionSpec[] = [
        // The scene: its solver, and the Lab's air as its ambient conditions (configuration links: bound in the studio, skipped headless).
        { from: ["solver", "solver_out"], to: ["scene", "solver_in_0"] },
        { from: ["lab", "atmosphere_out"], to: ["scene", "atmosphere_in"] },
        // The Lab's balance: the crew in, the scrubber out (the ventilation and the hatch act on the air through their binding, below).
        { from: ["crew-lab", "co2Delta"], to: ["lab", "delta_CO2_0"] },
        { from: ["scrubber", "co2Delta"], to: ["lab", "delta_CO2_1"] },
        // Hab-B's balance: its crew.
        { from: ["crew-habb", "co2Delta"], to: ["habb", "delta_CO2_0"] },
        // The two sensors, what the logger records.
        { from: ["lab", "ppm_CO2"], to: ["co2-1", "value"] },
        { from: ["habb", "ppm_CO2"], to: ["co2-2", "value"] },
        // The scrubber draws the Lab's air at the commanded speed.
        { from: ["speed", "value"], to: ["scrubber", "command"] },
        { from: ["lab", "ppm_CO2"], to: ["scrubber", "ppm"] },
        // The fan blows through the filter; the filter's resistance sets the fan's flow; that flow is the exchange.
        { from: ["fan-command", "value"], to: ["fan", "command"] },
        { from: ["fan", "flow"], to: ["filter", "flow"] },
        { from: ["filter", "resistance"], to: ["fan", "resistance"] },
        { from: ["dust", "particulate_out"], to: ["filter", "particulate_in"] },
        { from: ["fan", "flow"], to: ["hvac", "flow"] },
        // The two gates between the two airs: the ventilation loop and the hatch (closed during the test), bound to both atmospheres.
        { from: ["lab", "atmosphere_out"], to: ["hvac", "atmosphere_A_in"] },
        { from: ["habb", "atmosphere_out"], to: ["hvac", "atmosphere_B_in"] },
        { from: ["lab", "atmosphere_out"], to: ["hatch", "atmosphere_A_in"] },
        { from: ["habb", "atmosphere_out"], to: ["hatch", "atmosphere_B_in"] },
    ];
    return { nodes, connections, minutes };
}

export const readHabitatParameters = (file = HABITAT_PARAMETERS_FILE): CabinParameters => readJson<CabinParameters>(file);

/** The document as the text of a `.spikypanda` file, built through the real registry. */
export function buildHabitatDocument(options: HabitatOptions = {}, parameters = readHabitatParameters(), registry: Registry = buildRegistry()): { json: string; spec: HabitatDocumentSpec } {
    const spec = habitatDocumentSpec(parameters, options);
    return { json: loadFactory().buildDocumentJson(registry, spec.nodes, spec.connections), spec };
}

/** One row a minute, as the station's logger would record the habitat, with what a logger does not see beside it. */
export interface HabitatRow {
    minute: number;
    /** What the sensors read (the transducer's resolution applied). */
    co2_lab_ppm: number;
    co2_habb_ppm: number;
    speed_percent: number;
    fan_m3_per_min: number;
    filter_clogging: number;
    scrubber_flow_m3ps: number;
    scrubber_removal_kgps: number;
    scrubber_power_w: number;
    /** The air the ventilation loop exchanges each way, m3/s, as the gate delivered it. */
    hvac_flow_m3ps: number;
    lab_co2_kg: number;
    habb_co2_kg: number;
    crew_lab_kgps: number;
    crew_habb_kgps: number;
}

/** A numeric property of a node, or a method of it when a value is not a property (the atmosphere's masses). */
type Reader = (instances: Map<string, unknown>, readNumber: (node: string, property: string) => number) => number;
const property = (node: string, prop: string): Reader => (_i, read) => read(node, prop);
const co2Mass = (node: string): Reader => (instances) => (instances.get(node) as { getMassKg(species: string): number }).getMassKg("CO2");
const PROBES: Array<[keyof HabitatRow, Reader]> = [
    ["co2_lab_ppm", property("co2-1", "lastMeasured")],
    ["co2_habb_ppm", property("co2-2", "lastMeasured")],
    ["fan_m3_per_min", property("fan", "flowM3PerMinute")],
    ["filter_clogging", property("filter", "clogging")],
    ["scrubber_flow_m3ps", property("scrubber", "flowM3ps")],
    ["scrubber_removal_kgps", property("scrubber", "removalKgps")],
    ["scrubber_power_w", property("scrubber", "power")],
    ["hvac_flow_m3ps", property("hvac", "lastVolumetricFlow")],
    ["lab_co2_kg", co2Mass("lab")],
    ["habb_co2_kg", co2Mass("habb")],
    ["crew_lab_kgps", property("crew-lab", "co2Delta")],
    ["crew_habb_kgps", property("crew-habb", "co2Delta")],
];

/**
 * Run a habitat document for a number of story minutes at the parameter
 * file's step, one row a minute (the row of minute m is the state after m
 * minutes; minute 0 is the start). The factory library instantiates and
 * reads; the tick loop is the editor's, minus the animation frame.
 */
export function runHabitat(documentJson: string, minutes: number, steps: CommandStep[] = DEFAULT_SPEED_STEPS, registry: Registry = buildRegistry(), dtSeconds = 6): HabitatRow[] {
    const factory = loadFactory();
    const loaded = factory.instantiateDocument(JSON.parse(documentJson), registry);
    if (loaded.missingTypeIds.length) throw new Error(`habitat: the registry cannot resolve ${loaded.missingTypeIds.join(", ")}`);
    const speedAt = (minute: number) => Math.round(100 * (steps.find((s) => minute >= s.from && minute < s.to)?.value ?? steps[steps.length - 1]?.value ?? 0));
    const readNumber = (node: string, prop: string) => factory.readNumber(loaded, node, prop);
    const read = (minute: number): HabitatRow => {
        const row = { minute, speed_percent: speedAt(minute) } as HabitatRow;
        for (const [key, reader] of PROBES) (row as unknown as Record<string, number>)[key] = reader(loaded.instances as Map<string, unknown>, readNumber);
        return row;
    };
    const { session } = loaded;
    session.reset();
    const perMinute = Math.max(1, Math.round(MINUTE / dtSeconds));
    const rows: HabitatRow[] = [];
    session.run(0);
    rows.push(read(0));
    for (let minute = 1; minute <= minutes; minute++) {
        for (let k = 1; k <= perMinute; k++) session.run(((minute - 1) * perMinute + k) * dtSeconds);
        rows.push(read(minute));
    }
    return rows;
}
