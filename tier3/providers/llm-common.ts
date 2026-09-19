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
    const lines = [`Observation at this step (state ${input.state.id}):`, JSON.stringify(f, null, 0)];
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

export function report(message: string): PolicyDecision {
    return { action: { id: "crew.report", description: "report to the crew" }, invocation: { actionId: "crew.report", capabilityId: "crew.report", input: { message } }, rationale: "said in text, without a tool call" };
}

/** Compact JSON for the trace: the request without the schemas repeated at every step. */
export function compactRequest(messages: unknown[], toolNames: string[]): unknown {
    return { messages, tools: toolNames };
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
