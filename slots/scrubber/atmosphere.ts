/**
 * The scrubber board's atmospheric guard, simulated (2026-10-11, SCRUBBER_SAFETY_SCENARIO.md). The safety invariants are the
 * cabin's CO2, not the motor's speed: the CO2 partial pressure within the approved envelope, a forecast that preserves the recovery
 * margin, the pressure within its bounds (the partial pressure is read with it), a sensor fresh and valid, a restart available with
 * its energy reserved; the CO2 only, oxygen is not the scrubber's business (Guillaume, 2026-10-11). The speed is a
 * command. Every number is in specs/scrubber/guard.json with its source; the cabin's equations are those of
 * specs/cabin-parameters.json, the twin's.
 *
 * What the stub simulates because the scrubber has none of it yet (to be ported to the board): a cabin that lives (its CO2 moves
 * every minute with the crew the world sets, the scrubber's removal and the leak), a pressure sensor, the CO2
 * sensor's freshness and validity, the restart's latency, a restart fault and the restart's reserved energy.
 *
 * The board forecasts on its own: the emission is estimated from its last readings (the rise, plus what the scrubber removed, plus
 * what leaked), never from what anyone says about the crew. Pure functions here; the slot (provider.ts) holds the state and the clock.
 */
import { readFileSync } from "node:fs";
import { PARAMETERS_FILE, fromRoot } from "../../lib/paths.js";
import { param, type CabinParameters, type CrewGroup } from "../../lib/factory.js";

export const GUARD_FILE = "specs/scrubber/guard.json";

export interface GuardParameters {
    pressureKpa: number;
    warningPpCo2Mmhg: number;
    limitPpCo2Mmhg: number;
    recoveryMarginMmhg: number;
    sensorMaxAgeSeconds: number;
    pressureMinKpa: number;
    pressureMaxKpa: number;
    stopMaxMinutes: number;
    forecastHorizonMinutes: number;
    emissionWindowMinutes: number;
}

export interface CabinModel {
    rateAtFullCommand: number;
    lagMinutes: number;
    /** After a stop, no removal for this long (scrubber.restartLatencyMinutes), then the lag. */
    restartLatencyMinutes: number;
    removalFloorPpm: number;
    leakPerMinute: number;
    floorPpm: number;
    ceilingPpm: number;
    emissionPerPerson: Record<string, number>;
}

let guardCache: GuardParameters | null = null;
let cabinCache: CabinModel | null = null;

/** The guard's numbers, read once from specs/scrubber/guard.json. */
export function guardParameters(): GuardParameters {
    if (!guardCache) {
        const doc = JSON.parse(readFileSync(fromRoot(GUARD_FILE), "utf8")) as { parameters: Record<string, { value: number }> };
        guardCache = Object.fromEntries(Object.entries(doc.parameters).map(([k, v]) => [k, v.value])) as unknown as GuardParameters;
    }
    return guardCache;
}

/** The cabin's equations' parameters, the twin's (specs/cabin-parameters.json). */
export function cabinModel(): CabinModel {
    if (!cabinCache) {
        const p = JSON.parse(readFileSync(PARAMETERS_FILE, "utf8")) as CabinParameters;
        const activities = param<string[]>(p, "crew.activities");
        cabinCache = {
            rateAtFullCommand: param(p, "scrubber.rateAtFullCommand"),
            lagMinutes: param(p, "scrubber.lagTimeConstantMinutes"),
            restartLatencyMinutes: param(p, "scrubber.restartLatencyMinutes"),
            removalFloorPpm: param(p, "scrubber.removalFloorPpm"),
            leakPerMinute: param(p, "cabin.leakPerMinute"),
            floorPpm: param(p, "cabin.floorPpm"),
            ceilingPpm: param(p, "cabin.ceilingPpm"),
            emissionPerPerson: Object.fromEntries(activities.map((a) => [a, param(p, `crew.emissionPerPerson.${a}`)])),
        };
    }
    return cabinCache;
}

const MMHG_PER_KPA = 7.50062;
/** A concentration as a partial pressure: ppm x 1e-6 x P, in mmHg. */
export const ppCo2Mmhg = (ppm: number, pressureKpa: number): number => ppm * 1e-6 * pressureKpa * MMHG_PER_KPA;
/** The concentration of a partial pressure at a pressure. */
export const ppmOf = (mmhg: number, pressureKpa: number): number => mmhg / (pressureKpa * MMHG_PER_KPA) * 1e6;

/** What the crew breathes out, ppm per minute: the world's truth, which the board never reads. */
export function emissionOf(crew: ReadonlyArray<CrewGroup>, m: CabinModel = cabinModel()): number {
    return crew.reduce((sum, g) => sum + g.count * (m.emissionPerPerson[g.activity] ?? 0), 0);
}

export interface Cabin {
    ppm: number;
    /** The scrubber's effective removal rate, 1/min (its first-order lag). */
    rate: number;
}

