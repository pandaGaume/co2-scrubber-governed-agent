/**
 * The predictions of a diagnosis, and how the harness checks them (2026-10-01, docs/evaluateur.fr.md, E5.1). A diagnosis by a reasoner
 * (E5.2) says what caused a lead and backs it with predictions; a prediction is a closed predicate the harness evaluates on the graph
 * and its sources (the tasks' manifests and traces, the texts of the contract at a version, the library and its signatures), never
 * the model. Each answers true, false or unknown, with what it observed and the graph's nodes that show it.
 *
 * The language is closed on purpose: a cause it cannot express gives unknown predictions, and the lead goes to a person. It grows
 * when a real case asks, with a test (the first trial of 2026-10-01 asked for `sent`, `refused-with` and `fact`: a refusal's words
 * checked against what was sent and what the library holds, and paths renumbered between two submissions).
 *
 * The descriptions are for the models that write predictions: en-US.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { H, type HarnessGraph, type HarnessNode, type TaskSource } from "./harness-graph.js";
import { codesOf, stated, textAt, type Register, type Statement, type TextVersion } from "./rules-register.js";
import { fromRoot } from "./paths.js";
import { problemsOfReason } from "../harness/core/problems.js";
import { digestOf, signaturesDir } from "../harness/lib/signatures.js";

export type Truth = "true" | "false" | "unknown";

export interface Prediction {
    predicate: PredicateName;
    args: Record<string, unknown>;
}

export interface PredictionResult {
    truth: Truth;
    /** What the harness found, in a sentence: the value read, the count, why it cannot tell. */
    observed: string;
    /** The graph's nodes that show it. */
    nodes: string[];
    /** What outside the graph it read: a file at a version, a signature. */
    read: string[];
}

const OUTCOMES = ["cut", "harness-refused", "guard-refused", "accepted", "completed", "failed"] as const;
const COMPARES = ["=", "!=", "<", "<=", ">", ">=", "contains", "present", "absent"] as const;
const SETTINGS = ["maxTokens", "maxTokensParam", "reasoningEffort", "temperature", "timeoutMs"] as const;
type ArgType = "task" | "tasks" | "step" | "at" | "outcome" | "compare" | "value" | "pointer" | "text" | "setting" | "share";

interface PredicateSpec {
    says: string;
    args: Record<string, { type: ArgType; says: string; optional?: boolean }>;
}

/** The closed language: each predicate, what it checks, its arguments. */
export const PREDICATES = {
    "outcome-at": {
        says: "The step of the task had this outcome: cut (the call stopped at the output limit), harness-refused (refused before any guard: a schema, an allowlist, a repeat), guard-refused, accepted, completed (a capability no guard judges), failed.",
        args: { task: { type: "task", says: "a task node id" }, step: { type: "step", says: "the step number n" }, outcome: { type: "outcome", says: OUTCOMES.join(" | ") } },
    },
    "preceded-by": {
        says: "The attempt before this step on the same capability family (procedure.*, library.*) had this outcome.",
        args: { task: { type: "task", says: "a task node id" }, step: { type: "step", says: "the step number n" }, outcome: { type: "outcome", says: OUTCOMES.join(" | ") } },
    },
    sent: {
        says: "What the model sent at the step (the call's arguments), at a JSON Pointer, compared with a value. A segment [key=value] picks the element of an array whose key has that value, e.g. /justifications/[constant=steps.1.speedPercent]/value.",
        args: { task: { type: "task", says: "a task node id" }, step: { type: "step", says: "the step number n" }, pointer: { type: "pointer", says: "a JSON Pointer into the arguments" }, compare: { type: "compare", says: COMPARES.join(" | ") }, value: { type: "value", says: "the value to compare with (not for present or absent)", optional: true } },
    },
    "in-state": {
        says: "What the model received at the step (the harness's reasoning state) holds this JSON Pointer. A number in the pointer stands for any element of the list.",
        args: { task: { type: "task", says: "a task node id" }, step: { type: "step", says: "the step number n" }, pointer: { type: "pointer", says: "a JSON Pointer into the state, at most three levels deep" } },
    },
    "refused-with": {
        says: "The refusal at the step falls under this rule of the register, or its words contain this phrase (one of the two).",
        args: { task: { type: "task", says: "a task node id" }, step: { type: "step", says: "the step number n" }, rule: { type: "text", says: "a rule code of the register", optional: true }, phrase: { type: "text", says: "words the refusal contains", optional: true } },
    },
    "stated-at": {
        says: "A rule of the register (or a convention, or a phrase in a file of the contract) was stated in the texts at a version: the task's (what it was given, a library document only if read before its first submission) or today's.",
        args: { rule: { type: "text", says: "a rule code, or a convention's name", optional: true }, file: { type: "text", says: "a file of the contract, with phrase", optional: true }, pointer: { type: "pointer", says: "a JSON Pointer in that file", optional: true }, phrase: { type: "text", says: "the words the file must hold", optional: true }, at: { type: "at", says: "a task node id, or today" } },
    },
    "read-before": {
        says: "The task read this library document before its first submission.",
        args: { task: { type: "task", says: "a task node id" }, document: { type: "text", says: "a library document id" } },
    },
    signed: {
        says: "The library document was signed, by a signature that binds it as it was then: today, or when the task ran (unknown when the signature that stands was made after the task).",
        args: { document: { type: "text", says: "a library document id" }, at: { type: "at", says: "a task node id, or today" } },
    },
    fact: {
        says: "The library holds this fact at a version (the task's or today's), and, with a comparison, its value compares so.",
        args: { id: { type: "text", says: "a fact id, as library.facts lists them" }, at: { type: "at", says: "a task node id, or today" }, compare: { type: "compare", says: COMPARES.join(" | "), optional: true }, value: { type: "value", says: "the value to compare with", optional: true } },
    },
    "run-setting": {
        says: "How the model was run in the task (from its manifest, or its profile at the task's version): maxTokens, maxTokensParam, reasoningEffort, temperature, timeoutMs, compared with a value.",
        args: { task: { type: "task", says: "a task node id" }, setting: { type: "setting", says: SETTINGS.join(" | ") }, compare: { type: "compare", says: COMPARES.join(" | ") }, value: { type: "value", says: "the value to compare with (not for present or absent)", optional: true } },
    },
    rate: {
        says: "The share of tasks refused at least once for this form, among the tasks of its topic (of a model, under a fingerprint, when given), compared with a share between 0 and 1.",
        args: { form: { type: "text", says: "a form node id" }, model: { type: "text", says: "a model name", optional: true }, fingerprint: { type: "text", says: "a fingerprint node id", optional: true }, compare: { type: "compare", says: "= | != | < | <= | > | >=" }, value: { type: "share", says: "a share between 0 and 1" } },
    },
    "same-form": {
        says: "Every task named was refused at least once for this form.",
        args: { tasks: { type: "tasks", says: "task node ids" }, form: { type: "text", says: "a form node id" } },
    },
} satisfies Record<string, PredicateSpec>;

