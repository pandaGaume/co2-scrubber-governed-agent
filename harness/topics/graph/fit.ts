/**
 * The estimators of the graph factory: how the numbers of a candidate are
 * found, once its structure is chosen. In the words of system
 * identification (docs/usine-de-graphes.fr.md, section 3): the builder
 * chooses the model structure (a grey box: the nodes, their connections, the
 * physics written as formulas), an estimator finds the parameters that
 * minimise the prediction error against the measured output, and the
 * validation says whether the structure is good enough.
 *
 * The estimator is interchangeable: every one answers the same question
 * (bounds of the unknown parameters, a cost to minimise, a budget of
 * simulations) and says what it found and what it tried. Two exist:
 *
 *   grid          every combination of a few levels per parameter. Exhaustive
 *                 within its levels, blind between them; its cost is the
 *                 product of the levels (5 levels, 3 parameters: 125 runs).
 *                 Good for one or two parameters, and to see the shape of the
 *                 cost (a valley, a ridge: a parameter the data does not fix).
 *   nelder-mead   a derivative-free simplex search in the box of the bounds,
 *                 started from the best point of a coarse sample. Its cost
 *                 grows about linearly with the parameters (a few dozen runs
 *                 for two or three). Local: it can stop in a valley that is not
 *                 the deepest, which the coarse start only makes less likely;
 *                 it says nothing of how well the data fixes each parameter.
 *
 * Neither is a statistical estimator: no noise model, no confidence interval,
 * no identifiability test. Those are listed as limits in the document, with
 * the questions they raise.
 */

export type Bounds = Record<string, { min: number; max: number }>;

export interface EstimateResult {
    best: Record<string, number>;
    score: number;
    runs: number;
    tried: Array<{ variables: Record<string, number>; score: number }>;
}

export interface Estimator {
    id: "grid" | "nelder-mead";
    /** One line for the builder and the record: what it does and what it costs. */
    describe: string;
    estimate(bounds: Bounds, cost: (vars: Record<string, number>) => Promise<number>, maxRuns: number, options?: { levels?: number }): Promise<EstimateResult>;
}

function checkBounds(bounds: Bounds): string[] {
    const names = Object.keys(bounds);
    if (!names.length) throw new Error("the estimator was given no parameter to estimate");
    for (const [k, b] of Object.entries(bounds)) if (!(Number.isFinite(b?.min) && Number.isFinite(b?.max) && b.max > b.min)) throw new Error(`fit.${k}: give {"min", "max"} with max above min`);
    return names;
}

/** A cost function with a memory and a budget: a point already run is not run again; past the budget, it answers +infinity. */
function budgeted(bounds: Bounds, cost: (vars: Record<string, number>) => Promise<number>, maxRuns: number) {
    const names = Object.keys(bounds);
    const tried: EstimateResult["tried"] = [];
    const cache = new Map<string, number>();
    const toVars = (u: number[]) => Object.fromEntries(names.map((k, i) => [k, bounds[k].min + Math.min(1, Math.max(0, u[i])) * (bounds[k].max - bounds[k].min)]));
    const f = async (u: number[]): Promise<number> => {
        const clamped = u.map((x) => Math.min(1, Math.max(0, x)));
        const key = clamped.map((x) => x.toFixed(6)).join(",");
        const hit = cache.get(key);
        if (hit !== undefined) return hit;
        if (tried.length >= maxRuns) return Number.POSITIVE_INFINITY;
        const vars = toVars(clamped);
        const s = await cost(vars);
        cache.set(key, s);
        tried.push({ variables: vars, score: s });
        return s;
    };
    const result = (): EstimateResult => {
        const best = tried.reduce((a, b) => (b.score < a.score ? b : a), tried[0]);
        return { best: best.variables, score: best.score, runs: tried.length, tried };
    };
    return { f, result, tried };
}

