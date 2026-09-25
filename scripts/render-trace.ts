/**
 * The trace of a model loop, readable: one section per step with the node
 * the harness was at, what it called with which input, what came back, and,
 * when the model was asked, the prompt it received (the system prompt once,
 * then only what was added to the conversation since the previous call) and
 * its raw answer. Nothing is summarised: what the model saw and said is
 * here whole, so a passage can be read step by step.
 *
 * Reads a task's `trace.jsonl` (`harness/core/runner.ts`) or a file of the
 * same shape the example writes for the Observer, and writes the markdown
 * next to it.
 *
 *     node dist/scripts/render-trace.js outputs/factory/<task>            -> <task>/trace.md
 *     node dist/scripts/render-trace.js <file>.jsonl [out.md] [--title "..."] [--prompt harness/topics/graph/prompt.md]
 *
 * The example calls `renderTrace` itself for each loop that asked the
 * model (`outputs/examples/<stamp>/trace/`).
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot, isMain, relativeToRoot } from "../lib/paths.js";

/** What a line of the trace must carry to be rendered; the runner's `TraceLine` has it, the example's Observer lines too. */
export interface RenderableLine {
    n: number;
    source?: string;
    failed?: string | null;
    trace?: { stateBefore?: { features?: Record<string, unknown> }; stateAfter?: { features?: Record<string, unknown> }; decision?: { rationale?: string }; evaluation?: { success?: boolean; reward?: number; reason?: string } } | null;
    call?: { id: string; input?: unknown; result?: { ok?: boolean; outcome?: string; error?: string; output?: unknown }; latencyMs?: number } | null;
    exchange?: { model?: string; request?: unknown; response?: unknown; latencyMs?: number; tokens?: { prompt: number; completion: number } | null; proposedCapabilityId?: string; proposedInput?: unknown } | null;
    ms?: number;
}

export interface RenderOptions {
    title?: string;
    /** The system prompt, when the exchanges do not carry it (traces written before 2026-09-25 evening): a role's prompt file. */
    promptFile?: string;
    /** Above this many characters a block is folded (a details element), never cut. */
    foldAbove?: number;
}

const FOLD = 3000;

const json = (v: unknown): string => {
    try {
        return JSON.stringify(v, null, 2) ?? "undefined";
    } catch {
        return String(v);
    }
};

