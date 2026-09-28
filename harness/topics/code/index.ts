/**
 * The `code` topic: write the node the catalogue lacks, through the forge
 * (docs/observateur-et-usines.fr.md, sections 6 to 6.2). Its entry is a
 * required output no node of the catalogue produces (a graph factory's
 * `missing_capabilities` with the topic `code`, or a task opened with the
 * topic itself); its exit is a signed plugin artifact proposed to the
 * station, the twin's catalogue untouched.
 *
 * What the topic does itself is little, and deterministic: the forge holds
 * the sandbox and the checks (`slots/forge`), the constructor holds the
 * loop; this file gives the loop what the `procedure` topic got on
 * 2026-09-25: the tools, a guard of its own (the plugin's types named
 * under `Generated.` before anything is compiled, one plugin per task, a
 * promotion only after the node ran, a hand-over only after the
 * promotion), its part of the reasoning state (what the forge answered at
 * each stage, whole where the model needs it whole: the diagnostics, the
 * refused checks, the tests' output), the brief stage by stage, the key
 * that tells the steps apart for the recipes, the claims built by code from
 * what the forge measured, and the validator (the claimed artifact is the
 * very file the forge signed).
 *
 * The stages, in the order a plugin goes through the forge:
 *   1  the gap and the catalogue      forge.registry_search: what exists, so
 *                                     that a node is written only for what
 *                                     nothing produces; the library for the physics
 *   2  the plan                       task.plan: selected_nodes empty, one
 *                                     missing capability per required output,
 *                                     topic "code"
 *   3  the plugin                     forge.plugin_write: the entry, the node,
 *                                     its tests, its card
 *   4  compiled, tested, loaded       forge.plugin_build, forge.plugin_test,
 *                                     forge.plugin_load; a refusal comes back
 *                                     whole and is corrected in place
 *   5  run                            graph.evaluate on the forge when the task
 *                                     carries telemetry (the same evaluator,
 *                                     the same thresholds, the same diagnosis
 *                                     as the graph factory's), a document run
 *                                     (forge.document_build, forge.session_run)
 *                                     otherwise
 *   6  proposed, handed over          forge.plugin_promote, then task.done with
 *                                     the artifact the forge signed
 */
