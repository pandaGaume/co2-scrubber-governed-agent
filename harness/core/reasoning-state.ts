/**
 * The reasoning state: what the model reads at each step instead of the
 * transcript of everything that happened before (the refactoring of
 * 2026-09-25, `docs/harness-refactoring.fr.md`). The harness owns it and
 * rebuilds it deterministically from the task and the progress; the
 * conversation is not needed to know where the work stands.
 *
 *   invariants      what does not move during the task: the objective and
 *                   its outputs, the threshold and the constraints, the
 *                   known constants with their status and source, who and
 *                   what was observed (persons, the register's devices), the
 *                   telemetry's columns and span, the graphs on the shelf;
 *   where           the phase, the iteration, what is left of the budgets
 *                   (steps and sandbox runs; never the clock: the runtime
 *                   refuses a decision whose observed world moved between
 *                   the decision and its execution, and a clock always moves);
 *   evidence        what the task has read so far, each answer compact
 *                   (`compact.ts`), by capability and argument: a read is
 *                   not repeated for what the state already holds;
 *   hypothesis      what the topic holds as the current answer (the graph or
 *                   spec under test, its fitted and held variables);
 *   lastAction      the last call, its outcome, its answer made compact, and
 *                   the handle of its whole answer in the workshop;
 *   lastRefusal     the last call the harness stopped: the capability, why,
 *                   and the call's input whole (bounded), so the model
 *                   corrects what it wrote rather than writes it again;
 *   evaluation      what the last evaluation said, compact (the topic's);
 *   requirements    the evidence a phase needs before the next one, each
 *                   true or false: a phase moves on facts, not on a
 *                   reasonable-looking call;
 *   openQuestions   what the topic says is still to be found;
 *   nextActions     the capabilities the model may call now.
 *
 * A topic contributes its part (`TopicDefinition.state`), the rest is the
 * constructor's. The size of the state is measured and kept in the trace
 * (`context` of the exchange), so the cost of every part is known.
 */
import type { JsonValue } from "@spiky-panda/harness";
import { thresholdsOf, type TaskFile } from "./task.js";
import type { Progress } from "./workspace-observer.js";

export interface KnownInvariant {
    symbol: string;
    value: number;
    unit?: string;
    /** measured, device, documented, known, band, fitted, assumed, derived: the epistemic status, never reduced to "constant". */
    status: string;
    source?: string;
    min?: number;
    max?: number;
}

export interface StateInvariants {
    /** `threshold` is the RMSE bound per column; `thresholds` says both bounds by name. */
    objective: { outputs: string[]; threshold: number | null; thresholds: { rmsePpmMax: number; absoluteResidualPpmMax: number | null } | null; constraints: Record<string, JsonValue> };
    known: KnownInvariant[];
    missingInformation: string[];
    hypotheses: string[];
    observed: { persons: string[]; devices: string[]; other: Record<string, JsonValue> };
    telemetry: { file: string; rows: number; columns: string[]; minutes: number | null } | null;
    /** The reference graphs of the library, as the harness read them once at the start: id, one line, the variables with their status. */
    shelf: Array<{ id: string; description: string; types: string[]; variables: Record<string, string>; settings: string[]; probes: string[] }>;
}

export interface ReasoningState extends Record<string, JsonValue> {
    phase: string;
    iteration: number;
    budget: { iterationsLeft: number; runsLeft: number | null };
    evidence: Record<string, JsonValue>;
    invariants: StateInvariants & Record<string, JsonValue>;
    hypothesis: JsonValue;
    lastAction: { capability: string; outcome: string; summary: JsonValue; artifact: string | null } | null;
    lastRefusal: { capability: string; reason: string; input: JsonValue } | null;
    evaluation: JsonValue;
    requirements: Record<string, boolean>;
    openQuestions: string[];
    nextActions: string[];
}

/** What a topic adds to the state at a step: its hypothesis, its last evaluation, its open questions, the evidence its phases need. */
export interface TopicState {
    hypothesis?: JsonValue;
    evaluation?: JsonValue;
    openQuestions?: string[];
    requirements?: Record<string, boolean>;
}

export interface StateInputs {
    task: TaskFile["task"];
    progress: Progress;
    budget: { iterations: number; minutes: number; twinPoints?: number };
    /** The capabilities the model may call now, by id. */
    nextActions: string[];
    /** The shelf, read once by the runner. */
    shelf: StateInvariants["shelf"];
    /** The telemetry's shape, read once by the runner. */
    telemetry: StateInvariants["telemetry"];
    /** The runs already spent by the topic, when it counts them. */
    runsSpent?: number;
    topic?: TopicState;
}

