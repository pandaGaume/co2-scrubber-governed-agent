/**
 * slot `scrubber`, stub. Tier 1 in the architecture: the ESP32-S3 board. Here,
 * an in-memory state that the tools change, with the two refusals the real
 * firmware has, so the policy moment of the demo can be rehearsed before the
 * board publishes itself through libmcpb:
 *   - the speed envelope: a value outside [0, 100] is refused, not clamped;
 *   - MIN-FLOW: while the cabin CO2 is ELEVATED, no speed below the minimum
 *     flow and no power off; while it is CRITICAL, full speed is forced and
 *     no reduction is accepted, whoever asks;
 *   - the protection itself cannot be weakened: the minimum flow can be raised
 *     by the operator, never set below a floor compiled into the firmware. The
 *     broker's policy keeps the tool away from the tier3 role; the floor holds
 *     even when the policy is granted.
 * The CO2 state is a stub value the dashboard can set (`debug.set_co2`), since
 * nothing simulates the cabin here.
 */
import { objectSchema as obj, publishSlot, type PublishedSlot } from "../lib/slot-server.js";
import type { Co2State } from "../../lib/factory.js";

/** Compiled into the firmware: the protection cannot go below this. */
export const MIN_FLOW_FLOOR = 40;
const CO2_STATES: Co2State[] = ["NOMINAL", "ELEVATED", "CRITICAL"];
const STUB_PPM: Record<Co2State, number> = { NOMINAL: 1200, ELEVATED: 2600, CRITICAL: 5000 };

export interface ScrubberState {
    power: boolean;
    speedPercent: number;
    currentAmps: number;
    co2Ppm: number;
    co2State: Co2State;
    healthResidual: number;
    profile: "adaptive" | "fixed";
    minFlowPercent: number;
}

export function scrubberSlot(wsBase: string, log: (line: string) => void): PublishedSlot<ScrubberState> {
    return publishSlot<ScrubberState>({
        slot: "scrubber",
        description: "The CO2 scrubber board (stub): motor state, speed, power, with the firmware's refusals",
        instructions: {
            en: "The scrubber board. Read motor.state before acting. Speeds are percent of full speed inside [0, 100]; the firmware refuses, never clamps. While CO2 is ELEVATED no speed below the minimum flow and no power off; while CRITICAL full speed is forced.",
            fr: "La carte du scrubber. Lire motor.state avant d'agir. Les vitesses sont en pour cent de la pleine vitesse, dans [0, 100] ; le firmware refuse, il n'écrête jamais. Tant que le CO2 est ELEVATED, aucune vitesse sous le débit minimal et pas d'arrêt ; tant qu'il est CRITICAL, la pleine vitesse est imposée.",
        },
        wsBase,
        log,
        state: { power: true, speedPercent: 33, currentAmps: 0.15, co2Ppm: 1200, co2State: "NOMINAL", healthResidual: 0.02, profile: "adaptive", minFlowPercent: MIN_FLOW_FLOOR },
        tools: [
            {
                name: "motor.state",
                title: "Motor and cabin state",
                description: "Motor and cabin state: power, speed in percent, current in amperes, CO2 in ppm and its state, health residual.",
                inputSchema: obj({}),
                handle: (_args, s) => ({ ...s }),
            },
            {
                name: "motor.set_speed",
                title: "Set the scrubber speed",
                description: "Set the speed command, in percent of full speed. Refused outside [0, 100], and below the minimum flow while CO2 is not NOMINAL.",
                inputSchema: obj({ percent: { type: "number", minimum: 0, maximum: 100, description: "speed command, percent of full speed" } }, ["percent"]),
                handle: ({ percent }, s) => {
                    if (typeof percent !== "number" || percent < 0 || percent > 100) throw new Error(`speed ${percent} is outside the envelope [0, 100]: refused, not clamped`);
                    // MIN-FLOW, the firmware's own rule: ELEVATED keeps the flow above the minimum;
                    // CRITICAL forces full speed and refuses any reduction, whoever asks.
                    if (s.co2State === "CRITICAL" && percent < 100) throw new Error("MIN-FLOW: CO2 is CRITICAL, full speed is forced, no reduction is accepted");
                    if (s.co2State === "ELEVATED" && percent < s.minFlowPercent) throw new Error(`MIN-FLOW: CO2 is ELEVATED, no speed below ${s.minFlowPercent} %`);
                    s.speedPercent = percent;
                    s.currentAmps = Number((0.09 + 0.16 * (percent / 100)).toFixed(3));
                    return { speedPercent: s.speedPercent, currentAmps: s.currentAmps };
                },
            },
            {
                name: "scrubber.power",
                title: "Power the scrubber",
                description: "Power the scrubber on or off. Off is refused while CO2 is not NOMINAL (MIN-FLOW).",
                inputSchema: obj({ on: { type: "boolean", description: "true to power on, false to power off" } }, ["on"]),
                handle: ({ on }, s) => {
                    if (on === false && s.co2State !== "NOMINAL") throw new Error(`MIN-FLOW: CO2 is ${s.co2State}, the scrubber cannot be powered off`);
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
                    if (typeof percent !== "number" || percent < MIN_FLOW_FLOOR) throw new Error(`MIN-FLOW floor: the protection cannot be set below ${MIN_FLOW_FLOOR} % (asked ${percent}); it is compiled into the firmware`);
                    if (percent > 100) throw new Error(`minimum flow ${percent} is outside [${MIN_FLOW_FLOOR}, 100]: refused`);
                    s.minFlowPercent = percent;
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
                name: "debug.set_co2",
                title: "Set the stub cabin CO2",
                description: "STUB ONLY: set the cabin CO2 state, since nothing simulates the cabin here. When CRITICAL, MIN-FLOW forces 100 %.",
                inputSchema: obj({ state: { type: "string", enum: CO2_STATES, description: "NOMINAL, ELEVATED or CRITICAL" }, ppm: { type: "number", description: "concentration, ppm; a stub value per state when omitted" } }, ["state"]),
                handle: ({ state, ppm }, s) => {
                    if (!CO2_STATES.includes(state as Co2State)) throw new Error(`state "${state}" is not one of ${CO2_STATES.join(", ")}`);
                    s.co2State = state as Co2State;
                    s.co2Ppm = typeof ppm === "number" ? ppm : STUB_PPM[s.co2State];
                    if (s.co2State === "CRITICAL") {
                        s.power = true;
                        s.speedPercent = 100;
                    }
                    return { co2State: s.co2State, co2Ppm: s.co2Ppm, speedPercent: s.speedPercent, forced: s.co2State === "CRITICAL" };
                },
            },
        ],
        resources: [{ uri: "scrubber://motor/state", name: "Motor state", description: "The same state as motor.state", read: (s) => ({ ...s }) }],
    });
}
