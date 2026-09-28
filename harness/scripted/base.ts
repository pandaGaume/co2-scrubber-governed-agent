/**
 * What every scripted builder shares (2026-09-28, the socle's fourth point):
 * a script plays a model's lines so a factory's whole loop runs without a
 * key, and each one had the same parts written again.
 *
 *   decide          one decision: the capability, its input, why
 *   valueOf         a call's answer, when it completed
 *   read(id)        what the task last read by a capability, replays
 *                   included: a step the recipes replayed is not asked of
 *                   the script, and the script reads its answer all the same
 *                   (a replayed presence, unseen, once left a procedure
 *                   without its monitoring)
 *   a failed call   ends the task with the tool's own reason: a script has no
 *                   other way (a model would try one, or say the same)
 *   resolve         counts the call, keeps the exchange for the manifest, as
 *                   a model's provider does
 *
 * Every script runs on the reasoning state, as the models do. A subclass
 * says its topic and writes `next`: the line to play, from the state it
 * observes (the phase, the last capability, the last refusal).
 */
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Provider, ProviderExchange } from "../lib/provider.js";
import type { CapabilityCall } from "../core/capabilities.js";
import type { TaskFile } from "../core/task.js";

/** What a script is given, as the runner builds it (`BuilderContext`). */
export interface ScriptContext {
    task: TaskFile["task"];
    /** The last call of the loop, as the runner records it (what a model reads in `lastAction`). */
    lastCall: () => CapabilityCall | null;
    /** What the task last read by a capability, replays included; the script's own last call only when absent. */
    read?: (capabilityId: string) => JsonValue | null;
}

/** One decision: the capability, its input, why. */
export const decide = (capabilityId: string, input: JsonValue, rationale: string): PolicyDecision => ({ action: { id: capabilityId, description: capabilityId }, invocation: { actionId: capabilityId, capabilityId, input }, rationale });

/** A call's answer, when it completed; empty otherwise. */
export const valueOf = (call: CapabilityCall | null): Record<string, JsonValue> => (call?.result.ok && call.result.output && typeof call.result.output === "object" ? (call.result.output as Record<string, JsonValue>) : {});

export abstract class ScriptedBuilderBase<O extends ScriptContext = ScriptContext> implements Provider {
    readonly name: string;
    readonly model: string;
    readonly family = "scripted";
    readonly exchanges: ProviderExchange[] = [];
    /** The script runs on the reasoning state, as the models do: the runner builds the topic's state at every step and replays nothing. */
    readonly contextMode = "state" as const;
    calls = 0;

    constructor(
        topic: string,
        protected readonly options: O,
    ) {
        this.name = `scripted:${topic}`;
        this.model = `scripted/${topic}`;
    }

    /** A new task: what the script kept is dropped (a subclass that keeps something resets it here). */
    begin(): void {}

    /** The last call of the loop. */
    protected get last(): CapabilityCall | null {
        return this.options.lastCall();
    }

    /** What the task last read by a capability, replays included; null when it did not, or the answer is not an object. */
    protected read(capabilityId: string): Record<string, JsonValue> | null {
        const last = this.last;
        const v = this.options.read?.(capabilityId) ?? (last?.id === capabilityId ? valueOf(last) : null);
        return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, JsonValue>) : null;
    }

    /** The line to play, from the state observed. */
    protected abstract next(state: PolicyFallbackInput["state"]): PolicyDecision;

    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        const last = this.last;
        // A call that failed: the script has no other way, it gives up with the tool's reason.
        const decision = last && !last.result.ok ? decide("task.fail", { reason: (last.result.error ?? last.result.outcome).replace(/^(device refused|error):\s*/i, "") }, `${last.id} failed: nothing else to try`) : this.next(input.state);
        this.exchanges.push({ decisionId: input.decisionId, model: this.model, request: { intention: input.intention, state: input.state, allowed: input.allowedCapabilities.map((c) => c.id) }, response: null, decision, proposedCapabilityId: decision.invocation.capabilityId, proposedInput: decision.invocation.input, latencyMs: 0, tokens: null });
        return decision;
    }
}
