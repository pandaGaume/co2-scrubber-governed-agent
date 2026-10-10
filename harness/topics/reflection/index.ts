/**
 * The `reflection` topic (2026-09-29, P4 of docs/comportement-en-donnees.fr.md): from the patterns the station read in
 * a fork's traces (`lib/reflection.ts`, observe), propose one adaptation of the conduct: a patch on one file of the
 * context the spec lets adapt (a playbook, a words file), with why and the patterns it answers. Its guard applies the
 * patch to a copy and checks the file is still what its reader needs; what never adapts (the library, the facts, the
 * rules, who decides, the reflection itself) is refused whatever the pattern. The station adopts it in a fork only.
 *
 * What the factory is given is the task's `observations.reflection`: the patterns, each with its id. The factory is
 * conducted by a playbook of its own (`specs/reflection/playbook.json`).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { CapabilityResult, Intention, JsonValue } from "@spiky-panda/harness";
import { fromRoot } from "../../../lib/paths.js";
import { adaptationProblems, reflectionFormat, type Adaptation, type Pattern } from "../../../lib/reflection.js";
import { episodeView, memoryProblems, type MemoryEntry, type Remembered } from "../../../lib/memory.js";
import type { Episode } from "../../core/episodes.js";
import { withBase } from "../../core/base.js";
import type { LocalCapability } from "../../core/capabilities.js";
import { conductView, loadPlaybook, sayingText, type Evidence } from "../../core/conduct.js";
import { JUSTIFICATIONS_SCHEMA, type Justified } from "../../core/justify.js";
import type { TopicState } from "../../core/reasoning-state.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicContext, TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { loadWords, say } from "../../core/words.js";

export const REFLECTION_FORMAT = reflectionFormat();
export const REFLECTION_WORDS = loadWords(REFLECTION_FORMAT.words);
const w = (key: string, vars?: Record<string, string | number>): string => say(REFLECTION_WORDS, key, vars);

/** The factory's own conduct, run once per step. */
export const REFLECTION_CONDUCT = loadPlaybook(REFLECTION_FORMAT.playbook);

export const REFLECTION_WORD_KEYS = [
    "intention", "capabilities.propose", "capabilities.remember", "brief.plan", "brief.propose", "brief.refused", "brief.handOver", "requirements.missing",
    "guard.refused", "guard.accepted", "openQuestions.plan", "openQuestions.propose", "openQuestions.handOver",
    "validate.none", "validate.notAccepted", "validate.notTheFile",
];

export const REFLECTION_TOOLS: ReadonlyArray<RegExp> = withBase([/^reflection\.(propose|remember)$/]);

/** The patterns the task is given. */
export const patternsOf = (task: TaskFile["task"]): Pattern[] => {
    const r = ((task.observations ?? {}) as Record<string, unknown>)[REFLECTION_FORMAT.observation] as { patterns?: Pattern[] } | undefined;
    return Array.isArray(r?.patterns) ? r.patterns : [];
};

/** The working memory the task is given (2026-09-29, the memory audit): the recent episodes of the patterns' factories, and what their memory holds. */
export const episodesOfTask = (task: TaskFile["task"]): Episode[] => {
    const r = ((task.observations ?? {}) as Record<string, unknown>)[REFLECTION_FORMAT.observation] as { episodes?: Episode[] } | undefined;
    return Array.isArray(r?.episodes) ? r.episodes : [];
};
export const memoryOfTask = (task: TaskFile["task"]): MemoryEntry[] => {
    const r = ((task.observations ?? {}) as Record<string, unknown>)[REFLECTION_FORMAT.observation] as { memory?: MemoryEntry[] } | undefined;
    return Array.isArray(r?.memory) ? r.memory : [];
};

