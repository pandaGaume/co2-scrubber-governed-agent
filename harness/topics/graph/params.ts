/**
 * A parametric graph: the topology and the formulas are the builder's, the
 * numbers are the harness's (docs/observateur-et-usines.fr.md, section 5).
 *
 * A candidate is a document spec (`twin.document_validate`'s shape) whose
 * node parameters may be, instead of a number:
 *
 *   { "$expr": "0.6e-3 * 1e6 / V" }       a formula over the candidate's
 *                                          variables (+ - * / ^, parentheses,
 *                                          numbers, variable names);
 *   { "$series": { "column": "c", "scale": "q / V", "offset": "0" } }
 *                                          the segments of a `Logic.Time:timeline`
 *                                          from a telemetry column, one segment per
 *                                          row (a measured input: the scrubber's
 *                                          command, a neighbour's CO2);
 *   { "$first": "c" }                      the first value of a telemetry column (an
 *                                          initial state).
 *
 * The harness resolves them for every combination of the variables it
 * tries, so the builder writes the physics once and never types a fitted
 * number. The evaluator here is a small recursive-descent parser: no
 * `eval`, no names but the variables.
 */

export type Variables = Record<string, number>;
export type Row = Record<string, unknown>;

/** Evaluates a formula over the variables; throws with the reason when it cannot. */
export function evaluateExpression(source: string, vars: Variables): number {
    const tokens = source.match(/\d+(\.\d+)?([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/^()]|\S/g) ?? [];
    let i = 0;
    const peek = () => tokens[i];
    const take = () => tokens[i++];
    const primary = (): number => {
        const t = take();
        if (t === undefined) throw new Error(`"${source}": the formula ends too early`);
        if (t === "(") {
            const v = sum();
            if (take() !== ")") throw new Error(`"${source}": a parenthesis is not closed`);
            return v;
        }
        if (t === "-") return -primary();
        if (t === "+") return primary();
        if (/^[\d.]/.test(t)) return Number(t);
        if (/^[A-Za-z_]/.test(t)) {
            if (!(t in vars)) throw new Error(`"${source}": no variable "${t}" (${Object.keys(vars).join(", ") || "none given"})`);
            return vars[t];
        }
        throw new Error(`"${source}": unexpected "${t}"`);
    };
    const power = (): number => {
        const base = primary();
        if (peek() === "^") {
            take();
            return Math.pow(base, power());
        }
        return base;
    };
    const product = (): number => {
        let v = power();
        while (peek() === "*" || peek() === "/") v = take() === "*" ? v * power() : v / power();
        return v;
    };
    const sum = (): number => {
        let v = product();
        while (peek() === "+" || peek() === "-") v = take() === "+" ? v + product() : v - product();
        return v;
    };
    const value = sum();
    if (i < tokens.length) throw new Error(`"${source}": unexpected "${tokens[i]}"`);
    if (!Number.isFinite(value)) throw new Error(`"${source}" is not a finite number with ${JSON.stringify(vars)}`);
    return value;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** One parameter value resolved for these variables and this telemetry. */
export function resolveParam(value: unknown, vars: Variables, rows: Row[]): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const v = value as Record<string, unknown>;
    if (typeof v.$expr === "string") return evaluateExpression(v.$expr, vars);
    if (typeof v.$first === "string") {
        const first = rows.map((r) => num(r[v.$first as string])).find((x) => x !== null);
        if (first === undefined || first === null) throw new Error(`$first: the telemetry has no number in column "${String(v.$first)}"`);
        return first;
    }
    if (v.$series && typeof v.$series === "object") {
        const s = v.$series as { column?: unknown; scale?: unknown; offset?: unknown };
        const column = String(s.column ?? "");
        const scale = typeof s.scale === "string" ? evaluateExpression(s.scale, vars) : num(s.scale) ?? 1;
        const offset = typeof s.offset === "string" ? evaluateExpression(s.offset, vars) : num(s.offset) ?? 0;
        const points = rows.map((r) => ({ minute: num(r.minute), value: num(r[column]) })).filter((p): p is { minute: number; value: number } => p.minute !== null && p.value !== null);
        if (!points.length) throw new Error(`$series: the telemetry has no minute and number in column "${column}"`);
        return JSON.stringify(points.map((p, k) => ({ from: p.minute * 60, to: k + 1 < points.length ? points[k + 1].minute * 60 : 1e9, value: scale * p.value + offset })));
    }
    return value;
}

export interface SpecNode {
    id: string;
    typeId: string;
    params?: Record<string, unknown>;
    label?: string;
}
export interface Spec {
    nodes: SpecNode[];
    connections: Array<{ from: [string, string]; to: [string, string] }>;
}

/** The spec with every parameter resolved: what the runtime builds. */
export function resolveSpec(spec: Spec, vars: Variables, rows: Row[]): Spec {
    return {
        nodes: spec.nodes.map((n) => (n.params ? { ...n, params: Object.fromEntries(Object.entries(n.params).map(([k, v]) => [k, resolveParam(v, vars, rows)])) } : n)),
        connections: spec.connections,
    };
}

/** Every combination of the varied variables over the fixed ones, at most `limit`. */
export function combinations(fixed: Variables, vary: Record<string, number[]>, limit: number): Variables[] {
    let out: Variables[] = [{ ...fixed }];
    for (const [name, values] of Object.entries(vary)) {
        const list = values.filter((x) => Number.isFinite(x));
        if (!list.length) throw new Error(`vary.${name} has no number`);
        out = out.flatMap((c) => list.map((x) => ({ ...c, [name]: x })));
        if (out.length > limit) throw new Error(`${out.length} combinations or more: at most ${limit} per evaluation`);
    }
    return out;
}
