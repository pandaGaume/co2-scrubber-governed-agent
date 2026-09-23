/**
 * The `factory` slot, the front of the workshop: it receives an order
 * (`request`: the functional contract of what is missing) and says where a
 * task stands (`task`). A request writes the task file (`task.json`, the
 * shape `docs/factory-harness.fr.md` section 5 gives, the one the container's
 * `build` job reads; the shape itself is `harness/core/task.ts`) in a fresh
 * workspace directory, writes the data the request carries next to it
 * (`data[].rows` or `data[].text`, with their sha256 in the task file), and
 * starts the loop that builds (`harness/core/runner.ts`, `runTask`) in this
 * process on the factory's own client of the broker (since 2026-09-21; `run:
 * false` only opens the task). `manifest.json` is where the loop writes the
 * state `task` reads: `running`, then `proposed` or `failed`, with every
 * step. The builder is the scripted one of the topic until F5 brings the
 * model; the recipes live in `_recipes/` next to the workshops, or where
 * `FACTORY_RECIPES_DIR` says.
 *
 * The factory holds no build tool of its own: they are the workshop's slots
 * (`workspace`, `model`, the runtime on `twin`), and the factory never
 * registers, never pushes, never talks to the board.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot, relativeToRoot } from "../../lib/paths.js";
import { errorMessage, sha256File } from "../../lib/files.js";
import { objectSchema as obj, publishSlot, type PublishedSlot, type SlotTool } from "../lib/slot-server.js";
import { checkTaskId, listTaskFiles, safeRelative, sha256Of, taskDir, WORKSHOP_ROOT } from "../tools/lib/workshop.js";
import { DEFAULT_BUDGET, TOPICS, type RequiredOutput, type TaskFile, type TaskState, type Topic } from "../../harness/core/task.js";
import { runTask, TOPIC_DEFINITIONS, type RunTaskOptions } from "../../harness/core/runner.js";
import { ScriptedBuilder } from "../../harness/scripted/onnx.js";
import { ScriptedProcedureBuilder } from "../../harness/scripted/procedure.js";
import { ReasonerProvider } from "../../harness/providers/reasoner.js";
import { Broker } from "../../harness/lib/broker.js";
import type { Device } from "../station/registry.js";
import { inventoryOf } from "./inventory.js";

/**
 * Who builds a task: the language model behind the `reasoner` slot, which
 * reads the topic's prompt (the default for a topic that has one: the
 * procedure), or the topic's script (the default for `onnx`, whose prompt
 * is F5; for the procedure only when asked by name, which the tests do).
 * The factory never falls back from one to the other on its own: a
 * reasoner that is not ready fails the task and says why.
 */
export type BuilderChoice = "reasoner" | "scripted";

export interface TaskStatus {
    taskId: string;
    state: TaskState;
    workspace: string;
    taskSha256: string;
    files: number;
    manifest: Record<string, unknown> | null;
}

/** A task the loop runs in this process: what the front knows of it while it runs. */
export interface TaskRun {
    startedAt: string;
    builder: string;
    lastStage: string | null;
    ended: TaskState | null;
}

export interface FactoryState {
    root: string;
    tasks: Record<string, TaskStatus>;
    runs: Record<string, TaskRun>;
}

const VERSION = "0.3.0";


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

/** The data a request carries, written into the task: rows as a JSON file, or a text as it is. */
function writeData(dir: string, entry: Record<string, unknown>): TaskFile["task"]["data"][number] {
    const file = safeRelative(entry.file);
    const out: TaskFile["task"]["data"][number] = { file };
    if (Array.isArray(entry.columns)) out.columns = (entry.columns as unknown[]).map(String);
    let text: string | null = null;
    if (Array.isArray(entry.rows)) {
        text = JSON.stringify(entry.rows);
        if (!out.columns && entry.rows.length && typeof entry.rows[0] === "object" && entry.rows[0]) out.columns = Object.keys(entry.rows[0] as object);
    } else if (typeof entry.text === "string") text = entry.text;
    if (text !== null) {
        const full = path.join(dir, file);
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, text);
        out.sha256 = sha256Of(text);
    } else if (typeof entry.sha256 === "string") out.sha256 = entry.sha256;
    return out;
}

/** The URI of the task list, and the `_meta` key its notification carries the changed task under. */
export const TASKS_URI = "factory://tasks";
export const META_TASK = "spikypanda/task";

