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
import { adaptationProblems, placesOf, reflectionFormat, stageKeysOf, type Adaptation, type Pattern } from "../../../lib/reflection.js";
import { withBase } from "../../core/base.js";
import type { LocalCapability } from "../../core/capabilities.js";
import { loadPlaybook, sayingText, type Evidence } from "../../core/conduct.js";
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
    "intention", "capabilities.propose", "brief.plan", "brief.propose", "brief.refused", "brief.handOver", "requirements.missing",
    "guard.refused", "guard.accepted", "openQuestions.plan", "openQuestions.propose", "openQuestions.handOver",
    "validate.none", "validate.notAccepted", "validate.notTheFile",
];

export const REFLECTION_TOOLS: ReadonlyArray<RegExp> = withBase([/^reflection\.propose$/]);

/** The patterns the task is given. */
export const patternsOf = (task: TaskFile["task"]): Pattern[] => {
    const r = ((task.observations ?? {}) as Record<string, unknown>)[REFLECTION_FORMAT.observation] as { patterns?: Pattern[] } | undefined;
    return Array.isArray(r?.patterns) ? r.patterns : [];
};

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
    if (refused.length || capabilityId !== "reflection.propose") return refused;
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
            // For each pattern about a factory's capability: where that factory reads what it is told about it, with the text as it is now.
            places: Object.fromEntries(
                patterns
                    .filter((p) => p.target && /words\.json$/.test(p.target) && typeof p.detail.capability === "string")
                    .map((p) => {
                        const file = fromRoot(...p.target!.split("/"));
                        const words = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
                        return [p.id, { file: p.target, places: placesOf(words, String(p.detail.capability), stageKeysOf(String(p.detail.topic ?? ""))) }];
                    }),
            ) as unknown as JsonValue,
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
    name: "reflection",
    tools: REFLECTION_TOOLS,
    // An adaptation answers this task's patterns, never replayed from another's.
    neverReplayed: [/^reflection\.propose$/, /^task\.done$/],
    replayedActions: [/^task\.plan$/],
    justified: REFLECTION_JUSTIFIED,
    validate: (claim, files, progress) => validateReflection(claim, files, progress),
    local: (context) => [proposeCapability(context)],
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
