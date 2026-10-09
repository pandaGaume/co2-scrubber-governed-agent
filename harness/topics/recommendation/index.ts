/**
 * The `recommendation` topic (2026-10-01, docs/evaluateur.fr.md, E3): write one recommendation for one finding of the post-procedure
 * evaluator (lib/evaluator.ts), what to change in the harness, the library or the memory, why, the effect expected, and how to
 * verify it, and hand it over as a proposal. The station puts it on the library's proposals shelf and asks an authorised signatory to
 * sign it; unsigned, it changes nothing, and a signed one is applied in a fork and measured before a person commits it (E4).
 *
 * What the factory is given is the task's `observations.recommendation` (the spec names the field): the finding, whole, as the
 * evaluator wrote it (its class, its path in the harness's graph, its counts, its evidence: the harness attaches them to what is
 * proposed, the model writes none of them), the texts it may change with what each holds now, the memory entry or the library
 * documents the finding is about, the rule it is of, the cases to replay, the measures, and the conventions an example keeps.
 *
 * Its guard is the one the station runs again (`recommendationProblems`): a kind the finding's class allows, a target among those
 * given, its current text the one it holds now, a proposed text that changes it, in English and without an em dash, no example a
 * convention contradicts (an example in a tool's description once made a model index the steps from 0), a change of what a guard
 * accepts said as such, a verification that replays the finding's cases and measures what it is about. The number of tasks it
 * replays is justified, as any constant a factory sets.
 */
import type { CapabilityResult, Intention, JsonValue } from "@spiky-panda/harness";
import { existsSync, readFileSync } from "node:fs";
import { fromRoot } from "../../../lib/paths.js";
import { statementText } from "../../../lib/rules-register.js";
import { withBase } from "../../core/base.js";
import type { LocalCapability } from "../../core/capabilities.js";
import { loadPlaybook, sayingText, type Evidence } from "../../core/conduct.js";
import { JUSTIFICATIONS_SCHEMA, type Justified } from "../../core/justify.js";
import type { TopicState } from "../../core/reasoning-state.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicContext, TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { loadWords, say } from "../../core/words.js";

export type RecommendationKind = "contract" | "guard-message" | "guard-decision" | "library" | "memory";

export interface RecommendationFormat {
    words: string;
    prompt: string;
    playbook: string;
    observation: string;
    file: string;
    kinds: Record<RecommendationKind, string>;
    actions: Record<RecommendationKind, string[]>;
    classes: Record<string, RecommendationKind[]>;
    detectors?: Record<string, RecommendationKind[] | string>;
    modelFacing: string[];
    verification: { minTasks: number };
}
export const RECOMMENDATION_FORMAT_FILE = "specs/recommendation/format.json";
export const RECOMMENDATION_FORMAT: RecommendationFormat = JSON.parse(readFileSync(fromRoot(...RECOMMENDATION_FORMAT_FILE.split("/")), "utf8")) as RecommendationFormat;
export const RECOMMENDATION_WORDS = loadWords(RECOMMENDATION_FORMAT.words);
const w = (key: string, vars?: Record<string, string | number>): string => say(RECOMMENDATION_WORDS, key, vars);

/** The factory's own conduct, run once per step. */
export const RECOMMENDATION_CONDUCT = loadPlaybook(RECOMMENDATION_FORMAT.playbook);

export const RECOMMENDATION_WORD_KEYS = [
    "intention", "capabilities.propose", "brief.plan", "brief.write", "brief.refused", "brief.handOver", "requirements.missing",
    "guard.refused", "guard.id", "guard.accepted", "guard.finding", "guard.kind", "guard.action", "guard.target", "guard.stale", "guard.same",
    "guard.empty", "guard.language", "guard.dash", "guard.convention", "guard.decision", "guard.memory", "guard.library", "guard.replay",
    "guard.tasks", "guard.measure", "guard.signed", "openQuestions.plan", "openQuestions.write", "openQuestions.handOver", "validate.none", "validate.notAccepted",
    "validate.notTheFile",
];

