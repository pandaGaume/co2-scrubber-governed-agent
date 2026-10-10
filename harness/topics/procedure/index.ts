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
 * document's (`check.ts`); its stages and its conduct refusals are its
 * playbook's (`specs/procedure/playbook.json`, an executable graph run once
 * per step, `harness/core/conduct.ts`). What is left here is the mechanism:
 * the evidence the playbook reads and the views that fill its words, a draft
 * kept for a revision, the guard's call, the accepted file written, the
 * validator.
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
import { compileInputSchema, type CapabilityResult, type Intention, type JsonValue } from "@spiky-panda/harness";
import type { LocalCapability } from "../../core/capabilities.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicState } from "../../core/reasoning-state.js";
import type { TopicContext, TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot } from "../../../lib/paths.js";
import { checkProcedure, constantsOf, envelopeOf, FORMAT, problemLines, rulesAndFacts, safetyOf, type MeasuredStart, type PresenceRead, type ProcedureCheck } from "./check.js";
import { checkJustifications, JUSTIFICATIONS_SCHEMA, justificationProblems as commonJustificationProblems, leaveOut, recordedJustifications, type Justified, type ReadSources } from "../../core/justify.js";
import { addClaim, claimJustified, type JustifiedNumber } from "../../core/claims.js";
import { dependentsOf, factsBounding, leavesOf, matches, valueAt, type RulesDocument } from "../../core/rules.js";
import { loadWords, say, viewOf } from "../../core/words.js";
import { problemOf } from "../../core/problems.js";
import { coerce, FILE_ID_PATTERN, schemaError } from "../../core/interpreter.js";
import { physics } from "../../core/physics.js";
import { signatureOf } from "../../lib/signatures.js";
import { conductView, loadPlaybook, sayingText, type Evidence, stageToolsOf } from "../../core/conduct.js";
export { constantsOf } from "./check.js";

/** A proposal as the topic handles it: whatever the format's schema describes; the topic reads it only by the format's paths. */
export type ProcedureLike = { [key: string]: unknown; id?: unknown; justifications?: Array<Record<string, unknown>> };

/** What the factory says to its model: the spec's words. */
export const WORDS = loadWords(FORMAT.words);
const w = (key: string, vars?: Record<string, string | number>): string => say(WORDS, key, vars);

/** The words the topic asks for: the conformance test checks the file holds them all. */
export const PROCEDURE_WORD_KEYS = [
    "intention", "intentionDevice", "requirements.missing", ...FORMAT.requirements.map((r) => `requirements.${r}Read`), "requirements.methodRead", "requirements.methodListedRead",
    ...FORMAT.requirements.map((r) => `openQuestions.${r}`), "openQuestions.method",
    "brief.handOver", "brief.situation", "brief.method", "brief.methodListed", "brief.methodFind", "brief.methodNotACard", "brief.plan", "brief.planOutput", "brief.planUnit",
    "brief.procedure", "brief.safetyBounds", "brief.presenceRead", "brief.presenceUnread", "brief.measured", "brief.measuredSource", "brief.refused", "brief.refusedKept", "brief.refusedWhole",
    "intentionPrevious", "requirements.analysisAccepted", "brief.analysis", "brief.analysed", "analysis.first", "analysis.noPrevious", "analysis.cause", "analysis.path", "analysis.unchanged", "analysis.done", "capabilities.analyse",
    "draft.none", "draft.noneAtExecution", "draft.accepted", "draft.kept", "brief.planIsNorm", "doneWhen.plan", "doneWhen.accepted", "doneWhen.handedOver", "capabilities.submit", "capabilities.revise", "capabilities.reviseChanges", "guard.refused", "guard.id", "guard.quantity", "guard.quantityUnitAlone", "guard.quantityDeclared",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The format's reads, the base's, and the topic's own two capabilities. */
export const PROCEDURE_TOOLS: ReadonlyArray<RegExp> = withBase([...FORMAT.tools.map((t) => new RegExp(`^${escape(t)}$`)), /^procedure\.(submit|revise|analyse)$/]);

/** What stopped the last test of this work, as the task's observations carry it (the spec's `history`); null when none was aborted. */
export interface Previous {
    procedureId?: string | null;
    procedure?: ProcedureLike | null;
    aborted: { condition?: string | null; reason?: string | null; step?: number | null };
    minutesRun?: number;
    /** What the test ran, in short: its first and last rows of telemetry, the highest CO2 the volume reached (2026-09-30). */
    record?: { first?: Record<string, number>; last?: Record<string, number>; co2LabMaxPpm?: number; rows?: number } | null;
}
export function previousOf(task: TaskFile["task"]): Previous | null {
    const p = FORMAT.history ? (task.observations as Record<string, unknown> | undefined)?.[FORMAT.history] : undefined;
    return isObject(p) && isObject(p.aborted) ? (p as unknown as Previous) : null;
}

/** The analysis of a stopped test, as accepted. */
export interface Analysis {
    cause: string;
    evidence: string[];
    whyNotPrevented: string;
    changes: Array<{ path: string; change: string; prevents: string }>;
}

/** The analysis's schema, the spec's. */
const ANALYSIS_SCHEMA: Record<string, unknown> | null = FORMAT.analysis ? (JSON.parse(readFileSync(fromRoot(...FORMAT.analysis.schema.split("/")), "utf8")) as Record<string, unknown>) : null;

/** The words of a text worth matching: four letters or more, lower case. */
const wordsOf = (t: string): Set<string> => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 4));

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
     * changes (procedure.revise, its update), not the whole proposal again (three thousand tokens and thirty seconds each time).
     * Erased once one is accepted; an expired draft is a whole proposal to submit again.
     */
    draft?: { procedure: ProcedureLike; at: number } | null;
    accepted: { path: string; sha256: string; procedureId: string } | null;
    /** The analysis of the aborted test this task follows, once accepted (2026-09-29): the new proposal must make its changes. */
    analysis?: Analysis | null;
    /** The method card the builder read, once it has read one the library listed. */
    method?: string;
    /** The card whole, as read: the state carries it, the model reads it once. */
    methodCard?: string;
    /** Who signed that card, when its signature held as it was read (2026-10-09): a signed method card is a signed norm, the plan the test rests on. */
    methodSigned?: { by: string; at: string } | null;
}

