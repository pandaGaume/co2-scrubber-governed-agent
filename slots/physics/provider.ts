/**
 * The `physics` slot: the units, deterministic, for every loop that reads or
 * writes a number with a unit (2026-09-25). Four tools over
 * `harness/lib/units.ts`, itself a facade over the substrate's unit system
 * (UCUM codes as identities, the core's conversions):
 *
 *   units_normalize            a unit as written -> the quantity, the UCUM code, the factor
 *   units_convert              a value from one unit to another of the same quantity
 *   units_compatible           whether two units measure the same quantity
 *   units_validate_connection  a source's value in its unit against a request's in another:
 *                              OK, or INVALID_CONVERSION with the expected value
 *   units_relations            the relations between quantities (harness/lib/relations.ts)
 *   units_relate               a value from one quantity to a related one: a gas's L/min as g/min,
 *                              ppm as mg/m3, a mass flow into a volume as ppm per minute
 *
 * No state, no model: the same question gets the same answer. A unit the
 * system does not know is said unknown, never guessed. A relation's
 * parameter the caller does not give takes a fact of the library, as
 * `specs/physics/relation-defaults.json` names it (the gas, the cabin's
 * pressure and temperature): the answer says which fact.
 */
import { readFileSync } from "node:fs";
import { fromRoot } from "../../lib/paths.js";
import { compatibleUnits, convertValue, resolveUnitRef, validateConnection, type UnitRef } from "./units.js";
import { RELATIONS, relate, type RelationDefault } from "./relations.js";
import { physicsKnowledge } from "./knowledge.js";
import { LIBRARY_DIR, loadLibrary } from "../tools/library/provider.js";

export const RELATION_DEFAULTS_FILE = "specs/physics/relation-defaults.json";

/** The defaults of the relations' parameters, each the library fact the spec names; a fact the library does not hold is a startup problem. */
export function relationDefaults(dir: string = LIBRARY_DIR): Record<string, RelationDefault> {
    const spec = JSON.parse(readFileSync(fromRoot(...RELATION_DEFAULTS_FILE.split("/")), "utf8")) as { defaults: Record<string, string> };
    const facts = loadLibrary(dir).flatMap((d) => d.facts);
    return Object.fromEntries(
        Object.entries(spec.defaults).map(([name, id]) => {
            const f = facts.find((x) => x.id === id);
            if (!f) throw new Error(`${RELATION_DEFAULTS_FILE}: the default of ${name} is the fact "${id}", which no library document holds`);
            return [name, { value: f.value, unit: f.unit, fact: f.id }];
        }),
    );
}
import { objectSchema, publishSlot, type PublishedSlot, type SlotTool } from "../lib/slot-server.js";
// Loading the slot plugs its units and laws into the harnesses of this process (harness/core/physics.ts).
import { installPhysics } from "./port.js";

export type PhysicsState = Record<string, never>;

const UNIT_REF = { type: "object", properties: { quantity: { type: "string" }, unit: { type: "string" } }, required: ["unit"] } as const;
const STATEMENT = { type: "object", properties: { value: { type: "number" }, quantity: { type: "string" }, unit: { type: "string" } }, required: ["value", "unit"] } as const;

const ref = (v: unknown): UnitRef => {
    const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    return { unit: String(o.unit ?? ""), ...(typeof o.quantity === "string" && o.quantity ? { quantity: o.quantity } : {}) };
};