export const RECOMMENDATION_TOOLS: ReadonlyArray<RegExp> = withBase([/^recommendation\.propose$/]);

/** A text the factory may change, with what it holds now. */
export interface Target {
    file: string;
    pointer?: string;
    text: string | null;
    /** Why it is offered: it states the finding's rule, a convention it assumes, a rule of the same kind, a capability's description. */
    why?: string;
}

/** The finding as the evaluator wrote it: attached to the recommendation by the harness, never written by the model. */
export interface FindingRef {
    id: string;
    detector: string;
    class: string;
    title: string;
    settledBy: string | null;
    path: string[];
    about: string[];
    tasks: number;
    models: Record<string, number>;
    evidence: JsonValue;
    recommend: boolean;
}

/** What is asked of the factory, from the task. */
export interface Asked {
    id: string;
    finding: FindingRef;
    targets: Target[];
    memory: { id: string; topic: string; rule: string; status: string } | null;
    /** The library documents the finding is about, and whether each is signed now. */
    library: { documents: string[]; signatures?: Record<string, { by: string; at: string; valid: boolean } | null> } | null;
    /** The rule the finding is of: its code, its words, and what the guard checks (a signed rule's check, or a refusal it makes). */
    rule: { code: string; status: string; note?: string; says?: string; check?: JsonValue; example?: string } | null;
    /** The cases to replay: the requests of the finding's tasks. */
    cases: string[];
    models: string[];
    /** What a verification measures: the rule's code, the form. */
    measures: string[];
    /** The conventions an example keeps: a list and the key it names its elements by. */
    conventions: Array<{ list: string; key: string }>;
}

export function askedOf(task: TaskFile["task"]): Asked {
    const a = ((task.observations ?? {}) as Record<string, unknown>)[RECOMMENDATION_FORMAT.observation] as Partial<Asked> | undefined;
    return {
        id: String(a?.id ?? "recommendation"),
        finding: (a?.finding ?? { id: "", detector: "", class: "", title: "", settledBy: null, path: [], about: [], tasks: 0, models: {}, evidence: null, recommend: false }) as FindingRef,
        targets: (a?.targets ?? []) as Target[],
        memory: a?.memory ?? null,
        library: a?.library ?? null,
        rule: a?.rule ?? null,
        cases: (a?.cases ?? []).map(String),
        models: (a?.models ?? []).map(String),
        measures: (a?.measures ?? []).map(String),
        conventions: (a?.conventions ?? []) as Asked["conventions"],
    };
}

/** What a target holds now, on disk: the file whole, or the value at its pointer. */
export function textNow(file: string, pointer?: string): string | null {
    const full = fromRoot(...file.split("/"));
    if (!existsSync(full)) return null;
    return statementText({ file, ...(pointer ? { pointer } : {}), phrase: "" }, readFileSync(full, "utf8"));
}

/** The examples a text gives that a convention contradicts: an element of a keyed list named by its position. */
export function conventionProblems(text: string, conventions: Asked["conventions"]): Array<{ example: string; list: string; key: string }> {
    const out: Array<{ example: string; list: string; key: string }> = [];
    for (const { list, key } of conventions) {
        const l = list.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const patterns = [new RegExp(`/${l}/\\d+`, "g"), new RegExp(`\\b${l}\\[\\d+\\]`, "g"), ...(key === "n" ? [] : [new RegExp(`\\b${l}\\.\\d+\\b`, "g")])];
        for (const p of patterns) for (const m of text.matchAll(p)) out.push({ example: m[0], list, key });
    }
    return out;
}