// The schema's own form of an id (core/interpreter.ts): an id written another way is read into it before the guard; this check stays behind it.
const ID = new RegExp(FILE_ID_PATTERN);

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
export function reviseDraft(draft: ProcedureLike, update: unknown, justifications: unknown): ProcedureLike {
    return revised(draft, update, justifications).procedure;
}

/** The revision applied to the draft, read toward the schema, with what that reading changed. */
export function revised(draft: ProcedureLike, update: unknown, justifications: unknown): { procedure: ProcedureLike; changes: string[] } {
    const merge = (base: unknown, patch: unknown): unknown => {
        if (!isObject(base) || !isObject(patch)) return patch;
        const out: Record<string, unknown> = { ...base };
        for (const [k, v] of Object.entries(patch)) {
            if (v === null) delete out[k];
            else out[k] = merge(base[k], v);
        }
        return out;
    };
    const { justifications: inUpdate, ...rest } = isObject(update) ? update : {};
    const merged = merge(draft, rest) as ProcedureLike;
    // A revision whose form passes but does not mean what it says (a path as a key, a value with its justification) is read by
    // its meaning when the guard refuses the same points again (core/interpreter.ts, the second trigger), not by rules written here.
    const sent = [...(Array.isArray(inUpdate) ? inUpdate : []), ...(Array.isArray(justifications) ? justifications : [])].filter(isObject);
    const kept = (Array.isArray(draft.justifications) ? draft.justifications : []).filter((j) => !sent.some((x) => x.constant === j.constant));
    return readWhole({ ...merged, justifications: [...kept, ...sent] });
}

/**
 * The revised whole read toward procedure.submit's schema (core/interpreter.ts): `update` is a part of the procedure, so the interpreter's reading of
 * the call cannot reach its values; the whole is read here, the same way in the guard and at execution. Only the schema-guided
 * reductions (an object carrying one id where an id is expected...); a whole that still does not fit is left to the guard.
 */
export function readWhole(procedure: ProcedureLike): { procedure: ProcedureLike; changes: string[] } {
    if (!schemaError(PROCEDURE_SCHEMA as unknown as JsonValue, procedure)) return { procedure, changes: [] };
    const changes: string[] = [];
    const read = coerce(PROCEDURE_SCHEMA, procedure, "", changes) as ProcedureLike;
    return changes.length && !schemaError(PROCEDURE_SCHEMA as unknown as JsonValue, read) ? { procedure: read, changes } : { procedure, changes: [] };
}

/** The revised procedure checked against the submitted one's schema: null when it fits, else what does not, with what was sent there. */
let validateWhole: ((input: unknown) => void) | null = null;
export function shapeProblems(procedure: ProcedureLike): string | null {
    validateWhole ??= compileInputSchema(PROCEDURE_SCHEMA as unknown as JsonValue) as (input: unknown) => void;
    try {
        validateWhole(procedure);
        return null;
    } catch (e) {
        const text = (e instanceof Error ? e.message : String(e)).replace(/^Invalid capability arguments:\s*/, "");
        const points = text.split(/,\s*(?=data)/).map((m) => {
            const at = /^data((?:\/[^\s]*)?)\s/.exec(m)?.[1] ?? "";
            const keys = at.split("/").filter(Boolean);
            const sent = keys.reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined), procedure);
            return w("guard.shape", { path: keys.join(".") || "the procedure", says: m.replace(/^data(?:\/[^\s]*)?\s/, ""), sent: JSON.stringify(sent ?? null).slice(0, 160) });
        });
        return points.join("; ");
    }
}

