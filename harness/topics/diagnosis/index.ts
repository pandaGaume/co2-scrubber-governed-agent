/**
 * The `diagnosis` topic (2026-10-01, docs/evaluateur.fr.md, E5.2): diagnose one lead of the post-procedure evaluator (lib/evaluator.ts),
 * what really caused it, its class, whether it is still true, the harness graph's nodes it rests on, and predictions the harness checks
 * (lib/predicates.ts). The scripted detectors find; a model diagnoses; the harness checks what the model claims and computes the
 * confidence (E5.3), never the model.
 *
 * What the factory is given is the task's `observations.diagnosis` (the spec names the field), read from the harness's graph by the
 * station (lib/diagnosis.ts), never written by a model: the lead whole, its neighbourhood in the graph, the rules of the register it
 * touches and where they are stated today, the state of today, the hypotheses already refuted. Its tools only read: the graph, a
 * task's step reduced, a text of the contract at a version, the library.
 *
 * Its guard (`diagnosisCheck`, which the station runs again) refuses a diagnosis of the wrong form before anything is run: a verdict,
 * a class or a currency outside the format's, evidence that is no node of the graph, too few predictions or a role missing, a
 * prediction of the wrong form, one on today's state that is not about today, one that only repeats what made the lead. Then it runs
 * the predictions: one the sources refute comes back as a refusal, with what was observed. A prediction the sources cannot settle is
 * kept as unknown: it confirms nothing, and the confidence says so.
 */
import type { CapabilityResult, Intention, JsonValue } from "@spiky-panda/harness";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot, pathFromEnv } from "../../../lib/paths.js";
import { forkPath, readFork } from "../../../lib/fork.js";
import { H, HarnessGraph, type HarnessNode, type HarnessReading } from "../../../lib/harness-graph.js";
import { CONTRACT_TEXTS, evaluatePrediction, isContractText, PREDICATES, predictionProblems, reducedStep, type PredicateContext, type Prediction, type PredictionResult } from "../../../lib/predicates.js";
import { loadRegister, statementText, textAt, type Register, type TextVersion } from "../../../lib/rules-register.js";
import { guardWordsOf } from "../../../lib/working-memory.js";
import { recordDiagnosisTask } from "../../../lib/diagnosis-dataset.js";
import { withBase } from "../../core/base.js";
import type { LocalCapability } from "../../core/capabilities.js";
import { loadPlaybook, sayingText, type Evidence } from "../../core/conduct.js";
import { JUSTIFICATIONS_SCHEMA, type Justified } from "../../core/justify.js";
import type { TopicState } from "../../core/reasoning-state.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicContext, TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { loadWords, say } from "../../core/words.js";

export interface DiagnosisFormat {
    words: string;
    prompt: string;
    playbook: string;
    observation: string;
    file: string;
    verdicts: Record<string, string>;
    classes: Record<string, string>;
    current: string[];
    roles: Record<Role, string>;
    minimum: { predictions: number; cause: number; current: number; rulesOut: number; evidence: number };
    neighbourhood: { hops: number; maxNodes: number };
    text: { maxChars: number };
}
export type Role = "cause" | "current" | "rules-out";
export const DIAGNOSIS_FORMAT_FILE = "specs/diagnosis/format.json";
export const DIAGNOSIS_FORMAT: DiagnosisFormat = JSON.parse(readFileSync(fromRoot(...DIAGNOSIS_FORMAT_FILE.split("/")), "utf8")) as DiagnosisFormat;
export const DIAGNOSIS_WORDS = loadWords(DIAGNOSIS_FORMAT.words);
const w = (key: string, vars?: Record<string, string | number>): string => say(DIAGNOSIS_WORDS, key, vars);

/** The factory's own conduct, run once per step. */
export const DIAGNOSIS_CONDUCT = loadPlaybook(DIAGNOSIS_FORMAT.playbook);

export const DIAGNOSIS_WORD_KEYS = [
    "intention", "capabilities.graph", "capabilities.step", "capabilities.text", "capabilities.submit", "brief.plan", "brief.diagnose", "brief.refused", "brief.handOver",
    "requirements.missing", "guard.refused", "guard.id", "guard.accepted", "guard.verdict", "guard.class", "guard.current", "guard.cause", "guard.language", "guard.dash",
    "guard.evidence", "guard.notNode", "guard.predictions", "guard.role", "guard.roles", "guard.expect", "guard.alternative", "guard.form", "guard.today", "guard.restates",
    "guard.refuted", "openQuestions.plan", "openQuestions.diagnose", "openQuestions.handOver", "validate.none", "validate.notAccepted", "validate.notTheFile",
];