import { withBase } from "../../core/base.js";
import { refusedNote } from "../../core/brief.js";
import type { Intention, JsonValue } from "@spiky-panda/harness";
import type { LocalCapability } from "../../core/capabilities.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicState } from "../../core/reasoning-state.js";
import type { TopicContext, TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { CANDIDATE_JUSTIFIED, candidatesOf, evaluateCapability } from "../graph/index.js";
import { contractProblems, type CapabilityContract } from "../../../slots/forge/contract.js";
import type { CapabilityResult } from "@spiky-panda/harness";
import { readFileSync } from "node:fs";
import { fromRoot } from "../../../lib/paths.js";
import { loadWords, say } from "../../core/words.js";

/** What the code factory knows of the application and says to its model: its spec (`specs/code/format.json`) and its words (2026-09-28, zero domain in the harness). */
interface CodeFormat {
    words: string;
    prompt: string;
    /** The prefix a generated type carries. */
    generatedPrefix: string;
}
export const CODE_FORMAT_FILE = "specs/code/format.json";
export const CODE_FORMAT: CodeFormat = JSON.parse(readFileSync(fromRoot(...CODE_FORMAT_FILE.split("/")), "utf8")) as CodeFormat;
export const CODE_WORDS = loadWords(CODE_FORMAT.words);
const cw = (key: string, vars?: Record<string, string | number>): string => say(CODE_WORDS, key, vars);

export const CODE_TOOLS: ReadonlyArray<RegExp> = withBase([
    /^forge\.registry_(search|describe_node|list_nodes)$/,
    /^forge\.plugin_(template|write|build|test|load|promote)$/,
    /^code\.accept$/,
    /^forge\.document_(validate|build)$/,
    /^forge\.session_run$/,
    // No workshop tools: everything the topic reads is in the state (the template, the plugin's sources, the forge's answers); a model given workspace.read read state fields as files, eight steps in a row (the seventh passage).
    /^graph\.evaluate$/,
]);

export const CODE_PROMPT = CODE_FORMAT.prompt;

/** The prefix a generated type carries; the forge refuses the rest at its checks, the guard here before any compilation. */
export const GENERATED_PREFIX = CODE_FORMAT.generatedPrefix;

interface CodeTopicState {
    /** The one plugin of this task, named at the first write. */
    plugin: string | null;
}

interface WriteAnswer {
    ok?: boolean;
    plugin?: string;
    files?: string[];
    /** The plugin's files whole, as they stand after the write: the state carries them, the model corrects them there. */
    sources?: Array<{ path: string; content: string }>;
    sha256?: string;
    problems?: Array<{ where: string; what: string }>;
}
interface TemplateAnswer {
    plugin?: string;
    files?: Array<{ path: string; content: string }>;
    note?: string;
}
interface BuildAnswer {
    id?: string;
    ok?: boolean;
    sha256?: string;
    ms?: number;
    problems?: Array<{ where: string; what: string }>;
    diagnostics?: Array<{ file: string; line: number; column: number; code: string; message: string }>;
}
interface TestAnswer {
    build?: string;
    ok?: boolean;
    pass?: number;
    fail?: number;
    output?: string;
    types?: Array<{ type: string; ok: boolean; problems: string[] }>;
}
interface LoadAnswer {
    id?: string;
    sha256?: string;
    types?: string[];
}
interface RunAnswer {
    ticks?: number;
    summary?: Record<string, { first: number; last: number }>;
}
interface AcceptAnswer {
    build?: string;
    ok?: boolean;
    type?: string | null;
    static?: string[];
    behaviors?: Array<{ behavior: string; expected: number | null; actual: number | null; ok: boolean; reason?: string }>;
}
interface PromoteAnswer {
    id?: string;
    path?: string;
    sha256?: string;
    artifactSha256?: string;
    stationProposalId?: string | null;
    note?: string;
}

function stateOf(progress: Progress): CodeTopicState {
    const current = progress.topic.code as unknown as CodeTopicState | undefined;
    if (current) return current;
    const fresh: CodeTopicState = { plugin: null };
    progress.topic.code = fresh as unknown as JsonValue;
    return fresh;
}

const read = <T>(progress: Progress, capability: string): T | undefined => progress.reads[capability]?.value as T | undefined;

/** What the forge answered at each stage of this task, from the runner's reads (the last successful answer of each capability). */
function stagesOf(progress: Progress) {
    return {
        template: read<TemplateAnswer>(progress, "forge.plugin_template"),
        written: read<WriteAnswer>(progress, "forge.plugin_write"),
        build: read<BuildAnswer>(progress, "forge.plugin_build"),
        tests: read<TestAnswer>(progress, "forge.plugin_test"),
        // A local capability's answer is recorded as { outcome, value }: the acceptance is under value.
        accepted: ((): AcceptAnswer | undefined => {
            const raw = read<AcceptAnswer & { outcome?: string; value?: AcceptAnswer }>(progress, "code.accept");
            return raw && raw.value && typeof raw.value === "object" ? raw.value : raw;
        })(),
        loaded: read<LoadAnswer>(progress, "forge.plugin_load"),
        run: read<RunAnswer>(progress, "forge.session_run"),
        promoted: read<PromoteAnswer>(progress, "forge.plugin_promote"),
    };
}

/**
 * The capability contract of the task (`task.requirements.capability`),
 * written by whoever opened the task (a graph factory, a request) and never
 * by the model; null when the task carries none, and then the acceptance is
 * not required and the artifact says so.
 */
export function contractOf(task: TaskFile["task"]): CapabilityContract | null {
    const raw = (task.requirements as { capability?: unknown } | undefined)?.capability;
    if (!raw || typeof raw !== "object") return null;
    return contractProblems(raw).length ? null : (raw as CapabilityContract);
}

/** The problems of the task's contract, for the state: a contract that does not parse is said, not silently dropped. */
export function contractProblemsOf(task: TaskFile["task"]): string[] {
    const raw = (task.requirements as { capability?: unknown } | undefined)?.capability;
    return raw && typeof raw === "object" ? contractProblems(raw) : [];
}

/** The type names a plugin's entry registers, as written: `reg.register("<prefix><Domain>:<name>", ...)` or a constant `TYPE = "..."` passed to it. */
export function typesWritten(files: Array<{ path?: unknown; content?: unknown }>): string[] {
    const out = new Set<string>();
    for (const f of files) {
        if (typeof f?.content !== "string" || !/\.ts$/.test(String(f.path ?? "")) || /\.test\.ts$/.test(String(f.path))) continue;
        for (const m of f.content.matchAll(/\.register\s*\(\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))/g)) {
            const literal = m[1] ?? m[2];
            if (literal) out.add(literal);
            else if (m[3]) {
                const c = new RegExp(`(?:const|let|var)\\s+${m[3]}\\s*(?::\\s*string)?\\s*=\\s*(?:"([^"]+)"|'([^']+)')`).exec(f.content);
                if (c) out.add(c[1] ?? c[2]);
            }
        }
    }
    return [...out];
}