/**
 * What a revision may change: a partial procedure, the same fields as procedure.submit's, none required, nothing else (2026-10-08).
 * Its name is `update` since 2026-10-10: it was `changes`, the name procedure.analyse gives its list of {path, change, prevents},
 * and Nano wrote a revision in the analysis's form (run xykl), its justifications lost on the way to the call.
 * `changes` was a free object: every model filled the gap its own way (Nemotron Nano and Super wrote `"limits.co2MaxPpm":
 * {"value": 3100}`), the schema passed it, the merge added a root key, the limit stayed, STUCK. The harness does not take the last
 * model's convention: it states one form, strictly, so a server that decodes against the schema cannot write another, and a
 * call in another form fails the schema and goes to the interpreter (core/interpreter.ts), which reads it back to this form.
 * An object's fields change alone (none of them required); a list is replaced whole, so its items keep their schema.
 */
function partialOf(schema: Record<string, unknown>): Record<string, unknown> {
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    const partial = (p: Record<string, unknown>): Record<string, unknown> => {
        if (p.type !== "object" || !p.properties) return p;
        const { required: _required, ...rest } = p;
        return { ...rest, additionalProperties: false };
    };
    return { type: "object", properties: Object.fromEntries(Object.entries(properties).filter(([k]) => k !== "justifications").map(([k, p]) => [k, partial(p)])), additionalProperties: false };
}

const REVISE_SCHEMA = {
    type: "object",
    properties: {
        update: { ...partialOf(PROCEDURE_SCHEMA), description: w("capabilities.reviseChanges") },
        justifications: JUSTIFICATIONS_SCHEMA,
    },
    required: ["update"],
    additionalProperties: false,
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

/**
 * What the register declares for the device property a quantity of the procedure is named after (2026-09-30): read in the
 * installation this task read, a property whose name is a word of the quantity's name ("scrubber_speed_command": speed).
 */
export function declaredQuantity(progress: Progress, name: string): { device: string; property: string; quantity: string; unit: string } | null {
    const words = new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const devices = ((readOf(progress, "installation")?.value as { devices?: Array<{ path?: string; measures?: Array<{ property?: string; quantity?: string; unit?: string }> }> } | undefined)?.devices ?? []) as Array<{ path?: string; measures?: Array<{ property?: string; quantity?: string; unit?: string }> }>;
    for (const d of devices)
        for (const m of d.measures ?? [])
            if (m.property && words.has(m.property.toLowerCase()) && m.quantity && m.unit) return { device: String(d.path ?? "the device"), property: m.property, quantity: m.quantity, unit: m.unit };
    return null;
}

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
        const signature = (lastRead as { signature?: { by?: unknown; at?: unknown; valid?: unknown } | null }).signature;
        state.methodSigned = signature?.valid === true ? { by: String(signature.by ?? ""), at: String(signature.at ?? "") } : null;
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
/**
 * What an episode keeps of a submission or a revision (2026-09-29, the memory audit, `episodes.ts`): each constant by its path,
 * its value (read in the procedure sent, or in a revision's update, `changes` before 2026-10-10) and the source and reference of
 * its justification when it has one; the rest of a procedure is its draft's, not what an attempt is refused or accepted on. A
 * justification written before 2026-10-10 carried its value, read when the procedure does not give it.
 */
export function procedureDigest(input: JsonValue): Record<string, JsonValue> {
    const out: Record<string, JsonValue> = {};
    const flat = (v: unknown, at: string): void => {
        if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, x] of Object.entries(v as Record<string, unknown>)) flat(x, at ? `${at}.${k}` : k);
        else if (at) out[at] = { value: v as JsonValue };
    };
    const i = isObject(input) ? input : {};
    const given = (Array.isArray(i.justifications) ? (i.justifications as unknown[]) : []).filter((j): j is Record<string, JsonValue> => isObject(j));
    // Written before 2026-10-10, a justification carried its value: the digest is what it was (the episodes of before keep their contrasts).
    const before = given.some((j) => "value" in j);
    const update = isObject(i.update) ? i.update : i.changes;
    if (isObject(update)) flat(update, "");
    else if (!before) for (const c of constantsOf(i)) out[c.constant] = { value: c.value };
    for (const j of given)
        if (typeof j.constant === "string") {
            const held = isObject(out[j.constant]) ? (out[j.constant] as Record<string, JsonValue>) : {};
            out[j.constant] = { value: (j.value ?? held.value ?? null) as JsonValue, source: (j.source ?? null) as JsonValue, reference: (j.reference ?? null) as JsonValue };
        }
    return out;
}

