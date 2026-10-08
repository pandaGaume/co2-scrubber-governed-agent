/**
 * Several tool calls in one answer (2026-10-08, harness/lib/call-batch.ts): each is handed to the loop as its own step without
 * asking the model again, the results are buffered, and the model gets them all at once under their call ids. A refusal ends the
 * batch. No network: fetch is replaced by what an OpenAI-compatible server answers.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OpenAiCompatibleProvider } from "../harness/providers/openai-compatible.js";
import type { PolicyFallbackInput } from "@spiky-panda/harness";
import type { ProviderProfile } from "../harness/lib/provider.js";

process.env.TEST_BATCH_KEY = "k";
const profile = { tier3: { wire: "openai-compatible", baseUrl: "http://batch.test/v1", model: "m", apiKey: { env: "TEST_BATCH_KEY" } } } as ProviderProfile;
const tools = [{ id: "library.read", description: "read", inputSchema: { type: "object" } }, { id: "biomed.presence", description: "presence", inputSchema: { type: "object" } }, { id: "procedure.submit", description: "submit", inputSchema: { type: "object" } }];
const step = (features: Record<string, unknown>) => ({ intention: { id: "build", description: "d" }, state: { id: "s", features }, allowedCapabilities: tools, candidates: [], recentFailures: [] }) as unknown as PolicyFallbackInput;
const threeCalls = {
    choices: [{ message: { content: null, tool_calls: [
        { id: "a", type: "function", function: { name: "library__read", arguments: '{"id":"method"}' } },
        { id: "b", type: "function", function: { name: "biomed__presence", arguments: "{}" } },
        { id: "c", type: "function", function: { name: "library__read", arguments: '{"id":"datasheet"}' } },
    ] }, finish_reason: "tool_calls" }],
    usage: { prompt_tokens: 10, completion_tokens: 30 },
};
const done = { choices: [{ message: { content: null, tool_calls: [{ id: "d", type: "function", function: { name: "procedure__submit", arguments: "{}" } }] }, finish_reason: "tool_calls" }] };

/** fetch replaced: each request gets the next answer; the bodies are kept. */
function server(answers: unknown[]): { sent: Array<Record<string, unknown>>; restore(): void } {
    const sent: Array<Record<string, unknown>> = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init: { body: string }) => {
        sent.push(JSON.parse(init.body) as Record<string, unknown>);
        return new Response(JSON.stringify(answers[Math.min(sent.length - 1, answers.length - 1)]), { status: 200 });
    }) as unknown as typeof fetch;
    return { sent, restore: () => (globalThis.fetch = real) };
}

describe("several calls in one answer", () => {
    it("each runs as its own step without asking the model, and the model gets every result at once", async () => {
        const s = server([threeCalls, done]);
        try {
            const p = new OpenAiCompatibleProvider(profile, { systemPrompt: "p" });
            const d1 = await p.resolve(step({ iteration: 0 }));
            assert.equal(d1.invocation.capabilityId, "library.read");
            const d2 = await p.resolve(step({ iteration: 1, lastOutcome: "completed", lastOutput: "the method" }));
            assert.equal(d2.invocation.capabilityId, "biomed.presence");
            const d3 = await p.resolve(step({ iteration: 2, lastOutcome: "completed", lastOutput: "fe-1, fe-2" }));
            assert.deepEqual(d3.invocation.input, { id: "datasheet" });
            assert.equal(s.sent.length, 1, "the model was asked once for the three calls");
            assert.deepEqual(p.exchanges.map((x) => x.batch?.index ?? 1), [1, 2, 3]);
            const d4 = await p.resolve(step({ iteration: 3, lastOutcome: "completed", lastOutput: "flow 1 m3/min" }));
            assert.equal(d4.invocation.capabilityId, "procedure.submit");
            assert.equal(s.sent.length, 2);
            assert.equal(s.sent[0].parallel_tool_calls, true);
            const results = (s.sent[1].messages as Array<{ role: string; tool_call_id?: string; content: string }>).filter((m) => m.role === "tool");
            assert.deepEqual(results.map((m) => [m.tool_call_id, m.content]), [["a", "completed: the method"], ["b", "completed: fe-1, fe-2"], ["c", "completed: flow 1 m3/min"]]);
        } finally {
            s.restore();
        }
    });

    it("in the state mode, where nothing is replayed, the results are said with the next observation", async () => {
        const s = server([threeCalls, done]);
        try {
            const p = new OpenAiCompatibleProvider(profile, { systemPrompt: "p", contextMode: "state" });
            await p.resolve(step({ iteration: 0 }));
            await p.resolve(step({ iteration: 1, lastOutcome: "completed", lastOutput: "the method" }));
            await p.resolve(step({ iteration: 2, lastOutcome: "completed", lastOutput: "fe-1, fe-2" }));
            await p.resolve(step({ iteration: 3, lastOutcome: "completed", lastOutput: "flow 1 m3/min" }));
            const said = JSON.stringify(s.sent[1].messages);
            assert.match(said, /The results of the 3 calls of your last answer/);
            assert.ok(said.includes("the method") && said.includes("fe-1, fe-2") && said.includes("flow 1 m3/min"));
        } finally {
            s.restore();
        }
    });

    it("a refusal ends the batch: the calls after it are not run, the model decides again with the refusal", async () => {
        const s = server([threeCalls, done]);
        try {
            const p = new OpenAiCompatibleProvider(profile, { systemPrompt: "p" });
            await p.resolve(step({ iteration: 0 }));
            await p.resolve(step({ iteration: 1, lastOutcome: "completed", lastOutput: "the method" }));
            // biomed.presence refused by the harness: the state says so in lastRefusal.
            await p.resolve(step({ iteration: 2, lastOutcome: "completed", lastOutput: "the method", lastRefusal: "biomed.presence: not in the step's list" }));
            assert.equal(s.sent.length, 2, "asked again at once");
            const results = (s.sent[1].messages as Array<{ role: string; tool_call_id?: string; content: string }>).filter((m) => m.role === "tool");
            assert.equal(results[1].content, "refused: not in the step's list");
            assert.match(results[2].content, /^not executed: biomed\.presence, before it in the same answer, was refused/);
        } finally {
            s.restore();
        }
    });

    it("an answer cut at the output limit keeps its complete calls and drops the unfinished one", async () => {
        const cut = { choices: [{ message: { content: null, tool_calls: [threeCalls.choices[0].message.tool_calls[0], threeCalls.choices[0].message.tool_calls[1], { id: "c", type: "function", function: { name: "library__read", arguments: '{"id":"data' } }] }, finish_reason: "length" }] };
        const s = server([cut, done]);
        try {
            const p = new OpenAiCompatibleProvider(profile, { systemPrompt: "p" });
            const d1 = await p.resolve(step({ iteration: 0 }));
            assert.equal(d1.invocation.capabilityId, "library.read");
            const d2 = await p.resolve(step({ iteration: 1, lastOutcome: "completed", lastOutput: "x" }));
            assert.equal(d2.invocation.capabilityId, "biomed.presence");
            await p.resolve(step({ iteration: 2, lastOutcome: "completed", lastOutput: "y" }));
            assert.equal(s.sent.length, 2, "two calls run, then the model is asked again");
        } finally {
            s.restore();
        }
    });
});
