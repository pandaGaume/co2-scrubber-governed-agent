/**
 * What the agent observes before and after each decision: the board's state
 * (`scrubber.motor.state`: CO2, cabin state, speed, current, power, the
 * minimum-flow protection) and the last capability result, so that a
 * decision can build on the answer of the previous one (the twin's numbers,
 * a refusal).
 *
 * `State.id` is the coarse situation (the cabin state), which is what the
 * harness's exact matcher keys learned decisions on; the numeric features
 * stay in `features`, where the harness compares them for freshness between
 * a proposal and its execution after an approval delay (so nothing here may
 * change on its own between two reads: no counter, no clock).
 */
import type { JsonValue, State, StateObserver } from "@spiky-panda/harness";
import type { Broker } from "./broker.js";
import type { CapabilityCall } from "./capabilities.js";

export interface CabinFeatures extends Record<string, JsonValue> {
    co2Ppm: number;
    co2State: string;
    power: boolean;
    speedPercent: number;
    currentAmps: number;
    minFlowPercent: number;
    boardReachable: boolean;
    lastCapability: string;
    lastOutcome: string;
    lastOutput: string;
}

export interface CabinState extends State {
    readonly features: CabinFeatures;
}

const num = (v: unknown, fallback = -1): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function createObserver(broker: Broker, lastResult: { current: CapabilityCall | null }): StateObserver {
    return {
        async observe(): Promise<CabinState> {
            const r = await broker.call("scrubber", "motor.state", {});
            const st = (r.ok && r.output && typeof r.output === "object" ? r.output : {}) as Record<string, unknown>;
            const co2State = String(st.co2State ?? "UNKNOWN");
            const last = lastResult.current;
            const features: CabinFeatures = {
                co2Ppm: num(st.co2Ppm),
                co2State,
                power: st.power === true,
                speedPercent: num(st.speedPercent),
                currentAmps: num(st.currentAmps),
                minFlowPercent: num(st.minFlowPercent),
                boardReachable: r.ok,
                lastCapability: last?.id ?? "",
                lastOutcome: last?.result.outcome ?? "",
                lastOutput: last ? JSON.stringify(last.result.output ?? last.result.error ?? null).slice(0, 2000) : "",
            };
            return { id: `cabin:${co2State}`, features };
        },
    };
}
