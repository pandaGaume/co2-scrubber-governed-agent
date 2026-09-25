/**
 * `graph.evaluate`: one candidate twin, judged against the real by code.
 *
 * The builder hands a parametric spec (`params.ts`), or names a graph of
 * the library (`graph: "habitat"`, the station's reference read through
 * the library slot and instantiated on the twin: its template resolved
 * with the settings given, the variables the builder does not name at
 * their defaults, its probes as the comparison), what to compare (a
 * probe of the graph against a telemetry column) and, optionally, the
 * variables to vary. For every combination the harness builds the document
 * through the runtime (`twin.document_build`), runs it in the sandbox over
 * the telemetry's span (`twin.session_run`, one sample a minute) and
 * measures the residual: the root mean square and the worst gap, per
 * compared column. The best combination is built once more under a name in
 * the task's workshop (`candidate-<n>.spikypanda`): that file is the
 * candidate, and its residual is what the validator reads.
 *
 * The builder never scores itself: the threshold is the task's
 * (`objective.constraints.residualPpmMax`), the numbers are computed here,
 * every candidate is kept in `candidates.json` with its residual, rejected
 * ones included, and Mother is told of each (`station.candidate_evaluated`).
 *
 * A plausibility check comes with the residual: the slope of the first
 * minutes, predicted against measured. A twin that parts from the
 * measurement at the very first minute, several times too fast or the wrong
 * way, is not missing a term (a missing exchange shows late, as the
 * volumes drift apart): it has a rate in the wrong unit or scale. The check
 * says so, by numbers; it refuses nothing.
 *
 * What the request gives as known (its `known` constants, each with the
 * library document it comes from) is held: a variable named by a known
 * constant's symbol cannot be fitted, and the evaluation says so before any
 * run. A fit that moves a documented constant can close a gap for the wrong
 * reason (equifinality): the structure must close it.
 */
import type { JsonValue } from "@spiky-panda/harness";
import type { Broker } from "../../lib/broker.js";
import type { TaskFile } from "../../core/task.js";
import { combinations, resolveSpec, type Row, type Spec, type Variables } from "./params.js";
import { estimatorFor, type Bounds } from "./fit.js";
import { CABIN_DOCUMENT_FILE } from "../../../lib/paths.js";
import { instantiateTemplate, loadGraphLibrary, type DeviceLike, type GraphTemplate, type PersonSpec } from "../../../lib/graph-library.js";
import { compareStructure, referenceOfDocument, referenceOfSpec, type ReferenceGraph, type StructureComparison } from "./reference.js";

/** The library graph a candidate is compared with when the request names none: the station's reference. */
export const STATION_GRAPH_ID = "habitat";

/** The station's reference, read once from the library's shelf (its template, at its defaults): the structure a candidate is compared with. */
let stationTwin: ReferenceGraph | null | undefined;
export function stationReference(): ReferenceGraph | null {
    if (stationTwin === undefined) {
        try {
            const entry = loadGraphLibrary().find((g) => g.template.id === STATION_GRAPH_ID);
            stationTwin = entry ? referenceOfSpec(instantiateTemplate(entry.template).spec, `the station's reference graph (library graph "${STATION_GRAPH_ID}", ${entry.template.document})`) : null;
        } catch {
            stationTwin = null;
        }
    }
    return stationTwin;
}

/** The cabin twin of the first nights (`graphs/cabin.spikypanda`), kept for comparison. */
let cabinTwin: ReferenceGraph | null | undefined;
export function cabinReference(): ReferenceGraph | null {
    if (cabinTwin === undefined) {
        try {
            cabinTwin = referenceOfDocument(CABIN_DOCUMENT_FILE, "the station's cabin twin (graphs/cabin.spikypanda)");
        } catch {
            cabinTwin = null;
        }
    }
    return cabinTwin;
}

export interface Compare {
    node: string;
    property: string;
    column: string;
}

export interface Residual {
    column: string;
    probe: string;
    rmse: number;
    worst: number;
    worstMinute: number;
}

