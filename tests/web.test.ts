/**
 * The web slot's direct and hosted search wires, without network or API keys.
 * Every fixture must reduce to the same ranked-results contract.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeWebSearchRequest, searchWeb, type FetchLike } from "../slots/tools/web/api.js";

describe("the governed web search adapters", () => {
    it("uses Brave Search directly and returns ranked snippets without a second model", async () => {
        const seen: { request: { url: string; method?: string; headers: Record<string, string>; body: Record<string, unknown> } | null } = { request: null };
        const fetchImpl: FetchLike = async (input, init) => {
            seen.request = { url: String(input), method: init?.method, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> };
            return new Response(
                JSON.stringify({
                    web: {
                        results: [
                            { title: "Current standard", url: "https://example.org/standard", description: "The current value is 42.", page_age: "2026-09-20T10:00:00Z", age: "5 days ago", language: "en", extra_snippets: ["Approved in 2026."] },
                            { title: "Context", url: "https://example.net/context", description: "Background material." },
                        ],
                    },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        };

        const result = await searchWeb(
            { provider: "brave-search", apiKey: "secret", baseUrl: "https://api.search.brave.test/res/v1" },
            { query: "current scrubber standard", count: 2, country: "fr", language: "en", allowed_domains: ["Example.org"], user_location: { city: "Paris", timezone: "Europe/Paris" } },
            fetchImpl,
        );

        const request = seen.request;
        assert.ok(request);
        assert.equal(request.url, "https://api.search.brave.test/res/v1/web/search");
        assert.equal(request.method, "POST");
        assert.equal(request.headers["x-subscription-token"], "secret");
        assert.equal(request.headers["x-loc-city"], "Paris");
        assert.deepEqual(request.body, { q: "current scrubber standard (site:example.org)", count: 2, safesearch: "moderate", text_decorations: false, extra_snippets: true, country: "FR", search_lang: "en" });
        assert.equal(result.answer, null);
        assert.equal(result.model, null);
        assert.deepEqual(result.results, [
            { title: "Current standard", url: "https://example.org/standard", snippet: "The current value is 42.", published_at: "2026-09-20T10:00:00Z", age: "5 days ago", language: "en", extra_snippets: ["Approved in 2026."] },
            { title: "Context", url: "https://example.net/context", snippet: "Background material." },
        ]);
        assert.deepEqual(result.sources, [{ url: "https://example.org/standard", title: "Current standard" }, { url: "https://example.net/context", title: "Context" }]);
        assert.deepEqual(result.usage, { inputTokens: 0, outputTokens: 0, totalTokens: 0, searches: 1 });
    });

    it("supports the legacy Google Custom Search JSON API for existing accounts", async () => {
        const seen: { url: URL | null; method?: string } = { url: null };
        const fetchImpl: FetchLike = async (input, init) => {
            seen.url = new URL(String(input));
            seen.method = init?.method;
            return new Response(
                JSON.stringify({
                    items: [{ title: "Current standard", link: "https://example.org/standard", snippet: "The current value is 42.", pagemap: { metatags: [{ "article:published_time": "2026-09-20" }] } }],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        };

        const result = await searchWeb(
            { provider: "google-custom-search", apiKey: "secret", searchEngineId: "engine-id", baseUrl: "https://customsearch.googleapis.test" },
            { query: "current scrubber standard", count: 3, country: "fr", language: "fr", blocked_domains: ["noise.example"] },
            fetchImpl,
        );

        assert.ok(seen.url);
        assert.equal(seen.url.origin + seen.url.pathname, "https://customsearch.googleapis.test/customsearch/v1");
        assert.equal(seen.method, "GET");
        assert.equal(seen.url.searchParams.get("key"), "secret");
        assert.equal(seen.url.searchParams.get("cx"), "engine-id");
        assert.equal(seen.url.searchParams.get("q"), "current scrubber standard -site:noise.example");
        assert.equal(seen.url.searchParams.get("num"), "3");
        assert.equal(seen.url.searchParams.get("gl"), "fr");
        assert.equal(seen.url.searchParams.get("hl"), "fr");
        assert.equal(seen.url.searchParams.get("lr"), "lang_fr");
        assert.equal(result.answer, null);
        assert.deepEqual(result.results, [{ title: "Current standard", url: "https://example.org/standard", snippet: "The current value is 42.", published_at: "2026-09-20" }]);
    });

    it("uses OpenAI Responses web_search and normalizes citations plus all consulted sources", async () => {
        const seen: { request: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null } = { request: null };
        const fetchImpl: FetchLike = async (input, init) => {
            seen.request = { url: String(input), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> };
            return new Response(
                JSON.stringify({
                    status: "completed",
                    output: [
                        { type: "web_search_call", action: { type: "search", queries: ["current scrubber standard"], sources: [{ url: "https://example.org/standard", title: "Standard" }, { url: "https://example.net/context" }] } },
                        { type: "message", content: [{ type: "output_text", text: "The current value is 42.", annotations: [{ type: "url_citation", url: "https://example.org/standard", title: "Standard", start_index: 21, end_index: 23 }] }] },
                    ],
                    usage: { input_tokens: 120, output_tokens: 30, total_tokens: 150 },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        };

        const result = await searchWeb(
            { provider: "openai-responses", model: "gpt-test", apiKey: "secret", baseUrl: "https://api.openai.test/v1", searchContextSize: "high" },
            { query: "What is current?", allowed_domains: ["Example.org"], user_location: { country: "fr", city: "Paris" } },
            fetchImpl,
        );

        const request = seen.request;
        assert.ok(request);
        assert.equal(request.url, "https://api.openai.test/v1/responses");
        assert.equal(request.headers.Authorization, "Bearer secret");
        assert.equal(request.body.tool_choice, "required");
        assert.deepEqual(request.body.include, ["web_search_call.action.sources"]);
        assert.deepEqual((request.body.tools as Array<Record<string, unknown>>)[0], { type: "web_search", filters: { allowed_domains: ["example.org"] }, user_location: { type: "approximate", country: "FR", city: "Paris" }, search_context_size: "high" });
        assert.equal(result.answer, "The current value is 42.");
        assert.deepEqual(result.results, [{ title: "Standard", url: "https://example.org/standard", snippet: "" }, { title: "https://example.net/context", url: "https://example.net/context", snippet: "" }]);
        assert.deepEqual(result.citations, [{ url: "https://example.org/standard", title: "Standard", start_index: 21, end_index: 23 }]);
        assert.deepEqual(result.sources, [{ url: "https://example.org/standard", title: "Standard" }, { url: "https://example.net/context" }]);
        assert.deepEqual(result.searches, ["current scrubber standard"]);
        assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 30, totalTokens: 150, searches: 1 });
    });

    it("uses Anthropic's hosted web_search and normalizes the same contract", async () => {
        const seen: { request: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null } = { request: null };
        const fetchImpl: FetchLike = async (input, init) => {
            seen.request = { url: String(input), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> };
            return new Response(
                JSON.stringify({
                    stop_reason: "end_turn",
                    content: [
                        { type: "server_tool_use", name: "web_search", input: { query: "current scrubber standard" } },
                        { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://example.org/standard", title: "Standard" }, { type: "web_search_result", url: "https://example.net/context", title: "Context" }] },
                        { type: "text", text: "The current value is 42.", citations: [{ type: "web_search_result_location", url: "https://example.org/standard", title: "Standard", cited_text: "The value is 42." }] },
                    ],
                    usage: { input_tokens: 110, output_tokens: 28, server_tool_use: { web_search_requests: 1 } },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        };

        const result = await searchWeb(
            { provider: "anthropic-messages", model: "claude-test", apiKey: "secret", baseUrl: "https://api.anthropic.test", maxUses: 3 },
            { query: "What is current?", blocked_domains: ["noise.example"], user_location: { timezone: "Europe/Paris" } },
            fetchImpl,
        );

        const request = seen.request;
        assert.ok(request);
        assert.equal(request.url, "https://api.anthropic.test/v1/messages");
        assert.equal(request.headers["x-api-key"], "secret");
        const tool = (request.body.tools as Array<Record<string, unknown>>)[0];
        assert.deepEqual(tool, { type: "web_search_20250305", name: "web_search", max_uses: 3, blocked_domains: ["noise.example"], user_location: { type: "approximate", timezone: "Europe/Paris" } });
        assert.equal(result.answer, "The current value is 42.");
        assert.deepEqual(result.results, [{ title: "Standard", url: "https://example.org/standard", snippet: "The value is 42." }, { title: "Context", url: "https://example.net/context", snippet: "" }]);
        assert.deepEqual(result.citations, [{ url: "https://example.org/standard", title: "Standard", cited_text: "The value is 42." }]);
        assert.deepEqual(result.sources, [{ url: "https://example.org/standard", title: "Standard" }, { url: "https://example.net/context", title: "Context" }]);
        assert.deepEqual(result.searches, ["current scrubber standard"]);
        assert.deepEqual(result.usage, { inputTokens: 110, outputTokens: 28, totalTokens: 138, searches: 1 });
    });

    it("rejects ambiguous filters and malformed domains before any provider call", async () => {
        assert.throws(() => normalizeWebSearchRequest({ query: "x", allowed_domains: ["example.org"], blocked_domains: ["example.net"] }), /cannot be used together/);
        assert.throws(() => normalizeWebSearchRequest({ query: "x", allowed_domains: ["https:\/\/example.org"] }), /bare domain/);
        assert.throws(() => normalizeWebSearchRequest({ query: "x", count: 11 }), /between 1 and 10/);
        assert.throws(() => normalizeWebSearchRequest({ query: "x", language: "french" }), /ISO 639-1/);
        assert.throws(() => normalizeWebSearchRequest({ query: "x", country: "FR", user_location: { country: "US" } }), /must match/);
        let called = false;
        await assert.rejects(
            searchWeb({ provider: "openai-responses", model: "gpt-test", apiKey: "secret" }, { query: "x", blocked_domains: ["bad path"] }, async () => {
                called = true;
                return new Response("{}");
            }),
            /bare domain/,
        );
        assert.equal(called, false);
    });
});
