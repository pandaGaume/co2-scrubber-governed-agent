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
        /** The Observer's TWIN_FACTORY_REQUEST, whole, when the task comes from it (`harness/observer/request.ts`). */
        requirements?: Record<string, unknown>;
    };
    profile: string;
}

/** Where a task stands; `manifest.json` carries it, `factory.task` reads it. */
export type TaskState = "created" | "running" | "done" | "proposed" | "accepted" | "rejected" | "failed";

export const TOPICS = ["graph", "onnx", "procedure"] as const;
export type Topic = (typeof TOPICS)[number];

/**
 * Which factory builds a task (docs/observateur-et-usines.fr.md, section
 * 4): the topic the task names first, or, for `auto`, the dispatch, which
 * is the factory side's and never the Observer's. Its first version is a
 * written rule: a task that carries an Observer's requirements (what a twin
 * must reproduce) goes to the graph factory; anything else keeps the
 * default of F4, the ONNX model. The planner that chooses is F5.
 */
export function topicFor(task: TaskFile["task"]): Topic {
    if (Array.isArray(task.topics) && task.topics.length) return task.topics[0] as Topic;
    return task.requirements ? "graph" : "onnx";
}

export const DEFAULT_BUDGET: TaskBudget = { iterations: 20, minutes: 30, twinPoints: 40 };