/** A fenced block, folded when long: the reader opens it, nothing is cut. */
function block(label: string, text: string, lang: string, foldAbove: number): string[] {
    const fence = ["```" + lang, text, "```"];
    if (text.length <= foldAbove) return [`**${label}**`, "", ...fence, ""];
    return [`<details><summary><strong>${label}</strong> (${text.length.toLocaleString("en-US")} characters, folded)</summary>`, "", ...fence, "", "</details>", ""];
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/**
 * The state journal (2026-09-25): one line per step, what the reasoning
 * state said before the model decided, and what the step did with it. The
 * whole state is under each step; this is its evolution at a glance: the
 * phase and the budget, the requirements still unmet, the contract report,
 * the hypothesis and the last evaluation's diagnosis, the refusal the model
 * had to answer, the open questions, the weight of the state. The
 * Observer's state has another shape (the documents read, the attempts):
 * its columns follow.
 */
function stateJournal(lines: RenderableLine[]): string[] {
    const states = lines.map((l) => rec(rec(l.trace?.stateBefore?.features).state));
    if (!states.some((s) => Object.keys(s).length)) return [];
    const out: string[] = ["## State journal", "", "One line per step: the state the model read before deciding (whole under each step below), then what the step did."];
    const observer = states.some((s) => "lastAttempt" in s || "earlierAttempts" in s);
    if (observer) {
        out.push("", "| step | call -> outcome | documents read | attempt refused for | state chars |", "|---|---|---|---|---|");
        for (const [i, l] of lines.entries()) {
            const s = states[i];
            const call = `${l.call?.id ?? l.exchange?.proposedCapabilityId ?? "?"} -> ${l.call?.result?.outcome ?? (l.failed ? "refused" : "?")}`;
            const evidence = Object.keys(rec(s.evidence)).map((k) => k.replace(/^library\.read /, "")).join(", ") || "none";
            const last = rec(s.lastAttempt);
            const problems = Array.isArray(last.problems) ? (last.problems as unknown[]).map((p) => String(p).split(":")[0]).join(", ") : "";
            out.push(`| ${l.n} | ${cell(call)} | ${cell(evidence)} | ${last.n !== undefined ? `${String(last.n)}: ${cell(problems)}` : ""} | ${JSON.stringify(s).length.toLocaleString("en-US")} |`);
        }
        return [...out, ""];
    }
    out.push("", "| step | phase | left | call -> outcome | unmet requirements | contracts | hypothesis | diagnosis | refusal to answer | open questions | state chars |", "|---|---|---|---|---|---|---|---|---|---|---|");
    for (const [i, l] of lines.entries()) {
        const s = states[i];
        const budget = rec(s.budget);
        const left = `${String(budget.iterationsLeft ?? "?")} steps${budget.runsLeft !== undefined && budget.runsLeft !== null ? `, ${String(budget.runsLeft)} runs` : ""}`;
        const call = `${l.call?.id ?? l.exchange?.proposedCapabilityId ?? "?"} -> ${l.call?.result?.outcome ?? (l.failed ? "refused" : "?")}`;
        const unmet = Object.entries(rec(s.requirements)).filter(([, v]) => v === false).map(([k]) => k).join(", ") || "none";
        const contracts = rec(rec(s.invariants).contracts);
        const report = contracts.status ? `${String(contracts.status)}${Array.isArray(contracts.conflicts) && contracts.conflicts.length ? ` (${(contracts.conflicts as Array<{ id?: string; revise?: string }>).map((c) => `${String(c.id)}: ${String(c.revise)} to revise`).join("; ")})` : ""}` : "";
        const h = rec(s.hypothesis);
        const hypothesis = h.candidate !== undefined ? `candidate ${String(h.candidate)}${h.graph ? ` (${String(h.graph)})` : ""}${Array.isArray(h.persons) ? `, ${(h.persons as unknown[]).length} persons` : ""}` : h.method ? `method ${String(rec(h.method).id ?? "")}${h.accepted ? ", accepted" : ""}` : h.plannedTypes ? `plan, ${(h.plannedTypes as unknown[]).length} types` : Object.keys(h).length ? "(see step)" : "";
        const e = rec(s.evaluation);
        const diagnosis = e.diagnosis ? `${String(e.diagnosis)}${Array.isArray(e.residuals) ? ` (${(e.residuals as Array<{ column?: string; rmse?: number }>).map((r) => `${String(r.column)} ${String(r.rmse)}`).join(", ")} ppm)` : ""}` : e.submission !== undefined ? `submission ${String(e.submission)} ${e.ok ? "accepted" : `refused: ${(Array.isArray(e.problems) ? (e.problems as unknown[]) : []).map((p) => String(p).split(":")[0]).join(", ")}`}` : "";
        // The harness's refusal (the guard, the schema), or a capability's own (an evaluation refused before any run): both are what the model had to answer.
        const refusal = rec(s.lastRefusal);
        const action = rec(s.lastAction);
        const actionError = String(rec(action.summary).error ?? "");
        const notRun = /was not run: (.{0,80})/.exec(String(rec(l.trace?.stateBefore?.features).brief ?? ""))?.[1] ?? "";
        const toAnswer = refusal.capability ? `${String(refusal.capability)}: ${String(refusal.reason ?? "").slice(0, 80)}` : action.outcome === "refused" || action.outcome === "error" ? `${String(action.capability)}: ${(actionError || notRun).slice(0, 80)}` : "";
        const open = Array.isArray(s.openQuestions) ? String((s.openQuestions as unknown[]).length) : "";
        out.push(`| ${l.n} | ${cell(String(s.phase ?? ""))} | ${cell(left)} | ${cell(call)} | ${cell(unmet)} | ${cell(report)} | ${cell(hypothesis)} | ${cell(diagnosis)} | ${cell(toAnswer)} | ${open} | ${JSON.stringify(s).length.toLocaleString("en-US")} |`);
    }
    return [...out, ""];
}

interface Message {
    role: string;
    content: unknown;
}

/** The text of a message's content: text blocks as they are, tool results and tool uses named. */
function messageText(m: Message): string {
    if (typeof m.content === "string") return m.content;
    if (!Array.isArray(m.content)) return json(m.content);
    return (m.content as Array<Record<string, unknown>>)
        .map((b) => {
            if (b.type === "text") return String(b.text ?? "");
            if (b.type === "tool_result") return `[tool_result ${String(b.tool_use_id ?? "")}]\n${typeof b.content === "string" ? b.content : json(b.content)}`;
            if (b.type === "tool_use") return `[tool_use ${String(b.name ?? "")}]\n${json(b.input)}`;
            if (b.type === "thinking") return `[thinking]\n${String(b.thinking ?? "")}`;
            return json(b);
        })
        .join("\n\n");
}

/** The raw answer's content as the model wrote it: its text, its thinking, the tool it called with the arguments. */
function responseText(response: unknown): string {
    const r = (response ?? {}) as { content?: unknown; choices?: Array<{ message?: { content?: unknown; tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }> } }>; stop_reason?: unknown };
    if (Array.isArray(r.content)) return messageText({ role: "assistant", content: r.content }) + (r.stop_reason ? `\n\n[stop_reason ${String(r.stop_reason)}]` : "");
    const choice = r.choices?.[0]?.message;
    if (choice) {
        const parts: string[] = [];
        if (typeof choice.content === "string" && choice.content) parts.push(choice.content);
        for (const c of choice.tool_calls ?? []) parts.push(`[tool_call ${String(c.function?.name ?? "")}]\n${typeof c.function?.arguments === "string" ? c.function.arguments : json(c.function?.arguments)}`);
        return parts.join("\n\n");
    }
    return json(response);
}

