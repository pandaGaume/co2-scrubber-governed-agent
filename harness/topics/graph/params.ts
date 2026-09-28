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
 *                                          initial state);
 *   { "$initialMasses": { "species": "S", "fraction": ..., "unit": "u", "volume": "V", "temperatureK": "Tk" } }
 *                                          the substrate atmosphere's `_initialMassKg`:
 *                                          the air of a volume seeded from a reading of one
 *                                          species' fraction, in its unit (the physics slot
 *                                          converts it; each number a number, a formula or
 *                                          one of the forms above; `preset` and `pressurePa`
 *                                          optional).
 *
 * The harness resolves them for every combination of the variables it
 * tries, so the builder writes the physics once and never types a fitted
 * number. The evaluator here is a small recursive-descent parser: no
 * `eval`, no names but the variables.
 */

import { initialMassesKg } from "../../../lib/air.js";
import { physics } from "../../core/physics.js";
import { evaluateExpression } from "../../../lib/expression.js";

export type Variables = Record<string, number>;
export type Row = Record<string, unknown>;

/** Formulas are the shared evaluator's (lib/expression.ts): the graph factory, the forge's contracts and the physics slot's relations read them the same way. */
export { evaluateExpression };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** One parameter value resolved for these variables and this telemetry. */
export function resolveParam(value: unknown, vars: Variables, rows: Row[]): unknown {
    // A bare variable name reads as its variable: "tau" is {"$expr": "tau"}, the only thing it can mean.
    if (typeof value === "string" && Object.prototype.hasOwnProperty.call(vars, value)) return vars[value];
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const v = value as Record<string, unknown>;
    if (typeof v.$expr === "string") return evaluateExpression(v.$expr, vars);
    if (typeof v.$first === "string") {
        const first = rows.map((r) => num(r[v.$first as string])).find((x) => x !== null);
        if (first === undefined || first === null) throw new Error(`$first: the telemetry has no number in column "${String(v.$first)}"`);
        return first;
    }
    if (v.$initialMasses && typeof v.$initialMasses === "object") {
        const m = v.$initialMasses as Record<string, unknown>;
        const numberOf = (field: string, fallback?: number): number => {
            const raw = m[field];
            if (raw === undefined) {
                if (fallback === undefined) throw new Error(`$initialMasses: "${field}" is missing (species, fraction, volume and temperatureK are needed; unit when the fraction is not a ratio)`);
                return fallback;
            }
            const resolved = typeof raw === "string" && !Object.prototype.hasOwnProperty.call(vars, raw) ? evaluateExpression(raw, vars) : resolveParam(raw, vars, rows);
            if (typeof resolved !== "number" || !Number.isFinite(resolved)) throw new Error(`$initialMasses: "${field}" is not a number`);
            return resolved;
        };
        const preset = typeof m.preset === "string" ? m.preset : undefined;
        // No pressure given: the air preset's own (lib/air.ts), not a number of this code.
        if (typeof m.species !== "string" || !m.species) throw new Error(`$initialMasses: "species" is missing (the species whose fraction was read)`);
        // The fraction in the unit it was read in, as a ratio: the physics slot converts it (ppm, percent, ...), this code knows no unit.
        const read = numberOf("fraction");
        const unit = typeof m.unit === "string" && m.unit ? m.unit : "1";
        const ratio = physics().convertValue(read, { quantity: "Dimensionless", unit }, { quantity: "Dimensionless", unit: "1" });
        if (!ratio.ok) throw new Error(`$initialMasses: the fraction's unit "${unit}": ${ratio.reason}`);
        return initialMassesKg(m.species, ratio.value, numberOf("volume"), numberOf("temperatureK"), preset, m.pressurePa === undefined ? undefined : numberOf("pressurePa"));
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
        if (out.length > limit) {
            const sizes = Object.entries(vary).map(([k, v]) => `${k}: ${v.length}`).join(", ");
            throw new Error(`${Object.values(vary).reduce((p, v) => p * Math.max(1, v.length), 1)} combinations (${sizes}): at most ${limit} per evaluation; narrow the ranges, or hold the variables you are surest of in "variables" and vary the others`);
        }
    }
    return out;
}
