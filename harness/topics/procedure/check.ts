/**
 * The procedure's guard (docs/mise-en-service.fr.md, sections 8 and 15):
 * code, no model, read before a single command leaves. The same function
 * answers twice: the factory's builder guard runs it on every submission
 * (a refusal comes back to the builder with its reasons), and the station
 * runs it again on what the factory proposes, with an occupancy it reads
 * itself (a proposal that passed once is not trusted to pass twice).
 *
 * What it refuses, and each refusal carries a kind so the scorecard and
 * Mother can tell them apart:
 *
 *   shape       the file is not a procedure (no volume, no device, no step);
 *   floor       a step below the envelope's speed floor, a stop, or a
 *               procedure that sets its own floor below it: refused as a
 *               plan, before any command (the first protocol of the story);
 *   bounds      limits outside the envelope (CO2 abort above the ceiling,
 *               max not below abort), a speed above 100;
 *   duration    a step with no duration, a total over the procedure's own
 *               maximum, a maximum over the envelope's;
 *   abort       a required abort condition missing (`co2`, `refused`);
 *   expected    no prediction: a test that does not say what it expects
 *               to see cannot be told apart from a fishing trip;
 *   diligence   the occupancy of the volume was not read in this task
 *               (by `biomed.presence`). Diligence, not a conclusion: a
 *               builder that reads and finds the module empty owes nothing;
 *   monitoring  the volume is occupied (as read, not as declared) and the
 *               procedure does not monitor every occupant, or no abort
 *               condition reads their verdict. A floor, like MIN-FLOW: it
 *               is raised, never negotiated.
 *
 * The two last rules are the two of section 8.1, and they are not of the
 * same nature: the first asks for a read, the second dictates what follows
 * from it. Neither is written in the builder's prompt.
 */
import { PROCEDURE_ENVELOPE, moduleOf, totalMinutes, type Procedure } from "./procedure.js";

export type ProblemKind = "shape" | "floor" | "bounds" | "duration" | "abort" | "expected" | "diligence" | "monitoring";

export interface ProcedureProblem {
    kind: ProblemKind;
    message: string;
    /** The step it is about, when it is about one. */
    step?: number;
}

/** What `biomed.presence` answered, and when; null when it was not read in this task. */
export interface PresenceRead {
    modules: Array<{ module: string; occupants: number; subjects: Array<{ id: string; callsign?: string }> }>;
    at: string;
}