export const GRID: Estimator = {
    id: "grid",
    describe: "every combination of evenly spaced levels per parameter within its bounds (5 by default); cost = levels ^ parameters runs",
    async estimate(bounds, cost, maxRuns, options = {}) {
        const names = checkBounds(bounds);
        const levels = Math.max(2, Math.floor(options.levels ?? 5));
        const total = Math.pow(levels, names.length);
        if (total > maxRuns) throw new Error(`grid: ${levels} levels on ${names.length} parameter(s) is ${total} runs, above the ${maxRuns} allowed; fewer levels, fewer parameters, or the nelder-mead estimator`);
        const { f, result } = budgeted(bounds, cost, maxRuns);
        let points: number[][] = [[]];
        for (let d = 0; d < names.length; d++) points = points.flatMap((p) => Array.from({ length: levels }, (_, i) => [...p, i / (levels - 1)]));
        for (const p of points) await f(p);
        return result();
    },
};

export const NELDER_MEAD: Estimator = {
    id: "nelder-mead",
    describe: "a derivative-free simplex search in the box of the bounds, from the best point of a coarse sample; about 10 to 20 runs per parameter; local",
    async estimate(bounds, cost, maxRuns) {
        const names = checkBounds(bounds);
        const n = names.length;
        const { f, result, tried } = budgeted(bounds, cost, maxRuns);
        // A coarse start: three levels per parameter for one or two parameters, the centre and the faces for more.
        const levels = [0.15, 0.5, 0.85];
        let sample: number[][] = [[]];
        if (n <= 2) for (let d = 0; d < n; d++) sample = sample.flatMap((p) => levels.map((l) => [...p, l]));
        else sample = [Array(n).fill(0.5), ...names.flatMap((_, d) => [0.15, 0.85].map((l) => names.map((__, j) => (j === d ? l : 0.5))))];
        let start = sample[0];
        let startScore = Number.POSITIVE_INFINITY;
        for (const p of sample) {
            const s = await f(p);
            if (s < startScore) [start, startScore] = [p, s];
        }
        let simplex = [start, ...names.map((_, d) => start.map((x, j) => (j === d ? (x > 0.5 ? x - 0.2 : x + 0.2) : x)))];
        let values: number[] = [];
        for (const p of simplex) values.push(await f(p));
        for (let iter = 0; iter < 200 && tried.length < maxRuns; iter++) {
            const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
            simplex = order.map((i) => simplex[i]);
            values = order.map((i) => values[i]);
            if (Math.abs(values[n] - values[0]) < 0.05 && Math.max(...simplex.flatMap((p) => p.map((x, d) => Math.abs(x - simplex[0][d])))) < 0.005) break;
            const centroid = names.map((_, d) => simplex.slice(0, n).reduce((s, p) => s + p[d], 0) / n);
            const along = (t: number) => centroid.map((c, d) => c + t * (simplex[n][d] - c));
            const reflected = along(-1);
            const fr = await f(reflected);
            if (fr < values[0]) {
                const expanded = along(-2);
                const fe = await f(expanded);
                [simplex[n], values[n]] = fe < fr ? [expanded, fe] : [reflected, fr];
            } else if (fr < values[n - 1]) {
                [simplex[n], values[n]] = [reflected, fr];
            } else {
                const contracted = along(fr < values[n] ? -0.5 : 0.5);
                const fc = await f(contracted);
                if (fc < Math.min(fr, values[n])) [simplex[n], values[n]] = [contracted, fc];
                else
                    for (let i = 1; i <= n; i++) {
                        simplex[i] = simplex[i].map((x, d) => simplex[0][d] + 0.5 * (x - simplex[0][d]));
                        values[i] = await f(simplex[i]);
                    }
            }
        }
        return result();
    },
};

export const ESTIMATORS: Record<Estimator["id"], Estimator> = { grid: GRID, "nelder-mead": NELDER_MEAD };
export const DEFAULT_ESTIMATOR: Estimator["id"] = "nelder-mead";

/** The estimator a candidate asks for, the default otherwise; an unknown name is refused with the known ones. */
export function estimatorFor(id: unknown): Estimator {
    if (id === undefined || id === null || id === "") return ESTIMATORS[DEFAULT_ESTIMATOR];
    const e = ESTIMATORS[String(id) as Estimator["id"]];
    if (!e) throw new Error(`no estimator "${String(id)}" (${Object.keys(ESTIMATORS).join(", ")})`);
    return e;
}
