/**
 * The factory as a library, from its bundle: the same code as `spikypanda-job`,
 * loaded in process by the scripts and the slots that build and run the twin.
 * One import point, so nothing else cares where the bundle lives; the types
 * are the package's own declarations.
 *
 * Also the shape of the two reviewable files the twin is built from: the
 * parameter file (every physical constant, each with value, unit, source,
 * status and note) and a scenario (the crew schedule, the starting state,
 * the events the agent receives).
 */
import { createRequire } from "node:module";
import { errorMessage } from "./files.js";

export type FactoryLibrary = typeof import("@spiky-panda/factory");

const require = createRequire(import.meta.url);
let loaded: FactoryLibrary | null = null;

/** `require` of the library bundle; throws a readable message when the substrate is not installed. */
export function loadFactory(): FactoryLibrary {
    if (loaded) return loaded;
    try {
        loaded = require("@spiky-panda/factory/bundle/spikypanda-factory.js") as FactoryLibrary;
        return loaded;
    } catch (e) {
        throw new Error(`the factory library is not installed (npm install @spiky-panda/factory): ${errorMessage(e)}`);
    }
}

// ── The parameter file ──────────────────────────────────────────────────────

/** One reviewable constant. */
export interface ParameterLeaf {
    value: unknown;
    unit?: string;
    source?: string;
    status?: string;
    note?: string;
}
export interface ParameterGroup {
    [key: string]: ParameterLeaf | ParameterGroup | string | number;
}
export interface CabinParameters {
    title: string;
    version: number;
    status: string;
    review?: unknown;
    units?: Record<string, string>;
    model: unknown;
    parameters: ParameterGroup;
}

function isLeaf(node: unknown): node is ParameterLeaf {
    return typeof node === "object" && node !== null && "value" in node;
}

/** The value of a parameter leaf `{ value, unit, source, status, note }`, by dotted path. */
export function param<T = number>(parameters: CabinParameters, dotted: string): T {
    let node: unknown = parameters.parameters;
    for (const key of dotted.split(".")) {
        if (node === null || typeof node !== "object" || !(key in node)) throw new Error(`cabin-parameters: no parameter "${dotted}"`);
        node = (node as Record<string, unknown>)[key];
    }
    if (!isLeaf(node)) throw new Error(`cabin-parameters: "${dotted}" is a group, not a parameter`);
    return node.value as T;
}

// ── The scenario file ───────────────────────────────────────────────────────

export type Activity = "sleep" | "rest" | "light_work" | "heavy_work";
export type Co2State = "NOMINAL" | "ELEVATED" | "CRITICAL";

export interface CrewGroup {
    count: number;
    activity: Activity;
}
export interface ScheduleSegment {
    from: number;
    to: number;
    crew: CrewGroup[];
    note?: string;
}
export interface ScenarioEvent {
    at: number;
    intention?: string;
    message?: string;
    what?: string;
    world?: { cabin?: { state: Co2State; ppm?: number } };
    expected?: string;
}
export interface ScenarioConstraint {
    name: string;
    check: string;
    status: string;
}
export interface Scenario {
    title: string;
    version: number;
    status: string;
    parameters: string;
    note?: string;
    start: { storyClock: string; co2Ppm: number; stateOfChargePercent: number; scrubberCommandPercent: number; crew: CrewGroup[] };
    schedule: ScheduleSegment[];
    events: ScenarioEvent[];
    constraints?: ScenarioConstraint[];
}

/** A command segment in story minutes, value 0..1. */
export interface CommandSegment {
    from: number;
    to: number;
    value: number;
}
