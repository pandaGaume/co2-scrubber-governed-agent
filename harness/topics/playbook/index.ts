/**
 * The `playbook` topic (2026-09-29, level 2 of docs/comportement-en-donnees.fr.md): write the playbook a person
 * asked for, a conduct graph the core's runtime runs (`harness/core/conduct.ts`), by changing a base playbook as
 * the change says, and hand it over as a proposal. The station puts it on the library's proposals shelf and asks
 * an authorised signatory to sign it; unsigned, it conducts nothing.
 *
 * What the factory is given is the task's `observations.playbook` (the spec names the field): the id and the title
 * of the document it proposes, the change asked, the base playbook (a repository path), the words file its stages
 * may say, what a stage may do, what a gate may refuse, and the cases it must hold. Its guard is the one the station
 * runs again (`playbookProblems`): the playbook builds, one stage and one only at every event its proofs and counts
 * can make, only words of its file, only known actions and capabilities, every case held. Every bound's number is
 * justified, as any constant a factory sets.
 *
 * The factory is conducted by a playbook of its own (`specs/playbook/playbook.json`): the plan, the playbook, the
 * hand-over, and what it refuses meanwhile.
 */
import type { CapabilityResult, Intention, JsonValue } from "@spiky-panda/harness";
import { readFileSync } from "node:fs";
import { fromRoot } from "../../../lib/paths.js";
import { withBase } from "../../core/base.js";
import type { LocalCapability } from "../../core/capabilities.js";
import { conductView, loadPlaybook, Playbook, playbookProblems, sayingText, type Evidence, type PlaybookExpectations, type PlaybookFile } from "../../core/conduct.js";
import { JUSTIFICATIONS_SCHEMA, type Justified } from "../../core/justify.js";
import type { TopicState } from "../../core/reasoning-state.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicContext, TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { loadWords, say, type Words } from "../../core/words.js";

interface PlaybookFormat {
    words: string;
    prompt: string;
    /** The factory's own conduct. */
    playbook: string;
    /** The observation that carries what is asked. */
    observation: string;
    /** Where an accepted playbook is written, `{id}` filled. */
    file: string;
}
export const PLAYBOOK_FORMAT_FILE = "specs/playbook/format.json";
export const PLAYBOOK_FORMAT: PlaybookFormat = JSON.parse(readFileSync(fromRoot(...PLAYBOOK_FORMAT_FILE.split("/")), "utf8")) as PlaybookFormat;
export const PLAYBOOK_WORDS = loadWords(PLAYBOOK_FORMAT.words);
const w = (key: string, vars?: Record<string, string | number>): string => say(PLAYBOOK_WORDS, key, vars);

/** The factory's own conduct, run once per step. */
export const PLAYBOOK_CONDUCT = loadPlaybook(PLAYBOOK_FORMAT.playbook);

export const PLAYBOOK_WORD_KEYS = [
    "intention", "capabilities.submit", "brief.plan", "brief.write", "brief.refused", "brief.handOver", "requirements.missing",
    "guard.refused", "guard.id", "guard.accepted", "openQuestions.plan", "openQuestions.write", "openQuestions.handOver",
    "validate.none", "validate.notAccepted", "validate.notTheFile",
];

export const PLAYBOOK_TOOLS: ReadonlyArray<RegExp> = withBase([/^playbook\.submit$/]);

/** What is asked of the factory, from the task. */
export interface Asked {
    id: string;
    title: string;
    change: string;
    /** The playbook it changes, a repository path; none for a new one. */
    base?: string;
    /** The words file its stages may say. */
    words: string;
    actions?: string[];
    capabilities?: string[];
    cases?: PlaybookExpectations["cases"];
}

export function askedOf(task: TaskFile["task"]): Asked {
    const a = ((task.observations ?? {}) as Record<string, unknown>)[PLAYBOOK_FORMAT.observation] as Partial<Asked> | undefined;
    return { id: String(a?.id ?? "playbook"), title: String(a?.title ?? a?.id ?? "a playbook"), change: String(a?.change ?? ""), words: String(a?.words ?? PLAYBOOK_FORMAT.words), ...(a?.base ? { base: String(a.base) } : {}), ...(a?.actions ? { actions: a.actions.map(String) } : {}), ...(a?.capabilities ? { capabilities: a.capabilities.map(String) } : {}), ...(a?.cases ? { cases: a.cases } : {}) };
}

const readJson = (file: string): unknown => {
    try {
        return JSON.parse(readFileSync(fromRoot(...file.split("/")), "utf8"));
    } catch {
        return null;
    }
};
const wordsOf = (asked: Asked): Words | null => {
    try {
        return loadWords(asked.words);
    } catch {
        return null;
    }
};

