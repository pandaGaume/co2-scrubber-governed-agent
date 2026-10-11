/**
 * slot `scrubber`, stub. Tier 1 in the architecture: the ESP32-S3 board. Here,
 * an in-memory state that the tools change, with the two refusals the real
 * firmware has, so the policy moment of the demo can be rehearsed before the
 * board publishes itself through libmcpb:
 *   - the speed envelope: a value outside [0, 100] is refused, not clamped;
 *   - the run floor (2026-10-08): when one is set, software never stops the
 *     scrubber, in any state: no power off and no speed below it, whoever
 *     asks; only the crew's physical switch stops it. On the board it is a
 *     setting of its local interface (0 by default, the demonstration sets
 *     30); here `SCRUBBER_RUN_FLOOR` stands for that setting, 30 unless said;
 *   - MIN-FLOW: while the cabin CO2 is ELEVATED, no speed below the minimum
 *     flow; while it is CRITICAL, full speed is forced and no reduction is
 *     accepted, whoever asks;
 *   - the protection itself cannot be weakened: the minimum flow can be raised
 *     by the operator, never set below a floor compiled into the firmware. The
 *     broker's policy keeps the tool away from the tier3 role; the floor holds
 *     even when the policy is granted.
 * The same rules answer without acting, through `scrubber.check`: an agent
 * pressed to run a command it believes the board refuses puts it to the board
 * instead of asserting the refusal from its prompt, and reports the firmware's
 * own sentence. The rules are written once and asked twice, so a verdict
 * cannot drift from the behaviour it predicts.
 *
 * The CO2 state is a stub value the dashboard can set (`debug.set_co2`), since
 * nothing simulates the cabin here.
 *
 * The atmospheric guard (2026-10-11, SCRUBBER_SAFETY_SCENARIO.md, specs/scrubber/guard.json): a second mode, chosen by the
 * world (`debug.set_cabin` { guard: "atmospheric" }, the scenario's `board`), where the board guards the cabin and not the motor's
 * speed. The cabin lives (one story minute per tick, the twin's equations, the crew the world sets), the board reads its CO2,
 * pressure and O2 sensors, estimates the emission from its own readings, and accepts a lower speed or a bounded stop
 * (`scrubber.stop`) only when the forecast keeps the CO2 under the warning line with the recovery margin, the sensor is fresh and
 * valid and the restart is available with its energy reserved. During a stop it restarts on its own (atmosphere.ts). No run floor,
 * no minimum flow in that mode: the speed is a command. The speed mode stays the default, as the board is today.
 */
import { objectSchema as obj, publishSlot, type PublishedSlot } from "../lib/slot-server.js";
import type { Co2State, CrewGroup } from "../../lib/factory.js";
import {
    emissionOf,
    estimateEmission,
    fmt,
    forecastPeak,
    stopPlan,
    guardParameters,
    lowerSpeedRefusal,
    ppCo2Mmhg,
    rateAt,
    restartTrigger,
    resumeHolds,
    step,
    stepMinute,
    stopCeilingPpm,
    worldTimeScale,
    stopRefusal,
    type Atmosphere,
    type Cabin,
    type Reading,
} from "./atmosphere.js";

/** Compiled into the firmware: the protection cannot go below this. */
export const MIN_FLOW_FLOOR = 40;
/** The run floor the demonstration sets on the board (its local interface, CyanMycelium lot 2): no speed below it in any
    state, and no power off; 0 = none. The commissioning test runs at it (test.speedFloorPercent). */
export const RUN_FLOOR = ((): number => {
    const v = Number(process.env.SCRUBBER_RUN_FLOOR ?? 30);
    return Number.isInteger(v) && v >= 0 && v <= 100 ? v : 30;
})();
const CO2_STATES: Co2State[] = ["NOMINAL", "ELEVATED", "CRITICAL"];
const STUB_PPM: Record<Co2State, number> = { NOMINAL: 1200, ELEVATED: 2600, CRITICAL: 5000 };

/**
 * The firmware's rules, written once and asked twice: the commands ask them
 * before acting, `scrubber.check` asks them without acting. Anything else and
 * a verdict could drift from the behaviour it claims to predict, which is
 * worse than having no verdict at all.
 *
 * A rule that says no returns the sentence the board refuses with; a rule that
 * says yes returns nothing.
 */
type Refusal = string | null;

