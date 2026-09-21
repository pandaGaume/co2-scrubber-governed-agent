/**
 * The demo's wording policy, and nothing else: which client name belongs to
 * which model family, and where a session's language comes from. The
 * mechanism (files per audience and language, composition over the default,
 * the check against the slot's tools, the server's own words, the rule that a
 * text lives in one place) is mcp-core's since 1.0.2: `loadGrammarDirectory`
 * in `@cyanmycelium/mcp-core/node`, `withGrammars` and `withWordingRule` on
 * the server builder, the `server` section of a grammar file.
 *
 * The files: `slots/<slot>/grammars/<agent>/<locale>.json`, in mcp-core's
 * `McpGrammarData` shape. A family file carries only what it changes over
 * `default/<locale>.json`.
 *
 * Agent families are matched on `clientInfo.name` (substring, case
 * insensitive); the locale comes from `capabilities.locale` sent by the
 * client (mcp-core's documented extension), then `SLOT_LOCALE`, then `en`.
 */
import type { GrammarResolverOptions, McpClientCapabilities, McpClientInfo } from "@cyanmycelium/mcp-core";

export const AGENT_FAMILIES: Record<string, readonly string[]> = {
    nemotron: ["nemotron", "nvidia"],
    gpt: ["gpt", "openai"],
    claude: ["claude", "anthropic"],
    gemini: ["gemini", "google"],
    mistral: ["mistral"],
};
export const DEFAULT_AGENT = "default";
export const DEFAULT_LOCALE = "en";
export const BASELINE_KEY = `${DEFAULT_AGENT}:${DEFAULT_LOCALE}`;

/** The locale a client asked for: `capabilities.locale`, then the process, then English. */
export function localeOf(_clientInfo: McpClientInfo, capabilities?: McpClientCapabilities): string {
    const asked = (capabilities as { locale?: unknown } | undefined)?.locale;
    if (typeof asked === "string" && asked.trim()) return asked.trim();
    return process.env.SLOT_LOCALE?.trim() || DEFAULT_LOCALE;
}

/** The declarative resolver every slot uses: the same chain for the same client, on every slot. */
export function resolverOptions(): GrammarResolverOptions {
    return { agents: AGENT_FAMILIES, localeSource: localeOf, fallbackKey: BASELINE_KEY };
}

/** The locale of a resolver key (`claude:fr-ca` -> `fr-ca`). */
export const localeOfKey = (key: string): string | undefined => key.split(":")[1];
