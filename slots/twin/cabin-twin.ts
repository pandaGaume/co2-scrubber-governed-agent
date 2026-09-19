/**
 * The cabin twin as a function: load `graphs/cabin.spikypanda` once, and for
 * each question instantiate a fresh session, set the state the question
 * starts from (the cabin CO2, the crew, the scrubber command over time), run
 * it one story minute per tick, and hand back the rows.
 *
 * This is the same document, the same nodes and the same solver the factory
 * runs headless and the editor runs live; the twin slot and the plan job
 * are two callers of this file. Every answer names the parameter file and
 * the document it was computed with (their sha256), because the story's
 * numbers are read here and nowhere else.
 */
import { readJson, sha256File } from "../../lib/files.js";
import { loadFactory, param, type CabinParameters, type CommandSegment, type CrewGroup, type FactoryLibrary, type Scenario } from "../../lib/factory.js";
import { CABIN_DOCUMENT_FILE, DEFAULT_SCENARIO_FILE, PARAMETERS_FILE, relativeToRoot } from "../../lib/paths.js";

export const DOCUMENT = CABIN_DOCUMENT_FILE;
export const PARAMETERS = PARAMETERS_FILE;
export const SCENARIO = DEFAULT_SCENARIO_FILE;
const MINUTE = 60;

type Registry = ReturnType<FactoryLibrary["buildJobRegistry"]>;
type SavedGraph = ReturnType<FactoryLibrary["readDocument"]>;

export interface FileIdentity {
    file: string;
    sha256: string;
    status?: string;
}
export interface TwinIdentity {
    document: FileIdentity;
    parameters: FileIdentity;
    scenario: FileIdentity;
}
export interface Thresholds {
    elevatedPpm: number;
    criticalPpm: number;
}
export interface Twin {
    factory: FactoryLibrary;
    registry: Registry;
    doc: SavedGraph;
    parameters: CabinParameters;
    scenario: Scenario;
    identity: TwinIdentity;
    thresholds: Thresholds;
}

let cache: Twin | null = null;

/** The factory, the registry, the document and the files' identities, loaded once. */
export function twin(): Twin {
    if (cache) return cache;
    const factory = loadFactory();
    const registry = factory.buildJobRegistry();
    const doc = factory.readDocument(DOCUMENT);
    const parameters = readJson<CabinParameters>(PARAMETERS);
    const scenario = readJson<Scenario>(SCENARIO);
    cache = {
        factory,
        registry,
        doc,
        parameters,
        scenario,
        identity: {
            document: { file: relativeToRoot(DOCUMENT), sha256: sha256File(DOCUMENT) },
            parameters: { file: relativeToRoot(PARAMETERS), sha256: sha256File(PARAMETERS), status: parameters.status },
            scenario: { file: relativeToRoot(SCENARIO), sha256: sha256File(SCENARIO) },
        },
        thresholds: { elevatedPpm: param(parameters, "thresholds.elevatedPpm"), criticalPpm: param(parameters, "thresholds.criticalPpm") },
    };
    return cache;
}

const STATES = ["NOMINAL", "ELEVATED", "CRITICAL"] as const;
export const stateName = (s: number): string => STATES[s] ?? String(s);

/** Checks a crew list `[{ count, activity }]`; at most two groups (the document has two Crew nodes). */
export function checkCrew(crew: unknown, activities: ReadonlyArray<string>): CrewGroup[] {
    if (!Array.isArray(crew) || crew.length === 0) throw new Error("crew must be a non-empty list of { count, activity }");
    if (crew.length > 2) throw new Error("the cabin twin drives two crew groups at most");
    for (const [i, g] of (crew as Array<Partial<CrewGroup> | undefined>).entries()) {
        if (typeof g?.count !== "number" || g.count < 0) throw new Error(`crew[${i}].count must be a number >= 0`);
        if (!activities.includes(String(g?.activity))) throw new Error(`crew[${i}].activity must be one of ${activities.join(", ")}`);
    }
    return crew as CrewGroup[];
}

export interface CabinRow {
    minute: number;
    co2Ppm: number;
    state: number;
    rate: number;
    powerW: number;
    stateOfCharge: number;
}

