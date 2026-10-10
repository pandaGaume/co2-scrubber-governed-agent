/**
 * A reasoner behind OpenAI's Responses API (`/v1/responses`), with tool calling (2026-09-29, the memory's transfer to another
 * provider: gpt-5.6-sol takes function tools with its reasoning on this API only, and refuses them on chat completions unless
 * its reasoning is turned off, which would compare a model reasoning with one that does not). The profile names the model,
 * the output limit and, optionally, the reasoning effort; the key comes from the environment.
 *
 * The same contract as the other adapters: one tool call per step (the first one; the others are said not executed), a
 * call the output limit cut is never run, each exchange's raw request and response kept with latency and usage. In the
 * state mode (the factories) every step is the intention and the harness's reasoning state alone, nothing stored at the
 * provider; in the conversation mode the previous response is chained (`previous_response_id`) and the tool's result given.
 */
import type { PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Provider, ProviderExchange, ProviderProfile } from "../lib/provider.js";
import { apiKeyFor, compactRequest, contextSizes, cutAtOutputLimit, decisionFrom, familyOf, fromApiName, intentionText, observationText, parseJsonArgs, toApiName, TRUNCATED_RESULT, truncatedDecision, type ContextMode } from "../lib/llm-common.js";
import { APP } from "../core/application.js";
import { CallBatch, distinctCalls } from "../lib/call-batch.js";

interface OutputItem {
    type: string;
    name?: string;
    arguments?: string;
    call_id?: string;
    content?: Array<{ type: string; text?: string }>;
}
interface ResponseBody {
    id?: string;
    status?: string;
    incomplete_details?: { reason?: string } | null;
    output?: OutputItem[];
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    error?: { message?: string } | null;
}
type InputItem = { role: "user"; content: string } | { type: "function_call_output"; call_id: string; output: string };

export interface OpenAiResponsesOptions {
    systemPrompt: string;
    timeoutMs?: number;
    contextMode?: ContextMode;
}

export class OpenAiResponsesProvider implements Provider {
    readonly model: string;
    readonly family: string;
    readonly exchanges: ProviderExchange[] = [];
    calls = 0;
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly maxTokens: number | null;
    private readonly temperature: number | null;
    private readonly reasoningEffort: string | null;
    private readonly timeoutMs: number;
    /** The conversation mode's chain: the last response, and its tool calls waiting for their result. */
    private previous: string | null = null;
    private pendingCalls: Array<{ id: string; executed: boolean; truncated: boolean }> = [];
    /** The calls of the last answer still to hand to the loop, and the results of those that ran (harness/lib/call-batch.ts). */
    private batch: CallBatch | null = null;
    private batchResults: Array<{ id: string; content: string }> = [];
    private batchDropped: string[] = [];
    private batchSummary: string | null = null;
    private started = false;

