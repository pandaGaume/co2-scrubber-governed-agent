/**
 * What a reasoner is to the Tier 3 client: the harness's `PolicyFallback`
 * (one decision per call from the state, the intention and the allowed
 * capabilities), plus what the trace and the scorecard need to know about
 * it: its name, the model behind it, the raw exchanges with their latency
 * and token counts, and the number of calls (the reasoner is asked only
 * when no learned decision applies).
 */
import type { JsonValue, PolicyDecision, PolicyFallback } from "@spiky-panda/harness";

export interface ProviderExchange {
    decisionId: string | undefined;
    model: string;
    /** What was sent: the messages or the scripted input; raw, for the video's one look. */
    request: unknown;
    /** What came back: the raw completion, and the decision made of it. */
    response: unknown;
    decision: PolicyDecision;
    /** What the model named before any substitution (a tool the profile forbids becomes a crew report): the scorecard counts attempts here. */
    proposedCapabilityId: string;
    proposedInput: JsonValue;
    latencyMs: number;
    tokens: { prompt: number; completion: number; total: number } | null;
}

export interface Provider extends PolicyFallback {
    /** e.g. "scripted:prudent", "openai:nemotron", "anthropic:claude" */
    readonly name: string;
    /** The model identifier the exchanges name. */
    readonly model: string;
    /** How the slots' grammars see this agent (`clientInfo.name`), e.g. "nemotron", "claude". */
    readonly family: string;
    readonly exchanges: ProviderExchange[];
    readonly calls: number;
    /** Called by the runner when a new intention starts (a new conversation for a model, a new cursor for a script). */
    begin?(intentionId: string): void;
}

/**
 * A profile file (`profiles/*.json`, see `profiles/README.md`): the vendor
 * is a profile, not a branch. `tier3` binds the language model: the wire
 * (`openai-compatible` or `anthropic-messages`), the endpoint, the model,
 * the environment variable of the key (never the key), and optionally the
 * family the slots' grammars should see and the locale.
 */
export interface ProviderProfile {
    name?: string;
    tier3?: {
        wire?: "openai-compatible" | "anthropic-messages";
        baseUrl?: string;
        model?: string;
        apiKey?: { env?: string };
        capabilities?: string[];
        /** The family as the slots' grammars key it (nemotron, gpt, claude, gemini); inferred from the model name when absent. */
        family?: string;
        locale?: string;
        /** The bearer token of the tier3 subject, once the broker's authorization is on. */
        subjectToken?: string;
    };
    gateway?: unknown;
    factory?: unknown;
    [key: string]: unknown;
}
