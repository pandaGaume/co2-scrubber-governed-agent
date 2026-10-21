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
import { PolicyGraph, type CapabilityRegistryOptions, type DecisionContext, type HarnessDriver, type PolicyDecision, type SafetyDecision, type SafetyGuard, type StageEvent } from "@spiky-panda/harness";
import type { Broker } from "../harness/lib/broker.js";
import { createAgent as createLoop, type Agent as LoopAgent } from "../harness/core/agent.js";
import { brokerReviewer, buildCapabilities, type CapabilityCall, type CrewConsoleEntry, type GuardMode, type BuildCapabilitiesOptions } from "./lib/capabilities.js";
import { createObserver } from "./lib/observer.js";
import { createEvaluator } from "./lib/evaluator.js";
import type { Provider } from "../harness/lib/provider.js";
import { restrictReplays } from "../harness/core/replay.js";

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
    delegationContext?: BuildCapabilitiesOptions["delegationContext"];
    /** Keep experience for inspection, but require a model proposal for each supervisory decision. */
    reasonEveryDecision?: boolean;
    local?: BuildCapabilitiesOptions["local"];
    questionResume?: BuildCapabilitiesOptions["questionResume"];
    stationOwnsConfirmations?: boolean;
    observation?: () => Record<string, import("@spiky-panda/harness").JsonValue> | Promise<Record<string, import("@spiky-panda/harness").JsonValue>>;
    broker: Broker;
    provider: Provider;
    guardMode?: GuardMode;
    approve?: CapabilityRegistryOptions["approve"];
    timeoutMs?: number;
    onStage?: (event: StageEvent) => void;
    onCall?: (call: CapabilityCall) => void;
    /** The graph to execute; by default the V1 loop built in code. The studio passes the graph it drew, so the run lights its own nodes. */
    driver?: HarnessDriver;
    /** Tools the profile leaves out that this run gives back (a scenario's `allow`). */
    allow?: string[];
}

export interface Agent extends LoopAgent {
    console: CrewConsoleEntry[];
    calls: CapabilityCall[];
    guardMode: GuardMode;
}

export async function createAgent({ broker, provider, guardMode = "measured", approve, timeoutMs = 60000, onStage, onCall, driver, allow, local, questionResume, stationOwnsConfirmations = false, delegationContext, observation, reasonEveryDecision = false }: AgentOptions): Promise<Agent> {
    const crewConsole: CrewConsoleEntry[] = [];
    const calls: CapabilityCall[] = [];
    const lastResult: { current: CapabilityCall | null } = { current: null };
    const capabilities = await buildCapabilities(broker, {
        guardMode,
        approve,
        console: crewConsole,
        // A report is read against the calls of its event before it reaches the crew (the reasoner slot's review_report).
        calls,
        review: brokerReviewer(broker),
        allow,
        local,
        questionResume,
        stationOwnsConfirmations,
        delegationContext,
        onCall: (call) => {
            lastResult.current = call;
            calls.push(call);
            onCall?.(call);
        },
    });
    const observer = createObserver(broker, lastResult);
    const policy = new PolicyGraph();
    if (reasonEveryDecision) restrictReplays(policy, [/.*/], new Set());
    const loop = createLoop({
        broker,
        provider,
        capabilities,
        policy,
        observer: observation ? { observe: async () => { const state = await observer.observe(); return { ...state, features: { ...state.features, ...await observation() } }; } } : observer,
        evaluator: createEvaluator(),
        guard: guardMode === "protected" ? protectedGuard() : undefined,
        // The outer decision must not expire while the configured model request is still allowed to answer.
        timeoutMs: Math.max(timeoutMs, Number(provider.settings?.timeoutMs ?? 0) + 30000),
        onStage,
        driver,
    });
    return { ...loop, console: crewConsole, calls, guardMode };
}
