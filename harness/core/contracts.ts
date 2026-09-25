/**
 * The contract layer (2026-09-25, night): typed facts, a hierarchy of
 * sources, and the conflicts between them. Generic: nothing here knows a
 * scrubber or a hatch; a fact is an id, a semantic, a quantity, a unit, a
 * value, a status and a producer, and two facts with the same id must
 * agree once converted, or the lower authority is asked to revise.
 *
 *     MEASURED > DEVICE > DOCUMENTED > LIBRARY > DERIVED > ASSUMED
 *
 * The deterministic validators (the units, the schemas, the coverage)
 * answer what is objectively wrong; this layer answers what is inconsistent
 * between sources. What it produces is a report a harness reads before a
 * stage (the graph factory refuses a plan on a CONFLICT and says which
 * producer must revise), and what a contract supervisor, a small model
 * reading these reports and nothing else, would reason on later.
 *
 * The domain enters through the facts themselves: the library's fact
 * sidecars (`docs/library/<id>.facts.json`) name the facts a document
 * states, each with the register property it corresponds to when a device
 * carries it; the Observer cites a fact by id (`known[].factId`); the
 * register's devices give their properties. `taskFacts` gathers the three
 * for a task.
 */
import type { TaskFile } from "./task.js";
import { convertValue, resolveUnitRef } from "../lib/units.js";

export type FactStatus = "measured" | "device" | "documented" | "library" | "derived" | "assumed";

/** The hierarchy of sources, the most authoritative first. */
export const AUTHORITY: ReadonlyArray<FactStatus> = ["measured", "device", "documented", "library", "derived", "assumed"];

export interface Fact {
    /** The identity of the physical fact (`scrubber.singlePassEfficiency`), shared by every source that states it. */
    id: string;
    /** What the fact means, beyond its dimension (`SinglePassRemovalEfficiency`, not `Ratio`). */
    semantic?: string;
    quantity?: string;
    unit: string;
    value: number;
    /** A band, when the source gives one: a value within it agrees. */
    min?: number;
    max?: number;
    status: FactStatus;
    /** The document, the device path, the measurement: where it comes from. */
    source: string;
    /** Who states it in this task: observer, register, library, graph-factory... */
    producer: string;
}

/** A fact as a library document states it, in its sidecar. */
export interface LibraryFact {
    id: string;
    semantic: string;
    quantity: string;
    unit: string;
    value: number;
    min?: number;
    max?: number;
    /** The register property that carries the same fact, when a device does. */
    device?: { type: string; property: string };
    /** One line: what the document says, in words. */
    says?: string;
}

export interface ConflictValue {
    producer: string;
    status: FactStatus;
    source: string;
    value: number;
    unit: string;
    /** The value in the authoritative fact's unit, when convertible. */
    converted: number | null;
    agrees: boolean;
}

export interface Conflict {
    id: string;
    semantic?: string;
    authoritative: ConflictValue;
    values: ConflictValue[];
    /** Who must revise: the lowest authority that disagrees. */
    revise: string;
    reason: string;
}

/** The states of a report: the deterministic layer says the first three; a supervisor may say the last two (`supervisor.ts`). */
export type ContractStatus = "CONSISTENT" | "CONFLICT" | "MISSING" | "AMBIGUOUS" | "UNSUPPORTED";

export interface ContractReport {
    status: ContractStatus;
    conflicts: Conflict[];
    /** The required fact ids nobody states. */
    missing: string[];
    /** How many facts were reviewed, by id. */
    reviewed: number;
}

const rank = (s: FactStatus): number => {
    const i = AUTHORITY.indexOf(s);
    return i < 0 ? AUTHORITY.length : i;
};

/** A value converted into a fact's unit, or null when the units do not convert. */
function inUnitOf(value: number, unit: string, quantity: string | undefined, target: Fact): number | null {
    const c = convertValue(value, { unit, ...(quantity ? { quantity } : {}) }, { unit: target.unit, ...(target.quantity ? { quantity: target.quantity } : {}) });
    return c.ok ? c.value : null;
}

