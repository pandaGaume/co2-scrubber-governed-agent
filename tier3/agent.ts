/**
 * The Tier 3 agent: the demo's loop (`harness/core/agent.ts`) with the
 * habitat's services: the cabin's capability profile (`lib/capabilities.ts`),
 * its observer (the board's state), its evaluator (did the cabin improve)
 * and its guard profile, which says what the harness itself refuses to
 * propose (docs/harness-stages.fr.md, the "station" column).
 *
 *   createAgent({ broker, provider, guardMode }) -> { runtime, catalogue, console, calls, decide }
 *   agent.decide(intention)                     -> one DecisionTrace (one action)
 */
import type { CapabilityRegistryOptions, DecisionContext, HarnessDriver, PolicyDecision, SafetyDecision, SafetyGuard, StageEvent } from "@spiky-panda/harness";
import type { Broker } from "../harness/lib/broker.js";
import { createAgent as createLoop, type Agent as LoopAgent } from "../harness/core/agent.js";
import { buildCapabilities, type CapabilityCall, type CrewConsoleEntry, type GuardMode } from "./lib/capabilities.js";
import { createObserver } from "./lib/observer.js";
import { createEvaluator } from "./lib/evaluator.js";
import type { Provider } from "../harness/lib/provider.js";

/** Level 2, enforced locally: the envelope the agent is told about, for the protected profile. */
export function protectedGuard(): SafetyGuard {
    return {
        async validate(decision: PolicyDecision, context: DecisionContext): Promise<SafetyDecision> {
            const id = decision.invocation.capabilityId;
            const input = (decision.invocation.input ?? {}) as { percent?: unknown };
            const f = context.state.features;
            if (id === "scrubber.motor.set_speed") {
                const percent = Number(input.percent);
                const minFlow = Number(f.minFlowPercent);
                if (!(percent >= 0 && percent <= 100)) return { allowed: false, reason: `speed ${percent} is outside [0, 100]` };
                if (f.co2State === "CRITICAL" && percent < 100) return { allowed: false, reason: "cabin is CRITICAL: full speed is forced, no reduction" };
                if (f.co2State !== "NOMINAL" && minFlow >= 0 && percent < minFlow) return { allowed: false, reason: `cabin is ${String(f.co2State)}: no speed below the minimum flow (${minFlow} %)` };
            }
            return { allowed: true };
        },
    };
}

export interface AgentOptions {
    broker: Broker;
    provider: Provider;
    guardMode?: GuardMode;
    approve?: CapabilityRegistryOptions["approve"];
    timeoutMs?: number;
    onStage?: (event: StageEvent) => void;
    onCall?: (call: CapabilityCall) => void;
    /** The graph to execute; by default the V1 loop built in code. The studio passes the graph it drew, so the run lights its own nodes. */
    driver?: HarnessDriver;
}

export interface Agent extends LoopAgent {
    console: CrewConsoleEntry[];
    calls: CapabilityCall[];
    guardMode: GuardMode;
}

export async function createAgent({ broker, provider, guardMode = "measured", approve, timeoutMs = 60000, onStage, onCall, driver }: AgentOptions): Promise<Agent> {
    const crewConsole: CrewConsoleEntry[] = [];
    const calls: CapabilityCall[] = [];
    const lastResult: { current: CapabilityCall | null } = { current: null };
    const capabilities = await buildCapabilities(broker, {
        guardMode,
        approve,
        console: crewConsole,
        onCall: (call) => {
            lastResult.current = call;
            calls.push(call);
            onCall?.(call);
        },
    });
    const loop = createLoop({
        broker,
        provider,
        capabilities,
        observer: createObserver(broker, lastResult),
        evaluator: createEvaluator(),
        guard: guardMode === "protected" ? protectedGuard() : undefined,
        timeoutMs,
        onStage,
        driver,
    });
    return { ...loop, console: crewConsole, calls, guardMode };
}
