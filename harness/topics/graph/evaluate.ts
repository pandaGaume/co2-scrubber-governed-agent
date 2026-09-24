/**
 * `graph.evaluate`: one candidate twin, judged against the real by code.
 *
 * The builder hands a parametric spec (`params.ts`), what to compare (a
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
 */
import type { JsonValue } from "@spiky-panda/harness";
import type { Broker } from "../../lib/broker.js";
import type { TaskFile } from "../../core/task.js";
import { combinations, resolveSpec, type Row, type Spec, type Variables } from "./params.js";
import { estimatorFor, type Bounds } from "./fit.js";

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
    at: string;
}

export interface EvaluateInput {
    label: string;
    spec: Spec;
    compare: Compare[];
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

const scoreOf = (residuals: Residual[]) => Math.max(...residuals.map((r) => r.rmse));

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

export async function evaluateCandidate(input: EvaluateInput, ctx: EvaluateContext): Promise<{ candidate: Candidate; profile: Array<{ minute: number; predicted: number | null; measured: number | null }>; ranking: Array<{ variables: Variables; score: number }> }> {
    const { broker, taskId, task, rows, runtimeSlot = "twin" } = ctx;
    const threshold = Number((task.objective.constraints as { residualPpmMax?: unknown })?.residualPpmMax);
    if (!Number.isFinite(threshold) || threshold <= 0) throw new Error("the task gives no residual threshold (objective.constraints.residualPpmMax): nobody said how close is close enough");
    if (!Array.isArray(input.compare) || !input.compare.length) throw new Error("compare names at least one probe and the telemetry column it is judged against");
    const columns = new Set(rows.flatMap((r) => Object.keys(r)));
    for (const c of input.compare) if (!columns.has(c.column)) throw new Error(`compare: the telemetry has no column "${c.column}" (${[...columns].join(", ")})`);
    const last = Math.max(...rows.map((r) => Number(r.minute)).filter(Number.isFinite));
    if (!Number.isFinite(last) || last <= 0) throw new Error("the telemetry has no \"minute\" column to run the candidate over");
    if (ctx.remaining <= 1) throw new Error("the task's budget of sandbox runs (twinPoints) is spent");
    const probes = input.compare.map((c) => ({ node: c.node, property: c.property }));
    const fixed = input.variables ?? {};
    const hasFit = input.fit && Object.keys(input.fit).length > 0;
    const hasVary = input.vary && Object.keys(input.vary).length > 0;
    for (const k of Object.keys(input.fit ?? {})) if (k in fixed) throw new Error(`"${k}" is both fixed (variables) and fitted (fit): a known constant is not fitted`);

    const run = async (vars: Variables, name?: string) => {
        const spec = resolveSpec(input.spec, vars, rows);
        const built = await broker.call(runtimeSlot, "document_build", name ? { spec, name } : { spec });
        if (!built.ok) throw new Error(`the candidate does not build: ${brief(built.error ?? built.outcome)} (a measured input is a Logic.Time:timeline whose segments are the $series, wired into the port; a port takes a connection, not a series)`);
        const doc = built.output as { json?: string; sha256: string; nodes?: unknown[]; connections?: unknown[] };
        const ran = await broker.call(runtimeSlot, "session_run", { ...(name ? { name } : { document: doc.json }), dt: DT_SECONDS, duration: last * 60, sampleEvery: SAMPLE_EVERY, probes });
        if (!ran.ok) throw new Error(`the candidate does not run: ${brief(ran.error ?? ran.outcome)}`);
        const series = (ran.output as { series: Record<string, number[]> }).series;
        return { residuals: residualsOf(series, input.compare, rows), series, sha256: doc.sha256 };
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
        nodes: input.spec.nodes.length,
        types: [...new Set(input.spec.nodes.map((n) => n.typeId))].sort(),
        connections: input.spec.connections.length,
        variables: Object.fromEntries(Object.entries(best!.variables).map(([k, v]) => [k, Number(v.toPrecision(4))])),
        residuals: final.residuals.map((r) => ({ ...r, rmse: round(r.rmse), worst: round(r.worst) })),
        threshold,
        pass: final.residuals.every((r) => r.rmse <= threshold),
        combinations: tried.length + 1,
        fitted: Object.keys(input.fit ?? input.vary ?? {}),
        estimator: hasFit ? estimatorFor(input.estimator).id : hasVary ? "grid (values given)" : "given",
        at: new Date().toISOString(),
    };
    const first = input.compare[0];
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
        residuals: r.candidate.residuals,
        profile: r.profile,
        bestCombinations: r.ranking,
        runs: r.candidate.combinations,
    }) as unknown as JsonValue;
