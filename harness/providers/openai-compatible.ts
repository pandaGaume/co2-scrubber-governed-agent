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
import { CallBatch, completeArgs, distinctCalls } from "../lib/call-batch.js";
import { apiKeyFor, callInText, callsInText, compactRequest, contextSizes, decisionFrom, familyOf, fromApiName, intentionText, observationText, parseJsonArgs, stripReasoning, toApiName, TRUNCATED_RESULT, truncatedDecision, type ContextMode } from "../lib/llm-common.js";
import { APP } from "../core/application.js";

/** The JSON Schema keys each server's grammar refused, by its base URL: learned once for all the conversations with it. */
const UNIMPLEMENTED = new Map<string, Set<string>>();

/** A JSON Schema without the keys named, at every depth (a property named like a key is a property, kept). */
function withoutKeys(schema: unknown, keys: ReadonlySet<string>): unknown {
    if (!keys.size || schema === null || typeof schema !== "object") return schema;
    if (Array.isArray(schema)) return schema.map((x) => withoutKeys(x, keys));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
        if (keys.has(k)) continue;
        if (k === "properties" && v && typeof v === "object" && !Array.isArray(v)) {
            out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([name, sub]) => [name, withoutKeys(sub, keys)]));
        } else out[k] = withoutKeys(v, keys);
    }
    return out;
}

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
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[]; reasoning?: string | null; reasoning_content?: string | null }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    error?: { message?: string };
}

/** How much of a cut reasoning the retry reads: its end, where a reasoning concludes. */
const CUT_TAIL_CHARS = 6000;

/**
 * What the retry after an answer cut before its call is told (2026-10-10, runs 5 to 8): the end of the reasoning that was cut, its
 * lines said once (a reasoning cut at the limit often repeats itself), and to answer with the call it concluded on. Asked again
 * blind, the retry without reasoning decided from nothing: the inventory read again at the procedure stage, after a reasoning that
 * had written the whole procedure and was cut on "Now produce that".
 */