export const DIAGNOSIS_READS = ["diagnosis.graph", "diagnosis.step", "diagnosis.text"];
export const DIAGNOSIS_TOOLS: ReadonlyArray<RegExp> = withBase([/^diagnosis\.(graph|step|text|submit)$/]);

/** The lead as the evaluator wrote it: attached to the diagnosis by the harness, never written by the model. */
export interface LeadRef {
    id: string;
    detector: string;
    class: string;
    title: string;
    settledBy: string | null;
    form: { id: string; shape: string; by: string } | null;
    path: string[];
    about: string[];
    tasks: string[];
    models: Record<string, number>;
    evidence: JsonValue;
    recommend: boolean;
}

/** What is asked of the factory, from the task. */
export interface DiagnosisAsked {
    id: string;
    /** The forks the lead was found in, read together (null: the factory's own workshop). */
    forks: string[] | null;
    lead: LeadRef;
    neighbourhood: { nodes: Array<{ id: string; type: string; bag?: JsonValue }>; links: Array<{ from: string; type: string; to: string }> };
    /** The rules of the register the lead touches: their status, what the guard checks, where they are stated today. */
    rules: Array<{ code: string; status: string; signed: boolean; says?: string; check?: JsonValue; note?: string; statedToday: Array<{ where: string; holds: boolean }> }>;
    today: { commit: string | null; signatures: Record<string, JsonValue>; profiles: Record<string, JsonValue> };
    /** The hypotheses refuted for this lead before this task: the prediction, what was observed. */
    refuted: Array<{ prediction: Prediction; observed: string }>;
}

const EMPTY_LEAD: LeadRef = { id: "", detector: "", class: "", title: "", settledBy: null, form: null, path: [], about: [], tasks: [], models: {}, evidence: null, recommend: false };

export function diagnosisAskedOf(task: TaskFile["task"]): DiagnosisAsked {
    const a = ((task.observations ?? {}) as Record<string, unknown>)[DIAGNOSIS_FORMAT.observation] as Partial<DiagnosisAsked> | undefined;
    return {
        id: String(a?.id ?? "diagnosis"),
        forks: Array.isArray(a?.forks) ? a!.forks.map(String) : null,
        lead: { ...EMPTY_LEAD, ...(a?.lead ?? {}) } as LeadRef,
        neighbourhood: a?.neighbourhood ?? { nodes: [], links: [] },
        rules: a?.rules ?? [],
        today: a?.today ?? { commit: null, signatures: {}, profiles: {} },
        refuted: a?.refuted ?? [],
    };
}

/** The workshops a lead's graph is read from: its forks in the order they were made, or the factory's own workshop. */
export function workshopsOf(forks: string[] | null): string | Array<{ name: string; dir: string }> {
    if (!forks?.length) return pathFromEnv("WORKSHOP_DIR") ?? fromRoot("outputs", "factory");
    return forks
        .map((id) => readFork(id))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((r) => ({ name: r.id, dir: path.join(forkPath(r.id), "outputs", "factory") }));
}

/** How each topic whose guard judges is read, as the station reads them (its TOPIC_DEFINITIONS, given to avoid a cycle). */
export function readingsOf(definitions: Partial<Record<string, TopicDefinition>>): Record<string, HarnessReading> {
    return Object.fromEntries(
        Object.entries(definitions)
            .filter(([, d]) => d?.judges)
            .map(([t, d]) => [t, { judges: d!.judges!, digest: d!.digest, guardWords: d!.words ? guardWordsOf(fromRoot(...d!.words.words.file.split("/"))) : undefined, register: loadRegister(t) }]),
    );
}

/** The graph a task diagnoses in, built once per task (its sources do not change while it runs). */
const graphs = new Map<string, HarnessGraph>();
async function graphOfTask(context: TopicContext): Promise<HarnessGraph> {
    const known = graphs.get(context.taskId);
    if (known) return known;
    const { TOPIC_DEFINITIONS } = await import("../../core/runner.js");
    const g = new HarnessGraph(workshopsOf(diagnosisAskedOf(context.task).forks), readingsOf(TOPIC_DEFINITIONS));
    graphs.set(context.taskId, g);
    return g;
}

