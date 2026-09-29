/**
 * What the constructor observes before and after each decision (nodes 1 and
 * 10 of docs/harness-stages.fr.md): the task's workshop as `workspace.list`
 * answers it (paths and sha256), the phase, the plan once accepted, the last
 * capability result and the last refusal of the guard, so that a decision
 * can build on the answer of the previous one (a model's path, a contract
 * check, the problems of a refused plan).
 *
 * `State.id` is `workshop:<phase>:<last capability>:<its outcome>`: with the
 * task's signature in the intention, that is the key learned decisions are
 * stored under, so a second task of the same kind finds, after the same
 * step, what the first did next: a recipe is a chain of steps, not a bag of
 * tools per phase. Nothing here may change on its own between two reads
 * (no clock, no file date): the harness reads the state again right before
 * executing and refuses a decision whose world moved.
 *
 * The progress record is the runner's: the observer reads it, the local
 * capabilities (`task.plan`, `task.done`) and the evaluator write it.
 */
import { justificationNote, type JustificationHelp, type Misjustified } from "./justify.js";
import { refusalNote, type Problem, type RefusalStreak } from "./problems.js";
import { createHash } from "node:crypto";
import type { JsonValue, State, StateObserver } from "@spiky-panda/harness";
import type { Broker } from "../lib/broker.js";
import type { CapabilityCall } from "./capabilities.js";
import type { ReasoningState } from "./reasoning-state.js";
import type { ContractReport } from "./contracts.js";
import { APP, appSays } from "./application.js";

export type Phase = "plan" | "build" | "done" | "failed" | "waiting";

export interface MissingCapability {
    required_output: string;
    quantity: string;
    unit?: string;
    reason: string;
    topic: string;
    /** For the code factory: the capability contract the node must satisfy (`slots/forge/contract.ts`), written by the factory that declares the gap, judged by code before the plan is accepted. */
    contract?: Record<string, unknown>;
}

export interface Plan {
    selected_nodes: string[];
    missing_capabilities: MissingCapability[];
    /** For a required output judged against no column: which selected type produces it, on which output port (2026-09-27: a leak counted as produced by a person's CO2 output, MassFlow in kg/s both, and the twin held while ignoring it). */
    produced?: Record<string, { type: string; port: string; convert?: { relation: string; parameters?: Record<string, unknown> } }>;
}

export interface DoneClaim {
    summary: string;
    artifacts: Array<{ kind: "graph" | "model" | "twin" | "procedure" | "plugin" | "playbook" | "adaptation"; path: string }>;
}

export interface WorkshopFile {
    path: string;
    bytes: number;
    sha256: string;
}

/** Where the task stands, kept by the runner across the steps. */
export interface Progress {
    phase: Phase;
    /** Steps taken so far, refusals included. */
    iteration: number;
    plan: Plan | null;
    done: DoneClaim | null;
    lastCall: CapabilityCall | null;
    /** How many times in a row the builder proposed the same call with the same input (executed or refused): the observation's id carries it, so a learned step is not replayed forever on a step that changes nothing (2026-09-25). */
    repeats: number;
    /** The last call's answer as the model reads it (`compact.ts`), and the handle of the whole answer in the workshop when it was long. */
    lastSummary: JsonValue | null;
    lastArtifact: string | null;
    /** The last step the harness stopped (the guard, the schema, a capability outside the list): the call as proposed, whole, and why. In the state mode the model reads its own proposal here and corrects it, instead of writing it again with the same fault. */
    lastRefusal: { capability: string; reason: string; input?: JsonValue } | null;
    /** The last refusal of each capability, kept until that capability completes: a refused submission stays readable after the model read something else (the fifteenth passage lost it and invented a handle for it). */
    refusals: Record<string, { reason: string; input: JsonValue; at: string }>;
    /** sha256 of the models whose contract check passed in this task (`model.contract` ok). */
    checkedModels: string[];
    /** The summary of the last sandbox run (`session_run`), for the proposal's claims. */
    sandbox: Record<string, JsonValue> | null;
    /** Why the builder gave up (`task.fail`), when it did. */
    failure: string | null;
    /** The last successful answer of every capability called in this task, and when: what a topic's rule asks "was this read here" of. */
    reads: Record<string, { at: string; value: JsonValue }>;
    /** What a justification may cite, as read in this task: the library's documents and facts, the pages a web search returned (`justify.ts`). */
    sources: { library: string[]; web: string[] };
    /** What a refusal for justifications left to do: the constants without one, by path; put in the state and the brief until the call completes (`justify.ts`). */
    justify: JustificationHelp | null;
    /** The safety constants the topic's guard found justified by no fact the signed rules bound them by, for the runner to put in `justify` with the refusal. */
    misjustified?: Misjustified[] | null;
    /** The refusal of the topic's own guard at this step (its checks, the justifications'), for the runner to tell it from one the harness made before the guard. */
    guardRefused?: { capability: string; reason: string } | null;
    /** The problems of a refusal as the guard knew them (path, expected, sent), left for the runner; read from the refusal's text when a guard leaves none (`problems.ts`). */
    pendingProblems?: Problem[] | null;
    /** The refusals in a row on the same points, and the last one's problems: what the brief opens on (`problems.ts`). */
    refusal?: RefusalStreak | null;
    /** What a topic keeps across the steps of one task (the procedure topic: its submissions). */
    topic: Record<string, JsonValue>;
    /** What the task read so far, each answer compact, by capability and argument (`evidence:` in the state); the oldest dropped past the cap. */
    evidence: Record<string, { at: string; summary: JsonValue }>;
    /** What the runner read once at the start, for the state and the topics' requirements: the library's shelf, the telemetry's shape. */
    context: {
        shelf: Array<{ id: string; description: string; types: string[]; variables: Record<string, string>; settings: string[]; probes: string[] }>;
        telemetry: { file: string; rows: number; columns: string[]; minutes: number | null } | null;
        /** The contract report of the task's facts (the request's known constants, the register's devices, the library), read once at the start (`contracts.ts`). */
        contracts?: ContractReport;
    };
}