/** A recommendation as the capability takes it. */
export interface Proposal {
    id: string;
    kind: RecommendationKind;
    target: { file?: string; pointer?: string; memory?: string; library?: string };
    action: string;
    current: string | null;
    proposed: string;
    why: string;
    effect: string;
    changesAcceptance: boolean;
    verification: { replay: string[]; models: string[]; tasks: number; measure: string };
    justifications: unknown[];
}

export const PROPOSE_SCHEMA = {
    type: "object",
    properties: {
        id: { type: "string" },
        kind: { type: "string", enum: Object.keys(RECOMMENDATION_FORMAT.kinds) },
        target: {
            type: "object",
            description: "what it changes: a text of the state's targets (file, and pointer when it has one), the memory entry (memory, its id), or a library document (library, its id)",
            properties: { file: { type: "string" }, pointer: { type: "string" }, memory: { type: "string" }, library: { type: "string" } },
        },
        action: { type: "string", enum: [...new Set(Object.values(RECOMMENDATION_FORMAT.actions).flat())] },
        current: { type: ["string", "null"], description: "the text the target holds now, exactly as the state gives it; null for a memory entry or a library document" },
        proposed: { type: "string", description: "the text proposed: what the target says after the change, or what is added to it" },
        why: { type: "string", description: "why, from the finding, for the signatory who reads it" },
        effect: { type: "string", description: "what the finding's counts should become" },
        changesAcceptance: { type: "boolean", description: "true only when what a guard accepts changes (kind guard-decision)" },
        verification: {
            type: "object",
            properties: {
                replay: { type: "array", items: { type: "string" }, description: "the finding's cases to replay (field \"cases\")" },
                models: { type: "array", items: { type: "string" } },
                tasks: { type: "number" },
                measure: { type: "string", description: "what is measured: the rule or the form the finding is about" },
            },
            required: ["replay", "models", "tasks", "measure"],
        },
        justifications: JUSTIFICATIONS_SCHEMA,
    },
    required: ["id", "kind", "target", "action", "current", "proposed", "why", "effect", "changesAcceptance", "verification", "justifications"],
} as const;

/** The constants a recommendation sets: the number of tasks its verification replays. */
export const verificationConstants = (input: unknown): Array<{ constant: string; value: number }> => {
    const tasks = (input as { verification?: { tasks?: unknown } } | null)?.verification?.tasks;
    return typeof tasks === "number" ? [{ constant: "verification.tasks", value: tasks }] : [];
};

export const RECOMMENDATION_JUSTIFIED: Justified = {
    capability: /^recommendation\.propose$/,
    constants: (input) => verificationConstants(input),
};

/** The kinds a finding takes: its class's, and its detector's. */
export function kindsFor(finding: Pick<FindingRef, "class" | "detector">, format: RecommendationFormat = RECOMMENDATION_FORMAT): RecommendationKind[] {
    const byDetector = format.detectors?.[finding.detector];
    return [...new Set([...(format.classes[finding.class] ?? []), ...(Array.isArray(byDetector) ? byDetector : [])])];
}

/** The kinds the factory can write for what it is given: a text to change, the memory entry, a library document. */
export function feasibleKinds(asked: Asked, format: RecommendationFormat = RECOMMENDATION_FORMAT): RecommendationKind[] {
    return kindsFor(asked.finding, format).filter((k) => (k === "memory" ? Boolean(asked.memory) : k === "library" ? Boolean(asked.library?.documents.length) : asked.targets.length > 0));
}

/** The dash the house style forbids, by its code: a text holding it is refused. */
const EM_DASH = String.fromCharCode(0x2014);

const sameTarget = (a: { file?: string; pointer?: string }, b: { file?: string; pointer?: string }): boolean => a.file === b.file && (a.pointer ?? "") === (b.pointer ?? "");
const describe = (t: { file?: string; pointer?: string }): string => `${t.file}${t.pointer ? ` ${t.pointer}` : ""}`;