/** A prediction as the diagnosis gives it: the predicate and its arguments, its role, the value expected. */
export interface DiagnosisPrediction extends Prediction {
    role: Role;
    expect: boolean;
    alternative?: string;
}

/** A diagnosis as the capability takes it. */
export interface Diagnosis {
    id: string;
    verdict: string;
    cause: string;
    class: string;
    current: string;
    evidence: string[];
    predictions: DiagnosisPrediction[];
    justifications: unknown[];
}

const PREDICTION_SCHEMA = {
    type: "object",
    properties: {
        role: { type: "string", enum: Object.keys(DIAGNOSIS_FORMAT.roles) },
        alternative: { type: "string", description: "for rules-out: the competing hypothesis this prediction rules out" },
        predicate: { type: "string", enum: Object.keys(PREDICATES) },
        args: { type: "object", description: "the predicate's arguments, as the state's field \"predicates\" gives them" },
        expect: { type: "boolean", description: "the value you predict the harness will observe" },
    },
    required: ["role", "predicate", "args", "expect"],
} as const;

export const SUBMIT_SCHEMA = {
    type: "object",
    properties: {
        id: { type: "string" },
        verdict: { type: "string", enum: Object.keys(DIAGNOSIS_FORMAT.verdicts), description: "what the lead says: right, wrong, or stale (true once, fixed since, and it still asks to act)" },
        cause: { type: "string", description: "what really happened and why, in a few sentences, in English" },
        class: { type: "string", enum: Object.keys(DIAGNOSIS_FORMAT.classes) },
        current: { type: "string", enum: DIAGNOSIS_FORMAT.current, description: "whether the cause holds today" },
        evidence: { type: "array", items: { type: "string" }, description: "node ids of the harness's graph the cause rests on" },
        predictions: { type: "array", items: PREDICTION_SCHEMA },
        justifications: JUSTIFICATIONS_SCHEMA,
    },
    required: ["id", "verdict", "cause", "class", "current", "evidence", "predictions", "justifications"],
} as const;

/** A diagnosis sets no constant: the socle's justifications are taken, and none is due. */
export const DIAGNOSIS_JUSTIFIED: Justified = { capability: /^diagnosis\.submit$/, constants: () => [] };

/** The dash the house style forbids, by its code. */
const EM_DASH = String.fromCharCode(0x2014);

/** The fingerprints a lead compares (a rate under them repeats the lead): every fingerprint node its evidence names. */
function fingerprintsOf(lead: LeadRef): Set<string> {
    const out = new Set<string>();
    JSON.stringify(lead.evidence ?? null, (_k, v: unknown) => {
        if (typeof v === "string" && v.startsWith("fingerprint:")) out.add(v);
        return v;
    });
    return out;
}

const taskId = (id: unknown): string => (String(id).startsWith("task:") ? String(id) : `task:${String(id)}`);

/** What only repeats the lead: the same form over the lead's own tasks, its rate under the fingerprints the lead compares. */
function restates(p: Prediction, lead: LeadRef): string | null {
    if (!lead.form) return null;
    const a = p.args;
    if (p.predicate === "same-form" && a.form === lead.form.id && Array.isArray(a.tasks) && a.tasks.every((t) => lead.tasks.includes(taskId(t)))) return `the form ${lead.form.id} over the lead's tasks`;
    if (p.predicate === "rate" && a.form === lead.form.id && (a.fingerprint === undefined || fingerprintsOf(lead).has(String(a.fingerprint)))) return `the rate of ${lead.form.id} the lead counts`;
    return null;
}

const isToday = (p: Prediction, lead: LeadRef): boolean => p.args.at === "today" || (p.predicate === "rate" && typeof p.args.fingerprint === "string" && !fingerprintsOf(lead).has(p.args.fingerprint));

export interface DiagnosisCheck {
    problems: string[];
    /** Each prediction's result, in order; null when the form kept it from being run. */
    results: Array<PredictionResult | null>;
}

