/**
 * The physical units, deterministic and transversal (2026-09-25): what the
 * Observer, the graph factory and the procedure factory call when a number
 * carries a unit, instead of converting in their head.
 *
 * It is a facade over the substrate's own unit system
 * (`@spiky-panda/core`, `math.units.ts`): 39 quantities, each with its table
 * of units, every unit carrying its UCUM code as its canonical identity and
 * its factor to the quantity's base unit; the conversions are the core's
 * (`Quantity.Convert`, linear or affine). Nothing is declared twice here.
 *
 * What the core does not do, and this does:
 *
 *   resolve      a unit from any spelling a person or a model writes: the
 *                core's key ("Lpmin", "m3ps"), its UCUM code ("L/min",
 *                "m3/s"), its display symbol ("L/min", "m³/s"), with the
 *                typographic characters and the spaces normalised, and the
 *                quantity given under its industrial name ("Concentration",
 *                "VolumetricFlow", "MassFlow") or the core's;
 *   convert      a value between two units of one quantity, refused across
 *                quantities;
 *   compatible   whether two units measure the same quantity;
 *   validate     a connection: a source stating a value in one unit and a
 *                request stating it in another must agree once converted,
 *                or the request is an INVALID_CONVERSION (1.0 m3/min written
 *                as 60 L/min);
 *   quantitiesIn the numbers with a unit a text states, so a document read
 *                by the Observer can be checked against what it wrote.
 *
 * A unit this table does not know is said unknown, never guessed.
 */
import { Quantity, quantityNames, quantityUnits, resolveQuantityKind, type Unit } from "@spiky-panda/core";

export interface UnitRef {
    /** The quantity, when known: the core's name or an industrial alias; without it the unit alone decides, and may be ambiguous. */
    quantity?: string;
    unit: string;
}

export interface ResolvedUnit {
    /** The core's quantity name (`VolumetricFlow`, `Dimensionless`, `MassFlow`). */
    quantity: string;
    /** The semantic kind (`VolumeFlowRate`, `Dimensionless`, `MassFlowRate`). */
    kind: string;
    /** The core's key in the quantity's table (`Lpmin`). */
    key: string;
    /** The canonical identity: the UCUM code (`L/min`); the key when the core declares none. */
    ucum: string;
    symbol: string;
    name: string;
    /** 1 unit = toBase base units of the quantity. */
    toBase: number;
}

export type Resolution = { ok: true; unit: ResolvedUnit } | { ok: false; code: "UNKNOWN_UNIT" | "UNKNOWN_QUANTITY" | "AMBIGUOUS_UNIT"; reason: string; candidates?: ResolvedUnit[] };

/** The industrial names the demo speaks, over the core's quantity names (case and punctuation do not matter). */
const QUANTITY_ALIASES: Record<string, string> = {
    concentration: "Dimensionless",
    molefraction: "Dimensionless",
    ratio: "Dimensionless",
    efficiency: "Dimensionless",
    fraction: "Dimensionless",
    volumeflowrate: "VolumetricFlow",
    volumetricflow: "VolumetricFlow",
    volumeflow: "VolumetricFlow",
    airflow: "VolumetricFlow",
    flow: "VolumetricFlow",
    massflowrate: "MassFlow",
    massflow: "MassFlow",
    duration: "Timespan",
    time: "Timespan",
    timeconstant: "Timespan",
    electriccurrent: "Current",
    planeangle: "Angle",
    velocity: "Speed",
    electricpotential: "Voltage",
};

const letters = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, "");

/** The core's quantity name for a name a caller writes, or null. */
export function canonicalQuantity(name: string): string | null {
    const names = quantityNames();
    if (names.includes(name)) return name;
    const l = letters(name);
    if (QUANTITY_ALIASES[l]) return QUANTITY_ALIASES[l];
    return names.find((n) => letters(n) === l) ?? names.find((n) => letters(resolveQuantityKind(n) ?? "") === l) ?? null;
}

