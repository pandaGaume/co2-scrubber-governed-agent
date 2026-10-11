/**
 * A take of the night agent, readable (2026-10-11): one section per event, then one per decision, with what the agent observed, what
 * the model was sent (the system prompt once, then only the messages added since its previous call in the event), its reasoning, its
 * answer, what the call returned, the tokens; the crew's console, the board's rows when the world ran without the agent, the scorecard.
 * Nothing is summarised: what the model saw and said is here whole. Written by the runner beside the trace (log.md); also run on a take
 * already recorded:
 *
 *     node dist/tier3/lib/take-log.js outputs/tier3/sessions/<stamp>-<id>/<provider>-<guard>
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { isMain } from "../../lib/paths.js";

interface Message {
    role: string;
    content: unknown;
}
interface Exchange {
    model?: string;
    request?: { system?: string; messages?: Message[] } | null;
    response?: { choices?: Array<{ finish_reason?: string; message?: { content?: string; reasoning?: string; reasoning_content?: string; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>; usage?: Record<string, unknown> } | null;
    latencyMs?: number;
}
interface Row {
    event: string;
    minute: number;
    step: number;
    failed?: string;
    decision?: { invocation?: { capabilityId?: string; input?: unknown }; rationale?: string };
    result?: { ok?: boolean; output?: unknown; error?: string };
    outcome?: string;
    stateBefore?: { features?: unknown };
    exchange?: Exchange | null;
    latencyMs?: number;
    source?: string;
}

const fence = (value: unknown, lang = "json"): string => {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    const ticks = text.includes("```") ? "````" : "```";
    return `${ticks}${lang}\n${text}\n${ticks}`;
};
const textOf = (content: unknown): string => (typeof content === "string" ? content : JSON.stringify(content, null, 2));
const readLines = (file: string): unknown[] => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as unknown) : []);

/** The take's log, from what the runner wrote in its directory. */
export function renderTakeLog(dir: string): string {
    const rows = readLines(path.join(dir, "trace.jsonl")) as Row[];
    const consoleRows = readLines(path.join(dir, "console.jsonl")) as Array<{ kind: string; message: string; review?: { verdict?: string } }>;
    const boardRows = readLines(path.join(dir, "board.jsonl")) as Array<Record<string, unknown>>;
    const manifest = fs.existsSync(path.join(dir, "manifest.json")) ? (JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as Record<string, unknown>) : {};
    const scorecard = fs.existsSync(path.join(dir, "scorecard.json")) ? (JSON.parse(fs.readFileSync(path.join(dir, "scorecard.json"), "utf8")) as Record<string, unknown>) : {};
    const inputs = (manifest.inputs ?? {}) as Record<string, { file?: string; sha256?: string } | null>;
    const out: string[] = [];
    out.push(`# Take ${path.basename(path.dirname(dir))}`, "");
    out.push(`- **directory**: \`${dir.replace(/\\/g, "/")}\``);
    out.push(`- **ran on**: ${String(manifest.ranOn ?? "?")}`);
    out.push(`- **model**: ${String(scorecard.model ?? manifest.model ?? "?")} (${String(scorecard.provider ?? manifest.provider ?? "?")}), guard ${String(scorecard.guardMode ?? manifest.guardMode ?? "?")}`);
    for (const [k, v] of Object.entries(inputs)) if (v && typeof v === "object" && v.file) out.push(`- **${k}**: \`${v.file}\` (sha256 ${String(v.sha256 ?? "").slice(0, 12)})`);
    out.push(`- **decisions**: ${String(scorecard.decisions ?? rows.length)}, reasoner calls ${String(scorecard.reasonerCalls ?? "?")}, tokens ${String(scorecard.tokens ?? "?")}, ${Math.round(Number(scorecard.elapsedMs ?? 0) / 1000)} s`);
    out.push(`- **refused**: by the policy ${String(scorecard.policyDenied ?? 0)}, by the device ${String(scorecard.deviceRefused ?? 0)}, reports ${String(scorecard.reportsRefused ?? 0)}`, "");

    if (boardRows.length) {
        out.push("## The board while the world ran without the agent", "");
        out.push("| at | world minute | x | CO2 ppm | motor | emission estimate | last guard action |", "|---|---|---|---|---|---|---|");
        let last = "";
        for (const b of boardRows) {
            const action = String(b.lastAction ?? "");
            const keep = action !== last || b === boardRows[0] || b === boardRows[boardRows.length - 1];
            if (!keep) continue;
            last = action;
            out.push(`| ${String(b.at ?? "").slice(11, 19)} | ${String(b.worldMinute ?? "")} | ${String(b.timeScale ?? "")} | ${String(b.co2Ppm ?? "")} | ${b.power ? `on ${String(b.speedPercent)} %` : "off"} | ${String(b.emissionEstimate ?? "")} | ${action.replace(/\|/g, "/")} |`);
        }
        out.push("", `(${boardRows.length} rows in board.jsonl; a row here when the guard's last action changes, and the first and last.)`, "");
    }

    let systemShown: string | null = null;
    let event = "";
    let seen = 0;
    for (const r of rows) {
        if (r.event !== event) {
            event = r.event;
            seen = 0;
            out.push(`## Event ${r.event} (minute ${r.minute})`, "");
        }
        const capability = r.decision?.invocation?.capabilityId ?? (r.exchange as { proposedCapabilityId?: string } | null)?.proposedCapabilityId ?? "?";
        const status = r.failed ? `stopped by the harness: ${r.failed}` : `${r.outcome ?? "?"}${r.result?.error ? ` (${r.result.error})` : ""}`;
        out.push(`### Step ${r.step}: ${capability} -> ${status}`, "");
        const x = r.exchange ?? null;
        const usage = (x?.response?.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
        out.push(`- source: ${r.source ?? (x ? "the model" : "?")}; ${x?.model ?? ""}; ${x?.latencyMs ?? r.latencyMs ?? "?"} ms; tokens ${usage.prompt_tokens ?? "?"} in (${usage.prompt_tokens_details?.cached_tokens ?? 0} from cache), ${usage.completion_tokens ?? "?"} out; finish ${x?.response?.choices?.[0]?.finish_reason ?? "?"}`);
        if (r.decision?.invocation) out.push("- input:", "", fence(r.decision.invocation.input ?? {}), "");
        if (r.stateBefore?.features) out.push("<details><summary><b>observation</b></summary>", "", fence(r.stateBefore.features), "", "</details>", "");
        if (x?.request) {
            const system = x.request.system ?? "";
            if (system && system !== systemShown) {
                out.push("<details><summary><b>system prompt</b></summary>", "", fence(system, "text"), "", "</details>", "");
                systemShown = system;
            }
            const messages = x.request.messages ?? [];
            const fresh = messages.slice(seen);
            seen = messages.length;
            if (fresh.length) out.push("<details><summary><b>sent</b> (the messages added since the previous call)</summary>", "", ...fresh.map((m) => `**${m.role}**:\n\n${fence(textOf(m.content), "text")}\n`), "</details>", "");
        }
        const answer = x?.response?.choices?.[0]?.message;
        if (answer) {
            const reasoning = answer.reasoning ?? answer.reasoning_content;
            if (reasoning) out.push("<details><summary><b>reasoning</b></summary>", "", fence(reasoning, "text"), "", "</details>", "");
            const calls = (answer.tool_calls ?? []).map((c) => `${c.function?.name ?? "?"} ${c.function?.arguments ?? ""}`);
            if (calls.length) out.push("**answered**:", "", fence(calls.join("\n"), "text"), "");
            if (answer.content) out.push("**content**:", "", fence(answer.content, "text"), "");
        }
        if (r.decision?.rationale) out.push(`- rationale: ${r.decision.rationale}`, "");
        if (r.result) out.push("<details><summary><b>result</b></summary>", "", fence(r.result.ok ? (r.result.output ?? null) : { error: r.result.error, output: r.result.output ?? null }), "", "</details>", "");
    }

    if (consoleRows.length) {
        out.push("## The crew's console", "");
        for (const c of consoleRows) out.push(`- **${c.kind}**${c.review?.verdict ? ` (read: ${c.review.verdict})` : ""}: ${c.message}`);
        out.push("");
    }
    out.push("## Scorecard", "", fence(scorecard), "");
    return out.join("\n");
}

/** Writes log.md beside the take's trace. */
export function writeTakeLog(dir: string): string {
    const file = path.join(dir, "log.md");
    fs.writeFileSync(file, renderTakeLog(dir));
    return file;
}

if (isMain(import.meta.url)) {
    for (const dir of process.argv.slice(2)) console.log(writeTakeLog(dir));
}