export type PredicateName = keyof typeof PREDICATES;

/** What is wrong with a prediction's form, before anything is evaluated: an unknown predicate or argument, a type, a missing one. */
export function predictionProblems(p: unknown): string[] {
    if (!p || typeof p !== "object") return ["a prediction is an object { predicate, args }"];
    const { predicate, args } = p as { predicate?: unknown; args?: unknown };
    const spec = (PREDICATES as Record<string, PredicateSpec>)[String(predicate)];
    if (!spec) return [`unknown predicate "${String(predicate)}" (one of ${Object.keys(PREDICATES).join(", ")})`];
    if (!args || typeof args !== "object" || Array.isArray(args)) return [`${String(predicate)}: args is an object`];
    const a = args as Record<string, unknown>;
    const out: string[] = [];
    for (const k of Object.keys(a)) if (!(k in spec.args)) out.push(`${String(predicate)}: unknown argument "${k}"`);
    for (const [k, s] of Object.entries(spec.args)) {
        const v = a[k];
        if (v === undefined) {
            if (!s.optional) out.push(`${String(predicate)}: ${k} is required (${s.says})`);
            continue;
        }
        const bad = typeProblem(s.type, v);
        if (bad) out.push(`${String(predicate)}: ${k} ${bad}`);
    }
    const compare = a.compare as string | undefined;
    if (compare && !["present", "absent"].includes(compare) && a.value === undefined && spec.args.value) out.push(`${String(predicate)}: value is required with ${compare}`);
    if (predicate === "refused-with" && (a.rule === undefined) === (a.phrase === undefined)) out.push("refused-with: one of rule or phrase");
    if (predicate === "stated-at" && (a.rule === undefined) === (a.phrase === undefined && a.file === undefined)) out.push("stated-at: a rule, or a file with its phrase");
    if (predicate === "stated-at" && (a.file === undefined) !== (a.phrase === undefined)) out.push("stated-at: a file and its phrase go together");
    if (predicate === "fact" && a.compare !== undefined && !["present", "absent"].includes(String(a.compare)) && a.value === undefined) out.push("fact: value is required with a comparison");
    return out;
}

