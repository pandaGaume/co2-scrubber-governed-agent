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
import { DEFAULT_BUDGET, TOPICS, topicFor, type RequiredOutput, type TaskFile, type TaskState, type Topic } from "../../harness/core/task.js";
import { runTask, TOPIC_DEFINITIONS, type RunTaskOptions } from "../../harness/core/runner.js";
import { ScriptedBuilder } from "../../harness/scripted/onnx.js";
import { ScriptedProcedureBuilder } from "../../harness/scripted/procedure.js";
import { ScriptedGraphBuilder } from "../../harness/scripted/graph.js";
import { ScriptedCodeBuilder } from "../../harness/scripted/code.js";
import { codeTaskRequest, handoffDepthOf, MAX_HANDOFF_DEPTH, missingForCode, openCodeQuestion, replayQuestion, replayRequest, type GeneratedType, type MissingForCode } from "./handoff.js";
import type { Plan } from "../../harness/core/workspace-observer.js";
import { ReasonerProvider } from "../../harness/providers/reasoner.js";
import { supervise, SUPERVISOR_PROMPT } from "../../harness/supervisor/supervisor.js";
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
    /** The hand-off this task opened (a graph task short of a node): the question asked, the code task, then the replay of the request on the forge; or the task it was opened by. */
    handoff?: { question?: string; codeTask?: string; replayTask?: string; parent?: string; reason?: string; stopped?: string };
    /** What waits for the commander's answer: the step to take and what it needs (kept in memory: a restart loses it, and says so). */
    pending?: Record<string, { step: string; missing?: MissingForCode; generated?: GeneratedType[]; codeTask?: string }>;
    /** The question a task.ask opened, while the task waits. */
    waiting?: string;
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

/** The task file of a task, as written. */
const taskOf = (taskId: string): TaskFile => JSON.parse(readFileSync(path.join(taskDir(taskId), "task.json"), "utf8")) as TaskFile;

/**
 * The hand-off (`handoff.ts`): a graph task that ended short of a node its
 * plan declared missing for the code factory, with a contract, opens the
 * code task; a code task that ended proposed replays the graph request on
 * the forge's catalogue with the generated types named. Nothing here reads
 * a model: the plan, the artifact and the task files say what to do.
 */