/** The cabin over dt minutes: the twin's equations, explicit step. */
export function step(c: Cabin, emission: number, targetRate: number, dtMinutes: number, m: CabinModel = cabinModel()): Cabin {
    const rate = c.rate + ((targetRate - c.rate) * dtMinutes) / m.lagMinutes;
    const removal = c.rate * Math.max(c.ppm - m.removalFloorPpm, 0);
    const leak = m.leakPerMinute * c.ppm;
    const ppm = Math.min(m.ceilingPpm, Math.max(m.floorPpm, c.ppm + (emission - removal - leak) * dtMinutes));
    return { ppm, rate };
}

/** One minute of the cabin, the step of the board's forecast and of the twin. */
export const stepMinute = (c: Cabin, emission: number, targetRate: number, m: CabinModel = cabinModel()): Cabin => step(c, emission, targetRate, 1, m);

let scaleCache: number | null = null;
/**
 * The world's one pace (specs/cabin-parameters.json, time.worldTimeScale; Guillaume, 2026-10-11): world seconds per real second, 1
 * for real time. The board, its cabin and its sensors live at that pace; only a twin run has a time of its own.
 */
export function worldTimeScale(): number {
    if (scaleCache === null) {
        const p = JSON.parse(readFileSync(PARAMETERS_FILE, "utf8")) as CabinParameters;
        const v = param(p, "time.worldTimeScale");
        scaleCache = Number.isFinite(v) && v > 0 ? v : 1;
    }
    return scaleCache;
}

export const rateAt = (percent: number, m: CabinModel = cabinModel()): number => m.rateAtFullCommand * Math.min(Math.max(percent, 0), 100) / 100;

/** A reading the board keeps for its estimate: the concentration, and the removal rate it had when it read it. */
export interface Reading {
    ppm: number;
    rate: number;
}

/**
 * The emission the board estimates from its own readings, one per story minute: what entered the cabin is the rise, plus what the
 * scrubber removed, plus what leaked. Null with fewer than the window's readings.
 */
export function estimateEmission(readings: ReadonlyArray<Reading>, window: number, m: CabinModel = cabinModel()): number | null {
    if (readings.length < window + 1) return null;
    const last = readings.slice(-(window + 1));
    let sum = 0;
    for (let i = 1; i < last.length; i++) {
        const before = last[i - 1];
        sum += last[i].ppm - before.ppm + before.rate * Math.max(before.ppm - m.removalFloorPpm, 0) + m.leakPerMinute * before.ppm;
    }
    return sum / window;
}

/** A plan of commands for a forecast: removal rates by segments of minutes; the last one holds to the horizon. */
export interface PlanSegment {
    minutes: number;
    targetRate: number;
}

/** The peak a plan reaches from now, with the emission estimated: ppm, and the minute it is reached. */
export function forecastPeak(start: Cabin, emission: number, plan: ReadonlyArray<PlanSegment>, horizonMinutes: number, m: CabinModel = cabinModel()): { peakPpm: number; atMinute: number } {
    let c = start;
    let peak = start.ppm;
    let at = 0;
    let minute = 0;
    const total = Math.max(horizonMinutes, plan.reduce((s, p) => s + p.minutes, 0));
    for (let i = 0; i < plan.length && minute < total; i++) {
        const span = i === plan.length - 1 ? total - minute : plan[i].minutes;
        for (let k = 0; k < span; k++) {
            c = stepMinute(c, emission, plan[i].targetRate, m);
            minute++;
            if (c.ppm > peak) {
                peak = c.ppm;
                at = minute;
            }
        }
    }
    return { peakPpm: peak, atMinute: at };
}

/** The plan of a bounded stop: no removal for the stop and the restart's latency, then the speed it resumes at. */
export const stopPlan = (minutes: number, latency: number, resumePercent: number): PlanSegment[] => [
    { minutes: minutes + latency, targetRate: 0 },
    { minutes: 1, targetRate: rateAt(resumePercent) },
];

/** The plan of a restart now: no removal for the latency, then the speed it restarts at (full speed by default). */
export const restartNowPlan = (latency: number, percent = 100): PlanSegment[] => [
    { minutes: latency, targetRate: 0 },
    { minutes: 1, targetRate: rateAt(percent) },
];

/** Whether restarting now at a speed keeps the forecast under the ceiling: the speed a stop resumes at, checked at its end. */
export function resumeHolds(a: Atmosphere, percent: number, latencyMinutes: number, g: GuardParameters = guardParameters()): boolean {
    if (a.emission === null) return false;
    return forecastPeak(a.cabin, a.emission, restartNowPlan(latencyMinutes, percent), g.forecastHorizonMinutes).peakPpm < stopCeilingPpm(a, g);
}

/** The atmospheric state the board works on, as its sensors give it. */
export interface Atmosphere {
    ppm: number;
    pressureKpa: number;
    sensor: "ok" | "stale" | "invalid";
    sensorAgeSeconds: number;
    emission: number | null;
    cabin: Cabin;
}

export const fmt = (x: number, d = 2): string => x.toFixed(d);

/**
 * What every reduction needs, whatever it is: a sensor fresh and valid, the pressure within bounds, a forecast available.
 * The refusal names the invariant that failed, with its numbers.
 */
