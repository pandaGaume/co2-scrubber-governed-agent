/**
 * One task from end to end (docs/harness-stages.fr.md, section 3): the
 * runner receives a broker and a task id and does not know where it runs
 * (the habitat's broker under the `factory` role, or the container's own).
 * It reads `task.json` through the workspace slot, builds the constructor
 * (the loop of `agent.ts` with the workshop's services), steps it once per
 * tool call until the model's `task.done` passes the topic's validator or
 * the budget is spent, then writes the trace and the manifest into the
 * workshop, proposes to the station, and saves the recipes.
 *
 *   runTask({ broker, provider, taskId }) -> { state, steps, proposalId, manifest }
 *
 * The proposal is the runner's last action, not the model's: the sha256 of
 * the manifest exists only once the trace is closed. What the station
 * received is kept byte for byte as `manifest.proposed.json`; `manifest.json`
 * is the same plus the proposal's id and the final state.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import type { DecisionTrace, Intention, JsonValue, StageEvent } from "@spiky-panda/harness";
import { errorMessage, sha256File } from "../../lib/files.js";
import { fromRoot } from "../../lib/paths.js";
import { WORKSHOP_ROOT } from "../../slots/tools/lib/workshop.js";
import type { Broker } from "../lib/broker.js";
import type { Provider, ProviderExchange } from "../lib/provider.js";
import { createAgent } from "./agent.js";
import { createBuilderGuard } from "./builder-guard.js";
import { buildCapabilities, type CapabilityCall } from "./capabilities.js";
import { manifestText, sha256Text, summarize, toolsOf, type Manifest, type ManifestArtifact, type ManifestStep } from "./manifest.js";
import { intentionFor, loadRecipes, saveRecipes, taskSignature } from "./recipes.js";
import { createTaskEvaluator } from "./task-evaluator.js";
import { taskCapabilities } from "./task-capabilities.js";
import { DEFAULT_BUDGET, type TaskFile, type TaskState, type Topic } from "./task.js";
import type { TopicDefinition } from "./topic.js";
import { createWorkspaceObserver, isArtifact, listWorkshop, newProgress, type Progress } from "./workspace-observer.js";
import { ONNX_TOPIC } from "../topics/onnx/index.js";

/** The topics the constructor knows; `graph` is F5. */
export const TOPIC_DEFINITIONS: Partial<Record<Topic, TopicDefinition>> = { onnx: ONNX_TOPIC };

/** What a provider built for one task receives: the task, and the last call of the loop (what a model reads in `lastOutput`). */
export interface BuilderContext {
    taskId: string;
    task: TaskFile["task"];
    topic: Topic;
    lastCall: () => CapabilityCall | null;
}

export interface RunTaskOptions {
    broker: Broker;
    /** The reasoner: a provider, or a function that builds one for this task (the scripted builders read the task). */
    provider: Provider | ((context: BuilderContext) => Provider);
    taskId: string;
    /** The topic to build on; by default the task's first topic, `onnx` when the task says `auto` (the planner that chooses is F5). */
    topic?: Topic;
    /** Where the recipes of the topics live; by default `_recipes/` next to the workshops. */
    recipesDir?: string;
    /** The slot that publishes the runtime (catalogue, documents, sandbox): `twin` in the habitat. */
    runtimeSlot?: string;
    /** The prompt file the provider was built with, for the manifest; none for a scripted builder. */
    promptFile?: string | null;
    timeoutMs?: number;
    onStage?: (event: StageEvent) => void;
    /** The manifest as it stands, once it is opened and after every step: it reaches the disk only at the start and the end, and a reader following the task (the factory slot's push) needs the steps as they come. */
    onProgress?: (manifest: Readonly<Manifest>) => void;
    log?: (line: string) => void;
}

export interface RunTaskResult {
    taskId: string;
    state: TaskState;
    phase: Progress["phase"];
    steps: number;
    proposalId: string | null;
    manifest: Manifest;
    manifestSha256: string;
    /** sha256 of the manifest the station received. */
    proposedManifestSha256: string | null;
}