/** The recommendation's problems, as the guard and the station see them. */
export function recommendationProblems(input: unknown, asked: Asked, format: RecommendationFormat = RECOMMENDATION_FORMAT): string[] {
    const p = (input ?? {}) as Partial<Proposal>;
    const problems: string[] = [];
    if (p.id !== asked.id) problems.push(w("guard.id", { got: String(p.id ?? ""), id: asked.id }));
    if (!asked.finding.recommend) problems.push(w("guard.finding", { finding: asked.finding.id || "(none)" }));
    const kinds = kindsFor(asked.finding, format);
    const kind = p.kind as RecommendationKind | undefined;
    if (!kind || !kinds.includes(kind)) problems.push(w("guard.kind", { class: asked.finding.class, kinds: kinds.join(", ") || "none", got: String(kind ?? "") }));
    const actions = kind ? (format.actions[kind] ?? []) : [];
    if (kind && !actions.includes(String(p.action))) problems.push(w("guard.action", { kind, actions: actions.join(", "), got: String(p.action ?? "") }));
    const target = p.target ?? {};
    const proposed = typeof p.proposed === "string" ? p.proposed : "";
    if (!proposed.trim()) problems.push(w("guard.empty"));
    if (kind === "contract" || kind === "guard-message" || kind === "guard-decision") {
        const offered = asked.targets.find((t) => sameTarget(t, target));
        if (!offered) problems.push(w("guard.target", { target: describe(target), targets: asked.targets.map(describe).join("; ") || "none" }));
        else {
            const now = textNow(offered.file, offered.pointer);
            if (p.current !== now) problems.push(w("guard.stale", { target: describe(target) }));
            if (proposed && (p.action === "replace" ? proposed === now : (now ?? "").includes(proposed.trim()))) problems.push(w("guard.same", { target: describe(target) }));
        }
    }
    if (kind === "memory" && (!asked.memory || target.memory !== asked.memory.id)) problems.push(w("guard.memory", { got: String(target.memory ?? ""), memory: asked.memory?.id ?? "none" }));
    if (kind === "library" && !(asked.library?.documents ?? []).includes(String(target.library))) problems.push(w("guard.library", { got: String(target.library ?? ""), documents: (asked.library?.documents ?? []).join(", ") || "none" }));
    const signature = kind === "library" ? asked.library?.signatures?.[String(target.library)] : null;
    if (kind === "library" && p.action === "sign" && signature?.valid) problems.push(w("guard.signed", { document: String(target.library), by: signature.by, at: signature.at }));
    if ((kind === "guard-decision") !== (p.changesAcceptance === true)) problems.push(w("guard.decision"));
    // What a model reads is English, without the dash the house style forbids, and its examples keep the conventions.
    const accented = [...new Set(proposed.match(/[À-ÖØ-öø-ÿ]/g) ?? [])];
    if (accented.length) problems.push(w("guard.language", { chars: accented.join(" ") }));
    if (proposed.includes(EM_DASH)) problems.push(w("guard.dash"));
    for (const c of conventionProblems(proposed, asked.conventions)) problems.push(w("guard.convention", { example: c.example, list: c.list, key: c.key }));
    const v = p.verification;
    const replay = Array.isArray(v?.replay) ? v!.replay.map(String) : [];
    const unknown = asked.cases.length ? replay.filter((c) => !asked.cases.includes(c)) : [];
    if (!replay.length || unknown.length) problems.push(w("guard.replay", { unknown: unknown.join(", ") || "none named", cases: asked.cases.join(", ") || "none" }));
    if (typeof v?.tasks !== "number" || v.tasks < format.verification.minTasks) problems.push(w("guard.tasks", { tasks: String(v?.tasks ?? 0), min: format.verification.minTasks }));
    if (asked.measures.length && !asked.measures.some((m) => String(v?.measure ?? "").includes(m))) problems.push(w("guard.measure", { measures: asked.measures.join(" or ") }));
    return problems;
}

