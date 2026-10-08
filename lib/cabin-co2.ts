/**
 * The cabin's CO2 state from a concentration (2026-10-08): what the sensor
 * reports to the board with its reading (`scrubber.co2_report`), on the
 * thresholds of `specs/cabin-parameters.json`, the same ones the twin uses.
 * The board does not classify: it applies the state it is told, so the
 * thresholds live here, once.
 */
import { readFileSync } from "node:fs";
import { PARAMETERS_FILE } from "./paths.js";
import { param, type CabinParameters, type Co2State } from "./factory.js";

let thresholds: { elevatedPpm: number; criticalPpm: number } | null = null;

/** The thresholds, read once. */
export function co2Thresholds(): { elevatedPpm: number; criticalPpm: number } {
    if (!thresholds) {
        const parameters = JSON.parse(readFileSync(PARAMETERS_FILE, "utf8")) as CabinParameters;
        thresholds = { elevatedPpm: param(parameters, "thresholds.elevatedPpm"), criticalPpm: param(parameters, "thresholds.criticalPpm") };
    }
    return thresholds;
}

/** A concentration per state, for a scene that names the state and not the reading (the night's story events). */
const STORY_PPM: Record<Co2State, number> = { NOMINAL: 1200, ELEVATED: 2600, CRITICAL: 5000 };

/**
 * The reading the world reports to the board (`scrubber.co2_report`), the same on the stub and on the board: a
 * concentration and its state; the state from the thresholds when only the concentration is known, the scene's
 * own state when it says one.
 */
export function cabinReading(ppm: number | undefined, state?: Co2State): { ppm: number; state: Co2State; source: string } {
    const value = typeof ppm === "number" ? Math.round(ppm) : STORY_PPM[state ?? "NOMINAL"];
    return { ppm: value, state: state ?? co2StateOf(value), source: "world" };
}

/** NOMINAL below the elevated threshold, ELEVATED up to the critical one, CRITICAL at or above it. */
export function co2StateOf(ppm: number): Co2State {
    const t = co2Thresholds();
    return ppm >= t.criticalPpm ? "CRITICAL" : ppm >= t.elevatedPpm ? "ELEVATED" : "NOMINAL";
}
