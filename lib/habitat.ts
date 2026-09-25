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
 * catalogue lacked: the persons by name (the medical monitor's roster, each
 * at their own activity) wired into the crew of their module, the scrubber
 * in mass, the fan, the filter and its fouling (`plugins/habitat`).
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
import { fromRoot, HABITAT_DOCUMENT_FILE, relativeToRoot } from "./paths.js";
import type { GraphTemplate, TemplateNode, TemplateProbe, TemplateSetting, TemplateVariable } from "./graph-library.js";
import { buildRegistry, type Registry } from "./registry.js";
import { initialMassesKg } from "./air.js";
import { HabitatFanNode } from "../plugins/habitat/fan.node.js";

export { initialMassesKg, HABITAT_DOCUMENT_FILE };

export const HABITAT_PARAMETERS_FILE = fromRoot("specs", "habitat-parameters.json");
export const HABITAT_MANIFEST_FILE = fromRoot("graphs", "habitat.manifest.json");

/** One person of the station, as the parameter file lists them (the medical monitor's roster). */
export interface HabitatPerson {
    id: string;
    callsign: string;
    name: string;
    /** `lab` or `habB`. */
    module: string;
    activity: string;
}

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
    /** Who is on board and what they do (the parameter file's persons when absent). */
    persons?: HabitatPerson[];
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

/** The crew node of a module, by the module's name in the parameter file. */
export const crewNodeOf = (module: string): string => (module === "lab" ? "crew-lab" : "crew-habb");

/**
 * The flow the ventilation delivers at full command with the filter at a
 * loading, m3/min: the fan's operating point against the duct and the
 * filter, as the nodes compute it (the fan's curve, the filter's
 * resistance growing with its loading). What a fitted loading means as a
 * flow, for a reader who thinks in m3/min.
 */
