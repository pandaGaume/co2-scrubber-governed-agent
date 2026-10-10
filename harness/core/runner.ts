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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { DecisionTrace, Intention, JsonValue, StageEvent } from "@spiky-panda/harness";
import { errorMessage, sha256File } from "../../lib/files.js";
import { forkDir, forkId, fromRoot } from "../../lib/paths.js";
import { contextCommits } from "../../lib/fork.js";
import { WORKSHOP_ROOT } from "../../slots/tools/lib/workshop.js";
import type { Broker } from "../lib/broker.js";
import type { Provider, ProviderExchange } from "../lib/provider.js";
import { createAgent } from "./agent.js";
import { createBuilderGuard } from "./builder-guard.js";
import { buildCapabilities, type CapabilityCall } from "./capabilities.js";
import { manifestText, newTelemetry, sha256Text, statementOf, statementSha, summarize, toolsOf, type Manifest, type ManifestArtifact, type ManifestStep } from "./manifest.js";
import { compactOutput } from "./compact.js";
import { reasoningStateOf } from "./reasoning-state.js";
import { intentionFor, loadRecipes, saveRecipes, taskSignature } from "./recipes.js";
import { NEVER_REPLAYED, proposalKey, restrictReplays } from "./replay.js";
import { helpForRefusal, noteSources } from "./justify.js";
import { claimLine, claimsJson, current } from "./claims.js";
import { STAGE_SUPPORT } from "./base.js";
import { noteRefusal, STUCK_AFTER } from "./problems.js";
import { readMeaning, unmoved } from "./interpreter.js";
import { dependentsOf } from "./rules.js";
import { runLog, type StepEntry } from "../lib/run-log.js";
import { cutAtOutputLimit, truncatedRefusal } from "../lib/llm-common.js";
import { episodeOf, type Episode, type StepLike } from "./episodes.js";
import { workingMemory } from "../../lib/working-memory.js";
import { entryView, episodeView, memoryConfig, readMemory, relevantTo } from "../../lib/memory.js";
import { READ_CAPABILITIES } from "./replay.js";
import { createTaskEvaluator } from "./task-evaluator.js";
import { taskCapabilities } from "./task-capabilities.js";
import { DEFAULT_BUDGET, topicFor, type TaskFile, type TaskState, type Topic } from "./task.js";
import type { TopicDefinition } from "./topic.js";
import { createWorkspaceObserver, isArtifact, listWorkshop, newProgress, type Progress } from "./workspace-observer.js";
import { type ContractReport, type LibraryFact } from "./contracts.js";
import { applyVerdict, scopeOf, supervisionOfRequest, type SupervisionInput, type Verdict, reviewDigest } from "../supervisor/supervisor.js";
import { ONNX_TOPIC } from "../topics/onnx/index.js";
import { PLAYBOOK_TOPIC } from "../topics/playbook/index.js";
import { REFLECTION_TOPIC } from "../topics/reflection/index.js";
import { OBSERVER_TOPIC } from "../topics/observer/index.js";
import { RECOMMENDATION_TOPIC } from "../topics/recommendation/index.js";
import { DIAGNOSIS_TOPIC } from "../topics/diagnosis/index.js";
import { PROCEDURE_TOPIC } from "../topics/procedure/index.js";
import { GRAPH_TOPIC } from "../topics/graph/index.js";
import { CODE_TOPIC } from "../topics/code/index.js";
import { APP } from "./application.js";
import { physics } from "./physics.js";

/** The topics the constructor knows: the factories that share this loop, each with its own harness. */
export const TOPIC_DEFINITIONS: Partial<Record<Topic, TopicDefinition>> = { onnx: ONNX_TOPIC, procedure: PROCEDURE_TOPIC, graph: GRAPH_TOPIC, code: CODE_TOPIC, playbook: PLAYBOOK_TOPIC, reflection: REFLECTION_TOPIC, recommendation: RECOMMENDATION_TOPIC, diagnosis: DIAGNOSIS_TOPIC, observer: OBSERVER_TOPIC };

/** What a provider built for one task receives: the task, and the last call of the loop (what a model reads in `lastOutput`). */
export interface BuilderContext {
    taskId: string;
    task: TaskFile["task"];
    topic: Topic;
    lastCall: () => CapabilityCall | null;
    /** What the task last read by a capability, whoever decided the step (the builder, or a replay from the recipes). */
    read?: (capabilityId: string) => JsonValue | null;
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
    /**
     * The Contract Supervisor (2026-09-25, night), asked once at the start on the task's facts and the deterministic
     * report; its verdict is applied to the report the state carries (`invariants.contracts`), so a topic's requirement
     * (`sourcesConsistent`) reads both. Nothing when absent: the deterministic report stands alone.
     */
    supervisor?: (input: SupervisionInput) => Promise<Verdict | null>;
    log?: (line: string) => void;
}

/**
 * Is what a refusal left unjustified settled by this step: a call that carries the constants passed, whichever of them (2026-10-10,
 * run pzeq: a procedure.submit refused for its justifications, corrected by an accepted procedure.revise; the brief still opened on
 * "your last procedure.submit was refused for its justifications", and Nano went on justifying instead of handing over).
 */