/** What `task` answers for one task: its status, and its run when this process runs it. `manifest` replaces the one on disk while the run holds a newer one in memory. */
function taskAnswer(taskId: string, s: FactoryState, manifest?: Readonly<Record<string, unknown>>): TaskStatus & { run: (TaskRun & { steps: number }) | null } {
    const status = statusOf(taskId);
    if (manifest) {
        status.manifest = manifest as Record<string, unknown>;
        status.state = (manifest.state as TaskStatus["state"] | undefined) ?? status.state;
    }
    s.tasks[taskId] = status;
    const run = s.runs[taskId];
    return { ...status, run: run ? { ...run, steps: Array.isArray(status.manifest?.steps) ? (status.manifest.steps as unknown[]).length : 0 } : null };
}

/** Starts the loop on a task, in this process, on the factory's own client of the broker; the manifest carries the outcome, and `announce` tells the readers of the task list as it goes. */
function launch(httpBase: string, taskId: string, topic: Topic, builder: BuilderChoice, s: FactoryState, log: (line: string) => void, announce: (taskId: string, manifest?: Readonly<Record<string, unknown>>) => void): TaskRun {
    const run: TaskRun = { startedAt: new Date().toISOString(), builder: builder === "scripted" ? `scripted:${topic}` : "reasoner", lastStage: null, ended: null };
    s.runs[taskId] = run;
    const broker = new Broker(httpBase, { name: "factory", version: VERSION, locale: "en" });
    void (async () => {
        // The builder: the script of the topic only when asked for by name; otherwise the model behind the reasoner slot, reading the topic's prompt.
        let provider: RunTaskOptions["provider"];
        let promptFile: string | null = null;
        if (builder === "scripted") provider = topic === "procedure" ? (ctx) => new ScriptedProcedureBuilder(ctx) : (ctx) => new ScriptedBuilder(ctx);
        else {
            const prompt = TOPIC_DEFINITIONS[topic]?.prompt;
            if (!prompt) throw new Error(`topic ${topic} has no prompt for a model yet: ask for builder "scripted"`);
            const reasoner = await ReasonerProvider.connect(broker);
            if (!reasoner.description.ready) throw new Error(`the reasoner is not ready: ${reasoner.description.reason ?? "no reason given"}`);
            reasoner.usePrompt(prompt);
            run.builder = reasoner.name;
            provider = reasoner;
            promptFile = prompt;
        }
        return runTask({
            broker,
            taskId,
            provider,
            topic,
            promptFile,
            // The recipes of the topics: `_recipes/` next to the workshops unless the host says where (the tests keep their own).
            ...(process.env.FACTORY_RECIPES_DIR ? { recipesDir: path.resolve(process.env.FACTORY_RECIPES_DIR) } : {}),
            log,
            onStage: (e) => {
                if (e.status === "complete") run.lastStage = e.stage;
            },
            onProgress: (manifest) => announce(taskId, manifest as unknown as Record<string, unknown>),
        });
    })()
        .then((r) => {
            run.ended = r.state;
        })
        .catch((e) => {
            // The loop itself failed before it could say so (the task file, the broker): the manifest says it, so `task` does.
            run.ended = "failed";
            const reason = `the loop failed: ${errorMessage(e)}`;
            log(`[factory] task ${taskId}: ${reason}`);
            const manifestFile = path.join(taskDir(taskId), "manifest.json");
            const manifest = existsSync(manifestFile) ? (JSON.parse(readFileSync(manifestFile, "utf8")) as Record<string, unknown>) : { version: 1, taskId, steps: [] };
            writeFileSync(manifestFile, JSON.stringify({ ...manifest, state: "failed", ended: reason, endedAt: new Date().toISOString() }, null, 2) + "\n");
        })
        .finally(() => {
            announce(taskId);
            void broker.close();
        });
    return run;
}

