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

export const toApiName = (capabilityId: string): string => capabilityId.replace(/\./g, "__").slice(0, 64);
export const fromApiName = (name: string): string => name.replace(/__/g, ".");

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
    lines.push("Choose exactly one tool call now. To speak to the crew, call crew__report; to hand back, call crew__ask.");
    return lines.join("\n");
}

export function intentionText(input: PolicyFallbackInput): string {
    const p = input.intention.parameters ?? {};
    return `Situation "${input.intention.id}" (story minute ${String(p.minute ?? "?")}): ${input.intention.description ?? ""}`;
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

export function truncatedDecision(capabilityId: string): PolicyDecision {
    return report(`My call to ${capabilityId} was cut at the output limit before it was complete; it was not run.`);
}

export function report(message: string): PolicyDecision {
    return { action: { id: "crew.report", description: "report to the crew" }, invocation: { actionId: "crew.report", capabilityId: "crew.report", input: { message } }, rationale: "said in text, without a tool call" };
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
