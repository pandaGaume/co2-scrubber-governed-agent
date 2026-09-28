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
 * system does not know is said unknown, never guessed.
 */
import { fromRoot } from "../../lib/paths.js";
import { compatibleUnits, convertValue, resolveUnitRef, validateConnection, type UnitRef } from "../../harness/lib/units.js";
import { RELATIONS, relate } from "../../harness/lib/relations.js";
import { objectSchema, publishSlot, type PublishedSlot, type SlotTool } from "../lib/slot-server.js";

export type PhysicsState = Record<string, never>;

const UNIT_REF = { type: "object", properties: { quantity: { type: "string" }, unit: { type: "string" } }, required: ["unit"] } as const;
const STATEMENT = { type: "object", properties: { value: { type: "number" }, quantity: { type: "string" }, unit: { type: "string" } }, required: ["value", "unit"] } as const;

const ref = (v: unknown): UnitRef => {
    const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    return { unit: String(o.unit ?? ""), ...(typeof o.quantity === "string" && o.quantity ? { quantity: o.quantity } : {}) };
};

export function physicsSlot(wsBase: string, log: (line: string) => void): PublishedSlot<PhysicsState> {
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
                return { value: c.value, factor: c.factor, from: c.from, to: c.to };
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
                relations: RELATIONS.map((r) => ({ id: r.id, title: r.title, from: r.from, to: { quantity: r.to.quantity, unit: r.to.unit, ...(r.to.derived ? { derived: true, units: Object.keys(r.to.units ?? {}) } : {}) }, formula: r.formula, parameters: r.parameters })),
            }),
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
                return relate(Number(args.value), { quantity: String(f.quantity), unit: String(f.unit) }, { quantity: String(t.quantity), unit: String(t.unit) }, (args.parameters ?? {}) as Record<string, unknown>);
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