export function factorySlot(wsBase: string, log: (line: string) => void): PublishedSlot<FactoryState> {
    const httpBase = wsBase.replace(/^ws(s?):\/\//, "http$1://");
    const state: FactoryState = { root: WORKSHOP_ROOT, tasks: {}, runs: {} };
    /**
     * Tells the readers of `factory://tasks` that a task changed: the MCP
     * notification for a changed resource, with the task's answer (what `task`
     * returns) in its `_meta`, so a page following it reads nothing back. A
     * reader that does not know the key reads the list, as the specification
     * says. Set once the slot is built (below).
     */
    let announce: (taskId: string, manifest?: Readonly<Record<string, unknown>>) => void = () => undefined;
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
                    data: { type: "array", items: { type: "object", properties: { file: { type: "string" }, columns: { type: "array", items: { type: "string" } }, sha256: { type: "string" }, rows: { type: "array", items: { type: "object" } }, text: { type: "string" } }, required: ["file"] } },
                    topics: {},
                    budget: { type: "object", properties: { iterations: { type: "number" }, minutes: { type: "number" }, twinPoints: { type: "number" } } },
                    requestedBy: { type: "string" },
                    profile: { type: "string" },
                    run: { type: "boolean" },
                    builder: { type: "string", enum: ["reasoner", "scripted"] },
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
                    const unknown = topics.filter((t) => !(TOPICS as ReadonlyArray<string>).includes(t));
                    if (unknown.length) throw new Error(`unknown topics: ${unknown.join(", ")} (known: ${TOPICS.join(", ")})`);
                }
                const budgetArg = (args.budget ?? {}) as Partial<typeof DEFAULT_BUDGET>;
                const taskId = newTaskId();
                const dir = taskDir(taskId);
                mkdirSync(dir, { recursive: true });
                const data = Array.isArray(args.data) ? (args.data as unknown[]).filter((d): d is Record<string, unknown> => Boolean(d) && typeof d === "object").map((d) => writeData(dir, d)) : [];
                const task: TaskFile = {
                    version: 1,
                    job: "build",
                    task: {
                        id: taskId,
                        topics,
                        objective: { required_outputs: outputs, constraints: (objective?.constraints as Record<string, unknown>) ?? {} },
                        observations: (args.observations as Record<string, unknown>) ?? {},
                        data,
                        budget: { iterations: budgetArg.iterations ?? DEFAULT_BUDGET.iterations, minutes: budgetArg.minutes ?? DEFAULT_BUDGET.minutes, twinPoints: budgetArg.twinPoints ?? DEFAULT_BUDGET.twinPoints },
                        requestedBy: typeof args.requestedBy === "string" ? args.requestedBy : "unknown",
                        requestedAt: new Date().toISOString(),
                    },
                    profile: typeof args.profile === "string" ? args.profile : "profiles/anthropic.json",
                };
                writeFileSync(path.join(dir, "task.json"), JSON.stringify(task, null, 2) + "\n");
                const status = statusOf(taskId);
                s.tasks[taskId] = status;
                log(`[factory] task ${taskId}: ${outputs.map((o) => o.name).join(", ")} for ${task.task.requestedBy}, ${data.length} data file(s)`);
                const topic: Topic = Array.isArray(topics) && topics.length ? (topics[0] as Topic) : "onnx";
                const builder: BuilderChoice = args.builder === "scripted" || args.builder === "reasoner" ? args.builder : TOPIC_DEFINITIONS[topic]?.prompt ? "reasoner" : "scripted";
                const run = args.run === false ? null : launch(httpBase, taskId, topic, builder, s, log, (id, manifest) => announce(id, manifest));
                if (!run) announce(taskId);
                return { taskId, state: run ? "running" : status.state, workspace: status.workspace, taskSha256: status.taskSha256, data, builder: run?.builder ?? null, started: Boolean(run) };
            },
        },
        {
            name: "task",
            inputSchema: obj({ taskId: { type: "string" } }, ["taskId"]),
            handle: (args, s) => taskAnswer(checkTaskId(args.taskId), s),
        },
        {
            // Who is there: Mother's register, read through the broker as the factory reads everything, and what can be told from it.
            name: "inventory",
            inputSchema: obj({}),
            handle: async () => {
                const reader = new Broker(httpBase, { name: "factory", version: VERSION, locale: "en" });
                try {
                    const r = await reader.call("station", "registry_list", {});
                    if (!r.ok) throw new Error(`the station's register did not answer: ${r.error ?? r.outcome}`);
                    return inventoryOf((r.output as { devices: Device[] }).devices);
                } finally {
                    await reader.close();
                }
            },
        },
    ];

    const published = publishSlot<FactoryState>({
        slot: "factory",
        tools,
        resources: [
            {
                uri: TASKS_URI,
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
        version: VERSION,
        grammarsDir: fromRoot("slots", "factory", "grammars"),
    });
    announce = (taskId, manifest) => {
        try {
            published.notify("notifications/resources/updated", { uri: TASKS_URI, _meta: { [META_TASK]: taskAnswer(taskId, state, manifest) } });
        } catch (e) {
            log(`[factory] task ${taskId}: could not tell its readers (${errorMessage(e)})`);
        }
    };
    return published;
}

function listTaskIds(): string[] {
    return readdirSync(WORKSHOP_ROOT, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(path.join(WORKSHOP_ROOT, e.name, "task.json")))
        .map((e) => e.name)
        .sort();
}
