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
    /** `coerced`: the schema-guided reading; `extracted`: a model's extraction; `meant`: a model's reading of what a call meant (the second trigger). */
    how: "coerced" | "extracted" | "meant";
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
 * The form of an identifier that names a file (a procedure, a playbook): lower case words and dashes. A schema says it by this
 * pattern, and an identifier written another way ("V_Lab Measure 01") is the same identifier once written in that form: the reading
 * is a reduction, never a guess (2026-10-10, run 5: Nemotron Nano was refused twice on "v_lab-measure-2026-10-14-01", an underscore).
 */
export const FILE_ID_PATTERN = "^[a-z0-9][a-z0-9-]{0,63}$";
const FILE_ID = new RegExp(FILE_ID_PATTERN);

/** An identifier written in the form of a file's name: accents dropped, lower case, every other run of characters a dash. */
export function asFileId(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64)
        .replace(/-+$/, "");
}

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
    if (only === "string" && typeof value === "string" && schema.pattern === FILE_ID_PATTERN && !FILE_ID.test(value)) {
        const id = asFileId(value);
        return FILE_ID.test(id) ? say(id) : value;
    }
    if ((only === "number" || only === "integer") && typeof value === "string") {
        const m = NUMBER.exec(value);
        if (m) {
            const n = Number(m[1]);
            if (Number.isFinite(n) && (only === "number" || Number.isInteger(n))) return say(n);
        }
        return value;
    }
    if (only === "boolean" && typeof value === "string" && /^(true|false)$/i.test(value.trim())) return say(value.trim().toLowerCase() === "true");
    // A pair of pairs where an object {from, to} of two pairs is asked (a connection, 2026-10-10, run 20: [["a", "out"], ["b", "in"]]): read as
    // the object, the first the source, the second the destination; the schema says it, the reading guesses nothing.
    if ((only === "object" || (!only && isObject(schema.properties))) && Array.isArray(value) && value.length === 2 && isObject(schema.properties)) {
        const props = schema.properties as Record<string, unknown>;
        const keys = Object.keys(props);
        const pair = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "string");
        const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
        if (keys.length === 2 && keys.every((k) => typesOf(props[k] as Schema).includes("array")) && required.length === 2 && value.every(pair)) return say({ [required[0]!]: value[0], [required[1]!]: value[1] });
    }
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
    if (r.how === "meant") return `your call ${r.capability} had the right form but did not change what was refused; the harness read what you meant and ran it: ${r.changes.join("; ")}; write it that way next time. `;
    return `your call ${r.capability} did not have the shape its schema gives; the harness read it (${r.how === "coerced" ? "by the schema" : "by an extraction"}) as ${r.changes.join("; ")}; use that shape next time. `;
}

/**
 * The second trigger: the meaning (2026-10-08). A schema checks a form; a call can have the right form and not do what its author
 * meant. Nemotron Nano corrected its CO2 maximum as `"limits.co2MaxPpm": {"value": 3199, ...}` inside a free `changes` object: the
 * schema passed, the harness merged a new root key, the limit stayed at 3200, and the guard refused the same point three times.
 * The model had understood the refusal; the harness had not read the answer.
 *
 * The signal is generic: a refusal on the same points as the one before, where a point's value did not move although the model
 * sent something else. Then a model is asked what the call meant, given the points refused with what is expected there, the call
 * sent and its stated reason, and writes it in the tool's form, or null. A capable model for that (the use `meaning` of
 * routing.json); asked once per points refused, so a misreading is not repeated. What it reads goes back through the whole loop:
 * the guard judges it as anything else.
 */
export interface MeaningRequest {
    capability: string;
    description: string;
    schema: JsonValue;
    /** The arguments the model sent. */
    sent: JsonValue;
    /** The points refused, each with its path, what is expected there and what is there now. */
    refused: Array<{ path?: string; expected?: string; got?: string; says: string }>;
    /** What the model said it meant (its rationale, or the reasons it wrote in the call). */
    intent: string;
}
export type MeaningReader = (request: MeaningRequest) => Promise<{ value: JsonValue | null; model?: string | null }>;

/**
 * The points a call did not move: refused again at the same path with the same value as at the refusal before it. The call may be
 * the same one sent again: a model that resends its correction believes it made it (2026-10-08, Nano sent the same revise three
 * times, each time "limits.co2MaxPpm": {"value": 3100} as a key, the limit still 3200). Empty when nothing refused stayed in place.
 */
export function unmoved(
    before: { problems: Array<{ path?: string; got?: string }> } | null,
    now: { problems: Array<{ path?: string; got?: string; expected?: string; says: string }> },
): Array<{ path?: string; got?: string; expected?: string; says: string }> {
    if (!before) return [];
    return now.problems.filter((p) => p.path && p.got !== undefined && before.problems.some((b) => b.path === p.path && b.got === p.got));
}

/** What a reading of the meaning gave, kept as evidence whether it was used or not: the value read, or why nothing was. */
export interface MeaningOutcome {
    /** The points it was asked about. */
    points: string[];
    model: string | null;
    /** `read`: run at the next step; `null`: the model could not tell; `invalid`: what it wrote does not fit the schema; `same`: it wrote what was sent; `failed`: the call to it failed. */
    result: "read" | "null" | "invalid" | "same" | "failed";
    /** What it wrote, or why it failed. */
    detail: string;
}

/** Reads what a call meant, toward its schema: the value read when it fits the schema and differs from what was sent; the outcome kept either way. */
export async function readMeaning(request: MeaningRequest, reader: MeaningReader): Promise<{ input: JsonValue; reading: Reading; outcome: MeaningOutcome } | { outcome: MeaningOutcome }> {
    const points = request.refused.map((p) => p.path ?? p.says);
    try {
        const r = await reader(request);
        const model = r.model ?? null;
        if (r.value === null || r.value === undefined) return { outcome: { points, model, result: "null", detail: "the model could not tell what the call meant" } };
        const error = schemaError(request.schema, r.value);
        if (error) return { outcome: { points, model, result: "invalid", detail: `${short(r.value)}: ${error}` } };
        if (JSON.stringify(r.value) === JSON.stringify(request.sent)) return { outcome: { points, model, result: "same", detail: "the model wrote back what was sent" } };
        const reading: Reading = { capability: request.capability, how: "meant", sent: request.sent, read: r.value, changes: [`what the call meant for ${points.join(", ")}: ${short(r.value)}`], model };
        return { input: r.value, reading, outcome: { points, model, result: "read", detail: JSON.stringify(r.value).slice(0, 2000) } };
    } catch (e) {
        return { outcome: { points, model: null, result: "failed", detail: e instanceof Error ? e.message : String(e) } };
    }
}
