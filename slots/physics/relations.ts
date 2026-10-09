/**
 * Conversions between quantities that a physical relation ties together
 * (2026-09-28), beside the units service's conversions within one quantity
 * (`units.ts`). A builder asks for the conversion instead of redoing work
 * already done: a person's CO2 is documented in g/min and in L/min, a
 * scrubber's removal is a mass flow in kg/s and a room reads it in ppm per
 * minute, a concentration in ppm is a mass per cubic metre.
 *
 * The relations are the physics slot's knowledge graph (`knowledge.ts`,
 * `specs/physics/knowledge.json`): a SpikyPanda graph whose relation nodes
 * read a quantity, give another, need parameters and follow a law holding
 * its constants, each formula written as data. This file reads them off the
 * graph and applies them; it holds no relation, no law and no constant. A
 * parameter the caller does not give takes the default the caller of
 * `relate` passes, a fact of the library (`specs/physics/relation-defaults.json`,
 * read by the physics slot): the answer says which were given and which
 * defaulted, from which fact.
 */
import { readFileSync } from "node:fs";
import { fromRoot } from "../../lib/paths.js";
import { evaluateExpression } from "../../lib/expression.js";
import { canonicalQuantity, convertValue, type UnitRef } from "./units.js";
import { physicsKnowledge, type KnowledgeNode } from "./knowledge.js";

/** The parameters the physics slot defaults, by name, as the spec names them (`specs/physics/relation-defaults.json`); their values are the library's. */
export const defaultedParameters = (): string[] => Object.keys((JSON.parse(readFileSync(fromRoot("specs", "physics", "relation-defaults.json"), "utf8")) as { defaults: Record<string, string> }).defaults);

export interface RelationParameter {
    quantity: string;
    unit: string;
    description: string;
}

/** A parameter's default, as the caller of `relate` knows it: a value in some unit, and the fact it comes from. */
export interface RelationDefault {
    value: number;
    unit: string;
    fact?: string;
}

export interface Relation {
    id: string;
    title: string;
    /** The quantity and the unit the formula reads its value in (the unit system's base unit for it). */
    from: { quantity: string; unit: string };
    /** The quantity and the unit the formula gives; `derived` when the unit system does not know it (a reading, not a contract's quantity). */
    to: { quantity: string; unit: string; derived?: boolean; units?: Record<string, number> };
    parameters: Record<string, RelationParameter>;
    formula: string;
    /** The law it follows, and its constants by symbol. */
    law: string | null;
    apply(value: number, p: Record<string, number>): number;
    invert(value: number, p: Record<string, number>): number;
}

/** A relation node of the knowledge graph, as the conversions use it: its sides, its parameters, its formulas over v, the parameters and the law's constants. */
function relationOf(node: KnowledgeNode): Relation {
    const k = physicsKnowledge();
    const { from, to, parameters } = k.sidesOf(node);
    const bag = node.bag ?? {};
    const constants = k.constantsOf(node);
    const law = k.out(node, "physics.follows")[0]?.ofin?.id;
    const side = (q: KnowledgeNode) => ({ quantity: String(q.id), unit: String(q.bag?.unit) });
    const derived = Boolean(to.bag?.derived);
    const run = (expression: string) => (value: number, p: Record<string, number>) => evaluateExpression(expression, { ...constants, ...p, v: value });
    return {
        id: String(node.id),
        title: String(bag.title ?? node.id),
        from: side(from),
        to: { ...side(to), ...(derived ? { derived: true, units: k.unitsOf(to) } : {}) },
        parameters: Object.fromEntries(parameters.map((x) => [x.name, { quantity: String(x.quantity.id), unit: String(x.quantity.bag?.unit), description: x.description }])),
        formula: String(bag.formula ?? bag.forward),
        law: law === undefined ? null : String(law),
        apply: run(String(bag.forward)),
        invert: run(String(bag.inverse)),
    };
}

/** The relations of the knowledge graph, read off it once. */
export const RELATIONS: ReadonlyArray<Relation> = physicsKnowledge().nodesOf("physics.relation").map(relationOf);

export interface Related {
    value: number;
    unit: string;
    quantity: string;
    derived: boolean;
    relation: string;
    formula: string;
    direction: "forward" | "inverse";
    parameters: Record<string, { value: number; unit: string; given: boolean; fact?: string }>;
    /** The justification of a number derived this way: source derived, the formula and its values as the reference. */
    cite: { source: "derived"; reference: string };
}

const same = (a: string, b: string): boolean => (canonicalQuantity(a) ?? a).toLowerCase() === (canonicalQuantity(b) ?? b).toLowerCase();

/** The relation between two quantities, either way, or null. */
export function relationBetween(from: string, to: string): { relation: Relation; direction: "forward" | "inverse" } | null {
    for (const relation of RELATIONS) {
        if (same(relation.from.quantity, from) && same(relation.to.quantity, to)) return { relation, direction: "forward" };
        if (same(relation.to.quantity, from) && same(relation.from.quantity, to)) return { relation, direction: "inverse" };
    }
    return null;
}