export const justifiedBy =(rules: RulesDocument | null, envelope: Record<string, number>): Justified => ({ ...PROCEDURE_JUSTIFIED, safety: safetyOf(rules), envelope, boundBy: (constant) => factsBounding(rules, constant) });

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
async function writeAccepted(context: TopicContext, sent: ProcedureLike): Promise<CapabilityResult> {
    const { broker, taskId, progress } = context;
    const { rules, facts } = await rulesAndFacts((slot, tool, args) => broker.call(slot, tool, args));
    // The justifications the procedure is written with (2026-10-10): the model's for the numbers it chose, each with the value read at
    // its path, and the harness's for the safety constants, from the facts of signed documents the rules bound them by.
    const procedure = { ...sent, justifications: recordedJustifications(justifiedBy(rules, envelopeOf(rules, facts)), sent as unknown as JsonValue, facts) } as unknown as ProcedureLike;
    const path = fileOf(procedure);
    const w = await broker.call("workspace", "write", { taskId, path, text: JSON.stringify(procedure, null, 2) + "\n" });
    if (!w.ok) return { ok: false, error: w.error ?? `could not write ${path}`, output: { outcome: w.outcome } };
    const sha256 = (w.output as { sha256: string }).sha256;
    const state = stateOf(progress);
    // The guard checked and accepted; recorded here, once the runtime has executed the decision, so the state the model read did not move under it.
    const presence = presenceOf(progress);
    const check = checkProcedure(procedure, presence, rules, facts, measuredOf(context.task));
    state.submissions.push(submissionOf(state, procedure, check, progress));
    // Into the registry: who was read in the module under test, and every number of the procedure by its justification.
    if (presence) addClaim(progress.claims, { subject: `who is in ${check.module}`, text: check.occupants.map((o) => o.callsign ?? o.id).join(", ") || "nobody", status: "OBSERVED", source: { kind: "measurement", ref: "biomed.presence", step: progress.iteration }, by: "harness" });
    claimJustified(progress.claims, (procedure as unknown as { justifications: JustifiedNumber[] }).justifications, "procedure", progress.iteration);
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
            const done = stateOf(context.progress).accepted;
            if (done) return { ok: false, error: w("draft.accepted", { path: done.path }), output: { outcome: "refused" } };
            if (!draft) return { ok: false, error: w("draft.noneAtExecution"), output: { outcome: "refused" } };
            const r = (input ?? {}) as { update?: unknown; justifications?: unknown };
            const whole = revised(draft, r.update, r.justifications);
            const result = await writeAccepted(context, whole.procedure);
            // How the revision was read toward the schema, said with the result (core/interpreter.ts): the model learns the form from it.
            const asSent = whole.changes;
            if (asSent.length && result.output && typeof result.output === "object" && !Array.isArray(result.output)) {
                (result.output as Record<string, JsonValue>).readAs = `the revision did not have the shape procedure.submit's schema gives; it was read as ${asSent.join("; ")}; use that shape next time`;
            }
            return result;
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
export function requirementsOf(progress: Progress, task?: TaskFile["task"]): Record<string, boolean> {
    const state = noteMethod(progress);
    return {
        ...Object.fromEntries(FORMAT.requirements.map((r) => [`${r}Read`, readOf(progress, r) !== undefined])),
        methodRead: Boolean(state.method),
        // The method card read is a norm a person signed: the plan the procedure may follow and cite, instead of declaring one.
        signedNorm: Boolean(state.method && state.methodSigned),
        planDeclared: progress.plan !== null,
        // A task that follows an aborted test analyses it before any proposal.
        ...(task && previousOf(task) ? { analysisAccepted: Boolean(state.analysis) } : {}),
        procedureAccepted: state.accepted !== null,
    };
}

/**
 * The analysis's own checks (2026-09-29, recovery after an abort): a test that follows a stopped one says first why it
 * stopped, tied to what stopped it (the cause shares its words with the abort's condition or reason), with the evidence,
 * why the last proposal did not prevent it, and changes that are fields of the proposal. Returns its problems.
 */
function analysisProblems(input: unknown, previous: Previous | null): string[] {
    if (!previous) return [w("analysis.noPrevious")];
    const a = (input ?? {}) as Partial<Analysis>;
    const problems: string[] = [];
    const reason = [previous.aborted.condition, previous.aborted.reason].filter(Boolean).join(": ");
    const expected = [...wordsOf(reason)];
    const said = wordsOf(`${a.cause ?? ""} ${(a.evidence ?? []).join(" ")}`);
    if (expected.length && !expected.some((x) => said.has(x))) problems.push(w("analysis.cause", { expected: expected.slice(0, 8).join(", "), reason }));
    const fields = Object.keys(((PROCEDURE_SCHEMA as { properties?: Record<string, unknown> }).properties ?? {}) as Record<string, unknown>).filter((f) => f !== "justifications");
    (a.changes ?? []).forEach((c, i) => {
        if (!fields.includes(String(c?.path ?? "").split(".")[0])) problems.push(w("analysis.path", { n: i + 1, path: String(c?.path ?? ""), fields: fields.join(", ") }));
    });
    return problems;
}

/** The changes the accepted analysis names that the new proposal does not make, compared with the aborted one. */
function unchangedOf(procedure: ProcedureLike, analysis: Analysis | null | undefined, previous: Previous | null): string[] {
    if (!analysis || !previous?.procedure) return [];
    const same = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
    return analysis.changes
        .filter((c) => same(valueAt(procedure, c.path, FORMAT.keys), valueAt(previous.procedure, c.path, FORMAT.keys)))
        .map((c) => w("analysis.unchanged", { path: c.path, change: c.change, value: JSON.stringify(valueAt(procedure, c.path, FORMAT.keys) ?? null) }));
}

function analyseCapability(context: TopicContext): LocalCapability {
    return {
        id: "procedure.analyse",
        description: w("capabilities.analyse"),
        inputSchema: (ANALYSIS_SCHEMA ?? { type: "object" }) as unknown as JsonValue,
        async execute(input: JsonValue): Promise<CapabilityResult> {
            const state = stateOf(context.progress);
            state.analysis = input as unknown as Analysis;
            const file = FORMAT.analysis?.file ?? "analysis.json";
            await context.broker.call("workspace", "write", { taskId: context.taskId, path: file, text: JSON.stringify({ previous: previousOf(context.task), analysis: input }, null, 2) + "\n" });
            return { ok: true, output: { outcome: "completed", value: { accepted: true, file, next: w("analysis.done", { file }) } } };
        },
    };
}

async function guardProcedure(capabilityId: string, input: JsonValue, context: TopicContext): Promise<string[]> {
    // The conduct refusals are the playbook's (a plan without its reads, a procedure before the analysis of an aborted
    // test, a procedure after one was accepted); what follows is the checking of what was sent.
    const refused = conductRefusals(capabilityId, context.progress, context.task);
    if (refused.length || capabilityId === "task.plan") return refused;
    if (capabilityId === "procedure.analyse") return analysisProblems(input, previousOf(context.task));
    if (capabilityId !== "procedure.submit" && capabilityId !== "procedure.revise") return [];
    let procedure = (input ?? {}) as unknown as ProcedureLike;
    const previous = previousOf(context.task);
    if (capabilityId === "procedure.revise") {
        const draft = draftOf(context.progress);
        if (!draft) return [w("draft.none", { minutes: draftMinutes() })];
        const r = (input ?? {}) as { update?: unknown; justifications?: unknown };
        procedure = reviseDraft(draft, r.update, r.justifications);
        // The revised whole has the shape procedure.submit's schema gives it: `update` is a part of it, its values are checked whole (2026-10-08, Nemotron:
        // monitoring.subjects revised as objects, which no schema refused and the rule then read as "[object Object]", five times).
        const shape = shapeProblems(procedure);
        if (shape) return [shape];
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
    for (const message of unchangedOf(procedure, stateOf(context.progress).analysis, previous)) {
        check.problems.push({ kind: "analysis", message });
        check.ok = false;
    }
    // The quantities the proposal measures, in units the unit system knows for them (2026-09-25): a unit invented here would travel into the report.
    const quantities = valueAt(procedure, FORMAT.quantities, FORMAT.keys);
    for (const q of Array.isArray(quantities) ? (quantities as Array<Record<string, unknown>>) : []) {
        if (!q || typeof q !== "object") continue;
        const r = physics().resolveUnitRef({ unit: String(q.unit ?? ""), ...(q.quantity ? { quantity: String(q.quantity) } : {}) });
        if (!r.ok) {
            // What would answer it, said with the refusal (2026-09-30: a speed in percent declared as Speed, a velocity, refused and dropped
            // in 29 tasks of 30 rather than put right): the quantity the unit alone belongs to, and what the register declares for the property.
            const alone = q.quantity ? physics().resolveUnitRef({ unit: String(q.unit ?? "") }) : null;
            const declared = declaredQuantity(context.progress, String(q.name ?? ""));
            const hints = [
                ...(alone?.ok ? [w("guard.quantityUnitAlone", { unit: String(q.unit), quantity: String((alone.unit as { quantity?: unknown }).quantity ?? "?") })] : []),
                ...(declared ? [w("guard.quantityDeclared", declared)] : []),
            ].join("");
            check.problems.push({ kind: "shape", message: `${w("guard.quantity", { name: String(q.name), reason: r.reason, code: r.code })}${hints}` });
            check.ok = false;
        }
    }
    // The problems as the guard knows them, for the next prompt (problems.ts): the rules' own points, what is expected there, what was sent;
    // a justification's constant read from its words (what it must cite, the runner adds from the guard's finding).
    if (!check.ok)
        context.progress.pendingProblems = check.problems.map((p) => {
            const path = p.path ?? problemOf(`${p.kind}: ${p.message}`).path;
            const dependentPaths = path ? dependentsOf(rules, path, p.kind) : [];
            return { says: `${p.kind}: ${p.message}`, kind: p.kind, ...(path ? { path } : {}), ...(p.expected ? { expected: p.expected } : {}), ...(p.got !== undefined ? { got: p.got } : {}), ...(dependentPaths.length ? { dependentPaths } : {}) };
        });
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
/**
 * The safety constants of the signed card's rules, each with the facts it is justified by (the facts its rules bound it by, as the
 * guard reads them, `factsBounding`), their values and their safe side: read from the library's files (the fork's, in a fork), so
 * what the state shows is what the guard will judge by. The values are the library's, shown, never written anywhere else.
 */
type BoundFact = { fact: string; value: number | null; unit: string | null; side: string | null };
export interface SafetyBound {
    constant: string;
    /** The facts of signed documents the rules bound it by: its value respects each, on its side. None: the field is left out. */
    within: BoundFact[];
    note?: string;
}

/** The numeric fields of the procedure's schema, by path ("*" for an element of a list, as the rules write it). */
function schemaNumbers(): string[] {
    const out: string[] = [];
    const walk = (v: unknown, at: string) => {
        const s = (v ?? {}) as { type?: unknown; properties?: Record<string, unknown>; items?: unknown };
        if (s.properties) for (const [k, x] of Object.entries(s.properties)) walk(x, at ? `${at}.${k}` : k);
        else if (s.items) walk(s.items, `${at}.*`);
        else if (s.type === "number" || s.type === "integer") out.push(at);
    };
    walk(PROCEDURE_SCHEMA, "");
    return out;
}

/**
 * Every safety constant a procedure may carry, and what the guard takes as its justification (2026-09-29, the witness C, completed:
 * the map listed only the constants a rule binds to a fact, and abort.co2.threshold, which none does, was left out; the factory did not
 * justify it in six tasks of six). A constant a signed rule binds: the facts it binds it by (`factsBounding`), the one to cite. A safety
 * constant no rule binds: the facts of the signed documents with a safe side, any of which the guard accepts when the value respects
 * its side. Read from the library's files (the fork's, in a fork), as the guard reads them; the values are the library's, shown here,
 * never written anywhere else.
 */
export function safetyBoundsOf(): SafetyBound[] {
    const dir = fromRoot("docs", "library");
    let doc: RulesDocument;
    try {
        doc = { ...(JSON.parse(readFileSync(path.join(dir, `${FORMAT.rulesDocument}.rules.json`), "utf8")) as Omit<RulesDocument, "document" | "signed">), document: FORMAT.rulesDocument, signed: null } as RulesDocument;
    } catch {
        return [];
    }
    const side = (bound?: string): string | null => (bound === "upper" ? "at or below it" : bound === "lower" ? "at or above it" : null);
    const facts = new Map<string, { value: number; unit: string; bound?: string; document: string }>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".facts.json")))
        try {
            const document = f.replace(/\.facts\.json$/, "");
            for (const x of (JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { facts?: Array<{ id: string; value: number; unit: string; bound?: string }> }).facts ?? []) facts.set(x.id, { ...x, document });
        } catch {
            // a sidecar that does not parse is the library's to say
        }
    const shown = (id: string): BoundFact => {
        const f = facts.get(id);
        return { fact: id, value: f?.value ?? null, unit: f?.unit ?? null, side: side(f?.bound) };
    };
    const isSafety = (c: string) => doc.safety.some((p) => matches(c, p));
    const subjects = [...new Set(doc.rules.flatMap((r) => ("compare" in r && r.compare.subject ? [r.compare.subject] : [])))].filter(isSafety);
    const bound: SafetyBound[] = subjects.map((constant) => ({ constant, within: factsBounding(doc, constant).map(shown) }));
    // The safety constants of the schema no rule binds to a signed fact: left out, since the harness sets no safety number that nothing signed justifies (2026-10-10).
    const unbound = schemaNumbers()
        .filter((c) => isSafety(c) && !subjects.includes(c))
        .map((constant) => {
            const ruled = subjects.filter((s) => matches(s, constant));
            return { constant, within: [], note: `no signed fact bounds it: ${leaveOut(constant)}${ruled.length ? ` (${ruled.join(", ")} has its own bound, above)` : ""}` };
        });
    return [...bound, ...unbound];
}