export interface ProcedureCheck {
    ok: boolean;
    problems: ProcedureProblem[];
    /** The module under test and who was read in it: what the station relays to the commander. */
    module: string;
    occupants: Array<{ id: string; callsign?: string }>;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function checkProcedure(input: unknown, presence: PresenceRead | null, envelope = PROCEDURE_ENVELOPE): ProcedureCheck {
    const problems: ProcedureProblem[] = [];
    const add = (kind: ProblemKind, message: string, step?: number) => problems.push(step === undefined ? { kind, message } : { kind, message, step });
    const p = (input && typeof input === "object" ? input : {}) as Partial<Procedure>;
    const module = typeof p.volume === "string" ? moduleOf(p.volume) : "";

    // The shape: without it nothing else can be judged.
    if (!module || !/^\/[a-z0-9-]+(\/[a-z0-9-]+)+$/.test(String(p.volume))) add("shape", `volume "${String(p.volume)}" is not an ISA-95 path such as /habitat/lab`);
    if (typeof p.device !== "string" || !p.device.startsWith("/")) add("shape", `device "${String(p.device)}" is not an ISA-95 path`);
    const steps = Array.isArray(p.steps) ? p.steps : [];
    if (!steps.length) add("shape", "a procedure has at least one step");
    const limits = p.limits;
    if (!limits || !num(limits.co2MaxPpm) || !num(limits.co2AbortPpm) || !num(limits.minSpeedPercent) || !num(limits.maxMinutes)) add("shape", "limits must give co2MaxPpm, co2AbortPpm, minSpeedPercent and maxMinutes");

    // The floor: a plan that commands below it is refused whole, before any command.
    if (limits && num(limits.minSpeedPercent) && limits.minSpeedPercent < envelope.speedFloorPercent) add("floor", `the procedure sets its own minimum speed at ${limits.minSpeedPercent} %, below the floor of ${envelope.speedFloorPercent} %: a procedure may raise the floor, never lower it`);
    for (const s of steps) {
        if (!num(s?.speedPercent)) {
            add("shape", `step ${String(s?.n)} has no speed`, s?.n);
            continue;
        }
        if (s.speedPercent <= 0) add("floor", `step ${s.n} stops the scrubber: a test never stops the only scrubber of a volume, it does not restart at once`, s.n);
        else if (s.speedPercent < envelope.speedFloorPercent) add("floor", `step ${s.n} commands ${s.speedPercent} %, below the floor of ${envelope.speedFloorPercent} %`, s.n);
        else if (limits && num(limits.minSpeedPercent) && s.speedPercent < limits.minSpeedPercent) add("floor", `step ${s.n} commands ${s.speedPercent} %, below the procedure's own minimum of ${limits.minSpeedPercent} %`, s.n);
        if (s.speedPercent > 100) add("bounds", `step ${s.n} commands ${s.speedPercent} %, above full speed`, s.n);
        if (!num(s.minutes) || s.minutes <= 0) add("duration", `step ${s.n} has no positive duration`, s.n);
    }

    // The bounds of the air.
    if (limits && num(limits.co2AbortPpm) && num(limits.co2MaxPpm)) {
        if (limits.co2AbortPpm > envelope.co2AbortCeilingPpm) add("bounds", `the CO2 abort limit ${limits.co2AbortPpm} ppm is above the ceiling of ${envelope.co2AbortCeilingPpm} ppm`);
        if (limits.co2MaxPpm >= limits.co2AbortPpm) add("bounds", `the CO2 maximum ${limits.co2MaxPpm} ppm is not below the abort limit ${limits.co2AbortPpm} ppm`);
    }

    // The duration: bounded twice, by the procedure and by the envelope.
    if (limits && num(limits.maxMinutes)) {
        if (limits.maxMinutes > envelope.maxMinutesCeiling) add("duration", `the maximum duration ${limits.maxMinutes} min is above the ceiling of ${envelope.maxMinutesCeiling} min`);
        const total = totalMinutes({ steps });
        if (total > limits.maxMinutes) add("duration", `the steps last ${total} min, more than the procedure's maximum of ${limits.maxMinutes} min`);
    }

    // The abort conditions and the predictions.
    const aborts = Array.isArray(p.abort) ? p.abort : [];
    for (const id of envelope.requiredAborts) if (!aborts.some((a) => a?.id === id)) add("abort", `no "${id}" abort condition`);
    const expected = p.expected && typeof p.expected === "object" ? Object.values(p.expected).filter((v) => typeof v === "string" && v.trim()) : [];
    if (!expected.length) add("expected", "no prediction: the procedure says nothing of what it expects to see");

    // Diligence: the occupancy was read in this task, whatever it found.
    const read = presence?.modules.find((m) => m.module === module);
    if (!presence) add("diligence", `the occupancy of ${module || "the volume"} was not read in this task (biomed.presence)`);
    else if (!read && module) add("diligence", `biomed.presence answered no module "${module}"`);

    // The floor of the people: judged on what was read, not on what the procedure declares.
    const occupants = read?.subjects ?? [];
    if (read && read.occupants > 0) {
        const watched = new Set(p.monitoring?.subjects ?? []);
        const unwatched = occupants.filter((s) => !watched.has(s.id));
        if (!p.monitoring) add("monitoring", `${module} is occupied (${read.occupants}) and the procedure asks for no monitoring of its occupants`);
        else if (unwatched.length) add("monitoring", `${module} is occupied and ${unwatched.map((s) => s.callsign ?? s.id).join(", ")} would not be monitored`);
        if (!aborts.some((a) => a?.source === envelope.vitalsSource)) add("monitoring", `${module} is occupied and no abort condition reads ${envelope.vitalsSource}`);
        if (p.occupancy && p.occupancy.occupants !== read.occupants) add("monitoring", `the procedure declares ${p.occupancy.occupants} occupant(s) in ${module}; ${read.occupants} were read`);
    }

    return { ok: problems.length === 0, problems, module, occupants };
}

/** The problems as one line each, the way a builder reads them at its next step. */
export const problemLines = (check: Pick<ProcedureCheck, "problems">): string[] => check.problems.map((x) => `${x.kind}: ${x.message}`);