export interface Candidate {
    n: number;
    label: string;
    path: string;
    sha256: string;
    nodes: number;
    types: string[];
    connections: number;
    variables: Variables;
    residuals: Residual[];
    threshold: number;
    pass: boolean;
    /** Sandbox runs this candidate cost, the final one included. */
    combinations: number;
    /** The variables the harness fitted; the others were given. */
    fitted: string[];
    /** The estimator that fitted them (`fit.ts`), or `given` when nothing was fitted. */
    estimator: string;
    /** The slope of the first minutes, predicted against measured (ppm/min), on the first compared column. */
    early?: EarlySlope;
    /** What the plausibility check found; empty when the dynamics start right. */
    warnings: string[];
    /** The spec as the builder wrote it (formulas unresolved): what a comparison of numbers resolves. */
    spec?: Spec;
    /** The candidate's structure, by node types and typed connections: what a comparison reads. */
    structure?: ReferenceGraph;
    /** The library graph this candidate instantiates, when it does. */
    graph?: string;
    /** The settings the graph was instantiated with (who is on board). */
    settings?: Record<string, number>;
    /** The variables the builder did not name, taken at the graph's defaults. */
    defaulted?: string[];
    /** The variables the registered device gave (the task's observations carry the register's devices). */
    fromDevice?: Record<string, { path: string; property: string; value: number }>;
    /** Who is on board in this candidate. */
    persons?: PersonSpec[];
    /** The candidate against the station's twin, by types and typed connections. */
    reference?: StructureComparison;
    at: string;
}

export interface EarlySlope {
    column: string;
    minutes: number;
    predicted: number;
    measured: number;
    /** What enters the compared node at the first minute, term by term: the source's output, the input it feeds, its value. */
    inflows?: Array<{ from: string; into: string; value: number }>;
}

/** The terms of the compared node's balance at the first minute: every connection into it, read from the probes of their sources. */
export function inflowsOf(series: Record<string, number[]>, spec: Spec, node: string): Array<{ from: string; into: string; value: number }> {
    return spec.connections
        .filter((c) => c.to[0] === node)
        .map((c) => ({ from: `${c.from[0]}.${c.from[1]}`, into: c.to[1], value: series[`${c.from[0]}.${c.from[1]}`]?.[0] }))
        .filter((t): t is { from: string; into: string; value: number } => typeof t.value === "number" && Number.isFinite(t.value))
        .map((t) => ({ ...t, value: Number(t.value.toPrecision(4)) }));
}

export interface EvaluateInput {
    label: string;
    /** The candidate as a parametric spec; or none, and `graph` names a library graph. */
    spec?: Spec;
    /** A graph of the library to instantiate (its template resolved with the settings and the variables). */
    graph?: string;
    /** The settings of a library graph (who is on board); its defaults when absent. */
    settings?: Record<string, number>;
    /** Who is on board, person by person (module, activity; id, callsign, name when known): replaces the graph's roster, the settings follow. */
    persons?: PersonSpec[];
    /** What is judged against what; a library graph's own probes and columns when absent. */
    compare?: Compare[];
    variables?: Variables;
    /** The bounds of the variables nobody knows: the optimiser searches them. */
    fit?: Bounds;
    /** Which estimator searches the bounds: `nelder-mead` (default) or `grid`. */
    estimator?: string;
    /** For the grid: levels per parameter (5 by default). */
    levels?: number;
    /** An explicit list of values per variable, every combination run (the older way; `fit` is preferred). */
    vary?: Record<string, number[]>;
    maxRuns?: number;
}

const DT_SECONDS = 6;
const SAMPLE_EVERY = 10;
export const MAX_COMBINATIONS = 80;
/** Runs the optimiser may spend on one candidate unless the builder says otherwise. */
export const DEFAULT_FIT_RUNS = 40;

const round = (v: number) => Number(v.toFixed(1));

/** A runtime error as the builder can read it: the reason, without the kilobytes of a resolved parameter it may quote. */
const brief = (s: string | undefined): string => (s ?? "").replace(/"\[\{.*?\}\]"/g, '"[segments]"').slice(0, 500);

