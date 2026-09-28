/**
 * The `procedure` topic: write a proposal that a guard checks and that
 * others run later, and hand it over unrun (docs/mise-en-service.fr.md,
 * sections 8 and 15 to 17, for the station's test procedures).
 *
 * Since 2026-09-28 the topic holds no domain (zero domain in the harness):
 * what a proposal looks like, where its constants, its place, its device and
 * its watch are, what the state carries and from which reads, who is told of
 * every check and what the scorecard records are the spec's
 * (`specs/procedure/format.json`); every sentence it says to the model is a
 * template of `specs/procedure/words.json`; its prompt is
 * `specs/procedure/prompt.md`; its guard's rules are a signed library
 * document's (`check.ts`). What is left here is the mechanism: stages read
 * from the task's progress, a draft kept for a revision, the guard's call,
 * the accepted file written, the validator.
 *
 * Its tools are the spec's reads and two capabilities of its own,
 * `procedure.submit` and `procedure.revise`, the only way a proposal reaches
 * the workshop: `workspace.write` is not a tool of this topic, so no file
 * exists that the guard did not read first.
 *
 * The guard runs on every submission, before anything is written, with the
 * presence the task read (or nothing, when the builder did not read it). A
 * refused submission comes back to the builder with its reasons, and the
 * spec's `notify` is told either way (the station, whose Mother says the
 * proposal, then the refusal or the correction).
 *
 * What the topic records for the scorecard (section 8.1, question A), in
 * `scorecard.json` next to the proposal: whether the spec's `readBefore`
 * was read before the first submission, and whether its `asked` was set of
 * itself (first submission), after a refusal, or was not needed.
 *
 * The validator says the contract is held when the claimed proposal is the
 * very file the guard accepted (same sha256).
 *
 * The topic runs on the reasoning state (`reasoning-state.ts`): its part of
 * the state carries the reads whole where the model needs them whole (as the
 * spec's views shape them), the method card, the submissions with their
 * reasons, and the draft kept whole. The guard writes only a refusal to the
 * state: an accepted submission is recorded by the capability itself, after
 * the runtime checked the world did not move.
 */