/** The diagnosis checked: its form first, then its predictions run on the graph. The guard's, and the station's again. */
export function diagnosisCheck(input: unknown, asked: DiagnosisAsked, g: HarnessGraph, ctx: PredicateContext, format: DiagnosisFormat = DIAGNOSIS_FORMAT): DiagnosisCheck {
    const d = (input ?? {}) as Partial<Diagnosis>;
    const problems: string[] = [];
    if (d.id !== asked.id) problems.push(w("guard.id", { got: String(d.id ?? ""), id: asked.id }));
    if (!(String(d.verdict) in format.verdicts)) problems.push(w("guard.verdict", { verdicts: Object.keys(format.verdicts).join(", "), got: String(d.verdict ?? "") }));
    if (!(String(d.class) in format.classes)) problems.push(w("guard.class", { classes: Object.keys(format.classes).join(", "), got: String(d.class ?? "") }));
    if (!format.current.includes(String(d.current))) problems.push(w("guard.current", { current: format.current.join(", "), got: String(d.current ?? "") }));
    const cause = typeof d.cause === "string" ? d.cause : "";
    if (!cause.trim()) problems.push(w("guard.cause"));
    const accented = [...new Set(cause.match(/[À-ÖØ-öø-ÿ]/g) ?? [])];
    if (accented.length) problems.push(w("guard.language", { chars: accented.join(" ") }));
    if (cause.includes(EM_DASH)) problems.push(w("guard.dash"));
    const evidence = Array.isArray(d.evidence) ? d.evidence.map(String) : [];
    if (evidence.length < format.minimum.evidence) problems.push(w("guard.evidence", { count: evidence.length, min: format.minimum.evidence }));
    for (const node of evidence) if (!g.get(node)) problems.push(w("guard.notNode", { node }));
    const predictions = Array.isArray(d.predictions) ? (d.predictions as DiagnosisPrediction[]) : [];
    if (predictions.length < format.minimum.predictions) problems.push(w("guard.predictions", { count: predictions.length, min: format.minimum.predictions }));
    const roles = Object.keys(format.roles);
    predictions.forEach((p, i) => {
        const n = i + 1;
        if (!roles.includes(String(p?.role))) problems.push(w("guard.role", { roles: roles.join(", "), got: String(p?.role ?? "") }));
        if (typeof p?.expect !== "boolean") problems.push(w("guard.expect", { n }));
        if (p?.role === "rules-out" && !(typeof p.alternative === "string" && p.alternative.trim())) problems.push(w("guard.alternative", { n }));
        const form = predictionProblems(p ? { predicate: p.predicate, args: p.args } : p);
        if (form.length) problems.push(w("guard.form", { n, problems: form.join("; ") }));
        else {
            if (p.role === "current" && !isToday(p, asked.lead)) problems.push(w("guard.today", { n }));
            const again = restates(p, asked.lead);
            if (again) problems.push(w("guard.restates", { n, what: again }));
        }
    });
    const count = (r: Role) => predictions.filter((p) => p?.role === r).length;
    if (count("cause") < format.minimum.cause || count("current") < format.minimum.current || count("rules-out") < format.minimum.rulesOut) problems.push(w("guard.roles", { cause: format.minimum.cause, current: format.minimum.current, rulesOut: format.minimum.rulesOut }));
    // Its form wrong, nothing is run: a prediction is checked as the model meant it, or not at all.
    if (problems.length) return { problems, results: predictions.map(() => null) };
    const results = predictions.map((p) => evaluatePrediction(g, { predicate: p.predicate, args: p.args }, ctx));
    results.forEach((r, i) => {
        const p = predictions[i];
        if (r.truth === "unknown" || (r.truth === "true") === p.expect) return;
        problems.push(w("guard.refuted", { n: i + 1, role: p.role, alternative: p.alternative ? `, ruling out "${p.alternative}"` : "", expect: String(p.expect), observed: `${r.truth}: ${r.observed}` }));
    });
    return { problems, results };
}

/** The diagnosis as it is kept: what the model said, with the lead the harness attaches and each prediction's result. */
export function diagnosisRecord(asked: DiagnosisAsked, d: Diagnosis, results: Array<PredictionResult | null>): Record<string, JsonValue> {
    const outcome = d.predictions.map((p, i) => ({ ...p, result: (results[i] ?? null) as unknown as JsonValue }));
    const confirmed = outcome.filter((p) => p.result && (p.result as unknown as PredictionResult).truth !== "unknown");
    return {
        id: asked.id,
        lead: asked.lead as unknown as JsonValue,
        forks: asked.forks,
        verdict: d.verdict,
        cause: d.cause,
        class: d.class,
        current: d.current,
        evidence: d.evidence,
        predictions: outcome as unknown as JsonValue,
        // What the harness checked, counted: the confidence is computed from it (E5.3), never declared.
        checked: {
            confirmed: confirmed.length,
            unknown: outcome.length - confirmed.length,
            byRole: Object.fromEntries((Object.keys(DIAGNOSIS_FORMAT.roles) as Role[]).map((r) => [r, { confirmed: confirmed.filter((p) => p.role === r).length, of: outcome.filter((p) => p.role === r).length }])),
            alternativesRuledOut: [...new Set(confirmed.filter((p) => p.role === "rules-out").map((p) => String(p.alternative)))],
        },
        justifications: d.justifications as JsonValue,
    };
}

