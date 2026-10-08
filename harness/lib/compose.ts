/**
 * One text from the model, no tools, no conversation: what the station says
 * when it has facts to phrase (a welcome from the boot report). Same profile
 * and same key as the decisions (`tier3.wire`, `tier3.model`), one request,
 * the answer's text back with the model, the latency and the tokens.
 */
import type { ProviderProfile } from "./provider.js";
import { apiKeyFor, stripReasoning } from "./llm-common.js";

export interface Composition {
    text: string;
    model: string;
    wire: string;
    latencyMs: number;
    tokens: { prompt: number; completion: number; total: number } | null;
}

export interface ComposeInput {
    instructions: string;
    context?: string;
    maxTokens?: number;
    timeoutMs?: number;
}

export async function composeText(profile: ProviderProfile | null, input: ComposeInput): Promise<Composition> {
    const p = profile?.tier3;
    if (!p?.model || p.model.startsWith("<")) throw new Error("the profile must name tier3.model");
    const wire = p.wire ?? "openai-compatible";
    // A reasoning model spends tokens thinking before it writes: the profile's `composeMaxTokens` is the least it is given
    // (2026-10-08, Nemotron), whatever the caller asked; the timeout is the profile's when it says one.
    const maxTokens = Math.max(input.maxTokens ?? 300, p.composeMaxTokens ?? 0);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? p.timeoutMs ?? 30000);
    const started = Date.now();
    try {
        if (wire === "anthropic-messages") {
            const baseUrl = (p.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
            // A Claude 5 model always thinks and refuses a fixed temperature, as in providers/anthropic.ts (2026-10-01: HTTP 400 on Sonnet 5.5).
            const thinksAlways = /^claude-(opus-5|sonnet-5|fable|mythos)/.test(p.model);
            const response = await fetch(`${baseUrl}/v1/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-api-key": apiKeyFor(profile, ["ANTHROPIC_API_KEY"]), "anthropic-version": "2023-06-01" },
                body: JSON.stringify({ model: p.model, system: input.instructions, messages: [{ role: "user", content: input.context ?? "Go." }], max_tokens: maxTokens, ...(thinksAlways ? {} : { temperature: 0.4 }) }),
                signal: controller.signal,
            });
            const raw = await response.text();
            if (!response.ok) throw new Error(`${baseUrl} answered HTTP ${response.status}: ${raw.slice(0, 300)}`);
            const r = JSON.parse(raw) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message: string } };
            if (r.error) throw new Error(`model error: ${r.error.message}`);
            const text = (r.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
            const u = r.usage;
            return { text, model: p.model, wire, latencyMs: Date.now() - started, tokens: u ? { prompt: u.input_tokens ?? 0, completion: u.output_tokens ?? 0, total: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) } : null };
        }
        const baseUrl = (p.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1").replace(/\/$/, "");
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKeyFor(profile, ["NEBIUS_API_KEY", "OPENAI_API_KEY"])}` },
            // The output limit under the name the server takes, and a temperature unless the profile says the model takes none.
            body: JSON.stringify({ model: p.model, messages: [{ role: "system", content: input.instructions }, { role: "user", content: input.context ?? "Go." }], [p.maxTokensParam ?? "max_tokens"]: maxTokens, ...(p.temperature === null ? {} : { temperature: p.temperature ?? 0.4 }) }),
            signal: controller.signal,
        });
        const raw = await response.text();
        if (!response.ok) throw new Error(`${baseUrl} answered HTTP ${response.status}: ${raw.slice(0, 300)}`);
        const r = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }; error?: { message: string } };
        if (r.error) throw new Error(`model error: ${r.error.message}`);
        const u = r.usage;
        return { text: stripReasoning(r.choices?.[0]?.message?.content), model: p.model, wire, latencyMs: Date.now() - started, tokens: u ? { prompt: u.prompt_tokens ?? 0, completion: u.completion_tokens ?? 0, total: u.total_tokens ?? 0 } : null };
    } finally {
        clearTimeout(timer);
    }
}