interface Submission {
    n: number;
    ok: boolean;
    problems: string[];
}
interface RecommendationTopicState {
    submissions: Submission[];
    accepted: { path: string; sha256: string } | null;
}

function stateOf(progress: Progress): RecommendationTopicState {
    const current = progress.topic.recommendation as unknown as RecommendationTopicState | undefined;
    if (current) return current;
    const fresh: RecommendationTopicState = { submissions: [], accepted: null };
    progress.topic.recommendation = fresh as unknown as JsonValue;
    return fresh;
}

/** The proofs the factory's own playbook reads. */
function evidenceOf(progress: Progress): Evidence {
    return { planDeclared: progress.plan !== null, recommendationAccepted: stateOf(progress).accepted !== null };
}

function viewsOf(progress: Progress, task: TaskFile["task"]): Record<string, () => Record<string, string | number>> {
    const state = stateOf(progress);
    const last = state.submissions.at(-1);
    const asked = askedOf(task);
    return {
        accepted: () => ({ path: state.accepted?.path ?? "" }),
        plan: () => ({ name: task.objective.required_outputs[0]?.name ?? asked.id }),
        write: () => ({ kinds: kindsFor(asked.finding).join(", ") || "none", refused: last && !last.ok ? w("brief.refused", { problems: last.problems.join("; ") }) : "" }),
    };
}

export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    return sayingText(RECOMMENDATION_CONDUCT.evaluate(evidenceOf(progress)).stage, w, viewsOf(progress, task));
}

async function guardRecommendation(capabilityId: string, input: JsonValue, context: TopicContext): Promise<string[]> {
    const views = viewsOf(context.progress, context.task);
    const refused = RECOMMENDATION_CONDUCT.evaluate(evidenceOf(context.progress))
        .refusing.filter((g) => g.capabilities.includes(capabilityId))
        .map((g) => sayingText(g, w, views));
    if (refused.length || capabilityId !== "recommendation.propose") return refused;
    const problems = recommendationProblems(input, askedOf(context.task));
    if (!problems.length) return [];
    const state = stateOf(context.progress);
    state.submissions.push({ n: state.submissions.length + 1, ok: false, problems });
    context.progress.pendingProblems = problems.map((says) => ({ says, kind: "recommendation" }));
    return [w("guard.refused", { problems: problems.join("; ") })];
}

/** The recommendation as it is kept: what the model proposed, with the finding the harness attaches, the target's text read again. */
export function recommendationRecord(asked: Asked, p: Proposal): Record<string, JsonValue> {
    const current = p.target.file ? textNow(p.target.file, p.target.pointer) : null;
    return {
        id: asked.id,
        finding: asked.finding as unknown as JsonValue,
        rule: asked.rule as unknown as JsonValue,
        kind: p.kind,
        target: p.target as JsonValue,
        action: p.action,
        current,
        proposed: p.proposed,
        why: p.why,
        effect: p.effect,
        changesAcceptance: p.changesAcceptance,
        verification: p.verification as unknown as JsonValue,
        justifications: p.justifications as JsonValue,
    };
}

function proposeCapability(context: TopicContext): LocalCapability {
    return {
        id: "recommendation.propose",
        description: w("capabilities.propose", { file: RECOMMENDATION_FORMAT.file.replace("{id}", "<id>") }),
        inputSchema: PROPOSE_SCHEMA as unknown as JsonValue,
        async execute(input: JsonValue): Promise<CapabilityResult> {
            const asked = askedOf(context.task);
            const path = RECOMMENDATION_FORMAT.file.replace("{id}", asked.id);
            const text = JSON.stringify(recommendationRecord(asked, input as unknown as Proposal), null, 2) + "\n";
            const r = await context.broker.call("workspace", "write", { taskId: context.taskId, path, text });
            if (!r.ok) return { ok: false, error: r.error ?? `could not write ${path}`, output: { outcome: r.outcome } };
            const state = stateOf(context.progress);
            state.submissions.push({ n: state.submissions.length + 1, ok: true, problems: [] });
            state.accepted = { path, sha256: (r.output as { sha256: string }).sha256 };
            return { ok: true, output: { outcome: "completed", value: { accepted: true, path, sha256: state.accepted.sha256 } } };
        },
    };
}