interface Submission {
    n: number;
    ok: boolean;
    problems: string[];
}
interface DiagnosisTopicState {
    submissions: Submission[];
    accepted: { path: string; sha256: string } | null;
}

function stateOf(progress: Progress): DiagnosisTopicState {
    const current = progress.topic.diagnosis as unknown as DiagnosisTopicState | undefined;
    if (current) return current;
    const fresh: DiagnosisTopicState = { submissions: [], accepted: null };
    progress.topic.diagnosis = fresh as unknown as JsonValue;
    return fresh;
}

/** The proofs the factory's own playbook reads. */
function evidenceOf(progress: Progress): Evidence {
    return { planDeclared: progress.plan !== null, diagnosisAccepted: stateOf(progress).accepted !== null };
}

function viewsOf(progress: Progress, task: TaskFile["task"]): Record<string, () => Record<string, string | number>> {
    const state = stateOf(progress);
    const last = state.submissions.at(-1);
    const asked = diagnosisAskedOf(task);
    return {
        accepted: () => ({ path: state.accepted?.path ?? "" }),
        plan: () => ({ name: task.objective.required_outputs[0]?.name ?? asked.id }),
        diagnose: () => ({
            verdicts: Object.keys(DIAGNOSIS_FORMAT.verdicts).join(", "),
            classes: Object.keys(DIAGNOSIS_FORMAT.classes).join(", "),
            current: DIAGNOSIS_FORMAT.current.join(", "),
            min: DIAGNOSIS_FORMAT.minimum.predictions,
            refused: last && !last.ok ? w("brief.refused", { problems: last.problems.join("; ") }) : "",
        }),
    };
}

export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    return sayingText(DIAGNOSIS_CONDUCT.evaluate(evidenceOf(progress)).stage, w, viewsOf(progress, task));
}

/** What the predictions are checked against besides the graph: every topic's register. */
async function predicateContext(): Promise<PredicateContext> {
    const { TOPIC_DEFINITIONS } = await import("../../core/runner.js");
    return { registers: Object.fromEntries(Object.keys(TOPIC_DEFINITIONS).map((t) => [t, loadRegister(t)])) as Record<string, Register | null> };
}

async function guardDiagnosis(capabilityId: string, input: JsonValue, context: TopicContext): Promise<string[]> {
    const views = viewsOf(context.progress, context.task);
    const refused = DIAGNOSIS_CONDUCT.evaluate(evidenceOf(context.progress))
        .refusing.filter((g) => g.capabilities.includes(capabilityId))
        .map((g) => sayingText(g, w, views));
    if (refused.length || capabilityId !== "diagnosis.submit") return refused;
    const { problems } = diagnosisCheck(input, diagnosisAskedOf(context.task), await graphOfTask(context), await predicateContext());
    if (!problems.length) return [];
    const state = stateOf(context.progress);
    state.submissions.push({ n: state.submissions.length + 1, ok: false, problems });
    context.progress.pendingProblems = problems.map((says) => ({ says, kind: "diagnosis" }));
    return [w("guard.refused", { problems: problems.join("; ") })];
}

/** A bag as a model reads it: whole when short, cut otherwise (the read tools give the rest). */
const shortBag = (bag: unknown, max = 600): JsonValue | undefined => {
    if (!bag || typeof bag !== "object" || !Object.keys(bag).length) return undefined;
    const text = JSON.stringify(bag);
    return (text.length <= max ? bag : `${text.slice(0, max)}…`) as JsonValue;
};

/** The version of the texts at a task or today. */
function versionAt(g: HarnessGraph, at: string): TextVersion | { why: string } {
    if (at === "today") return { cwd: fromRoot(), commit: null };
    const node = g.get(taskId(at));
    if (!node) return { why: `no task ${at} in the graph` };
    const version = g.sourceOf(node.id)?.version;
    return version ?? { why: `the version of the texts ${at} ran under is not known` };
}