/** Whether a converted value agrees with a fact: within its band when it gives one, else within the tolerance. */
export function agreesWith(converted: number, fact: Fact, tolerance: number): boolean {
    if (typeof fact.min === "number" && typeof fact.max === "number") return converted >= fact.min * (1 - tolerance) && converted <= fact.max * (1 + tolerance);
    const scale = Math.max(Math.abs(fact.value), Math.abs(converted), Number.EPSILON);
    return Math.abs(converted - fact.value) / scale <= tolerance;
}

/**
 * The conflicts among facts: by id, every value against the most
 * authoritative one, converted into its unit; a value that does not agree
 * (or cannot be converted) is a conflict, and the lowest authority among
 * the disagreeing producers is the one to revise.
 */
export function conflictsOf(facts: Fact[], tolerance = 0.02): Conflict[] {
    const byId = new Map<string, Fact[]>();
    for (const f of facts) byId.set(f.id, [...(byId.get(f.id) ?? []), f]);
    const out: Conflict[] = [];
    for (const [id, group] of byId) {
        if (group.length < 2) continue;
        const sorted = [...group].sort((a, b) => rank(a.status) - rank(b.status));
        const top = sorted[0];
        const values: ConflictValue[] = sorted.map((f) => {
            const converted = f === top ? f.value : inUnitOf(f.value, f.unit, f.quantity, top);
            // A band counts whichever side carries it: the authoritative value must lie within a lower source's band, as a lower value must within the authoritative one's.
            const topInF = f === top ? f.value : inUnitOf(top.value, top.unit, top.quantity, f);
            const withinBand = typeof f.min === "number" && typeof f.max === "number" && typeof top.min !== "number" && topInF !== null && agreesWith(topInF, f, tolerance);
            return { producer: f.producer, status: f.status, source: f.source, value: f.value, unit: f.unit, converted, agrees: converted !== null && (agreesWith(converted, top, tolerance) || withinBand) };
        });
        const disagreeing = values.filter((v) => !v.agrees);
        if (!disagreeing.length) continue;
        const revise = disagreeing[disagreeing.length - 1];
        out.push({
            id,
            ...(top.semantic ? { semantic: top.semantic } : {}),
            authoritative: values[0],
            values,
            revise: revise.producer,
            reason: `${id}: ${disagreeing.map((v) => `${v.producer} (${v.status}, ${v.source}) says ${v.value} ${v.unit}${v.converted === null ? ", not convertible" : ""}`).join("; ")} against ${top.producer} (${top.status}, ${top.source}) ${top.value} ${top.unit}${typeof top.min === "number" ? ` (band ${top.min} to ${top.max})` : ""}: REQUIRE_RESOLUTION, ${revise.producer} to revise`,
        });
    }
    return out;
}

/** The report a stage reads: consistent, in conflict, or missing a required fact. */
export function reviewContracts(facts: Fact[], required: string[] = [], tolerance = 0.02): ContractReport {
    const conflicts = conflictsOf(facts, tolerance);
    const stated = new Set(facts.map((f) => f.id));
    const missing = required.filter((id) => !stated.has(id));
    return { status: conflicts.length ? "CONFLICT" : missing.length ? "MISSING" : "CONSISTENT", conflicts, missing, reviewed: stated.size };
}

interface KnownLike {
    symbol?: string;
    factId?: string;
    value?: number;
    unit?: string;
    quantity?: string;
    source?: string;
    min?: number;
    max?: number;
}

interface DeviceLike {
    path?: string;
    descriptor?: { "@type"?: string; properties?: Record<string, { value?: unknown; quantity?: string; unit?: string }> };
}

/**
 * The facts of a task: what the request states as known (the Observer's,
 * documented, by fact id when it cites one, by symbol otherwise), what the
 * register's devices carry (device), and what the library's sidecars say
 * (library). The device facts are named through the library's sidecars:
 * a property of a device type that a sidecar maps to a fact id is that
 * fact; a property no sidecar names stays out (it is nobody's claim).
 */