function typeProblem(type: ArgType, v: unknown): string | null {
    switch (type) {
        case "task":
        case "text":
            return typeof v === "string" && v.trim() ? null : "is a non-empty string";
        case "tasks":
            return Array.isArray(v) && v.length && v.every((x) => typeof x === "string") ? null : "is a non-empty list of task node ids";
        case "step":
            return Number.isInteger(v) && (v as number) > 0 ? null : "is a step number, an integer from 1";
        case "at":
            return typeof v === "string" && v.trim() ? null : 'is a task node id or "today"';
        case "outcome":
            return (OUTCOMES as readonly string[]).includes(String(v)) ? null : `is one of ${OUTCOMES.join(", ")}`;
        case "compare":
            return (COMPARES as readonly string[]).includes(String(v)) ? null : `is one of ${COMPARES.join(", ")}`;
        case "setting":
            return (SETTINGS as readonly string[]).includes(String(v)) ? null : `is one of ${SETTINGS.join(", ")}`;
        case "pointer":
            return typeof v === "string" && (v === "" || v.startsWith("/")) ? null : 'is a JSON Pointer ("" or starting with /)';
        case "share":
            return typeof v === "number" && v >= 0 && v <= 1 ? null : "is a number between 0 and 1";
        case "value":
            return ["string", "number", "boolean"].includes(typeof v) || v === null ? null : "is a string, a number, a boolean or null";
    }
}

/** What the predictions are checked against besides the graph: the registers, where the library and its signatures are. */
export interface PredicateContext {
    registers: Record<string, Register | null | undefined>;
    /** The library today (docs/library). */
    libraryDir?: string;
    /** Where the signatures are (docs/library/signatures, or LIBRARY_SIGNATURES_DIR). */
    signaturesDir?: string;
}

const result = (truth: Truth, observed: string, nodes: Array<string | undefined> = [], read: string[] = []): PredictionResult => ({ truth, observed, nodes: [...new Set(nodes.filter((n): n is string => Boolean(n)))], read });
const unknown = (why: string, nodes: Array<string | undefined> = []): PredictionResult => result("unknown", why, nodes);
const truth = (b: boolean): Truth => (b ? "true" : "false");
const show = (v: unknown): string => {
    const t = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v ?? null);
    return t.length > 200 ? `${t.slice(0, 200)}…` : t;
};