export function stateOfTopic(progress: Progress, task: TaskFile["task"]): TopicState {
    const state = noteMethod(progress);
    const measured = measuredOf(task);
    const presence = presenceOf(progress);
    const last = state.submissions.at(-1);
    const requirements = requirementsOf(progress, task);
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
            // What stopped the last test, and its analysis once accepted.
            // The aborted procedure whole, with what the test ran (2026-09-30: cut at 3000 characters, the procedure the brief promised was a head).
            ...(previousOf(task) ? { previous: headOf(previousOf(task), 16000), analysis: (state.analysis ?? null) as unknown as JsonValue } : {}),
            // What the task measured when it opened: the test starts from it.
            measured: measured as unknown as JsonValue,
            accepted: state.accepted,
            // Each safety constant and the signed facts its rules bound it by, before the first submission (2026-09-29, the replays:
            // the factory cited a fact of the card that does not bound the constant, at the first try of every task, and learned which
            // one only from the refusal); shown when the spec says so, so a fork can run without it to compare.
            ...(FORMAT.safetyBounds ? { safetyBounds: safetyBoundsOf() as unknown as JsonValue } : {}),
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
    const previous = previousOf(task);
    const after = previous ? w("intentionPrevious", { reason: [previous.aborted.condition, previous.aborted.reason].filter(Boolean).join(": ") }) : "";
    return { ...generic, description: w("intention", { outputs: outputsOf(task), device }) + after };
}

