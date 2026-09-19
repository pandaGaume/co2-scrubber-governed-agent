/**
 * A reasoner behind Anthropic's Messages API with tool use (Claude). The
 * wire is called directly (`fetch`, `x-api-key`, `anthropic-version`) rather
 * than through the SDK, so the exchange kept in the trace is the exact
 * request and response, and the demo carries no extra dependency; the
 * shape is the public one and the SDK would produce the same frames.
 *
 * One conversation per intention (`begin`); a tool call's result is returned
 * to the model on the next step as a `tool_result` block built from the
 * observation's `lastOutput`.
 */
import type { PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Provider, ProviderExchange, ProviderProfile } from "./provider.js";
import { apiKeyFor, compactRequest, decisionFrom, familyOf, fromApiName, intentionText, observationText, parseJsonArgs, toApiName } from "./llm-common.js";

type ContentBlock = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown } | { type: "tool_result"; tool_use_id: string; content: string };
interface Message {
    role: "user" | "assistant";
    content: ContentBlock[];
}
interface MessagesResponse {
    content?: ContentBlock[];
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { message?: string };
}

export interface AnthropicOptions {
    systemPrompt: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
}

export class AnthropicProvider implements Provider {
    readonly model: string;
    readonly family: string;
    readonly exchanges: ProviderExchange[] = [];
    calls = 0;
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private messages: Message[] = [];
    /** The tool_use blocks of the last answer: the first one was executed, the others were not (one action per step). */
    private pendingToolUses: Array<{ id: string; executed: boolean }> = [];

    constructor(
        profile: ProviderProfile | null,
        private readonly options: AnthropicOptions,
    ) {
        const p = profile?.tier3;
        if (!p?.model || p.model.startsWith("<")) throw new Error("the profile must name tier3.model (a model id, not a placeholder)");
        if (p.wire && p.wire !== "anthropic-messages") throw new Error(`the profile's wire is ${p.wire}, this provider speaks anthropic-messages`);
        this.model = p.model;
        this.baseUrl = (p.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
        this.apiKey = apiKeyFor(profile, ["ANTHROPIC_API_KEY"]);
        this.family = familyOf(profile, this.model) === "default" ? "claude" : familyOf(profile, this.model);
    }

    get name(): string {
        return `anthropic:${this.family}`;
    }

    begin(_intentionId: string): void {
        this.messages = [];
        this.pendingToolUses = [];
    }

    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        const blocks: ContentBlock[] = [];
        // Every tool_use of the previous answer needs a tool_result in this message, or the API refuses the conversation.
        const f = input.state.features;
        for (const use of this.pendingToolUses) {
            blocks.push({ type: "tool_result", tool_use_id: use.id, content: use.executed ? `${String(f.lastOutcome || "unknown")}: ${String(f.lastOutput || "no output")}` : "not executed: the harness runs one action per step; call it again at the next step if it is still needed" });
        }
        this.pendingToolUses = [];
        if (this.messages.length === 0) blocks.push({ type: "text", text: intentionText(input) });
        blocks.push({ type: "text", text: observationText(input) });
        this.messages.push({ role: "user", content: blocks });

        const tools = input.allowedCapabilities.map((c) => ({ name: toApiName(c.id), description: c.description, input_schema: c.inputSchema ?? { type: "object" } }));
        // One action per step: the harness executes one decision, so the model is asked for one call at a time.
        const body = { model: this.model, system: this.options.systemPrompt, messages: this.messages, tools, tool_choice: { type: "auto", disable_parallel_tool_use: true }, max_tokens: this.options.maxTokens ?? 1024, temperature: this.options.temperature ?? 0.2 };
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 60000);
        input.signal?.addEventListener("abort", () => controller.abort(), { once: true });
        let result: MessagesResponse;
        try {
            const response = await fetch(`${this.baseUrl}/v1/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            const text = await response.text();
            if (!response.ok) throw new Error(`${this.baseUrl} answered HTTP ${response.status}: ${text.slice(0, 400)}`);
            result = JSON.parse(text) as MessagesResponse;
        } finally {
            clearTimeout(timer);
        }
        const latencyMs = Date.now() - started;
        if (result.error) throw new Error(`model error: ${result.error.message}`);
        const content = result.content ?? [];
        this.messages.push({ role: "assistant", content });
        const toolUses = content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
        const toolUse = toolUses[0] ?? null;
        const text = content
            .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
            .map((b) => b.text)
            .join("\n");
        this.pendingToolUses = toolUses.map((u, i) => ({ id: u.id, executed: i === 0 }));
        const decision = decisionFrom(toolUse?.name ?? null, parseJsonArgs(toolUse?.input), text, input.allowedCapabilities);
        const usage = result.usage;
        this.exchanges.push({
            decisionId: input.decisionId,
            model: this.model,
            request: compactRequest(this.messages.slice(0, -1), tools.map((t) => t.name)),
            response: result,
            decision,
            proposedCapabilityId: toolUse ? fromApiName(toolUse.name) : "crew.report",
            proposedInput: toolUse ? parseJsonArgs(toolUse.input) : { message: text },
            latencyMs,
            tokens: usage ? { prompt: usage.input_tokens ?? 0, completion: usage.output_tokens ?? 0, total: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) } : null,
        });
        return decision;
    }
}