function readCapabilities(context: TopicContext): LocalCapability[] {
    const ok = (value: unknown): CapabilityResult => ({ ok: true, output: { outcome: "completed", value: value as JsonValue } });
    const no = (error: string): CapabilityResult => ({ ok: false, error, output: { outcome: "failed" } });
    return [
        {
            id: "diagnosis.graph",
            description: w("capabilities.graph"),
            inputSchema: { type: "object", properties: { id: { type: "string", description: "a node's id (task:..., form:..., rule:..., fingerprint:...)" }, type: { type: "string", description: "a node type (harness.form, harness.rule, ...)" } } } as unknown as JsonValue,
            async execute(input: JsonValue): Promise<CapabilityResult> {
                const g = await graphOfTask(context);
                const a = (input ?? {}) as { id?: unknown; type?: unknown };
                if (typeof a.id === "string" && a.id) {
                    const n = g.get(a.id);
                    if (!n) return no(`no node "${a.id}" in the harness's graph`);
                    return ok({
                        id: n.id,
                        type: n.type,
                        bag: shortBag(n.bag, 2000) ?? null,
                        out: g.out(n).map((l) => ({ type: l.type ?? null, to: String((l.ofin as HarnessNode | null)?.id) })),
                        in: g.in(n).map((l) => ({ type: l.type ?? null, from: String((l.oini as HarnessNode | null)?.id) })),
                    });
                }
                if (typeof a.type === "string" && a.type) return ok({ type: a.type, nodes: g.nodesOf(a.type).slice(0, 200).map((n) => ({ id: n.id, bag: shortBag(n.bag, 300) ?? null })) });
                return ok(g.summary());
            },
        },
        {
            id: "diagnosis.step",
            description: w("capabilities.step"),
            inputSchema: { type: "object", properties: { task: { type: "string", description: "a task node id" }, step: { type: "integer", description: "the step number n" } }, required: ["task", "step"] } as unknown as JsonValue,
            async execute(input: JsonValue): Promise<CapabilityResult> {
                const a = (input ?? {}) as { task?: unknown; step?: unknown };
                const r = reducedStep(await graphOfTask(context), String(a.task ?? ""), Number(a.step));
                return "why" in r ? no(r.why) : ok(r);
            },
        },
        {
            id: "diagnosis.text",
            description: w("capabilities.text", { roots: CONTRACT_TEXTS.join(", "), max: DIAGNOSIS_FORMAT.text.maxChars }),
            inputSchema: { type: "object", properties: { file: { type: "string" }, pointer: { type: "string", description: "a JSON Pointer in the file" }, at: { type: "string", description: "a task node id, or today" }, find: { type: "string", description: "words to show the text around" } }, required: ["file", "at"] } as unknown as JsonValue,
            async execute(input: JsonValue): Promise<CapabilityResult> {
                const a = (input ?? {}) as { file?: unknown; pointer?: unknown; at?: unknown; find?: unknown };
                const file = String(a.file ?? "");
                if (!isContractText(file)) return no(`${file} is not a text of the contract (${CONTRACT_TEXTS.join(", ")})`);
                const version = versionAt(await graphOfTask(context), String(a.at ?? "today"));
                if ("why" in version) return no(version.why);
                const whole = textAt(version, file);
                if (whole === null) return no(`${file} is not there at ${String(a.at)}`);
                const text = typeof a.pointer === "string" && a.pointer ? statementText({ file, pointer: a.pointer, phrase: "" }, whole) : whole;
                if (text === null) return no(`no value at ${String(a.pointer)} in ${file} at ${String(a.at)}`);
                const max = DIAGNOSIS_FORMAT.text.maxChars;
                const at = typeof a.find === "string" && a.find ? text.indexOf(a.find) : -1;
                if (typeof a.find === "string" && a.find && at < 0) return ok({ file, at: a.at, version: version.commit ?? "working tree", found: false, length: text.length, text: text.slice(0, max) });
                const from = at < 0 ? 0 : Math.max(0, at - Math.floor(max / 3));
                return ok({ file, at: a.at, version: version.commit ?? "working tree", ...(at >= 0 ? { found: true } : {}), length: text.length, from, text: text.slice(from, from + max) });
            },
        },
    ];
}

