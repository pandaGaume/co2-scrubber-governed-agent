/**
 * A tool's answer as the model reads it: compact. The full answer stays in
 * the task's workshop (`results/step-<n>-<capability>.json`, written by the
 * runner when it is long) and the model gets its handle beside a summary
 * it can reason on; what it needs in full it reads back (`workspace.read`
 * on the handle). Nothing is lost, and the model's context no longer
 * carries every page of every document it opened.
 *
 * The compactors know the demo's tools: a document of the library is its
 * id, title and size; the shelf is each graph's variables with their status;
 * a template is its variables, settings and probes, never its spec; the
 * catalogue's search is the type ids with one line each; an evaluation is
 * its verdict, its residuals, its variables and where the curves part, the
 * best trials down to three. Anything else keeps its whole answer under a
 * size, its head above it.
 */
import type { JsonValue } from "@spiky-panda/harness";

/** Above this many characters a full answer goes to the workshop and the model gets a summary and the handle. */
export const COMPACT_ABOVE = 1500;
/** What a summary may weigh at most, characters of JSON. */
export const SUMMARY_LIMIT = 2200;

export interface CompactResult {
    /** What the model reads. */
    summary: JsonValue;
    /** Characters of the full answer as JSON. */
    bytes: number;
    /** True when the summary is not the whole answer: the runner stores the answer and adds its handle. */
    reduced: boolean;
}

const size = (v: unknown): number => {
    try {
        return JSON.stringify(v)?.length ?? 0;
    } catch {
        return 0;
    }
};

const head = (text: string, n: number): string => (text.length <= n ? text : `${text.slice(0, n)}... (${text.length.toLocaleString("en-US")} characters in all)`);

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const value = (output: unknown): unknown => {
    const o = obj(output);
    return "value" in o && o.outcome !== undefined ? o.value : output;
};
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
const num = (v: unknown, digits = 4): unknown => (typeof v === "number" && Number.isFinite(v) ? Number(v.toPrecision(digits)) : v);

