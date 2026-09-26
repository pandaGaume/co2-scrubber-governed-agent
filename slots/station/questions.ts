/**
 * The questions to the commander (Tier 4), kept by the station (2026-09-26):
 * a harness or a factory that reaches a decision it must not take alone
 * asks Mother; Mother says it and keeps it open; the commander answers at
 * the control post (a click, or a voice), or a standing order answers it
 * for them (the questions policy, set on the page); on the answer the
 * station calls back whoever asked (`resume`), with the answer.
 *
 * Nothing here decides: the options are the asker's, the choice is the
 * commander's, and the station keeps both with who answered and when.
 *
 *   kinds    open-code   a graph factory found a capability missing and wrote
 *                        its contract: open the code factory on it?
 *            replay      the code factory proposed a plugin the forge accepted:
 *                        replay the twin request on the forge's catalogue?
 *            load-twin   load the generated plugin into the twin? (not built)
 *            ask         a factory's own question, from task.ask
 */
import type { JsonValue } from "@spiky-panda/harness";

export interface QuestionOption {
    id: string;
    label: string;
}

export interface QuestionAnswer {
    choice: string;
    by: string;
    at: string;
    note: string | null;
    /** What the commander changed in the context, when the option allows it (a contract amended). */
    amendments?: JsonValue;
    /** How the answer came: a click, a voice, a standing order. */
    how: "click" | "voice" | "policy" | "script";
}

export interface Resume {
    slot: string;
    tool: string;
    args: Record<string, JsonValue>;
}

export interface Question {
    id: string;
    at: string;
    taskId: string | null;
    /** Who asked: factory, graph-factory:<task>, ... */
    from: string;
    kind: string;
    question: string;
    options: QuestionOption[];
    /** What the commander needs to decide: the contract, the artifact, the reason. */
    context: JsonValue;
    resume: Resume | null;
    status: "open" | "answered" | "auto";
    answer: QuestionAnswer | null;
    /** What the asker answered when resumed, or why it could not be. */
    resumed: JsonValue | null;
}

export interface QuestionsPolicy {
    /** ask: every question waits for the commander; auto: answered by the standing order (the first option unless a choice is set). */
    mode: "ask" | "auto";
    /** Per kind: a mode and, for auto, the choice. */
    byKind: Record<string, { mode: "ask" | "auto"; choice?: string }>;
}

export const DEFAULT_POLICY: QuestionsPolicy = { mode: "ask", byKind: {} };

/** What the policy says for a question of this kind: wait, or answer with which choice. */
export function standingOrder(policy: QuestionsPolicy, kind: string, options: QuestionOption[]): { mode: "ask" } | { mode: "auto"; choice: string } {
    const rule = policy.byKind[kind] ?? policy.byKind["*"] ?? { mode: policy.mode };
    if (rule.mode !== "auto") return { mode: "ask" };
    const choice = rule.choice && options.some((o) => o.id === rule.choice) ? rule.choice : options[0]?.id;
    return choice ? { mode: "auto", choice } : { mode: "ask" };
}

/** The problems of a question as asked: no text, no option, an option without id, a resume without slot or tool. */
export function questionProblems(q: { question?: unknown; options?: unknown; kind?: unknown; resume?: unknown }): string[] {
    const problems: string[] = [];
    if (typeof q.question !== "string" || !q.question.trim()) problems.push("a question has a text");
    if (typeof q.kind !== "string" || !q.kind.trim()) problems.push("a question has a kind (open-code, replay, load-twin, ask)");
    const options = Array.isArray(q.options) ? q.options : [];
    if (options.length < 2) problems.push("a question has at least two options");
    for (const o of options) if (!o || typeof o !== "object" || typeof (o as QuestionOption).id !== "string" || !(o as QuestionOption).id) problems.push("an option has an id");
    if (q.resume !== undefined && q.resume !== null) {
        const r = q.resume as Partial<Resume>;
        if (typeof r.slot !== "string" || typeof r.tool !== "string") problems.push("resume names the slot and the tool to call back");
    }
    return problems;
}

/** The option a spoken or typed answer names: by id, by label, or by a word of the label; null when none or several. */
export function optionOf(text: string, options: QuestionOption[]): QuestionOption | null {
    const t = text.trim().toLowerCase();
    if (!t) return null;
    const exact = options.find((o) => o.id.toLowerCase() === t || o.label.toLowerCase() === t);
    if (exact) return exact;
    const hits = options.filter((o) => t.includes(o.id.toLowerCase()) || o.label.toLowerCase().split(/\W+/).some((w) => w.length > 2 && t.includes(w)));
    return hits.length === 1 ? hits[0] : null;
}