export interface CabinRun {
    /** starting concentration */
    co2Ppm: number;
    /** one or two groups, constant over the run */
    crew: CrewGroup[];
    /** the scrubber command over time, story minutes, value 0..1 */
    command: CommandSegment[];
    /** story minutes to simulate */
    minutes: number;
    stateOfChargePercent?: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Runs the twin; one row per story minute. */
export function runCabin({ co2Ppm, crew, command, minutes, stateOfChargePercent }: CabinRun): CabinRow[] {
    const { factory, registry, doc, parameters } = twin();
    const activities = param<string[]>(parameters, "crew.activities");
    checkCrew(crew, activities);
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("minutes must be a positive number");
    const loaded = factory.instantiateDocument(doc, registry);
    if (loaded.missingTypeIds.length) throw new Error(`document: unknown nodes ${loaded.missingTypeIds.join(", ")}`);
    const end = minutes * MINUTE;
    const set = (node: string, property: string, value: unknown) => factory.applySetting(loaded, { node, property, value });
    set("cabin", "initialPpm", co2Ppm);
    const groups: CrewGroup[] = [crew[0], crew[1] ?? { count: 0, activity: activities[0] as CrewGroup["activity"] }];
    set("crew-a-count", "segments", JSON.stringify([{ from: 0, to: end, value: groups[0].count }]));
    set("crew-a-activity", "segments", JSON.stringify([{ from: 0, to: end, value: groups[0].activity }]));
    set("crew-b-count", "segments", JSON.stringify([{ from: 0, to: end, value: groups[1].count }]));
    set("crew-b-activity", "segments", JSON.stringify([{ from: 0, to: end, value: groups[1].activity }]));
    set("command", "segments", JSON.stringify(command.map((s) => ({ from: s.from * MINUTE, to: s.to * MINUTE, value: clamp01(s.value) }))));
    set("command", "defaultValue", clamp01(command[command.length - 1]?.value ?? 0));
    if (typeof stateOfChargePercent === "number") set("battery", "initialStateOfChargePercent", stateOfChargePercent);
    const { session } = loaded;
    // The settings above include initial states: the session restarts from
    // them, and its solvers re-read the leaves.
    session.reset();
    const rows: CabinRow[] = [];
    session.run(0);
    for (let minute = 1; minute <= minutes; minute++) {
        session.run(minute * MINUTE);
        rows.push({
            minute,
            co2Ppm: factory.readNumber(loaded, "cabin", "co2Ppm"),
            state: factory.readNumber(loaded, "cabin", "state"),
            rate: factory.readNumber(loaded, "scrubber", "effectiveRatePerMinute"),
            powerW: factory.readNumber(loaded, "scrubber", "power"),
            stateOfCharge: factory.readNumber(loaded, "battery", "stateOfChargePercent"),
        });
    }
    return rows;
}

/** Steady state of the model for a constant crew and command, in closed form. */
export function steadyStatePpm(crew: ReadonlyArray<CrewGroup>, command: number): number {
    const { parameters } = twin();
    const rate = param(parameters, "scrubber.rateAtFullCommand") * clamp01(command);
    const e = crew.reduce((sum, g) => sum + g.count * param(parameters, `crew.emissionPerPerson.${g.activity}`), 0);
    const floor = param(parameters, "scrubber.removalFloorPpm");
    const leak = param(parameters, "cabin.leakPerMinute");
    return (e + rate * floor) / (rate + leak);
}

export interface RunSummary {
    minutes: number;
    peakPpm: number;
    peakAtMinute: number;
    finalPpm: number;
    finalState: string;
    minutesToElevated: number | null;
    minutesToCritical: number | null;
    crossesCritical: boolean;
    scrubberEnergyWh: number;
    stateOfChargePercent: number;
}

/** Summary of a run: the peak, the first minute in each state, the energy the scrubber drew. */
export function summarize(rows: ReadonlyArray<CabinRow>): RunSummary {
    const { thresholds } = twin();
    let peak = rows[0];
    let firstElevated: number | null = null;
    let firstCritical: number | null = null;
    let energyWh = 0;
    for (const r of rows) {
        if (r.co2Ppm > peak.co2Ppm) peak = r;
        if (firstElevated === null && r.co2Ppm >= thresholds.elevatedPpm) firstElevated = r.minute;
        if (firstCritical === null && r.co2Ppm >= thresholds.criticalPpm) firstCritical = r.minute;
        energyWh += r.powerW / 60;
    }
    const last = rows[rows.length - 1];
    return {
        minutes: rows.length,
        peakPpm: round(peak.co2Ppm),
        peakAtMinute: peak.minute,
        finalPpm: round(last.co2Ppm),
        finalState: stateName(last.state),
        minutesToElevated: firstElevated,
        minutesToCritical: firstCritical,
        crossesCritical: firstCritical !== null,
        scrubberEnergyWh: round(energyWh),
        stateOfChargePercent: round(last.stateOfCharge, 2),
    };
}

export function round(x: number, digits = 1): number {
    const k = 10 ** digits;
    return Math.round(x * k) / k;
}
