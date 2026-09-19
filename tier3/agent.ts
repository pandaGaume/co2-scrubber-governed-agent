/**
 * The Tier 3 agent: a `@spiky-panda/harness` runtime whose capabilities are
 * the broker's tools, whose reasoner is a provider (a language model behind
 * an API, or the scripted one), and whose guard profile says what the
 * harness itself refuses to propose.
 *
 *   createAgent({ broker, provider, guardMode }) -> { runtime, catalogue, console, calls, decide }
 *   agent.decide(intention)                     -> one DecisionTrace (one action)
 *
 * The three levels of the note on Chernobyl: the intention is the agent's
 * goal; the guard profile and the system prompt are the envelope it is told
 * about; the broker's policy and the device's firmware are the invariants it
 * cannot reach, and they show up here only as refused results.
 */
import { AdaptivePolicyRuntime, AllowAllSafetyGuard, PolicyGraph, type CapabilityRegistryOptions, type DecisionContext, type DecisionTrace, type HarnessDriver, type Intention, type PolicyDecision, type SafetyDecision, type SafetyGuard, type StageEvent } from "@spiky-panda/harness";
import type { Broker } from "./lib/broker.js";
import { buildCapabilities, type CapabilityCall, type CatalogueEntry, type CrewConsoleEntry, type GuardMode } from "./lib/capabilities.js";
import { createObserver } from "./lib/observer.js";
import { createEvaluator } from "./lib/evaluator.js";
import { createTier3Driver } from "./lib/flow.js";
import type { Provider } from "./providers/provider.js";

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

export interface Agent {
    runtime: AdaptivePolicyRuntime;
    policy: PolicyGraph;
    catalogue: CatalogueEntry[];
    console: CrewConsoleEntry[];
    calls: CapabilityCall[];
    guardMode: GuardMode;
    provider: Provider;
    /** One decision: observe, decide (learned or reasoned), guard, execute, observe, evaluate, record. */
    decide(intention: Intention, signal?: AbortSignal): Promise<DecisionTrace>;
}

export async function createAgent({ broker, provider, guardMode = "measured", approve, timeoutMs = 60000, onStage, onCall, driver }: AgentOptions): Promise<Agent> {
    const crewConsole: CrewConsoleEntry[] = [];
    const calls: CapabilityCall[] = [];
    const lastResult: { current: CapabilityCall | null } = { current: null };
    const { registry, catalogue } = await buildCapabilities(broker, {
        guardMode,
        approve,
        console: crewConsole,
        onCall: (call) => {
            lastResult.current = call;
            calls.push(call);
            onCall?.(call);
        },
    });
    const policy = new PolicyGraph();
    const runtime = new AdaptivePolicyRuntime({
        driver: driver ?? createTier3Driver(),
        policy,
        fallback: provider,
        capabilities: registry,
        observer: createObserver(broker, lastResult),
        evaluator: createEvaluator(),
        safetyGuard: guardMode === "protected" ? protectedGuard() : new AllowAllSafetyGuard(),
        timeoutMs,
        onStage,
    });
    return {
        runtime,
        policy,
        catalogue,
        console: crewConsole,
        calls,
        guardMode,
        provider,
        decide: (intention, signal) => runtime.step(intention, signal),
    };
}