export function cutRetryText(reasoning: string): string {
    const seen = new Set<string>();
    const lines = reasoning.split(/\r?\n/).filter((line) => {
        const key = line.trim();
        if (!key) return false;
        if (seen.has(key) && key.length > 3) return false;
        seen.add(key);
        return true;
    });
    const kept = lines.join("\n");
    const tail = kept.length > CUT_TAIL_CHARS ? `...${kept.slice(-CUT_TAIL_CHARS)}` : kept;
    return `Your previous answer to this step was cut at the output limit before its call. The end of its reasoning, its lines said once:\n<<<\n${tail}\n>>>\nIf it concluded on a call, answer now with that call, its arguments whole. Otherwise answer with the call the state and the brief ask for now. Do not reason again: answer with the call.`;
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
    /** The profile's top_p, sent only when given. */
    private readonly profileTopP: number | undefined;
    private readonly profileTimeoutMs: number | undefined;
    /** The server refused `tool_choice: "required"` once (HTTP 400 naming it): `auto` from then on, a decision without a call becoming a report. */
    private requiredRefused = false;
    /** The profile's `toolChoice`, null for the mode's own (required in state mode, auto in conversation mode). */
    private readonly toolChoice: "required" | "auto" | null;
    /** The profile's `whenCut`: what a request asked again after an answer cut before any call adds. */
    private readonly whenCut: Record<string, unknown> | null;
    /**
     * JSON Schema keys the server's grammar does not implement (2026-10-08, Nebius Token Factory: `Grammar error: Unimplemented keys:
     * ["uniqueItems"]`, the whole request refused): learned from its refusal, then left out of the schemas the model is shown. The
     * arguments are still checked whole by the harness's guard; only the decoding constraint loses them.
     */
    private readonly unimplemented: Set<string>;

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
        this.toolChoice = p.toolChoice ?? null;
        this.whenCut = p.whenCut ?? null;
        this.profileTemperature = p.temperature;
        this.profileTopP = p.topP;
        this.profileTimeoutMs = p.timeoutMs;
        this.family = familyOf(profile, this.model);
        // Shared by every conversation with this server, seeded by the profile's `schemaUnsupported` (a refusal learned once).
        const known = UNIMPLEMENTED.get(this.baseUrl) ?? new Set<string>(p.schemaUnsupported ?? []);
        UNIMPLEMENTED.set(this.baseUrl, known);
        this.unimplemented = known;
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

    /** The calls of the last answer still to hand to the loop, and the results of those that ran (harness/lib/call-batch.ts). */
    private batch: CallBatch | null = null;
    /** In the state mode, a finished batch's results, said with the next observation (CallBatch.summary). */
    private batchSummary: string | null = null;

    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        // Several calls in the last answer: the next one goes to the loop without asking the model; when the last has run, every
        // result is sent back at once, each under its call's id.
        if (this.batch) {
            const batch = this.batch;
            const next = batch.advance(input.state.features as Record<string, unknown>, new Set(input.allowedCapabilities.map((c) => c.id)));
            if (next) {
                const decision = decisionFrom(next.name, next.args, "", input.allowedCapabilities);
                this.exchanges.push({ decisionId: input.decisionId, model: this.model, request: null, response: null, decision, proposedCapabilityId: fromApiName(next.name), proposedInput: next.args, latencyMs: 0, tokens: null, batch: batch.position });
                return decision;
            }
            this.batch = null;
            this.pendingCalls = [];
            if (this.contextMode !== "state") for (const r of batch.results()) this.messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
            else this.batchSummary = batch.summary();
        }
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
        if (this.batchSummary) {
            this.messages.push({ role: "user", content: this.batchSummary });
            this.batchSummary = null;
        }

        const toolsNow = () => input.allowedCapabilities.map((c) => ({ type: "function", function: { name: toApiName(c.id), description: c.description, parameters: withoutKeys(c.inputSchema ?? { type: "object" }, this.unimplemented) } }));
        let tools = toolsNow();
        // Several calls in one answer are taken (call-batch.ts): each runs as its own step, the results go back together.
        // The output limit under the name the server takes, and a temperature only when the profile does not say the model takes none.
        const temperature = this.options.temperature ?? (this.profileTemperature === undefined ? 0.2 : this.profileTemperature);
        const choice = (): string => ((this.toolChoice ?? (this.contextMode === "state" ? "required" : "auto")) === "required" && !this.requiredRefused ? "required" : "auto");
        const bodyWith = (toolChoice: string) => ({ model: this.model, messages: this.messages, tools: (tools = toolsNow()), tool_choice: toolChoice, parallel_tool_calls: input.state.features.oneCall !== true, ...(temperature === null ? {} : { temperature }), ...(this.profileTopP !== undefined ? { top_p: this.profileTopP } : {}), ...(this.maxTokens ? { [this.maxTokensParam]: this.maxTokens } : {}) });
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
            // A grammar that cannot compile a key of a schema refuses the whole request: the keys it names are left out, and it is asked again (at most twice).
            for (let again = 0; again < 2 && response.status === 400; again++) {
                const keys = /Unimplemented keys:\s*\[([^\]]*)\]/i.exec(text.replace(/\\"/g, '"'))?.[1];
                const named = (keys ?? "").split(",").map((k) => k.trim().replace(/^"+|"+$/g, "")).filter(Boolean);
                if (!named.length || named.every((k) => this.unimplemented.has(k))) break;
                for (const k of named) this.unimplemented.add(k);
                body = bodyWith(String(body.tool_choice));
                response = await post();
                text = await response.text();
            }
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
            // Cut at the output limit before any call (the reasoning ran out of room): asked again once, as the profile says (whenCut).
            const first = completion.choices?.[0];
            if (this.whenCut && first?.finish_reason === "length" && !first.message?.tool_calls?.length && !callInText(first.message?.content, new Set(input.allowedCapabilities.map((c) => c.id)))) {
                const cutTokens = completion.usage?.completion_tokens ?? 0;
                // The retry reads the end of what was cut: its conclusion is often there, whole (cutRetryText).
                const cut = String(first.message?.reasoning ?? first.message?.reasoning_content ?? first.message?.content ?? "");
                body = { ...body, ...this.whenCut, ...(cut.trim() ? { messages: [...this.messages, { role: "user", content: cutRetryText(cut) }] } : {}) };
                response = await post();
                text = await response.text();
                if (response.ok) {
                    completion = JSON.parse(text) as ChatCompletion;
                    // Both answers are paid: the usage counts them together.
                    if (completion.usage) completion.usage = { ...completion.usage, completion_tokens: (completion.usage.completion_tokens ?? 0) + cutTokens };
                    (completion as { askedAgain?: string }).askedAgain = `cut at the output limit before any call (${cutTokens} tokens): asked again with ${JSON.stringify(this.whenCut)}`;
                }
            }
        } finally {
            clearTimeout(timer);
        }
        const latencyMs = Date.now() - started;
        if (completion.error) throw new Error(`model error: ${completion.error.message}`);
        const message = completion.choices?.[0]?.message ?? {};
        // The reasoning of a thinking model, left in the content by some servers, is not the answer (stripReasoning).
        let text = stripReasoning(message.content);
        let calls = message.tool_calls ?? [];
        let cutAfterCall = false;
        // A call written as text, not through the API (callInText): read as the call it is; the text, often the same list repeated
        // until the limit, is not replayed to the model: its transcript holds the call, as if it had come through the API.
        if (!calls.length) {
            const written = callsInText(text, new Set(input.allowedCapabilities.map((c) => c.id)));
            if (written.length) {
                calls = written.map((w, i) => ({ id: `text-${input.decisionId ?? Date.now().toString(36)}-${i}`, type: "function", function: w }));
                cutAfterCall = completion.choices?.[0]?.finish_reason === "length";
                text = "";
            }
        }
        // Cut at the output limit with calls: the complete ones are kept, an unfinished one's arguments do not parse. One call whose
        // arguments parse whole was cut after it, not in it (2026-10-10, run 12: Nemotron Super wrote procedure.submit to its last
        // brace, then went on to the limit; the call was refused as cut three times, STUCK, though it was complete).
        if (calls.length >= 1 && completion.choices?.[0]?.finish_reason === "length") {
            const complete = calls.filter((c) => completeArgs(c.function.arguments) !== null);
            if (complete.length) {
                calls = complete;
                cutAfterCall = true;
            }
        }
        calls = distinctCalls(calls, (c) => [c.function.name, c.function.arguments]);
        const call = calls[0] ?? null;
        this.messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
        // A call read whole from the text is complete even when what followed it was cut.
        const truncated = completion.choices?.[0]?.finish_reason === "length" && !cutAfterCall;
        this.pendingCalls = calls.map((c, i) => ({ id: c.id, executed: i === 0 && !truncated, truncated }));
        // Several complete calls: a batch, the first handed now, the others at the next steps; their results go back together.
        if (calls.length > 1 && !truncated) {
            this.batch = new CallBatch(calls.map((c) => ({ id: c.id, name: c.function.name, args: completeArgs(c.function.arguments) ?? {}, result: null })), input.state.features as Record<string, unknown>);
            this.pendingCalls = [];
        }
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