export function justifySettled(pending: { capability: string } | null | undefined, capabilityId: string, ok: boolean, justified?: { capability: RegExp }): boolean {
    return Boolean(ok && pending && (pending.capability === capabilityId || justified?.capability.test(capabilityId)));
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

const kindOf = (p: string): ManifestArtifact["kind"] => (p.endsWith(".onnx") ? "model" : p.endsWith(".spikypanda") ? "graph" : p.endsWith("contract.json") ? "contract" : /^procedures\/.*\.json$/.test(p) ? "procedure" : /^playbooks\/.*\.json$/.test(p) ? "playbook" : /^adaptations\/.*\.json$/.test(p) ? "adaptation" : /^recommendations\/.*\.json$/.test(p) ? "recommendation" : /^diagnoses\/.*\.json$/.test(p) ? "diagnosis" : /^requests\/.*\.json$/.test(p) ? "request" : /^forge\/[^/]+\/artifact\.json$/.test(p) ? "plugin" : "file");

async function readTask(broker: Broker, taskId: string): Promise<{ task: TaskFile; sha256: string }> {
    const r = await broker.call("workspace", "read", { taskId, path: "task.json" });
    if (!r.ok) throw new Error(`cannot read task ${taskId}: ${r.error ?? r.outcome}`);
    const { text, sha256 } = r.output as { text: string; sha256: string };
    const task = JSON.parse(text) as TaskFile;
    if (task.job !== "build" || !task.task?.id) throw new Error(`task ${taskId}: task.json is not a build task`);
    return { task, sha256 };
}

/** The library's shelf, read once for the state: each graph with its variables' status, so the model knows what exists without a call. */
async function shelfOf(broker: Broker): Promise<Progress["context"]["shelf"]> {
    const r = await broker.call("library", "graphs", {});
    if (!r.ok) return [];
    const graphs = ((r.output as { graphs?: unknown[] })?.graphs ?? []) as Array<Record<string, unknown>>;
    const rec = (v: unknown): Record<string, Record<string, unknown>> => (v && typeof v === "object" ? (v as Record<string, Record<string, unknown>>) : {});
    return graphs.map((g) => ({
        id: String(g.id),
        description: String(g.description ?? "").slice(0, 400),
        // The node types the graph is made of: what a plan names, without a search of the catalogue.
        types: Array.isArray(g.types) ? (g.types as unknown[]).map(String) : [],
        variables: Object.fromEntries(Object.entries(rec(g.variables)).map(([k, x]) => [k, `${String(x.status)}${x.default !== undefined ? `, default ${String(x.default)}` : ""}${x.min !== undefined ? `, ${String(x.min)} to ${String(x.max)}` : ""}${x.unit ? ` ${String(x.unit)}` : ""}`])),
        settings: Object.entries(rec(g.settings)).map(([k, x]) => `${k}: default ${String(x.default)}${x.module ? ` (${String(x.module)})` : ""}`),
        probes: (Array.isArray(g.probes) ? (g.probes as Array<Record<string, unknown>>) : []).filter((p) => p.column).map((p) => `${String(p.node)}.${String(p.property)} against ${String(p.column)}`),
    }));
}

/** The facts of the task against one another (the request's, the register's, the library's), reviewed once at the start: a conflict is visible before any plan; the supervisor's verdict on top when one is given. */
async function contractsOf(broker: Broker, task: TaskFile["task"], supervisor: RunTaskOptions["supervisor"], log: (line: string) => void): Promise<ContractReport> {
    const r = await broker.call("library", "facts", {});
    const libraryFacts = r.ok ? ((r.output as { facts?: Array<LibraryFact & { source: string }> }).facts ?? []) : [];
    const req = (task.requirements ?? {}) as { assumptions?: string[]; hypotheses?: Array<string | { statement?: string }>; known?: Array<{ symbol?: string; factId?: string }> };
    const input = supervisionOfRequest(req, Array.isArray((task.observations as { devices?: unknown[] } | undefined)?.devices) ? ((task.observations as { devices: unknown[] }).devices) : [], libraryFacts);
    // A request the supervisor already reviewed upstream, unchanged since (its digest matches): the deterministic report stands, the model does not review the same facts again.
    const upstream = (task.requirements as { reviewed?: { by?: string; digest?: string; at?: string } } | undefined)?.reviewed;
    if (supervisor && upstream?.by === "supervisor" && upstream.digest && upstream.digest === reviewDigest(req as never)) {
        log(`[factory] supervisor: the request was reviewed upstream (${upstream.at ?? "?"}), unchanged since; the deterministic report stands`);
        return input.report;
    }
    if (!supervisor) return input.report;
    // Nothing across producers to judge (one producer's facts, no assumption, hypothesis, symbol or fitted variable): the rules have
    // compared what can be compared, and a model would only restate them; it is not asked, and the log says on what the report stands.
    const scope = scopeOf(input);
    if (!scope.acrossProducers) {
        log(`[factory] supervisor not asked: nothing across producers to judge (${scope.text}); the deterministic report stands`);
        return input.report;
    }
    try {
        const verdict = await supervisor(input);
        if (!verdict) return input.report;
        log(`[factory] supervisor: ${verdict.status}${verdict.findings.length ? ` (${verdict.findings.map((f) => `${f.fact}: ${f.producer} to ${f.required_action.toLowerCase()}`).join("; ")})` : ""}${verdict.scope ? `, ${verdict.scope}` : ""}`);
        return applyVerdict(input.report, verdict);
    } catch (e) {
        // A supervisor that cannot answer (no model, a timeout) leaves the deterministic report alone, and says so.
        log(`[factory] supervisor not answering: ${e instanceof Error ? e.message : String(e)}; the deterministic report stands`);
        return input.report;
    }
}

/** The telemetry's shape, read once for the state: the first data file whose rows carry a minute column. */
async function telemetryShapeOf(broker: Broker, taskId: string, task: TaskFile["task"]): Promise<Progress["context"]["telemetry"]> {
    for (const d of task.data ?? []) {
        const r = await broker.call("workspace", "read", { taskId, path: d.file });
        if (!r.ok) continue;
        try {
            const rows = JSON.parse((r.output as { text: string }).text) as Array<Record<string, unknown>>;
            if (!Array.isArray(rows) || !rows.length || !rows.every((x) => x && typeof x === "object")) continue;
            const minutes = rows.map((x) => Number(x.minute)).filter(Number.isFinite);
            return { file: d.file, rows: rows.length, columns: [...new Set(rows.flatMap((x) => Object.keys(x)))], minutes: minutes.length ? Math.max(...minutes) : null };
        } catch {
            // not a table
        }
    }
    return null;
}

async function writeText(broker: Broker, taskId: string, file: string, text: string): Promise<string> {
    const r = await broker.call("workspace", "write", { taskId, path: file, text });
    if (!r.ok) throw new Error(`cannot write ${file} in task ${taskId}: ${r.error ?? r.outcome}`);
    return (r.output as { sha256: string }).sha256;
}

/**
 * What a model reads, kept once by its sha256 (2026-09-30, the harness's graph): each tool as given (its description and its input
 * schema), the topic's words, the prompt, under `<workshop>/_statements/<sha256>.json`; the manifest names them. Two tasks that read
 * different texts differ by a sha256, and the text that changed is there to be read: a regression is found by its cause.
 */
function keepStatements(catalogue: import("./capabilities.js").CatalogueEntry[], topic: TopicDefinition, promptPath: string | null): Pick<Manifest, "words" | "context"> {
    const store = path.join(WORKSHOP_ROOT, "_statements");
    const keep = (sha: string, value: unknown): void => {
        const file = path.join(store, `${sha}.json`);
        if (existsSync(file)) return;
        try {
            mkdirSync(store, { recursive: true });
            writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
        } catch {
            // a store that cannot be written loses the text, never the task
        }
    };
    for (const c of catalogue) keep(statementSha(c), { kind: "tool", ...statementOf(c) });
    let words: Manifest["words"] = null;
    const wordsFile = topic.words?.words.file;
    if (wordsFile && existsSync(fromRoot(...wordsFile.split("/")))) {
        const text = readFileSync(fromRoot(...wordsFile.split("/")), "utf8");
        words = { file: wordsFile, sha256: sha256Text(text) };
        keep(words.sha256, { kind: "words", file: wordsFile, text });
    }
    if (promptPath && existsSync(promptPath)) {
        const text = readFileSync(promptPath, "utf8");
        keep(sha256Text(text), { kind: "prompt", file: path.relative(fromRoot(), promptPath).split(path.sep).join("/"), text });
    }
    return { words, context: contextCommits(forkId() ? forkDir() : null) };
}

export async function runTask({ broker, provider: providerOrBuild, taskId, topic: topicName, supervisor, recipesDir = path.join(WORKSHOP_ROOT, "_recipes"), runtimeSlot = "twin", promptFile = null, timeoutMs = 60000, onStage, onProgress, log = () => undefined }: RunTaskOptions): Promise<RunTaskResult> {
    const startedAt = new Date();
    const { task: file, sha256: taskSha256 } = await readTask(broker, taskId);
    const task = file.task;
    const topicId: Topic = topicName ?? topicFor(task);
    const topic = TOPIC_DEFINITIONS[topicId];
    if (!topic) throw new Error(`topic ${topicId} is not built yet (${Object.keys(TOPIC_DEFINITIONS).join(", ")})`);
    const budget = { ...DEFAULT_BUDGET, ...(task.budget ?? {}) };
    const signature = taskSignature(task, topicId);
    const generic: Intention = intentionFor(task, signature);
    const intention: Intention = topic.intention ? topic.intention(task, generic) : generic;
    const recipes = loadRecipes(recipesDir, topicId);
    // What a replay may be, the same for every factory (replay.ts): not a call already made in this task, not a question or a failure, not what is made of this task's readings.
    const made = new Set<string>();
    restrictReplays(recipes.policy, [...NEVER_REPLAYED, ...(topic.neverReplayed ?? [])], made, (id) => offered(id));
    const progress = newProgress();
    // What the request cites is citable from the first step (2026-10-10, run 20): the facts and documents its known constants name, read
    // upstream by the Observer and carried in the task. The graph factory cited them, and was refused "not read in this task" four times.
    for (const k of (((task.requirements ?? {}) as { known?: Array<{ factId?: unknown; source?: unknown }> }).known ?? []))
        for (const id of [k?.factId, k?.source]) if (typeof id === "string" && id && !progress.sources.library.includes(id)) progress.sources.library.push(id);
    const calls: CapabilityCall[] = [];
    const provider = typeof providerOrBuild === "function" ? providerOrBuild({ taskId, task, topic: topicId, lastCall: () => progress.lastCall, read: (id) => progress.reads[id]?.value ?? null }) : providerOrBuild;
    const profileFile = fromRoot(file.profile ?? "");
    const promptPath = promptFile ? fromRoot(promptFile) : null;

    // What the state carries so the model need not read it: the shelf and the telemetry's shape.
    progress.context = { shelf: await shelfOf(broker), telemetry: await telemetryShapeOf(broker, taskId, task), contracts: await contractsOf(broker, task, supervisor, log) };
    const contextMode: "conversation" | "state" = (provider as { contextMode?: unknown }).contextMode === "state" ? "state" : "conversation";
    // The proposals in a row: the same capability with the same input twice is counted (`progress.repeats`), whether it ran or was refused.
    let previousProposal = "";
    const noteProposal = (capabilityId: string | null, input: unknown): void => {
        const key = `${capabilityId ?? ""}:${JSON.stringify(input ?? null)}`;
        progress.repeats = key === previousProposal ? progress.repeats + 1 : 0;
        previousProposal = key;
    };
    // The validator's verdicts at task.done in a row: the same verdict twice is a repeat whatever the summary's wording (2026-09-27: twenty-one task.done reworded against one verdict the model never saw).
    let previousVerdict = "";
    let verdictRepeats = 0;
    // The refused proposals over the whole task, by capability and input: the same one four times with reads in between is as stuck as four in a row (the eleventh page run: task.plan refused six times on one mapping, a library read between each).
    const refusedCounts = new Map<string, number>();
    /** Steps that were calls of a batch, handed without asking the model (call-batch.ts): outside the decisions budget. */
    let handedSteps = 0;
    /** The points whose meaning was already read once: a misreading is not repeated. */
    const meantKeys = new Set<string>();
    const telemetry = newTelemetry(contextMode);
    const EVIDENCE_CAP = 10;
    // A long answer goes whole to the workshop and the model reads its summary and its handle; written right after the step.
    let pendingArtifact: { path: string; text: string } | null = null;
    // The stage's tools (TopicDefinition.closed): computed once per step, the conduct read on the progress as it stands.
    let closedAt = "";
    let closedNow = new Set<string>();
    const closed = (): Set<string> => {
        const key = `${progress.iteration}|${progress.phase}`;
        if (key !== closedAt) {
            closedAt = key;
            closedNow = new Set(topic.closed?.(progress, task) ?? []);
        }
        return closedNow;
    };
    // The stage's tools (TopicDefinition.stageTools): its own, the support every stage has, minus what a gate closes; a way out its own alone.
    let stageAt = "";
    let stageNow: Set<string> | null = null;
    let stageInfo: { tools: string[]; shows?: string[]; exit: boolean } | null = null;
    const stage = (): Set<string> | null => {
        if (!topic.stageTools) return null;
        const key = `${progress.iteration}|${progress.phase}`;
        if (key !== stageAt) {
            stageAt = key;
            const s = topic.stageTools(progress, task);
            stageInfo = s;
            const shut = closed();
            // Of the stages passed, their reads only: who is on board read again at the procedure stage (run 8, the scripted builder), never an action of before.
            const reads = (s.passed ?? []).filter((id) => READ_CAPABILITIES.some((r) => r.test(id)));
            stageNow = new Set([...s.tools, ...(s.exit ? [] : [...reads, ...STAGE_SUPPORT])].filter((id) => !shut.has(id)));
        }
        return stageNow;
    };
    // What the state of a step shows (reasoning-state.ts): the stage's sections, the answers of its own tools and the support, the claims as they stand.
    const projectionOf = (): { shows?: string[] | null; evidenceOf?: (id: string) => boolean; claims?: string[] } => {
        const claims = current(progress.claims).map(claimLine);
        if (!stage() || !stageInfo) return { claims };
        const info = stageInfo;
        const own = new Set([...info.tools, ...STAGE_SUPPORT]);
        return { shows: info.shows ?? null, evidenceOf: (id) => own.has(id), claims };
    };
    const offered = (id: string): boolean => {
        const s = stage();
        return s ? s.has(id) : !closed().has(id);
    };
    const capabilities = await buildCapabilities(broker, {
        available: (id) => offered(id),
        profile: {
            included: topic.tools,
            // A document's name is filed under the task once: a builder that gives back the name a build answered (already under the task) is not prefixed again (the sixth passage lost ten steps on t/t/t/name).
            bindings: [
                { match: /^(workspace|model)\.|^forge\.plugin_(write|build|test|load|promote)$/, constants: { taskId } },
                { match: new RegExp(`^${runtimeSlot}\\.(document_build|document_instantiate|session_run)$`), rewrite: (input) => (typeof input.name === "string" && !input.name.startsWith(`${taskId}/`) ? { ...input, name: `${taskId}/${input.name}` } : input) },
                ...(topic.bindings ?? []),
            ],
            local: [...taskCapabilities(broker, taskId, progress, topicId, task), ...(topic.local?.({ broker, taskId, task, progress, runtimeSlot }) ?? [])],
        },
        onCall: (call) => {
            progress.lastCall = call;
            calls.push(call);
            if (call.result.ok) progress.reads[call.id] = { at: new Date().toISOString(), value: (call.result.output ?? null) as JsonValue };
            // A document read whole: kept in the task's memory of documents, shown in the state beyond the evidence's last ten answers.
            if (call.result.ok && call.id === "library.read") {
                const o = (call.result.output ?? {}) as { id?: unknown; title?: unknown; text?: unknown };
                if (typeof o.id === "string" && typeof o.text === "string" && !progress.documents.some((d) => d.id === o.id)) progress.documents.push({ id: o.id, title: typeof o.title === "string" ? o.title : o.id, text: o.text, step: progress.iteration });
            }
            // What a justification may cite, noted on every call, replays included.
            noteSources(progress.sources, call);
            const whole = call.result.ok ? (call.result.output ?? null) : { error: call.result.error ?? null, outcome: call.result.outcome };
            const compact = compactOutput(call.id, call.input, whole);
            progress.lastSummary = compact.summary;
            // What was read stays in the state as evidence (a read is not repeated for what the state holds); the topic's own results (an evaluation) live in its part of the state.
            if (call.result.ok && !/^(task|graph)\./.test(call.id)) {
                const arg = call.input && typeof call.input === "object" && !Array.isArray(call.input) ? (call.input as Record<string, unknown>) : {};
                // Named by its id, path, type, quantity or query; otherwise by its arguments' plain values (2026-10-01, E5.4: two reads of
                // a diagnosis, a step of one task then of another, filed under one key, each erased the other, and the model read them again).
                const scalars = Object.values(arg).filter((v) => ["string", "number", "boolean"].includes(typeof v)).map(String).join(" ").slice(0, 200);
                const named = (["id", "path", "type", "quantity", "query"].map((k) => arg[k]).find((v) => typeof v === "string") as string | undefined) ?? (scalars || undefined);
                const key = named ? `${call.id} ${named}` : call.id;
                delete progress.evidence[key];
                progress.evidence[key] = { at: new Date().toISOString(), summary: compact.summary };
                const keys = Object.keys(progress.evidence);
                for (const old of keys.slice(0, Math.max(0, keys.length - EVIDENCE_CAP))) delete progress.evidence[old];
            }
            telemetry.toolResultBytes += compact.bytes;
            telemetry.compactedContextBytes += JSON.stringify(compact.summary)?.length ?? 0;
            if (compact.reduced) {
                const file = `results/step-${String(calls.length).padStart(3, "0")}-${call.id.replace(/[^a-z0-9]+/gi, "-")}.json`;
                progress.lastArtifact = file;
                pendingArtifact = { path: file, text: JSON.stringify(whole, null, 2) + "\n" };
            } else progress.lastArtifact = null;
        },
    });
    // The memory this task reads (2026-09-29, the memory audit, lib/memory.ts): the domain's learned entries and the working memory's
    // episodes of the previous tasks, read once at the start (they change between tasks, when the station decides); this task's own
    // episode rebuilt at every step from its steps, so a refusal then an accepted retry is seen as such. Shown only at the stage whose
    // brief calls what they concern.
    const memorySettings = memoryConfig();
    const reading = topic.judges ? { judges: topic.judges, digest: topic.digest } : null;
    const previousEpisodes = reading && memorySettings.workingMemory.previousTasks ? workingMemory(WORKSHOP_ROOT, topicId, reading, memorySettings.workingMemory.size).filter((e) => e.taskId !== taskId && e.attempts.length) : [];
    const learnedEntries = reading && memorySettings.longTerm.read ? readMemory(WORKSHOP_ROOT, topicId, memorySettings).entries : [];
    const intent = `${topicId}: ${task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join(", ")}`;
    const memoryNow = (): JsonValue | null => {
        if (!reading) return null;
        const stage = topic.brief?.(progress, task) ?? "";
        const current = episodeOf({ taskId, topic: topicId, startedAt: startedAt.toISOString(), intent, steps: manifest.steps as StepLike[] }, reading.judges, reading.digest);
        const calls = (e: Episode) => e.attempts.map((a) => a.capability);
        const episodes = [...previousEpisodes.filter((e) => relevantTo(stage, calls(e))).slice(-memorySettings.workingMemory.shown).map((e) => episodeView(e)), ...(current.attempts.length && relevantTo(stage, calls(current)) ? [episodeView(current, true)] : [])];
        const learned = learnedEntries.filter((e) => relevantTo(stage, e.appliesTo)).map(entryView);
        return learned.length || episodes.length ? ({ ...(learned.length ? { learned } : {}), ...(episodes.length ? { episodes } : {}) } as JsonValue) : null;
    };
    const stageStarts = new Map<string, number>();
    const stageMs = new Map<string, number>();
    /** The test's log entry of one step (run-log.ts): each node with what it got and gave, from the trace, the exchange and the refusal. */
    const logStep = (n: number, decisionId: string | null, trace: DecisionTrace | null, exchange: ProviderExchange | null, refused: string | null, extra: StepEntry["nodes"] = []): void => {
        const log = runLog();
        if (!log) return;
        const ms = (stage: string) => (decisionId ? stageMs.get(`${decisionId}:${stage}`) : undefined);
        const state = trace?.stateBefore;
        const nodes: StepEntry["nodes"] = [
            { node: "observe", output: state ? { id: state.id, features: state.features } : "(not reached the trace: see the refusal)", ms: ms("observe") },
            { node: "context / lookup / gate", output: trace ? { source: trace.source, ...(trace.candidateScore !== undefined ? { candidateScore: trace.candidateScore, candidateConfidence: trace.candidateConfidence } : {}) } : exchange ? { source: exchange.response === null ? (exchange.batch ? "a call of the model's last answer (batch)" : "the harness's reading, not the model") : "fallback: the model was asked" } : undefined, ms: ms("gate") },
            {
                node: "reason",
                input: exchange ? (exchange.response === null ? "no model call at this step" : "the language model call written just above") : undefined,
                output: exchange ? { proposed: exchange.proposedCapabilityId, input: exchange.proposedInput, tokens: exchange.tokens, ...(exchange.batch ? { batch: exchange.batch } : {}) } : trace ? { decision: trace.decision } : undefined,
                ms: ms("reason"),
            },
            ...(exchange?.reading ? [{ node: "interpret", input: exchange.reading.sent, output: { how: exchange.reading.how, read: exchange.reading.read, changes: exchange.reading.changes, model: exchange.reading.model ?? null } }] : []),
            { node: "guard", input: trace ? trace.decision.invocation : exchange ? { capability: exchange.proposedCapabilityId, input: exchange.proposedInput } : undefined, output: refused ? `refused: ${refused}` : trace ? "accepted" : undefined, ms: ms("guard") },
            ...extra,
        ];
        if (trace) {
            nodes.push(
                { node: "execute", input: trace.decision.invocation, output: trace.result, ms: ms("execute") },
                { node: "observe-after", output: { id: trace.stateAfter.id }, ms: ms("observe-after") },
                { node: "evaluate", output: trace.evaluation, ms: ms("evaluate") },
                { node: "record", output: `kept in the memory under ${trace.stateBefore.id}`, ms: ms("record") },
            );
        }
        log.step({ task: taskId, topic: topicId, n, nodes, outcome: refused ? `${exchange?.proposedCapabilityId ?? "?"} refused` : trace ? `${trace.decision.invocation.capabilityId} ${String((trace.result.output as { outcome?: string } | undefined)?.outcome ?? (trace.result.ok ? "completed" : "error"))}` : "no proposal" });
    };

    const agent = createAgent({
        broker,
        provider,
        capabilities,
        observer: createWorkspaceObserver(
            broker,
            taskId,
            progress,
            () => topic.brief?.(progress, task) ?? "",
            () => reasoningStateOf({ task, progress, budget, nextActions: capabilities.catalogue.map((c) => c.id).filter((id) => offered(id)), ...projectionOf(), shelf: topic.shelf === false ? [] : progress.context.shelf, telemetry: progress.context.telemetry, contracts: progress.context.contracts, runsSpent: topic.runsSpent?.(progress), shown: topic.observation ? [topic.observation] : [], topic: topic.state?.(progress, task), memory: memoryNow(), marchingOrder: topic.marchingOrder?.(progress, task) }),
            () => topic.key?.(progress) ?? "",
            contextMode,
            // One call per answer where the stage's work is an action, not a read (its own tools hold one that is neither a read nor the task's).
            () => {
                stage();
                return Boolean(stageInfo && stageInfo.tools.some((id) => !id.startsWith("task.") && !READ_CAPABILITIES.some((r) => r.test(id))));
            },
        ),
        evaluator: createTaskEvaluator({ broker, taskId, task, topic, progress }),
        guard: createBuilderGuard({ broker, task, topic, runtimeSlot, taskId, progress }),
        policy: recipes.policy,
        // A decision waits at least as long as the model is given, and a margin for the slot (2026-10-09: Nano answered in 60.3 s,
        // its profile gives 120 s, the step's 60 s cut it first, "Decision timeout").
        timeoutMs: Math.max(timeoutMs, Number(provider.settings?.timeoutMs ?? 0) + 30000),
        // Each node's time, for the test's log (run-log.ts); the caller's own listener still gets every event.
        onStage: (event: StageEvent) => {
            if (event.status === "start") stageStarts.set(`${event.decisionId}:${event.stage}`, Date.now());
            else {
                const t = stageStarts.get(`${event.decisionId}:${event.stage}`);
                if (t !== undefined) stageMs.set(`${event.decisionId}:${event.stage}`, Date.now() - t);
            }
            onStage?.(event);
        },
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
        // How the model ran (2026-10-01, E5.0): its output limit and the rest, and the profile they come from; none for a script.
        provider: { name: provider.name, model: provider.model, family: provider.family, ...(provider.settings ? { settings: provider.settings } : {}), ...(provider.profile ? { profile: provider.profile } : {}) },
        tools: toolsOf(capabilities.catalogue),
        ...keepStatements(capabilities.catalogue, topic, promptPath),
        recipes: { file: relativeOrAbsolute(recipes.file), loaded: recipes.loaded, experiencesBefore: recipes.experiences, experiencesAfter: null, replayedSteps: 0, sha256: null },
        budget: { iterations: budget.iterations, minutes: budget.minutes },
        steps: [],
        artifacts: [],
        ...(forkId() ? { fork: forkId()! } : {}),
        sandbox: null,
        proposal: null,
        verdict: null,
        ended: null,
        telemetry,
    };
    await writeText(broker, taskId, "manifest.json", manifestText(manifest));
    onProgress?.(manifest);
    log(`[factory] task ${taskId}: topic ${topicId}, signature ${signature.id}, ${capabilities.catalogue.length} tools, recipes ${recipes.loaded ? `${recipes.experiences} experiences` : "none"}`);
    runLog()?.taskStarted(taskId);
    runLog()?.section(`Task ${taskId} (${topicId}) starts`, { model: provider.model, provider: provider.name, settings: provider.settings ?? null, contextMode, budget, tools: capabilities.catalogue.map((c) => c.id), request: task });

    const lines: TraceLine[] = [];
    const attached = new Set<string | undefined>();
    provider.begin?.(intention.id);
    let ended: string | null = null;
    let reported = 0;
    // A SOURCE_CONFLICT among the task's facts ends the task before any step (2026-09-25, night): the producer named revises upstream; a
    // model asked to plan over it read the task file thirty times instead of failing. Visible, cheap, and the reference graph hides nothing.
    const contracts = progress.context.contracts;
    if (contracts && contracts.status === "CONFLICT" && (contracts.conflicts.length || contracts.findings?.length)) {
        // The rules' conflicts, or the supervisor's findings when the rules saw none: either way the task ends here and names who revises.
        const reasons = [...contracts.conflicts.map((x) => x.reason), ...(contracts.findings ?? []).map((f) => `${f.fact}: ${f.reason}`)];
        const revisers = [...new Set([...contracts.conflicts.map((x) => x.revise), ...(contracts.findings ?? []).map((f) => f.producer)])];
        const first = contracts.conflicts[0]?.id ?? contracts.findings?.[0]?.fact;
        ended = `SOURCE_CONFLICT: ${reasons.join(" | ")}; REQUIRE_RESOLUTION: ${revisers.join(", ")} to revise, upstream of this task${first ? ` (first fact ${first})` : ""}`;
        progress.failure = ended;
        progress.phase = "failed";
        log(`[factory] task ${taskId}: ${ended}`);
    }
    // A required output in a quantity the units service does not know can be neither produced nor declared missing (a contract is written in known quantities):
    // the task ends before its first step and names who revises (2026-09-28: thirty steps spent mapping and declaring "CO2 removal rate" in ppm/min).
    // A topic that writes a document (a playbook) names its outputs, it does not measure them: no quantity to know.
    if (!ended && topic.quantities !== false) {
        const unknown = task.objective.required_outputs.filter((o) => !physics().canonicalQuantity(o.quantity));
        if (unknown.length) {
            ended = `UNBUILDABLE_OUTPUT: ${unknown.map((o) => `"${o.name}" is a ${o.quantity}${o.unit ? ` in ${o.unit}` : ""}, a quantity the units service does not know: no node can produce it and no contract can be written in it`).join(" | ")}; REQUIRE_RESOLUTION: observer to revise, upstream of this task`;
            progress.failure = ended;
            progress.phase = "failed";
            log(`[factory] task ${taskId}: ${ended}`);
        }
    }
    while (progress.phase !== "done" && progress.phase !== "failed" && progress.phase !== "waiting") {
        // The step just recorded, said before the next one starts (every branch below ends in `continue`).
        if (manifest.steps.length > reported) onProgress?.(manifest);
        reported = manifest.steps.length;
        // A plan that declares a capability for another factory ends this task here (2026-09-26): the hand-off opens that factory's task on the
        // contract and replays this request once the node exists; a model asked to go on called task.done twelve times instead of failing.
        // A builder that proposes the same refused call four times in a row is stuck (2026-09-26: twenty-three identical registry_search): the task ends with the reason, the budget is not spent on it.
        // Whatever refused it: the guard, or the validator at task.done (twenty-three identical task.done on the replay of the seventh page run).
        const stuckOn = progress.repeats >= 3 ? (progress.lastRefusal ?? (progress.lastCall && !progress.lastCall.result.ok ? { capability: progress.lastCall.id, reason: String(progress.lastCall.result.error ?? progress.lastCall.result.outcome) } : progress.lastCall && progress.lastCall.id === "task.done" ? { capability: "task.done", reason: String((progress.lastSummary as { problems?: unknown } | null)?.problems ?? JSON.stringify(progress.lastSummary ?? "")) } : null)) : null;
        if (stuckOn) {
            ended = `STUCK: ${stuckOn.capability} proposed ${progress.repeats + 1} times with the same input, refused each time: ${stuckOn.reason.slice(0, 300)}`;
            progress.failure = ended;
            progress.phase = "failed";
            log(`[factory] task ${taskId}: ${ended}`);
            break;
        }
        const foreign = (progress.plan?.missing_capabilities ?? []).filter((m) => m.topic !== topicId);
        if (foreign.length) {
            ended = `MISSING_CAPABILITY: ${foreign.map((m) => `"${m.required_output}" for the ${m.topic} factory`).join(", ")}; this task ends here, the hand-off opens that factory's task on the contract and replays this request once the node exists`;
            progress.failure = ended;
            progress.phase = "failed";
            log(`[factory] task ${taskId}: ${ended}`);
            break;
        }
        const n = progress.iteration + 1;
        const minutes = (Date.now() - startedAt.getTime()) / 60000;
        // The budget counts the model's decisions: a call of a batch handed without asking it (call-batch.ts) costs no turn; all the
        // calls together stay bounded, at four per decision of the budget.
        if (progress.iteration - handedSteps >= budget.iterations) {
            ended = `iteration budget spent (${budget.iterations})`;
            break;
        }
        if (progress.iteration >= budget.iterations * 4) {
            ended = `call budget spent (${budget.iterations * 4} calls, ${progress.iteration - handedSteps} decisions)`;
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
        if (exchange?.batch || (exchange?.reading?.how === "meant" && exchange.response === null)) handedSteps++;
        // The whole answer of a long call, written now so the model can read it at the next step by its handle.
        if (pendingArtifact) {
            const artifact: { path: string; text: string } = pendingArtifact;
            pendingArtifact = null;
            try {
                await writeText(broker, taskId, artifact.path, artifact.text);
            } catch (e) {
                log(`[factory] step ${n}: could not keep ${artifact.path}: ${errorMessage(e)}`);
                progress.lastArtifact = null;
            }
        }
        // Where the tokens went: the model's usage, cache included, and the characters of each part of the context.
        if (exchange) {
            // A call of a batch was handed without asking the model (call-batch.ts): no model call, no tokens.
            if (exchange.response !== null) telemetry.modelCalls++;
            const usage = ((exchange.response as { usage?: Record<string, number> } | null)?.usage ?? {}) as Record<string, number>;
            telemetry.modelInputTokens += usage.input_tokens ?? usage.prompt_tokens ?? 0;
            telemetry.modelOutputTokens += usage.output_tokens ?? usage.completion_tokens ?? 0;
            telemetry.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
            telemetry.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
            for (const [k, v] of Object.entries(exchange.context ?? {})) if (typeof v === "number") telemetry.contextCharsByCategory[k] = (telemetry.contextCharsByCategory[k] ?? 0) + v;
            if (typeof exchange.context?.mode === "string") telemetry.contextMode = exchange.context.mode;
        }
        const call = calls.at(-1)?.decisionId === trace?.decisionId ? (calls.at(-1) ?? null) : null;
        progress.iteration = n;
        if (trace) {
            // A refused call that acts stays in the state, its points with it, while the model reads (2026-10-10, run xykl: ten
            // library.justify reads after a refused procedure.revise erased it, and the next revise was written blind); a call that
            // acts, executed, ends it, as it ends the streak below. A refused read is forgotten at the next step that runs.
            const isRead = (id: string): boolean => READ_CAPABILITIES.some((r) => r.test(id));
            if (!(progress.lastRefusal && !isRead(progress.lastRefusal.capability) && isRead(trace.decision.invocation.capabilityId))) progress.lastRefusal = null;
            if (trace.result.ok) delete progress.refusals[trace.decision.invocation.capabilityId];
            if (justifySettled(progress.justify, trace.decision.invocation.capabilityId, trace.result.ok, topic.justified)) progress.justify = null;
            progress.pendingProblems = null;
            // A call that acts, executed, ends a streak of refusals; a read between two refusals does not (reading is how a builder looks for what is expected).
            if (!READ_CAPABILITIES.some((r) => r.test(trace.decision.invocation.capabilityId))) progress.refusal = null;
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
                ...(exchange?.batch ? { batch: exchange.batch } : {}),
                ...(exchange?.reading ? { reading: { how: exchange.reading.how, changes: exchange.reading.changes, model: exchange.reading.model ?? null } } : {}),
                // A submission that ran went through the topic's guard: it accepted it.
                ...(topic.judges?.some((r) => r.test(trace.decision.invocation.capabilityId)) ? { judged: "accepted" as const } : {}),
            });
            progress.guardRefused = null;
            if (trace.source === "policy") manifest.recipes.replayedSteps++;
            noteProposal(trace.decision.invocation.capabilityId, trace.decision.invocation.input);
            made.add(proposalKey(trace.decision.invocation.capabilityId, trace.decision.invocation.input));
            // A task.done the validator did not hold is a refusal the model reads at the next step (the call itself completed: the claim was recorded), and the same verdict again counts as a repeat.
            if (trace.decision.invocation.capabilityId === "task.done" && trace.result.ok && !trace.evaluation.success) {
                const reason = trace.evaluation.reason ?? "contract not held";
                progress.lastRefusal = { capability: "task.done", reason, input: trace.decision.invocation.input as JsonValue };
                verdictRepeats = reason === previousVerdict ? verdictRepeats + 1 : 0;
                previousVerdict = reason;
                progress.repeats = Math.max(progress.repeats, verdictRepeats);
            } else {
                previousVerdict = "";
                verdictRepeats = 0;
            }
            lines.push({ n, decisionId: trace.decisionId, source: trace.source, trace, failed: null, exchange, call, ms });
            if (exchange?.reading) log(`[factory] step ${n}: ${exchange.reading.capability} read ${exchange.reading.how === "coerced" ? "by its schema" : `by ${exchange.reading.model ?? "a model"}`}: ${exchange.reading.changes.join("; ")}`);
            logStep(n, trace.decisionId, trace, exchange, null);
            log(`[factory] step ${n}: ${trace.decision.invocation.capabilityId} -> ${outcome} (${trace.evaluation.reason ?? ""})${trace.source === "policy" ? " [replayed]" : ""}${exchange?.batch ? ` [call ${exchange.batch.index} of ${exchange.batch.of} of one answer]` : ""}`);
            continue;
        }
        if (exchange) {
            // A call the output limit cut was never judged: it became a report the step's allowlist refuses; the model reads why it went nowhere, not that refusal.
            // Only when the provider judged the call cut (it made it a report): a call returned whole, then the answer cut after it, was run and
            // judged, and its refusal is the guard's (2026-10-10, run 15: three complete procedure.submit read as cut, the guard's reasons hidden, STUCK).
            const judgedCut = exchange.decision ? exchange.decision.invocation.capabilityId !== exchange.proposedCapabilityId : true;
            const truncated = cutAtOutputLimit(exchange.response) && judgedCut;
            if (truncated) failed = truncatedRefusal(exchange.proposedCapabilityId, exchange.tokens?.completion ?? null);
            // A tool the conduct closes at this stage is not in the step's list: the model reads why it is closed, the gate's words, not
            // "outside the allowlist" (2026-10-10: the Observer's request before any read went nowhere and said nothing of why).
            else if (/outside the allowlist/.test(failed ?? "") && !offered(exchange.proposedCapabilityId)) {
                const order = topic.marchingOrder?.(progress, task) as { closedNow?: Array<{ tools: string[]; why: string }> } | undefined;
                const why = (order?.closedNow ?? []).filter((c) => c.tools.includes(exchange.proposedCapabilityId) || c.tools.includes("*")).map((c) => c.why);
                const now = stage();
                // Closed by a gate: its words; not a tool of this stage: the stage's tools now (2026-10-10, the tools by stage).
                if (why.length) failed = `${exchange.proposedCapabilityId} is closed at this stage: ${why.join("; ")}`;
                else if (now) failed = `${exchange.proposedCapabilityId} is not a tool of this stage: its tools now are ${[...now].join(", ")}`;
            }
            // The harness stopped the step (the guard, the schema, a capability outside the list, a timeout): the model reads the reason at the next step.
            progress.lastRefusal = { capability: exchange.proposedCapabilityId, reason: failed ?? "refused", input: (exchange.proposedInput ?? null) as JsonValue };
            progress.refusals[exchange.proposedCapabilityId] = { reason: failed ?? "refused", input: (exchange.proposedInput ?? null) as JsonValue, at: new Date().toISOString() };
            // Every refusal, whatever refused, as problems with their points (problems.ts): the guard's own when it left them, its words read otherwise;
            // a safety constant the guard found justified by no fact the rules name says its unit and the facts to cite there.
            const streakBefore = progress.refusal ? { ...progress.refusal } : null;
            const streak = noteRefusal(progress, exchange.proposedCapabilityId, failed ?? "refused");
            // A refusal of the call that carries constants: what the guard refused as unjustified goes into the context, named as it names it, and nothing else (justify.ts, helpForRefusal).
            if (topic.justified?.capability.test(exchange.proposedCapabilityId)) {
                const whole = topic.justified.whole ? topic.justified.whole(exchange.proposedCapabilityId, (exchange.proposedInput ?? null) as JsonValue, progress) : ((exchange.proposedInput ?? null) as JsonValue);
                const help = helpForRefusal(topic.justified, whole ?? null, streak.problems);
                const times = progress.justify?.capability === exchange.proposedCapabilityId || (progress.justify && topic.justified.capability.test(progress.justify.capability)) ? (progress.justify?.times ?? 0) + 1 : 1;
                progress.justify = help ? { capability: exchange.proposedCapabilityId, times, ...help } : null;
            }
            // What depends on each point, when the topic's guard did not say (dependentsOf with no rules): a value goes with its justification.
            if (topic.justified) for (const p of streak.problems) if (p.path && !p.dependentPaths) p.dependentPaths = dependentsOf(null, p.path, p.kind);
            // The meaning (interpreter.ts, the second trigger): refused again at a path whose value did not move. The form passed, so the
            // form is not the problem: a capable model reads what the call meant, and that reading is the next step's decision, through
            // the whole loop; this refusal does not count toward STUCK; once per capability and points.
            let meant = false;
            let meaning: import("./interpreter.js").MeaningOutcome | null = null;
            const still = unmoved(streakBefore, streak);
            const stillKey = `${exchange.proposedCapabilityId}:${still.map((p) => p.path).sort().join("|")}`;
            const entry = capabilities.catalogue.find((c) => c.id === exchange.proposedCapabilityId);
            if (still.length && !truncated && !meantKeys.has(stillKey) && provider.readMeaning && provider.queue && entry?.inputSchema) {
                meantKeys.add(stillKey);
                const read = await readMeaning(
                    { capability: entry.id, description: entry.description, schema: entry.inputSchema as JsonValue, sent: (exchange.proposedInput ?? null) as JsonValue, refused: still, intent: String((exchange.decision as { rationale?: unknown } | null)?.rationale ?? "") },
                    provider.readMeaning,
                );
                meaning = read.outcome;
                if ("input" in read) {
                    provider.queue({ action: { id: entry.id, description: entry.description }, invocation: { actionId: entry.id, capabilityId: entry.id, input: read.input }, rationale: read.reading.changes.join("; ") }, read.reading);
                    meant = true;
                }
                log(`[factory] step ${n}: ${entry.id} moved nothing refused (${read.outcome.points.join(", ")}); its meaning read by ${read.outcome.model ?? "a model"}: ${read.outcome.result}${meant ? ", run at the next step" : `, ${read.outcome.detail.slice(0, 300)}`}`);
            }
            noteProposal(exchange.proposedCapabilityId, exchange.proposedInput);
            made.add(proposalKey(exchange.proposedCapabilityId, exchange.proposedInput));
            const refusedKey = `${exchange.proposedCapabilityId}:${JSON.stringify(exchange.proposedInput ?? null)}`;
            const refusedTimes = (refusedCounts.get(refusedKey) ?? 0) + 1;
            refusedCounts.set(refusedKey, refusedTimes);
            progress.repeats = Math.max(progress.repeats, refusedTimes - 1);
            // Refused by the topic's guard, or by the harness before it (the step's allowlist, a schema, a call repeated): only the first is the guard's judgement.
            const byGuard = topic.judges?.some((r) => r.test(exchange.proposedCapabilityId)) && progress.guardRefused?.capability === exchange.proposedCapabilityId && String(failed ?? "").includes(progress.guardRefused.reason);
            progress.guardRefused = null;
            manifest.steps.push({ n, decisionId: exchange.decisionId ?? null, source: "refused", capability: exchange.proposedCapabilityId, input: exchange.proposedInput, outcome: "refused", summary: failed, reward: null, reason: failed, ms, tokens: exchange.tokens, ...(byGuard ? { judged: "refused" as const } : {}), ...(truncated ? { truncated: true } : {}), ...(meaning ? { meaning } : {}) });
            lines.push({ n, decisionId: exchange.decisionId ?? null, source: "refused", trace: null, failed, exchange, call: null, ms });
            logStep(n, exchange.decisionId ?? null, null, exchange, failed ?? "refused", meaning ? [{ node: "interpret (meaning)", input: { refused: meaning.points }, output: meaning }] : []);
            log(`[factory] step ${n}: ${exchange.proposedCapabilityId} -> stopped by the harness (${failed})`);
            // The same points refused STUCK_AFTER times in a row, whatever the input changed: the task ends, naming them, rather than spend its budget (2026-09-28: nineteen refusals of one speed).
            if (streak.times >= STUCK_AFTER && !meant) {
                const points = [...new Set(streak.problems.map((p) => p.path ?? p.kind ?? "the proposal"))].join(", ");
                ended = `STUCK: ${exchange.proposedCapabilityId} refused ${streak.times} times in a row on the same point(s), ${points}: ${String(failed ?? "refused").slice(0, 400)}`;
                progress.failure = ended;
                progress.phase = "failed";
                break;
            }
            continue;
        }
        // No proposal was made: the reasoner itself failed (the endpoint, the key, the network). Repeating the call would repeat the failure.
        runLog()?.step({ task: taskId, topic: topicId, n, nodes: [{ node: "reason", output: `failed: ${failed}`, ms }], outcome: `no proposal: ${failed}` });
        manifest.steps.push({ n, decisionId: null, source: "failed", capability: null, input: null, outcome: "failed", summary: failed, reward: null, reason: failed, ms, tokens: null });
        lines.push({ n, decisionId: null, source: "failed", trace: null, failed, exchange: null, call: null, ms });
        ended = `the reasoner failed: ${failed}`;
        break;
    }
    if (manifest.steps.length > reported) onProgress?.(manifest);
    if (progress.phase !== "done" && progress.phase !== "waiting") progress.phase = "failed";

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
    const finalPhase = progress.phase as string;
    manifest.state = finalPhase === "done" ? "done" : finalPhase === "waiting" ? "waiting" : "failed";
    runLog()?.section(`Task ${taskId} (${topicId}) ends: ${finalPhase}`, { ended: ended ?? null, steps: progress.iteration, telemetry });
    runLog()?.taskEnded(taskId, topicId, provider.model, finalPhase, ended ?? progress.failure ?? finalPhase, progress.iteration);
    manifest.ended = ended ?? (finalPhase === "done" ? `contract held after ${progress.iteration} step(s)` : finalPhase === "waiting" ? (progress.failure ?? "waiting for the commander") : progress.failure !== null ? `the builder gave up: ${progress.failure}` : "not done");
    manifest.endedAt = new Date().toISOString();
    // The model that answered, as the exchanges name it (2026-10-10, run 26: the Observer routed to Super, its manifest naming the reasoner's default, Ultra).
    const answered = provider.exchanges.map((e) => e.model).filter((m): m is string => typeof m === "string" && m.length > 0 && !m.startsWith("scripted"));
    if (answered.length) {
        const counts = new Map<string, number>();
        for (const m of answered) counts.set(m, (counts.get(m) ?? 0) + 1);
        manifest.provider = { ...manifest.provider, model: [...counts].sort((a, b) => b[1] - a[1])[0][0] };
    }
    await writeText(broker, taskId, "trace.jsonl", lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    // The task's claims, with their sources and the history of their status (claims.ts): what a reviewer reads of where each number came from.
    if (progress.claims.claims.length) await writeText(broker, taskId, "claims.json", JSON.stringify(claimsJson(progress.claims), null, 2) + "\n");

    let proposalId: string | null = null;
    let proposedManifestSha256: string | null = null;
    if (progress.phase === "done" && progress.done) {
        const proposedText = manifestText(manifest);
        proposedManifestSha256 = sha256Text(proposedText);
        await writeText(broker, taskId, "manifest.proposed.json", proposedText);
        const artifacts = manifest.artifacts.filter((a) => a.kind === "model" || a.kind === "graph" || a.kind === "procedure" || a.kind === "plugin" || a.kind === "playbook" || a.kind === "adaptation" || a.kind === "recommendation" || a.kind === "diagnosis" || a.kind === "request").map((a) => ({ kind: a.kind, path: a.path, sha256: a.sha256, ...(a.contractSha256 ? { contractSha256: a.contractSha256 } : {}) }));
        const r = await broker.call(APP.authority.propose.slot, APP.authority.propose.tool, {
            taskId,
            artifacts,
            manifestSha256: proposedManifestSha256,
            // The claims: the topic's, from what it measured (the metadata of the accepted candidate), and the model's summary as a note beside them.
            claims: { requiredOutputs: task.objective.required_outputs.map((o) => o.name), summary: progress.done.summary, plan: progress.plan, sandbox: progress.sandbox, ...(topic.claims?.(progress, task) ?? {}) },
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