/** A unit as written, made comparable: typographic characters, spaces, powers and "per" normalised. */
export function normalizeUnitText(text: string): string {
    return text
        .trim()
        .replace(/³/g, "3")
        .replace(/²/g, "2")
        .replace(/µ/g, "u")
        .replace(/·|×|\*/g, ".")
        .replace(/\s+per\s+/gi, "/")
        .replace(/\^/g, "")
        .replace(/\s*\/\s*/g, "/")
        .replace(/\s+/g, "");
}

const resolved = (quantity: string, key: string, u: Unit): ResolvedUnit => ({ quantity, kind: resolveQuantityKind(quantity) ?? quantity, key, ucum: u.ucum ?? key, symbol: u.symbol, name: u.name, toBase: u.value });

/** How a spelling matched: its canonical code or the core's key first, the display symbol next, a case-insensitive spelling or the name last. */
type MatchStrength = 3 | 2 | 1;

function matchIn(quantity: string, text: string): { key: string; unit: Unit; strength: MatchStrength } | null {
    const units = quantityUnits(quantity);
    if (!units) return null;
    const n = normalizeUnitText(text);
    const entries = Object.entries(units);
    const byKey = entries.find(([k]) => k === text || k === n);
    if (byKey) return { key: byKey[0], unit: byKey[1], strength: 3 };
    const byUcum = entries.find(([, u]) => u.ucum !== undefined && normalizeUnitText(u.ucum) === n);
    if (byUcum) return { key: byUcum[0], unit: byUcum[1], strength: 3 };
    const bySymbol = entries.find(([, u]) => u.symbol !== "" && normalizeUnitText(u.symbol) === n);
    if (bySymbol) return { key: bySymbol[0], unit: bySymbol[1], strength: 2 };
    // Loosely: case ignored, a UCUM annotation's braces ignored ("{person}" for "person"), a plural for a singular and back.
    const lower = n.toLowerCase();
    const forms = new Set([lower, lower.endsWith("s") ? lower.slice(0, -1) : `${lower}s`]);
    const bare = (u: string) => u.replace(/[{}]/g, "").toLowerCase();
    const loose = entries.find(([k, u]) => forms.has(k.toLowerCase()) || forms.has(bare(u.ucum ?? "")) || forms.has(normalizeUnitText(u.symbol).toLowerCase()) || forms.has(u.name.toLowerCase().replace(/\s+/g, "")));
    return loose ? { key: loose[0], unit: loose[1], strength: 1 } : null;
}

/** The core's unit behind a spelling, with the quantity when given; ambiguous across quantities when not. */
export function resolveUnitRef(ref: UnitRef): Resolution {
    const text = String(ref.unit ?? "").trim();
    if (!text) return { ok: false, code: "UNKNOWN_UNIT", reason: "no unit written" };
    if (ref.quantity) {
        const q = canonicalQuantity(ref.quantity);
        if (!q) return { ok: false, code: "UNKNOWN_QUANTITY", reason: `no quantity "${ref.quantity}" in the unit system (${quantityNames().join(", ")})` };
        const m = matchIn(q, text);
        if (!m) return { ok: false, code: "UNKNOWN_UNIT", reason: `no unit "${text}" for ${q}; its units are ${Object.entries(quantityUnits(q) ?? {}).map(([k, u]) => `${u.ucum ?? k} (${u.name})`).join(", ")}` };
        return { ok: true, unit: resolved(q, m.key, m.unit) };
    }
    const matches: Array<{ unit: ResolvedUnit; strength: MatchStrength }> = [];
    for (const q of quantityNames()) {
        const m = matchIn(q, text);
        if (m) matches.push({ unit: resolved(q, m.key, m.unit), strength: m.strength });
    }
    if (!matches.length) return { ok: false, code: "UNKNOWN_UNIT", reason: `no unit "${text}" in the unit system, under any quantity` };
    // A code or a key outranks a display symbol ("m" is the metre's code and the minute's symbol): only the strongest matches compete.
    const best = Math.max(...matches.map((m) => m.strength));
    const found = matches.filter((m) => m.strength === best).map((m) => m.unit);
    // The same code under two quantities of one kind (a count and a ratio are both "1") is one unit, not an ambiguity.
    const kinds = new Set(found.map((f) => `${f.kind}:${f.ucum}`));
    if (kinds.size === 1) return { ok: true, unit: found[0] };
    return { ok: false, code: "AMBIGUOUS_UNIT", reason: `"${text}" is a unit of ${found.map((f) => `${f.quantity} (${f.name})`).join(" and of ")}: say the quantity`, candidates: found };
}

