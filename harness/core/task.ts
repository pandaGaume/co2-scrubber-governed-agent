/**
 * The task: what the factory's front (`factory.request`) writes as
 * `task.json` in the workshop, and what the container's `build` job
 * receives as its specification (docs/factory-harness.fr.md, section 5).
 * The loop (`runner.ts`) reads it; the front and the runner share this
 * shape and nothing else.
 */
export interface RequiredOutput {
    name: string;
    quantity: string;
    unit?: string;
    horizonMinutes?: number;
}

export interface TaskBudget {
    iterations: number;
    minutes: number;
    twinPoints: number;
}

export interface TaskFile {
    version: 1;
    job: "build";
    task: {
        id: string;
        topics: string[] | "auto";
        objective: { required_outputs: RequiredOutput[]; constraints: Record<string, unknown> };
        observations: Record<string, unknown>;
        data: Array<{ file: string; columns?: string[]; sha256?: string }>;
        budget: TaskBudget;
        requestedBy: string;
        requestedAt: string;
    };
    profile: string;
}

/** Where a task stands; `manifest.json` carries it, `factory.task` reads it. */
export type TaskState = "created" | "running" | "done" | "proposed" | "accepted" | "rejected" | "failed";

export const TOPICS = ["graph", "onnx", "procedure"] as const;
export type Topic = (typeof TOPICS)[number];

export const DEFAULT_BUDGET: TaskBudget = { iterations: 20, minutes: 30, twinPoints: 40 };
