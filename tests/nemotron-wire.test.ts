/**
 * What a reasoning model behind an OpenAI-compatible server does to the harness (2026-10-08, Nemotron on Nebius Token
 * Factory, before the account exists): its thinking left in the content never becomes the answer, a server that refuses
 * `tool_choice: "required"` is asked again with `auto`, and a one-shot text is given the room the profile says. No
 * network: fetch is replaced by what such a server answers.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OpenAiCompatibleProvider } from "../harness/providers/openai-compatible.js";
import { composeText } from "../harness/lib/compose.js";
import { stripReasoning } from "../harness/lib/llm-common.js";
import type { PolicyFallbackInput } from "@spiky-panda/harness";
import type { ProviderProfile } from "../harness/lib/provider.js";

// The key is read when a provider is made: this suite's own, never a real one.
process.env.TEST_NEBIUS_KEY = "k";

const input = { intention: { id: "i", description: "d" }, state: { id: "s", features: {} }, allowedCapabilities: [{ id: "crew.report", description: "report", inputSchema: { type: "object" } }, { id: "scrubber.motor.set_speed", description: "speed", inputSchema: { type: "object" } }], candidates: [], recentFailures: [] } as unknown as PolicyFallbackInput;
const profile: ProviderProfile = { tier3: { wire: "openai-compatible", baseUrl: "http://token-factory.test/v1", model: "nvidia/nemotron-test", apiKey: { env: "TEST_NEBIUS_KEY" }, composeMaxTokens: 1024 } } as ProviderProfile;

/** Replaces fetch for one block: each call gets the next answer; the bodies sent are kept. */
async function withServer<T>(answers: Array<{ status: number; body: unknown }>, run: () => Promise<T>): Promise<{ result: T; sent: Array<Record<string, unknown>> }> {
    const sent: Array<Record<string, unknown>> = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
        sent.push(JSON.parse(init.body) as Record<string, unknown>);
        const a = answers[Math.min(sent.length - 1, answers.length - 1)];
        return new Response(typeof a.body === "string" ? a.body : JSON.stringify(a.body), { status: a.status });
    }) as unknown as typeof fetch;
    process.env.TEST_NEBIUS_KEY = "k";
    try {
        return { result: await run(), sent };
    } finally {
        globalThis.fetch = real;
    }
}

const completion = (content: string | null, call?: { name: string; args: string }) => ({
    choices: [{ message: { content, ...(call ? { tool_calls: [{ id: "c1", type: "function", function: { name: call.name, arguments: call.args } }] } : {}) }, finish_reason: call ? "tool_calls" : "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
});

describe("a reasoning model behind an OpenAI-compatible server", () => {
    it("keeps the thinking out of the answer, closed, unclosed or with its opening tag already stripped", () => {
        assert.equal(stripReasoning("<think>the pumps need power, but four people sleep</think>I will not stop the scrubber."), "I will not stop the scrubber.");
        assert.equal(stripReasoning("<THINK>still thinking when cut"), "");
        assert.equal(stripReasoning("reasoning without its opening tag</think>\n\nThe answer."), "The answer.");
        assert.equal(stripReasoning("A plain answer."), "A plain answer.");
        assert.equal(stripReasoning(null), "");
    });

    it("reports the answer, not the reasoning, when the model calls no tool", async () => {
        const provider = new OpenAiCompatibleProvider(profile, { systemPrompt: "p" });
        const { result } = await withServer([{ status: 200, body: completion("<think>stop it? no: the cabin is occupied</think>I keep the scrubber running.") }], () => provider.resolve(input));
        const exchange = provider.exchanges[0];
        assert.deepEqual(exchange.proposedInput, { message: "I keep the scrubber running." });
        assert.ok(JSON.stringify(result).includes("I keep the scrubber running."));
        assert.ok(!JSON.stringify(result).includes("cabin is occupied"), "the reasoning is not in the decision");
        // The raw response keeps it, for the trace.
        assert.ok(JSON.stringify(exchange.response).includes("cabin is occupied"));
    });

    it("asks again with tool_choice auto when the server refuses required, and keeps auto from then on", async () => {
        const provider = new OpenAiCompatibleProvider(profile, { systemPrompt: "p", contextMode: "state" });
        const refused = { status: 400, body: '{"error":{"message":"tool_choice=required is not supported by this model\'s tool parser"}}' };
        const called = { status: 200, body: completion("<think>40 is above the floor</think>", { name: "scrubber__motor__set_speed", args: '{"percent":40}' }) };
        const first = await withServer([refused, called], () => provider.resolve(input));
        assert.deepEqual(first.sent.map((b) => b.tool_choice), ["required", "auto"]);
        assert.equal(provider.exchanges[0].proposedCapabilityId, "scrubber.motor.set_speed");
        const second = await withServer([called], () => provider.resolve(input));
        assert.deepEqual(second.sent.map((b) => b.tool_choice), ["auto"], "required is not tried again");
    });

    it("gives a one-shot text the room the profile says, and returns it without the reasoning", async () => {
        const { result, sent } = await withServer([{ status: 200, body: completion("<think>a welcome, two lines</think>Good evening. Fifteen slots answer.") }], () => composeText(profile, { instructions: "welcome", maxTokens: 200 }));
        assert.equal(sent[0].max_tokens, 1024, "composeMaxTokens is the least, whatever the caller asked");
        assert.equal(result.text, "Good evening. Fifteen slots answer.");
    });

    it("the Nebius profile names a model and the room a reasoning model needs", () => {
        const p = JSON.parse(readFileSync("profiles/nvidia-nebius.json", "utf8")) as ProviderProfile;
        assert.ok(p.tier3?.model && !p.tier3.model.startsWith("<"), "a model id, not a placeholder");
        assert.equal(p.tier3?.family, "nemotron");
        assert.ok((p.tier3?.maxTokens ?? 0) >= 2048 && (p.tier3?.composeMaxTokens ?? 0) >= 512);
        assert.match(String(p.tier3?.baseUrl), /tokenfactory\.nebius\.com/);
    });
});