function handOff(httpBase: string, taskId: string, topic: Topic, builder: BuilderChoice, ended: TaskState, s: FactoryState, log: (line: string) => void, announce: (taskId: string, manifest?: Readonly<Record<string, unknown>>) => void, create: (args: Record<string, unknown>) => { taskId: string; task: TaskFile; topic: Topic }): void {
    const run = s.runs[taskId];
    const task = taskOf(taskId).task;
    const ask = async (question: Record<string, unknown>): Promise<string | null> => {
        const broker = new Broker(httpBase, { name: "factory", version: VERSION, locale: "en" });
        try {
            const r = await broker.call("station", "ask", question);
            if (!r.ok) {
                log(`[factory] task ${taskId}: the station did not take the question: ${r.error ?? r.outcome}`);
                return null;
            }
            return (r.output as { questionId: string }).questionId;
        } finally {
            await broker.close();
        }
    };
    if (ended === "waiting") {
        // A task.ask: the question is on the station; the answer comes back through `resume` (step "answer").
        const manifest = JSON.parse(readFileSync(path.join(taskDir(taskId), "manifest.json"), "utf8")) as { ended?: string };
        run.waiting = /question (q\d+)/.exec(manifest.ended ?? "")?.[1] ?? "?";
        run.pending = { ...(run.pending ?? {}), [run.waiting]: { step: "answer" } };
        log(`[factory] task ${taskId}: waiting for the commander (question ${run.waiting})`);
        announce(taskId);
        return;
    }
    if (topic === "graph" && ended !== "proposed") {
        const planFile = path.join(taskDir(taskId), "plan.json");
        const plan = existsSync(planFile) ? (JSON.parse(readFileSync(planFile, "utf8")) as Plan) : null;
        const [missing] = missingForCode(plan);
        if (!missing) return;
        if (handoffDepthOf(task) >= MAX_HANDOFF_DEPTH) {
            run.handoff = { ...(run.handoff ?? {}), reason: `"${missing.required_output}" is still missing after ${MAX_HANDOFF_DEPTH} hand-off(s): no further code task is opened` };
            log(`[factory] task ${taskId}: ${run.handoff.reason}`);
            return;
        }
        // The commander decides whether the code factory is opened on the contract the graph factory wrote; the factory waits for the answer.
        // What the answer will need is kept under a token before the question is asked: a standing order answers during the asking.
        const token = `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        run.pending = { ...(run.pending ?? {}), [token]: { step: "open-code", missing } };
        run.handoff = { ...(run.handoff ?? {}), reason: `"${missing.required_output}" is missing: ${missing.reason}` };
        void ask(openCodeQuestion(taskId, missing, token)).then((questionId) => {
            if (!questionId) return;
            run.handoff = { ...(run.handoff ?? {}), question: questionId };
            log(`[factory] task ${taskId}: "${missing.required_output}" is missing for the code factory: question ${questionId} to the commander`);
            announce(taskId);
        });
        return;
    }
    if (topic === "code") {
        const parentId = run.handoff?.parent;
        if (!parentId || ended !== "proposed") return;
        const parentRun = s.runs[parentId];
        // The plugin the forge signed: its types, from the artifact the task handed over.
        const artifacts = (JSON.parse(readFileSync(path.join(taskDir(taskId), "manifest.json"), "utf8")) as { artifacts?: Array<{ kind: string; path: string }> }).artifacts ?? [];
        const plugin = artifacts.find((a) => a.kind === "plugin");
        if (!plugin) return;
        const artifact = JSON.parse(readFileSync(path.join(taskDir(taskId), ...plugin.path.split("/")), "utf8")) as { plugin: string; sha256: string; types: string[]; acceptance?: unknown };
        const generated: GeneratedType[] = artifact.types.map((type) => ({ type, plugin: artifact.plugin, sha256: artifact.sha256, task: taskId }));
        if (!parentRun) return;
        const token = `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        parentRun.pending = { ...(parentRun.pending ?? {}), [token]: { step: "replay", generated, codeTask: taskId } };
        void ask(replayQuestion(parentId, taskId, generated, artifact.acceptance ?? null, token)).then((questionId) => {
            if (!questionId) return;
            parentRun.handoff = { ...(parentRun.handoff ?? {}), question: questionId };
            log(`[factory] task ${taskId} proposed ${generated.map((g) => g.type).join(", ")}: question ${questionId} to the commander before ${parentId} is replayed`);
            announce(parentId);
        });
    }
}

/**
 * The commander answered (`station.answer`, or a standing order): the step the question held is taken, or not. Called back by the station
 * with the question id and the answer; a step the factory no longer holds (a restart) is said so.
 */