export function newProgress(): Progress {
    return { phase: "plan", iteration: 0, plan: null, done: null, lastCall: null, repeats: 0, lastSummary: null, lastArtifact: null, lastRefusal: null, refusals: {}, checkedModels: [], sandbox: null, failure: null, reads: {}, sources: { library: [], web: [] }, justify: null, topic: {}, evidence: {}, context: { shelf: [], telemetry: null } };
}

export interface WorkshopFeatures extends Record<string, JsonValue> {
    /** The harness's brief for this step (the topic's, when it writes one): first, so a model reads it first. */
    brief: string;
    phase: Phase;
    iteration: number;
    files: number;
    /** sha256 of the listing (path and sha256 of every file): changes when a file is added or replaced. */
    digest: string;
    /** The artifacts of the task: models, contracts, documents (paths). */
    artifacts: string[];
    planNodes: number;
    planMissing: number;
    lastCapability: string;
    lastOutcome: string;
    /** The last answer as the model reads it: compact, with the handle of the whole (`compact.ts`); the adapters give it back as the tool's result. */
    lastOutput: string;
    lastRefusal: string;
    /** The reasoning state (`reasoning-state.ts`): what the model reads instead of the transcript. Absent for a loop that has none (the agent's). */
    state: ReasoningState | null;
}

export interface WorkshopState extends State {
    readonly features: WorkshopFeatures;
}

const ARTIFACT = /(\.onnx|\.spikypanda|^models\/.*\.json|^procedures\/.*\.json|^playbooks\/.*\.json|^adaptations\/.*\.json|^forge\/[^/]+\/artifact\.json)$/;
export const isArtifact = (path: string): boolean => ARTIFACT.test(path);

/** The task's files as the workspace slot lists them. */
export async function listWorkshop(broker: Broker, taskId: string): Promise<WorkshopFile[]> {
    const r = await broker.call("workspace", "list", { taskId });
    if (!r.ok) throw new Error(`workspace.list failed for task ${taskId}: ${r.error ?? r.outcome}`);
    const files = ((r.output as { files?: unknown })?.files ?? []) as Array<{ path: string; bytes: number; sha256: string }>;
    return files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
}

/**
 * The brief as the model reads it: what the refusals left to do first, whatever refused (the problems of the last refusal,
 * and, on the same points again, what is expected at each), the justifications' own note, then the topic's brief.
 */
export function briefWithNotes(progress: Progress, topicBrief: string): string {
    const refusal = progress.lastRefusal ? refusalNote(progress.refusal) : "";
    return (progress.lastRefusal?.capability === APP.text.report ? appSays("textIgnored") : "") + refusal + justificationNote(progress.justify) + topicBrief;
}

export function createWorkspaceObserver(broker: Broker, taskId: string, progress: Progress, brief: () => string = () => "", state?: () => ReasoningState, key: () => string = () => "", contextMode: "conversation" | "state" = "conversation"): StateObserver {
    return {
        async observe(): Promise<WorkshopState> {
            const files = await listWorkshop(broker, taskId);
            const digest = createHash("sha256")
                .update(files.map((f) => `${f.path}:${f.sha256}`).sort().join("\n"))
                .digest("hex");
            const last = progress.lastCall;
            const features: WorkshopFeatures = {
                // A text answer is not read here: the loop turns it into a crew report, which a factory does not have; said in the brief, so the builder answers with a tool.
                brief: briefWithNotes(progress, brief()),
                phase: progress.phase,
                iteration: progress.iteration,
                files: files.length,
                digest,
                artifacts: files.map((f) => f.path).filter(isArtifact).sort(),
                planNodes: progress.plan?.selected_nodes.length ?? 0,
                planMissing: progress.plan?.missing_capabilities.length ?? 0,
                lastCapability: last?.id ?? "",
                lastOutcome: last?.result.outcome ?? "",
                // A conversation gets the whole answer back as the tool's result (as before); the state mode gets it compact, the whole at its handle.
                lastOutput: last ? (contextMode === "state" && progress.lastSummary !== null ? JSON.stringify({ ...(progress.lastArtifact ? { artifact: progress.lastArtifact } : {}), summary: progress.lastSummary }) : JSON.stringify(last.result.output ?? last.result.error ?? null).slice(0, 8000)) : "",
                lastRefusal: progress.lastRefusal ? `${progress.lastRefusal.capability}: ${progress.lastRefusal.reason}` : "",
                state: contextMode === "state" && state ? state() : null,
            };
            // The id the recipes are stored under: the phase, the last capability and its outcome, and what the topic adds (the last diagnosis), so a learned step replays only after the same evidence.
            const extra = key();
            return { id: `workshop:${progress.phase}:${last?.id ?? "start"}:${last?.result.outcome ?? ""}${extra ? `:${extra}` : ""}${progress.repeats > 0 ? `:again${progress.repeats}` : ""}`, features };
        },
    };
}