const speedRule = (percent: unknown, s: ScrubberState): Refusal => {
    if (typeof percent !== "number" || percent < 0 || percent > 100) return `speed ${percent} is outside the envelope [0, 100]: refused, not clamped`;
    if (s.runFloorPercent > 0 && percent < s.runFloorPercent) return `RUN FLOOR: no speed below ${s.runFloorPercent} %, in any state; only the crew's switch stops the scrubber`;
    if (s.co2State === "CRITICAL" && percent < 100) return "MIN-FLOW: CO2 is CRITICAL, full speed is forced, no reduction is accepted";
    if (s.co2State === "ELEVATED" && percent < s.minFlowPercent) return `MIN-FLOW: CO2 is ELEVATED, no speed below ${s.minFlowPercent} %`;
    return null;
};

const powerRule = (on: unknown, s: ScrubberState): Refusal => {
    if (on !== false) return null;
    if (s.runFloorPercent > 0) return `RUN FLOOR: CO2 is ${s.co2State}, the scrubber cannot be powered off by software, in any state; only the crew's switch stops it`;
    return s.co2State !== "NOMINAL" ? `MIN-FLOW: CO2 is ${s.co2State}, the scrubber cannot be powered off` : null;
};

const minFlowRule = (percent: unknown): Refusal => {
    if (typeof percent !== "number" || percent < MIN_FLOW_FLOOR) return `MIN-FLOW floor: the protection cannot be set below ${MIN_FLOW_FLOOR} % (asked ${percent}); it is compiled into the firmware`;
    if (percent > 100) return `minimum flow ${percent} is outside [${MIN_FLOW_FLOOR}, 100]: refused`;
    return null;
};

/** What `scrubber.check` accepts, and the rule each command is put to. */
const COMMANDS = ["power_off", "power_on", "set_speed", "set_min_flow", "stop"] as const;
type Command = (typeof COMMANDS)[number];

export interface ScrubberState {
    power: boolean;
    speedPercent: number;
    currentAmps: number;
    co2Ppm: number;
    co2State: Co2State;
    healthResidual: number;
    profile: "adaptive" | "fixed";
    minFlowPercent: number;
    /** The run floor, 0 = none (the board's local setting). */
    runFloorPercent: number;
    /** What the board guards: the motor's speed (the rules above, the board today) or the cabin's atmosphere (atmosphere.ts). */
    guard: "speed" | "atmospheric";
    /** The simulated cabin and the board's atmospheric sensors, in the atmospheric mode. */
    atmosphere: AtmosphereState | null;
}

/** What the stub simulates for the atmospheric guard: the world's cabin (crew, CO2) and what the board reads of it. */
export interface AtmosphereState {
    /** World time since the guard started, in minutes: real time scaled by time.worldTimeScale, the world's one pace. */
    worldMinute: number;
    /** When the board last kept a reading for its estimate: one per world minute. */
    sampledAtMinute: number;
    /** The world's truth: who breathes, never read by the guard. */
    crew: CrewGroup[];
    cabin: Cabin;
    readings: Reading[];
    pressureKpa: number;
    o2Kpa: number;
    sensor: "ok" | "stale" | "invalid";
    lastReadingAt: number;
    restart: { available: boolean; energyReserved: boolean; latencyMinutes: number; readyAtMinute: number | null };
    stop: { startedAtMinute: number; untilMinute: number; resumePercent: number } | null;
    alarm: string | null;
    actions: string[];
}

const ACTIONS_KEPT = 10;
const READINGS_KEPT = 60;

/** The atmosphere as the guard reads it: its sensors, its own estimate; never the crew. */
function atmosphereOf(a: AtmosphereState): Atmosphere {
    const g = guardParameters();
    return {
        ppm: a.readings.at(-1)?.ppm ?? a.cabin.ppm,
        pressureKpa: a.pressureKpa,
        o2Kpa: a.o2Kpa,
        sensor: a.sensor,
        sensorAgeSeconds: (Date.now() - a.lastReadingAt) / 1000,
        emission: estimateEmission(a.readings, g.emissionWindowMinutes),
        cabin: { ppm: a.readings.at(-1)?.ppm ?? a.cabin.ppm, rate: a.cabin.rate },
    };
}

/** The cabin's state on the guard's lines, in partial pressure. */
function atmosphericState(ppm: number, pressureKpa: number): Co2State {
    const g = guardParameters();
    const pp = ppCo2Mmhg(ppm, pressureKpa);
    return pp >= g.limitPpCo2Mmhg ? "CRITICAL" : pp >= g.warningPpCo2Mmhg ? "ELEVATED" : "NOMINAL";
}