function resumeOn(httpBase: string, taskId: string, questionId: string, token: string | null, answer: { choice: string; by: string; note: string | null; amendments?: { contract?: unknown } }, s: FactoryState, log: (line: string) => void, announce: (taskId: string, manifest?: Readonly<Record<string, unknown>>) => void, create: (args: Record<string, unknown>) => { taskId: string; task: TaskFile; topic: Topic }): Record<string, unknown> {
    const run = s.runs[taskId];
    const key = token ?? questionId;
    const pending = run?.pending?.[key];
    if (!run || !pending) throw new Error(`task ${taskId} holds nothing for question ${questionId} (a restart of the factory loses what waited; ask the request again)`);
    delete run.pending![key];
    const builder: BuilderChoice = run.builder.startsWith("scripted") ? "scripted" : "reasoner";
    const task = taskOf(taskId).task;
    if (pending.step === "open-code") {
        const missing = pending.missing!;
        if (answer.choice === "stop") {
            run.handoff = { ...(run.handoff ?? {}), stopped: `the commander did not open the code factory on "${missing.required_output}"${answer.note ? `: ${answer.note}` : ""}` };
            announce(taskId);
            return { taskId, step: pending.step, taken: false };
        }
        const contract = answer.choice === "amend" && answer.amendments?.contract && typeof answer.amendments.contract === "object" ? (answer.amendments.contract as MissingForCode["contract"]) : missing.contract;
        const code = create(codeTaskRequest(taskId, task, { ...missing, contract }, builder));
        run.handoff = { ...(run.handoff ?? {}), codeTask: code.taskId };
        log(`[factory] task ${taskId}: the commander opened the code factory on "${missing.required_output}"${answer.choice === "amend" ? " (contract amended)" : ""}: task ${code.taskId}`);
        const codeRun = launch(httpBase, code.taskId, code.topic, builder, s, log, announce, create);
        codeRun.handoff = { parent: taskId };
        announce(taskId);
        return { taskId, step: pending.step, taken: true, codeTask: code.taskId };
    }
    if (pending.step === "replay") {
        if (answer.choice === "stop") {
            run.handoff = { ...(run.handoff ?? {}), stopped: `the commander did not replay the request${answer.note ? `: ${answer.note}` : ""}` };
            announce(taskId);
            return { taskId, step: pending.step, taken: false };
        }
        const generated = pending.generated!;
        const data = (task.data ?? []).map((d) => ({ file: d.file, text: readFileSync(path.join(taskDir(taskId), ...d.file.split("/")), "utf8"), ...(d.columns ? { columns: d.columns } : {}) }));
        const replay = create(replayRequest(taskId, task, pending.codeTask!, generated, data, builder));
        run.handoff = { ...(run.handoff ?? {}), replayTask: replay.taskId };
        log(`[factory] task ${taskId}: the commander replayed the request on the forge with ${generated.map((g) => g.type).join(", ")}: task ${replay.taskId}`);
        launch(httpBase, replay.taskId, replay.topic, builder, s, log, announce, create);
        announce(taskId);
        return { taskId, step: pending.step, taken: true, replayTask: replay.taskId };
    }
    if (pending.step === "answer") {
        // The answer into the task's observations, the manifest of the run that waited kept, the loop started again: it reads the answer in its state.
        const file = path.join(taskDir(taskId), "task.json");
        const whole = JSON.parse(readFileSync(file, "utf8")) as TaskFile;
        const answers = Array.isArray(whole.task.observations.answers) ? (whole.task.observations.answers as unknown[]) : [];
        whole.task.observations = { ...whole.task.observations, answers: [...answers, { questionId, choice: answer.choice, by: answer.by, note: answer.note, at: new Date().toISOString() }] };
        writeFileSync(file, JSON.stringify(whole, null, 2) + "\n");
        const manifestFile = path.join(taskDir(taskId), "manifest.json");
        if (existsSync(manifestFile)) writeFileSync(path.join(taskDir(taskId), `manifest.waiting-${questionId}.json`), readFileSync(manifestFile));
        delete run.waiting;
        log(`[factory] task ${taskId}: the commander answered ${questionId} (${answer.choice}): the loop goes on`);
        const again = launch(httpBase, taskId, topicFor(whole.task), builder, s, log, announce, create);
        again.handoff = run.handoff;
        return { taskId, step: pending.step, taken: true, choice: answer.choice };
    }
    throw new Error(`task ${taskId}: unknown step "${pending.step}" for question ${questionId}`);
}