/** Has the node run in the forge: the same request judged by the evaluator (a candidate that held), or a document run that completed. */
function ranOf(progress: Progress): { ran: boolean; how: "evaluate" | "session" | null; held: boolean | null } {
    const candidate = candidatesOf(progress).at(-1);
    if (candidate) return { ran: true, how: "evaluate", held: candidate.pass };
    const { run } = stagesOf(progress);
    if (run && typeof run.ticks === "number" && run.ticks > 0) return { ran: true, how: "session", held: null };
    return { ran: false, how: null, held: null };
}

export function requirementsOf(progress: Progress, task: TaskFile["task"]): Record<string, boolean> {
    const s = stagesOf(progress);
    const ran = ranOf(progress);
    const telemetry = progress.context.telemetry !== null || (task.data ?? []).length > 0;
    return {
        catalogueSearched: progress.reads["forge.registry_search"] !== undefined,
        planAccepted: progress.plan !== null,
        templateRead: progress.reads["forge.plugin_template"] !== undefined,
        written: s.written?.ok === true,
        built: s.build?.ok === true && s.build.sha256 === s.written?.sha256,
        tested: s.tests?.ok === true && s.build?.ok === true && s.tests.build === s.build.id,
        // The contract's acceptance, run by the forge on the last build; a task without a contract has nothing to accept, and its artifact says so.
        accepted: contractOf(task) ? s.accepted?.ok === true && s.build?.ok === true && s.accepted.build === s.build.id : true,
        loaded: Boolean(s.loaded?.sha256) && s.loaded?.sha256 === s.written?.sha256,
        // With telemetry the node is judged like any candidate (graph.evaluate on the forge) and must hold; without, a document run that completed is the evidence.
        ran: telemetry ? ran.how === "evaluate" && ran.held === true : ran.ran,
        promoted: Boolean(s.promoted?.artifactSha256) && s.promoted?.sha256 === s.written?.sha256,
    };
}

const HOW_KEYS = ["catalogueSearched", "templateRead", "written", "built", "tested", "accepted", "loaded", "ran", "promoted"];
const howOf = (k: string): string => cw(`how.${k}`);

/**
 * A document that runs the generated node must wire it: a node whose inputs
 * are all unwired shows nothing of its behaviour (the third passage on Haiku
 * ran the leak with its command unwired, at zero, and the harness took it
 * as a run). Deterministic: the spec's connections, the loaded types.
 */
