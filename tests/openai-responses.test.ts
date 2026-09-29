/**
 * The Responses API adapter (2026-09-29, the memory's transfer to gpt-5.6-sol): what it sends, the tool call it reads, a call
 * the output limit cut. No network: fetch is replaced.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OpenAiResponsesProvider } from "../harness/providers/openai-responses.js";
import { cutAtOutputLimit } from "../harness/lib/llm-common.js";
import type { PolicyFallbackInput } from "@spiky-panda/harness";

const input = { intention: { id: "i", description: "d" }, state: { id: "s", features: {} }, allowedCapabilities: [{ id: "task.plan", description: "plan", inputSchema: { type: "object" } }], candidates: [], recentFailures: [] } as unknown as PolicyFallbackInput;

async function answer(response: Record<string, unknown>): Promise<{ sent: Record<string, unknown>; provider: OpenAiResponsesProvider; capability: string }> {
    const sent: Array<Record<string, unknown>> = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
        sent.push(JSON.parse(init.body) as Record<string, unknown>);
        return new Response(JSON.stringify(response), { status: 200 });
    }) as unknown as typeof fetch;
    try {
        process.env.TEST_OPENAI_KEY = "k";
        const provider = new OpenAiResponsesProvider({ tier3: { wire: "openai-responses", baseUrl: "http://x", model: "m", apiKey: { env: "TEST_OPENAI_KEY" }, maxTokens: 8192 } }, { systemPrompt: "p", contextMode: "state" });
        const d = await provider.resolve(input);
        return { sent: sent[0], provider, capability: d.invocation.capabilityId };
    } finally {
        globalThis.fetch = real;
    }
}

describe("an OpenAI Responses API reasoner", () => {
    it("sends the prompt as instructions, the tools flat, the output limit, nothing stored; reads the first function call", async () => {
        const { sent, provider, capability } = await answer({ id: "r1", status: "completed", output: [{ type: "reasoning" }, { type: "function_call", name: "task__plan", arguments: "{}", call_id: "c1" }], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } });
        assert.equal(sent.instructions, "p");
        assert.equal(sent.max_output_tokens, 8192);
        assert.equal(sent.store, false);
        assert.equal(sent.tool_choice, "required");
        assert.deepEqual((sent.tools as Array<{ type: string; name: string }>).map((t) => [t.type, t.name]), [["function", "task__plan"]]);
        assert.equal(capability, "task.plan");
        assert.deepEqual(provider.exchanges[0].tokens, { prompt: 10, completion: 5, total: 15 });
    });

    it("an answer cut at the output limit is incomplete for max_output_tokens: never run", async () => {
        const cut = { id: "r2", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [{ type: "function_call", name: "task__plan", arguments: "{\"sel", call_id: "c2" }] };
        assert.equal(cutAtOutputLimit(cut), true);
        const { capability } = await answer(cut);
        assert.notEqual(capability, "task.plan", "the cut call becomes a report, not the call");
    });
});