/** A line of `trace.jsonl`: one step, with the model's exchange when there was one. */
export interface TraceLine {
    n: number;
    decisionId: string | null;
    source: ManifestStep["source"];
    trace: DecisionTrace | null;
    failed: string | null;
    exchange: ProviderExchange | null;
    call: CapabilityCall | null;
    ms: number;
}

/** A path relative to the repository when it is under it, absolute otherwise (the recipes may live elsewhere). */
const relativeOrAbsolute = (file: string): string => {
    const rel = path.relative(fromRoot(), file).split(path.sep).join("/");
    return rel.startsWith("..") ? file.split(path.sep).join("/") : rel;
};

const kindOf = (p: string): ManifestArtifact["kind"] => (p.endsWith(".onnx") ? "model" : p.endsWith(".spikypanda") ? "graph" : p.endsWith("contract.json") ? "contract" : "file");

async function readTask(broker: Broker, taskId: string): Promise<{ task: TaskFile; sha256: string }> {
    const r = await broker.call("workspace", "read", { taskId, path: "task.json" });
    if (!r.ok) throw new Error(`cannot read task ${taskId}: ${r.error ?? r.outcome}`);
    const { text, sha256 } = r.output as { text: string; sha256: string };
    const task = JSON.parse(text) as TaskFile;
    if (task.job !== "build" || !task.task?.id) throw new Error(`task ${taskId}: task.json is not a build task`);
    return { task, sha256 };
}

async function writeText(broker: Broker, taskId: string, file: string, text: string): Promise<string> {
    const r = await broker.call("workspace", "write", { taskId, path: file, text });
    if (!r.ok) throw new Error(`cannot write ${file} in task ${taskId}: ${r.error ?? r.outcome}`);
    return (r.output as { sha256: string }).sha256;
}