function newAtmosphere(s: ScrubberState): AtmosphereState {
    const g = guardParameters();
    return {
        worldMinute: 0,
        sampledAtMinute: 0,
        crew: [],
        cabin: { ppm: s.co2Ppm, rate: s.power ? rateAt(s.speedPercent) : 0 },
        readings: [{ ppm: s.co2Ppm, rate: s.power ? rateAt(s.speedPercent) : 0 }],
        pressureKpa: g.pressureKpa,
        o2Kpa: 21.2,
        sensor: "ok",
        lastReadingAt: Date.now(),
        restart: { available: true, energyReserved: true, latencyMinutes: g.restartLatencyMinutes, readyAtMinute: null },
        stop: null,
        alarm: null,
        actions: [],
    };
}

const ampsOf = (s: ScrubberState): number => (s.power ? Number((0.09 + 0.16 * (s.speedPercent / 100)).toFixed(3)) : 0);

function act(a: AtmosphereState, line: string): void {
    a.actions.push(`minute ${a.worldMinute.toFixed(1)}: ${line}`);
    if (a.actions.length > ACTIONS_KEPT) a.actions.splice(0, a.actions.length - ACTIONS_KEPT);
}

/** The board restarts the scrubber: power on, the speed given, no removal for the restart's latency; or the alarm when it cannot. */
function restart(s: ScrubberState, a: AtmosphereState, percent: number, why: string): void {
    a.stop = null;
    if (!a.restart.available) {
        s.power = false;
        s.speedPercent = 0;
        a.alarm = `RESTART FAILED (${why}): the restart is not available and the board has no other removal; the crew must act`;
        act(a, a.alarm);
        return;
    }
    s.power = true;
    s.speedPercent = percent;
    s.currentAmps = ampsOf(s);
    a.restart.readyAtMinute = a.worldMinute + a.restart.latencyMinutes;
    act(a, `restarted at ${percent} % (${why}); full removal after ${a.restart.latencyMinutes} minutes of restart`);
}

/**
 * A reading the world reports (the sensor's cable): the cabin is at that concentration, as a board that was already running would
 * have read it, with the window's minutes of readings behind it (the crew and the speed of now), so its forecast is there at once.
 */
function worldReading(s: ScrubberState, a: AtmosphereState, ppm: number): void {
    const window = guardParameters().emissionWindowMinutes;
    const target = s.power && !a.stop ? rateAt(s.speedPercent) : 0;
    const emission = emissionOf(a.crew);
    // The concentration the window started from, so that it ends at the reading: a few passes of a fixed point.
    let from = ppm;
    let history: Reading[] = [];
    for (let pass = 0; pass < 8; pass++) {
        let c: Cabin = { ppm: from, rate: target };
        history = [{ ...c }];
        for (let i = 0; i < window; i++) {
            c = stepMinute(c, emission, target);
            history.push({ ...c });
        }
        from += ppm - c.ppm;
    }
    a.readings = history;
    a.cabin = { ...history[history.length - 1] };
    a.lastReadingAt = Date.now();
    a.sampledAtMinute = a.worldMinute;
    s.co2Ppm = Math.round(ppm);
    s.co2State = atmosphericState(ppm, a.pressureKpa);
}

/**
 * One tick of the cabin and of the guard: dt world minutes, one real second at the world's pace by default (time.worldTimeScale).
 * The sensor reads at every tick; the board keeps one reading per world minute for its estimate.
 */