    constructor(
        profile: ProviderProfile | null,
        private readonly options: OpenAiResponsesOptions,
    ) {
        const p = profile?.tier3;
        if (!p?.model || p.model.startsWith("<")) throw new Error("the profile must name tier3.model (a model id, not a placeholder)");
        if (p.wire !== "openai-responses") throw new Error(`the profile's wire is ${String(p.wire)}, this provider speaks openai-responses`);
        this.model = p.model;
        this.baseUrl = (p.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
        this.apiKey = apiKeyFor(profile, ["OPENAI_API_KEY"]);
        this.maxTokens = p.maxTokens ?? null;
        this.temperature = typeof p.temperature === "number" ? p.temperature : null;
        this.reasoningEffort = p.reasoningEffort ?? null;
        this.timeoutMs = options.timeoutMs ?? p.timeoutMs ?? 60000;
        this.family = familyOf(profile, this.model);
    }

    get name(): string {
        return `openai-responses:${this.family}`;
    }

    get contextMode(): ContextMode {
        return this.options.contextMode ?? "conversation";
    }

    begin(_intentionId: string): void {
        this.previous = null;
        this.pendingCalls = [];
        this.started = false;
    }

    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        if (this.batch) {
            const batch = this.batch;
            const next = batch.advance(input.state.features as Record<string, unknown>, new Set(input.allowedCapabilities.map((c) => c.id)));
            if (next) {
                const decision = decisionFrom(next.name, next.args, "", input.allowedCapabilities);
                this.exchanges.push({ decisionId: input.decisionId, model: this.model, request: null, response: null, decision, proposedCapabilityId: fromApiName(next.name), proposedInput: next.args, latencyMs: 0, tokens: null, batch: batch.position });
                return decision;
            }
            this.batch = null;
            if (this.contextMode === "state") this.batchSummary = batch.summary();
            this.batchResults = [...batch.results(), ...this.batchDropped.map((id) => ({ id, content: "not executed: the same call as an earlier one in this answer" }))];
            this.batchDropped = [];
        }
        const state = this.contextMode === "state";
        const items: InputItem[] = [];
        if (state || !this.previous) {
            items.push({ role: "user", content: intentionText(input) });
        } else {
            // The tool calls of the previous answer, each with its result: only the first was executed.
            const f = input.state.features;
            for (const r of this.batchResults) items.push({ type: "function_call_output", call_id: r.id, output: r.content });
            for (const call of this.pendingCalls) items.push({ type: "function_call_output", call_id: call.id, output: call.truncated ? TRUNCATED_RESULT : call.executed ? `${String(f.lastOutcome || "unknown")}: ${String(f.lastOutput || "no output")}` : "not executed: the harness runs one action per step; call it again at the next step if it is still needed" });
        }
        this.batchResults = [];
        items.push({ role: "user", content: observationText(input) });
        if (this.batchSummary) {
            items.push({ role: "user", content: this.batchSummary });
            this.batchSummary = null;
        }
        this.started = true;
        const tools = input.allowedCapabilities.map((c) => ({ type: "function", name: toApiName(c.id), description: c.description, parameters: c.inputSchema ?? { type: "object" }, strict: false }));
        const body = {
            model: this.model,
            instructions: this.options.systemPrompt,
            input: items,
            tools,
            tool_choice: state ? "required" : "auto",
            // One call per answer where the stage's work is an action (features.oneCall, workspace-observer.ts).
            parallel_tool_calls: input.state.features.oneCall !== true,
            // Nothing kept at the provider in the state mode: the harness's state is the memory.
            store: !state,
            ...(!state && this.previous ? { previous_response_id: this.previous } : {}),
            ...(this.maxTokens ? { max_output_tokens: this.maxTokens } : {}),
            ...(this.temperature !== null ? { temperature: this.temperature } : {}),
            ...(this.reasoningEffort ? { reasoning: { effort: this.reasoningEffort } } : {}),
        };
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        input.signal?.addEventListener("abort", () => controller.abort(), { once: true });
        let result: ResponseBody;
        try {
            const response = await fetch(`${this.baseUrl}/responses`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify(body), signal: controller.signal });
            const text = await response.text();
            if (!response.ok) throw new Error(`${this.baseUrl} answered HTTP ${response.status}: ${text.slice(0, 400)}`);
            result = JSON.parse(text) as ResponseBody;
        } finally {
            clearTimeout(timer);
        }
        const latencyMs = Date.now() - started;
        if (result.error?.message) throw new Error(`model error: ${result.error.message}`);
        const output = result.output ?? [];
        const calls = output.filter((o) => o.type === "function_call" && o.name);
        const call = calls[0] ?? null;
        const text = output
            .filter((o) => o.type === "message")
            .flatMap((o) => o.content ?? [])
            .filter((c) => c.type === "output_text")
            .map((c) => c.text ?? "")
            .join("\n");
        const truncated = cutAtOutputLimit(result);
        this.previous = result.id ?? null;
        this.pendingCalls = calls.map((c, i) => ({ id: c.call_id ?? "", executed: i === 0 && !truncated, truncated }));
        const distinct = distinctCalls(calls, (c) => [c.name ?? "", c.arguments]);
        if (distinct.length > 1 && !truncated) {
            this.batch = new CallBatch(distinct.map((c) => ({ id: c.call_id ?? "", name: c.name!, args: parseJsonArgs(c.arguments), result: null })), input.state.features as Record<string, unknown>);
            this.pendingCalls = [];
            this.batchDropped = calls.filter((c) => !distinct.includes(c)).map((c) => c.call_id ?? "");
        }
        const decision = truncated && call ? truncatedDecision(fromApiName(call.name!)) : decisionFrom(call?.name ?? null, parseJsonArgs(call?.arguments), text, input.allowedCapabilities);
        const messages = [{ role: "system", content: this.options.systemPrompt }, ...items.map((x) => ("role" in x ? { role: x.role, content: x.content } : { role: "tool", content: x.output }))];
        const usage = result.usage;
        this.exchanges.push({
            decisionId: input.decisionId,
            model: this.model,
            request: compactRequest(messages, tools.map((t) => ({ name: t.name, description: t.description })), this.options.systemPrompt),
            context: { mode: this.contextMode, ...contextSizes(this.options.systemPrompt, tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })), messages.slice(1) as Array<{ role: string; content: unknown }>, this.contextMode) },
            response: result,
            decision,
            proposedCapabilityId: call ? fromApiName(call.name!) : APP.text.report,
            proposedInput: call ? parseJsonArgs(call.arguments) : { message: text },
            latencyMs,
            tokens: usage ? { prompt: usage.input_tokens ?? 0, completion: usage.output_tokens ?? 0, total: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) } : null,
        });
        return decision;
    }
}
