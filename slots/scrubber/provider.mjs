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
import { publishStub } from "../lib/stub-provider.mjs";

const MIN_FLOW_FLOOR = 40; // compiled into the firmware: the protection cannot go below this
const CO2_STATES = ["NOMINAL", "ELEVATED", "CRITICAL"];

const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });

export function scrubberSlot(wsBase, log) {
    return publishStub({
        slot: "scrubber",
        description: "The CO2 scrubber board (stub): motor state, speed, power, with the firmware's refusals",
        wsBase,
        log,
        state: { power: true, speedPercent: 33, currentAmps: 0.15, co2Ppm: 1200, co2State: "NOMINAL", healthResidual: 0.02, profile: "adaptive", minFlowPercent: MIN_FLOW_FLOOR },
        tools: [
            {
                name: "motor.state",
                description: "Motor and cabin state: power, speed in percent, current in amperes, CO2 in ppm and its state, health residual.",
                inputSchema: obj({}),
                handle: (_args, s) => ({ ...s }),
            },
            {
                name: "motor.set_speed",
                description: "Set the speed command, in percent of full speed. Refused outside [0, 100], and below the minimum flow while CO2 is not NOMINAL.",
                inputSchema: obj({ percent: { type: "number", minimum: 0, maximum: 100 } }, ["percent"]),
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
                description: "Power the scrubber on or off. Off is refused while CO2 is not NOMINAL (MIN-FLOW).",
                inputSchema: obj({ on: { type: "boolean" } }, ["on"]),
                handle: ({ on }, s) => {
                    if (on === false && s.co2State !== "NOMINAL") throw new Error(`MIN-FLOW: CO2 is ${s.co2State}, the scrubber cannot be powered off`);
                    s.power = on === true;
                    if (!s.power) s.speedPercent = 0;
                    return { power: s.power, speedPercent: s.speedPercent };
                },
            },
            {
                name: "scrubber.set_min_flow",
                description: "Set the minimum flow the MIN-FLOW rule enforces, in percent. Operator only (policy). The device refuses any value below its compiled floor: the protection can be raised, never weakened.",
                inputSchema: obj({ percent: { type: "number", minimum: 0, maximum: 100 } }, ["percent"]),
                handle: ({ percent }, s) => {
                    if (typeof percent !== "number" || percent < MIN_FLOW_FLOOR) throw new Error(`MIN-FLOW floor: the protection cannot be set below ${MIN_FLOW_FLOOR} % (asked ${percent}); it is compiled into the firmware`);
                    if (percent > 100) throw new Error(`minimum flow ${percent} is outside [${MIN_FLOW_FLOOR}, 100]: refused`);
                    s.minFlowPercent = percent;
                    return { minFlowPercent: s.minFlowPercent, floor: MIN_FLOW_FLOOR };
                },
            },
            {
                name: "scrubber.set_profile",
                description: "Select the operating profile.",
                inputSchema: obj({ profile: { type: "string", enum: ["adaptive", "fixed"] } }, ["profile"]),
                handle: ({ profile }, s) => {
                    s.profile = profile;
                    return { profile };
                },
            },
            {
                name: "debug.set_co2",
                description: "STUB ONLY: set the cabin CO2 state, since nothing simulates the cabin here. When CRITICAL, MIN-FLOW forces 100 %.",
                inputSchema: obj({ state: { type: "string", enum: CO2_STATES }, ppm: { type: "number" } }, ["state"]),
                handle: ({ state, ppm }, s) => {
                    s.co2State = state;
                    s.co2Ppm = typeof ppm === "number" ? ppm : { NOMINAL: 1200, ELEVATED: 2600, CRITICAL: 5000 }[state];
                    if (state === "CRITICAL") {
                        s.power = true;
                        s.speedPercent = 100;
                    }
                    return { co2State: s.co2State, co2Ppm: s.co2Ppm, speedPercent: s.speedPercent, forced: state === "CRITICAL" };
                },
            },
        ],
        resources: [{ uri: "scrubber://motor/state", name: "Motor state", description: "The same state as motor.state", read: (s) => ({ ...s }) }],
    });
}
