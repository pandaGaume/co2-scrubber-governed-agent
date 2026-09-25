/**
 * The graphs of the library: reference graphs a harness may choose and
 * instantiate on the twin slot, each with a grammar.
 *
 * A library graph is three files under `graphs/`:
 *
 *   <id>.spikypanda        the document, as the studio and the twin run it;
 *   <id>.template.json     the same graph as a parametric spec: node
 *                          parameters as formulas over a few named
 *                          variables (`{"$expr": "V"}`), the measured
 *                          inputs as telemetry columns (`$series`), the
 *                          initial air from the first reading
 *                          (`$initialMasses`), the persons of the roster
 *                          marked by module; the variables with their
 *                          defaults, bounds and status (known, fitted, a
 *                          band); the settings that shape the structure
 *                          (who is on board); the probes and the columns
 *                          they are judged against;
 *   <id>.grammars/         the words, in mcp-core's own grammar shape and
 *                          loaded by its loader (`loadGrammarDirectory`,
 *                          families overlaid on `default/<locale>`): the
 *                          graph described as a server (what it is, how to
 *                          use it), its instantiation as one tool whose
 *                          properties are the variables and the settings,
 *                          its probes as resources (`probe://<node>.<property>`).
 *                          A wording that names a variable the template
 *                          lacks is refused at load, as a slot's is.
 *
 * The library slot lists them (`library.graphs`, `library.graph`) with the
 * words of the caller's wording key; the graph topic instantiates one
 * (`graph.evaluate` with `graph: "<id>"`) by resolving its template into a
 * spec the twin builds and runs. Nothing here runs a graph: this is the
 * shelf and the reading of what is on it.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { McpGrammar } from "@cyanmycelium/mcp-core";
import { loadGrammarDirectory, type GrammarDirectoryFile } from "@cyanmycelium/mcp-core/node";
import { fromRoot } from "./paths.js";
import { sha256Of } from "../slots/tools/lib/workshop.js";
import { BASELINE_KEY, DEFAULT_LOCALE } from "../slots/lib/grammars.js";

export const GRAPHS_DIR = fromRoot("graphs");
/** The one tool a graph's grammar describes: its instantiation, whose properties are the variables and the settings. */
export const INSTANTIATE_TOOL = "instantiate";
export const PROBE_SCHEME = "probe://";

export type VariableStatus = "known" | "fitted" | "band";

export interface TemplateVariable {
    /** The value the graph takes when the caller says nothing. */
    default: number;
    min?: number;
    max?: number;
    unit?: string;
    /** `known`: documented, held; `fitted`: what only the installation knows, searched; `band`: documented as a band, placed within it. */
    status: VariableStatus;
    /** Where the number or the band comes from (a library document, the commissioning). */
    source?: string;
}

/** A whole number that shapes the structure (how many persons in a module). */
export interface TemplateSetting {
    default: number;
    min?: number;
    max?: number;
}

export interface TemplateProbe {
    node: string;
    property: string;
    unit?: string;
    /** The telemetry column the probe is judged against, when the graph is fitted. */
    column?: string;
}

export interface TemplateNode {
    id: string;
    typeId: string;
    label?: string;
    x?: number;
    y?: number;
    params?: Record<string, unknown>;
    /** A person of the roster: kept while the module's setting counts them (`index` under the setting's value). */
    $person?: { setting: string; index: number };
    /** A crew whose `count` takes what the setting says beyond the roster (`roster` persons are nodes). */
    $unnamed?: { setting: string; roster: number };
}

export interface TemplateSpec {
    nodes: TemplateNode[];
    connections: Array<{ from: [string, string]; to: [string, string] }>;
}

export interface GraphTemplate {
    id: string;
    title: string;
    /** The document this template was built with, relative to the repository. */
    document: string;
    /** The parameter file the numbers come from, relative to the repository. */
    parameters?: string;
    variables: Record<string, TemplateVariable>;
    settings: Record<string, TemplateSetting>;
    probes: TemplateProbe[];
    spec: TemplateSpec;
}

/** The words of a graph for one wording key: what mcp-core's grammar holds, read back by name. */
export interface GraphWords {
    key: string;
    description: string;
    instructions: string;
    title: string;
    /** One line per variable and per setting, by name. */
    properties: Record<string, string>;
    /** One name and one line per probe, by `node.property`. */
    probes: Record<string, { name: string; description: string }>;
}