/** A prediction evaluated: true, false or unknown, never by a model. A prediction of a wrong form is unknown, with its problems. */
export function evaluatePrediction(g: HarnessGraph, p: Prediction, ctx: PredicateContext): PredictionResult {
    const problems = predictionProblems(p);
    if (problems.length) return unknown(`not a prediction the harness can check: ${problems.join("; ")}`);
    const a = p.args;
    switch (p.predicate) {
        case "outcome-at": {
            const t = taskOf(g, a.task);
            if (!t) return unknown(`no task ${String(a.task)} in the graph`);
            const o = outcomeOf(g, t, a.step as number);
            if (!o) return unknown(`the task has no step ${String(a.step)}`, [t.node.id]);
            return result(truth(o.outcome === a.outcome), `step ${String(a.step)} (${o.capability}): ${o.outcome}`, [t.node.id, o.node]);
        }
        case "preceded-by": {
            const t = taskOf(g, a.task);
            if (!t) return unknown(`no task ${String(a.task)} in the graph`);
            const steps = stepsOf(t.source);
            const self = steps.find((s) => s.n === a.step);
            if (!self) return unknown(`the task has no step ${String(a.step)}`, [t.node.id]);
            const family = self.capability.split(".")[0];
            const before = steps.filter((s) => s.n < (a.step as number) && s.capability.split(".")[0] === family).at(-1);
            if (!before) return result("false", `no attempt on ${family}.* before step ${String(a.step)}`, [t.node.id]);
            const o = outcomeOf(g, t, before.n)!;
            return result(truth(o.outcome === a.outcome), `the attempt before, step ${before.n} (${o.capability}): ${o.outcome}`, [t.node.id, o.node]);
        }
        case "sent": {
            const t = taskOf(g, a.task);
            if (!t) return unknown(`no task ${String(a.task)} in the graph`);
            const s = stepsOf(t.source).find((x) => x.n === a.step);
            if (!s) return unknown(`the task has no step ${String(a.step)}`, [t.node.id]);
            if (s.input === undefined) return unknown(`what step ${s.n} (${s.capability}) sent is not kept`, [t.node.id]);
            const found = resolve(s.input, String(a.pointer));
            const r = compare(found.value, found.found, String(a.compare), a.value);
            if (r === null) return unknown(`step ${s.n} sent ${show(found.value)} at ${String(a.pointer)}, which does not compare with ${show(a.value)}`, [t.node.id, stepNode(g, t, s.n)]);
            return result(truth(r), found.found ? `step ${s.n} (${s.capability}) sent ${show(found.value)} at ${String(a.pointer)}` : `step ${s.n} (${s.capability}) sent nothing at ${String(a.pointer)}`, [t.node.id, stepNode(g, t, s.n)]);
        }
        case "in-state": {
            const t = taskOf(g, a.task);
            if (!t) return unknown(`no task ${String(a.task)} in the graph`);
            const pointer = String(a.pointer);
            const depth = pointer.split("/").length - 1;
            if (depth > STATE_DEPTH) return unknown(`a pointer of ${depth} levels: what a task received is kept to ${STATE_DEPTH}`, [t.node.id]);
            const received = receivedAt(t.source, a.step as number);
            if (!received) return unknown(`what the model received at step ${String(a.step)} is not kept (a step the harness decided, or a trace without it)`, [t.node.id]);
            const key = skeletonKey(pointer);
            const holds = received.includes(key);
            return result(truth(holds), holds ? `the state at step ${String(a.step)} holds ${pointer}` : `the state at step ${String(a.step)} has no ${pointer} (its fields: ${received.filter((k) => k.split("/").length === 2).join(", ")})`, [t.node.id, stepNode(g, t, a.step as number)]);
        }
        case "refused-with": {
            const t = taskOf(g, a.task);
            if (!t) return unknown(`no task ${String(a.task)} in the graph`);
            const s = stepsOf(t.source).find((x) => x.n === a.step);
            if (!s) return unknown(`the task has no step ${String(a.step)}`, [t.node.id]);
            if (s.outcome === "completed") return result("false", `step ${s.n} (${s.capability}) was not refused`, [t.node.id]);
            const reason = String(s.reason ?? "");
            const node = stepNode(g, t, s.n);
            if (a.phrase !== undefined) return result(truth(reason.includes(String(a.phrase))), `the refusal at step ${s.n}: ${show(reason)}`, [t.node.id, node]);
            const register = ctx.registers[String(t.node.bag?.topic)];
            if (!register) return unknown(`no register for the topic ${String(t.node.bag?.topic)}`, [t.node.id, node]);
            if (!register.rules.some((r) => r.code === a.rule)) return unknown(`no rule ${String(a.rule)} in the register`, [t.node.id, node]);
            const codes = new Set(problemsOfReason(reason).flatMap((q) => [...codesOf(register, q.kind ? `${q.kind}: ${q.says}` : q.says), ...codesOf(register, q.says)]));
            return result(truth(codes.has(String(a.rule))), `the refusal at step ${s.n} falls under ${codes.size ? [...codes].join(", ") : "no rule of the register"}`, [t.node.id, node, `rule:${String(t.node.bag?.topic)}:${String(a.rule)}`].filter((id) => g.get(id)));
        }
        case "stated-at": {
            const at = versionAt(g, a.at);
            if ("why" in at) return unknown(at.why);
            const statements = statementsOf(g, a);
            if ("why" in statements) return unknown(statements.why);
            if (!statements.list.length) return result("false", `${String(a.rule)} is stated in no text of the contract, today's included`, [statements.node]);
            if (!at.version) return unknown(`the version of the texts ${String(a.at)} ran under is not known`, [at.node, statements.node]);
            const held = statements.list.filter((s) => stated(s.stmt, at.version, at.libraryRead));
            const where = (s: Statement) => `${s.library ? `library ${s.library}` : s.file}${s.pointer ? `#${s.pointer}` : ""}`;
            return result(
                truth(held.length > 0),
                held.length ? `stated at ${String(a.at)} in ${held.map((s) => where(s.stmt)).join(", ")}` : `at ${String(a.at)}, none of ${statements.list.map((s) => where(s.stmt)).join(", ")} held it`,
                [at.node, statements.node, ...held.map((s) => s.node)],
                statements.list.map((s) => `${where(s.stmt)}@${at.version!.commit ?? "working tree"}`),
            );
        }
        case "read-before": {
            const t = taskOf(g, a.task);
            if (!t) return unknown(`no task ${String(a.task)} in the graph`);
            const read = t.source.libraryRead.includes(String(a.document));
            return result(truth(read), read ? `read before the first submission` : `before its first submission the task read ${t.source.libraryRead.length ? t.source.libraryRead.join(", ") : "no library document"}`, [t.node.id]);
        }
        case "signed": {
            const doc = String(a.document);
            const libraryDir = ctx.libraryDir ?? fromRoot("docs", "library");
            const file = path.join(ctx.signaturesDir ?? signaturesDir(), `${doc}.json`);
            const signature = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { digest: string; signedBy: string; signedAt: string }) : null;
            if (a.at === "today") {
                const now = digestOf(doc, (name) => (existsSync(path.join(libraryDir, name)) ? readFileSync(path.join(libraryDir, name), "utf8") : null));
                if (now === null) return unknown(`no document ${doc} in the library`);
                if (!signature) return result("false", `${doc} is not signed today`, [], [`signatures/${doc}.json`]);
                return result(truth(signature.digest === now), signature.digest === now ? `signed by ${signature.signedBy} at ${signature.signedAt}, and the document is as signed` : `signed by ${signature.signedBy} at ${signature.signedAt}, but the document changed since`, [], [`signatures/${doc}.json`]);
            }
            const at = versionAt(g, a.at);
            if ("why" in at) return unknown(at.why);
            if (!signature) return unknown(`${doc} is not signed today, and a signature removed since leaves no trace`, [at.node]);
            const started = String(g.get(at.node!)?.bag?.startedAt ?? "");
            if (!started || signature.signedAt > started) return unknown(`the signature that stands was made at ${signature.signedAt}, after the task started (${started || "unknown"}): an earlier one it replaced would not be seen`, [at.node]);
            if (!at.version) return unknown(`the version of the texts the task ran under is not known`, [at.node]);
            const then = digestOf(doc, (name) => textAt(at.version!, `docs/library/${name}`));
            if (then === null) return result("false", `${doc} was not in the library at the task's version`, [at.node]);
            return result(truth(then === signature.digest), then === signature.digest ? `signed by ${signature.signedBy} at ${signature.signedAt}, before the task, and binding the document as the task's version held it` : `signed at ${signature.signedAt}, but not the document as the task's version held it`, [at.node], [`signatures/${doc}.json`]);
        }
        case "fact": {
            const at = a.at === "today" ? { version: { cwd: fromRoot(), commit: null } as TextVersion, node: undefined } : versionAt(g, a.at);
            if ("why" in at) return unknown(at.why);
            if (!at.version) return unknown(`the version of the texts ${String(a.at)} ran under is not known`, [at.node]);
            const f = factAt(at.version, String(a.id), ctx.libraryDir ?? fromRoot("docs", "library"));
            if (!f) return result(truth(a.compare === "absent"), `no fact ${String(a.id)} in the library at ${String(a.at)}`, [at.node]);
            if (a.compare === undefined || a.compare === "present") return result("true", `${f.fact.id} = ${show(f.fact.value)}${f.fact.unit ? ` ${String(f.fact.unit)}` : ""} (${f.document})`, [at.node], [`docs/library/${f.document}.facts.json`]);
            const r = compare(f.fact.value, true, String(a.compare), a.value);
            if (r === null) return unknown(`${f.fact.id} = ${show(f.fact.value)} does not compare with ${show(a.value)}`, [at.node]);
            return result(truth(r), `${f.fact.id} = ${show(f.fact.value)} (${f.document})`, [at.node], [`docs/library/${f.document}.facts.json`]);
        }
        case "run-setting": {
            const t = taskOf(g, a.task);
            if (!t) return unknown(`no task ${String(a.task)} in the graph`);
            const s = settingOf(t.source, String(a.setting));
            if ("why" in s) return unknown(s.why, [t.node.id]);
            const r = compare(s.value, s.value !== null && s.value !== undefined, String(a.compare), a.value);
            if (r === null) return unknown(`${String(a.setting)} was ${show(s.value)} (${s.from}), which does not compare with ${show(a.value)}`, [t.node.id]);
            return result(truth(r), `${String(a.setting)}: ${show(s.value)} (${s.from})`, [t.node.id], s.read);
        }
        case "rate": {
            const form = g.get(String(a.form));
            if (!form || form.type !== H.form) return unknown(`no form ${String(a.form)} in the graph`);
            let tasks = g.nodesOf(H.task).filter((t) => t.bag?.topic === form.bag?.topic);
            if (a.model !== undefined) tasks = tasks.filter((t) => g.out(t, H.ranBy).some((l) => (l.ofin as HarnessNode).bag?.model === a.model));
            if (a.fingerprint !== undefined) tasks = tasks.filter((t) => g.out(t, H.ranUnder).some((l) => (l.ofin as HarnessNode).id === a.fingerprint));
            if (!tasks.length) return unknown(`no task of the topic ${String(form.bag?.topic)}${a.model ? ` by ${String(a.model)}` : ""}${a.fingerprint ? ` under ${String(a.fingerprint)}` : ""}`, [form.id]);
            const refused = new Set(refusedTasks(g, form));
            const k = tasks.filter((t) => refused.has(t.id)).length;
            const share = k / tasks.length;
            const r = compare(share, true, String(a.compare), a.value)!;
            return result(truth(r), `${k} of ${tasks.length} tasks refused for it (${Math.round(share * 100)} %)`, [form.id, ...(a.fingerprint ? [String(a.fingerprint)] : []), ...(a.model ? [`model:${String(a.model)}`] : [])].filter((id) => g.get(id)));
        }
        case "same-form": {
            const form = g.get(String(a.form));
            if (!form || form.type !== H.form) return unknown(`no form ${String(a.form)} in the graph`);
            const refused = new Set(refusedTasks(g, form));
            const named = (a.tasks as string[]).map((id) => ({ id, t: taskOf(g, id) }));
            const missing = named.filter((x) => !x.t);
            if (missing.length) return unknown(`no task ${missing.map((x) => x.id).join(", ")} in the graph`, [form.id]);
            const not = named.filter((x) => !refused.has(x.t!.node.id));
            return result(truth(!not.length), not.length ? `not refused for it: ${not.map((x) => x.t!.node.id).join(", ")}` : `all ${named.length} refused for it`, [form.id, ...named.map((x) => x.t!.node.id)]);
        }
    }
}