export function documentProblems(spec: unknown, generatedTypes: string[]): string[] {
    const s = (spec && typeof spec === "object" ? spec : {}) as { nodes?: Array<{ id?: unknown; typeId?: unknown }>; connections?: Array<{ to?: unknown[] }> };
    const nodes = Array.isArray(s.nodes) ? s.nodes : [];
    const wiredInto = new Set((Array.isArray(s.connections) ? s.connections : []).map((c) => String((c?.to ?? [])[0] ?? "")));
    const generated = nodes.filter((n) => generatedTypes.includes(String(n?.typeId)));
    if (!generated.length) return [cw("document.none", { types: generatedTypes.join(", ") || cw("document.noneLoaded") })];
    return generated.filter((n) => !wiredInto.has(String(n?.id))).map((n) => cw("document.unwired", { id: String(n?.id), type: String(n?.typeId) }));
}

async function guardCode(capabilityId: string, input: JsonValue, context: TopicContext): Promise<string[]> {
    const { progress, task } = context;
    const state = stateOf(progress);
    const requirements = requirementsOf(progress, task);
    const need = (keys: string[]) => keys.filter((k) => !requirements[k]).map((k) => cw("guard.need", { capability: capabilityId, requirement: k, how: howOf(k) }));
    if (capabilityId === "task.plan") {
        const problems = need(["catalogueSearched"]);
        const plan = (input ?? {}) as { selected_nodes?: unknown[]; missing_capabilities?: Array<{ topic?: string; required_output?: string }> };
        if (Array.isArray(plan.selected_nodes) && plan.selected_nodes.length) problems.push(cw("guard.planSelected"));
        for (const m of Array.isArray(plan.missing_capabilities) ? plan.missing_capabilities : []) if (m?.topic !== "code") problems.push(cw("guard.planTopic", { output: String(m?.required_output), topic: String(m?.topic) }));
        return problems;
    }
    if (capabilityId === "forge.plugin_write") {
        const problems: string[] = [];
        const w = (input ?? {}) as { plugin?: unknown; files?: unknown };
        const plugin = String(w.plugin ?? "");
        if (state.plugin && plugin && plugin !== state.plugin) problems.push(cw("guard.onePlugin", { plugin: state.plugin }));
        if (!requirements.templateRead) problems.push(cw("guard.templateFirst"));
        const files = Array.isArray(w.files) ? (w.files as Array<{ path?: unknown; content?: unknown }>) : [];
        for (const type of typesWritten(files)) if (!type.startsWith(GENERATED_PREFIX)) problems.push(cw("guard.notGenerated", { type, prefix: GENERATED_PREFIX }));
        return problems;
    }
    if (capabilityId === "forge.document_build") {
        const loaded = stagesOf(progress).loaded?.types ?? [];
        return loaded.length ? documentProblems((input as { spec?: unknown } | null)?.spec, loaded) : [cw("guard.notLoaded")];
    }
    if (capabilityId === "forge.plugin_load") return need(["tested", "accepted"]);
    if (capabilityId === "code.accept") return need(["tested"]);
    if (capabilityId === "forge.plugin_promote") return need(["loaded", "ran"]);
    if (capabilityId === "task.done") {
        const problems = need(["promoted"]);
        const claim = (input ?? {}) as Partial<DoneClaim>;
        if (!(claim.artifacts ?? []).some((a) => a.kind === "plugin")) problems.push(cw("guard.doneArtifact", { path: stagesOf(progress).promoted?.path ?? cw("guard.doneArtifactPath") }));
        return problems;
    }
    return [];
}

const headOf = (text: string | undefined, n: number): string | null => (typeof text === "string" ? (text.length <= n ? text : `${text.slice(0, n)}... (${text.length} characters)`) : null);