/** The residual of one run against the telemetry, per compared column; the series index is the minute. */
export function residualsOf(series: Record<string, number[]>, compare: Compare[], rows: Row[]): Residual[] {
    return compare.map((c) => {
        const probe = `${c.node}.${c.property}`;
        const predicted = series[probe] ?? [];
        let se = 0;
        let n = 0;
        let worst = 0;
        let worstMinute = 0;
        for (const r of rows) {
            const m = Number(r.minute);
            const measured = Number(r[c.column]);
            const p = predicted[m];
            if (!Number.isFinite(m) || !Number.isFinite(measured) || typeof p !== "number" || !Number.isFinite(p)) continue;
            const e = p - measured;
            se += e * e;
            n++;
            if (Math.abs(e) > worst) {
                worst = Math.abs(e);
                worstMinute = m;
            }
        }
        return { column: c.column, probe, rmse: n ? Math.sqrt(se / n) : Number.POSITIVE_INFINITY, worst, worstMinute };
    });
}

/**
 * What a spec says that the runtime would take silently and wrongly: a
 * timeline segment whose value is a formula or a column's name written as
 * text (a timeline holds numbers, or words such as an activity, and a text
 * stays text), and literal segments that end long before the telemetry
 * does (segments are in seconds of session time, not minutes). Found by
 * comparing the builder's graphs with the one written by hand: both had the
 * same wiring, one had its command frozen after sixty seconds.
 */
export function specProblems(spec: Spec, variables: string[], columns: string[], lastMinute: number): string[] {
    const problems: string[] = [];
    for (const n of spec.nodes) {
        const segments = n.params?.segments;
        if (typeof segments !== "string") continue;
        let list: Array<{ from?: unknown; to?: unknown; value?: unknown }>;
        try {
            list = JSON.parse(segments);
        } catch {
            continue;
        }
        if (!Array.isArray(list)) continue;
        for (const s of list) {
            const v = s?.value;
            if (typeof v === "string" && (variables.includes(v) || columns.some((c) => v.includes(c)) || /[*/+]|\d\s*-/.test(v))) problems.push(`node "${n.id}": a segment's value is the text "${v}"; a timeline holds a number or a word, never a formula or a column: a measured input is segments {"$series": {"column": "...", "scale": "..."}}, a variable is a number resolved from {"$expr": "..."} in a parameter`);
        }
        const end = Math.max(...list.map((s) => Number(s?.to)).filter(Number.isFinite));
        if (Number.isFinite(end) && end < lastMinute * 60 * 0.9) problems.push(`node "${n.id}": its segments end at ${end} s, and the telemetry runs ${lastMinute} min (${lastMinute * 60} s): segments are in seconds of session time`);
    }
    return problems;
}

/** Minutes over which the first slope is read: long enough to see through a sensor's noise, short enough to be the start. */
export const EARLY_MINUTES = 5;

/** The first slope of a probe against its column, from the first minute of the telemetry. */
export function earlySlopeOf(series: Record<string, number[]>, compare: Compare, rows: Row[]): EarlySlope | undefined {
    const minutes = rows.map((r) => Number(r.minute)).filter(Number.isFinite).sort((a, b) => a - b);
    const t0 = minutes[0];
    const t1 = minutes.find((m) => m >= t0 + EARLY_MINUTES);
    if (t0 === undefined || t1 === undefined) return undefined;
    const at = (m: number) => Number(rows.find((r) => Number(r.minute) === m)?.[compare.column]);
    const predicted = series[`${compare.node}.${compare.property}`] ?? [];
    const [p0, p1, m0, m1] = [predicted[t0], predicted[t1], at(t0), at(t1)];
    if (![p0, p1, m0, m1].every((v) => typeof v === "number" && Number.isFinite(v))) return undefined;
    return { column: compare.column, minutes: t1 - t0, predicted: Number(((p1 - p0) / (t1 - t0)).toFixed(1)), measured: Number(((m1 - m0) / (t1 - t0)).toFixed(1)) };
}

/** Below this slope (ppm/min) the measurement is flat for the check: noise, not a trend. */
const FLAT = 2;