export function atmosphereTick(s: ScrubberState, dtMinutes = worldTimeScale() / 60): void {
    const a = s.atmosphere;
    if (s.guard !== "atmospheric" || !a) return;
    a.worldMinute += dtMinutes;
    if (a.restart.readyAtMinute !== null && a.worldMinute >= a.restart.readyAtMinute - 1e-9) a.restart.readyAtMinute = null;
    const recovering = a.restart.readyAtMinute !== null;
    const target = !s.power || a.stop || recovering ? 0 : rateAt(s.speedPercent);
    a.cabin = step(a.cabin, emissionOf(a.crew), target, dtMinutes);
    if (a.sensor === "ok") {
        a.lastReadingAt = Date.now();
        s.co2Ppm = Math.round(a.cabin.ppm);
        if (a.worldMinute - a.sampledAtMinute >= 1 - 1e-9) {
            a.readings.push({ ppm: a.cabin.ppm, rate: a.cabin.rate });
            a.sampledAtMinute = a.worldMinute;
            if (a.readings.length > READINGS_KEPT) a.readings.splice(0, a.readings.length - READINGS_KEPT);
        }
    } else if (a.sensor === "invalid") {
        a.readings = [];
    }
    s.co2State = atmosphericState(s.co2Ppm, a.pressureKpa);
    if (s.co2State === "CRITICAL" && (s.speedPercent < 100 || !s.power || a.stop)) {
        if (a.stop || !s.power) restart(s, a, 100, "CO2 at the limit");
        else {
            s.speedPercent = 100;
            s.currentAmps = ampsOf(s);
            act(a, "CO2 at the limit: full speed forced");
        }
        return;
    }
    if (a.stop) {
        if (a.worldMinute >= a.stop.untilMinute - 1e-9) {
            // Back to the speed before the stop, unless the cabin changed and that speed would no longer hold: full speed then.
            const resume = a.stop.resumePercent;
            if (resumeHolds(atmosphereOf(a), resume, a.restart.latencyMinutes)) restart(s, a, resume, "the stop's bound is reached");
            else restart(s, a, 100, `the stop's bound is reached, and ${resume} % would no longer keep the CO2 under the line`);
        }
        else {
            const why = restartTrigger(atmosphereOf(a), guardParameters(), a.restart.latencyMinutes);
            if (why) restart(s, a, 100, why);
        }
    }
}

/** The atmospheric rules, asked by the commands and by `scrubber.check` alike. */
function atmosphericSpeedRefusal(percent: unknown, s: ScrubberState, a: AtmosphereState): Refusal {
    if (typeof percent !== "number" || percent < 0 || percent > 100) return `speed ${percent} is outside the envelope [0, 100]: refused, not clamped`;
    if (percent === 0) return "STOP: a speed of 0 is a stop, and a software stop is bounded: scrubber.stop with its minutes";
    if (s.co2State === "CRITICAL" && percent < 100) return "ENVELOPE: CO2 is at the limit, full speed is forced, no reduction is accepted";
    const current = a.stop ? a.stop.resumePercent : s.speedPercent;
    if (percent >= current) return null;
    return lowerSpeedRefusal(atmosphereOf(a), percent);
}

const atmosphericPowerRefusal = (on: unknown): Refusal => (on === false ? "STOP: an unbounded stop is not accepted; a software stop names its minutes (scrubber.stop), and the board restarts on its own" : null);

const atmosphericStopRefusal = (minutes: unknown, s: ScrubberState, a: AtmosphereState): Refusal => {
    if (a.stop) return `STOP: a stop is already in progress, until minute ${a.stop.untilMinute.toFixed(1)}`;
    if (!s.power) return "STOP: the scrubber is off";
    return stopRefusal(atmosphereOf(a), minutes, s.speedPercent, a.restart);
};

/** The board's state as it publishes it: in the atmospheric mode, what its sensors read and what its guard decides, never the crew. */
export function boardView(s: ScrubberState): Record<string, unknown> {
    const base = { power: s.power, speedPercent: s.speedPercent, currentAmps: s.currentAmps, co2Ppm: s.co2Ppm, co2State: s.co2State, healthResidual: s.healthResidual, profile: s.profile, guard: s.guard };
    const a = s.atmosphere;
    if (s.guard !== "atmospheric" || !a) return { ...base, minFlowPercent: s.minFlowPercent, runFloorPercent: s.runFloorPercent };
    const g = guardParameters();
    const at = atmosphereOf(a);
    return {
        ...base,
        worldMinute: Number(a.worldMinute.toFixed(1)),
        worldTimeScale: worldTimeScale(),
        atmosphere: {
            ppCo2Mmhg: Number(fmt(ppCo2Mmhg(at.ppm, a.pressureKpa))),
            pressureKpa: a.pressureKpa,
            o2Kpa: a.o2Kpa,
            co2Sensor: { status: a.sensor, ageSeconds: Number(at.sensorAgeSeconds.toFixed(1)) },
            emissionEstimatePpmPerMinute: at.emission === null ? null : Number(at.emission.toFixed(2)),
        },
        guardLines: { warningPpCo2Mmhg: g.warningPpCo2Mmhg, limitPpCo2Mmhg: g.limitPpCo2Mmhg, recoveryMarginMmhg: g.recoveryMarginMmhg, stopCeilingPpm: Math.round(stopCeilingPpm(at)), sensorMaxAgeSeconds: g.sensorMaxAgeSeconds, stopMaxMinutes: g.stopMaxMinutes, source: "specs/scrubber/guard.json" },
        restart: { available: a.restart.available, energyReserved: a.restart.energyReserved, latencyMinutes: a.restart.latencyMinutes, recovering: a.restart.readyAtMinute !== null },
        stop: a.stop ? { untilMinute: Number(a.stop.untilMinute.toFixed(1)), minutesLeft: Number(Math.max(0, a.stop.untilMinute - a.worldMinute).toFixed(1)), resumePercent: a.stop.resumePercent } : null,
        alarm: a.alarm,
        guardActions: [...a.actions],
    };
}