/** Where the texts of the contract are: what stated-at and a diagnosis may read, nothing else of the repository. */
export const CONTRACT_TEXTS = ["specs/", "harness/", "lib/", "slots/", "docs/library/", "profiles/"];
export const isContractText = (file: string): boolean => CONTRACT_TEXTS.some((d) => file.startsWith(d)) && !file.split("/").includes("..") && !file.includes("\\");

/** A step of a task, reduced: what it called and sent, how it ended and why, and the fields of the state the model received. */
export interface ReducedStep {
    task: string;
    step: number;
    capability: string;
    outcome: string;
    sent: unknown;
    reason: string | null;
    tokens: unknown;
    received: string[] | null;
}

export function reducedStep(g: HarnessGraph, task: string, n: number): ReducedStep | { why: string } {
    const t = taskOf(g, task);
    if (!t) return { why: `no task ${task} in the graph` };
    const steps = stepsOf(t.source);
    const s = steps.find((x) => x.n === n);
    if (!s) return { why: `the task has ${steps.length} steps, no step ${n}` };
    const o = outcomeOf(g, t, n);
    return { task: t.node.id, step: n, capability: s.capability, outcome: o?.outcome ?? s.outcome, sent: s.input === undefined ? "(not kept)" : s.input, reason: s.reason ?? null, tokens: (s as { tokens?: unknown }).tokens ?? null, received: receivedAt(t.source, n) };
}