/** The compactors by capability id (or its slot and tool); each returns what the model reads. */
const COMPACTORS: Record<string, (v: unknown, input: JsonValue) => JsonValue> = {
    "workspace.read": (v, input) => {
        const o = obj(v);
        const path = String((input as Obj)?.path ?? "");
        const text = typeof o.text === "string" ? o.text : "";
        // A JSON file is read for its shape, not its bytes; a text file for its first lines.
        let parsed: unknown = null;
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = null;
        }
        const shape = parsed && typeof parsed === "object" ? (Array.isArray(parsed) ? `an array of ${parsed.length} item(s); first: ${head(JSON.stringify(parsed[0] ?? null), 300)}` : `an object with keys ${Object.keys(parsed as Obj).join(", ")}`) : head(text, 600);
        return { path, sha256: o.sha256 ?? null, bytes: text.length, content: shape, note: "the whole file is in the task's workshop; the harness already put what it holds into the state (task, telemetry, shelf); read it again only for a detail the state does not give" } as JsonValue;
    },
    "workspace.list": (v) => {
        const files = list(obj(v).files);
        return { files: files.map((f) => `${String(f.path)} (${String(f.bytes)} bytes)`) } as JsonValue;
    },
    "library.list": (v) => ({ documents: list(obj(v).documents).map((d) => `${String(d.id)}: ${String(d.title)}${Array.isArray(d.measures) && d.measures.length ? ` [measures ${(d.measures as string[]).join(", ")}]` : ""}`) }) as JsonValue,
    "library.methods": (v) => ({ quantity: obj(v).quantity, methods: list(obj(v).methods).map((d) => `${String(d.id)}: ${String(d.title)}`) }) as JsonValue,
    "library.search": (v) => ({ results: list(obj(v).results).map((r) => ({ id: r.id, title: r.title, score: r.score, lines: (Array.isArray(r.lines) ? (r.lines as string[]) : []).slice(0, 3).map((l) => head(l, 160)) })) }) as JsonValue,
    "library.read": (v) => {
        const o = obj(v);
        const text = typeof o.text === "string" ? o.text : "";
        return { id: o.id, title: o.title, sha256: o.sha256, bytes: text.length, text: head(text, 1400), note: "the document whole is at the handle; its numbers with their units are what to keep" } as JsonValue;
    },
    "library.graphs": (v) => ({
        graphs: list(obj(v).graphs).map((g) => ({
            id: g.id,
            description: head(String(g.description ?? ""), 300),
            instructions: head(String(g.instructions ?? ""), 400),
            nodes: g.nodes,
            variables: Object.fromEntries(Object.entries(obj(g.variables)).map(([k, x]) => [k, `${String(obj(x).status)}${obj(x).default !== undefined ? `, default ${String(obj(x).default)}` : ""}${obj(x).min !== undefined ? `, ${String(obj(x).min)} to ${String(obj(x).max)}` : ""}${obj(x).unit ? ` ${String(obj(x).unit)}` : ""}`])),
            settings: Object.fromEntries(Object.entries(obj(g.settings)).map(([k, x]) => [k, `default ${String(obj(x).default)}${obj(x).module ? ` (${String(obj(x).module)})` : ""}`])),
            probes: list(g.probes).filter((p) => p.column).map((p) => `${String(p.node)}.${String(p.property)} against ${String(p.column)}`),
        })),
    }) as JsonValue,
    "library.graph": (v) => {
        const o = obj(v);
        const t = obj(o.template);
        return {
            id: o.id,
            description: head(String(o.description ?? ""), 300),
            instructions: head(String(o.instructions ?? ""), 500),
            variables: Object.fromEntries(Object.entries(obj(o.variables)).map(([k, x]) => [k, { status: obj(x).status, default: obj(x).default, ...(obj(x).min !== undefined ? { min: obj(x).min, max: obj(x).max } : {}), ...(obj(x).unit ? { unit: obj(x).unit } : {}), description: head(String(obj(x).description ?? ""), 160) }])),
            settings: o.settings,
            probes: list(o.probes).map((p) => ({ node: p.node, property: p.property, column: p.column ?? null, name: p.name })),
            spec: { nodes: list(obj(t.spec).nodes).length, connections: list(obj(t.spec).connections).length, note: "the parametric spec is at the handle; graph.evaluate with graph: id instantiates it" },
        } as JsonValue;
    },
    "twin.registry_search": (v) => ({ matches: list(obj(v).matches).map((m) => `${String(m.type)}: ${head(String(obj(m.signature).purpose ?? m.label ?? ""), 140)}`) }) as JsonValue,
    "twin.registry_list_nodes": (v) => ({ types: list(obj(v).types ?? obj(v).nodes).map((m) => String(m.type ?? m.id)) }) as JsonValue,
    "twin.registry_describe_node": (v) => {
        const o = obj(v);
        const s = obj(o.signature);
        const ports = (side: unknown) => Object.fromEntries(Object.entries(obj(side)).map(([k, x]) => [k, `${String(obj(x).quantity ?? "")}${obj(x).unit ? ` ${String(obj(x).unit)}` : ""}`]));
        return { type: o.type, purpose: head(String(s.purpose ?? ""), 300), inputs: ports(s.inputs), outputs: ports(s.outputs), capabilities: s.capabilities } as JsonValue;
    },
    "graph.evaluate": (v) => {
        const o = obj(v);
        return {
            candidate: o.candidate,
            path: o.path,
            status: o.status,
            pass: o.pass,
            diagnosis: o.diagnosis,
            threshold: o.threshold,
            residuals: list(o.residuals).map((r) => ({ column: r.column, rmse: num(r.rmse, 3), worst: num(r.worst, 3), worstMinute: r.worstMinute })),
            variables: Object.fromEntries(Object.entries(obj(o.variables)).map(([k, x]) => [k, num(x)])),
            ...(o.defaulted ? { defaulted: o.defaulted } : {}),
            ...(o.fromDevice ? { fromDevice: Object.fromEntries(Object.entries(obj(o.fromDevice)).map(([k, x]) => [k, num(obj(x).value)])) } : {}),
            ...(o.atBounds ? { atBounds: o.atBounds } : {}),
            ...(o.identifiability ? { identifiability: o.identifiability } : {}),
            ...(o.diagnostics ? { diagnostics: o.diagnostics } : {}),
            ...(o.firstSlope ? { firstSlope: o.firstSlope } : {}),
            ...(o.warnings ? { warnings: o.warnings } : {}),
            calibration: o.calibration,
            validation: o.validation,
            profile: list(o.profile)
                .filter((_, i, a) => i % 2 === 0 || i === a.length - 1)
                .map((p) => `${String(p.minute)}: ${String(p.predicted)} vs ${String(p.measured)}`),
            bestTrials: list(o.bestCombinations).slice(0, 3).map((t) => ({ score: num(t.score, 3), variables: Object.fromEntries(Object.entries(obj(t.variables)).map(([k, x]) => [k, num(x)])) })),
            runs: o.runs,
        } as unknown as JsonValue;
    },
    "factory.inventory": (v) => {
        const o = obj(v);
        return { lines: o.lines, volumes: list(o.volumes).map((x) => String(x.path)), openings: o.openings, unknowns: list(o.unknowns).map((u) => `${String(u.what)} (${String(u.how)})`) } as JsonValue;
    },
};

/** The answer as the model reads it, and whether it was reduced. */
export function compactOutput(capabilityId: string, input: JsonValue, output: unknown): CompactResult {
    const bytes = size(output);
    const inner = value(output);
    const compactor = COMPACTORS[capabilityId];
    if (compactor) {
        try {
            const summary = compactor(inner, input);
            const s = size(summary);
            return { summary: s > SUMMARY_LIMIT ? (JSON.parse(head(JSON.stringify(summary), SUMMARY_LIMIT).replace(/\.\.\. \([^)]*\)$/, "") + '"') as JsonValue) : summary, bytes, reduced: true };
        } catch {
            // a compactor that trips on an unexpected shape falls back to the generic head
        }
    }
    if (bytes <= COMPACT_ABOVE) return { summary: (output ?? null) as JsonValue, bytes, reduced: false };
    return { summary: { head: head(JSON.stringify(output), 1200), bytes } as JsonValue, bytes, reduced: true };
}
