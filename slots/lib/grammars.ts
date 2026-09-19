/**
 * The grammars of a slot: how its tools are described to each audience and
 * in each language. They are files, not code, so a reviewer can read and
 * change a wording without touching a behavior:
 *
 *     slots/<slot>/grammars/<agent>/<locale>.json
 *
 * in mcp-core's `McpGrammarData` shape (`tools: { <name>: { title,
 * description, properties: { <field>: <text> } } }`), registered under the
 * resolver key `<agent>:<locale>`. The English wording written in the
 * behavior next to the schema is the baseline every client sees; a file
 * declares only what it changes.
 *
 * mcp-core's server takes the first key of the resolver's chain for which
 * some layer exists and does not cascade between keys, so `<agent>:<locale>`
 * is composed here as `default:<locale>` overlaid with the agent's file: an
 * agent file in French only carries the deltas. Every tool and every field a
 * file names must exist in the slot: a typo is an error at start, not a
 * wording silently ignored.
 *
 * Agent families are matched on `clientInfo.name` (substring, case
 * insensitive); the locale comes from `capabilities.locale` sent by the
 * client (mcp-core's documented extension), then `SLOT_LOCALE`, then `en`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { McpGrammar, type McpTool } from "@cyanmycelium/mcp-core";
import type { GrammarResolverOptions, McpClientCapabilities, McpClientInfo } from "@cyanmycelium/mcp-core";
import { sha256File } from "../../lib/files.js";

export const AGENT_FAMILIES: Record<string, readonly string[]> = {
    nemotron: ["nemotron", "nvidia"],
    gpt: ["gpt", "openai"],
    claude: ["claude", "anthropic"],
    gemini: ["gemini", "google"],
    mistral: ["mistral"],
};
export const DEFAULT_AGENT = "default";
export const DEFAULT_LOCALE = "en";

/** The locale a client asked for: `capabilities.locale`, then the process, then English. */
export function localeOf(_clientInfo: McpClientInfo, capabilities?: McpClientCapabilities): string {
    const asked = (capabilities as { locale?: unknown } | undefined)?.locale;
    if (typeof asked === "string" && asked.trim()) return asked.trim();
    return process.env.SLOT_LOCALE?.trim() || DEFAULT_LOCALE;
}

/** The declarative resolver every slot uses: the same chain for the same client, on every slot. */
export function resolverOptions(): GrammarResolverOptions {
    return { agents: AGENT_FAMILIES, localeSource: localeOf, fallbackKey: `${DEFAULT_AGENT}:${DEFAULT_LOCALE}` };
}

export interface GrammarFile {
    key: string;
    file: string;
    sha256: string;
}
export interface LoadedGrammars {
    /** The composed grammars by resolver key. */
    grammars: Map<string, McpGrammar>;
    /** The files they came from, for the audit trail. */
    files: GrammarFile[];
}

interface GrammarToolEntryJson {
    title?: unknown;
    description?: unknown;
    properties?: Record<string, unknown>;
}
interface GrammarJson {
    tools?: Record<string, GrammarToolEntryJson>;
    resources?: Record<string, unknown>;
    templates?: Record<string, unknown>;
}

/** The property names a schema declares, with dot notation for nested objects, as a grammar names them. */
function schemaPaths(schema: unknown, prefix = ""): string[] {
    const props = (schema as { properties?: Record<string, unknown> } | undefined)?.properties;
    if (!props || typeof props !== "object") return [];
    const out: string[] = [];
    for (const [name, sub] of Object.entries(props)) {
        out.push(prefix + name);
        out.push(...schemaPaths(sub, `${prefix}${name}.`));
        const items = (sub as { items?: unknown } | undefined)?.items;
        if (items) out.push(...schemaPaths(items, `${prefix}${name}.`));
    }
    return out;
}

/** Checks a file against the slot's tools; returns the readable problems. */
export function checkGrammar(json: GrammarJson, tools: ReadonlyArray<McpTool>, file: string): string[] {
    const problems: string[] = [];
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const [name, entry] of Object.entries(json.tools ?? {})) {
        const tool = byName.get(name);
        if (!tool) {
            problems.push(`${file}: tool "${name}" does not exist on this slot`);
            continue;
        }
        if (entry.title !== undefined && typeof entry.title !== "string") problems.push(`${file}: ${name}.title must be a string`);
        if (entry.description !== undefined && typeof entry.description !== "string") problems.push(`${file}: ${name}.description must be a string`);
        const known = new Set(schemaPaths(tool.inputSchema));
        for (const [prop, text] of Object.entries(entry.properties ?? {})) {
            if (!known.has(prop)) problems.push(`${file}: ${name} has no field "${prop}" (fields: ${[...known].join(", ") || "none"})`);
            if (typeof text !== "string") problems.push(`${file}: ${name}.properties.${prop} must be a string`);
        }
    }
    return problems;
}

/**
 * Loads `<dir>/<agent>/<locale>.json` files, checks them against `tools`,
 * and composes the resolver keys. A missing directory is not an error: the
 * slot then speaks its inline English to everyone.
 */
export function loadGrammars(dir: string, tools: ReadonlyArray<McpTool>): LoadedGrammars {
    const raw = new Map<string, { agent: string; locale: string; grammar: McpGrammar }>();
    const files: GrammarFile[] = [];
    const problems: string[] = [];
    if (existsSync(dir)) {
        for (const agent of readdirSync(dir)) {
            const agentDir = path.join(dir, agent);
            if (!statSync(agentDir).isDirectory()) continue;
            if (agent !== DEFAULT_AGENT && !(agent in AGENT_FAMILIES)) problems.push(`${agentDir}: "${agent}" is not an agent family (${DEFAULT_AGENT}, ${Object.keys(AGENT_FAMILIES).join(", ")})`);
            for (const entry of readdirSync(agentDir)) {
                if (!entry.endsWith(".json")) continue;
                const file = path.join(agentDir, entry);
                const locale = entry.slice(0, -".json".length).toLowerCase();
                let json: GrammarJson;
                try {
                    json = JSON.parse(readFileSync(file, "utf8")) as GrammarJson;
                } catch (e) {
                    problems.push(`${file}: ${(e as Error).message}`);
                    continue;
                }
                problems.push(...checkGrammar(json, tools, file));
                const key = `${agent}:${locale}`;
                raw.set(key, { agent, locale, grammar: McpGrammar.fromJSON(json as Parameters<typeof McpGrammar.fromJSON>[0]) });
                files.push({ key, file, sha256: sha256File(file) });
            }
        }
    }
    if (problems.length) throw new Error(`grammar files of ${dir}:\n  ${problems.join("\n  ")}`);
    // Composition: an agent's file sits on the default of the same locale.
    const grammars = new Map<string, McpGrammar>();
    for (const [key, { agent, locale, grammar }] of raw) {
        const base = agent === DEFAULT_AGENT ? undefined : raw.get(`${DEFAULT_AGENT}:${locale}`)?.grammar;
        grammars.set(key, base ? McpGrammar.merge(base, grammar) : grammar);
    }
    files.sort((a, b) => a.key.localeCompare(b.key));
    return { grammars, files };
}

/** The locale part of a resolver key (`claude:fr-ca` -> `fr-ca`), or undefined for a bare agent key. */
export function localeOfKey(key: string): string | undefined {
    const at = key.indexOf(":");
    return at < 0 ? undefined : key.slice(at + 1).replace(/@.*$/, "");
}