/** What a first slope says about the candidate's units, in words the builder can act on; nothing when it starts right. */
export function plausibilityOf(early: EarlySlope | undefined): string[] {
    if (!early) return [];
    const { predicted: p, measured: m, minutes, column } = early;
    const wrongWay = Math.abs(m) >= FLAT && Math.sign(p) !== Math.sign(m) && Math.abs(p) >= FLAT;
    const ratio = Math.abs(m) >= FLAT ? Math.abs(p) / Math.abs(m) : Math.abs(p) >= 5 * FLAT ? Number.POSITIVE_INFINITY : 1;
    if (!wrongWay && ratio <= 3 && ratio >= 1 / 3) return [];
    const how = wrongWay ? "the other way" : ratio > 3 ? `${Number.isFinite(ratio) ? `${ratio.toFixed(1)} times` : "far"} faster` : `${(1 / ratio).toFixed(1)} times slower`;
    const terms = early.inflows?.length ? ` What enters the node at the first minute: ${early.inflows.map((t) => `${t.from} into ${t.into} = ${t.value}`).join("; ")}.` : "";
    return [`units: over the first ${minutes} minutes the twin moves ${p} ppm/min where ${column} moves ${m} ppm/min, ${how}. A gap from the first minute is not a missing term (an exchange shows late, as the volumes drift apart): check the units and scale of the rates.${terms} The catalogue's rates are per volume: a flow Qe in m3/min enters as Qe / V (1/min), a source of g L/min as g * 1e3 / V (ppm/min), an emission input takes ppm/min, and a concentration (ppm) entering one is scaled first (q / V for an exchange).`];
}

const scoreOf = (residuals: Residual[]) => Math.max(...residuals.map((r) => r.rmse));

/** A constant the request gives as known, as the task carries it. */
export interface KnownConstant {
    symbol: string;
    name?: string;
    value: number;
    unit?: string;
    source?: string;
    /** The documented band, when there is one: a fit may place the value within it. */
    min?: number;
    max?: number;
}

const hasBand = (k: KnownConstant) => typeof k.min === "number" && typeof k.max === "number" && k.min < k.max;

/** The known constants of a task: the Observer's, carried whole in the requirements. */
export function knownOf(task: TaskFile["task"]): KnownConstant[] {
    const known = (task.requirements as { known?: unknown } | undefined)?.known;
    return Array.isArray(known) ? (known as KnownConstant[]).filter((k) => k && typeof k.symbol === "string" && typeof k.value === "number") : [];
}

export interface EvaluateContext {
    broker: Broker;
    taskId: string;
    task: TaskFile["task"];
    rows: Row[];
    runtimeSlot?: string;
    /** How many runs the task may still spend (its `twinPoints`). */
    remaining: number;
    n: number;
}

/** A library graph as the twin will build it: read through the library slot, instantiated with what the builder gave. */
/** The register's devices, when the task's observations carry them (`observations.devices`, as `station.registry_list` gives them). */
function devicesOf(task: TaskFile["task"]): DeviceLike[] {
    const raw = (task.observations as { devices?: unknown } | undefined)?.devices;
    return Array.isArray(raw) ? (raw as DeviceLike[]).filter((d) => d && typeof d.path === "string" && d.descriptor && typeof d.descriptor === "object") : [];
}

async function instantiateFromLibrary(input: EvaluateInput, ctx: EvaluateContext): Promise<{ spec: Spec; variables: Variables; settings: Record<string, number>; defaulted: string[]; fromDevice: Candidate["fromDevice"]; persons: PersonSpec[]; compare: Compare[] }> {
    const read = await ctx.broker.call("library", "graph", { id: input.graph });
    if (!read.ok) throw new Error(`the library has no graph "${String(input.graph)}": ${brief(read.error ?? read.outcome)}`);
    const template = (read.output as { template?: GraphTemplate }).template;
    if (!template) throw new Error(`the library's graph "${String(input.graph)}" carries no template`);
    // The variables the builder fits are not defaulted: they are searched.
    const searched = [...Object.keys(input.fit ?? {}), ...Object.keys(input.vary ?? {})];
    const given = { ...(input.variables ?? {}) };
    const inst = instantiateTemplate(template, { variables: given, settings: input.settings, persons: input.persons, devices: devicesOf(ctx.task) });
    const variables: Variables = {};
    for (const [k, v] of Object.entries(inst.variables)) if (!searched.includes(k)) variables[k] = v;
    const defaulted = inst.defaulted.filter((k) => !searched.includes(k));
    for (const k of searched) {
        const t = template.variables[k];
        const b = input.fit?.[k];
        if (t && b && (t.status === "known" || t.status === "device")) throw new Error(`"${k}" is a ${t.status === "device" ? "device's own number" : "known constant"} of graph "${template.id}" (${t.source ?? "documented"}): held at ${inst.variables[k]}${t.unit ? ` ${t.unit}` : ""}, never fitted`);
        if (t && b && typeof t.min === "number" && typeof t.max === "number" && (b.min < t.min || b.max > t.max)) throw new Error(`"${k}" searched over ${b.min} to ${b.max}, but graph "${template.id}" bounds it to ${t.min} to ${t.max}${t.unit ? ` ${t.unit}` : ""} (${t.source ?? "its template"})`);
    }
    return { spec: inst.spec as Spec, variables, settings: inst.settings, defaulted, fromDevice: inst.fromDevice, persons: inst.persons, compare: input.compare?.length ? input.compare : inst.compare };
}