/** A task of the graph and where it is read from, by its node id (task:… or the id without the prefix). */
function taskOf(g: HarnessGraph, id: unknown): { node: HarnessNode; source: TaskSource } | null {
    const key = String(id).startsWith("task:") ? String(id) : `task:${String(id)}`;
    const node = g.get(key);
    const source = node ? g.sourceOf(node.id) : undefined;
    return node && source ? { node, source } : null;
}

interface StepRead {
    n: number;
    capability: string;
    outcome: string;
    input?: unknown;
    reason?: string | null;
    truncated?: boolean;
}
const manifests = new Map<string, { steps: StepRead[]; profile?: { file: string; sha256: string | null }; provider?: { settings?: Record<string, unknown>; profile?: { file: string; sha256: string } } }>();
function manifestOf(source: TaskSource) {
    const file = path.join(source.dir, "manifest.json");
    if (!manifests.has(file)) manifests.set(file, existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { steps: [] });
    return manifests.get(file)!;
}
const stepsOf = (source: TaskSource): StepRead[] => manifestOf(source).steps ?? [];

/** The node of a step in the graph: the attempt a guard's capability made, or the step the harness refused. */
function stepNode(g: HarnessGraph, t: { node: HarnessNode }, n: number): string | undefined {
    const q = t.node.id.slice("task:".length);
    return [`attempt:${q}:${n}`, `step:${q}:${n}`].find((id) => g.get(id));
}

const OUTCOME_OF: Record<string, (typeof OUTCOMES)[number]> = { ACCEPTED: "accepted", GUARD_REJECTED: "guard-refused", PRE_GUARD_REJECTED: "harness-refused", TRUNCATED: "cut", CAPABILITY_FAILED: "failed" };
function outcomeOf(g: HarnessGraph, t: { node: HarnessNode; source: TaskSource }, n: number): { outcome: string; capability: string; node?: string } | null {
    const node = stepNode(g, t, n);
    const s = stepsOf(t.source).find((x) => x.n === n);
    if (node) return { outcome: OUTCOME_OF[String(g.get(node)!.bag?.outcome)] ?? String(g.get(node)!.bag?.outcome), capability: String(g.get(node)!.bag?.capability ?? s?.capability), node };
    if (!s) return null;
    return { outcome: s.outcome === "completed" ? "completed" : "failed", capability: s.capability };
}

/** A value at a JSON Pointer, a segment [key=value] picking the element of a list whose key has that value. */
function resolve(document: unknown, pointer: string): { found: boolean; value: unknown } {
    let v = document;
    if (pointer === "") return { found: true, value: v };
    for (const raw of pointer.split("/").slice(1)) {
        const k = raw.replace(/~1/g, "/").replace(/~0/g, "~");
        const pick = /^\[([^=\]]+)=(.*)\]$/.exec(k);
        if (pick) {
            if (!Array.isArray(v)) return { found: false, value: undefined };
            v = v.find((x) => x && typeof x === "object" && String((x as Record<string, unknown>)[pick[1]]) === pick[2]);
        } else if (v !== null && typeof v === "object") v = (v as Record<string, unknown>)[k];
        else return { found: false, value: undefined };
        if (v === undefined) return { found: false, value: undefined };
    }
    return { found: true, value: v };
}