const str = (v: unknown): string => (typeof v === "string" ? v : v === undefined || v === null ? "" : JSON.stringify(v));

/** Characters a refused input may weigh in the state; above it, its head and its size. */
export const REFUSED_INPUT_CHARS = 6000;
const boundedInput = (v: JsonValue | undefined): JsonValue => {
    if (v === undefined) return null;
    const text = JSON.stringify(v) ?? "null";
    return text.length <= REFUSED_INPUT_CHARS ? v : ({ head: `${text.slice(0, REFUSED_INPUT_CHARS)}...`, characters: text.length } as JsonValue);
};

/** The known constants of a task as the Observer wrote them, each with its status: `band` when it carries one, `documented` otherwise. */
export function knownInvariants(task: TaskFile["task"]): KnownInvariant[] {
    const raw = (task.requirements as { known?: unknown } | undefined)?.known;
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((k) => k && typeof k === "object" && typeof (k as { symbol?: unknown }).symbol === "string" && typeof (k as { value?: unknown }).value === "number")
        .map((k) => {
            const x = k as { symbol: string; value: number; unit?: string; source?: string; min?: number; max?: number; name?: string };
            const band = typeof x.min === "number" && typeof x.max === "number" && x.min < x.max;
            return { symbol: x.symbol, value: x.value, ...(x.unit ? { unit: x.unit } : {}), status: band ? "band" : "documented", ...(x.source ? { source: x.source } : {}), ...(band ? { min: x.min, max: x.max } : {}) };
        });
}

/** The invariants of a task: what the model needs of the task file without reading it. */
export function invariantsOf(task: TaskFile["task"], shelf: StateInvariants["shelf"], telemetry: StateInvariants["telemetry"]): StateInvariants {
    const req = (task.requirements ?? {}) as Record<string, unknown>;
    const obs = (task.observations ?? {}) as Record<string, unknown>;
    const persons = Array.isArray(obs.persons) ? (obs.persons as Array<Record<string, unknown>>).map((p) => `${str(p.callsign) || str(p.id) || "someone"} in ${str(p.module)} at ${str(p.activity)}`) : [];
    const devices = Array.isArray(obs.devices) ? (obs.devices as Array<Record<string, unknown>>).map((d) => `${str(d.path)} (${str((d.descriptor as Record<string, unknown> | undefined)?.["@type"])})`) : [];
    const other: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(obs)) if (k !== "persons" && k !== "devices") other[k] = v as JsonValue;
    const thresholds = thresholdsOf(task);
    return {
        objective: {
            outputs: task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`),
            threshold: thresholds?.rmsePpmMax ?? null,
            thresholds,
            constraints: (task.objective.constraints ?? {}) as Record<string, JsonValue>,
        },
        known: knownInvariants(task),
        missingInformation: Array.isArray(req.missing_information) ? (req.missing_information as unknown[]).map(str) : [],
        hypotheses: Array.isArray(req.hypotheses) ? (req.hypotheses as unknown[]).map((h) => (typeof h === "string" ? h : str((h as Record<string, unknown>).statement ?? h))) : [],
        observed: { persons, devices, other },
        telemetry,
        shelf,
    };
}

export function reasoningStateOf(inputs: StateInputs): ReasoningState {
    const { task, progress, budget, nextActions, shelf, telemetry, topic = {} } = inputs;
    const last = progress.lastCall;
    return {
        phase: progress.phase,
        iteration: progress.iteration,
        budget: {
            iterationsLeft: Math.max(0, budget.iterations - progress.iteration),
            runsLeft: typeof budget.twinPoints === "number" ? Math.max(0, budget.twinPoints - (inputs.runsSpent ?? 0)) : null,
        },
        invariants: invariantsOf(task, shelf, telemetry) as StateInvariants & Record<string, JsonValue>,
        evidence: Object.fromEntries(Object.entries(progress.evidence).map(([k, e]) => [k, e.summary])),
        hypothesis: topic.hypothesis ?? null,
        lastAction: last ? { capability: last.id, outcome: last.result.outcome, summary: (progress.lastSummary ?? null) as JsonValue, artifact: progress.lastArtifact ?? null } : null,
        lastRefusal: progress.lastRefusal ? { capability: progress.lastRefusal.capability, reason: progress.lastRefusal.reason, input: boundedInput(progress.lastRefusal.input) } : null,
        evaluation: topic.evaluation ?? null,
        requirements: topic.requirements ?? {},
        openQuestions: topic.openQuestions ?? [],
        nextActions,
    };
}

/** The characters of each part of the state, for the telemetry: where the context goes. */
export function stateSizes(state: ReasoningState): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(state)) out[k] = JSON.stringify(v)?.length ?? 0;
    return out;
}