export async function runTask({ broker, provider: providerOrBuild, taskId, topic: topicName, recipesDir = path.join(WORKSHOP_ROOT, "_recipes"), runtimeSlot = "twin", promptFile = null, timeoutMs = 60000, onStage, onProgress, log = () => undefined }: RunTaskOptions): Promise<RunTaskResult> {
    const startedAt = new Date();
    const { task: file, sha256: taskSha256 } = await readTask(broker, taskId);
    const task = file.task;
    const topicId: Topic = topicName ?? (Array.isArray(task.topics) && task.topics.length ? (task.topics[0] as Topic) : "onnx");
    const topic = TOPIC_DEFINITIONS[topicId];
    if (!topic) throw new Error(`topic ${topicId} is not built yet (${Object.keys(TOPIC_DEFINITIONS).join(", ")})`);
    const budget = { ...DEFAULT_BUDGET, ...(task.budget ?? {}) };
    const signature = taskSignature(task, topicId);
    const intention: Intention = intentionFor(task, signature);
    const recipes = loadRecipes(recipesDir, topicId);
    const progress = newProgress();
    const calls: CapabilityCall[] = [];
    const provider = typeof providerOrBuild === "function" ? providerOrBuild({ taskId, task, topic: topicId, lastCall: () => progress.lastCall }) : providerOrBuild;
    const profileFile = fromRoot(file.profile ?? "");
    const promptPath = promptFile ? fromRoot(promptFile) : null;

    const capabilities = await buildCapabilities(broker, {
        profile: {
            included: topic.tools,
            bindings: [
                { match: /^(workspace|model)\./, constants: { taskId } },
                { match: new RegExp(`^${runtimeSlot}\\.(document_build|document_instantiate|session_run)$`), rewrite: (input) => (typeof input.name === "string" ? { ...input, name: `${taskId}/${input.name}` } : input) },
            ],
            local: taskCapabilities(broker, taskId, progress),
        },
        onCall: (call) => {
            progress.lastCall = call;
            calls.push(call);
        },
    });
    const agent = createAgent({
        broker,
        provider,
        capabilities,
        observer: createWorkspaceObserver(broker, taskId, progress),
        evaluator: createTaskEvaluator({ broker, taskId, task, topic, progress }),
        guard: createBuilderGuard({ broker, task, topic, runtimeSlot }),
        policy: recipes.policy,
        timeoutMs,
        onStage,
    });

    const manifest: Manifest = {
        version: 1,
        taskId,
        state: "running",
        topic: topicId,
        signature,
        startedAt: startedAt.toISOString(),
        endedAt: null,
        task: { file: "task.json", sha256: taskSha256 },
        profile: { file: file.profile ?? "", sha256: file.profile && existsSync(profileFile) ? sha256File(profileFile) : null },
        prompt: { file: promptFile, sha256: promptPath && existsSync(promptPath) ? sha256File(promptPath) : null },
        provider: { name: provider.name, model: provider.model, family: provider.family },
        tools: toolsOf(capabilities.catalogue),
        recipes: { file: relativeOrAbsolute(recipes.file), loaded: recipes.loaded, experiencesBefore: recipes.experiences, experiencesAfter: null, replayedSteps: 0, sha256: null },
        budget: { iterations: budget.iterations, minutes: budget.minutes },
        steps: [],
        artifacts: [],
        sandbox: null,
        proposal: null,
        verdict: null,
        ended: null,
    };
    await writeText(broker, taskId, "manifest.json", manifestText(manifest));
    onProgress?.(manifest);
    log(`[factory] task ${taskId}: topic ${topicId}, signature ${signature.id}, ${capabilities.catalogue.length} tools, recipes ${recipes.loaded ? `${recipes.experiences} experiences` : "none"}`);

    const lines: TraceLine[] = [];
    const attached = new Set<string | undefined>();
    provider.begin?.(intention.id);
    let ended: string | null = null;
    let reported = 0;
    while (progress.phase !== "done" && progress.phase !== "failed") {
        // The step just recorded, said before the next one starts (every branch below ends in `continue`).
        if (manifest.steps.length > reported) onProgress?.(manifest);
        reported = manifest.steps.length;
        const n = progress.iteration + 1;
        const minutes = (Date.now() - startedAt.getTime()) / 60000;
        if (progress.iteration >= budget.iterations) {
            ended = `iteration budget spent (${budget.iterations})`;
            break;
        }
        if (minutes >= budget.minutes) {
            ended = `time budget spent (${budget.minutes} min)`;
            break;
        }
        const stepStarted = Date.now();
        let trace: DecisionTrace | null = null;
        let failed: string | null = null;
        try {
            trace = await agent.decide(intention);
        } catch (e) {
            failed = errorMessage(e);
        }
        const ms = Date.now() - stepStarted;
        const exchange = trace ? (provider.exchanges.find((x) => x.decisionId === trace.decisionId) ?? null) : (provider.exchanges.filter((x) => !attached.has(x.decisionId)).at(-1) ?? null);
        if (exchange) attached.add(exchange.decisionId);
        const call = calls.at(-1)?.decisionId === trace?.decisionId ? (calls.at(-1) ?? null) : null;
        progress.iteration = n;
        if (trace) {
            progress.lastRefusal = null;
            const outcome = ((trace.result.output as { outcome?: string } | undefined)?.outcome ?? (trace.result.ok ? "completed" : "error")) as string;
            manifest.steps.push({
                n,
                decisionId: trace.decisionId,
                source: trace.source,
                capability: trace.decision.invocation.capabilityId,
                input: trace.decision.invocation.input,
                outcome,
                summary: summarize((trace.result.output ?? trace.result.error ?? null) as JsonValue),
                reward: trace.evaluation.reward,
                reason: trace.evaluation.reason ?? null,
                ms,
                tokens: exchange?.tokens ?? null,
            });
            if (trace.source === "policy") manifest.recipes.replayedSteps++;
            lines.push({ n, decisionId: trace.decisionId, source: trace.source, trace, failed: null, exchange, call, ms });
            log(`[factory] step ${n}: ${trace.decision.invocation.capabilityId} -> ${outcome} (${trace.evaluation.reason ?? ""})${trace.source === "policy" ? " [replayed]" : ""}`);
            continue;
        }
        if (exchange) {
            // The harness stopped the step (the guard, the schema, a capability outside the list, a timeout): the model reads the reason at the next step.
            progress.lastRefusal = { capability: exchange.proposedCapabilityId, reason: failed ?? "refused" };
            manifest.steps.push({ n, decisionId: exchange.decisionId ?? null, source: "refused", capability: exchange.proposedCapabilityId, input: exchange.proposedInput, outcome: "refused", summary: failed, reward: null, reason: failed, ms, tokens: exchange.tokens });
            lines.push({ n, decisionId: exchange.decisionId ?? null, source: "refused", trace: null, failed, exchange, call: null, ms });
            log(`[factory] step ${n}: ${exchange.proposedCapabilityId} -> stopped by the harness (${failed})`);
            continue;
        }
        // No proposal was made: the reasoner itself failed (the endpoint, the key, the network). Repeating the call would repeat the failure.
        manifest.steps.push({ n, decisionId: null, source: "failed", capability: null, input: null, outcome: "failed", summary: failed, reward: null, reason: failed, ms, tokens: null });
        lines.push({ n, decisionId: null, source: "failed", trace: null, failed, exchange: null, call: null, ms });
        ended = `the reasoner failed: ${failed}`;
        break;
    }
    if (manifest.steps.length > reported) onProgress?.(manifest);
    if (progress.phase !== "done") progress.phase = "failed";

    // What the task leaves: the artifacts with their sha256, the contract next to a model.
    const files = await listWorkshop(broker, taskId);
    manifest.artifacts = files
        .filter((f) => isArtifact(f.path))
        .map((f) => {
            const kind = kindOf(f.path);
            const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/") + 1) : "";
            const contract = kind === "model" ? files.find((c) => c.path.startsWith(dir) && c.path.endsWith("contract.json")) : undefined;
            return { kind, path: f.path, sha256: f.sha256, bytes: f.bytes, ...(contract ? { contractSha256: contract.sha256 } : {}) };
        });
    manifest.sandbox = progress.sandbox;
    manifest.state = progress.phase === "done" ? "done" : "failed";
    manifest.ended = ended ?? (progress.phase === "done" ? `contract held after ${progress.iteration} step(s)` : progress.failure !== null ? `the builder gave up: ${progress.failure}` : "not done");
    manifest.endedAt = new Date().toISOString();
    await writeText(broker, taskId, "trace.jsonl", lines.map((l) => JSON.stringify(l)).join("\n") + "\n");

    let proposalId: string | null = null;
    let proposedManifestSha256: string | null = null;
    if (progress.phase === "done" && progress.done) {
        const proposedText = manifestText(manifest);
        proposedManifestSha256 = sha256Text(proposedText);
        await writeText(broker, taskId, "manifest.proposed.json", proposedText);
        const artifacts = manifest.artifacts.filter((a) => a.kind === "model" || a.kind === "graph").map((a) => ({ kind: a.kind, path: a.path, sha256: a.sha256, ...(a.contractSha256 ? { contractSha256: a.contractSha256 } : {}) }));
        const r = await broker.call("station", "propose", {
            taskId,
            artifacts,
            manifestSha256: proposedManifestSha256,
            claims: { requiredOutputs: task.objective.required_outputs.map((o) => o.name), summary: progress.done.summary, plan: progress.plan, sandbox: progress.sandbox },
        });
        if (r.ok) {
            const p = r.output as { proposalId: string; status: string };
            proposalId = p.proposalId;
            manifest.proposal = { proposalId: p.proposalId, status: p.status };
            manifest.state = "proposed";
            log(`[factory] task ${taskId}: proposed to the station (${p.proposalId})`);
        } else {
            manifest.state = "failed";
            manifest.ended = `done, but the station did not take the proposal: ${r.error ?? r.outcome}`;
            log(`[factory] task ${taskId}: ${manifest.ended}`);
        }
    } else log(`[factory] task ${taskId}: ${manifest.ended}`);

    const saved = saveRecipes(recipesDir, topicId, agent.policy);
    manifest.recipes.experiencesAfter = saved.experiences;
    manifest.recipes.sha256 = saved.sha256;
    const finalText = manifestText(manifest);
    await writeText(broker, taskId, "manifest.json", finalText);
    return { taskId, state: manifest.state, phase: progress.phase, steps: progress.iteration, proposalId, manifest, manifestSha256: sha256Text(finalText), proposedManifestSha256 };
}
