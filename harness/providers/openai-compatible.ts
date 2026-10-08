/**
 * A reasoner behind an OpenAI-compatible chat completions API with tool
 * calling: Nebius Token Factory (Nemotron and others), OpenAI, or a local
 * server (vLLM, Ollama). The profile names the endpoint and the model; the
 * key comes from the environment (never from a file).
 *
 * One conversation per intention (`begin`): the model sees its own previous
 * tool calls and, on the next step, their results (from the observation's
 * `lastOutput`), so a plan can build on the twin's answer. Each call's raw
 * request and response, with latency and usage, is kept in `exchanges`
 * for the trace.
 */
import type { PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Provider, ProviderExchange, ProviderProfile } from "../lib/provider.js";
import { apiKeyFor, compactRequest, contextSizes, decisionFrom, familyOf, fromApiName, intentionText, observationText, parseJsonArgs, stripReasoning, toApiName, TRUNCATED_RESULT, truncatedDecision, type ContextMode } from "../lib/llm-common.js";
import { APP } from "../core/application.js";

interface ToolCall {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
}
interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}
interface ChatCompletion {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    error?: { message?: string };
}

export interface OpenAiCompatibleOptions {
    systemPrompt: string;
    temperature?: number;
    timeoutMs?: number;
    /** `conversation` (the default) replays the transcript; `state` sends the intention and the reasoning state alone at every step. */
    contextMode?: ContextMode;
}

export class OpenAiCompatibleProvider implements Provider {
    readonly model: string;
    readonly family: string;
    readonly exchanges: ProviderExchange[] = [];
    calls = 0;
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private messages: ChatMessage[] = [];
    /** The tool calls of the last answer: the first one was executed, the others were not (one action per step). */
    private pendingCalls: Array<{ id: string; executed: boolean; truncated: boolean }> = [];
    /** The profile's `tier3.maxTokens`, sent only when given: the server's own limit otherwise. A cut answer (`finish_reason: "length"`) is never run. */
    private readonly maxTokens: number | null;
    private readonly maxTokensParam: "max_tokens" | "max_completion_tokens";
    private readonly profileTemperature: number | null | undefined;
    private readonly profileTimeoutMs: number | undefined;
    /** The server refused `tool_choice: "required"` once (HTTP 400 naming it): `auto` from then on, a decision without a call becoming a report. */
    private requiredRefused = false;