function submitCapability(context: TopicContext): LocalCapability {
    return {
        id: "diagnosis.submit",
        description: w("capabilities.submit", { file: DIAGNOSIS_FORMAT.file.replace("{id}", "<id>") }),
        inputSchema: SUBMIT_SCHEMA as unknown as JsonValue,
        async execute(input: JsonValue): Promise<CapabilityResult> {
            const asked = diagnosisAskedOf(context.task);
            // Run again on what the guard accepted: each prediction's result is kept with it, never the model's word for it.
            const { results } = diagnosisCheck(input, asked, await graphOfTask(context), await predicateContext());
            const file = DIAGNOSIS_FORMAT.file.replace("{id}", asked.id);
            const text = JSON.stringify(diagnosisRecord(asked, input as unknown as Diagnosis, results), null, 2) + "\n";
            const r = await context.broker.call("workspace", "write", { taskId: context.taskId, path: file, text });
            if (!r.ok) return { ok: false, error: r.error ?? `could not write ${file}`, output: { outcome: r.outcome } };
            const state = stateOf(context.progress);
            state.submissions.push({ n: state.submissions.length + 1, ok: true, problems: [] });
            state.accepted = { path: file, sha256: (r.output as { sha256: string }).sha256 };
            return { ok: true, output: { outcome: "completed", value: { accepted: true, path: file, sha256: state.accepted.sha256, results: results as unknown as JsonValue } } };
        },
    };
}

export function stateOfTopic(progress: Progress, task: TaskFile["task"]): TopicState {
    const asked = diagnosisAskedOf(task);
    const state = stateOf(progress);
    const e = evidenceOf(progress);
    const last = state.submissions.at(-1);
    return {
        hypothesis: {
            id: asked.id,
            lead: asked.lead as unknown as JsonValue,
            neighbourhood: asked.neighbourhood as unknown as JsonValue,
            rules: asked.rules as unknown as JsonValue,
            today: asked.today as unknown as JsonValue,
            refuted: asked.refuted as unknown as JsonValue,
            predicates: PREDICATES as unknown as JsonValue,
            verdicts: DIAGNOSIS_FORMAT.verdicts,
            classes: DIAGNOSIS_FORMAT.classes,
            roles: DIAGNOSIS_FORMAT.roles,
            minimum: DIAGNOSIS_FORMAT.minimum as unknown as JsonValue,
            accepted: state.accepted as unknown as JsonValue,
        },
        evaluation: last ? ({ submission: last.n, ok: last.ok, problems: last.problems } as JsonValue) : null,
        openQuestions: [w(e.diagnosisAccepted ? "openQuestions.handOver" : e.planDeclared ? "openQuestions.diagnose" : "openQuestions.plan")],
        requirements: e as Record<string, boolean>,
    };
}

export function validateDiagnosis(claim: DoneClaim, files: WorkshopFile[], progress: Progress): Validation {
    const problems: string[] = [];
    const claimed = claim.artifacts.filter((a) => a.kind === "diagnosis");
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
    const a = diagnosisAskedOf(task);
    return { ...generic, description: w("intention", { id: a.lead.id || a.id, lead: a.lead.title || a.lead.id }) };
}

export const DIAGNOSIS_TOPIC: TopicDefinition = {
    name: "diagnosis",
    tools: DIAGNOSIS_TOOLS,
    // A diagnosis and its reads are this task's lead's, never replayed from another's.
    neverReplayed: [/^diagnosis\.(graph|step|text|submit)$/, /^task\.done$/],
    judges: [/^diagnosis\.submit$/],
    replayedActions: [/^task\.plan$/],
    justified: DIAGNOSIS_JUSTIFIED,
    validate: (claim, files, progress) => validateDiagnosis(claim, files, progress),
    local: (context) => [...readCapabilities(context), submitCapability(context)],
    guard: guardDiagnosis,
    state: stateOfTopic,
    key: (progress) => stateOf(progress).submissions.map((s) => (s.ok ? "ok" : "refused")).join(","),
    intention: intentionOf,
    prompt: DIAGNOSIS_FORMAT.prompt,
    words: { words: DIAGNOSIS_WORDS, keys: DIAGNOSIS_WORD_KEYS },
    brief: briefOf,
    shelf: false,
    quantities: false,
    // What the model sent and the harness observed, kept for the calibration whatever the task ended as (E5.3, lib/diagnosis-dataset.ts).
    record: (dir) => {
        recordDiagnosisTask(dir);
    },
};