/** Starts the loop on a task, in this process, on the factory's own client of the broker; the manifest carries the outcome, and `announce` tells the readers of the task list as it goes. */
function launch(httpBase: string, taskId: string, topic: Topic, builder: BuilderChoice, s: FactoryState, log: (line: string) => void, announce: (taskId: string, manifest?: Readonly<Record<string, unknown>>) => void, create: (args: Record<string, unknown>) => { taskId: string; task: TaskFile; topic: Topic }): TaskRun {
    const run: TaskRun = { startedAt: new Date().toISOString(), builder: builder === "scripted" ? `scripted:${topic}` : "reasoner", lastStage: null, ended: null };
    s.runs[taskId] = run;
    const runtimeSlot = taskOf(taskId).task.runtime ?? (topic === "code" ? "forge" : "twin");
    const broker = new Broker(httpBase, { name: "factory", version: VERSION, locale: "en" });
    void (async () => {
        // The builder: the script of the topic only when asked for by name; otherwise the model behind the reasoner slot, reading the topic's prompt.
        let provider: RunTaskOptions["provider"];
        let promptFile: string | null = null;
        if (builder === "scripted") provider = topic === "procedure" ? (ctx) => new ScriptedProcedureBuilder(ctx) : topic === "graph" ? (ctx) => new ScriptedGraphBuilder(ctx) : topic === "code" ? (ctx) => new ScriptedCodeBuilder(ctx) : (ctx) => new ScriptedBuilder(ctx);
        else {
            const prompt = TOPIC_DEFINITIONS[topic]?.prompt;
            if (!prompt) throw new Error(`topic ${topic} has no prompt for a model yet: ask for builder "scripted"`);
            const reasoner = await ReasonerProvider.connect(broker);
            if (!reasoner.description.ready) throw new Error(`the reasoner is not ready: ${reasoner.description.reason ?? "no reason given"}`);
            reasoner.usePrompt(prompt);
            // The graph and procedure factories run on the reasoning state: the model reads the state the harness rebuilds at every step, never the transcript (the refactoring of 2026-09-25); their state carries what they read. The onnx topic keeps the conversation.
            reasoner.useContext(topic === "onnx" ? "conversation" : "state");
            run.builder = reasoner.name;
            provider = reasoner;
            promptFile = prompt;
        }
        // The Contract Supervisor beside the builder, when a model is ready: the same reasoner slot, its own prompt, the state mode; a scripted builder runs without it.
        const supervisor: RunTaskOptions["supervisor"] = builder === "scripted" ? undefined : async (input) => {
            const model = await ReasonerProvider.connect(broker);
            if (!model.description.ready) return null;
            model.usePrompt(SUPERVISOR_PROMPT);
            model.useContext("state");
            const r = await supervise({ provider: model, input });
            return r.verdict;
        };
        return runTask({
            broker,
            taskId,
            provider,
            topic,
            promptFile,
            runtimeSlot,
            ...(supervisor ? { supervisor } : {}),
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
            // The hand-off, once the loop said how it ended: a graph task short of a node opens the code task, a code task proposed replays the request.
            try {
                handOff(httpBase, taskId, topic, builder, r.state, s, log, announce, create);
            } catch (e) {
                log(`[factory] task ${taskId}: the hand-off failed: ${errorMessage(e)}`);
            }
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

/** A task written into the workshop from a request: the file, the data, the status; nothing launched. */
function createTask(args: Record<string, unknown>, s: FactoryState, log: (line: string) => void): { taskId: string; task: TaskFile; topic: Topic } {
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
                ...(args.requirements && typeof args.requirements === "object" ? { requirements: args.requirements as Record<string, unknown> } : {}),
                // The runtime the task builds on: given (a replay on the forge), or the topic's (the code topic on the forge, the rest on the twin).
                ...(typeof args.runtime === "string" ? { runtime: args.runtime } : Array.isArray(topics) && topics[0] === "code" ? { runtime: "forge" } : {}),
            },
            profile: typeof args.profile === "string" ? args.profile : "profiles/anthropic.json",
        };
        writeFileSync(path.join(dir, "task.json"), JSON.stringify(task, null, 2) + "\n");
        s.tasks[taskId] = statusOf(taskId);
        log(`[factory] task ${taskId}: ${outputs.map((o) => o.name).join(", ")} for ${task.task.requestedBy}, ${data.length} data file(s)`);
        return { taskId, task, topic: topicFor(task.task) };
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
                    requirements: { type: "object" },
                    runtime: { type: "string", enum: ["twin", "forge"], description: "the slot the task builds and runs on; the topic's by default (code on the forge, the rest on the twin)" },
                },
                ["objective"],
            ),
            handle: (args, s) => {
                const { taskId, task, topic } = createTask(args, s, log);
                const status = statusOf(taskId);
                const builder: BuilderChoice = args.builder === "scripted" || args.builder === "reasoner" ? args.builder : TOPIC_DEFINITIONS[topic]?.prompt ? "reasoner" : "scripted";
                const run = args.run === false ? null : launch(httpBase, taskId, topic, builder, s, log, (id, manifest) => announce(id, manifest), (a) => createTask(a, s, log));
                if (!run) announce(taskId);
                return { taskId, state: run ? "running" : status.state, workspace: status.workspace, taskSha256: status.taskSha256, data: task.task.data, builder: run?.builder ?? null, started: Boolean(run) };
            },
        },
        {
            name: "task",
            inputSchema: obj({ taskId: { type: "string" } }, ["taskId"]),
            handle: (args, s) => taskAnswer(checkTaskId(args.taskId), s),
        },
        {
            // The station calls back with the commander's answer (Tier 4): the step the question held is taken. Never the agent's.
            name: "resume",
            inputSchema: obj({ taskId: { type: "string" }, step: { type: "string" }, token: { type: "string" }, questionId: { type: "string" }, answer: { type: "object" } }, ["taskId", "questionId", "answer"]),
            handle: (args, s) => resumeOn(httpBase, checkTaskId(args.taskId), String(args.questionId), typeof args.token === "string" ? args.token : null, args.answer as never, s, log, (id, manifest) => announce(id, manifest), (a) => createTask(a, s, log)),
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
