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
}

/**
 * The guard's own envelope. Written here, once, so a reviewer argues with
 * one number in one place; the procedure may tighten every one of them and
 * loosen none.
 *
 * `speedFloorPercent` is the floor of a procedure, not the firmware's
 * MIN-FLOW floor (40 %, which binds only while the cabin is ELEVATED and
 * the protection's own setting): a test on the only scrubber of a volume
 * never commands it below 30 %, and never stops it, whatever the CO2 says,
 * because a scrubber does not restart at once and a stopped one leaves no
 * margin (section 9 of the spec). 30 % is the reduced speed of the decay
 * test decided on 2026-09-22.
 *
 * `co2AbortCeilingPpm` sits under the cabin twin's ELEVATED threshold
 * (3500 ppm, `graphs/cabin.spikypanda`): a test that stops at 3200 never
 * hands the board a MIN-FLOW situation it did not ask for.
 */
export const PROCEDURE_ENVELOPE = {
    speedFloorPercent: 30,
    co2AbortCeilingPpm: 3200,
    maxMinutesCeiling: 60,
    /** Abort conditions every procedure carries, whatever it measures. */
    requiredAborts: ["co2", "refused"] as readonly string[],
    /** The condition that reads the monitoring of the people in the volume. */
    vitalsSource: "biomed.verdict",
} as const;

/**
 * The abort conditions the executor knows how to read (`tier3/procedure.ts`),
 * and where it reads each. A procedure names them by these ids; any other id
 * is a condition nobody can read, and the guard refuses it rather than let
 * the run trip on it at its first minute. Written in the schema the builder
 * is given, as an API's documentation says what an instrument measures: it
 * says what can be read, not which of them a good procedure needs.
 */
export const ABORT_READERS: Readonly<Record<string, string>> = {
    co2: "scrubber.motor.state: the CO2 of the volume, at or above limits.co2AbortPpm",
    refused: "scrubber.motor.set_speed: the device refused a step's command",
    battery: "station.registry_list: the battery's state of charge under `threshold` percent (35 when absent)",
    vitals: "biomed.verdict: a monitored person out of their band, the monitoring lost, or one more person in the volume under test",
};

/** The module an ISA-95 volume path names: `/habitat/lab` -> `lab`. */
export const moduleOf = (volume: string): string => volume.replace(/\/+$/, "").split("/").pop() ?? "";

/** The total duration of the steps, in minutes. */
export const totalMinutes = (p: Pick<Procedure, "steps">): number => (Array.isArray(p.steps) ? p.steps.reduce((sum, s) => sum + (Number.isFinite(s?.minutes) ? s.minutes : 0), 0) : 0);

/** The input schema of a procedure, as the builder is given it. Neutral on purpose: it says what a field is, never what a good procedure puts in it. */
export const PROCEDURE_SCHEMA = {
    type: "object",
    properties: {
        version: { type: "number", enum: [1] },
        id: { type: "string", minLength: 1, description: "An identifier for this procedure, e.g. decay-2026-10-14-01." },
        method: { type: "string", minLength: 1, description: "The method, e.g. concentration-decay." },
        standard: { type: "string", description: "The standard the method follows, if any." },
        purpose: { type: "string", description: "What the test is for, in one line." },
        volume: { type: "string", description: "ISA-95 path of the volume under test, e.g. /habitat/lab." },
        device: { type: "string", description: "ISA-95 path of the device the steps command." },
        quantities: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "string" }, unit: { type: "string" } }, required: ["name", "quantity", "unit"] }, description: "What the test measures." },
        hypotheses: { type: "array", items: { type: "string" }, description: "What the test does not measure and leaves to be decided otherwise." },
        limits: {
            type: "object",
            properties: { co2MaxPpm: { type: "number" }, co2AbortPpm: { type: "number" }, minSpeedPercent: { type: "number" }, maxMinutes: { type: "number" } },
            required: ["co2MaxPpm", "co2AbortPpm", "minSpeedPercent", "maxMinutes"],
            description: "The bounds the test stays within.",
        },
        occupancy: { type: "object", properties: { module: { type: "string" }, occupants: { type: "number" }, subjects: { type: "array", items: { type: "string" } }, readBy: { type: "string" }, at: { type: "string" } }, required: ["module", "occupants"], description: "Who is in the volume, as read." },
        monitoring: {
            type: "object",
            properties: { subjects: { type: "array", items: { type: "string" } }, band: { type: "object", properties: { minBpm: { type: "number" }, maxBpm: { type: "number" } } }, reason: { type: "string" } },
            required: ["subjects"],
            description: "People monitored during the test, if any.",
        },
        authorisation: { type: "object", properties: { by: { type: "string" }, required: { type: "boolean" } }, required: ["by", "required"] },
        steps: {
            type: "array",
            minItems: 1,
            items: { type: "object", properties: { n: { type: "number" }, hatch: { type: "string", enum: ["open", "closed"] }, speedPercent: { type: "number" }, minutes: { type: "number" }, why: { type: "string" } }, required: ["n", "hatch", "speedPercent", "minutes"] },
        },
        abort: {
            type: "array",
            items: {
                type: "object",
                properties: { id: { type: "string", enum: ["co2", "refused", "battery", "vitals"] }, source: { type: "string" }, when: { type: "string" }, threshold: { type: "number", description: "A number (the battery's percent); leave the field out for a condition that has none, never null" } },
                required: ["id", "source", "when"],
            },
            description: "The conditions that stop the test, by the id of what the executor can read: co2 (scrubber.motor.state, the CO2 of the volume at or above limits.co2AbortPpm); refused (scrubber.motor.set_speed, the device refused a step's command); battery (station.registry_list, the battery's state of charge under threshold percent); vitals (biomed.verdict, a monitored person out of band, the monitoring lost, or one more person in the volume). A condition that cannot be read stops the test.",
        },
        expected: { type: "object", additionalProperties: { type: "string" }, description: "What the test is expected to show, written before it runs." },
    },
    required: ["version", "id", "method", "volume", "device", "quantities", "limits", "steps", "abort", "expected"],
} as const;
