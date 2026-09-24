/**
 * The habitat reference: the two-module habitat as a document of the
 * catalogue (the substrate's atmosphere and scene, the repository's
 * habitat plugin), built from one reviewable parameter file and run
 * headless. It is the physical reference the demo measures against: the
 * commissioning's telemetry comes from it, and a twin is judged by how
 * close it comes to what this graph did.
 *
 *     specs/habitat-parameters.json  ->  habitatDocumentSpec  ->  buildDocumentJson  ->  graphs/habitat.spikypanda
 *                                                                       |
 *                                                          runHabitat: rows a minute, as a logger would record them
 *
 * Nothing is typed here: every constant goes through the node's editable
 * setters from the parameter file; the graph's structure is the one
 * thing this file owns. The stand-in world of `harness/stand-in` solved
 * the same balance in TypeScript until this ran; the tests keep the two
 * within a few ppm.
 */
import type { DocumentConnectionSpec, DocumentNodeSpec } from "@spiky-panda/factory";
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
    /** The hatch's state (the parameter file's when absent). */
    hatchOpen?: boolean;
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

/** The document's spec: type ids, parameters from the file, the wiring of the habitat. */
export function habitatDocumentSpec(parameters: CabinParameters, options: HabitatOptions = {}): HabitatDocumentSpec {
    const p = <T = number>(dotted: string) => param<T>(parameters, dotted);
    const steps = options.speedSteps ?? DEFAULT_SPEED_STEPS;
    const minutes = options.minutes ?? Math.max(...steps.map((s) => s.to));
    const segments = (list: Array<{ from: number; to: number; value: unknown }>) => JSON.stringify(list.map((s) => ({ from: s.from * MINUTE, to: s.to * MINUTE, value: s.value })));
    const fanCommand = options.fanCommand ?? p("ventilation.fan.command");
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
        { id: "lab", typeId: "Physics.Habitat:atmosphere", x: 0, y: 0, label: "Lab air", params: { volume: p("lab.volumeM3"), temperature_k: p("lab.temperatureK"), initialCo2Ppm: p("lab.initialCo2Ppm") } },
        { id: "habb", typeId: "Physics.Habitat:atmosphere", x: 0, y: 420, label: "Hab-B air", params: { volume: p("habB.volumeM3"), temperature_k: p("habB.temperatureK"), initialCo2Ppm: p("habB.initialCo2Ppm") } },
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
                defaultPressurePa: 101325,
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
            },
        },
        { id: "hvac", typeId: "Physics.Habitat:duct", x: 560, y: 200, label: "Inter-module ventilation", params: { defaultPressurePa: 101325, defaultTemperatureK: p("lab.temperatureK") } },
        {
            id: "hatch",
            typeId: "Physics.Habitat:hatch",
            x: 560,
            y: 420,
            label: "Hatch Lab / Hab-B",
            params: { openExchangeM3ps: p("ventilation.hatch.openExchangeM3ps"), closedLeakM3ps: p("ventilation.hatch.closedLeakM3ps"), open: options.hatchOpen ?? p<boolean>("ventilation.hatch.open"), defaultPressurePa: 101325, defaultTemperatureK: p("lab.temperatureK") },
        },
    ];
    const connections: DocumentConnectionSpec[] = [
        { from: ["solver", "solver_out"], to: ["scene", "solver_in_0"] },
        // The Lab's balance: the crew in, the scrubber out, the ventilation and the hatch both ways.
        { from: ["crew-lab", "co2Delta"], to: ["lab", "delta_CO2_0"] },
        { from: ["hvac", "co2DeltaA"], to: ["lab", "delta_CO2_1"] },
        { from: ["hatch", "co2DeltaA"], to: ["lab", "delta_CO2_2"] },
        { from: ["scrubber", "co2Delta"], to: ["lab", "delta_CO2_3"] },
        // Hab-B's balance: its crew, and what the ventilation and the hatch bring from the Lab.
        { from: ["crew-habb", "co2Delta"], to: ["habb", "delta_CO2_0"] },
        { from: ["hvac", "co2DeltaB"], to: ["habb", "delta_CO2_1"] },
        { from: ["hatch", "co2DeltaB"], to: ["habb", "delta_CO2_2"] },
        // The scrubber draws the Lab's air at the commanded speed.
        { from: ["speed", "value"], to: ["scrubber", "command"] },
        { from: ["lab", "ppm_CO2"], to: ["scrubber", "ppm"] },
        // The fan blows through the filter; the filter's resistance sets the fan's flow; that flow is the exchange.
        { from: ["fan-command", "value"], to: ["fan", "command"] },
        { from: ["fan", "flow"], to: ["filter", "flow"] },
        { from: ["filter", "resistance"], to: ["fan", "resistance"] },
        { from: ["fan", "flow"], to: ["hvac", "flow"] },
        { from: ["lab", "ppm_CO2"], to: ["hvac", "ppmA"] },
        { from: ["habb", "ppm_CO2"], to: ["hvac", "ppmB"] },
        { from: ["lab", "ppm_CO2"], to: ["hatch", "ppmA"] },
        { from: ["habb", "ppm_CO2"], to: ["hatch", "ppmB"] },
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
    co2_lab_ppm: number;
    co2_habb_ppm: number;
    speed_percent: number;
    fan_m3_per_min: number;
    filter_clogging: number;
    scrubber_flow_m3ps: number;
    scrubber_removal_kgps: number;
    scrubber_power_w: number;
    hvac_flux_kgps: number;
    lab_co2_kg: number;
    habb_co2_kg: number;
    crew_lab_kgps: number;
    crew_habb_kgps: number;
}

const PROBES: Array<[keyof HabitatRow, string, string]> = [
    ["co2_lab_ppm", "lab", "co2Ppm"],
    ["co2_habb_ppm", "habb", "co2Ppm"],
    ["fan_m3_per_min", "fan", "flowM3PerMinute"],
    ["filter_clogging", "filter", "clogging"],
    ["scrubber_flow_m3ps", "scrubber", "flowM3ps"],
    ["scrubber_removal_kgps", "scrubber", "removalKgps"],
    ["scrubber_power_w", "scrubber", "power"],
    ["hvac_flux_kgps", "hvac", "co2FluxKgps"],
    ["lab_co2_kg", "lab", "co2MassKg"],
    ["habb_co2_kg", "habb", "co2MassKg"],
    ["crew_lab_kgps", "crew-lab", "co2Delta"],
    ["crew_habb_kgps", "crew-habb", "co2Delta"],
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
    const read = (minute: number): HabitatRow => {
        const row = { minute, speed_percent: speedAt(minute) } as HabitatRow;
        for (const [key, node, property] of PROBES) (row as unknown as Record<string, number>)[key] = factory.readNumber(loaded, node, property);
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