const unitOf = (r: ResolvedUnit): Unit | undefined => quantityUnits(r.quantity)?.[r.key];

export type Conversion = { ok: true; value: number; from: ResolvedUnit; to: ResolvedUnit; factor: number } | { ok: false; code: "INCOMPATIBLE_QUANTITY" | Exclude<Resolution, { ok: true }>["code"]; reason: string };

/** Whether two resolved units measure the same quantity (the same kind). */
export function sameQuantity(a: ResolvedUnit, b: ResolvedUnit): boolean {
    return a.quantity === b.quantity || a.kind === b.kind;
}

export function convertValue(value: number, from: UnitRef, to: UnitRef): Conversion {
    const a = resolveUnitRef(from);
    if (!a.ok) return { ok: false, code: a.code, reason: `from: ${a.reason}` };
    const b = resolveUnitRef(to);
    if (!b.ok) return { ok: false, code: b.code, reason: `to: ${b.reason}` };
    if (!sameQuantity(a.unit, b.unit)) return { ok: false, code: "INCOMPATIBLE_QUANTITY", reason: `${a.unit.ucum} is a ${a.unit.quantity}, ${b.unit.ucum} a ${b.unit.quantity}: no conversion between them` };
    const ua = unitOf(a.unit);
    const ub = unitOf(b.unit);
    if (!ua || !ub) return { ok: false, code: "UNKNOWN_UNIT", reason: "the unit system lost a unit it had resolved" };
    const converted = Number(Quantity.Convert(value, ua, ub).toPrecision(12));
    return { ok: true, value: converted, from: a.unit, to: b.unit, factor: Number(Quantity.Convert(1, ua, ub).toPrecision(12)) };
}

export function compatibleUnits(a: UnitRef, b: UnitRef): { ok: true; compatible: boolean; a: ResolvedUnit; b: ResolvedUnit; reason?: string } | { ok: false; code: Exclude<Resolution, { ok: true }>["code"]; reason: string } {
    const ra = resolveUnitRef(a);
    if (!ra.ok) return { ok: false, code: ra.code, reason: `a: ${ra.reason}` };
    const rb = resolveUnitRef(b);
    if (!rb.ok) return { ok: false, code: rb.code, reason: `b: ${rb.reason}` };
    const compatible = sameQuantity(ra.unit, rb.unit);
    return { ok: true, compatible, a: ra.unit, b: rb.unit, ...(compatible ? {} : { reason: `${ra.unit.ucum} measures a ${ra.unit.quantity}, ${rb.unit.ucum} a ${rb.unit.quantity}` }) };
}

export interface Statement extends UnitRef {
    value: number;
}

export type ConnectionCheck =
    | { ok: true; code: "OK"; expected: number; got: number; source: ResolvedUnit; target: ResolvedUnit }
    | { ok: false; code: "INVALID_CONVERSION"; expected: number; got: number; source: ResolvedUnit; target: ResolvedUnit; reason: string }
    | { ok: false; code: "INCOMPATIBLE_QUANTITY" | Exclude<Resolution, { ok: true }>["code"]; reason: string };

/**
 * A source states a value in its unit; a request restates it in another:
 * once converted they must agree within the tolerance (2 % by default), or
 * the request converted wrongly (1.0 m3/min written as 60 L/min).
 */