/** What the reflection proposes to remember: a rule for a factory's memory, not a change of its words. */
export const REMEMBER_SCHEMA = {
    type: "object",
    properties: {
        memory: {
            type: "object",
            properties: {
                kind: { type: "string", enum: ["constraint", "workflow"], description: "constraint: what a submission must hold; workflow: how the work goes" },
                rule: { type: "string", description: "one sentence, by its words and the ids of the facts it names, never their values" },
                appliesTo: { type: "array", items: { type: "string" }, minItems: 1, description: "the capabilities it concerns, as the episodes name them" },
                evidence: { type: "object", properties: { failures: { type: "array", items: { type: "string" } }, successes: { type: "array", items: { type: "string" } } }, required: ["failures", "successes"] },
            },
            required: ["kind", "rule", "appliesTo", "evidence"],
        },
        reason: { type: "string" },
        evidence: { type: "array", items: { type: "string" }, minItems: 1 },
    },
    required: ["memory", "reason", "evidence"],
} as const;

interface Submission {
    n: number;
    ok: boolean;
    problems: string[];
}
interface ReflectionTopicState {
    submissions: Submission[];
    accepted: { path: string; sha256: string } | null;
}

function stateOf(progress: Progress): ReflectionTopicState {
    const current = progress.topic.reflection as unknown as ReflectionTopicState | undefined;
    if (current) return current;
    const fresh: ReflectionTopicState = { submissions: [], accepted: null };
    progress.topic.reflection = fresh as unknown as JsonValue;
    return fresh;
}

export const PROPOSE_SCHEMA = {
    type: "object",
    properties: {
        target: { type: "string", description: "the file of the context the patch changes, as the patterns name it" },
        ops: {
            type: "array",
            minItems: 1,
            items: { type: "object", properties: { op: { type: "string", enum: ["append", "replace", "add", "remove"], description: "append: the value (a text) is added at the end of the text the pointer names, the way a sentence is added to an instruction" }, pointer: { type: "string", description: "a JSON Pointer into the file (a words key brief.procedure is /brief/procedure); a segment [id=x] picks the element of a list whose id is x" }, value: {} }, required: ["op", "pointer"] },
        },
        reason: { type: "string" },
        evidence: { type: "array", items: { type: "string" }, minItems: 1 },
        justifications: JUSTIFICATIONS_SCHEMA,
    },
    required: ["target", "ops", "reason", "evidence", "justifications"],
} as const;

/** The numbers a patch sets, by path: the constants an adaptation sets, each justified. */
export const numbersOfPatch = (input: unknown): Array<{ constant: string; value: number }> => {
    // Whatever a model sends: ops that are not a list set no number here, and the schema says what is wrong with them (2026-09-29: two reflections crashed the loop on it).
    const ops = (input as { ops?: unknown } | null)?.ops;
    return Array.isArray(ops) ? ops.flatMap((o: { value?: unknown } | null, i) => (typeof o?.value === "number" ? [{ constant: `ops.${i}.value`, value: o.value }] : [])) : [];
};

export const REFLECTION_JUSTIFIED: Justified = {
    capability: /^reflection\.propose$/,
    constants: (input) => numbersOfPatch(input),
};

function evidenceOf(progress: Progress): Evidence {
    return { planDeclared: progress.plan !== null, adaptationAccepted: stateOf(progress).accepted !== null };
}

function viewsOf(progress: Progress, task: TaskFile["task"]): Record<string, () => Record<string, string | number>> {
    const state = stateOf(progress);
    const last = state.submissions.at(-1);
    return {
        accepted: () => ({ path: state.accepted?.path ?? "" }),
        plan: () => ({ name: task.objective.required_outputs[0]?.name ?? "adaptation" }),
        propose: () => ({ refused: last && !last.ok ? w("brief.refused", { problems: last.problems.join("; ") }) : "" }),
    };
}

export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    return sayingText(REFLECTION_CONDUCT.evaluate(evidenceOf(progress)).stage, w, viewsOf(progress, task));
}