export function stateOfTopic(progress: Progress, task: TaskFile["task"]): TopicState {
    const asked = askedOf(task);
    const state = stateOf(progress);
    const e = evidenceOf(progress);
    const last = state.submissions.at(-1);
    return {
        hypothesis: {
            id: asked.id,
            finding: asked.finding as unknown as JsonValue,
            kinds: kindsFor(asked.finding) as JsonValue,
            targets: asked.targets as unknown as JsonValue,
            memory: asked.memory as unknown as JsonValue,
            library: asked.library as unknown as JsonValue,
            rule: asked.rule as unknown as JsonValue,
            cases: asked.cases,
            models: asked.models,
            measures: asked.measures,
            conventions: asked.conventions as unknown as JsonValue,
            minTasks: RECOMMENDATION_FORMAT.verification.minTasks,
            accepted: state.accepted as unknown as JsonValue,
        },
        evaluation: last ? ({ submission: last.n, ok: last.ok, problems: last.problems } as JsonValue) : null,
        openQuestions: [w(e.recommendationAccepted ? "openQuestions.handOver" : e.planDeclared ? "openQuestions.write" : "openQuestions.plan")],
        requirements: e as Record<string, boolean>,
    };
}

export function validateRecommendation(claim: DoneClaim, files: WorkshopFile[], progress: Progress): Validation {
    const problems: string[] = [];
    const claimed = claim.artifacts.filter((a) => a.kind === "recommendation");
    const { accepted } = stateOf(progress);
    if (!claimed.length) problems.push(w("validate.none"));
    if (!accepted) problems.push(w("validate.notAccepted"));
    for (const c of claimed) {
        const file = files.find((f) => f.path === c.path);
        if (!file || !accepted || file.path !== accepted.path || file.sha256 !== accepted.sha256) problems.push(w("validate.notTheFile", { path: c.path, accepted: accepted ? `${accepted.path}, sha256 ${accepted.sha256.slice(0, 12)}` : "none" }));
    }
    return { ok: problems.length === 0, problems };
}

function intentionOf(task: TaskFile["task"], generic: Intention): Intention {
    const a = askedOf(task);
    return { ...generic, description: w("intention", { id: a.id, finding: a.finding.title || a.finding.id }) };
}

export const RECOMMENDATION_TOPIC: TopicDefinition = {
    // The stage's tools only: what the conduct's gates refuse now is not shown (the guard refuses it still).
    closed: (progress, _task) => RECOMMENDATION_CONDUCT.evaluate(evidenceOf(progress)).refusing.flatMap((g) => g.capabilities),
    name: "recommendation",
    tools: RECOMMENDATION_TOOLS,
    // A recommendation is written for this task's finding, never replayed from another's.
    neverReplayed: [/^recommendation\.propose$/, /^task\.done$/],
    judges: [/^recommendation\.propose$/],
    replayedActions: [/^task\.plan$/],
    justified: RECOMMENDATION_JUSTIFIED,
    validate: (claim, files, progress) => validateRecommendation(claim, files, progress),
    local: (context) => [proposeCapability(context)],
    guard: guardRecommendation,
    state: stateOfTopic,
    key: (progress) => stateOf(progress).submissions.map((s) => (s.ok ? "ok" : "refused")).join(","),
    intention: intentionOf,
    prompt: RECOMMENDATION_FORMAT.prompt,
    observation: RECOMMENDATION_FORMAT.observation,
    words: { words: RECOMMENDATION_WORDS, keys: RECOMMENDATION_WORD_KEYS },
    brief: briefOf,
    shelf: false,
    quantities: false,
};
