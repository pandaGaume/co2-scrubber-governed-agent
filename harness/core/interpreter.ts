/**
 * The interpreter: between what a model answers and what the guard judges (2026-10-08).
 *
 * A model says what it means in a shape of its own: monitoring.subjects as `[{"id":"fe-1","bandMin":45,"bandMax":120}]` where the
 * schema asks `["fe-1"]`, a speed as `"30 %"` where it asks 30. The intention is right, the form is not, and a harness that refuses
 * the form spends the model's turns on a misunderstanding (Nemotron, five refusals of its own occupants, then STUCK). A model is
 * made to read past form; the harness was not using that.
 *
 * So the call is read before it is judged, against the capability's own input schema:
 *
 *   1. it fits: nothing is touched;
 *   2. it does not: a deterministic reading guided by the schema, free, allowed only reductions that cannot be ambiguous (an
 *      object carrying one identifier where a string is expected, a number written with its unit, a lone value where a list is
 *      expected, "true"/"false" where a boolean is);
 *   3. still not: an extraction by a model (`extract`, the reasoner slot's `interpret`, the use `interpret` of routing.json: the
 *      least expensive one), asked only "find in this answer the elements this schema asks for";
 *   4. still not: the call is left as sent, and the harness refuses it as before.
 *
 * The interpreter has no authority. What it reads goes to the guard, which judges it as it judges anything; a wrong reading is
 * refused there. Every reading is kept (sent, read, how, what changed) for the trace and the manifest, and the model is told at
 * the next step how its call was read, so it learns the form without being refused for it.
 */
import { compileInputSchema, type JsonValue } from "@spiky-panda/harness";

export interface Reading {
    capability: string;
    /** `coerced`: the schema-guided reading; `extracted`: a model's extraction. */
    how: "coerced" | "extracted";
    sent: JsonValue;
    read: JsonValue;
    /** Each change, `path: what was sent -> what was read`. */
    changes: string[];
    /** The model that extracted, when one did. */
    model?: string | null;
}

/** A model asked to extract: the schema, what was sent, the capability; returns the value it read, or null. */
export type Extractor = (request: { capability: string; description: string; schema: JsonValue; sent: JsonValue }) => Promise<{ value: JsonValue | null; model?: string | null }>;

type Schema = Record<string, unknown>;
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const short = (v: unknown): string => JSON.stringify(v ?? null).slice(0, 120);

const validators = new Map<string, (input: unknown) => void>();
/** The capability's schema check: null when the value fits, else the schema's words. */
export function schemaError(schema: JsonValue, value: unknown): string | null {
    const key = JSON.stringify(schema);
    let validate = validators.get(key);
    if (!validate) {
        try {
            validate = compileInputSchema(schema) as (input: unknown) => void;
        } catch {
            return null; // a schema the validator cannot compile is not the interpreter's to judge
        }
        validators.set(key, validate);
    }
    try {
        validate(value);
        return null;
    } catch (e) {
        return (e instanceof Error ? e.message : String(e)).replace(/^Invalid capability arguments:\s*/, "");
    }
}

/** The keys an object may carry its identity under: the only ones a string is read from. */
const IDENTIFIERS = ["id", "name", "callsign", "key", "code"];
const typesOf = (s: Schema): string[] => ([] as unknown[]).concat(s.type ?? []).filter((t): t is string => typeof t === "string");
/** A number as people write it, with its unit or a percent sign after: "30", "30 %", "1.5 m3/min". */
const NUMBER = /^\s*(-?\d+(?:\.\d+)?)\s*(?:%|[a-zA-Zµ°/³²0-9 .]*)?\s*$/;

/**
 * The deterministic reading: the value reshaped toward the schema where one reduction alone fits, the changes said. Never invents a
 * value: what it cannot read without guessing it leaves as it is.
 */
export function coerce(schema: unknown, value: unknown, at = "", changes: string[] = []): unknown {
    if (!isObject(schema)) return value;
    const types = typesOf(schema);
    const only = types.length === 1 ? types[0] : null;
    const say = (to: unknown) => {
        changes.push(`${at || "(the call)"}: ${short(value)} -> ${short(to)}`);
        return to;
    };
    if (only === "string" && isObject(value)) {
        const ids = IDENTIFIERS.filter((k) => typeof value[k] === "string" && (value[k] as string).length > 0);
        if (ids.length >= 1 && new Set(ids.map((k) => value[k])).size === 1) return say(value[ids[0]!]);
        return value;
    }
    if (only === "string" && (typeof value === "number" || typeof value === "boolean")) return say(String(value));
    if ((only === "number" || only === "integer") && typeof value === "string") {
        const m = NUMBER.exec(value);
        if (m) {
            const n = Number(m[1]);
            if (Number.isFinite(n) && (only === "number" || Number.isInteger(n))) return say(n);
        }
        return value;
    }
    if (only === "boolean" && typeof value === "string" && /^(true|false)$/i.test(value.trim())) return say(value.trim().toLowerCase() === "true");
    if (only === "array") {
        const list = Array.isArray(value) ? value : value === undefined || value === null ? value : (say([value]) as unknown[]);
        if (!Array.isArray(list)) return list;
        const items = schema.items;
        return isObject(items) ? list.map((x, i) => coerce(items, x, `${at}.${i}`.replace(/^\./, ""), changes)) : list;
    }
    if ((only === "object" || (!only && isObject(schema.properties))) && isObject(value) && isObject(schema.properties)) {
        const props = schema.properties as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) out[k] = k in props ? coerce(props[k], v, `${at}.${k}`.replace(/^\./, ""), changes) : v;
        return out;
    }
    return value;
}

/**
 * Reads a call against its capability's schema. Returns the input to hand the guard and the reading, null when the call fit as sent
 * or when nothing read made it fit (then the input is the one sent, and the harness refuses it as before).
 */
export async function interpret(capability: { id: string; description?: string; inputSchema?: JsonValue }, sent: JsonValue, extract?: Extractor | null): Promise<{ input: JsonValue; reading: Reading | null; error: string | null }> {
    const schema = capability.inputSchema;
    if (schema === undefined || schema === null) return { input: sent, reading: null, error: null };
    const first = schemaError(schema, sent);
    if (!first) return { input: sent, reading: null, error: null };
    const changes: string[] = [];
    const coerced = coerce(schema, sent, "", changes) as JsonValue;
    if (changes.length && !schemaError(schema, coerced)) return { input: coerced, reading: { capability: capability.id, how: "coerced", sent, read: coerced, changes }, error: null };
    if (extract) {
        try {
            const x = await extract({ capability: capability.id, description: capability.description ?? "", schema, sent });
            if (x.value !== null && x.value !== undefined && !schemaError(schema, x.value)) {
                return { input: x.value, reading: { capability: capability.id, how: "extracted", sent, read: x.value, changes: [`${short(sent)} -> ${short(x.value)}`], model: x.model ?? null }, error: null };
            }
        } catch {
            // an extraction that fails leaves the call as sent: the harness refuses it with the schema's own words
        }
    }
    return { input: sent, reading: null, error: first };
}

/** What the model reads at the next step about how its last call was read. */
export function readingNote(r: Reading): string {
    return `your call ${r.capability} did not have the shape its schema gives; the harness read it (${r.how === "coerced" ? "by the schema" : "by an extraction"}) as ${r.changes.join("; ")}; use that shape next time. `;
}