async function guardReflection(capabilityId: string, input: JsonValue, context: TopicContext): Promise<string[]> {
    const views = viewsOf(context.progress, context.task);
    const refused = REFLECTION_CONDUCT.evaluate(evidenceOf(context.progress))
        .refusing.filter((g) => g.capabilities.includes(capabilityId))
        .map((g) => sayingText(g, w, views));
    if (refused.length || !/^reflection\.(propose|remember)$/.test(capabilityId)) return refused;
    if (capabilityId === "reflection.remember") {
        const problems = memoryProblems(input, patternsOf(context.task), episodesOfTask(context.task), memoryOfTask(context.task));
        if (!problems.length) return [];
        const state = stateOf(context.progress);
        state.submissions.push({ n: state.submissions.length + 1, ok: false, problems });
        context.progress.pendingProblems = problems.map((says) => ({ says, kind: "memory" }));
        return [w("guard.refused", { problems: problems.join("; ") })];
    }
    const locked = ((((context.task.observations ?? {}) as Record<string, unknown>)[REFLECTION_FORMAT.observation] as { locked?: string[] } | undefined)?.locked ?? []) as string[];
    const { problems } = adaptationProblems(input, patternsOf(context.task), REFLECTION_FORMAT, locked);
    if (!problems.length) return [];
    const state = stateOf(context.progress);
    state.submissions.push({ n: state.submissions.length + 1, ok: false, problems });
    context.progress.pendingProblems = problems.map((says) => ({ says, kind: "adaptation" }));
    return [w("guard.refused", { problems: problems.join("; ") })];
}

const sha256Of = (text: string): string => createHash("sha256").update(text).digest("hex");

function proposeCapability(context: TopicContext): LocalCapability {
    return {
        id: "reflection.propose",
        description: w("capabilities.propose", { file: REFLECTION_FORMAT.file.replace("{n}", "<n>") }),
        inputSchema: PROPOSE_SCHEMA as unknown as JsonValue,
        async execute(input: JsonValue): Promise<CapabilityResult> {
            const a = input as unknown as Adaptation;
            const state = stateOf(context.progress);
            const path = REFLECTION_FORMAT.file.replace("{n}", String(state.submissions.filter((s) => s.ok).length + 1));
            const file = fromRoot(...a.target.split("/"));
            const before = existsSync(file) ? readFileSync(file, "utf8") : "";
            // What the station adopts: the patch, why, the patterns, and the file as it was when the patch was checked (a file changed since is not patched).
            const text = JSON.stringify({ target: a.target, ops: a.ops, reason: a.reason, evidence: a.evidence, justifications: a.justifications, targetSha256: sha256Of(before), patterns: patternsOf(context.task).filter((p) => a.evidence.includes(p.id)) }, null, 2) + "\n";
            const r = await context.broker.call("workspace", "write", { taskId: context.taskId, path, text });
            if (!r.ok) return { ok: false, error: r.error ?? `could not write ${path}`, output: { outcome: r.outcome } };
            state.submissions.push({ n: state.submissions.length + 1, ok: true, problems: [] });
            state.accepted = { path, sha256: (r.output as { sha256: string }).sha256 };
            return { ok: true, output: { outcome: "completed", value: { accepted: true, path, sha256: state.accepted.sha256, target: a.target, ops: a.ops.length } } };
        },
    };
}

function rememberCapability(context: TopicContext): LocalCapability {
    return {
        id: "reflection.remember",
        description: w("capabilities.remember", { file: REFLECTION_FORMAT.file.replace("{n}", "<n>") }),
        inputSchema: REMEMBER_SCHEMA as unknown as JsonValue,
        async execute(input: JsonValue): Promise<CapabilityResult> {
            const r = input as unknown as Remembered;
            const state = stateOf(context.progress);
            const path = REFLECTION_FORMAT.file.replace("{n}", String(state.submissions.filter((s) => s.ok).length + 1));
            // What the station enters as a candidate: the entry, why, the patterns it answers.
            const text = JSON.stringify({ memory: r.memory, reason: r.reason, evidence: r.evidence, patterns: patternsOf(context.task).filter((p) => r.evidence.includes(p.id)) }, null, 2) + "\n";
            const written = await context.broker.call("workspace", "write", { taskId: context.taskId, path, text });
            if (!written.ok) return { ok: false, error: written.error ?? `could not write ${path}`, output: { outcome: written.outcome } };
            state.submissions.push({ n: state.submissions.length + 1, ok: true, problems: [] });
            state.accepted = { path, sha256: (written.output as { sha256: string }).sha256 };
            return { ok: true, output: { outcome: "completed", value: { accepted: true, path, sha256: state.accepted.sha256, memory: r.memory.rule } } };
        },
    };
}

