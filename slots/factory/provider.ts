/**
 * The `factory` slot, the front of the workshop: it receives an order
 * (`request`: the functional contract of what is missing) and says where a
 * task stands (`task`). A request writes the task file (`task.json`, the
 * shape `docs/factory-harness.fr.md` section 5 gives, the one the container's
 * `build` job reads) in a fresh workspace directory and returns its id; the
 * loop that builds (`harness/core`, step F4) is what picks the task up. Until
 * then a task is `created` and says so.
 *
 * The factory holds no build tool of its own: they are the workshop's slots
 * (`workspace`, `model`, the runtime on `twin`), and the factory never
 * registers, never pushes, never talks to the board.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot, relativeToRoot } from "../../lib/paths.js";
import { sha256File } from "../../lib/files.js";
import { objectSchema as obj, publishSlot, type PublishedSlot, type SlotTool } from "../lib/slot-server.js";
import { checkTaskId, listTaskFiles, taskDir, WORKSHOP_ROOT } from "../tools/lib/workshop.js";

export interface RequiredOutput {
    name: string;
    quantity: string;
    unit?: string;
    horizonMinutes?: number;
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
        budget: { iterations: number; minutes: number; twinPoints: number };
        requestedBy: string;
        requestedAt: string;
    };
    profile: string;
}

export interface TaskStatus {
    taskId: string;
    state: "created" | "running" | "proposed" | "accepted" | "rejected" | "failed";
    workspace: string;
    taskSha256: string;
    files: number;
    manifest: Record<string, unknown> | null;
}

export interface FactoryState {
    root: string;
    tasks: Record<string, TaskStatus>;
}

const DEFAULT_BUDGET = { iterations: 20, minutes: 30, twinPoints: 40 };
const TOPICS = ["graph", "onnx"];

function newTaskId(): string {
    const stamp = new Date().toISOString().slice(0, 10);
    for (let n = 1; n < 10000; n++) {
        const id = `t-${stamp}-${n.toString().padStart(4, "0")}`;
        if (!existsSync(path.join(WORKSHOP_ROOT, id))) return id;
    }
    throw new Error("no free task id today");
}

function statusOf(taskId: string): TaskStatus {
    const dir = taskDir(taskId);
    const taskFile = path.join(dir, "task.json");
    if (!existsSync(taskFile)) throw new Error(`no task ${taskId}`);
    const manifestFile = path.join(dir, "manifest.json");
    const manifest = existsSync(manifestFile) ? (JSON.parse(readFileSync(manifestFile, "utf8")) as Record<string, unknown>) : null;
    const state = (manifest?.state as TaskStatus["state"] | undefined) ?? "created";
    return { taskId, state, workspace: relativeToRoot(dir), taskSha256: sha256File(taskFile), files: listTaskFiles(taskId).length, manifest };
}

export function factorySlot(wsBase: string, log: (line: string) => void): PublishedSlot<FactoryState> {
    const state: FactoryState = { root: WORKSHOP_ROOT, tasks: {} };
    const tools: SlotTool<FactoryState>[] = [
        {
            name: "request",
            inputSchema: obj(
                {
                    objective: {
                        type: "object",
                        properties: {
                            required_outputs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "string" }, unit: { type: "string" }, horizonMinutes: { type: "number" } }, required: ["name", "quantity"] } },
                            constraints: { type: "object" },
                        },
                        required: ["required_outputs"],
                    },
                    observations: { type: "object" },
                    data: { type: "array", items: { type: "object", properties: { file: { type: "string" }, columns: { type: "array", items: { type: "string" } }, sha256: { type: "string" } }, required: ["file"] } },
                    topics: {},
                    budget: { type: "object", properties: { iterations: { type: "number" }, minutes: { type: "number" }, twinPoints: { type: "number" } } },
                    requestedBy: { type: "string" },
                    profile: { type: "string" },
                },
                ["objective"],
            ),
            handle: (args, s) => {
                const objective = args.objective as { required_outputs?: RequiredOutput[]; constraints?: Record<string, unknown> } | undefined;
                const outputs = Array.isArray(objective?.required_outputs) ? objective.required_outputs.filter((o) => typeof o?.name === "string" && typeof o?.quantity === "string") : [];
                if (!outputs.length) throw new Error("objective.required_outputs must name at least one output with its quantity");
                let topics: string[] | "auto" = "auto";
                if (Array.isArray(args.topics)) {
                    topics = (args.topics as unknown[]).map(String);
                    const unknown = topics.filter((t) => !TOPICS.includes(t));
                    if (unknown.length) throw new Error(`unknown topics: ${unknown.join(", ")} (known: ${TOPICS.join(", ")})`);
                }
                const budgetArg = (args.budget ?? {}) as Partial<typeof DEFAULT_BUDGET>;
                const taskId = newTaskId();
                const dir = taskDir(taskId);
                mkdirSync(dir, { recursive: true });
                const task: TaskFile = {
                    version: 1,
                    job: "build",
                    task: {
                        id: taskId,
                        topics,
                        objective: { required_outputs: outputs, constraints: (objective?.constraints as Record<string, unknown>) ?? {} },
                        observations: (args.observations as Record<string, unknown>) ?? {},
                        data: Array.isArray(args.data) ? (args.data as TaskFile["task"]["data"]) : [],
                        budget: { iterations: budgetArg.iterations ?? DEFAULT_BUDGET.iterations, minutes: budgetArg.minutes ?? DEFAULT_BUDGET.minutes, twinPoints: budgetArg.twinPoints ?? DEFAULT_BUDGET.twinPoints },
                        requestedBy: typeof args.requestedBy === "string" ? args.requestedBy : "unknown",
                        requestedAt: new Date().toISOString(),
                    },
                    profile: typeof args.profile === "string" ? args.profile : "profiles/anthropic.json",
                };
                writeFileSync(path.join(dir, "task.json"), JSON.stringify(task, null, 2) + "\n");
                const status = statusOf(taskId);
                s.tasks[taskId] = status;
                log(`[factory] task ${taskId}: ${outputs.map((o) => o.name).join(", ")} for ${task.task.requestedBy}`);
                return { taskId, state: status.state, workspace: status.workspace, taskSha256: status.taskSha256, note: "the task is written; the build loop (harness/core) is not wired yet: nothing runs" };
            },
        },
        {
            name: "task",
            inputSchema: obj({ taskId: { type: "string" } }, ["taskId"]),
            handle: (args, s) => {
                const taskId = checkTaskId(args.taskId);
                const status = statusOf(taskId);
                s.tasks[taskId] = status;
                return status;
            },
        },
    ];

    return publishSlot<FactoryState>({
        slot: "factory",
        tools,
        resources: [
            {
                uri: "factory://tasks",
                read: () => {
                    if (!existsSync(WORKSHOP_ROOT)) return [];
                    return listTaskIds().map((id) => {
                        try {
                            return statusOf(id);
                        } catch {
                            return { taskId: id, state: "unknown" };
                        }
                    });
                },
            },
        ],
        state,
        wsBase,
        log,
        stub: false,
        version: "0.2.0",
        grammarsDir: fromRoot("slots", "factory", "grammars"),
    });
}

function listTaskIds(): string[] {
    return readdirSync(WORKSHOP_ROOT, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(path.join(WORKSHOP_ROOT, e.name, "task.json")))
        .map((e) => e.name)
        .sort();
}