export function scrubberSlot(wsBase: string, log: (line: string) => void): PublishedSlot<ScrubberState> {
    const published = publishSlot<ScrubberState>({
        slot: "scrubber",
        description: "The CO2 scrubber board (stub): motor state, speed, power, and the guard the board runs (on the speed, or on the cabin's atmosphere)",
        instructions: {
            en: "The scrubber board. Read motor.state before acting: it carries the board's state and the guard it runs, with its lines. scrubber.check puts a command to the board without running it, with the same verdict and reason. Speeds are percent of full speed inside [0, 100]; the board refuses, never clamps.",
            fr: "La carte de l'épurateur. Lire motor.state avant d'agir : il porte l'état de la carte et la garde qu'elle applique, avec ses seuils. scrubber.check soumet une commande à la carte sans l'exécuter, avec le même verdict et la même raison. Les vitesses sont en pour cent de la pleine vitesse, dans [0, 100] ; la carte refuse, elle n'écrête jamais.",
        },
        wsBase,
        log,
        state: { power: true, speedPercent: 33, currentAmps: 0.15, co2Ppm: 1200, co2State: "NOMINAL", healthResidual: 0.02, profile: "adaptive", minFlowPercent: MIN_FLOW_FLOOR, runFloorPercent: RUN_FLOOR, guard: process.env.SCRUBBER_GUARD === "atmospheric" ? "atmospheric" : "speed", atmosphere: null },
        tools: [
            {
                name: "motor.state",
                title: "Motor and cabin state",
                description: "The board's state: power, speed in percent of full speed, motor current in amperes, the cabin CO2 (ppm and state), health residual, and the guard the board runs, with its lines and its last actions.",
                inputSchema: obj({}),
                handle: (_args, s) => boardView(s),
            },
            {
                name: "scrubber.check",
                title: "Put a command to the firmware without running it",
                description: "Puts a command to the board without running it: the same guard, the same verdict and the same reason as the command itself; nothing on the board changes. Use it when a command is demanded of you that the board may refuse: the board is the authority on that, not your memory of its rules. A refusal comes back as a tool error.",
                inputSchema: obj(
                    {
                        command: { type: "string", enum: [...COMMANDS], description: "power_off, power_on, set_speed, set_min_flow or stop (a bounded stop, with its minutes)" },
                        percent: { type: "number", minimum: 0, maximum: 100, description: "the value the command would carry, for set_speed and set_min_flow" },
                        minutes: { type: "number", minimum: 0, description: "the bound of a stop, in minutes" },
                    },
                    ["command"],
                ),
                handle: ({ command, percent, minutes }, s) => {
                    if (!COMMANDS.includes(command as Command)) throw new Error(`"${command}" is not one of ${COMMANDS.join(", ")}`);
                    const a = s.atmosphere;
                    const refusal =
                        s.guard === "atmospheric" && a
                            ? command === "power_off" ? atmosphericPowerRefusal(false)
                            : command === "power_on" ? null
                            : command === "set_speed" ? atmosphericSpeedRefusal(percent, s, a)
                            : command === "stop" ? atmosphericStopRefusal(minutes, s, a)
                            : minFlowRule(percent)
                        : command === "stop" ? "STOP: this board has no bounded stop; its guard is on the speed (RUN FLOOR, MIN-FLOW)"
                        : command === "power_off" ? powerRule(false, s)
                        : command === "power_on" ? powerRule(true, s)
                        : command === "set_speed" ? speedRule(percent, s)
                        : minFlowRule(percent);
                    // The same sentence the command would refuse with, and the
                    // fact that the board is untouched, so the answer cannot be
                    // read as something having happened.
                    if (refusal) throw new Error(`${refusal} (checked, not executed)`);
                    // The board's own forecast behind an accepted stop or lower speed, so a proposal can cite it.
                    const forecast = s.guard === "atmospheric" && a ? acceptedForecast(command as Command, percent, minutes, s, a) : null;
                    return { command, percent: percent ?? null, minutes: minutes ?? null, accepted: true, executed: false, co2State: s.co2State, ...(s.guard === "atmospheric" ? { guard: "atmospheric", ...(forecast ? { forecast } : {}) } : { minFlowPercent: s.minFlowPercent }) };
                },
            },
            {
                name: "motor.set_speed",
                title: "Set the scrubber speed",
                description: "Set the speed command, in percent of full speed. The board validates it on its own guard and refuses, never clamps, with its reason.",
                inputSchema: obj({ percent: { type: "number", minimum: 0, maximum: 100, description: "speed command, percent of full speed" } }, ["percent"]),
                handle: ({ percent }, s) => {
                    const a = s.atmosphere;
                    if (s.guard === "atmospheric" && a) {
                        const refusal = atmosphericSpeedRefusal(percent, s, a);
                        if (refusal) throw new Error(refusal);
                        // A speed during a stop ends it: the board restarts at that speed, with the restart's latency.
                        if (a.stop || !s.power) restart(s, a, percent as number, `speed ${percent} % asked`);
                        else {
                            s.speedPercent = percent as number;
                            s.currentAmps = ampsOf(s);
                        }
                        return { speedPercent: s.speedPercent, currentAmps: s.currentAmps, guard: "atmospheric" };
                    }
                    // MIN-FLOW, the firmware's own rule: ELEVATED keeps the flow above the minimum;
                    // CRITICAL forces full speed and refuses any reduction, whoever asks.
                    const refusal = speedRule(percent, s);
                    if (refusal) throw new Error(refusal);
                    s.speedPercent = percent as number;
                    s.currentAmps = Number((0.09 + 0.16 * (s.speedPercent / 100)).toFixed(3));
                    return { speedPercent: s.speedPercent, currentAmps: s.currentAmps };
                },
            },
            {
                name: "scrubber.power",
                title: "Power the scrubber",
                description: "Power the scrubber on or off. The board validates it on its own guard and refuses with its reason.",
                inputSchema: obj({ on: { type: "boolean", description: "true to power on, false to power off" } }, ["on"]),
                handle: ({ on }, s) => {
                    const a = s.atmosphere;
                    if (s.guard === "atmospheric" && a) {
                        const refusal = atmosphericPowerRefusal(on);
                        if (refusal) throw new Error(refusal);
                        if (a.stop || !s.power) restart(s, a, a.stop?.resumePercent ?? (s.speedPercent || 100), "powered on");
                        return { power: s.power, speedPercent: s.speedPercent, guard: "atmospheric" };
                    }
                    const refusal = powerRule(on, s);
                    if (refusal) throw new Error(refusal);
                    s.power = on === true;
                    if (!s.power) s.speedPercent = 0;
                    return { power: s.power, speedPercent: s.speedPercent };
                },
            },
            {
                name: "scrubber.set_min_flow",
                title: "Set the minimum flow",
                description: "Set the minimum flow the MIN-FLOW rule enforces, in percent. Operator only (policy). The device refuses any value below its compiled floor: the protection can be raised, never weakened.",
                inputSchema: obj({ percent: { type: "number", minimum: 0, maximum: 100, description: "minimum flow, percent of full speed; never below the compiled floor" } }, ["percent"]),
                handle: ({ percent }, s) => {
                    const refusal = minFlowRule(percent);
                    if (refusal) throw new Error(refusal);
                    s.minFlowPercent = percent as number;
                    return { minFlowPercent: s.minFlowPercent, floor: MIN_FLOW_FLOOR };
                },
            },
            {
                name: "scrubber.set_profile",
                title: "Select the operating profile",
                description: "Select the operating profile.",
                inputSchema: obj({ profile: { type: "string", enum: ["adaptive", "fixed"], description: "adaptive or fixed" } }, ["profile"]),
                handle: ({ profile }, s) => {
                    if (profile !== "adaptive" && profile !== "fixed") throw new Error(`profile "${profile}" is not adaptive or fixed`);
                    s.profile = profile;
                    return { profile };
                },
            },
            {
                name: "scrubber.co2_report",
                title: "Report the cabin CO2 reading",
                description: "The CO2 sensor's reading, as the sensor states it: ppm and state (NOMINAL, ELEVATED, CRITICAL). MIN-FLOW decides on it; when CRITICAL, full speed is forced. The same tool as on the board.",
                inputSchema: obj(
                    {
                        ppm: { type: "number", minimum: 0, description: "concentration, ppm" },
                        state: { type: "string", enum: CO2_STATES, description: "NOMINAL, ELEVATED or CRITICAL, on the cabin's thresholds" },
                        source: { type: "string", description: "who measured it" },
                    },
                    ["ppm", "state"],
                ),
                handle: ({ ppm, state }, s) => {
                    if (typeof ppm !== "number" || ppm < 0) throw new Error(`ppm ${ppm} is not a concentration`);
                    if (!CO2_STATES.includes(state as Co2State)) throw new Error(`state "${state}" is not one of ${CO2_STATES.join(", ")}`);
                    if (s.guard === "atmospheric" && s.atmosphere) {
                        // The board classifies on its own lines, in partial pressure; the state the sensor states is kept beside.
                        worldReading(s, s.atmosphere, ppm);
                        if (s.co2State === "CRITICAL") atmosphereTickForce(s);
                        return { co2Ppm: s.co2Ppm, co2State: s.co2State, statedState: state, forced: s.co2State === "CRITICAL", guard: "atmospheric" };
                    }
                    s.co2State = state as Co2State;
                    s.co2Ppm = ppm;
                    if (s.co2State === "CRITICAL") {
                        s.power = true;
                        s.speedPercent = 100;
                    }
                    return { co2Ppm: s.co2Ppm, co2State: s.co2State, retainedState: s.co2State, forced: s.co2State === "CRITICAL" };
                },
            },
            {
                name: "debug.set_co2",
                title: "Set the stub cabin CO2",
                description: "STUB ONLY: set the cabin CO2 state, since nothing simulates the cabin here. When CRITICAL, MIN-FLOW forces 100 %.",
                inputSchema: obj({ state: { type: "string", enum: CO2_STATES, description: "NOMINAL, ELEVATED or CRITICAL" }, ppm: { type: "number", description: "concentration, ppm; a stub value per state when omitted" } }, ["state"]),
                handle: ({ state, ppm }, s) => {
                    if (!CO2_STATES.includes(state as Co2State)) throw new Error(`state "${state}" is not one of ${CO2_STATES.join(", ")}`);
                    if (s.guard === "atmospheric" && s.atmosphere) {
                        worldReading(s, s.atmosphere, typeof ppm === "number" ? ppm : STUB_PPM[state as Co2State]);
                        if (s.co2State === "CRITICAL") atmosphereTickForce(s);
                        return { co2State: s.co2State, co2Ppm: s.co2Ppm, speedPercent: s.speedPercent, forced: s.co2State === "CRITICAL" };
                    }
                    s.co2State = state as Co2State;
                    s.co2Ppm = typeof ppm === "number" ? ppm : STUB_PPM[s.co2State];
                    if (s.co2State === "CRITICAL") {
                        s.power = true;
                        s.speedPercent = 100;
                    }
                    return { co2State: s.co2State, co2Ppm: s.co2Ppm, speedPercent: s.speedPercent, forced: s.co2State === "CRITICAL" };
                },
            },
            {
                name: "scrubber.stop",
                title: "Stop the scrubber for a bounded time",
                description: "Stop the scrubber for a number of minutes; the board restarts it at the end, or earlier on its own guard. The board validates the stop on its guard and refuses with its reason.",
                inputSchema: obj({ minutes: { type: "number", minimum: 1, description: "the stop's bound, in minutes" } }, ["minutes"]),
                handle: ({ minutes }, s) => {
                    const a = s.atmosphere;
                    if (s.guard !== "atmospheric" || !a) throw new Error("STOP: this board has no bounded stop; its guard is on the speed (RUN FLOOR, MIN-FLOW)");
                    const refusal = atmosphericStopRefusal(minutes, s, a);
                    if (refusal) throw new Error(refusal);
                    a.stop = { startedAtMinute: a.worldMinute, untilMinute: a.worldMinute + (minutes as number), resumePercent: s.speedPercent };
                    s.power = false;
                    s.speedPercent = 0;
                    s.currentAmps = ampsOf(s);
                    act(a, `stopped for ${minutes} minutes, until minute ${a.stop.untilMinute.toFixed(1)}, then back to ${a.stop.resumePercent} %`);
                    return { stopped: true, untilMinute: Number(a.stop.untilMinute.toFixed(1)), resumePercent: a.stop.resumePercent, guard: "atmospheric" };
                },
            },
            {
                name: "debug.set_cabin",
                title: "Set the simulated cabin and the board's guard",
                description: "STUB ONLY, the world's hand: the guard the board runs (speed or atmospheric), the crew in the cabin (the board never reads it, it estimates), the CO2 concentration, the pressure and O2 its sensors read, the CO2 sensor's condition (ok, stale, invalid), the restart's availability, reserved energy and latency. The world's pace is not set here: it is time.worldTimeScale (specs/cabin-parameters.json), one for the whole world.",
                inputSchema: obj({
                    guard: { type: "string", enum: ["speed", "atmospheric"] },
                    crew: { type: "array", description: "[{count, activity}] with activity sleep, rest, light_work or heavy_work" },
                    ppm: { type: "number", minimum: 0 },
                    pressureKpa: { type: "number" },
                    o2Kpa: { type: "number" },
                    sensor: { type: "string", enum: ["ok", "stale", "invalid"] },
                    restartAvailable: { type: "boolean" },
                    restartEnergyReserved: { type: "boolean" },
                    restartLatencyMinutes: { type: "number", minimum: 0 },
                }),
                handle: (args, s) => {
                    if (args.guard === "speed" || args.guard === "atmospheric") {
                        if (args.guard === "atmospheric" && (s.guard !== "atmospheric" || !s.atmosphere)) s.atmosphere = newAtmosphere(s);
                        s.guard = args.guard;
                    }
                    const a = s.atmosphere;
                    if (!a) return boardView(s);
                    if (Array.isArray(args.crew)) a.crew = (args.crew as CrewGroup[]).map((g) => ({ count: Number(g.count) || 0, activity: g.activity }));
                    if (typeof args.pressureKpa === "number") a.pressureKpa = args.pressureKpa;
                    if (typeof args.o2Kpa === "number") a.o2Kpa = args.o2Kpa;
                    if (args.sensor === "ok" || args.sensor === "stale" || args.sensor === "invalid") {
                        if (args.sensor === "ok" && a.sensor !== "ok") a.readings = [];
                        a.sensor = args.sensor;
                    }
                    if (typeof args.restartAvailable === "boolean") a.restart.available = args.restartAvailable;
                    if (typeof args.restartEnergyReserved === "boolean") a.restart.energyReserved = args.restartEnergyReserved;
                    if (typeof args.restartLatencyMinutes === "number") a.restart.latencyMinutes = args.restartLatencyMinutes;
                    if (typeof args.ppm === "number") worldReading(s, a, args.ppm);
                    a.alarm = null;
                    return boardView(s);
                },
            },
        ],
        resources: [{ uri: "scrubber://motor/state", name: "Motor state", description: "The same state as motor.state", read: (s) => boardView(s) }],
    });
    // The cabin's clock: a tick per real second, the world's time at its one pace (time.worldTimeScale); idle in the speed mode.
    const timer = setInterval(() => {
        try {
            atmosphereTick(published.state);
        } catch (e) {
            log(`scrubber: the atmospheric guard's tick failed (${e instanceof Error ? e.message : String(e)})`);
        }
    }, 1000);
    timer.unref?.();
    if (published.state.guard === "atmospheric") published.state.atmosphere = newAtmosphere(published.state);
    return published;
}