/**
 * The factory's conduct, step by step (2026-09-29, docs/comportement-en-donnees.fr.md, section 2): the playbook
 * (`specs/procedure/playbook.json`), an executable graph the core's runtime runs once per step. What stays here is
 * what it reads (the evidence, from what the runner recorded) and how its words are filled (the views).
 */
export const PLAYBOOK = loadPlaybook(FORMAT.playbook);

/** The proofs the playbook reads: the requirements of the state, whether a test of this work was aborted before, whether the runner is at the plan. */
export function evidenceOf(progress: Progress, task: TaskFile["task"]): Evidence {
    return { ...requirementsOf(progress, task), previous: previousOf(task) !== null, planPhase: progress.phase === "plan" };
}

/** The holes of the playbook's words, filled from what the task read and decided, by view. */
function viewsOf(progress: Progress, task: TaskFile["task"]): Record<string, () => Record<string, string | number>> {
    const state = noteMethod(progress);
    // The refusal as the runner recorded it after the step, never the guard's own record: the guard writes while a decision
    // is checked, and an observation that moved between the decision and its execution makes the decision stale.
    const refused = (): string => {
        const refusal = (progress.refusals["procedure.revise"] ?? progress.refusals["procedure.submit"])?.reason ?? null;
        return refusal ? w("brief.refused", { reason: refusal, what: w(draftOf(progress) !== null ? "brief.refusedKept" : "brief.refusedWhole") }) : "";
    };
    return {
        accepted: () => ({ path: state.accepted?.path ?? "" }),
        method: () => {
            const listed = methodsListed(progress);
            const lastRead = readOf(progress, "card")?.value as { id?: string } | undefined;
            const chosen = listed.length ? w("brief.methodListed", { listed: listed.map((id) => `"${id}"`).join(" and ") }) : w("brief.methodFind");
            const notACard = typeof lastRead?.id === "string" && !listed.includes(lastRead.id) ? w("brief.methodNotACard", { id: lastRead.id }) : "";
            // What the plan still needs, said from where the task stands: the methods listed, their card to read; never "find the
            // methods" again once the library answered (2026-10-10, runs 5, 7 and 8: Nano called library.methods a second time each run).
            const how = listed.length ? w("requirements.methodListedRead", { listed: listed.map((id) => `"${id}"`).join(", ") }) : w("requirements.methodRead");
            return { quantities: quantitiesOf(task), chosen, notACard, how };
        },
        plan: () => ({ method: state.method ?? "", names: task.objective.required_outputs.map((o) => w("brief.planOutput", { name: o.name, quantity: o.quantity, unit: o.unit ? w("brief.planUnit", { unit: o.unit }) : "" })).join("; ") }),
        // What stopped the last test, said with its condition and its step.
        aborted: () => {
            const previous = previousOf(task);
            return {
                reason: previous?.aborted.reason ?? "",
                condition: previous?.aborted.condition ?? "?",
                step: typeof previous?.aborted.step === "number" ? `, step ${previous.aborted.step}` : "",
                refused: refused(),
            };
        },
        // What stopped it, as one line: the condition, then the reason.
        stopped: () => {
            const previous = previousOf(task);
            return { reason: [previous?.aborted.condition, previous?.aborted.reason].filter(Boolean).join(": ") };
        },
        procedure: () => {
            const measured = measuredOf(task);
            const values = measured ? Object.entries(measured).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k} ${Math.round((v as number) * 100) / 100}`) : [];
            return {
                method: state.method ?? "",
                // Without a declared plan, the plan is the signed norm: said, with what citing it means.
                plan: !progress.plan && state.method && state.methodSigned ? w("brief.planIsNorm", { method: state.method, by: state.methodSigned.by }) : "",
                presence: presenceOf(progress) ? w("brief.presenceRead") : w("brief.presenceUnread"),
                start: values.length ? w("brief.measured", { values: values.join(", "), source: typeof measured?.source === "string" ? w("brief.measuredSource", { source: measured.source }) : "" }) : "",
                refused: refused(),
                // Once the analysis of an aborted test is accepted: the changes the proposal must make.
                analysed: state.analysis ? w("brief.analysed", { paths: state.analysis.changes.map((c) => c.path).join(", ") }) : "",
                // Where the facts to cite are, when the state shows them.
                bounds: FORMAT.safetyBounds ? w("brief.safetyBounds") : "",
            };
        },
    };
}

/** The playbook's refusals of a capability at this step, said in the spec's words. */
function conductRefusals(capabilityId: string, progress: Progress, task: TaskFile["task"]): string[] {
    const views = viewsOf(progress, task);
    return PLAYBOOK.evaluate(evidenceOf(progress, task))
        .refusing.filter((g) => g.capabilities.includes(capabilityId))
        .map((g) => sayingText(g, w, views));
}

/** The harness's brief: the stage the playbook is at, said with what the task has read and done. */
export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    // Everything read here is written after a step completes (the runner's reads, the phase, the accepted file), never by the guard.
    return sayingText(PLAYBOOK.evaluate(evidenceOf(progress, task)).stage, w, viewsOf(progress, task));
}

/**
 * The marching order the state shows (2026-10-09): every stage with its goal and tools and where the task is; the tools of the current
 * stage that may be called now; what is closed now, with why; and what must hold before handing over, each item met or not.
 */
export function marchingOrderOf(progress: Progress, task: TaskFile["task"]): JsonValue {
    const r = requirementsOf(progress, task);
    const doneWhen = [
        ...FORMAT.requirements.map((req) => ({ item: w(`requirements.${req}Read`), met: Boolean(r[`${req}Read`]) })),
        { item: String(viewsOf(progress, task).method().how), met: Boolean(r.methodRead) },
        ...(previousOf(task) ? [{ item: w("requirements.analysisAccepted"), met: Boolean(r.analysisAccepted) }] : []),
        { item: w("doneWhen.plan"), met: Boolean(r.planDeclared || r.signedNorm) },
        { item: w("doneWhen.accepted"), met: Boolean(r.procedureAccepted) },
        { item: w("doneWhen.handedOver"), met: progress.done !== null },
    ];
    return { ...conductView(PLAYBOOK, evidenceOf(progress, task), w, viewsOf(progress, task), Object.keys(progress.reads)), doneWhen } as unknown as JsonValue;
}

export const PROCEDURE_TOPIC: TopicDefinition = {
    marchingOrder: marchingOrderOf,
    // The stage's tools only: what the conduct's gates refuse now is not shown (the guard refuses it still).
    // The stage's tools: what a step offers, with the support every stage has (base.ts, STAGE_SUPPORT).
    stageTools: (progress, task) => stageToolsOf(PLAYBOOK, evidenceOf(progress, task)),
    closed: (progress, task) => PLAYBOOK.evaluate(evidenceOf(progress, task)).refusing.flatMap((g) => g.capabilities),
    name: "procedure",
    tools: PROCEDURE_TOOLS,
    // A proposal is written from this task's device, presence, measurement and signed library: never copied from the memory of another task, nor the claim that names its file.
    neverReplayed: [/^procedure\.(submit|revise|analyse)$/, /^task\.done$/],
    judges: [/^procedure\.(submit|revise)$/],
    digest: (_capability, input) => procedureDigest(input),
    justified: PROCEDURE_JUSTIFIED,
    // The plan says what is measured, from the task's required outputs; the guard checks it again.
    replayedActions: [/^task\.plan$/],
    validate: (claim, files, progress) => validateProcedure(claim, files, progress),
    local: (context) => [submitCapability(context), reviseCapability(context), analyseCapability(context)],
    guard: guardProcedure,
    state: stateOfTopic,
    // The submissions tell the steps apart for the recipes: a step learned after a refusal does not replay after an acceptance.
    key: (progress) => stateOf(progress).submissions.map((s) => (s.ok ? "ok" : "refused")).join(","),
    intention: intentionOf,
    prompt: PROCEDURE_PROMPT,
    words: { words: WORDS, keys: PROCEDURE_WORD_KEYS },
    brief: briefOf,
};