    constructor(
        profile: ProviderProfile | null,
        private readonly options: OpenAiCompatibleOptions,
    ) {
        const p = profile?.tier3;
        if (!p?.model || p.model.startsWith("<")) throw new Error("the profile must name tier3.model (a model id, not a placeholder)");
        if (p.wire && p.wire !== "openai-compatible") throw new Error(`the profile's wire is ${p.wire}, this provider speaks openai-compatible`);
        this.model = p.model;
        this.baseUrl = (p.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1").replace(/\/$/, "");
        this.apiKey = apiKeyFor(profile, ["NEBIUS_API_KEY", "OPENAI_API_KEY"]);
        this.maxTokens = p.maxTokens ?? null;
        this.maxTokensParam = p.maxTokensParam ?? "max_tokens";
        this.profileTemperature = p.temperature;
        this.profileTimeoutMs = p.timeoutMs;
        this.family = familyOf(profile, this.model);
        this.messages = [{ role: "system", content: options.systemPrompt }];
    }

    get name(): string {
        return `openai:${this.family}`;
    }

    begin(_intentionId: string): void {
        this.messages = [{ role: "system", content: this.options.systemPrompt }];
        this.pendingCalls = [];
    }

    get contextMode(): ContextMode {
        return this.options.contextMode ?? "conversation";
    }

    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        if (this.contextMode === "state") {
            this.messages = [{ role: "system", content: this.options.systemPrompt }];
            this.pendingCalls = [];
        }
        // Every tool call of the previous answer needs a tool message now, or the API refuses the conversation; only the first was executed.
        const f = input.state.features;
        for (const call of this.pendingCalls) {
            this.messages.push({ role: "tool", tool_call_id: call.id, content: call.truncated ? TRUNCATED_RESULT : call.executed ? `${String(f.lastOutcome || "unknown")}: ${String(f.lastOutput || "no output")}` : "not executed: the harness runs one action per step; call it again at the next step if it is still needed" });
        }
        this.pendingCalls = [];
        if (!this.messages.some((m) => m.role === "user")) this.messages.push({ role: "user", content: intentionText(input) });
        this.messages.push({ role: "user", content: observationText(input) });

        const tools = input.allowedCapabilities.map((c) => ({ type: "function", function: { name: toApiName(c.id), description: c.description, parameters: c.inputSchema ?? { type: "object" } } }));
        // One action per step: the harness executes one decision, so the model is asked for one call at a time.
        // The output limit under the name the server takes, and a temperature only when the profile does not say the model takes none.
        const temperature = this.options.temperature ?? (this.profileTemperature === undefined ? 0.2 : this.profileTemperature);
        const choice = (): string => (this.contextMode === "state" && !this.requiredRefused ? "required" : "auto");
        const bodyWith = (toolChoice: string) => ({ model: this.model, messages: this.messages, tools, tool_choice: toolChoice, parallel_tool_calls: false, ...(temperature === null ? {} : { temperature }), ...(this.maxTokens ? { [this.maxTokensParam]: this.maxTokens } : {}) });
        let body = bodyWith(choice());
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? this.profileTimeoutMs ?? 60000);
        input.signal?.addEventListener("abort", () => controller.abort(), { once: true });
        let completion: ChatCompletion;
        try {
            const post = () =>
                fetch(`${this.baseUrl}/chat/completions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
            let response = await post();
            let text = await response.text();
            // A server whose tool parser does not take `required` (some vLLM deployments) says so with a 400: asked again once with
            // `auto`, and `auto` from then on; an answer without a call is then read as a report, as in conversation mode.
            if (response.status === 400 && body.tool_choice === "required" && /tool_choice|required/i.test(text)) {
                this.requiredRefused = true;
                body = bodyWith("auto");
                response = await post();
                text = await response.text();
            }
            if (!response.ok) throw new Error(`${this.baseUrl} answered HTTP ${response.status}: ${text.slice(0, 400)}`);
            completion = JSON.parse(text) as ChatCompletion;
        } finally {
            clearTimeout(timer);
        }
        const latencyMs = Date.now() - started;
        if (completion.error) throw new Error(`model error: ${completion.error.message}`);
        const message = completion.choices?.[0]?.message ?? {};
        const calls = message.tool_calls ?? [];
        const call = calls[0] ?? null;
        // The reasoning of a thinking model, left in the content by some servers, is not the answer (stripReasoning).
        const text = stripReasoning(message.content);
        this.messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
        const truncated = completion.choices?.[0]?.finish_reason === "length";
        this.pendingCalls = calls.map((c, i) => ({ id: c.id, executed: i === 0 && !truncated, truncated }));
        const decision = truncated && call ? truncatedDecision(fromApiName(call.function.name)) : decisionFrom(call?.function.name ?? null, parseJsonArgs(call?.function.arguments), text, input.allowedCapabilities);
        const usage = completion.usage;
        this.exchanges.push({
            decisionId: input.decisionId,
            model: this.model,
            request: compactRequest(this.messages.slice(0, -1), tools.map((t) => ({ name: t.function.name, description: t.function.description })), this.options.systemPrompt),
            context: { mode: this.contextMode, ...contextSizes(this.options.systemPrompt, tools.map((t) => t.function), this.messages.slice(1, -1) as Array<{ role: string; content: unknown }>, this.contextMode) },
            response: completion,
            decision,
            proposedCapabilityId: call ? fromApiName(call.function.name) : APP.text.report,
            proposedInput: call ? parseJsonArgs(call.function.arguments) : { message: text },
            latencyMs,
            tokens: usage ? { prompt: usage.prompt_tokens ?? 0, completion: usage.completion_tokens ?? 0, total: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0) } : null,
        });
        return decision;
    }
}