export function physicsSlot(wsBase: string, log: (line: string) => void): PublishedSlot<PhysicsState> {
    installPhysics();
    const defaults = relationDefaults();
    const tools: SlotTool<PhysicsState>[] = [
        {
            name: "units_normalize",
            inputSchema: objectSchema({ quantity: { type: "string" }, unit: { type: "string" } }, ["unit"]),
            handle: (args) => {
                const r = resolveUnitRef(ref(args));
                if (!r.ok) throw new Error(`${r.code}: ${r.reason}`);
                return r.unit;
            },
        },
        {
            name: "units_convert",
            inputSchema: objectSchema({ value: { type: "number" }, from: UNIT_REF, to: UNIT_REF }, ["value", "from", "to"]),
            handle: (args) => {
                const c = convertValue(Number(args.value), ref(args.from), ref(args.to));
                if (!c.ok) throw new Error(`${c.code}: ${c.reason}`);
                // The justification of the converted number, to write as it is: the conversion is its formula.
                return { value: c.value, factor: c.factor, from: c.from, to: c.to, cite: { source: "derived", reference: `${Number(args.value)} x ${c.factor} (${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}) = ${c.value}` } };
            },
        },
        {
            name: "units_compatible",
            inputSchema: objectSchema({ a: UNIT_REF, b: UNIT_REF }, ["a", "b"]),
            handle: (args) => {
                const c = compatibleUnits(ref(args.a), ref(args.b));
                if (!c.ok) throw new Error(`${c.code}: ${c.reason}`);
                return { compatible: c.compatible, a: c.a, b: c.b, ...(c.reason ? { reason: c.reason } : {}) };
            },
        },
        {
            name: "units_validate_connection",
            inputSchema: objectSchema({ source: STATEMENT, target: STATEMENT, tolerance: { type: "number" } }, ["source", "target"]),
            handle: (args) => {
                const s = args.source as { value: unknown; quantity?: string; unit: string };
                const t = args.target as { value: unknown; quantity?: string; unit: string };
                const c = validateConnection({ value: Number(s.value), ...ref(s) }, { value: Number(t.value), ...ref(t) }, typeof args.tolerance === "number" ? args.tolerance : undefined);
                if (!c.ok && c.code !== "INVALID_CONVERSION") throw new Error(`${c.code}: ${c.reason}`);
                return c;
            },
        },
        {
            name: "units_relations",
            inputSchema: objectSchema({}),
            handle: () => ({
                relations: RELATIONS.map((r) => ({ id: r.id, title: r.title, from: r.from, to: { quantity: r.to.quantity, unit: r.to.unit, ...(r.to.derived ? { derived: true, units: Object.keys(r.to.units ?? {}) } : {}) }, formula: r.formula, parameters: Object.fromEntries(Object.entries(r.parameters).map(([k, p]) => [k, { ...p, ...(defaults[k] ? { default: defaults[k] } : {}) }])) })),
            }),
        },
        {
            // The knowledge graph the relations are read from, to navigate (2026-09-28): a node and its typed links, the nodes of a type, or the chain of relations from one quantity to another.
            name: "units_knowledge",
            inputSchema: objectSchema({ id: { type: "string" }, type: { type: "string" }, from: { type: "string" }, to: { type: "string" } }),
            handle: (args) => {
                const k = physicsKnowledge();
                const brief = (n: { id?: unknown; type?: string; bag?: unknown }) => ({ id: String(n.id), type: n.type ?? null, ...(n.bag && typeof n.bag === "object" && Object.keys(n.bag).length ? { bag: n.bag } : {}) });
                if (typeof args.from === "string" && typeof args.to === "string") {
                    const path = k.pathBetween(args.from, args.to);
                    if (!path) throw new Error(`no chain of relations ties ${args.from} to ${args.to}`);
                    return { from: args.from, to: args.to, path: path.map((p) => ({ relation: String(p.relation.id), direction: p.direction, title: String(p.relation.bag?.title ?? "") })) };
                }
                if (typeof args.id === "string" && args.id) {
                    const n = k.node(args.id) ?? k.quantity(args.id);
                    if (!n) throw new Error(`no node "${args.id}" in the knowledge graph`);
                    return {
                        ...brief(n),
                        out: n.onsc().map((l) => ({ type: l.type ?? null, to: String(l.ofin?.id), ...(l.bag && Object.keys(l.bag as object).length ? { bag: l.bag } : {}) })),
                        in: n.opsc().map((l) => ({ type: l.type ?? null, from: String(l.oini?.id), ...(l.bag && Object.keys(l.bag as object).length ? { bag: l.bag } : {}) })),
                    };
                }
                const type = typeof args.type === "string" && args.type ? args.type : "physics.item";
                return { type, nodes: k.nodesOf(type).map(brief) };
            },
        },
        {
            name: "units_relate",
            inputSchema: objectSchema(
                {
                    value: { type: "number" },
                    from: { type: "object", properties: { quantity: { type: "string" }, unit: { type: "string" } }, required: ["quantity", "unit"] },
                    to: { type: "object", properties: { quantity: { type: "string" }, unit: { type: "string" } }, required: ["quantity", "unit"] },
                    parameters: { type: "object" },
                },
                ["value", "from", "to"],
            ),
            handle: (args) => {
                const f = args.from as { quantity: string; unit: string };
                const t = args.to as { quantity: string; unit: string };
                return relate(Number(args.value), { quantity: String(f.quantity), unit: String(f.unit) }, { quantity: String(t.quantity), unit: String(t.unit) }, (args.parameters ?? {}) as Record<string, unknown>, defaults);
            },
        },
    ];
    return publishSlot<PhysicsState>({
        slot: "physics",
        tools,
        resources: [],
        state: {},
        wsBase,
        log,
        stub: false,
        version: "0.1.0",
        grammarsDir: fromRoot("slots", "physics", "grammars"),
    });
}