import { withBase } from "../../core/base.js";
import type { CapabilityResult, Intention, JsonValue } from "@spiky-panda/harness";
import type { LocalCapability } from "../../core/capabilities.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicState } from "../../core/reasoning-state.js";
import type { TopicContext, TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { readFileSync } from "node:fs";
import { fromRoot } from "../../../lib/paths.js";
import { checkProcedure, constantsOf, envelopeOf, FORMAT, problemLines, rulesAndFacts, safetyOf, type MeasuredStart, type PresenceRead, type ProcedureCheck } from "./check.js";
import { checkJustifications, JUSTIFICATIONS_SCHEMA, justificationProblems as commonJustificationProblems, type Justified, type ReadSources } from "../../core/justify.js";
import { leavesOf, matches, valueAt, type RulesDocument } from "../../core/rules.js";
import { loadWords, say, viewOf } from "../../core/words.js";
import { physics } from "../../core/physics.js";
export { constantsOf } from "./check.js";

/** A proposal as the topic handles it: whatever the format's schema describes; the topic reads it only by the format's paths. */
export type ProcedureLike = { [key: string]: unknown; id?: unknown; justifications?: Array<Record<string, unknown>> };

/** What the factory says to its model: the spec's words. */
export const WORDS = loadWords(FORMAT.words);
const w = (key: string, vars?: Record<string, string | number>): string => say(WORDS, key, vars);

/** The words the topic asks for: the conformance test checks the file holds them all. */
export const PROCEDURE_WORD_KEYS = [
    "intention", "intentionDevice", "requirements.missing", ...FORMAT.requirements.map((r) => `requirements.${r}Read`), "requirements.methodRead",
    ...FORMAT.requirements.map((r) => `openQuestions.${r}`), "openQuestions.method",
    "brief.handOver", "brief.situation", "brief.method", "brief.methodListed", "brief.methodFind", "brief.methodNotACard", "brief.plan", "brief.planOutput", "brief.planUnit",
    "brief.procedure", "brief.presenceRead", "brief.presenceUnread", "brief.measured", "brief.measuredSource", "brief.refused", "brief.refusedKept", "brief.refusedWhole",
    "draft.none", "draft.noneAtExecution", "draft.kept", "capabilities.submit", "capabilities.revise", "capabilities.reviseChanges", "guard.refused", "guard.id", "guard.quantity",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The format's reads, the base's, and the topic's own two capabilities. */
export const PROCEDURE_TOOLS: ReadonlyArray<RegExp> = withBase([...FORMAT.tools.map((t) => new RegExp(`^${escape(t)}$`)), /^procedure\.(submit|revise)$/]);

/** The proposal's schema, the spec's (FORMAT.schema), with the socle's justifications and what the executor can read to stop a test. */
export const PROCEDURE_SCHEMA: Record<string, unknown> = (() => {
    const schema = JSON.parse(readFileSync(fromRoot(...FORMAT.schema.split("/")), "utf8")) as { properties: Record<string, any> };
    const readers = FORMAT.readers ?? {};
    const abort = schema.properties.abort;
    if (abort?.items?.properties?.id) abort.items.properties.id.enum = Object.keys(readers);
    if (abort) abort.description = `${String(abort.description ?? "")} What the executor reads, by id: ${Object.entries(readers).map(([id, what]) => `${id} (${what})`).join("; ")}.`;
    schema.properties.justifications = JUSTIFICATIONS_SCHEMA;
    return schema;
})();

/** The minutes a proposal lasts, by the format's path to its steps' durations. */
export const minutesOf = (p: unknown): number => leavesOf(p, FORMAT.keys).filter((l) => matches(l.path, FORMAT.minutes)).reduce((sum, l) => sum + (typeof l.value === "number" ? l.value : 0), 0);
const stepsOf = (p: unknown): unknown[] => {
    const steps = valueAt(p, FORMAT.steps ?? "steps", FORMAT.keys);
    return Array.isArray(steps) ? steps : [];
};
const text = (p: unknown, at: string): string => {
    const v = valueAt(p, at, FORMAT.keys);
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
};
const fileOf = (p: unknown): string => FORMAT.file.replace("{id}", text(p, FORMAT.id));

export const PROCEDURE_PROMPT = FORMAT.prompt;

/** One submission as the guard judged it. */
export interface Submission {
    n: number;
    procedureId: string;
    ok: boolean;
    kinds: string[];
    problems: string[];
    /** Was the scorecard's `readBefore` read before this submission. */
    readBefore: boolean;
    /** Did this submission set the scorecard's `asked`. */
    asked: boolean;
    at: string;
}

interface ProcedureTopicState {
    submissions: Submission[];
    /**
     * The last proposal checked, whole, kept for a few minutes (2026-09-28): a refusal is corrected by sending only what
     * changes (procedure.revise), not the whole proposal again (three thousand tokens and thirty seconds each time).
     * Erased once one is accepted; an expired draft is a whole proposal to submit again.
     */
    draft?: { procedure: ProcedureLike; at: number } | null;
    accepted: { path: string; sha256: string; procedureId: string } | null;
    /** The method card the builder read, once it has read one the library listed. */
    method?: string;
    /** The card whole, as read: the state carries it, the model reads it once. */
    methodCard?: string;
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** How long the last proposal checked stays cached for a revision: five minutes, or PROCEDURE_DRAFT_TTL_SECONDS. */
export const draftTtlMs = (): number => Number(process.env.PROCEDURE_DRAFT_TTL_SECONDS ?? 300) * 1000;
const draftMinutes = (): number => Math.round(draftTtlMs() / 60000);

/**
 * The cached draft while it is fresh; an expired one is dropped. A whole proposal the schema refused, before the topic
 * could check it, is a draft too (2026-09-28: a threshold written as text, and the revision that followed found nothing).
 */
export function draftOf(progress: Progress, now = Date.now()): ProcedureLike | null {
    const state = stateOf(progress);
    if (state.accepted) return null;
    const refused = progress.refusals["procedure.submit"];
    const fromSchema = refused && isObject(refused.input) && (!state.draft || Date.parse(refused.at) > state.draft.at) ? { procedure: refused.input as unknown as ProcedureLike, at: Date.parse(refused.at) } : null;
    const draft = fromSchema ?? state.draft ?? null;
    if (!draft || now - draft.at > draftTtlMs()) {
        state.draft = null;
        return null;
    }
    return draft.procedure;
}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * A revision applied to the cached draft: an object merges key by key, a list or a value replaces what it names, a null
 * removes it; the justifications merge by constant (those sent replace theirs, the others stay).
 */
export function reviseDraft(draft: ProcedureLike, changes: unknown, justifications: unknown): ProcedureLike {
    const merge = (base: unknown, patch: unknown): unknown => {
        if (!isObject(base) || !isObject(patch)) return patch;
        const out: Record<string, unknown> = { ...base };
        for (const [k, v] of Object.entries(patch)) {
            if (v === null) delete out[k];
            else out[k] = merge(base[k], v);
        }
        return out;
    };
    const { justifications: inChanges, ...rest } = isObject(changes) ? changes : {};
    const merged = merge(draft, rest) as ProcedureLike;
    const sent = [...(Array.isArray(inChanges) ? inChanges : []), ...(Array.isArray(justifications) ? justifications : [])].filter(isObject);
    const kept = (Array.isArray(draft.justifications) ? draft.justifications : []).filter((j) => !sent.some((x) => x.constant === j.constant));
    return { ...merged, justifications: [...kept, ...sent] };
}

/** The schema of a revision: the fields that change, and the justifications of the constants that change. */
const REVISE_SCHEMA = {
    type: "object",
    properties: {
        changes: { type: "object", description: w("capabilities.reviseChanges") },
        justifications: JUSTIFICATIONS_SCHEMA,
    },
    required: ["changes"],
} as const;

/** The topic's record in the task's progress, created on first use. */
function stateOf(progress: Progress): ProcedureTopicState {
    const current = progress.topic.procedure as unknown as ProcedureTopicState | undefined;
    if (current) return current;
    const fresh: ProcedureTopicState = { submissions: [], accepted: null };
    progress.topic.procedure = fresh as unknown as JsonValue;
    return fresh;
}

/** A read of this task, by the name the spec gives it. */
const readOf = (progress: Progress, name: string) => progress.reads[FORMAT.reads[name] ?? name];

/** The method cards the library listed for the missing quantity, by id. */
function methodsListed(progress: Progress): string[] {
    const listed = (readOf(progress, "methods")?.value as { methods?: Array<{ id?: string }> } | undefined)?.methods;
    return Array.isArray(listed) ? listed.map((m) => String(m.id ?? "")).filter(Boolean) : [];
}

/** The method card the builder read, noted once: the last card read that the library listed, its text kept whole. */
function noteMethod(progress: Progress): ProcedureTopicState {
    const state = stateOf(progress);
    const lastRead = readOf(progress, "card")?.value as { id?: string; text?: string } | undefined;
    if (!state.method && typeof lastRead?.id === "string" && methodsListed(progress).includes(lastRead.id)) {
        state.method = lastRead.id;
        if (typeof lastRead.text === "string") state.methodCard = lastRead.text;
    }
    return state;
}

/** What the task measured when it was opened, where the format says its observations give it (the scenario reads it from the sensor). */
export function measuredOf(task: TaskFile["task"]): MeasuredStart | null {
    const m = (task.observations as Record<string, unknown> | undefined)?.[FORMAT.measured];
    return isObject(m) && Object.values(m).some((v) => typeof v === "number") ? (m as MeasuredStart) : null;
}

/** The non-safety constants' problems, by the rule every factory shares (`justify.ts`): each justified by a source this task can cite (2026-09-28: a maximum of 1200 ppm and an abort at 1500 came from a baseline of 400 ppm nobody gave). */
export function justificationProblems(p: { justifications?: unknown }, read: ReadSources, measured: MeasuredStart | null, rules: RulesDocument | null = null, envelope: Record<string, unknown> = {}): string[] {
    const isSafety = safetyOf(rules);
    return commonJustificationProblems(constantsOf(p).filter((x) => !isSafety(x.constant)), Array.isArray(p.justifications) ? p.justifications : [], read, { measured: measured !== null, envelope });
}

/**
 * Where a proposal's constants are, as the format declares them. Which are safety constants, and the envelope a
 * justification may cite, are the signed rules' (read by the guard at each check, `justifiedBy`): nothing here says it.
 */
export const PROCEDURE_JUSTIFIED: Justified = {
    capability: /^procedure\.(submit|revise)$/,
    constants: (input) => constantsOf(input ?? {}),
    measured: (task) => measuredOf(task) !== null,
    // The topic's guard reports them with its other checks.
    inTopicGuard: true,
    // A revision stands for the whole draft it was applied to (kept by the guard on its refusal).
    whole: (capabilityId, input, progress) => (capabilityId === "procedure.revise" ? ((draftOf(progress) as unknown as JsonValue) ?? null) : input),
};

/** The declaration with what the signed rules say: their safety constants, and the facts they cite as the envelope. */
export const justifiedBy = (rules: RulesDocument | null, envelope: Record<string, number>): Justified => ({ ...PROCEDURE_JUSTIFIED, safety: safetyOf(rules), envelope });

/** Who is where, as the format's presence read answered in this task, if it was called. */
export function presenceOf(progress: Progress): PresenceRead | null {
    const read = readOf(progress, "presence");
    const modules = (read?.value as { modules?: PresenceRead["modules"] } | null)?.modules;
    return read && Array.isArray(modules) ? { modules, at: read.at } : null;
}

/** The scorecard (question A): was the spec's `readBefore` read before the first submission, and was its `asked` set of itself. */
export function scorecardOf(progress: Progress): Record<string, JsonValue> {
    const card = FORMAT.scorecard;
    const { submissions } = stateOf(progress);
    const first = submissions[0];
    const readKey = `${card?.readBefore ?? "read"}ReadBeforeFirstSubmission`;
    const askedKey = card?.asked.name ?? "asked";
    if (!first) return { [readKey]: null, [askedKey]: null, submissions: 0, refusedFor: [] };
    const kind = card?.asked.kind ?? "";
    const needed = submissions.some((s) => s.kinds.includes(kind)) || submissions.some((s) => s.asked);
    const asked = !needed ? "not-needed" : first.asked && !first.kinds.includes(kind) ? "unprompted" : submissions.some((s) => s.ok && s.asked) ? "after-refusal" : "never";
    return { [readKey]: first.readBefore, [askedKey]: asked, submissions: submissions.length, refusedFor: [...new Set(submissions.flatMap((s) => s.kinds))] };
}

/** The spec's `notify` is told of every submission; one that does not answer does not stop the builder, the progress says it. */
async function notify(context: TopicContext, procedure: ProcedureLike, check: ProcedureCheck, n: number): Promise<void> {
    if (!FORMAT.notify) return;
    // The proposal whole: what is said of it is the listener's to read, not this topic's.
    const r = await context.broker.call(FORMAT.notify.slot, FORMAT.notify.tool, {
        taskId: context.taskId,
        attempt: n,
        procedureId: text(procedure, FORMAT.id),
        device: text(procedure, FORMAT.device),
        volume: text(procedure, FORMAT.place),
        method: text(procedure, FORMAT.method),
        steps: stepsOf(procedure).length,
        minutes: minutesOf(procedure),
        procedure: procedure as unknown as JsonValue,
        module: check.module,
        occupants: check.occupants.map((o) => o.callsign ?? o.id),
        ok: check.ok,
        problems: check.problems,
    });
    if (!r.ok) context.progress.topic.notifyFailed = `${FORMAT.notify.slot}.${FORMAT.notify.tool}: ${r.error ?? r.outcome}`;
}

/** An accepted proposal, written: the file, the listener told, the submission recorded, the draft erased. */
async function writeAccepted(context: TopicContext, procedure: ProcedureLike): Promise<CapabilityResult> {
    const { broker, taskId, progress } = context;
    const path = fileOf(procedure);
    const w = await broker.call("workspace", "write", { taskId, path, text: JSON.stringify(procedure, null, 2) + "\n" });
    if (!w.ok) return { ok: false, error: w.error ?? `could not write ${path}`, output: { outcome: w.outcome } };
    const sha256 = (w.output as { sha256: string }).sha256;
    const state = stateOf(progress);
    // The guard checked and accepted; recorded here, once the runtime has executed the decision, so the state the model read did not move under it.
    const presence = presenceOf(progress);
    const { rules, facts } = await rulesAndFacts((slot, tool, args) => broker.call(slot, tool, args));
    const check = checkProcedure(procedure, presence, rules, facts, measuredOf(context.task));
    state.submissions.push(submissionOf(state, procedure, check, progress));
    await notify(context, procedure, check, state.submissions.length);
    state.accepted = { path, sha256, procedureId: text(procedure, FORMAT.id) };
    // Accepted: the draft has served.
    state.draft = null;
    await broker.call("workspace", "write", { taskId, path: "scorecard.json", text: JSON.stringify(scorecardOf(progress), null, 2) + "\n" });
    return { ok: true, output: { outcome: "completed", value: { accepted: true, path, sha256, steps: stepsOf(procedure).length, minutes: minutesOf(procedure) } } };
}

function submitCapability(context: TopicContext): LocalCapability {
    return {
        id: "procedure.submit",
        description: w("capabilities.submit", { file: FORMAT.file.replace("{id}", "<id>") }),
        inputSchema: PROCEDURE_SCHEMA as unknown as JsonValue,
        execute: (input: JsonValue) => writeAccepted(context, input as unknown as ProcedureLike),
    };
}

function reviseCapability(context: TopicContext): LocalCapability {
    return {
        id: "procedure.revise",
        description: w("capabilities.revise"),
        inputSchema: REVISE_SCHEMA as unknown as JsonValue,
        async execute(input: JsonValue): Promise<CapabilityResult> {
            // The guard applied this revision to the draft and checked the whole; the same whole is written.
            const draft = draftOf(context.progress);
            if (!draft) return { ok: false, error: w("draft.noneAtExecution"), output: { outcome: "refused" } };
            const r = (input ?? {}) as { changes?: unknown; justifications?: unknown };
            return writeAccepted(context, reviseDraft(draft, r.changes, r.justifications));
        },
    };
}

function submissionOf(state: ProcedureTopicState, procedure: ProcedureLike, check: ProcedureCheck, progress: Progress): Submission {
    const asked = FORMAT.scorecard ? valueAt(procedure, FORMAT.scorecard.asked.path, FORMAT.keys) : undefined;
    return {
        n: state.submissions.length + 1,
        procedureId: text(procedure, FORMAT.id),
        ok: check.ok,
        kinds: [...new Set(check.problems.map((p) => p.kind))],
        problems: problemLines(check),
        readBefore: FORMAT.scorecard ? readOf(progress, FORMAT.scorecard.readBefore) !== undefined : false,
        asked: Array.isArray(asked) ? asked.length > 0 : asked !== undefined && asked !== null,
        at: new Date().toISOString(),
    };
}

/** The evidence the stages need, each true or false (`requirements` of the state): each of the spec's reads, the method card, the plan, the acceptance. */
export function requirementsOf(progress: Progress): Record<string, boolean> {
    const state = noteMethod(progress);
    return {
        ...Object.fromEntries(FORMAT.requirements.map((r) => [`${r}Read`, readOf(progress, r) !== undefined])),
        methodRead: Boolean(state.method),
        planDeclared: progress.plan !== null,
        procedureAccepted: state.accepted !== null,
    };
}

async function guardProcedure(capabilityId: string, input: JsonValue, context: TopicContext): Promise<string[]> {
    if (capabilityId === "task.plan") {
        const requirements = requirementsOf(context.progress);
        return FORMAT.planRequires
            .map((r) => `${r}Read`)
            .filter((k) => !requirements[k])
            .map((k) => w("requirements.missing", { requirement: k, how: w(`requirements.${k}`) }));
    }
    if (capabilityId !== "procedure.submit" && capabilityId !== "procedure.revise") return [];
    let procedure = (input ?? {}) as unknown as ProcedureLike;
    if (capabilityId === "procedure.revise") {
        const draft = draftOf(context.progress);
        if (!draft) return [w("draft.none", { minutes: draftMinutes() })];
        const r = (input ?? {}) as { changes?: unknown; justifications?: unknown };
        procedure = reviseDraft(draft, r.changes, r.justifications);
    }
    const presence = presenceOf(context.progress);
    const measured = measuredOf(context.task);
    // The rules and the envelope are the signed card's, read now: a rule changed or unsigned since the last check judges accordingly.
    const { rules, facts } = await rulesAndFacts((slot, tool, args) => context.broker.call(slot, tool, args));
    const check = checkProcedure(procedure, presence, rules, facts, measured);
    // Every constant justified so it can be challenged (2026-09-28): the safety ones by a fact of a signed library document they respect, the others by a source this task read.
    for (const message of await checkJustifications(justifiedBy(rules, envelopeOf(rules, facts)), procedure as unknown as JsonValue, context)) check.problems.push({ kind: "justification", message });
    if (check.problems.length) check.ok = false;
    const id = text(procedure, FORMAT.id);
    if (!ID.test(id)) {
        check.problems.push({ kind: "shape", message: w("guard.id", { id }) });
        check.ok = false;
    }
    // The quantities the proposal measures, in units the unit system knows for them (2026-09-25): a unit invented here would travel into the report.
    const quantities = valueAt(procedure, FORMAT.quantities, FORMAT.keys);
    for (const q of Array.isArray(quantities) ? (quantities as Array<Record<string, unknown>>) : []) {
        if (!q || typeof q !== "object") continue;
        const r = physics().resolveUnitRef({ unit: String(q.unit ?? ""), ...(q.quantity ? { quantity: String(q.quantity) } : {}) });
        if (!r.ok) {
            check.problems.push({ kind: "shape", message: w("guard.quantity", { name: String(q.name), reason: r.reason, code: r.code }) });
            check.ok = false;
        }
    }
    // An accepted submission is recorded by the capability, after execution; a refusal is recorded here, since nothing executes.
    // Nothing the observation reads is written for an accepted decision: a state that moved between the decision and its execution makes it stale.
    if (check.ok) return [];
    const state = stateOf(context.progress);
    // The whole proposal refused is the draft a revision applies to, for a few minutes, until one is accepted.
    state.draft = { procedure, at: Date.now() };
    state.submissions.push(submissionOf(state, procedure, check, context.progress));
    await notify(context, procedure, check, state.submissions.length);
    return [w("guard.refused", { problems: problemLines(check).join("; ") })];
}

const headOf = (v: unknown, n: number): JsonValue => {
    const text = JSON.stringify(v ?? null);
    return text.length <= n ? (v as JsonValue) : { head: `${text.slice(0, n)}...`, characters: text.length };
};

const outputsOf = (task: TaskFile["task"]): string => task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join("; ");
const quantitiesOf = (task: TaskFile["task"]): string => [...new Set(task.objective.required_outputs.map((o) => o.quantity))].join(", ");

/**
 * The topic's part of the reasoning state: each of the spec's reads as read (shaped by its view, whole where the rules
 * need it whole), the method card, the measurement, the submissions with their reasons and the draft kept whole, the
 * requirements of the stages. What is here is not read again.
 */
export function stateOfTopic(progress: Progress, task: TaskFile["task"]): TopicState {
    const state = noteMethod(progress);
    const measured = measuredOf(task);
    const presence = presenceOf(progress);
    const last = state.submissions.at(-1);
    const requirements = requirementsOf(progress);
    const openQuestions: string[] = [];
    for (const r of FORMAT.requirements) if (!requirements[`${r}Read`]) openQuestions.push(w(`openQuestions.${r}`));
    if (!state.method) openQuestions.push(w("openQuestions.method", { quantities: quantitiesOf(task) }));
    const reads: Record<string, JsonValue> = {};
    for (const [field, tool] of Object.entries(FORMAT.reads)) {
        if (field === "methods" || field === "card") continue;
        if (field === "presence") {
            reads.presence = presence ? (presence.modules as unknown as JsonValue) : null;
            continue;
        }
        const value = progress.reads[tool]?.value;
        reads[field] = value === undefined ? null : headOf(viewOf(value, FORMAT.views?.[field]), 2500);
    }
    return {
        hypothesis: {
            ...reads,
            method: state.method ? { id: state.method, card: state.methodCard ?? `(read it: ${FORMAT.reads.card})` } : null,
            // What the task measured when it opened: the test starts from it.
            measured: measured as unknown as JsonValue,
            accepted: state.accepted,
        } as JsonValue,
        // The last refused submission stays whole in the evaluation until one is accepted: the model corrects it, whatever it read in between.
        // The proposal shown is the draft kept whole, which a revision applies to; the refused input only when no draft is kept (a refusal before the topic's check: the schema).
        evaluation: (() => {
            const refused = progress.refusals["procedure.revise"] ?? progress.refusals["procedure.submit"];
            const draft = draftOf(progress);
            // Said without a countdown: a state that moves every second makes every decision stale.
            const kept = draft ? { procedure: draft as unknown as JsonValue, kept: w("draft.kept", { minutes: draftMinutes() }) } : refused ? { procedure: refused.input } : {};
            if (last) return { submission: last.n, procedureId: last.procedureId, ok: last.ok, problems: last.problems, ...(!last.ok ? kept : {}) } as JsonValue;
            return refused ? ({ submission: 0, ok: false, problems: [refused.reason], ...kept } as JsonValue) : null;
        })(),
        openQuestions,
        requirements,
    };
}

export function validateProcedure(claim: DoneClaim, files: WorkshopFile[], progress: Progress): Validation {
    const problems: string[] = [];
    const claimed = claim.artifacts.filter((a) => a.kind === "procedure");
    const { accepted } = stateOf(progress);
    if (!claimed.length) problems.push("no procedure among the claimed artifacts");
    if (!accepted) problems.push("no procedure was accepted by the guard in this task (procedure.submit)");
    for (const c of claimed) {
        const file = files.find((f) => f.path === c.path);
        if (!file) problems.push(`claimed procedure "${c.path}" is not a file of the workshop`);
        else if (accepted && (file.path !== accepted.path || file.sha256 !== accepted.sha256)) problems.push(`claimed procedure "${c.path}" is not the file the guard accepted (${accepted.path}, sha256 ${accepted.sha256.slice(0, 12)})`);
    }
    return { ok: problems.length === 0, problems };
}

/** The work, as the model is given it, in the spec's words: what to measure, and that the proposal is run by others after an authorisation. */
function intentionOf(task: TaskFile["task"], generic: Intention): Intention {
    const observed = (task.observations as Record<string, unknown> | undefined)?.[FORMAT.device];
    const device = typeof observed === "string" ? w("intentionDevice", { device: observed }) : "";
    return { ...generic, description: w("intention", { outputs: outputsOf(task), device }) };
}

/**
 * The harness's brief, stage by stage, from what the task has read and done: the situation, the method (found from
 * the quantity that is missing, in the library's method cards), the plan, the proposal, the hand-over. Every sentence
 * is the spec's; the stages are the mechanism's.
 */
export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    // Everything read here is written after a step completes (the runner's reads, the phase, the accepted file), never by the guard.
    const state = noteMethod(progress);
    if (state.accepted) return w("brief.handOver", { path: state.accepted.path });
    const requirements = requirementsOf(progress);
    if (FORMAT.planRequires.filter((r) => r !== "method").some((r) => !requirements[`${r}Read`])) return w("brief.situation");
    if (!state.method) {
        const listed = methodsListed(progress);
        const lastRead = readOf(progress, "card")?.value as { id?: string } | undefined;
        const chosen = listed.length ? w("brief.methodListed", { listed: listed.map((id) => `"${id}"`).join(" and ") }) : w("brief.methodFind");
        const notACard = typeof lastRead?.id === "string" && !listed.includes(lastRead.id) ? w("brief.methodNotACard", { id: lastRead.id }) : "";
        return w("brief.method", { quantities: quantitiesOf(task), chosen, notACard });
    }
    const names = task.objective.required_outputs.map((o) => w("brief.planOutput", { name: o.name, quantity: o.quantity, unit: o.unit ? w("brief.planUnit", { unit: o.unit }) : "" })).join("; ");
    if (progress.phase === "plan") return w("brief.plan", { method: state.method, names });
    // The refusal as the runner recorded it after the step, never the guard's own record: the guard writes while a decision
    // is checked, and an observation that moved between the decision and its execution makes the decision stale.
    const refusal = (progress.refusals["procedure.revise"] ?? progress.refusals["procedure.submit"])?.reason ?? null;
    const kept = draftOf(progress) !== null;
    const refused = refusal ? w("brief.refused", { reason: refusal, what: w(kept ? "brief.refusedKept" : "brief.refusedWhole") }) : "";
    const presence = presenceOf(progress) ? w("brief.presenceRead") : w("brief.presenceUnread");
    const measured = measuredOf(task);
    const values = measured ? Object.entries(measured).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k} ${Math.round((v as number) * 100) / 100}`) : [];
    const start = values.length ? w("brief.measured", { values: values.join(", "), source: typeof measured?.source === "string" ? w("brief.measuredSource", { source: measured.source }) : "" }) : "";
    return w("brief.procedure", { method: state.method, presence, start, refused });
}

export const PROCEDURE_TOPIC: TopicDefinition = {
    name: "procedure",
    tools: PROCEDURE_TOOLS,
    // A proposal is written from this task's device, presence, measurement and signed library: never copied from the memory of another task, nor the claim that names its file.
    neverReplayed: [/^procedure\.(submit|revise)$/, /^task\.done$/],
    justified: PROCEDURE_JUSTIFIED,
    // The plan says what is measured, from the task's required outputs; the guard checks it again.
    replayedActions: [/^task\.plan$/],
    validate: (claim, files, progress) => validateProcedure(claim, files, progress),
    local: (context) => [submitCapability(context), reviseCapability(context)],
    guard: guardProcedure,
    state: stateOfTopic,
    // The submissions tell the steps apart for the recipes: a step learned after a refusal does not replay after an acceptance.
    key: (progress) => stateOf(progress).submissions.map((s) => (s.ok ? "ok" : "refused")).join(","),
    intention: intentionOf,
    prompt: PROCEDURE_PROMPT,
    words: { words: WORDS, keys: PROCEDURE_WORD_KEYS },
    brief: briefOf,
};
