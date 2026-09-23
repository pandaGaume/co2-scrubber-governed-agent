/**
 * The reasoner as the agent reaches it: the `reasoner` slot of the broker.
 * `resolve` sends what the harness hands its fallback to `reasoner.decide`
 * and maps the answer back to one decision; the exchange the slot returns
 * (what the model proposed, latency, tokens, the raw request and response)
 * is kept for the trace, exactly as the in-process adapters keep it.
 *
 * The same class serves the Node runner and the studio page: both only
 * need a `Broker`. The family and model come from `reasoner.describe`, so
 * the agent can present itself to the other slots under the model's family
 * before its first decision.
 */
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Broker } from "../lib/broker.js";
import type { Provider, ProviderExchange } from "../lib/provider.js";

export interface ReasonerDescription {
    model: string;
    family: string;
    wire: string;
    ready: boolean;
    reason: string | null;
    profile?: { file: string; sha256: string };
    promptSha256?: string | null;
}

interface DecideAnswer {
    decision: PolicyDecision;
    proposedCapabilityId: string;
    proposedInput: JsonValue;
    model: string;
    family: string;
    latencyMs: number;
    tokens: ProviderExchange["tokens"];
    exchange: { request: unknown; response: unknown };
}

export class ReasonerProvider implements Provider {
    readonly exchanges: ProviderExchange[] = [];
    calls = 0;
    private conversationId = "idle";

    private constructor(
        private broker: Broker,
        public readonly model: string,
        public readonly family: string,
        public readonly description: ReasonerDescription,
    ) {}

    /** Asks the slot which model answers; throws when the slot is absent, reports `ready: false` when it has no key. */
    static async connect(broker: Broker): Promise<ReasonerProvider> {
        const r = await broker.call("reasoner", "describe", {});
        if (!r.ok) throw new Error(`the reasoner slot did not answer describe: ${r.error}`);
        const d = r.output as ReasonerDescription;
        return new ReasonerProvider(broker, d.model, d.family, d);
    }

    /** The agent's own broker (its identity, its token): the decide calls go through it, so they sit in the trace as the agent's. */
    useBroker(broker: Broker): void {
        this.broker = broker;
    }

    /**
     * The prompt file the slot's model reads instead of the agent's, for a
     * builder of the factory (`harness/topics/<topic>/prompt.md`). A path,
     * never a text: the slot reads it from the repository and only from the
     * topics' folders, so what the model was told is a file with a sha256.
     */
    usePrompt(file: string | null): void {
        this.prompt = file;
    }
    private prompt: string | null = null;

    get name(): string {
        return `reasoner:${this.family}`;
    }

    begin(intentionId: string): void {
        // One conversation per event; a new id per begin so a replayed event starts fresh on the slot.
        this.conversationId = `${intentionId}#${Date.now().toString(36)}`;
    }

    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        input.signal?.throwIfAborted();
        const r = await this.broker.call("reasoner", "decide", {
            conversationId: this.conversationId,
            decisionId: input.decisionId,
            intention: input.intention,
            state: input.state,
            allowedCapabilities: input.allowedCapabilities,
            candidates: input.candidates,
            recentFailures: input.recentFailures,
            ...(this.prompt ? { prompt: this.prompt } : {}),
        });
        if (!r.ok) throw new Error(r.error ?? "reasoner.decide failed");
        const a = r.output as DecideAnswer;
        this.exchanges.push({
            decisionId: input.decisionId,
            model: a.model,
            request: a.exchange?.request ?? null,
            response: a.exchange?.response ?? null,
            decision: a.decision,
            proposedCapabilityId: a.proposedCapabilityId,
            proposedInput: a.proposedInput,
            latencyMs: a.latencyMs,
            tokens: a.tokens ?? null,
        });
        return a.decision;
    }
}
