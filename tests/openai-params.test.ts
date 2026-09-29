/**
 * What an OpenAI-compatible provider sends, as its profile says (2026-09-29: a recent OpenAI model takes max_completion_tokens
 * and no temperature of ours; a model that reasons long is not cut by the harness's clock). No network: fetch is replaced.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OpenAiCompatibleProvider } from "../harness/providers/openai-compatible.js";
import type { PolicyFallbackInput } from "@spiky-panda/harness";

const input = { intention: { id: "i", description: "d" }, state: { id: "s", features: {} }, allowedCapabilities: [{ id: "task.plan", description: "plan", inputSchema: { type: "object" } }], candidates: [], recentFailures: [] } as unknown as PolicyFallbackInput;

async function bodyFor(tier3: Record<string, unknown>): Promise<Record<string, unknown>> {
    const sent: Array<Record<string, unknown>> = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
        sent.push(JSON.parse(init.body) as Record<string, unknown>);
        return new Response(JSON.stringify({ choices: [{ message: { content: "", tool_calls: [{ id: "c", type: "function", function: { name: "task__plan", arguments: "{}" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
        process.env.TEST_OPENAI_KEY = "k";
        await new OpenAiCompatibleProvider({ tier3: { wire: "openai-compatible", baseUrl: "http://x", model: "m", apiKey: { env: "TEST_OPENAI_KEY" }, ...tier3 } }, { systemPrompt: "p", contextMode: "state" }).resolve(input);
    } finally {
        globalThis.fetch = real;
    }
    return sent[0];
}

describe("an OpenAI-compatible provider sends what its profile says", () => {
    it("max_tokens and a temperature of 0.2 by default; max_completion_tokens and no temperature when the profile says so", async () => {
        const plain = await bodyFor({ maxTokens: 8192 });
        assert.equal(plain.max_tokens, 8192);
        assert.equal(plain.temperature, 0.2);
        const recent = await bodyFor({ maxTokens: 8192, maxTokensParam: "max_completion_tokens", temperature: null });
        assert.equal(recent.max_completion_tokens, 8192);
        assert.equal("max_tokens" in recent, false);
        assert.equal("temperature" in recent, false);
    });
});