export function stateOfTopic(progress: Progress, task: TaskFile["task"]): TopicState {
    const patterns = patternsOf(task);
    const state = stateOf(progress);
    const e = evidenceOf(progress);
    const last = state.submissions.at(-1);
    // The files the patterns point at, whole: what a patch is written against.
    const files: Record<string, JsonValue> = {};
    for (const p of patterns)
        if (p.target && !(p.target in files) && existsSync(fromRoot(...p.target.split("/")))) {
            try {
                files[p.target] = JSON.parse(readFileSync(fromRoot(...p.target.split("/")), "utf8")) as JsonValue;
            } catch {
                files[p.target] = null;
            }
        }
    return {
        hypothesis: {
            patterns: patterns as unknown as JsonValue,
            // What was already tried for these patterns in the fork, and what it did (kept, undone, being judged): try something else.
            history: ((((task.observations ?? {}) as Record<string, unknown>)[REFLECTION_FORMAT.observation] as { history?: unknown } | undefined)?.history ?? []) as JsonValue,
            files,
            adaptable: REFLECTION_FORMAT.adaptable,
            never: REFLECTION_FORMAT.never as unknown as JsonValue,
            // The working memory of the patterns' factories (2026-09-29, the memory audit): the recent episodes, each attempt with who
            // decided it, and what was refused then accepted; and what their memory already holds.
            episodes: episodesOfTask(task).map((e) => episodeView(e)) as JsonValue,
            memory: memoryOfTask(task).map((e) => ({ rule: e.rule, appliesTo: e.appliesTo, status: e.status })) as unknown as JsonValue,
            accepted: state.accepted as unknown as JsonValue,
        },
        evaluation: last ? ({ submission: last.n, ok: last.ok, problems: last.problems } as JsonValue) : null,
        openQuestions: [w(e.adaptationAccepted ? "openQuestions.handOver" : e.planDeclared ? "openQuestions.propose" : "openQuestions.plan")],
        requirements: e as Record<string, boolean>,
    };
}

export function validateReflection(claim: DoneClaim, files: WorkshopFile[], progress: Progress): Validation {
    const problems: string[] = [];
    const claimed = claim.artifacts.filter((a) => a.kind === "adaptation");
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
    return { ...generic, description: w("intention", { count: patternsOf(task).length }) };
}

export const REFLECTION_TOPIC: TopicDefinition = {
    // The marching order the state shows first (conduct.ts, conductView), and what must hold before handing over.
    marchingOrder: (progress, task) => {
        const e = evidenceOf(progress);
        return {
            ...conductView(REFLECTION_CONDUCT, e, w, viewsOf(progress, task), Object.keys(progress.reads)),
            doneWhen: [
                { item: w("doneWhen.plan"), met: Boolean(e.planDeclared) },
                { item: w("doneWhen.accepted"), met: Boolean(e.adaptationAccepted) },
                { item: w("doneWhen.handedOver"), met: progress.done !== null },
            ],
        } as unknown as JsonValue;
    },
    // The stage's tools only: what the conduct's gates refuse now is not shown (the guard refuses it still).
    closed: (progress, _task) => REFLECTION_CONDUCT.evaluate(evidenceOf(progress)).refusing.flatMap((g) => g.capabilities),
    name: "reflection",
    tools: REFLECTION_TOOLS,
    // An adaptation answers this task's patterns, never replayed from another's.
    neverReplayed: [/^reflection\.(propose|remember)$/, /^task\.done$/],
    judges: [/^reflection\.(propose|remember)$/],
    replayedActions: [/^task\.plan$/],
    justified: REFLECTION_JUSTIFIED,
    validate: (claim, files, progress) => validateReflection(claim, files, progress),
    local: (context) => [proposeCapability(context), rememberCapability(context)],
    guard: guardReflection,
    state: stateOfTopic,
    key: (progress) => stateOf(progress).submissions.map((s) => (s.ok ? "ok" : "refused")).join(","),
    intention: intentionOf,
    prompt: REFLECTION_FORMAT.prompt,
    words: { words: REFLECTION_WORDS, keys: REFLECTION_WORD_KEYS },
    brief: briefOf,
    shelf: false,
    // An adaptation is a document: its output is named, not a quantity.
    quantities: false,
};
