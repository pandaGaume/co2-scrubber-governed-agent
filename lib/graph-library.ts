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
 *
 * Two things a caller changes on a graph without touching its structure
 * (2026-09-25, evening):
 *
 *   the device's parameters   a variable bound to a device (`device: { type,
 *                             property }`) takes its value from the descriptor
 *                             of the registered device of that type, when the
 *                             caller hands the register's devices over: the
 *                             twin of a scrubber is the reference with that
 *                             scrubber's numbers, not the datasheet's default;
 *   who is on board           `persons` replaces the roster: each person by
 *                             module and activity, a node each, wired into the
 *                             crew of their module; the settings follow.
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

export type VariableStatus = "known" | "fitted" | "band" | "device";

/** Where a variable's value comes from when the caller hands the register's devices over: the descriptor of the device of that `@type`, its property's value, scaled. */
export interface DeviceBinding {
    type: string;
    property: string;
    /** The value as the descriptor gives it, times this (a flow in m3/s into m3/min: 60). */
    scale?: number;
}

/** A registered device as the station's register lists it: what a binding reads. */
export interface DeviceLike {
    path: string;
    descriptor: { "@type": string; properties: Record<string, { value?: unknown; unit?: string }> };
}

/** Someone on board, as a caller states them: the module they are in and what they do; the name and callsign when known. */
export interface PersonSpec {
    id?: string;
    callsign?: string;
    name?: string;
    module: string;
    activity: string;
}

export interface TemplateVariable {
    /** The value the graph takes when the caller says nothing. */
    default: number;
    min?: number;
    max?: number;
    unit?: string;
    /** `known`: documented, held; `fitted`: what only the installation knows, searched; `band`: documented as a band, placed within it; `device`: the registered device's own number, held. */
    status: VariableStatus;
    /** Where the number or the band comes from (a library document, the commissioning). */
    source?: string;
    /** For a `device` variable: which device property gives it. */
    device?: DeviceBinding;
}

/** A whole number that shapes the structure (how many persons in a module). */
export interface TemplateSetting {
    default: number;
    min?: number;
    max?: number;
    /** The module this setting counts the people of (`lab`, `habB`), so a person given by module finds their setting. */
    module?: string;
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
    /** A person of the roster: kept while the module's setting counts them (`index` under the setting's value); the prototype of a person given for that module. */
    $person?: { setting: string; index: number; module?: string };
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
    /** The variables a registered device gave, and which. */
    fromDevice: Record<string, { path: string; property: string; value: number }>;
    /** Who is on board in this instance, by module. */
    persons: PersonSpec[];
    compare: Array<{ node: string; property: string; column: string }>;
}

export interface InstantiateOptions {
    variables?: Record<string, number>;
    settings?: Record<string, number>;
    /** Who is on board, replacing the roster: the settings follow the count per module. */
    persons?: PersonSpec[];
    /** The register's devices: a device-bound variable takes its value from the device of its type. */
    devices?: DeviceLike[];
}

/** The module a setting counts: its `module`, or the setting's own name without `Occupants` (`labOccupants` -> `lab`). */
const moduleOfSetting = (name: string, s: TemplateSetting): string => s.module ?? name.replace(/Occupants$/, "");

/** The setting a module's people are counted under, by module name (`lab`, `habB`, `hab-b`: the dash and the case do not matter). */
function settingOfModule(template: GraphTemplate, module: string): string | undefined {
    const wanted = module.toLowerCase().replace(/[^a-z0-9]/g, "");
    return Object.entries(template.settings).find(([name, s]) => moduleOfSetting(name, s).toLowerCase().replace(/[^a-z0-9]/g, "") === wanted)?.[0];
}

/** The number a device's descriptor gives for a binding, and which device: the first registered device of that type that carries the property. */
export function deviceValueOf(binding: DeviceBinding, devices: ReadonlyArray<DeviceLike>): { path: string; property: string; value: number } | undefined {
    for (const d of devices) {
        if (d.descriptor?.["@type"] !== binding.type) continue;
        const raw = d.descriptor.properties?.[binding.property]?.value;
        if (typeof raw === "number" && Number.isFinite(raw)) return { path: d.path, property: binding.property, value: raw * (binding.scale ?? 1) };
    }
    return undefined;
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
export function instantiateTemplate(template: GraphTemplate, given: InstantiateOptions = {}): InstantiatedGraph {
    for (const name of Object.keys(given.settings ?? {})) if (!(name in template.settings)) throw new Error(`no setting "${name}" on graph "${template.id}" (${Object.keys(template.settings).join(", ") || "none"})`);
    // Who is on board, when the caller says: each person under the setting of their module; the counts follow.
    const persons: Array<PersonSpec & { setting: string }> = [];
    if (given.persons) {
        if (!Array.isArray(given.persons)) throw new Error("persons is a list of { module, activity } (id, callsign and name when known)");
        for (const [i, p] of given.persons.entries()) {
            if (!p || typeof p.module !== "string" || typeof p.activity !== "string") throw new Error(`persons[${i}]: a module and an activity are needed`);
            const setting = settingOfModule(template, p.module);
            if (!setting) throw new Error(`persons[${i}]: no module "${p.module}" on graph "${template.id}" (${Object.entries(template.settings).map(([n, s]) => moduleOfSetting(n, s)).join(", ") || "none"})`);
            persons.push({ ...p, setting });
        }
    }
    const settings: Record<string, number> = {};
    for (const [name, s] of Object.entries(template.settings)) {
        const raw = given.persons ? persons.filter((p) => p.setting === name).length : given.settings?.[name];
        const value = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : s.default;
        if ((s.min !== undefined && value < s.min) || (s.max !== undefined && value > s.max)) throw new Error(`setting "${name}" = ${value} is outside ${s.min ?? "-inf"} to ${s.max ?? "inf"}`);
        settings[name] = value;
    }
    const variables: Record<string, number> = {};
    const defaulted: string[] = [];
    const fromDevice: InstantiatedGraph["fromDevice"] = {};
    for (const [name, v] of Object.entries(template.variables)) {
        const raw = given.variables?.[name];
        if (typeof raw === "number" && Number.isFinite(raw)) {
            variables[name] = raw;
            continue;
        }
        // The registered device's own number, when the caller hands the register over and the variable is bound to a device.
        const read = v.device && given.devices ? deviceValueOf(v.device, given.devices) : undefined;
        if (read) {
            variables[name] = read.value;
            fromDevice[name] = read;
        } else {
            variables[name] = v.default;
            defaulted.push(name);
        }
    }
    // A variable the caller names that the template lacks is kept: a formula may still use it (a candidate's own addition).
    for (const [name, value] of Object.entries(given.variables ?? {})) if (!(name in variables) && Number.isFinite(value)) variables[name] = value;
    const kept = new Set<string>();
    const rosterNodes = template.spec.nodes.filter((n) => n.$person);
    const rosterIds = new Set(rosterNodes.map((n) => n.id));
    const nodes: InstantiatedGraph["spec"]["nodes"] = template.spec.nodes
        .filter((n) => {
            if (n.$person) {
                if (given.persons) return false; // the roster gives way to the persons given, rebuilt below
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
                // With persons given, everyone is a node: nobody unnamed; otherwise the setting beyond the roster.
                node.params = { ...(node.params ?? {}), count: given.persons ? 0 : Math.max(0, count - $unnamed.roster) };
            }
            return node;
        });
    const connections = template.spec.connections.filter((c) => kept.has(c.from[0]) && kept.has(c.to[0]));
    const onBoard: PersonSpec[] = [];
    if (given.persons) {
        // Each person given: a node cloned from the roster's prototype for their module, wired into the same crew, at the next index of its pool.
        const wired: Record<string, number> = {};
        for (const [i, p] of persons.entries()) {
            const prototype = rosterNodes.find((n) => n.$person!.setting === p.setting);
            if (!prototype) throw new Error(`persons[${i}]: graph "${template.id}" has no person to model in module "${p.module}"`);
            const link = template.spec.connections.find((c) => c.from[0] === prototype.id);
            if (!link) throw new Error(`persons[${i}]: the roster's "${prototype.id}" is wired nowhere`);
            const crew = link.to[0];
            const k = wired[crew] ?? 0;
            wired[crew] = k + 1;
            const id = `person-${(p.id ?? p.callsign ?? `${moduleOfSetting(p.setting, template.settings[p.setting])}-${k + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            if (nodes.some((n) => n.id === id)) throw new Error(`persons[${i}]: "${id}" is on board twice`);
            const { $person, $unnamed, ...proto } = prototype;
            void $person;
            void $unnamed;
            const who: PersonSpec = { id: id.replace(/^person-/, ""), callsign: p.callsign ?? "", name: p.name ?? "", module: moduleOfSetting(p.setting, template.settings[p.setting]), activity: p.activity };
            nodes.push({ ...proto, id, label: `${who.callsign} ${who.name}`.trim() || id, y: (proto.y ?? 0) + 110 * k, params: { ...(proto.params ?? {}), name: who.name, callsign: who.callsign, activity: who.activity } });
            connections.push({ from: [id, link.from[1]], to: [crew, `${link.to[1].replace(/\d+$/, "")}${k}`] });
            onBoard.push(who);
        }
    } else {
        for (const n of rosterNodes) {
            if (!kept.has(n.id)) continue;
            const params = n.params ?? {};
            onBoard.push({ id: n.id.replace(/^person-/, ""), callsign: String(params.callsign ?? ""), name: String(params.name ?? ""), module: moduleOfSetting(n.$person!.setting, template.settings[n.$person!.setting]), activity: String(params.activity ?? "") });
        }
        for (const [name, count] of Object.entries(settings)) {
            const unnamed = count - rosterNodes.filter((n) => n.$person!.setting === name).length;
            const crew = template.spec.nodes.find((n) => n.$unnamed?.setting === name);
            for (let k = 0; k < unnamed; k++) onBoard.push({ module: moduleOfSetting(name, template.settings[name]), activity: String(crew?.params?.activity ?? "") });
        }
    }
    void rosterIds;
    const compare = template.probes.filter((p): p is TemplateProbe & { column: string } => typeof p.column === "string" && p.column.length > 0).map((p) => ({ node: p.node, property: p.property, column: p.column }));
    return { spec: { nodes, connections }, variables, settings, defaulted, fromDevice, persons: onBoard, compare };
}