export interface GraphLibraryEntry {
    template: GraphTemplate;
    templateFile: string;
    templateSha256: string;
    documentFile: string;
    documentSha256: string | null;
    grammars: Map<string, McpGrammar>;
    grammarFiles: GrammarDirectoryFile[];
    problems: string[];
}

/** A resolved spec: what the twin builds, with the variables the caller did not name at their defaults. */
export interface InstantiatedGraph {
    spec: { nodes: Array<{ id: string; typeId: string; label?: string; x?: number; y?: number; params?: Record<string, unknown> }>; connections: TemplateSpec["connections"] };
    variables: Record<string, number>;
    settings: Record<string, number>;
    /** The variables the caller did not name, taken at their defaults. */
    defaulted: string[];
    compare: Array<{ node: string; property: string; column: string }>;
}

const probeUri = (p: { node: string; property: string }) => `${PROBE_SCHEME}${p.node}.${p.property}`;

/** The surface a graph's grammar must describe: one tool with the variables and the settings as properties, the probes as resources. */
export function surfaceOf(template: GraphTemplate): { tools: Array<{ name: string; inputSchema: unknown }>; resources: Array<{ uri: string }> } {
    const properties: Record<string, unknown> = {};
    for (const name of Object.keys(template.variables)) properties[name] = { type: "number" };
    for (const name of Object.keys(template.settings)) properties[name] = { type: "number" };
    return { tools: [{ name: INSTANTIATE_TOOL, inputSchema: { type: "object", properties } }], resources: template.probes.map((p) => ({ uri: probeUri(p) })) };
}

/** Every graph of the shelf: a template, its document, its grammars checked against its surface. */
export function loadGraphLibrary(dir: string = GRAPHS_DIR): GraphLibraryEntry[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith(".template.json"))
        .sort()
        .map((file) => {
            const templateFile = path.join(dir, file);
            const bytes = readFileSync(templateFile);
            const template = JSON.parse(bytes.toString("utf8")) as GraphTemplate;
            const id = template.id ?? file.replace(/\.template\.json$/, "");
            template.id = id;
            template.variables ??= {};
            template.settings ??= {};
            template.probes ??= [];
            const documentFile = path.join(dir, `${id}.spikypanda`);
            const grammarsDir = path.join(dir, `${id}.grammars`);
            const loaded = loadGrammarDirectory(grammarsDir, { surface: surfaceOf(template), referenceLocale: DEFAULT_LOCALE, tolerate: true });
            const problems = [...loaded.problems];
            if (!loaded.grammars.has(BASELINE_KEY)) problems.push(`${path.relative(fromRoot(), grammarsDir).split(path.sep).join("/")}/default/${DEFAULT_LOCALE}.json: a library graph comes with its words; none found`);
            return {
                template,
                templateFile,
                templateSha256: sha256Of(bytes),
                documentFile,
                documentSha256: existsSync(documentFile) ? sha256Of(readFileSync(documentFile)) : null,
                grammars: loaded.grammars,
                grammarFiles: loaded.files,
                problems,
            };
        });
}

/** The wording keys to try for a caller's key: the key itself, then the default family of its locale, then the baseline. */
export function wordingChain(key: string | null | undefined): string[] {
    const chain: string[] = [];
    if (key) {
        chain.push(key);
        const locale = key.split(":")[1];
        if (locale) chain.push(`default:${locale}`, `default:${locale.split("-")[0]}`);
    }
    chain.push(BASELINE_KEY);
    return [...new Set(chain)];
}

/** The words of a graph for a caller: the first wording of the chain the graph holds, its gaps filled from the baseline (mcp-core composes families over the default; the baseline is the last resort). */
export function wordsOf(entry: GraphLibraryEntry, key: string | null | undefined): GraphWords {
    const chain = wordingChain(key);
    const found = chain.find((k) => entry.grammars.has(k)) ?? BASELINE_KEY;
    const grammar = entry.grammars.get(found);
    const baseline = entry.grammars.get(BASELINE_KEY);
    const pick = <T>(read: (g: McpGrammar) => T | undefined): T | undefined => (grammar && read(grammar)) ?? (baseline && read(baseline));
    const properties: Record<string, string> = {};
    for (const name of [...Object.keys(entry.template.variables), ...Object.keys(entry.template.settings)]) properties[name] = pick((g) => g.getPropertyDescription(INSTANTIATE_TOOL, name)) ?? "";
    const probes: Record<string, { name: string; description: string }> = {};
    for (const p of entry.template.probes) {
        const uri = probeUri(p);
        probes[`${p.node}.${p.property}`] = { name: pick((g) => g.getResourceName(uri)) ?? uri, description: pick((g) => g.getResourceDescription(uri)) ?? "" };
    }
    return {
        key: found,
        description: pick((g) => g.getServerDescription()) ?? entry.template.title,
        instructions: pick((g) => g.getServerInstructions()) ?? "",
        title: pick((g) => g.getToolTitle(INSTANTIATE_TOOL)) ?? entry.template.title,
        properties,
        probes,
    };
}