/** A value read in its unit, in the unit a side of a relation works in; the derived side by its own table. */
function toSide(value: number, ref: UnitRef, side: Relation["from"] | Relation["to"]): number {
    const table = (side as Relation["to"]).units;
    if (table) {
        const f = table[ref.unit];
        if (f === undefined) throw new Error(`"${ref.unit}" is not a unit of ${side.quantity} here; its units are ${Object.keys(table).join(", ")}`);
        return value * f;
    }
    const c = convertValue(value, ref, { quantity: side.quantity, unit: side.unit });
    if (!c.ok) throw new Error(`${c.code}: ${c.reason}`);
    return c.value;
}
function fromSide(value: number, side: Relation["from"] | Relation["to"], ref: UnitRef): number {
    const table = (side as Relation["to"]).units;
    if (table) {
        const f = table[ref.unit];
        if (f === undefined) throw new Error(`"${ref.unit}" is not a unit of ${side.quantity} here; its units are ${Object.keys(table).join(", ")}`);
        return value / f;
    }
    const c = convertValue(value, { quantity: side.quantity, unit: side.unit }, ref);
    if (!c.ok) throw new Error(`${c.code}: ${c.reason}`);
    return c.value;
}

/**
 * A value converted from one quantity to a related one. `parameters` by name, as numbers in the parameter's unit or as { value, unit };
 * `defaults` by name, for those not given (the library's facts, as the physics slot reads them).
 * Refused when no relation ties the two quantities, when a parameter is neither given nor defaulted, or when a unit does not fit.
 */
export function relate(value: number, from: UnitRef & { quantity: string }, to: UnitRef & { quantity: string }, given: Record<string, unknown> = {}, defaults: Record<string, RelationDefault> = {}): Related {
    const found = relationBetween(from.quantity, to.quantity);
    if (!found) throw new Error(`no relation ties ${from.quantity} to ${to.quantity}; the relations are ${RELATIONS.map((r) => `${r.from.quantity} <-> ${r.to.quantity} (${r.id})`).join("; ")}`);
    const { relation, direction } = found;
    const parameters: Related["parameters"] = {};
    const p: Record<string, number> = {};
    const missing: string[] = [];
    for (const [name, spec] of Object.entries(relation.parameters)) {
        const raw = given[name];
        let v: number | undefined;
        if (typeof raw === "number") v = raw;
        else if (raw && typeof raw === "object" && typeof (raw as { value?: unknown }).value === "number") {
            const r = raw as { value: number; unit?: string };
            const c = convertValue(r.value, { quantity: spec.quantity, unit: r.unit ?? spec.unit }, { quantity: spec.quantity, unit: spec.unit });
            if (!c.ok) throw new Error(`parameter ${name}: ${c.code}: ${c.reason}`);
            v = c.value;
        }
        const fallback = defaults[name];
        let d: number | undefined;
        if (v === undefined && fallback) {
            const c = convertValue(fallback.value, { quantity: spec.quantity, unit: fallback.unit }, { quantity: spec.quantity, unit: spec.unit });
            if (!c.ok) throw new Error(`the default of ${name}${fallback.fact ? ` (${fallback.fact})` : ""}: ${c.code}: ${c.reason}`);
            d = c.value;
        }
        if (v === undefined && d === undefined) {
            missing.push(`${name} (${spec.description}, in ${spec.unit})`);
            continue;
        }
        p[name] = v ?? (d as number);
        parameters[name] = { value: p[name], unit: spec.unit, given: v !== undefined, ...(v === undefined && fallback?.fact ? { fact: fallback.fact } : {}) };
    }
    if (missing.length) throw new Error(`relation ${relation.id} needs ${missing.join(", ")}`);
    const [inSide, outSide] = direction === "forward" ? [relation.from, relation.to] : [relation.to, relation.from];
    const base = toSide(value, from, inSide);
    const out = direction === "forward" ? relation.apply(base, p) : relation.invert(base, p);
    return {
        value: fromSide(out, outSide, to),
        unit: to.unit,
        quantity: outSide.quantity,
        derived: Boolean((outSide as Relation["to"]).derived),
        relation: relation.id,
        formula: relation.formula,
        direction,
        parameters,
        // The justification of a number derived this way, to write as it is (2026-10-09: the reference of a derived value is its formula, given by the tool, not composed).
        cite: { source: "derived", reference: `${relation.formula} (${Object.entries(parameters).map(([k, v]) => `${k} = ${v.value}${v.unit ? ` ${v.unit}` : ""}`).join(", ")}; ${value} ${from.unit} -> ${fromSide(out, outSide, to)} ${to.unit})` },
    };
}