export function stateOfTopic(progress: Progress, task: TaskFile["task"]): TopicState {
    const s = stagesOf(progress);
    const state = stateOf(progress);
    const requirements = requirementsOf(progress, task);
    const ran = ranOf(progress);
    const catalogue = read<{ matches?: Array<{ type: string; signature?: { purpose?: string } }> }>(progress, "forge.registry_search");
    const openQuestions: string[] = [];
    if (!catalogue) openQuestions.push(cw("openQuestions.catalogue"));
    if (!s.written) openQuestions.push(cw("openQuestions.node"));
    else if (!requirements.built) openQuestions.push(s.build && !s.build.ok ? cw("openQuestions.buildFailed") : cw("openQuestions.notBuilt"));
    else if (!requirements.tested) openQuestions.push(s.tests && !s.tests.ok ? cw("openQuestions.testsRefused") : cw("openQuestions.notTested"));
    else if (!requirements.accepted) openQuestions.push(s.accepted && !s.accepted.ok && s.accepted.build === s.build?.id ? cw("openQuestions.acceptanceRefused") : cw("openQuestions.notAccepted"));
    else if (!requirements.loaded) openQuestions.push(cw("openQuestions.notLoaded"));
    else if (!requirements.ran) openQuestions.push(ran.how === "evaluate" ? cw("openQuestions.notHeld") : howOf("ran"));
    else if (!requirements.promoted) openQuestions.push(cw("openQuestions.notPromoted"));
    const candidate = candidatesOf(progress).at(-1);
    let evaluation: JsonValue | null = null;
    if (s.build && !s.build.ok) evaluation = { stage: "build", ok: false, problems: s.build.problems ?? [], diagnostics: s.build.diagnostics ?? [] } as JsonValue;
    else if (s.tests && !s.tests.ok && s.tests.build === s.build?.id) evaluation = { stage: "test", ok: false, pass: s.tests.pass ?? 0, fail: s.tests.fail ?? 0, checks: (s.tests.types ?? []).filter((t) => !t.ok), output: headOf(s.tests.output, 3000) } as JsonValue;
    else if (s.accepted && !s.accepted.ok && s.accepted.build === s.build?.id) evaluation = { stage: "acceptance", ok: false, static: s.accepted.static ?? [], behaviors: (s.accepted.behaviors ?? []).filter((b) => !b.ok) } as JsonValue;
    else if (candidate) evaluation = { stage: "evaluate", candidate: candidate.n, pass: candidate.pass, diagnosis: candidate.diagnosis ?? null, residuals: candidate.residuals.map((r) => ({ column: r.column, rmse: r.rmse })) } as unknown as JsonValue;
    else if (s.run) evaluation = { stage: "run", ticks: s.run.ticks ?? 0, summary: s.run.summary ?? {} } as JsonValue;
    else if (s.tests) evaluation = { stage: "test", ok: s.tests.ok === true, pass: s.tests.pass ?? 0, fail: s.tests.fail ?? 0 } as JsonValue;
    const lastRefusal = Object.entries(progress.refusals).filter(([k]) => k.startsWith("forge.") || k === "task.done" || k === "task.plan").sort((a, b) => a[1].at.localeCompare(b[1].at)).at(-1);
    return {
        hypothesis: {
            gap: task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`),
            // The contract whole: what the node must satisfy is read here, never inferred from prose; a contract that does not parse is said.
            contract: contractOf(task) ?? (contractProblemsOf(task).length ? { problems: contractProblemsOf(task) } : null),
            missing: progress.plan?.missing_capabilities.map((m) => ({ output: m.required_output, reason: m.reason })) ?? null,
            catalogue: catalogue ? (catalogue.matches ?? []).slice(0, 12).map((m) => `${m.type}: ${m.signature?.purpose ?? ""}`.slice(0, 160)) : null,
            // The template whole until the plugin compiles (the shape to write on), the plugin's sources whole from the first write (what is corrected): the state carries what the model needs whole.
            template: s.template && !requirements.built ? (s.template.files ?? []) : null,
            plugin: state.plugin ? { name: state.plugin, files: s.written?.files ?? [], sources: s.written?.sources ?? [], sha256: s.written?.sha256 ?? null, accepted: s.accepted ? { ok: s.accepted.ok === true, behaviors: (s.accepted.behaviors ?? []).map((b) => `${b.behavior}: ${b.ok ? cw("state.held") : b.reason ?? cw("state.refused")}`) } : null, build: s.build ? { id: s.build.id ?? null, ok: s.build.ok === true, current: s.build.sha256 === s.written?.sha256 } : null, tests: s.tests ? { ok: s.tests.ok === true, pass: s.tests.pass ?? 0, fail: s.tests.fail ?? 0, types: (s.tests.types ?? []).map((t) => `${t.type}: ${t.ok ? cw("state.ok") : t.problems.join("; ")}`) } : null, loaded: s.loaded?.types ?? null, ran: ran.ran ? ran.how : null, proposal: s.promoted ? { id: s.promoted.id ?? null, path: s.promoted.path ?? null, artifactSha256: s.promoted.artifactSha256 ?? null, station: s.promoted.stationProposalId ?? null } : null } : null,
        } as JsonValue,
        evaluation: lastRefusal && (!evaluation || lastRefusal[1].at > (progress.reads[Object.keys(progress.reads).at(-1) ?? ""]?.at ?? "")) ? ({ refused: lastRefusal[0], reason: lastRefusal[1].reason, ...(evaluation && typeof evaluation === "object" ? { last: evaluation } : {}) } as JsonValue) : evaluation,
        openQuestions,
        requirements,
    };
}

export function validateCode(claim: DoneClaim, files: WorkshopFile[], progress: Progress): Validation {
    const problems: string[] = [];
    const claimed = claim.artifacts.filter((a) => a.kind === "plugin");
    const { promoted } = stagesOf(progress);
    if (!claimed.length) problems.push(cw("validate.none"));
    if (!promoted?.artifactSha256) problems.push(cw("validate.notProposed"));
    for (const c of claimed) {
        const file = files.find((f) => f.path === c.path);
        if (!file) problems.push(cw("validate.notAFile", { path: c.path }));
        else if (promoted && (file.path !== promoted.path || file.sha256 !== promoted.artifactSha256)) problems.push(cw("validate.notSigned", { path: c.path, signed: String(promoted.path), sha: String(promoted.artifactSha256).slice(0, 12) }));
    }
    return { ok: problems.length === 0, problems };
}

function intentionOf(task: TaskFile["task"], generic: Intention): Intention {
    const outputs = task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join("; ");
    return { ...generic, description: cw("intention", { outputs }) };
}

/** The harness's brief, stage by stage; the rules of the forge are in the tools' descriptions and its refusals, never restated as advice. */
export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    const s = stagesOf(progress);
    const r = requirementsOf(progress, task);
    const ran = ranOf(progress);
    const outputs = task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join(", ");
    const telemetry = progress.context.telemetry !== null || (task.data ?? []).length > 0;
    const refused = (cap: string) => refusedNote(progress, cap);
    const plugin = (): string => String(stateOf(progress).plugin);
    if (r.promoted) return cw("brief.handOver", { path: s.promoted?.path ?? cw("brief.theArtifact"), id: s.promoted?.id ?? cw("brief.unknown"), station: s.promoted?.stationProposalId ? cw("brief.handOverStation", { id: s.promoted.stationProposalId }) : "", refused: refused("task.done") });
    if (!r.catalogueSearched) return cw("brief.gap", { outputs });
    const names = task.objective.required_outputs.map((o) => cw("brief.planOutput", { name: o.name, quantity: o.quantity, unit: o.unit ? cw("brief.planUnit", { unit: o.unit }) : "" })).join("; ");
    if (!r.planAccepted) return cw("brief.plan", { names, refused: refused("task.plan") });
    if (!r.templateRead) return cw("brief.template");
    if (!r.written) return cw("brief.write", { contract: contractOf(task) ? cw("brief.writeContract") : "", prefix: GENERATED_PREFIX, refused: refused("forge.plugin_write") });
    if (!r.built) return cw("brief.compiled", { what: s.build && !s.build.ok ? cw("brief.compiledFailed", { plugin: plugin() }) : cw("brief.compiledWritten", { files: (s.written?.files ?? []).join(", ") }), refused: refused("forge.plugin_build") });
    if (!r.tested) return cw("brief.tested", { what: s.tests && !s.tests.ok && s.tests.build === s.build?.id ? cw("brief.testedRefused", { plugin: plugin() }) : cw("brief.testedCompiled"), refused: refused("forge.plugin_test") });
    if (!r.accepted) return cw("brief.accepted", { what: s.accepted && !s.accepted.ok && s.accepted.build === s.build?.id ? cw("brief.acceptedRefused") : cw("brief.acceptedTested", { pass: s.tests?.pass ?? 0 }), refused: refused("code.accept") });
    if (!r.loaded) return cw("brief.loaded", { pass: s.tests?.pass ?? 0, types: (s.tests?.types ?? []).map((t) => t.type).join(", "), refused: refused("forge.plugin_load") });
    if (!r.ran) {
        const types = (s.loaded?.types ?? []).join(", ");
        if (telemetry) return cw("brief.judged", { types, notHeld: ran.how === "evaluate" && ran.held === false ? cw("brief.judgedNotHeld") : "", refused: refused("graph.evaluate") });
        return cw("brief.run", { types, runtime: task.runtime ?? "forge", refusedRun: refused("forge.session_run"), refusedBuild: refused("forge.document_build") });
    }
    return cw("brief.proposed", { how: String(ran.how), plugin: plugin(), refused: refused("forge.plugin_promote") });
}

function claimsOf(progress: Progress): Record<string, JsonValue> {
    const s = stagesOf(progress);
    const ran = ranOf(progress);
    const candidate = candidatesOf(progress).at(-1);
    return {
        plugin: (stateOf(progress).plugin ?? null) as JsonValue,
        sha256: (s.written?.sha256 ?? null) as JsonValue,
        types: (s.loaded?.types ?? []) as JsonValue,
        tests: (s.tests ? { pass: s.tests.pass ?? 0, fail: s.tests.fail ?? 0, checks: (s.tests.types ?? []).every((t) => t.ok) } : null) as JsonValue,
        acceptance: (s.accepted ? { ok: s.accepted.ok === true, behaviors: (s.accepted.behaviors ?? []).length, held: (s.accepted.behaviors ?? []).filter((b) => b.ok).length } : null) as JsonValue,
        ran: (ran.ran ? { how: ran.how, ...(candidate ? { candidate: candidate.n, held: candidate.pass, rmse: Math.max(...candidate.residuals.map((r) => r.rmse)) } : {}) } : null) as JsonValue,
        proposal: (s.promoted ? { id: s.promoted.id ?? null, artifactSha256: s.promoted.artifactSha256 ?? null, station: s.promoted.stationProposalId ?? null } : null) as JsonValue,
    };
}

/** The plugin named at the first accepted write, kept for the guard; the forge's answers say the rest. */
/** The task's contract run on the plugin by the forge: the one capability of the topic, without input, so that the contract is the task's and never the model's. */
function acceptCapability(context: TopicContext): LocalCapability {
    const { broker, taskId, task, progress } = context;
    return {
        id: "code.accept",
        description: cw("capability"),
        inputSchema: { type: "object", properties: {}, additionalProperties: false } as unknown as JsonValue,
        async execute(): Promise<CapabilityResult> {
            const contract = contractOf(task);
            if (!contract) return { ok: false, error: cw("accept.noContract", { problems: contractProblemsOf(task).length ? cw("accept.noContractProblems", { problems: contractProblemsOf(task).join("; ") }) : "" }), output: { outcome: "refused" } };
            const plugin = stateOf(progress).plugin ?? read<WriteAnswer>(progress, "forge.plugin_write")?.plugin;
            if (!plugin) return { ok: false, error: cw("accept.noPlugin"), output: { outcome: "refused" } };
            const r = await broker.call("forge", "plugin_acceptance", { taskId, plugin, contract });
            if (!r.ok) return { ok: false, error: r.error ?? cw("accept.refused"), output: { outcome: r.outcome } };
            return { ok: true, output: { outcome: "completed", value: r.output as JsonValue } };
        },
    };
}

function noteWrite(context: TopicContext): LocalCapability[] {
    // The plugin's name is noted from the runner's reads at each state build (stateOfTopic), which is enough for the guard: it reads the state after the write completed.
    const state = stateOf(context.progress);
    const w = read<WriteAnswer>(context.progress, "forge.plugin_write");
    if (!state.plugin && w?.plugin) state.plugin = w.plugin;
    return [evaluateCapability(context, "forge"), acceptCapability(context)];
}

/** The words the topic asks for: the conformance test checks the file holds them all. */
export const CODE_WORD_KEYS = [
    "intention", "capability", ...HOW_KEYS.map((k) => `how.${k}`),
    "guard.need", "guard.planSelected", "guard.planTopic", "guard.onePlugin", "guard.templateFirst", "guard.notGenerated", "guard.notLoaded", "guard.doneArtifact", "guard.doneArtifactPath",
    "document.none", "document.noneLoaded", "document.unwired",
    "openQuestions.catalogue", "openQuestions.node", "openQuestions.buildFailed", "openQuestions.notBuilt", "openQuestions.testsRefused", "openQuestions.notTested", "openQuestions.acceptanceRefused", "openQuestions.notAccepted", "openQuestions.notLoaded", "openQuestions.notHeld", "openQuestions.notPromoted",
    "state.held", "state.refused", "state.ok",
    "validate.none", "validate.notProposed", "validate.notAFile", "validate.notSigned",
    "accept.noContract", "accept.noContractProblems", "accept.noPlugin", "accept.refused",
    "brief.handOver", "brief.handOverStation", "brief.theArtifact", "brief.unknown", "brief.gap", "brief.plan", "brief.planOutput", "brief.planUnit", "brief.template", "brief.write", "brief.writeContract",
    "brief.compiled", "brief.compiledFailed", "brief.compiledWritten", "brief.tested", "brief.testedRefused", "brief.testedCompiled", "brief.accepted", "brief.acceptedRefused", "brief.acceptedTested",
    "brief.loaded", "brief.judged", "brief.judgedNotHeld", "brief.run", "brief.proposed",
];

export const CODE_TOPIC: TopicDefinition = {
    name: "code",
    tools: CODE_TOOLS,
    // The plugin is written, built, tested, loaded, run and promoted for this task's contract: never replayed from another task's (two missing nodes of the same quantity share a task signature).
    neverReplayed: [/^forge\.plugin_(write|build|test|load|promote)$/, /^code\.accept$/, /^forge\.(document_build|session_run)$/, /^graph\.evaluate$/, /^task\.done$/],
    // The plan declares what no node produces, from the task's required outputs; the guard checks it again.
    replayedActions: [/^task\.plan$/],
    // The numbers it sets are a candidate's, when it judges its node on the telemetry; the node's own defaults are editable parameters, said in its card.
    justified: CANDIDATE_JUSTIFIED,
    validate: (claim, files, progress) => validateCode(claim, files, progress),
    local: noteWrite,
    guard: (capabilityId, input, context) => {
        // The plugin's name, noted before the guard judges (the runner builds the local capabilities once; the reads move after).
        const state = stateOf(context.progress);
        const w = read<WriteAnswer>(context.progress, "forge.plugin_write");
        if (!state.plugin && w?.plugin) state.plugin = w.plugin;
        return guardCode(capabilityId, input, context);
    },
    state: (progress, task) => {
        const state = stateOf(progress);
        const w = read<WriteAnswer>(progress, "forge.plugin_write");
        if (!state.plugin && w?.plugin) state.plugin = w.plugin;
        return stateOfTopic(progress, task);
    },
    key: (progress) => {
        const r = requirementsOf(progress, { objective: { required_outputs: [], constraints: {} }, data: [] } as unknown as TaskFile["task"]);
        return ["templateRead", "written", "built", "tested", "accepted", "loaded", "ran", "promoted"].filter((k) => r[k]).join(",");
    },
    intention: intentionOf,
    prompt: CODE_PROMPT,
    words: { words: CODE_WORDS, keys: CODE_WORD_KEYS },
    brief: briefOf,
    claims: claimsOf,
    // No graph is built here: the shelf's reference graphs and their variables are not read for nothing.
    shelf: false,
};
