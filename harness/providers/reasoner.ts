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
import { interpret, readingNote, type Extractor, type MeaningReader, type Reading } from "../core/interpreter.js";

export interface ReasonerDescription {
    model: string;
    family: string;
    wire: string;
    /** The host of the endpoint the model is reached at, and the service when it is a known one (Nebius Token Factory). */
    endpoint?: string | null;
    servedBy?: string | null;
    ready: boolean;
    reason: string | null;
    profile?: { file: string; sha256: string };
    /** How the model is run: its output limit, temperature, effort, timeout (null: the wire's default). */
    settings?: Record<string, string | number | null>;
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
    context?: ProviderExchange["context"] | null;
    batch?: { index: number; of: number };
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

    /**
     * Asks the slot which model answers; throws when the slot is absent, reports `ready: false` when it has no key. `prompt`: the
     * role's prompt file this provider's decisions will name (`usePrompt`), so the model, family and settings are that role's
     * (specs/reasoner/routing.json); the agent's without one.
     */
    static async connect(broker: Broker, prompt?: string): Promise<ReasonerProvider> {
        const r = await broker.call("reasoner", "describe", prompt ? { prompt } : {});
        if (!r.ok) throw new Error(`the reasoner slot did not answer describe: ${r.error}`);
        const d = r.output as ReasonerDescription;
        return new ReasonerProvider(broker, d.model, d.family, d);
    }

    /** How the slot runs its model, as its describe said: what a factory's manifest keeps. */
    get settings(): Record<string, string | number | null> | undefined {
        return this.description.settings;
    }
    get profile(): { file: string; sha256: string } | undefined {
        return this.description.profile;
    }

    /** The agent's own broker (its identity, its token): the decide calls go through it, so they sit in the trace as the agent's. */
    useBroker(broker: Broker): void {
        this.broker = broker;
    }

    /**
     * The prompt file the slot's model reads instead of the agent's, for a
     * builder of the factory (`specs/<topic>/prompt.md`). A path,
     * never a text: the slot reads it from the repository and only from the
     * topics' folders, so what the model was told is a file with a sha256.
     */
    usePrompt(file: string | null): void {
        this.prompt = file;
    }
    private prompt: string | null = null;

    /** The context mode of the conversations this provider opens on the slot: `state` for a harness that rebuilds the reasoning state at every step. */
    useContext(mode: "conversation" | "state"): void {
        this._contextMode = mode;
    }
    private _contextMode: "conversation" | "state" = "conversation";
    get contextMode(): "conversation" | "state" {
        return this._contextMode;
    }

    get name(): string {
        return `reasoner:${this.family}`;
    }

    begin(intentionId: string): void {
        // One conversation per event; a new id per begin so a replayed event starts fresh on the slot.
        this.conversationId = `${intentionId}#${Date.now().toString(36)}`;
    }

    /** How the last call was read when it did not fit its schema (interpreter.ts): told to the model at the next step, then forgotten. */
    private lastReading: Reading | null = null;
    /** The readings of this provider's calls, for the trace and the manifest. */
    readonly readings: Reading[] = [];

    /** A model's extraction, through the reasoner slot's `interpret` (the use `interpret`, the least expensive model). */
    private readonly extract: Extractor = async (request) => {
        const r = await this.broker.call("reasoner", "interpret", request as unknown as Record<string, JsonValue>);
        if (!r.ok) return { value: null };
        const o = r.output as { value?: JsonValue | null; model?: string | null };
        return { value: o.value ?? null, model: o.model ?? null };
    };

    /** What a call meant, read by a capable model through the reasoner slot's `interpret` (mode meaning, the use `meaning`). */
    readonly readMeaning: MeaningReader = async (request) => {
        const r = await this.broker.call("reasoner", "interpret", { ...request, mode: "meaning" } as unknown as Record<string, JsonValue>);
        if (!r.ok) return { value: null };
        const o = r.output as { value?: JsonValue | null; model?: string | null };
        return { value: o.value ?? null, model: o.model ?? null };
    };

    /** A decision given at the next step without asking the model (what a refused call meant). */
    private queued: { decision: PolicyDecision; reading: Reading } | null = null;
    queue(decision: PolicyDecision, reading: Reading): void {
        this.queued = { decision, reading };
    }

    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        input.signal?.throwIfAborted();
        // What a refused call meant, read by the harness: run as the model's next decision, through the whole loop; the model is told after.
        const queued = this.queued;
        this.queued = null;
        if (queued && input.allowedCapabilities.some((c) => c.id === queued.decision.invocation.capabilityId)) {
            this.lastReading = queued.reading;
            this.readings.push(queued.reading);
            this.exchanges.push({ decisionId: input.decisionId, model: queued.reading.model ?? this.model, request: null, response: null, decision: queued.decision, proposedCapabilityId: queued.decision.invocation.capabilityId, proposedInput: queued.decision.invocation.input, latencyMs: 0, tokens: null, reading: queued.reading });
            return queued.decision;
        }
        // How the last call was read goes with what it returned, so the model learns the form from the result, not from a refusal.
        const note = this.lastReading ? readingNote(this.lastReading) : null;
        this.lastReading = null;
        const features = (input.state?.features ?? {}) as Record<string, JsonValue>;
        const state = note ? { ...input.state, features: { ...features, readAs: note, lastOutput: `${note}${String(features.lastOutput ?? "")}` } } : input.state;
        const r = await this.broker.call("reasoner", "decide", {
            conversationId: this.conversationId,
            decisionId: input.decisionId,
            intention: input.intention,
            state,
            allowedCapabilities: input.allowedCapabilities,
            candidates: input.candidates,
            recentFailures: input.recentFailures,
            ...(this.prompt ? { prompt: this.prompt } : {}),
            contextMode: this._contextMode,
        });
        if (!r.ok) throw new Error(r.error ?? "reasoner.decide failed");
        const a = r.output as DecideAnswer;
        // Read before it is judged (interpreter.ts): a call whose form does not fit its schema is read toward it; the guard judges what was read.
        const capability = input.allowedCapabilities.find((c) => c.id === a.decision?.invocation?.capabilityId);
        let reading: Reading | null = null;
        if (capability && a.decision?.invocation) {
            const read = await interpret(capability as { id: string; description?: string; inputSchema?: JsonValue }, a.decision.invocation.input, this.extract);
            if (read.reading) {
                reading = read.reading;
                a.decision = { ...a.decision, invocation: { ...a.decision.invocation, input: read.input } };
                this.lastReading = reading;
                this.readings.push(reading);
            }
        }
        this.exchanges.push({
            decisionId: input.decisionId,
            model: a.model,
            request: a.exchange?.request ?? null,
            response: a.exchange?.response ?? null,
            ...(a.context ? { context: a.context } : {}),
            decision: a.decision,
            proposedCapabilityId: a.proposedCapabilityId,
            proposedInput: a.proposedInput,
            latencyMs: a.latencyMs,
            tokens: a.tokens ?? null,
            ...(reading ? { reading } : {}),
            ...(a.batch ? { batch: a.batch } : {}),
        });
        return a.decision;
    }
}
