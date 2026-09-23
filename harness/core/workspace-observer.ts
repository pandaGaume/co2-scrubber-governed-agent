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
import { createHash } from "node:crypto";
import type { JsonValue, State, StateObserver } from "@spiky-panda/harness";
import type { Broker } from "../lib/broker.js";
import type { CapabilityCall } from "./capabilities.js";

export type Phase = "plan" | "build" | "done" | "failed";

export interface MissingCapability {
    required_output: string;
    quantity: string;
    unit?: string;
    reason: string;
    topic: string;
}

export interface Plan {
    selected_nodes: string[];
    missing_capabilities: MissingCapability[];
}

export interface DoneClaim {
    summary: string;
    artifacts: Array<{ kind: "graph" | "model" | "twin" | "procedure"; path: string }>;
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
    lastRefusal: { capability: string; reason: string } | null;
    /** sha256 of the models whose contract check passed in this task (`model.contract` ok). */
    checkedModels: string[];
    /** The summary of the last sandbox run (`session_run`), for the proposal's claims. */
    sandbox: Record<string, JsonValue> | null;
    /** Why the builder gave up (`task.fail`), when it did. */
    failure: string | null;
    /** The last successful answer of every capability called in this task, and when: what a topic's rule asks "was this read here" of. */
    reads: Record<string, { at: string; value: JsonValue }>;
    /** What a topic keeps across the steps of one task (the procedure topic: its submissions). */
    topic: Record<string, JsonValue>;
}

export function newProgress(): Progress {
    return { phase: "plan", iteration: 0, plan: null, done: null, lastCall: null, lastRefusal: null, checkedModels: [], sandbox: null, failure: null, reads: {}, topic: {} };
}

export interface WorkshopFeatures extends Record<string, JsonValue> {
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
    lastOutput: string;
    lastRefusal: string;
}

export interface WorkshopState extends State {
    readonly features: WorkshopFeatures;
}

const ARTIFACT = /(\.onnx|\.spikypanda|^models\/.*\.json|^procedures\/.*\.json)$/;
export const isArtifact = (path: string): boolean => ARTIFACT.test(path);

/** The task's files as the workspace slot lists them. */
export async function listWorkshop(broker: Broker, taskId: string): Promise<WorkshopFile[]> {
    const r = await broker.call("workspace", "list", { taskId });
    if (!r.ok) throw new Error(`workspace.list failed for task ${taskId}: ${r.error ?? r.outcome}`);
    const files = ((r.output as { files?: unknown })?.files ?? []) as Array<{ path: string; bytes: number; sha256: string }>;
    return files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
}

export function createWorkspaceObserver(broker: Broker, taskId: string, progress: Progress): StateObserver {
    return {
        async observe(): Promise<WorkshopState> {
            const files = await listWorkshop(broker, taskId);
            const digest = createHash("sha256")
                .update(files.map((f) => `${f.path}:${f.sha256}`).sort().join("\n"))
                .digest("hex");
            const last = progress.lastCall;
            const features: WorkshopFeatures = {
                phase: progress.phase,
                iteration: progress.iteration,
                files: files.length,
                digest,
                artifacts: files.map((f) => f.path).filter(isArtifact).sort(),
                planNodes: progress.plan?.selected_nodes.length ?? 0,
                planMissing: progress.plan?.missing_capabilities.length ?? 0,
                lastCapability: last?.id ?? "",
                lastOutcome: last?.result.outcome ?? "",
                lastOutput: last ? JSON.stringify(last.result.output ?? last.result.error ?? null).slice(0, 4000) : "",
                lastRefusal: progress.lastRefusal ? `${progress.lastRefusal.capability}: ${progress.lastRefusal.reason}` : "",
            };
            return { id: `workshop:${progress.phase}:${last?.id ?? "start"}:${last?.result.outcome ?? ""}`, features };
        },
    };
}
