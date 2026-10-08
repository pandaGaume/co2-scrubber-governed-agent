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
    /** Where the characters of the request went (the system prompt, the tools, the observation, the tool results, the history), and the context mode (2026-09-25). */
    context?: Record<string, number | string>;
    /** What was sent: the messages or the scripted input; raw, for the video's one look. */
    request: unknown;
    /** What came back: the raw completion, and the decision made of it. */
    response: unknown;
    decision: PolicyDecision;
    /** What the model named before any substitution (a tool the profile forbids becomes a crew report): the scorecard counts attempts here. */
    proposedCapabilityId: string;
    proposedInput: JsonValue;
    /** How the harness read the call when its form did not fit its schema (core/interpreter.ts): what the guard judged instead of proposedInput. */
    reading?: import("../core/interpreter.js").Reading;
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
    /** How the model is run (its output limit, temperature, effort, timeout), when a model is: a factory's manifest keeps it. */
    readonly settings?: Record<string, string | number | null>;
    /** The profile it is run from, with its sha256. */
    readonly profile?: { file: string; sha256: string };
}

/**
 * A profile file (`profiles/*.json`, see `profiles/README.md`): the vendor
 * is a profile, not a branch. `tier3` binds the language model: the wire
 * (`openai-compatible`, `openai-responses` or `anthropic-messages`), the endpoint, the model,
 * the environment variable of the key (never the key), and optionally the
 * family the slots' grammars should see and the locale.
 */
export interface ProviderProfile {
    name?: string;
    tier3?: {
        wire?: "openai-compatible" | "anthropic-messages" | "openai-responses";
        baseUrl?: string;
        model?: string;
        apiKey?: { env?: string };
        capabilities?: string[];
        /** The output limit per answer, in tokens; the provider's default when absent (4096 on the Anthropic wire, the server's own on an OpenAI-compatible one). */
        maxTokens?: number;
        /** How an OpenAI-compatible server names the output limit (2026-09-29: recent OpenAI models refuse max_tokens and take max_completion_tokens); max_tokens when absent. */
        maxTokensParam?: "max_tokens" | "max_completion_tokens";
        /** The least output a one-shot text (`compose`: Mother's welcome, a narration) is given, whatever the caller asks: a reasoning model thinks first. */
        composeMaxTokens?: number;
        /** JSON Schema keys the server's grammar does not implement, left out of the tool schemas the model is shown (Nebius Token Factory: uniqueItems). */
        schemaUnsupported?: string[];
        /**
         * `required`: every step asks for a call, in conversation mode too (the default asks `auto` there, a text answer becoming a
         * report). 2026-10-08, Nemotron on Token Factory: with `auto` its calls came as text, outside the server's tool parser and so
         * outside any grammar, and degenerated into the same list repeated until the output limit; `required` makes the server
         * decode the call against the tools' schemas.
         */
        toolChoice?: "required" | "auto";
        /**
         * Fields added to the request asked again, once, when the answer was cut at the output limit before any call (2026-10-08,
         * Nemotron 3 Ultra: its reasoning ran past 4096 tokens, three steps, STUCK). For Nemotron, `{"chat_template_kwargs":
         * {"enable_thinking": false}}`: the same question answered without thinking, the call directly.
         */
        whenCut?: Record<string, unknown>;
        /** The sampling temperature sent; null sends none, for a model that takes only its own (0.2 when absent). */
        temperature?: number | null;
        /** The reasoning effort asked of a model that reasons (the Responses API: low, medium, high); the model's own default when absent. */
        reasoningEffort?: string;
        /** How long one answer may take, in milliseconds (60000 when absent): a model that reasons long is not cut by the harness's clock. */
        timeoutMs?: number;
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