/** What the guard checks a playbook against: the task's words, actions, capabilities and cases. */
export const expectationsOf = (asked: Asked): PlaybookExpectations => {
    const words = wordsOf(asked);
    return { ...(words ? { words } : {}), ...(asked.actions ? { actions: asked.actions } : {}), ...(asked.capabilities ? { capabilities: asked.capabilities } : {}), ...(asked.cases ? { cases: asked.cases } : {}) };
};

interface Submission {
    n: number;
    ok: boolean;
    problems: string[];
}
interface PlaybookTopicState {
    submissions: Submission[];
    accepted: { path: string; sha256: string } | null;
}

function stateOf(progress: Progress): PlaybookTopicState {
    const current = progress.topic.playbook as unknown as PlaybookTopicState | undefined;
    if (current) return current;
    const fresh: PlaybookTopicState = { submissions: [], accepted: null };
    progress.topic.playbook = fresh as unknown as JsonValue;
    return fresh;
}

/** A submission as the capability takes it. */
export interface PlaybookSubmission {
    id: string;
    title: string;
    summary: string;
    playbook: PlaybookFile;
    justifications: unknown[];
}

export const SUBMIT_SCHEMA = {
    type: "object",
    properties: {
        id: { type: "string" },
        title: { type: "string" },
        summary: { type: "string", description: "what the playbook does and what changed, for the signatory who reads it" },
        playbook: { type: "object", properties: { title: { type: "string" }, nodes: { type: "array", items: { type: "object" } }, links: { type: "array", items: { type: "object" } } }, required: ["nodes", "links"] },
        justifications: JUSTIFICATIONS_SCHEMA,
    },
    required: ["id", "title", "summary", "playbook", "justifications"],
} as const;

/** The bounds' numbers, by path: the constants a playbook sets, each justified. */
export const boundsOf = (input: unknown): Array<{ constant: string; value: number }> => {
    const nodes = (input as { playbook?: { nodes?: unknown } } | null)?.playbook?.nodes;
    // Whatever a model sends: nodes that are not a list set no bound here, and the schema says what is wrong with them.
    if (!Array.isArray(nodes)) return [];
    return (nodes as PlaybookFile["nodes"]).filter((n) => n?.type === "conduct.bound" && typeof n.bag?.atLeast === "number").map((n) => ({ constant: `nodes.${n.id}.atLeast`, value: n.bag!.atLeast as number }));
};

export const PLAYBOOK_JUSTIFIED: Justified = {
    capability: /^playbook\.submit$/,
    constants: (input) => boundsOf(input),
};

/** The playbook's problems as the guard sees them: the task's id, then the conduct's checks. */
export function submissionProblems(input: unknown, asked: Asked): string[] {
    const s = (input ?? {}) as Partial<PlaybookSubmission>;
    const problems: string[] = [];
    if (s.id !== asked.id) problems.push(w("guard.id", { got: String(s.id ?? ""), id: asked.id }));
    problems.push(...playbookProblems(s.playbook, asked.id, expectationsOf(asked)));
    return problems;
}

/** The proofs the factory's own playbook reads. */
function evidenceOf(progress: Progress): Evidence {
    return { planDeclared: progress.plan !== null, playbookAccepted: stateOf(progress).accepted !== null };
}

function viewsOf(progress: Progress, task: TaskFile["task"]): Record<string, () => Record<string, string | number>> {
    const state = stateOf(progress);
    const last = state.submissions.at(-1);
    return {
        accepted: () => ({ path: state.accepted?.path ?? "" }),
        plan: () => ({ name: task.objective.required_outputs[0]?.name ?? askedOf(task).id }),
        write: () => ({ refused: last && !last.ok ? w("brief.refused", { problems: last.problems.join("; ") }) : "" }),
    };
}

export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    return sayingText(PLAYBOOK_CONDUCT.evaluate(evidenceOf(progress)).stage, w, viewsOf(progress, task));
}

async function guardPlaybook(capabilityId: string, input: JsonValue, context: TopicContext): Promise<string[]> {
    const views = viewsOf(context.progress, context.task);
    const refused = PLAYBOOK_CONDUCT.evaluate(evidenceOf(context.progress))
        .refusing.filter((g) => g.capabilities.includes(capabilityId))
        .map((g) => sayingText(g, w, views));
    if (refused.length || capabilityId !== "playbook.submit") return refused;
    const problems = submissionProblems(input, askedOf(context.task));
    if (!problems.length) return [];
    const state = stateOf(context.progress);
    state.submissions.push({ n: state.submissions.length + 1, ok: false, problems });
    context.progress.pendingProblems = problems.map((says) => ({ says, kind: "playbook" }));
    return [w("guard.refused", { problems: problems.join("; ") })];
}

