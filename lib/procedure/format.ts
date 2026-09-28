/**
 * The procedure file (docs/mise-en-service.fr.md, section 15): a test
 * written before it runs, with its bounds, its abort conditions and its
 * predictions. The factory writes it; a guard reads it (`check.ts`); the
 * station relays it to the commander; the agent executes it, one command
 * at a time, under its own rights (`tier3/procedure.ts`). Nobody who
 * writes it runs it.
 *
 * Two steps since 2026-09-23, hatch closed both times: let the CO2 rise at
 * a reduced speed, then time its decay at full speed. The test measures
 * the served volume and nothing else; the exchange with the neighbouring
 * volume stays a hypothesis that the residual of the two candidate
 * simulators decides later (the graph topic, not built yet).
 *
 * The keys are English because code reads them; the story around them is
 * in French in the spec.
 *
 * Since 2026-09-28 this is the station's format, out of the harness: the
 * station relays a procedure and the executor runs it, both of this
 * installation. The procedure factory reads it by the spec
 * (specs/procedure/format.json, procedure.schema.json), and its guard's
 * envelope and rules are the signed card's (docs/library/
 * commissioning-test-safety.facts.json and .rules.json), never numbers here.
 */

export interface ProcedureStep {
    n: number;
    /** The state of the hatch during the step; `closed` for both steps of the decay test. */
    hatch: "open" | "closed";
    /** The scrubber's speed command for the whole step, percent of full speed. */
    speedPercent: number;
    minutes: number;
    /** Why this step exists, in one line: what it lets the test see. */
    why?: string;
}

export interface AbortCondition {
    /** `co2`, `refused`, `battery`, `vitals`, or another the executor does not know (then it cannot be read, and an unreadable condition is a tripped one). */
    id: string;
    /** The tool that reads it, as `<slot>.<tool>`. */
    source: string;
    when: string;
    /** A number the condition compares with, when it has one (the battery's percent). */
    threshold?: number;
}

export interface ProcedureLimits {
    co2MaxPpm: number;
    co2AbortPpm: number;
    minSpeedPercent: number;
    maxMinutes: number;
}

/** Why a constant of the procedure has its value, and where it comes from, so it can be challenged against a written procedure or the literature. */
export interface Justification {
    /** The constant, by its path in the procedure: limits.co2MaxPpm, steps.1.speedPercent, steps.2.minutes, abort.battery.threshold, monitoring.band.maxBpm. */
    constant: string;
    value: number;
    /** library: a document or a fact of the library read in this task; web: a page a web search returned in this task; measured: the measurement the task was given; envelope: the guard's own bound; derived: computed from other constants; assumed: chosen without a source, said as such. */
    source: "library" | "web" | "measured" | "envelope" | "derived" | "assumed";
    /** The document id or fact id, the URL, the measurement, the envelope's key, or the formula; for assumed, may be empty. */
    reference: string;
    reason: string;
}

export interface Procedure {
    version: 1;
    id: string;
    method: string;
    standard?: string;
    purpose?: string;
    /** The ISA-95 path of the volume under test, `/habitat/lab`. */
    volume: string;
    /** The ISA-95 path of the device the steps command, `/habitat/lab/eclss/scrubber-1`. */
    device: string;
    quantities: Array<{ name: string; quantity: string; unit: string }>;
    hypotheses?: string[];
    limits: ProcedureLimits;
    /** What the writer read of who is in the volume; the guard judges on what was read, not on this. */
    occupancy?: { module: string; occupants: number; subjects?: string[]; readBy?: string; at?: string };
    monitoring?: { subjects: string[]; band?: { minBpm: number; maxBpm: number }; reason?: string };
    authorisation?: { by: string; required: boolean };
    steps: ProcedureStep[];
    abort: AbortCondition[];
    /** The predictions, written before the run: the report quotes them as they were. */
    expected: Record<string, string>;
    /** One per constant the procedure sets: its value, its source, why (2026-09-28). */
    justifications?: Justification[];
}

/** The module an ISA-95 volume path names: `/habitat/lab` -> `lab`. */
export const moduleOf = (volume: string): string => volume.replace(/\/+$/, "").split("/").pop() ?? "";

/** The total duration of the steps, in minutes. */
export const totalMinutes = (p: Pick<Procedure, "steps">): number => (Array.isArray(p.steps) ? p.steps.reduce((sum, s) => sum + (Number.isFinite(s?.minutes) ? s.minutes : 0), 0) : 0);