function compare(found: unknown, present: boolean, op: string, value: unknown): boolean | null {
    if (op === "present") return present;
    if (op === "absent") return !present;
    if (!present) return op === "!=";
    if (op === "=") return JSON.stringify(found) === JSON.stringify(value) || (typeof found !== "object" && String(found) === String(value) && typeof value === typeof found);
    if (op === "!=") return JSON.stringify(found) !== JSON.stringify(value);
    if (op === "contains") return typeof value === "string" ? (typeof found === "string" ? found.includes(value) : JSON.stringify(found).includes(value)) : Array.isArray(found) && found.some((x) => JSON.stringify(x) === JSON.stringify(value));
    if (typeof found !== "number" || typeof value !== "number") return null;
    return op === "<" ? found < value : op === "<=" ? found <= value : op === ">" ? found > value : found >= value;
}

/** How deep what a task received is kept, in the corpus and when read from a full trace: a pointer deeper says unknown. */
export const STATE_DEPTH = 3;

/** The fields of a state, as pointers to the depth kept, a list's elements under "*": what `in-state` reads. */
export function stateSkeleton(state: unknown): string[] {
    const out = new Set<string>();
    const walk = (v: unknown, p: string, depth: number): void => {
        if (depth >= STATE_DEPTH || v === null || typeof v !== "object") return;
        const entries: Array<[string, unknown]> = Array.isArray(v) ? v.map((x) => ["*", x]) : Object.entries(v);
        for (const [k, x] of entries) {
            const q = `${p}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`;
            out.add(q);
            walk(x, q, depth + 1);
        }
    };
    walk(state, "", 0);
    return [...out].sort();
}
const skeletonKey = (pointer: string): string =>
    pointer
        .split("/")
        .map((s, i) => (i > 0 && /^\d+$/.test(s) ? "*" : s))
        .join("/");

/** What a step's state changed from the step before, as the corpus keeps it. */
export interface StateChange {
    added?: string[];
    removed?: string[];
}

/** The change of skeleton from one step to the next. */
export function stateChange(before: ReadonlyArray<string>, now: ReadonlyArray<string>): StateChange {
    const was = new Set(before);
    const is = new Set(now);
    return { added: now.filter((k) => !was.has(k)), removed: before.filter((k) => !is.has(k)) };
}

/**
 * The reasoning state a model received at a step, as its skeleton: from a full trace's request, or from the corpus's lines, which keep
 * each step's fields as what changed from the step before (added, removed), in the order of the trace.
 */
const received = new Map<string, Map<number, string[]>>();
function receivedAt(source: TaskSource, n: number): string[] | null {
    const file = path.join(source.dir, "trace.jsonl");
    if (!received.has(file)) {
        const byStep = new Map<number, string[]>();
        let current = new Set<string>();
        if (existsSync(file))
            for (const line of readFileSync(file, "utf8").split("\n")) {
                if (!line.includes('"received"') && !line.includes("Reasoning state")) continue;
                try {
                    const l = JSON.parse(line) as { n?: number; received?: StateChange; exchange?: { request?: unknown } };
                    if (typeof l.n !== "number") continue;
                    if (l.received) {
                        for (const k of l.received.removed ?? []) current.delete(k);
                        for (const k of l.received.added ?? []) current.add(k);
                    } else {
                        const state = stateOfRequest(l.exchange?.request);
                        if (state === undefined) continue;
                        current = new Set(stateSkeleton(state));
                    }
                    byStep.set(l.n, [...current].sort());
                } catch {
                    // a line cut by a crash says nothing
                }
            }
        received.set(file, byStep);
    }
    return received.get(file)!.get(n) ?? null;
}

/** The reasoning state in a request as the harness wrote it (llm-common observationText): the line after "Reasoning state". */
export function stateOfRequest(request: unknown): unknown {
    const messages = (request as { messages?: Array<{ content?: unknown }>; input?: unknown } | undefined)?.messages ?? (request as { input?: Array<{ content?: unknown }> } | undefined)?.input;
    if (!Array.isArray(messages) || !messages.length) return undefined;
    const content = messages[messages.length - 1]?.content;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((b) => String((b as { text?: unknown }).text ?? "")).join("\n") : "";
    const at = text.lastIndexOf("Reasoning state");
    if (at < 0) return undefined;
    const line = text.slice(text.indexOf("\n", at) + 1).split("\n")[0];
    try {
        return JSON.parse(line);
    } catch {
        return undefined;
    }
}

/** The version of the texts at a task or today, with the documents it read first. */
function versionAt(g: HarnessGraph, at: unknown): { version: TextVersion | null; libraryRead: Set<string>; node?: string } | { why: string } {
    // Today, a library document's statement counts as stated: it is in the library for whoever reads it.
    if (at === "today") return { version: { cwd: fromRoot(), commit: null }, libraryRead: libraryToday() };
    const t = taskOf(g, at);
    if (!t) return { why: `no task ${String(at)} in the graph` };
    return { version: t.source.version, libraryRead: new Set(t.source.libraryRead), node: t.node.id };
}
const libraryToday = (): Set<string> => {
    const dir = fromRoot("docs", "library");
    return new Set(existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)) : []);
};