export async function evaluateCandidate(input: EvaluateInput, ctx: EvaluateContext): Promise<{ candidate: Candidate; profile: Array<{ minute: number; predicted: number | null; measured: number | null }>; ranking: Array<{ variables: Variables; score: number }> }> {
    const { broker, taskId, task, rows, runtimeSlot = "twin" } = ctx;
    const threshold = Number((task.objective.constraints as { residualPpmMax?: unknown })?.residualPpmMax);
    if (!Number.isFinite(threshold) || threshold <= 0) throw new Error("the task gives no residual threshold (objective.constraints.residualPpmMax): nobody said how close is close enough");
    if (!input.graph && !input.spec) throw new Error("a candidate is a spec (nodes and connections) or a graph of the library (graph: its id, from library.graphs)");
    if (input.graph && input.spec) throw new Error("a candidate is a spec or a library graph, not both");
    // A library graph: its template instantiated on the twin, the builder's variables over its defaults, its own probes when the builder names none.
    const shelf = input.graph ? await instantiateFromLibrary(input, ctx) : null;
    if (shelf) input = { ...input, spec: shelf.spec, variables: shelf.variables, compare: shelf.compare };
    if (!Array.isArray(input.compare) || !input.compare.length) throw new Error("compare names at least one probe and the telemetry column it is judged against");
    const columns = new Set(rows.flatMap((r) => Object.keys(r)));
    for (const c of input.compare) if (!columns.has(c.column)) throw new Error(`compare: the telemetry has no column "${c.column}" (${[...columns].join(", ")})`);
    const last = Math.max(...rows.map((r) => Number(r.minute)).filter(Number.isFinite));
    if (!Number.isFinite(last) || last <= 0) throw new Error("the telemetry has no \"minute\" column to run the candidate over");
    if (ctx.remaining <= 1) throw new Error("the task's budget of sandbox runs (twinPoints) is spent");
    const compare = input.compare;
    const inputSpec = input.spec!;
    const probes = compare.map((c) => ({ node: c.node, property: c.property }));
    const written = specProblems(inputSpec, [...Object.keys(input.variables ?? {}), ...Object.keys(input.fit ?? {}), ...Object.keys(input.vary ?? {})], [...columns], last);
    if (written.length) throw new Error(`the candidate would run, but not as written: ${written.join("; ")}`);
    const fixed = input.variables ?? {};
    const hasFit = input.fit && Object.keys(input.fit).length > 0;
    const hasVary = input.vary && Object.keys(input.vary).length > 0;
    for (const k of Object.keys(input.fit ?? {})) if (k in fixed) throw new Error(`"${k}" is both fixed (variables) and fitted (fit): a known constant is not fitted`);
    const known = knownOf(task);
    const knownAs = (v: string) => known.find((k) => k.symbol.toLowerCase() === v.toLowerCase());
    // A documented constant without a band is held; one with a band may be fitted, within the band only.
    const held = [...Object.keys(input.fit ?? {}).filter((v) => !(knownAs(v) && hasBand(knownAs(v)!))), ...Object.keys(input.vary ?? {})].flatMap((v) => {
        const k = knownAs(v);
        return k ? [`${v} (${k.name ?? k.symbol} = ${k.value}${k.unit ? ` ${k.unit}` : ""}, ${k.source ?? "documented"})`] : [];
    });
    if (held.length) throw new Error(`the request gives ${held.join(", ")} as known: a documented constant is held in variables, never fitted. If the gap needs it moved, the structure is missing something`);
    const outside = Object.entries(input.fit ?? {}).flatMap(([v, b]) => {
        const k = knownAs(v);
        return k && hasBand(k) && (b.min < k.min! || b.max > k.max!) ? [`${v} searched over ${b.min} to ${b.max}, documented ${k.min} to ${k.max}${k.unit ? ` ${k.unit}` : ""} (${k.source ?? "documented"})`] : [];
    });
    if (outside.length) throw new Error(`a documented band bounds the search: ${outside.join("; ")}. Search within the band; a value outside it is not this constant any more`);

    const run = async (vars: Variables, name?: string) => {
        const spec = resolveSpec(inputSpec, vars, rows);
        const built = await broker.call(runtimeSlot, "document_build", name ? { spec, name } : { spec });
        if (!built.ok) throw new Error(`the candidate does not build: ${brief(built.error ?? built.outcome)} (a measured input is a Logic.Time:timeline whose segments are the $series, wired into the port; a port takes a connection, not a series)`);
        const doc = built.output as { ok?: boolean; problems?: Array<{ where?: string; what?: string }>; json?: string; sha256: string; nodes?: unknown[]; connections?: unknown[] };
        // The runtime answers a spec it will not build with its problems, not with a refusal: they are the reason here.
        if (doc.ok === false || (!doc.json && !name)) throw new Error(`the candidate does not build: ${(doc.problems ?? []).map((p) => `${p.where ? `${p.where}: ` : ""}${p.what ?? JSON.stringify(p)}`).join("; ") || "no document came back"}`);
        const ran = await broker.call(runtimeSlot, "session_run", { ...(name ? { name } : { document: doc.json }), dt: DT_SECONDS, duration: last * 60, sampleEvery: SAMPLE_EVERY, probes });
        if (!ran.ok) {
            const why = brief(ran.error ?? ran.outcome);
            // A NaN in the sandbox is a parameter that resolved to no number: say which way to write it.
            const hint = /NaN/.test(why) ? ` (a parameter resolved to no number: a formula over the variables is {"$expr": "..."} and names only variables given in variables or fit; the resolved parameters were ${JSON.stringify(Object.fromEntries(spec.nodes.flatMap((n) => Object.entries(n.params ?? {}).filter(([, v]) => typeof v !== "string" || v.length < 40).map(([k, v]) => [`${n.id}.${k}`, v]))))})` : "";
            throw new Error(`the candidate does not run: ${why}${hint}`);
        }
        const series = (ran.output as { series: Record<string, number[]> }).series;
        return { residuals: residualsOf(series, compare, rows), series, sha256: doc.sha256 };
    };

    const tried: Array<{ variables: Variables; score: number }> = [];
    let best: { variables: Variables; score: number } | null = null;
    const budget = Math.min(ctx.remaining - 1, input.maxRuns ?? DEFAULT_FIT_RUNS, MAX_COMBINATIONS);
    if (hasFit) {
        // The variables nobody knows, searched within their bounds by the optimiser; the known ones held.
        const fit = await estimatorFor(input.estimator).estimate(input.fit!, async (vars) => scoreOf((await run({ ...fixed, ...vars })).residuals), budget, { levels: input.levels });
        for (const t of fit.tried) tried.push({ variables: { ...fixed, ...t.variables }, score: round(t.score) });
        best = { variables: { ...fixed, ...fit.best }, score: fit.score };
    } else {
        // An explicit list of values (`vary`), or one run with the variables as given.
        for (const vars of hasVary ? combinations(fixed, input.vary!, budget) : [fixed]) {
            const r = await run(vars);
            const score = scoreOf(r.residuals);
            tried.push({ variables: vars, score: round(score) });
            if (!best || score < best.score) best = { variables: vars, score };
        }
    }
    // The best, built once more under its name: the candidate is a file of the task, its sha256 what the validator checks.
    const final = await run(best!.variables, `${taskId}/candidate-${ctx.n}`);
    const candidate: Candidate = {
        n: ctx.n,
        label: String(input.label ?? "").slice(0, 200),
        path: `candidate-${ctx.n}.spikypanda`,
        sha256: final.sha256,
        nodes: inputSpec.nodes.length,
        types: [...new Set(inputSpec.nodes.map((n) => n.typeId))].sort(),
        connections: inputSpec.connections.length,
        variables: Object.fromEntries(Object.entries(best!.variables).map(([k, v]) => [k, Number(v.toPrecision(4))])),
        residuals: final.residuals.map((r) => ({ ...r, rmse: round(r.rmse), worst: round(r.worst) })),
        threshold,
        pass: final.residuals.every((r) => r.rmse <= threshold),
        combinations: tried.length + 1,
        fitted: Object.keys(input.fit ?? input.vary ?? {}),
        estimator: hasFit ? estimatorFor(input.estimator).id : hasVary ? "grid (values given)" : "given",
        warnings: [],
        ...(shelf ? { graph: input.graph, settings: shelf.settings, defaulted: shelf.defaulted, fromDevice: shelf.fromDevice, persons: shelf.persons } : {}),
        at: new Date().toISOString(),
    };
    const first = compare[0];
    candidate.early = earlySlopeOf(final.series, first, rows);
    if (candidate.early && plausibilityOf(candidate.early).length) {
        // An implausible start: read the terms of the compared node's balance at the first minute, one short run per source, a source the runtime cannot probe left out.
        const sources = inputSpec.connections.filter((c) => c.to[0] === first.node).map((c) => ({ node: c.from[0], property: c.from[1] }));
        const read: Record<string, number[]> = {};
        for (const probe of sources) {
            const r = await broker.call(runtimeSlot, "session_run", { name: `${taskId}/candidate-${ctx.n}`, dt: DT_SECONDS, duration: SAMPLE_EVERY * DT_SECONDS, sampleEvery: SAMPLE_EVERY, probes: [probe] });
            const s = r.ok ? (r.output as { series?: Record<string, number[]> }).series : undefined;
            if (s) Object.assign(read, s);
        }
        candidate.early.inflows = inflowsOf(read, inputSpec, first.node);
    }
    candidate.warnings = plausibilityOf(candidate.early);
    candidate.spec = inputSpec;
    candidate.structure = referenceOfSpec(inputSpec, `candidate ${ctx.n}`);
    const station = stationReference();
    if (station) candidate.reference = compareStructure(inputSpec, station);
    const series = final.series[`${first.node}.${first.property}`] ?? [];
    const profile = rows
        .filter((r) => Number(r.minute) % 5 === 0)
        .map((r) => ({ minute: Number(r.minute), predicted: typeof series[Number(r.minute)] === "number" ? round(series[Number(r.minute)]) : null, measured: Number.isFinite(Number(r[first.column])) ? Number(r[first.column]) : null }));
    return { candidate, profile, ranking: [...tried].sort((a, b) => a.score - b.score).slice(0, 5) };
}

/** The evaluation as the builder reads it: the verdict, the residuals, where the curves part, the best variables. */
export const evaluationOutput = (r: Awaited<ReturnType<typeof evaluateCandidate>>): JsonValue =>
    ({
        candidate: r.candidate.n,
        path: r.candidate.path,
        pass: r.candidate.pass,
        threshold: r.candidate.threshold,
        variables: r.candidate.variables,
        ...(r.candidate.graph ? { graph: r.candidate.graph, settings: r.candidate.settings, defaulted: r.candidate.defaulted, fromDevice: r.candidate.fromDevice, persons: r.candidate.persons } : {}),
        residuals: r.candidate.residuals,
        ...(r.candidate.early ? { firstSlope: r.candidate.early } : {}),
        ...(r.candidate.warnings.length ? { warnings: r.candidate.warnings } : {}),
        ...(r.candidate.reference ? { againstStationReference: { wiringMatch: r.candidate.reference.wiringMatch, missingWires: r.candidate.reference.missingWires, extraWires: r.candidate.reference.extraWires } } : {}),
        profile: r.profile,
        bestCombinations: r.ranking,
        runs: r.candidate.combinations,
    }) as unknown as JsonValue;