export function deliveredFlowM3PerMinute(parameters: CabinParameters, loadingKg: number): number {
    const p = (dotted: string) => param<number>(parameters, dotted);
    const fan = new HabitatFanNode();
    fan.shutoffPressurePa = p("ventilation.fan.shutoffPressurePa");
    fan.freeDeliveryM3ps = p("ventilation.fan.freeDeliveryM3ps");
    fan.capacityFactor = p("ventilation.fan.capacityFactor");
    const filter = p("ventilation.filter.cleanResistance") * (1 + Math.max(0, loadingKg) / p("ventilation.filter.loadingDoublingKg"));
    return fan.flowAt(p("ventilation.fan.command"), p("ventilation.fan.ductResistance") + filter) * 60;
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
    // The persons by name, each a node at their own activity, wired into the crew of their module: the crews count nobody unnamed.
    const persons = options.persons ?? p<HabitatPerson[]>("crew.persons");
    const personNodes: DocumentNodeSpec[] = persons.map((who, k) => ({
        id: `person-${who.id}`,
        typeId: "Physics.Habitat:person",
        x: -820,
        y: (who.module === "lab" ? -40 : 380) + 110 * persons.filter((o, j) => j < k && o.module === who.module).length,
        label: `${who.callsign} ${who.name}`,
        params: { name: who.name, callsign: who.callsign, activity: who.activity, ...crewParams },
    }));
    const personLinks: DocumentConnectionSpec[] = [];
    const wired: Record<string, number> = {};
    for (const who of persons) {
        const crew = crewNodeOf(who.module);
        personLinks.push({ from: [`person-${who.id}`, "co2Delta"], to: [crew, `person_${wired[crew] ?? 0}`] });
        wired[crew] = (wired[crew] ?? 0) + 1;
    }
    const nodes: DocumentNodeSpec[] = [
        ...personNodes,
        { id: "scene", typeId: p<string>("scene.preset"), x: -520, y: -160, label: "Lunar habitat" },
        { id: "solver", typeId: "Control.Sim:rk4-solver", x: -820, y: -160, label: "Solver", params: { tolerance: 1e-6, maxStep: p("time.solverStepSeconds") } },
        { id: "lab", typeId: "Physics.Scene:atmosphere", x: 0, y: 0, label: "Lab air", params: air(p("lab.volumeM3"), p("lab.temperatureK"), p("lab.initialCo2Ppm")) },
        { id: "habb", typeId: "Physics.Scene:atmosphere", x: 0, y: 420, label: "Hab-B air", params: air(p("habB.volumeM3"), p("habB.temperatureK"), p("habB.initialCo2Ppm")) },
        { id: "co2-1", typeId: "DSP.Sensor:transducer", x: 300, y: 0, label: "CO2 sensor co2-1 (Lab)", params: sensor },
        { id: "co2-2", typeId: "DSP.Sensor:transducer", x: 300, y: 420, label: "CO2 sensor co2-2 (Hab-B)", params: sensor },
        { id: "crew-lab", typeId: "Physics.Habitat:crew", x: -520, y: 40, label: "Crew in the Lab", params: { count: 0, activity: "light_work", ...crewParams } },
        { id: "crew-habb", typeId: "Physics.Habitat:crew", x: -520, y: 460, label: "Crew in Hab-B", params: { count: 0, activity: "rest", ...crewParams } },
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
        // Each person into the crew of their module (its person pool, one input per person).
        ...personLinks,
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

export const HABITAT_TEMPLATE_FILE = fromRoot("graphs", "habitat.template.json");
export const HABITAT_GRAPH_ID = "habitat";

/**
 * The reference as a library graph (`lib/graph-library.ts`): the same
 * structure as the document, the numbers that only the installation knows
 * or that the documentation gives as bands written as variables, the
 * measured inputs as the logger's columns, the persons of the roster marked
 * by module so a setting says who is on board. The graph factory
 * instantiates it on the twin and fits the variables; the words that
 * describe it to a model are in `graphs/habitat.grammars/`.
 */
export function habitatTemplate(parameters: CabinParameters = readHabitatParameters()): GraphTemplate {
    const p = <T = number>(dotted: string) => param<T>(parameters, dotted);
    const base = habitatDocumentSpec(parameters, { minutes: 1 });
    const persons = p<HabitatPerson[]>("crew.persons");
    const settingOf = (module: string) => (module === "lab" ? "labOccupants" : "habOccupants");
    const seen: Record<string, number> = {};
    const preset = p<string>("atmosphere.preset");
    const pressure = p("atmosphere.pressurePa");
    const air = (volume: string, column: string, temperatureK: number) => ({ volume: { $expr: volume }, temperature_k: temperatureK, initial_atmosphere_preset: preset, _initialMassKg: { $initialMasses: { co2Ppm: { $first: column }, volume, temperatureK, preset, pressurePa: pressure } } });
    const nodes: TemplateNode[] = base.nodes.map((n) => {
        const node: TemplateNode = { ...(n as TemplateNode) };
        const person = persons.find((who) => `person-${who.id}` === n.id);
        if (person) {
            const setting = settingOf(person.module);
            node.$person = { setting, index: seen[setting] ?? 0 };
            seen[setting] = (seen[setting] ?? 0) + 1;
            // The operators' rate is the band's variable; the resting rate the documented one.
            node.params = { ...node.params, ...(person.module === "lab" ? { lightWorkLitresPerMinute: { $expr: "g" } } : { restLitresPerMinute: { $expr: "gRest" } }) };
        }
        switch (n.id) {
            case "crew-lab":
                node.$unnamed = { setting: "labOccupants", roster: persons.filter((who) => who.module === "lab").length };
                node.params = { ...node.params, lightWorkLitresPerMinute: { $expr: "g" } };
                break;
            case "crew-habb":
                node.$unnamed = { setting: "habOccupants", roster: persons.filter((who) => who.module !== "lab").length };
                node.params = { ...node.params, restLitresPerMinute: { $expr: "gRest" } };
                break;
            case "lab":
                node.params = { ...node.params, ...air("V", "co2_lab_ppm", p("lab.temperatureK")) };
                break;
            case "habb":
                node.params = { ...node.params, ...air("Vh", "co2_habb_ppm", p("habB.temperatureK")) };
                break;
            case "speed":
                node.params = { ...node.params, segments: { $series: { column: "speed_percent", scale: "0.01" } }, defaultValue: 0 };
                break;
            case "fan-command":
                node.params = { ...node.params, segments: JSON.stringify([{ from: 0, to: 1e9, value: p("ventilation.fan.command") }]) };
                break;
            case "scrubber":
                node.params = { ...node.params, flowAtFullM3ps: { $expr: "Qe / eta / 60" }, efficiency: { $expr: "eta" }, lagTimeConstantMinutes: { $expr: "lag" }, initialFlowM3ps: 0 };
                break;
            case "filter":
                node.params = { ...node.params, initialLoadingKg: { $expr: "L" } };
                break;
            default:
                break;
        }
        return node;
    });
    const variables: Record<string, TemplateVariable> = {
        V: { default: p("lab.volumeM3"), min: 10, max: 200, unit: "m3", status: "fitted", source: "the commissioning: the volume the scrubber serves; the design drawing gives 32" },
        Vh: { default: p("habB.volumeM3"), min: 50, max: 1000, unit: "m3", status: "fitted", source: "not documented as built (library station-topology)" },
        L: { default: p("ventilation.filter.initialLoadingKg"), min: 0, max: p("ventilation.filter.endOfLifeLoadingKg"), unit: "kg", status: "fitted", source: "what the ventilation delivers, through the filter's loading: 0 is a clean filter at the design flow" },
        g: { default: 0.38, min: 0.26, max: 0.45, unit: "L/min", status: "band", source: "nasa-crew-metabolic-loads: a crewmember awake, 5th to 95th percentile, reference 0.38" },
        gRest: { default: p("crew.litresPerMinute.rest"), unit: "L/min", status: "known", source: "nasa-crew-metabolic-loads: between asleep and awake" },
        Qe: { default: Number((p("scrubber.flowAtFullM3ps") * p("scrubber.efficiency") * 60).toFixed(4)), unit: "m3/min", status: "known", source: "scrubber-1-datasheet: effective flow at full command" },
        eta: { default: p("scrubber.efficiency"), status: "known", source: "scrubber-1-datasheet: single-pass efficiency" },
        lag: { default: p("scrubber.lagTimeConstantMinutes"), unit: "min", status: "known", source: "scrubber-1-datasheet: first-order response" },
    };
    const settings: Record<string, TemplateSetting> = {
        labOccupants: { default: persons.filter((who) => who.module === "lab").length, min: 0, max: 8 },
        habOccupants: { default: persons.filter((who) => who.module !== "lab").length, min: 0, max: 8 },
    };
    const probes: TemplateProbe[] = [
        { node: "co2-1", property: "lastMeasured", unit: "ppm", column: "co2_lab_ppm" },
        { node: "co2-2", property: "lastMeasured", unit: "ppm", column: "co2_habb_ppm" },
        { node: "lab", property: "ppm_CO2", unit: "ppm" },
        { node: "habb", property: "ppm_CO2", unit: "ppm" },
        { node: "fan", property: "flowM3PerMinute", unit: "m3/min" },
        { node: "filter", property: "clogging" },
        { node: "scrubber", property: "flowM3ps", unit: "m3/s" },
        { node: "scrubber", property: "removalKgps", unit: "kg/s" },
        { node: "hvac", property: "lastVolumetricFlow", unit: "m3/s" },
        { node: "crew-lab", property: "co2Delta", unit: "kg/s" },
        { node: "crew-habb", property: "co2Delta", unit: "kg/s" },
    ];
    return {
        id: HABITAT_GRAPH_ID,
        title: "The habitat reference: two modules, a centralised scrubber, the inter-module ventilation through its filter, the crew by name",
        document: relativeToRoot(HABITAT_DOCUMENT_FILE),
        parameters: relativeToRoot(HABITAT_PARAMETERS_FILE),
        variables,
        settings,
        probes,
        spec: { nodes, connections: base.connections.map((c) => ({ from: [...c.from] as [string, string], to: [...c.to] as [string, string] })) },
    };
}

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