export function validateConnection(source: Statement, target: Statement, tolerance = 0.02): ConnectionCheck {
    const c = convertValue(source.value, source, target);
    if (!c.ok) return { ok: false, code: c.code, reason: c.reason };
    // Twelve significant digits: a factor of 1/60 applied and undone must give the number back, not 999.9999999999999.
    const expected = Number(c.value.toPrecision(12));
    const got = target.value;
    const scale = Math.max(Math.abs(expected), Math.abs(got), Number.EPSILON);
    if (Math.abs(expected - got) / scale <= tolerance) return { ok: true, code: "OK", expected, got, source: c.from, target: c.to };
    return { ok: false, code: "INVALID_CONVERSION", expected, got, source: c.from, target: c.to, reason: `the source says ${source.value} ${c.from.ucum}, which is ${Number(expected.toPrecision(4))} ${c.to.ucum}; the request says ${got} ${c.to.ucum}` };
}

/** A number followed by a unit, as a text states it; the unit resolved by the unit system, or the number dropped. */
export interface QuantityInText {
    value: number;
    text: string;
    unit: ResolvedUnit;
}

/** A number and the token after it; a number that continues an exponent ("10^-4") or a word is not a value. */
const NUMBER_UNIT = /(?<![\w.^-])(\d+(?:[.,]\d+)?(?:e-?\d+)?)\s*([A-Za-zµ°%][A-Za-z0-9µ°%³²/.^\-]{0,15})/g;

/** The numbers with a unit a text states (a datasheet, a topology page): what a constant the Observer copies is checked against. */
export function quantitiesIn(text: string): QuantityInText[] {
    const out: QuantityInText[] = [];
    for (const m of text.matchAll(NUMBER_UNIT)) {
        const value = Number(m[1].replace(",", "."));
        if (!Number.isFinite(value)) continue;
        // The token as written, then trimmed of what a sentence adds (a period, a closing bracket).
        const raw = m[2].replace(/[.,;:)\]]+$/, "");
        for (const candidate of [raw, raw.replace(/\/(min|s|h)$/, "/$1")]) {
            const r = resolveUnitRef({ unit: candidate });
            if (r.ok) {
                out.push({ value, text: `${m[1]} ${raw}`, unit: r.unit });
                break;
            }
        }
    }
    return out;
}

/**
 * A constant copied from a document, checked against what the document
 * states in the same quantity: agrees with one of them once converted, or
 * disagrees with all (INVALID_CONVERSION, the document's statements named),
 * or the document states nothing in that quantity (no verdict).
 */
export function checkAgainstDocument(constant: Statement, documentText: string, tolerance = 0.02): { verdict: "OK" | "INVALID_CONVERSION" | "NOT_STATED" | "UNKNOWN_UNIT"; reason: string } {
    const r = resolveUnitRef(constant);
    if (!r.ok) return { verdict: "UNKNOWN_UNIT", reason: r.reason };
    // A dimensionless number has no unit to convert wrongly, and a datasheet is full of percents (100 %, 40 %) that say nothing about it: no verdict, rather than a refusal that pushes the model to the wrong number (the fifth passage's eta).
    if (r.unit.kind === "Dimensionless") return { verdict: "NOT_STATED", reason: "a dimensionless constant is not checked against a document: nothing to convert" };
    const stated = quantitiesIn(documentText).filter((q) => sameQuantity(q.unit, r.unit));
    if (!stated.length) return { verdict: "NOT_STATED", reason: `the document states no ${r.unit.quantity}` };
    const checks = stated.map((s) => ({ s, c: validateConnection({ value: s.value, unit: s.unit.ucum, quantity: s.unit.quantity }, { value: constant.value, unit: r.unit.ucum, quantity: r.unit.quantity }, tolerance) }));
    const agreeing = checks.find((x) => x.c.ok);
    if (agreeing) return { verdict: "OK", reason: `agrees with ${agreeing.s.text}` };
    const nearest = checks.map((x) => x.c).filter((c): c is Extract<ConnectionCheck, { code: "INVALID_CONVERSION" }> => c.code === "INVALID_CONVERSION");
    return { verdict: "INVALID_CONVERSION", reason: `the document states ${stated.map((s) => s.text).join(", ")} (${nearest.map((c) => `${Number(c.expected.toPrecision(4))} ${r.unit.ucum}`).join(", ")} in ${r.unit.ucum}); the request says ${constant.value} ${r.unit.ucum}` };
}