export function taskFacts(task: Pick<TaskFile["task"], "requirements" | "observations">, libraryFacts: Array<LibraryFact & { source: string }>): Fact[] {
    const facts: Fact[] = [];
    const known = (task.requirements as { known?: unknown } | undefined)?.known;
    for (const k of Array.isArray(known) ? (known as KnownLike[]) : []) {
        if (typeof k?.value !== "number" || !k.unit) continue;
        const band = typeof k.min === "number" && typeof k.max === "number";
        const lib = k.factId ? libraryFacts.find((f) => f.id === k.factId) : undefined;
        facts.push({ id: k.factId ?? String(k.symbol ?? ""), ...(lib?.semantic ? { semantic: lib.semantic } : {}), ...(k.quantity ? { quantity: k.quantity } : lib?.quantity ? { quantity: lib.quantity } : {}), unit: k.unit, value: k.value, ...(band ? { min: k.min, max: k.max } : {}), status: "documented", source: String(k.source ?? "the request"), producer: "observer" });
    }
    const devices = (task.observations as { devices?: unknown } | undefined)?.devices;
    for (const d of Array.isArray(devices) ? (devices as DeviceLike[]) : []) {
        const type = d.descriptor?.["@type"];
        for (const [property, p] of Object.entries(d.descriptor?.properties ?? {})) {
            if (typeof p?.value !== "number" || !p.unit) continue;
            const lib = libraryFacts.find((f) => f.device && f.device.type === type && f.device.property === property);
            if (!lib) continue;
            facts.push({ id: lib.id, semantic: lib.semantic, ...(p.quantity ? { quantity: p.quantity } : {}), unit: p.unit, value: p.value, status: "device", source: String(d.path ?? type ?? "a device"), producer: "register" });
        }
    }
    for (const f of libraryFacts) facts.push({ id: f.id, semantic: f.semantic, quantity: f.quantity, unit: f.unit, value: f.value, ...(typeof f.min === "number" && typeof f.max === "number" ? { min: f.min, max: f.max } : {}), status: "library", source: f.source, producer: "library" });
    return facts;
}

/** A known constant against the fact it cites: agrees, disagrees (with the fact's value), or its unit is unknown. */
export function checkKnownAgainstFact(known: { value: number; unit: string; quantity?: string }, fact: LibraryFact, tolerance = 0.02): { verdict: "OK" | "CONFLICT" | "UNKNOWN_UNIT"; reason: string } {
    const r = resolveUnitRef({ unit: known.unit, ...(known.quantity ? { quantity: known.quantity } : {}) });
    if (!r.ok) return { verdict: "UNKNOWN_UNIT", reason: r.reason };
    const target: Fact = { id: fact.id, semantic: fact.semantic, quantity: fact.quantity, unit: fact.unit, value: fact.value, ...(typeof fact.min === "number" && typeof fact.max === "number" ? { min: fact.min, max: fact.max } : {}), status: "documented", source: "library", producer: "library" };
    const converted = inUnitOf(known.value, known.unit, known.quantity, target);
    if (converted === null) return { verdict: "CONFLICT", reason: `${known.value} ${known.unit} does not convert into the fact's unit ${fact.unit} (${fact.quantity})` };
    if (agreesWith(converted, target, tolerance)) return { verdict: "OK", reason: `${known.value} ${known.unit} is ${Number(converted.toPrecision(4))} ${fact.unit}, the fact's value` };
    return { verdict: "CONFLICT", reason: `${known.value} ${known.unit} is ${Number(converted.toPrecision(4))} ${fact.unit}; the fact ${fact.id} (${fact.semantic}) is ${typeof fact.min === "number" ? `${fact.min} to ${fact.max}` : fact.value} ${fact.unit}${fact.says ? ` (${fact.says})` : ""}` };
}
