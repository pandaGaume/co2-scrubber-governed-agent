/**
 * An agent of the demo: the twelve-stage loop of `@spiky-panda/harness`
 * (`harness/lib/flow.ts`), stepped by `AdaptivePolicyRuntime`, with the six
 * services that make it the habitat's agent or the factory's constructor
 * (docs/harness-stages.fr.md, section 1): the capabilities (a broker's
 * tools, see `capabilities.ts`), the reasoner (a `Provider`: a language
 * model behind an API, or a scripted one), the observer, the evaluator, the
 * guard, and the memory (a `PolicyGraph`, new or loaded from recipes).
 *
 *   createAgent({ broker, provider, capabilities, observer, evaluator, guard }) -> { runtime, policy, catalogue, decide }
 *   agent.decide(intention)                                                     -> one DecisionTrace (one action)
 *
 * The three levels of the note on Chernobyl: the intention is the agent's
 * goal; the guard and the prompt are the envelope it is told about; the
 * broker's policy and the device's firmware are the invariants it cannot
 * reach, and they show up here only as refused results.
 */
import { AdaptivePolicyRuntime, AllowAllSafetyGuard, PolicyGraph, type CapabilityRegistry, type DecisionTrace, type HarnessDriver, type Intention, type OutcomeEvaluator, type SafetyGuard, type StageEvent, type StateObserver } from "@spiky-panda/harness";
import type { Broker } from "../lib/broker.js";
import type { Provider } from "../lib/provider.js";
import { createHarnessDriver } from "../lib/flow.js";
import type { CatalogueEntry } from "./capabilities.js";

export interface AgentOptions {
    broker: Broker;
    provider: Provider;
    capabilities: { registry: CapabilityRegistry; catalogue: CatalogueEntry[] };
    observer: StateObserver;
    evaluator: OutcomeEvaluator;
    /** What the loop refuses itself before acting; everything allowed when absent. */
    guard?: SafetyGuard;
    /** The memory: new when absent (the station), loaded from recipes at the factory. */
    policy?: PolicyGraph;
    timeoutMs?: number;
    onStage?: (event: StageEvent) => void;
    /** The graph to execute; by default the V1 loop built in code. The studio passes the graph it drew, so the run lights its own nodes. */
    driver?: HarnessDriver;
}

export interface Agent {
    runtime: AdaptivePolicyRuntime;
    policy: PolicyGraph;
    catalogue: CatalogueEntry[];
    provider: Provider;
    broker: Broker;
    /** One decision: observe, decide (learned or reasoned), guard, execute, observe, evaluate, record. */
    decide(intention: Intention, signal?: AbortSignal): Promise<DecisionTrace>;
}

export function createAgent({ broker, provider, capabilities, observer, evaluator, guard, policy = new PolicyGraph(), timeoutMs = 60000, onStage, driver }: AgentOptions): Agent {
    const runtime = new AdaptivePolicyRuntime({
        driver: driver ?? createHarnessDriver(),
        policy,
        fallback: provider,
        capabilities: capabilities.registry,
        observer,
        evaluator,
        safetyGuard: guard ?? new AllowAllSafetyGuard(),
        timeoutMs,
        onStage,
    });
    return { runtime, policy, catalogue: capabilities.catalogue, provider, broker, decide: (intention, signal) => runtime.step(intention, signal) };
}