function submitCapability(context: TopicContext): LocalCapability {
    return {
        id: "playbook.submit",
        description: w("capabilities.submit", { file: PLAYBOOK_FORMAT.file.replace("{id}", "<id>") }),
        inputSchema: SUBMIT_SCHEMA as unknown as JsonValue,
        async execute(input: JsonValue): Promise<CapabilityResult> {
            const asked = askedOf(context.task);
            const s = input as unknown as PlaybookSubmission;
            const path = PLAYBOOK_FORMAT.file.replace("{id}", asked.id);
            // The envelope the station reads: the document's id and title, what was asked, and the graph.
            const text = JSON.stringify({ id: asked.id, title: s.title, summary: s.summary, change: asked.change, playbook: s.playbook, justifications: s.justifications }, null, 2) + "\n";
            const r = await context.broker.call("workspace", "write", { taskId: context.taskId, path, text });
            if (!r.ok) return { ok: false, error: r.error ?? `could not write ${path}`, output: { outcome: r.outcome } };
            const state = stateOf(context.progress);
            state.submissions.push({ n: state.submissions.length + 1, ok: true, problems: [] });
            state.accepted = { path, sha256: (r.output as { sha256: string }).sha256 };
            const pb = new Playbook(asked.id, s.playbook);
            return { ok: true, output: { outcome: "completed", value: { accepted: true, path, sha256: state.accepted.sha256, stages: pb.stages.map((x) => x.id), gates: pb.gates.map((g) => g.id), bounds: pb.bounds.map((b) => `${b.count} >= ${b.atLeast}`) } } };
        },
    };
}

export function stateOfTopic(progress: Progress, task: TaskFile["task"]): TopicState {
    const asked = askedOf(task);
    const state = stateOf(progress);
    const words = wordsOf(asked);
    const e = evidenceOf(progress);
    const last = state.submissions.at(-1);
    return {
        hypothesis: {
            asked: { id: asked.id, title: asked.title, change: asked.change },
            base: asked.base ? ((readJson(asked.base) ?? null) as JsonValue) : null,
            words: (words?.templates ?? null) as JsonValue,
            actions: (asked.actions ?? null) as JsonValue,
            capabilities: (asked.capabilities ?? null) as JsonValue,
            cases: (asked.cases ?? null) as unknown as JsonValue,
            accepted: state.accepted as unknown as JsonValue,
        },
        evaluation: last ? ({ submission: last.n, ok: last.ok, problems: last.problems } as JsonValue) : null,
        openQuestions: [w(e.playbookAccepted ? "openQuestions.handOver" : e.planDeclared ? "openQuestions.write" : "openQuestions.plan")],
        requirements: e as Record<string, boolean>,
    };
}

export function validatePlaybook(claim: DoneClaim, files: WorkshopFile[], progress: Progress): Validation {
    const problems: string[] = [];
    const claimed = claim.artifacts.filter((a) => a.kind === "playbook");
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
    return { ...generic, description: w("intention", { id: a.id, title: a.title, change: a.change }) };
}

export const PLAYBOOK_TOPIC: TopicDefinition = {
    // The marching order the state shows first (conduct.ts, conductView), and what must hold before handing over.
    marchingOrder: (progress, task) => {
        const e = evidenceOf(progress);
        return {
            ...conductView(PLAYBOOK_CONDUCT, e, w, viewsOf(progress, task), Object.keys(progress.reads)),
            doneWhen: [
                { item: w("doneWhen.plan"), met: Boolean(e.planDeclared) },
                { item: w("doneWhen.accepted"), met: Boolean(e.playbookAccepted) },
                { item: w("doneWhen.handedOver"), met: progress.done !== null },
            ],
        } as unknown as JsonValue;
    },
    // The stage's tools only: what the conduct's gates refuse now is not shown (the guard refuses it still).
    closed: (progress, _task) => PLAYBOOK_CONDUCT.evaluate(evidenceOf(progress)).refusing.flatMap((g) => g.capabilities),
    name: "playbook",
    tools: PLAYBOOK_TOOLS,
    // A playbook is written for this task's change, never replayed from another's.
    neverReplayed: [/^playbook\.submit$/, /^task\.done$/],
    judges: [/^playbook\.submit$/],
    replayedActions: [/^task\.plan$/],
    justified: PLAYBOOK_JUSTIFIED,
    validate: (claim, files, progress) => validatePlaybook(claim, files, progress),
    local: (context) => [submitCapability(context)],
    guard: guardPlaybook,
    state: stateOfTopic,
    key: (progress) => stateOf(progress).submissions.map((s) => (s.ok ? "ok" : "refused")).join(","),
    intention: intentionOf,
    prompt: PLAYBOOK_FORMAT.prompt,
    words: { words: PLAYBOOK_WORDS, keys: PLAYBOOK_WORD_KEYS },
    brief: briefOf,
    // No graph is built here: the shelf's reference graphs are not read for nothing.
    shelf: false,
    // A playbook is a document: its output is named, not a quantity.
    quantities: false,
};