/** What a caller sees of the shelf: each graph with its words, its variables and settings, its probes; never the spec. */
export function describeGraph(entry: GraphLibraryEntry, key: string | null | undefined): Record<string, unknown> {
    const words = wordsOf(entry, key);
    const t = entry.template;
    return {
        id: t.id,
        title: t.title,
        description: words.description,
        instructions: words.instructions,
        wording: words.key,
        document: { file: t.document, sha256: entry.documentSha256 },
        template: { file: path.relative(fromRoot(), entry.templateFile).split(path.sep).join("/"), sha256: entry.templateSha256 },
        nodes: t.spec.nodes.length,
        connections: t.spec.connections.length,
        types: [...new Set(t.spec.nodes.map((n) => n.typeId))].sort(),
        variables: Object.fromEntries(Object.entries(t.variables).map(([name, v]) => [name, { ...v, description: words.properties[name] ?? "" }])),
        settings: Object.fromEntries(Object.entries(t.settings).map(([name, s]) => [name, { ...s, description: words.properties[name] ?? "" }])),
        probes: t.probes.map((p) => ({ ...p, ...(words.probes[`${p.node}.${p.property}`] ?? {}) })),
        ...(entry.problems.length ? { problems: entry.problems } : {}),
    };
}

/**
 * The template as a spec the twin builds: the settings applied to the
 * structure (the persons of the roster kept while their module's setting
 * counts them, the crew's count taking the rest), the variables the caller
 * did not name at their defaults. The formulas stay formulas: the harness
 * resolves them at each trial (`params.ts`).
 */
export function instantiateTemplate(template: GraphTemplate, given: { variables?: Record<string, number>; settings?: Record<string, number> } = {}): InstantiatedGraph {
    const settings: Record<string, number> = {};
    for (const [name, s] of Object.entries(template.settings)) {
        const raw = given.settings?.[name];
        const value = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : s.default;
        if ((s.min !== undefined && value < s.min) || (s.max !== undefined && value > s.max)) throw new Error(`setting "${name}" = ${value} is outside ${s.min ?? "-inf"} to ${s.max ?? "inf"}`);
        settings[name] = value;
    }
    for (const name of Object.keys(given.settings ?? {})) if (!(name in template.settings)) throw new Error(`no setting "${name}" on graph "${template.id}" (${Object.keys(template.settings).join(", ") || "none"})`);
    const variables: Record<string, number> = {};
    const defaulted: string[] = [];
    for (const [name, v] of Object.entries(template.variables)) {
        const raw = given.variables?.[name];
        if (typeof raw === "number" && Number.isFinite(raw)) variables[name] = raw;
        else {
            variables[name] = v.default;
            defaulted.push(name);
        }
    }
    // A variable the caller names that the template lacks is kept: a formula may still use it (a candidate's own addition).
    for (const [name, value] of Object.entries(given.variables ?? {})) if (!(name in variables) && Number.isFinite(value)) variables[name] = value;
    const kept = new Set<string>();
    const nodes = template.spec.nodes
        .filter((n) => {
            if (n.$person) {
                const count = settings[n.$person.setting];
                if (count === undefined) throw new Error(`node "${n.id}" is a person under setting "${n.$person.setting}", which the template does not declare`);
                if (n.$person.index >= count) return false;
            }
            kept.add(n.id);
            return true;
        })
        .map((n) => {
            const { $person, $unnamed, ...node } = n;
            void $person;
            if ($unnamed) {
                const count = settings[$unnamed.setting];
                if (count === undefined) throw new Error(`node "${n.id}" counts the unnamed under setting "${$unnamed.setting}", which the template does not declare`);
                node.params = { ...(node.params ?? {}), count: Math.max(0, count - $unnamed.roster) };
            }
            return node;
        });
    const connections = template.spec.connections.filter((c) => kept.has(c.from[0]) && kept.has(c.to[0]));
    const compare = template.probes.filter((p): p is TemplateProbe & { column: string } => typeof p.column === "string" && p.column.length > 0).map((p) => ({ node: p.node, property: p.property, column: p.column }));
    return { spec: { nodes, connections }, variables, settings, defaulted, compare };
}