/** The lines of a trace file: one JSON object per line. */
export function readTraceLines(file: string): RenderableLine[] {
    return readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as RenderableLine);
}

export function renderTrace(lines: RenderableLine[], options: RenderOptions = {}): string {
    const fold = options.foldAbove ?? FOLD;
    const out: string[] = [`# ${options.title ?? "Trace"}`, ""];
    const withModel = lines.filter((l) => l.exchange);
    const tokens = withModel.reduce((a, l) => ({ input: a.input + (l.exchange?.tokens?.prompt ?? 0), output: a.output + (l.exchange?.tokens?.completion ?? 0) }), { input: 0, output: 0 });
    const model = withModel.find((l) => l.exchange?.model)?.exchange?.model ?? "none";
    out.push(`- steps: ${lines.length}, model calls: ${withModel.length}, model: ${model}, tokens in/out: ${tokens.input.toLocaleString("en-US")} / ${tokens.output.toLocaleString("en-US")}`);
    out.push("- each step: the node the harness was at (its phase), what it called and with what, what came back; when the model was asked, what was added to its conversation since the previous call, and its raw answer. The system prompt and the tools are given once, before the first step; a long block is folded, never cut.", "");
    // The system prompt: from the first exchange that carries it, else the prompt file named.
    const firstRequest = withModel.map((l) => l.exchange?.request as { system?: unknown; tools?: unknown; toolDescriptions?: unknown } | undefined).find((r) => r);
    let system: string | null = typeof firstRequest?.system === "string" ? firstRequest.system : null;
    let systemFrom = "the exchange";
    if (!system && options.promptFile && existsSync(fromRoot(options.promptFile))) {
        system = readFileSync(fromRoot(options.promptFile), "utf8");
        systemFrom = `${options.promptFile} (the trace predates the exchange carrying it)`;
    }
    if (system) out.push(...block(`System prompt, from ${systemFrom}`, system, "text", fold));
    const descriptions = firstRequest?.toolDescriptions;
    if (Array.isArray(descriptions) && descriptions.length) out.push(...block("Tools offered to the model (name: description)", (descriptions as Array<{ name: string; description?: string }>).map((t) => `${t.name}: ${t.description ?? ""}`).join("\n\n"), "text", fold));
    else if (Array.isArray(firstRequest?.tools)) out.push(`**Tools offered to the model**: ${(firstRequest!.tools as string[]).join(", ")}`, "");

    out.push(...stateJournal(lines));

    let shown = 0; // messages of the conversation already printed
    for (const l of lines) {
        const before = l.trace?.stateBefore?.features ?? {};
        const after = l.trace?.stateAfter?.features ?? {};
        const call = l.call;
        const outcome = call?.result?.outcome ?? (call?.result?.ok === false ? "error" : call ? "completed" : l.failed ? "failed" : "no call");
        out.push(`## Step ${l.n}: ${call?.id ?? l.exchange?.proposedCapabilityId ?? "(no capability)"} (${l.source ?? "?"}) -> ${outcome}`, "");
        const phaseBefore = before.phase !== undefined ? `phase ${String(before.phase)}` : "";
        const phaseAfter = after.phase !== undefined ? `phase ${String(after.phase)}` : "";
        out.push(`- node: ${phaseBefore || "?"}${phaseAfter && phaseAfter !== phaseBefore ? ` -> ${phaseAfter}` : ""}; last capability before: ${String(before.lastCapability ?? "none")}${typeof l.ms === "number" ? `; ${l.ms} ms` : ""}`);
        if (l.trace?.decision?.rationale) out.push(`- rationale: ${l.trace.decision.rationale}`);
        if (l.trace?.evaluation) out.push(`- evaluation: ${l.trace.evaluation.success ? "success" : "failure"}, reward ${String(l.trace.evaluation.reward)}: ${l.trace.evaluation.reason ?? ""}`);
        if (l.failed) out.push(`- failed: ${l.failed}`);
        out.push("");
        if (call) {
            out.push(...block(`Input of ${call.id}`, json(call.input ?? {}), "json", fold));
            const result = call.result ?? {};
            out.push(...block(`Output of ${call.id} (${result.ok === false ? `refused: ${result.error ?? result.outcome ?? ""}` : "ok"})`, json(result.ok === false ? { error: result.error, outcome: result.outcome, output: result.output } : (result.output ?? null)), "json", fold));
        } else if (l.exchange?.proposedCapabilityId) {
            out.push(...block(`Proposed by the model: ${l.exchange.proposedCapabilityId}`, json(l.exchange.proposedInput ?? {}), "json", fold));
        }
        const x = l.exchange;
        if (x) {
            const t = x.tokens ? `${x.tokens.prompt.toLocaleString("en-US")} in / ${x.tokens.completion.toLocaleString("en-US")} out` : "no token count";
            out.push(`### Model call: ${x.model ?? "?"}, ${t}, ${x.latencyMs ?? "?"} ms`, "");
            const request = (x.request ?? {}) as { messages?: Message[] };
            const messages = Array.isArray(request.messages) ? request.messages : [];
            const fresh = messages.slice(shown).filter((m) => m.role !== "assistant");
            if (fresh.length) out.push(...block(`Prompt: added to the conversation since the previous call (${fresh.length} message(s); the conversation holds ${messages.length})`, fresh.map((m) => `[${m.role}]\n${messageText(m)}`).join("\n\n"), "text", fold));
            else if (!messages.length) out.push("**Prompt**: the exchange carries no messages.", "");
            shown = Math.max(shown, messages.length);
            out.push(...block("Response, raw", responseText(x.response), "text", fold));
        }
    }
    return out.join("\n") + "\n";
}

/** Renders a task directory (its `trace.jsonl` to `trace.md`) or a trace file to the file named. */
export function renderTraceFile(source: string, outFile?: string, options: RenderOptions = {}): string {
    const file = statSync(source).isDirectory() ? path.join(source, "trace.jsonl") : source;
    const lines = readTraceLines(file);
    const out = outFile ?? file.replace(/\.jsonl$/, ".md");
    const title = options.title ?? `Trace of ${relativeToRoot(file)}`;
    writeFileSync(out, renderTrace(lines, { ...options, title }));
    return out;
}

if (isMain(import.meta.url)) {
    const args = process.argv.slice(2);
    const opt = (name: string): string | undefined => {
        const i = args.indexOf(name);
        return i >= 0 ? args[i + 1] : undefined;
    };
    const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
    if (!positional[0]) {
        console.error("usage: node dist/scripts/render-trace.js <task dir | trace.jsonl> [out.md] [--title ...] [--prompt <role prompt file>]");
        process.exit(2);
    }
    const written = renderTraceFile(fromRoot(positional[0]), positional[1] ? fromRoot(positional[1]) : undefined, { title: opt("--title"), promptFile: opt("--prompt") });
    console.log(relativeToRoot(written));
}
