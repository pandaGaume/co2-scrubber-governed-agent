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
import type { Provider, ProviderExchange, ProviderProfile } from "./provider.js";
import { apiKeyFor, compactRequest, decisionFrom, familyOf, fromApiName, intentionText, observationText, parseJsonArgs, toApiName } from "./llm-common.js";

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
    private pendingCalls: Array<{ id: string; executed: boolean }> = [];

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

    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        // Every tool call of the previous answer needs a tool message now, or the API refuses the conversation; only the first was executed.
        const f = input.state.features;
        for (const call of this.pendingCalls) {
            this.messages.push({ role: "tool", tool_call_id: call.id, content: call.executed ? `${String(f.lastOutcome || "unknown")}: ${String(f.lastOutput || "no output")}` : "not executed: the harness runs one action per step; call it again at the next step if it is still needed" });
        }
        this.pendingCalls = [];
        if (!this.messages.some((m) => m.role === "user")) this.messages.push({ role: "user", content: intentionText(input) });
        this.messages.push({ role: "user", content: observationText(input) });

        const tools = input.allowedCapabilities.map((c) => ({ type: "function", function: { name: toApiName(c.id), description: c.description, parameters: c.inputSchema ?? { type: "object" } } }));
        // One action per step: the harness executes one decision, so the model is asked for one call at a time.
        const body = { model: this.model, messages: this.messages, tools, tool_choice: "auto", parallel_tool_calls: false, temperature: this.options.temperature ?? 0.2 };
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 60000);
        input.signal?.addEventListener("abort", () => controller.abort(), { once: true });
        let completion: ChatCompletion;
        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            const text = await response.text();
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
        const text = message.content ?? "";
        this.messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
        this.pendingCalls = calls.map((c, i) => ({ id: c.id, executed: i === 0 }));
        const decision = decisionFrom(call?.function.name ?? null, parseJsonArgs(call?.function.arguments), text, input.allowedCapabilities);
        const usage = completion.usage;
        this.exchanges.push({
            decisionId: input.decisionId,
            model: this.model,
            request: compactRequest(this.messages.slice(0, -1), tools.map((t) => t.function.name)),
            response: completion,
            decision,
            proposedCapabilityId: call ? fromApiName(call.function.name) : "crew.report",
            proposedInput: call ? parseJsonArgs(call.function.arguments) : { message: text },
            latencyMs,
            tokens: usage ? { prompt: usage.prompt_tokens ?? 0, completion: usage.completion_tokens ?? 0, total: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0) } : null,
        });
        return decision;
    }
}
