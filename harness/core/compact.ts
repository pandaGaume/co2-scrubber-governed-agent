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
import { APP } from "./application.js";
import { viewOf } from "./words.js";

/** Above this many characters a full answer goes to the workshop and the model gets a summary and the handle. */
export const COMPACT_ABOVE = 1500;
/** What a summary may weigh at most, characters of JSON. */
export const SUMMARY_LIMIT = 2200;
/** A read a plan is built from gets more room: a reference graph's node types, nodes and variables whole (2026-09-28). */
const SUMMARY_LIMITS: Record<string, number> = { "library.graph": 3600 };

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

/** A value with its prose cut to `chars` and its lists to `items` (the rest counted), its shape kept; an identifier (no space in it) is never cut. */
function capped(v: unknown, chars: number, items: number): unknown {
    if (typeof v === "string") return v.length <= chars || !/\s/.test(v) ? v : `${v.slice(0, chars)}...`;
    if (Array.isArray(v)) return [...v.slice(0, items).map((x) => capped(x, chars, items)), ...(v.length > items ? [`... and ${v.length - items} more`] : [])];
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, capped(x, chars, items)]));
    return v;
}

/**
 * A summary made to fit: its strings, then its lists, shortened step by step until its JSON weighs at most `limit`; still a
 * summary with its fields (2026-09-28: a summary over the limit was cut as text, which is never JSON again, and the model got
 * the first 1,200 characters of the raw answer instead: a reference graph's types and variables never reached it).
 */
export function fitted(summary: unknown, limit: number = SUMMARY_LIMIT): JsonValue | null {
    if (size(summary) <= limit) return summary as JsonValue;
    // The prose first, the lists last: what a model acts on is mostly ids and numbers.
    for (const [chars, items] of [[300, 40], [160, 40], [100, 40], [60, 40], [40, 40], [0, 40], [0, 20], [0, 12], [0, 5]] as const) {
        const cut = capped(summary, chars, items);
        if (size(cut) <= limit) return cut as JsonValue;
    }
    return null;
}

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
    // Keyed by id, the reference a justification cites (2026-09-28: a model cited a whole displayed line as the reference); each with its safe side and whether its document is signed, which decides whether it may justify a safety constant.
    "library.facts": (v) => ({
        facts: Object.fromEntries(
            list(obj(v).facts).map((f) => {
                const signed = obj(f.signed);
                const side = f.bound === "upper" ? "at most " : f.bound === "lower" ? "at least " : "";
                return [String(f.id), `${side}${String(f.value)} ${String(f.unit)}${f.min !== undefined ? ` (${String(f.min)} to ${String(f.max)})` : ""}; in ${String(f.source)}, ${signed.by ? (signed.valid ? "signed" : "signed, changed since") : "not signed"}`];
            }),
        ),
    }) as JsonValue,
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
            variables: Object.fromEntries(Object.entries(obj(o.variables)).map(([k, x]) => [k, { status: obj(x).status, default: obj(x).default, ...(obj(x).min !== undefined ? { min: obj(x).min, max: obj(x).max } : {}), ...(obj(x).unit ? { unit: obj(x).unit } : {}), description: head(String(obj(x).description ?? ""), 100) }])),
            settings: o.settings,
            probes: list(o.probes).map((p) => ({ node: p.node, property: p.property, column: p.column ?? null, name: p.name })),
            // The node types a plan names, and the nodes by id: what a model reads a graph again for when only a count is given (2026-09-28: library.graph read three times before a plan).
            types: [...new Set(list(obj(t.spec).nodes).map((n) => String(n.typeId)))].sort(),
            nodes: Object.fromEntries(list(obj(t.spec).nodes).map((n) => [String(n.id), String(n.typeId)])),
            spec: { connections: list(obj(t.spec).connections).length, note: "the parametric spec whole is at the handle; graph.evaluate with graph: id instantiates it, nothing to read again" },
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
            thresholds: o.thresholds ?? o.threshold,
            ...(o.coverage ? { coverage: { expected: obj(o.coverage).expected, predicted: obj(o.coverage).predicted, missing: list(obj(o.coverage).missing).length, valid: obj(o.coverage).valid } } : {}),
            residuals: list(o.residuals).map((r) => ({ column: r.column, rmse: num(r.rmse, 3), worst: num(r.worst, 3), worstMinute: r.worstMinute })),
            variables: Object.fromEntries(Object.entries(obj(o.variables)).map(([k, x]) => [k, num(x)])),
            ...(o.parameters ? { parameters: Object.fromEntries(Object.entries(obj(o.parameters)).map(([k, x]) => [k, `${String(num(obj(x).value))}${obj(x).unit ? ` ${String(obj(x).unit)}` : ""}, ${String(obj(x).status)}: ${head(String(obj(x).name), 80)}`])) } : {}),
            ...(o.defaulted ? { defaulted: o.defaulted } : {}),
            ...(o.fromDevice ? { fromDevice: Object.fromEntries(Object.entries(obj(o.fromDevice)).map(([k, x]) => [k, num(obj(x).value)])) } : {}),
            ...(o.atBounds ? { atBounds: o.atBounds } : {}),
            ...(o.identifiability ? { identifiability: o.identifiability, identifiabilityAssessment: o.identifiabilityAssessment ?? "NOT_ASSESSED" } : {}),
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
    // The application's reads, as its file says to reduce them (specs/harness/application.json).
    ...Object.fromEntries(Object.entries(APP.compact).map(([id, view]) => [id, (v: unknown) => viewOf(v, view) as JsonValue])),
};

/** The answer as the model reads it, and whether it was reduced. */
export function compactOutput(capabilityId: string, input: JsonValue, output: unknown): CompactResult {
    const bytes = size(output);
    // A call that failed is its error and its outcome, whole: a compactor made for the answer would lose the reason (a refused evaluation came back empty, 2026-09-25).
    const o = obj(output);
    if (o.error !== undefined && o.value === undefined) return { summary: { error: head(String(o.error), 1200), outcome: o.outcome ?? "error" } as unknown as JsonValue, bytes, reduced: false };
    const inner = value(output);
    const compactor = COMPACTORS[capabilityId];
    if (compactor) {
        try {
            const summary = fitted(compactor(inner, input), SUMMARY_LIMITS[capabilityId] ?? SUMMARY_LIMIT);
            if (summary !== null) return { summary, bytes, reduced: true };
        } catch {
            // a compactor that trips on an unexpected shape falls back to the generic head
        }
    }
    if (bytes <= COMPACT_ABOVE) return { summary: (output ?? null) as JsonValue, bytes, reduced: false };
    return { summary: { head: head(JSON.stringify(output), 1200), bytes } as JsonValue, bytes, reduced: true };
}
