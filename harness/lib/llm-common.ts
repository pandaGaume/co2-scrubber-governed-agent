/**
 * What the two language-model providers share: the tool names the APIs
 * accept, the messages built from the harness's input, the family a model
 * belongs to (which is what the slots' grammars answer to), and the way a
 * completion becomes one harness decision.
 *
 * Tool names: the OpenAI and Anthropic APIs accept `^[a-zA-Z0-9_-]{1,64}$`,
 * the capabilities are `<slot>.<tool>` with dots (the firmware's own tool
 * names). Dots become double underscores on the way out and back.
 */
import type { CapabilityDescriptor, JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { ProviderProfile } from "./provider.js";
import { APP, appSays } from "../core/application.js";

export const toApiName = (capabilityId: string): string => capabilityId.replace(/\./g, "__").slice(0, 64);

/**
 * A reasoning model's answer without its reasoning (2026-10-08, Nemotron on Token Factory): the thinking some servers
 * leave in the content between `<think>` and `</think>` never reaches the console, Mother's voice or the conversation
 * the model is shown next. An answer still thinking when it was cut (`<think>` never closed) has no answer in it.
 * The reasoning stays in the exchange's raw response, for the trace.
 */
export function stripReasoning(text: string | null | undefined): string {
    if (!text) return "";
    let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
    const open = out.search(/<think>/i);
    if (open >= 0) out = out.slice(0, open);
    // A server that strips the opening tag itself leaves the reasoning before a lone closing one.
    const close = out.search(/<\/think>/i);
    if (close >= 0) out = out.slice(close + "</think>".length);
    return out.trim();
}
export const fromApiName = (name: string): string => name.replace(/__/g, ".");

/**
 * The first tool call a model wrote as text instead of through the API (2026-10-08, Nemotron 3 Ultra on Token Factory: its calls
 * written in the content as `[{"name": "library__read", "parameters": {"id": "..."}}, ...]`, which the server's tool parser did not
 * take, then the same list repeated until the output limit, three steps in a row, STUCK). The interpreter's principle applied to the
 * answer itself (core/interpreter.ts): a call a reader recognises is read, not refused. Only a complete JSON object naming a tool
 * of the allowed list, with `parameters` or `arguments`; the first one, since a step runs one call; complete even when the text
 * after it was cut. Null when there is none.
 */
export function callInText(text: string | null | undefined, allowed: ReadonlySet<string>): { name: string; arguments: string } | null {
    const s = text ?? "";
    const opening = /\{\s*"name"\s*:/g;
    for (let m = opening.exec(s); m; m = opening.exec(s)) {
        // The object's end: braces counted outside strings.
        let depth = 0;
        let inString = false;
        let end = -1;
        for (let i = m.index; i < s.length; i++) {
            const ch = s[i];
            if (inString) {
                if (ch === "\\") i++;
                else if (ch === '"') inString = false;
            } else if (ch === '"') inString = true;
            else if (ch === "{") depth++;
            else if (ch === "}" && --depth === 0) {
                end = i;
                break;
            }
        }
        if (end < 0) return null; // cut before this object closed: nothing complete after it either
        try {
            const o = JSON.parse(s.slice(m.index, end + 1)) as { name?: unknown; parameters?: unknown; arguments?: unknown };
            const name = typeof o.name === "string" ? o.name : "";
            const args = o.parameters ?? o.arguments ?? {};
            if (allowed.has(fromApiName(name)) && args && typeof args === "object" && !Array.isArray(args)) return { name, arguments: JSON.stringify(args) };
        } catch {
            // not JSON: the next opening is tried
        }
    }
    return null;
}

/** The family of a model, from the profile or its name: the key the slots' grammars use. */
export function familyOf(profile: ProviderProfile | null, model: string): string {
    const declared = profile?.tier3?.family;
    if (declared) return declared;
    const m = model.toLowerCase();
    for (const [family, patterns] of Object.entries({ nemotron: ["nemotron", "nvidia"], gpt: ["gpt", "openai"], claude: ["claude", "anthropic"], gemini: ["gemini", "google"], mistral: ["mistral"] })) {
        if (patterns.some((p) => m.includes(p))) return family;
    }
    return "default";
}

/** The API key from the environment variable the profile names, or the usual ones. */
export function apiKeyFor(profile: ProviderProfile | null, fallbackEnvs: string[]): string {
    const envs = [profile?.tier3?.apiKey?.env, ...fallbackEnvs].filter((e): e is string => Boolean(e));
    for (const env of envs) {
        const v = process.env[env];
        if (v) return v;
    }
    throw new Error(`no API key: set ${envs.join(" or ")}`);
}

/** The text the model reads at each step: the intention (once), then the observation. */
export function observationText(input: PolicyFallbackInput): string {
    const f = input.state.features;
    // A loop that carries a reasoning state hands it whole and nothing else of the features: the state is what to read.
    const lines = f.state && typeof f.state === "object" ? [`Observation at this step (state ${input.state.id}). The harness's brief: ${String(f.brief ?? "")}`, "Reasoning state (the harness's, rebuilt every step; the conversation is not replayed):", JSON.stringify(f.state, null, 0)] : [`Observation at this step (state ${input.state.id}):`, JSON.stringify(f, null, 0)];
    if (input.candidates.length) lines.push(`Learned decisions the harness considered but did not trust enough: ${input.candidates.map((c) => c.action.id).join(", ")}.`);
    if (input.recentFailures.length) lines.push(`Recent failures: ${input.recentFailures.map((e) => `${e.decision.invocation.capabilityId} -> ${e.result.error ?? "failed"}`).join("; ")}.`);
    lines.push(appSays("chooseOne", { report: toApiName(APP.text.report), ask: toApiName(APP.text.ask) }));
    return lines.join("\n");
}

export function intentionText(input: PolicyFallbackInput): string {
    const p = input.intention.parameters ?? {};
    return appSays("situation", { id: input.intention.id, minute: String(p.minute ?? "?"), description: input.intention.description ?? "" });
}

/** One harness decision from a tool call, or a crew report from plain text. */
export function decisionFrom(name: string | null, args: JsonValue, text: string, allowed: ReadonlyArray<CapabilityDescriptor>): PolicyDecision {
    const allowedIds = new Set(allowed.map((c) => c.id));
    if (name) {
        const capabilityId = fromApiName(name);
        if (allowedIds.has(capabilityId)) {
            const description = allowed.find((c) => c.id === capabilityId)?.description ?? capabilityId;
            return { action: { id: capabilityId, description }, invocation: { actionId: capabilityId, capabilityId, input: args }, rationale: text || undefined };
        }
        return report(`I tried to call ${capabilityId}, which is not among the tools I am allowed to propose.`);
    }
    return report(text.trim() || "(the model answered nothing)");
}

/**
 * A tool call the model's answer did not finish: the output limit cut it
 * (`max_tokens`, `finish_reason: "length"`). Its arguments are what the
 * model had written so far, and the fields it meant to write last are
 * missing; running it would run something the model did not ask for. So it
 * is not run: the decision becomes a report saying so, which the loop does
 * not execute as the call, and the model is told at its next step why its
 * call went nowhere.
 */
export const TRUNCATED_RESULT = "not executed: your answer was cut at the output limit before this call was complete, so its arguments are unfinished; send the call again, complete (shorter text around it if needed)";

/** Whether a model's raw answer was cut at the output limit: `stop_reason: "max_tokens"` (Anthropic), `finish_reason: "length"` (OpenAI-compatible). */
export function cutAtOutputLimit(response: unknown): boolean {
    const r = response as { stop_reason?: unknown; choices?: Array<{ finish_reason?: unknown }>; status?: unknown; incomplete_details?: { reason?: unknown } | null } | null;
    // The Responses API says an answer the limit cut is incomplete, for max_output_tokens.
    return r?.stop_reason === "max_tokens" || r?.choices?.[0]?.finish_reason === "length" || (r?.status === "incomplete" && r?.incomplete_details?.reason === "max_output_tokens");
}

/**
 * The reason a cut call is refused for, as the model reads it at the next step (2026-09-29, the memory audit): in the state
 * mode the conversation is not replayed, so the tool result that said so never arrived, and the refusal read "a capability
 * outside the allowlist" (the report the cut call became), which the model took for a submission refused.
 */
export function truncatedRefusal(capabilityId: string, outputTokens: number | null): string {
    return `${capabilityId} was not run: your answer was cut at the output limit${outputTokens ? ` (${outputTokens} tokens)` : ""} before this call was complete, so its arguments are unfinished and no guard judged them; send it again, complete, with less text around it`;
}

export function truncatedDecision(capabilityId: string): PolicyDecision {
    return report(`My call to ${capabilityId} was cut at the output limit before it was complete; it was not run.`);
}

export function report(message: string): PolicyDecision {
    return { action: { id: APP.text.report, description: APP.text.reportDescription }, invocation: { actionId: APP.text.report, capabilityId: APP.text.report, input: { message } }, rationale: "said in text, without a tool call" };
}

/** Compact JSON for the trace: the request without the schemas repeated at every step. */
/**
 * What was sent to the model, kept whole in the exchange: the system prompt,
 * every message of the conversation so far, the tools by name and, since
 * 2026-09-25, their descriptions (what the model reads to choose one). A
 * trace rendered from it shows the prompt as the model saw it.
 */
export function compactRequest(messages: unknown[], tools: Array<string | { name: string; description?: string }>, system?: string): unknown {
    const named = tools.map((t) => (typeof t === "string" ? { name: t } : t));
    return { ...(system !== undefined ? { system } : {}), messages, tools: named.map((t) => t.name), toolDescriptions: named };
}

export type ContextMode = "conversation" | "state";

/** Where the characters of a request go: the system prompt, the tools, and each kind of message block. */
export function contextSizes(system: string, tools: Array<{ name: string; description?: string; input_schema?: unknown; parameters?: unknown }>, messages: Array<{ role: string; content: unknown }>, mode: ContextMode): Record<string, number> {
    const sizes: Record<string, number> = { system: system.length, tools: JSON.stringify(tools).length, intention: 0, observation: 0, toolResults: 0, history: 0, messages: messages.length };
    messages.forEach((m, i) => {
        const last = i === messages.length - 1;
        const blocks = typeof m.content === "string" ? [{ type: m.role === "tool" ? "tool_result" : "text", text: m.content }] : Array.isArray(m.content) ? (m.content as Array<Record<string, unknown>>) : [];
        for (const b of blocks) {
            const text = typeof b.text === "string" ? b.text : typeof b.content === "string" ? b.content : JSON.stringify(b.input ?? b.content ?? b);
            if (b.type === "tool_result" || m.role === "tool") sizes.toolResults += text.length;
            else if (m.role === "assistant") sizes.history += text.length;
            else if (text.startsWith("Situation ")) sizes.intention += text.length;
            else if (last || mode === "state") sizes.observation += text.length;
            else sizes.history += text.length;
        }
    });
    return sizes;
}

export function parseJsonArgs(raw: unknown): JsonValue {
    if (raw && typeof raw === "object") return raw as JsonValue;
    if (typeof raw !== "string" || !raw.trim()) return {};
    try {
        return JSON.parse(raw) as JsonValue;
    } catch {
        return {};
    }
}
