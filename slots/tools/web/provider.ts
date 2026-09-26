/**
 * The `web` slot: one governed, provider-neutral search capability for the
 * harness. A profile selects a direct engine or a hosted search tool. Secrets
 * are read from named environment variables and never appear in MCP. The slot
 * always returns ranked results and keeps a bounded audit record. It publishes
 * without credentials so `describe` can explain why calls are unavailable.
 */
import { fromRoot, relativeToRoot } from "../../../lib/paths.js";
import { readJson, sha256File } from "../../../lib/files.js";
import { objectSchema, publishSlot, type PublishedSlot, type SlotTool } from "../../lib/slot-server.js";
import { searchWeb, type WebSearchConfig, type WebSearchProvider, type WebSearchRequest } from "./api.js";

interface WebSearchProfileSettings {
    provider: WebSearchProvider;
    model?: string;
    baseUrl?: string;
    apiKey?: { env?: string };
    searchEngineId?: { env?: string };
    maxTokens?: number;
    timeoutMs?: number;
    maxUses?: number;
    searchContextSize?: "low" | "medium" | "high";
}

export interface WebSearchProfile {
    name?: string;
    webSearch: WebSearchProfileSettings;
}

export interface WebSearchAudit {
    query: string;
    provider: WebSearchProvider;
    model: string | null;
    sources: Array<{ url: string; title?: string }>;
    citations: number;
    searches: number;
    errors: string[];
    latencyMs: number;
    at: string;
}

export interface WebSearchState {
    profileFile: string;
    searches: WebSearchAudit[];
}

const DEFAULT_PROFILE = "profiles/web-search.json";
const HISTORY_LIMIT = 100;

function keyEnvironment(settings: WebSearchProfileSettings): string {
    if (settings.apiKey?.env?.trim()) return settings.apiKey.env.trim();
    if (settings.provider === "brave-search") return "BRAVE_SEARCH_API_KEY";
    if (settings.provider === "google-custom-search") return "GOOGLE_SEARCH_API_KEY";
    if (settings.provider === "anthropic-messages") return "ANTHROPIC_API_KEY";
    return "OPENAI_API_KEY";
}

function engineEnvironment(settings: WebSearchProfileSettings): string {
    return settings.searchEngineId?.env?.trim() || "GOOGLE_SEARCH_ENGINE_ID";
}

function validateProfile(profile: WebSearchProfile, file: string): WebSearchProfileSettings {
    const settings = profile.webSearch;
    if (!settings || typeof settings !== "object") throw new Error(`${file}: webSearch is required`);
    if (!(["brave-search", "google-custom-search", "openai-responses", "anthropic-messages"] as string[]).includes(settings.provider)) {
        throw new Error(`${file}: webSearch.provider must be brave-search, google-custom-search, openai-responses or anthropic-messages`);
    }
    if ((settings.provider === "openai-responses" || settings.provider === "anthropic-messages") && (!settings.model || settings.model.startsWith("<"))) {
        throw new Error(`${file}: hosted web search profiles must name a model, not a placeholder`);
    }
    if (settings.maxTokens !== undefined && (!Number.isInteger(settings.maxTokens) || settings.maxTokens < 128)) throw new Error(`${file}: webSearch.maxTokens must be an integer of at least 128`);
    if (settings.timeoutMs !== undefined && (!Number.isInteger(settings.timeoutMs) || settings.timeoutMs < 1000)) throw new Error(`${file}: webSearch.timeoutMs must be an integer of at least 1000`);
    if (settings.maxUses !== undefined && (!Number.isInteger(settings.maxUses) || settings.maxUses < 1)) throw new Error(`${file}: webSearch.maxUses must be a positive integer`);
    return settings;
}

function runtimeConfig(settings: WebSearchProfileSettings): WebSearchConfig {
    const { apiKey: _apiKey, searchEngineId: _searchEngineId, ...publicSettings } = settings;
    return {
        ...publicSettings,
        apiKey: process.env[keyEnvironment(settings)]?.trim() ?? "",
        ...(settings.provider === "google-custom-search" ? { searchEngineId: process.env[engineEnvironment(settings)]?.trim() ?? "" } : {}),
    };
}

export function webSearchSlot(wsBase: string, log: (line: string) => void): PublishedSlot<WebSearchState> {
    const profileFile = fromRoot(process.env.WEB_SEARCH_PROFILE ?? DEFAULT_PROFILE);
    const profile = readJson<WebSearchProfile>(profileFile);
    const settings = validateProfile(profile, relativeToRoot(profileFile));
    const state: WebSearchState = { profileFile: relativeToRoot(profileFile), searches: [] };
    const tools: SlotTool<WebSearchState>[] = [
        {
            name: "describe",
            inputSchema: objectSchema({}),
            handle: () => {
                const env = keyEnvironment(settings);
                const missing = [!process.env[env]?.trim() ? env : null, settings.provider === "google-custom-search" && !process.env[engineEnvironment(settings)]?.trim() ? engineEnvironment(settings) : null].filter(Boolean);
                const ready = missing.length === 0;
                return {
                    provider: settings.provider,
                    mode: settings.provider === "brave-search" || settings.provider === "google-custom-search" ? "direct-results" : "hosted-answer",
                    model: settings.model ?? null,
                    ready,
                    reason: ready ? null : `environment variable${missing.length > 1 ? "s" : ""} ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not set`,
                    profile: { file: state.profileFile, sha256: sha256File(profileFile) },
                    limits: { maxResults: 10, maxQueryCharacters: 600, timeoutMs: settings.timeoutMs ?? 30_000, maxTokens: settings.model ? settings.maxTokens ?? 2048 : null, maxUses: settings.provider === "anthropic-messages" ? settings.maxUses ?? 5 : null, searchContextSize: settings.provider === "openai-responses" ? settings.searchContextSize ?? "medium" : null },
                };
            },
        },
        {
            name: "search",
            inputSchema: objectSchema(
                {
                    query: { type: "string", minLength: 1, maxLength: 600 },
                    count: { type: "integer", minimum: 1, maximum: 10 },
                    country: { type: "string", minLength: 2, maxLength: 2 },
                    language: { type: "string", minLength: 2, maxLength: 2 },
                    allowed_domains: { type: "array", maxItems: 20, uniqueItems: true, items: { type: "string" } },
                    blocked_domains: { type: "array", maxItems: 20, uniqueItems: true, items: { type: "string" } },
                    user_location: {
                        type: "object",
                        properties: { city: { type: "string" }, region: { type: "string" }, country: { type: "string", minLength: 2, maxLength: 2 }, timezone: { type: "string" } },
                        additionalProperties: false,
                    },
                },
                ["query"],
            ),
            handle: async (args, s) => {
                const result = await searchWeb(runtimeConfig(settings), args as unknown as WebSearchRequest);
                s.searches.push({ query: result.query, provider: result.provider, model: result.model, sources: result.sources, citations: result.citations.length, searches: result.usage.searches, errors: result.errors, latencyMs: result.latencyMs, at: new Date().toISOString() });
                if (s.searches.length > HISTORY_LIMIT) s.searches.splice(0, s.searches.length - HISTORY_LIMIT);
                return result;
            },
        },
    ];

    return publishSlot<WebSearchState>({
        slot: "web",
        tools,
        resources: [{ uri: "web://searches", read: (s) => s.searches }],
        state,
        wsBase,
        log,
        stub: false,
        version: "0.2.0",
        grammarsDir: fromRoot("slots", "tools", "web", "grammars"),
    });
}