/** The statements a stated-at names: a rule's or a convention's (their nodes in the graph), or a phrase in a file. */
function statementsOf(g: HarnessGraph, a: Record<string, unknown>): { list: Array<{ stmt: Statement; node?: string }>; node?: string } | { why: string } {
    if (a.file !== undefined) {
        const file = String(a.file);
        if (!isContractText(file)) return { why: `${file} is not a text of the contract (${CONTRACT_TEXTS.join(", ")})` };
        return { list: [{ stmt: { file, ...(a.pointer ? { pointer: String(a.pointer) } : {}), phrase: String(a.phrase) } }] };
    }
    const code = String(a.rule);
    const node = g.nodesOf(H.rule).find((r) => r.bag?.code === code) ?? g.nodesOf(H.convention).find((c) => c.bag?.name === code);
    if (!node) return { why: `no rule or convention ${code} in the register` };
    const list = g.in(node, H.states).map((l) => {
        const from = l.oini as HarnessNode;
        const b = from.bag ?? {};
        const stmt: Statement = { ...(b.library ? { library: String(b.library) } : { file: String(b.file) }), ...(b.pointer ? { pointer: String(b.pointer) } : {}), phrase: String(b.phrase) };
        return { stmt, node: from.id };
    });
    return { list, node: node.id };
}

/** A fact of the library at a version, from the facts' sidecars of the documents the library holds today. */
function factAt(version: TextVersion, id: string, libraryDir: string): { fact: { id: string; value: unknown; unit?: unknown }; document: string } | null {
    const documents = existsSync(libraryDir) ? readdirSync(libraryDir).filter((f) => f.endsWith(".facts.json")) : [];
    for (const file of documents) {
        const text = version.commit === null ? readFileSync(path.join(libraryDir, file), "utf8") : textAt(version, `docs/library/${file}`);
        if (!text) continue;
        try {
            const d = JSON.parse(text) as { document?: string; facts?: Array<{ id: string; value: unknown; unit?: unknown }> };
            const fact = d.facts?.find((f) => f.id === id);
            if (fact) return { fact, document: d.document ?? file.replace(/\.facts\.json$/, "") };
        } catch {
            // a sidecar that does not parse holds no fact
        }
    }
    return null;
}

/** A setting of the model a task ran with: its manifest's (E5.0 on), or its profile at the task's version, checked by its digest. */
function settingOf(source: TaskSource, setting: string): { value: unknown; from: string; read: string[] } | { why: string } {
    const m = manifestOf(source);
    const settings = m.provider?.settings;
    if (settings && setting in settings) return { value: settings[setting], from: "the manifest's settings", read: [] };
    const profile = m.provider?.profile ?? m.profile;
    if (!profile?.file) return { why: "the manifest names no profile and keeps no settings" };
    if (!source.version) return { why: `the version of ${profile.file} the task ran with is not known` };
    const text = textAt(source.version, profile.file);
    if (text === null) return { why: `${profile.file} is not at the task's version` };
    const sha = (t: string) => createHash("sha256").update(t).digest("hex");
    if (profile.sha256 && ![text, text.replace(/\r?\n/g, "\r\n"), text.replace(/\r\n/g, "\n")].some((t) => sha(t) === profile.sha256)) return { why: `${profile.file} at the task's version is not the one the task ran with (its digest differs)` };
    let tier3: Record<string, unknown> & { wire?: string };
    try {
        tier3 = (JSON.parse(text) as { tier3?: Record<string, unknown> }).tier3 ?? {};
    } catch {
        return { why: `${profile.file} at the task's version does not parse` };
    }
    const read = [`${profile.file}@${source.version.commit ?? "working tree"}`];
    if (tier3[setting] !== undefined) return { value: tier3[setting], from: `${profile.file}, tier3.${setting}`, read };
    // What the wire does when the profile says nothing (harness/providers/anthropic.ts: 4096); other settings and wires: their own default.
    if (setting === "maxTokens" && tier3.wire === "anthropic-messages") return { value: 4096, from: `${profile.file} sets none: the Anthropic wire's 4096`, read };
    if (setting === "maxTokens") return { why: `${profile.file} sets none, and the server's own default is not known` };
    return { value: null, from: `${profile.file} sets none: the wire's default`, read };
}

/** The tasks refused at least once for a form, by their node ids. */
function refusedTasks(g: HarnessGraph, form: HarnessNode): string[] {
    const out: string[] = [];
    for (const l of g.in(form, H.refusedFor)) {
        const up = g.out(l.oini as HarnessNode, H.of)[0]?.ofin as HarnessNode | undefined;
        const task = up?.type === H.episode ? (g.out(up, H.of)[0]?.ofin as HarnessNode | undefined) : up;
        if (task) out.push(task.id);
    }
    return out;
}