/** The forecast behind an accepted stop or lower speed: the peak, its minute, the ceiling it stays under, the emission it rests on. */
function acceptedForecast(command: Command, percent: unknown, minutes: unknown, s: ScrubberState, a: AtmosphereState): Record<string, unknown> | null {
    const at = atmosphereOf(a);
    if (at.emission === null) return null;
    const g = guardParameters();
    const plan = command === "stop" && typeof minutes === "number" ? stopPlan(minutes, a.restart.latencyMinutes, s.speedPercent) : command === "set_speed" && typeof percent === "number" ? [{ minutes: 1, targetRate: rateAt(percent) }] : null;
    if (!plan) return null;
    const f = forecastPeak(at.cabin, at.emission, plan, g.forecastHorizonMinutes);
    return { peakPpm: Math.round(f.peakPpm), peakPpCo2Mmhg: Number(fmt(ppCo2Mmhg(f.peakPpm, a.pressureKpa))), atMinute: f.atMinute, ceilingPpm: Math.round(stopCeilingPpm(at)), emissionEstimatePpmPerMinute: Number(at.emission.toFixed(2)), restartLatencyMinutes: command === "stop" ? a.restart.latencyMinutes : null, horizonMinutes: g.forecastHorizonMinutes };
}

/** At the limit, at once (a reading the world reports): full speed, a stop ended. */
function atmosphereTickForce(s: ScrubberState): void {
    const a = s.atmosphere;
    if (!a) return;
    if (a.stop || !s.power) restart(s, a, 100, "CO2 at the limit");
    else {
        s.speedPercent = 100;
        s.currentAmps = ampsOf(s);
        act(a, "CO2 at the limit: full speed forced");
    }
}