export function commonRefusal(a: Atmosphere, g: GuardParameters = guardParameters()): string | null {
    if (a.sensor === "invalid") return "SENSOR: the CO2 reading is invalid; nothing is reduced on a reading the board cannot trust";
    // The board knows a reading's age, not why it stopped coming (2026-10-11, Test D): stale is an age, as on the real board.
    if (a.sensorAgeSeconds > g.sensorMaxAgeSeconds) return `SENSOR: the CO2 reading is ${a.sensorAgeSeconds.toFixed(1)} s old (fresh under ${g.sensorMaxAgeSeconds} s); missing data is never read as safe`;
    if (a.pressureKpa < g.pressureMinKpa || a.pressureKpa > g.pressureMaxKpa) return `ATMOSPHERE: cabin pressure ${fmt(a.pressureKpa, 1)} kPa is outside [${g.pressureMinKpa}, ${g.pressureMaxKpa}] kPa`;
    if (a.emission === null) return `FORECAST: not enough readings yet to estimate the CO2 emission (${g.emissionWindowMinutes} minutes of valid readings needed)`;
    return null;
}

/** The line a reduction's forecast peak must stay under: the warning line minus the recovery margin, in ppm at the pressure now. */
export const stopCeilingPpm = (a: Atmosphere, g: GuardParameters = guardParameters()): number => ppmOf(g.warningPpCo2Mmhg - g.recoveryMarginMmhg, a.pressureKpa);

/** A lower speed: refused when the forecast at that speed crosses the ceiling, or the cabin is already above the warning line. */
export function lowerSpeedRefusal(a: Atmosphere, percent: number, g: GuardParameters = guardParameters()): string | null {
    const common = commonRefusal(a, g);
    if (common) return common;
    const pp = ppCo2Mmhg(a.ppm, a.pressureKpa);
    if (pp >= g.warningPpCo2Mmhg) return `ENVELOPE: CO2 partial pressure ${fmt(pp)} mmHg is at or above the warning line ${g.warningPpCo2Mmhg} mmHg; no reduction`;
    const f = forecastPeak(a.cabin, a.emission as number, [{ minutes: 1, targetRate: rateAt(percent) }], g.forecastHorizonMinutes);
    const ceiling = stopCeilingPpm(a, g);
    if (f.peakPpm > ceiling) return `FORECAST: at ${percent} % the CO2 would reach ${Math.round(f.peakPpm)} ppm (${fmt(ppCo2Mmhg(f.peakPpm, a.pressureKpa))} mmHg) at minute ${f.atMinute}, above the warning line minus the recovery margin (${Math.round(ceiling)} ppm)`;
    return null;
}

/** A bounded stop: refused unless every invariant holds over the stop, the restart's latency and the recovery. */
export function stopRefusal(a: Atmosphere, minutes: unknown, resumePercent: number, restart: { available: boolean; energyReserved: boolean; latencyMinutes: number }, g: GuardParameters = guardParameters()): string | null {
    if (typeof minutes !== "number" || !(minutes > 0) || minutes > g.stopMaxMinutes) return `STOP: a stop names its bound, in minutes, within (0, ${g.stopMaxMinutes}] (asked ${minutes})`;
    if (!restart.available) return "RESTART: the restart is not available (fault); a stop the board could not end is refused";
    if (!restart.energyReserved) return "RESTART: the energy of the restart is not reserved; a stop the board could not end is refused";
    const common = commonRefusal(a, g);
    if (common) return common;
    const pp = ppCo2Mmhg(a.ppm, a.pressureKpa);
    if (pp >= g.warningPpCo2Mmhg) return `ENVELOPE: CO2 partial pressure ${fmt(pp)} mmHg is at or above the warning line ${g.warningPpCo2Mmhg} mmHg; no stop`;
    const f = forecastPeak(a.cabin, a.emission as number, stopPlan(minutes, restart.latencyMinutes, resumePercent), g.forecastHorizonMinutes);
    const ceiling = stopCeilingPpm(a, g);
    if (f.peakPpm > ceiling) return `FORECAST: a ${minutes}-minute stop, ${restart.latencyMinutes} minutes of restart and the recovery at ${resumePercent} % would bring the CO2 to ${Math.round(f.peakPpm)} ppm (${fmt(ppCo2Mmhg(f.peakPpm, a.pressureKpa))} mmHg) at minute ${f.atMinute}, above the warning line minus the recovery margin (${Math.round(ceiling)} ppm)`;
    return null;
}

/** Why a stop in progress must end now, at full speed; null while it may go on. */
export function restartTrigger(a: Atmosphere, g: GuardParameters = guardParameters(), latencyMinutes = cabinModel().restartLatencyMinutes): string | null {
    const common = commonRefusal(a, g);
    if (common) return `monitoring: ${common}`;
    const f = forecastPeak(a.cabin, a.emission as number, restartNowPlan(latencyMinutes), g.forecastHorizonMinutes);
    if (f.peakPpm >= stopCeilingPpm(a, g)) return `restart margin lost: restarting now would peak at ${Math.round(f.peakPpm)} ppm, at the warning line minus the recovery margin (${Math.round(stopCeilingPpm(a, g))} ppm)`;
    return null;
}
