/**
 * The run log of a test (2026-10-09): for every test, a structured account of how the harness worked, kept outside the
 * repository under `.logs/<id>/`:
 *
 *   README.md   what the test is: its id, when, the command, the commit, what it exercises, the models; its outcome at the end
 *   log.md      what happened, in order: each harness step node by node (what each node got and gave), and each language
 *               model call whole: the request with the parts a cache can serve marked, and the answer
 *
 * The language model calls are taken at the wire (`fetch`), whatever slot or wire made them (a factory's decision, the
 * interpreter, a composed line): what was sent is what is logged, the tools' schemas and the sampling included. A part is
 * marked cacheable when it repeats, byte for byte, the start of the previous request of the same conversation (same model,
 * system prompt and tools): providers cache a request's prefix. What the server says it served from its cache (`usage`) is
 * written beside it: the mark says what could be cached, the server's figure says what was.
 *
 * One log is open at a time in a process (`runLog()`); `openRunLog` closes the one before. Nothing is logged when none is open.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fromRoot } from "../../lib/paths.js";

export interface RunLogMeta {
    /** A short name of the test: the id starts with it. */
    name: string;
    /** What the test exercises, in a few sentences: the README's body. */
    description: string;
    /** The command that ran it, when there is one. */
    command?: string;
    /** Anything else worth keeping in the README (models, routing, profile, scenario...), as label -> value. */
    facts?: Record<string, string>;
}

export interface StepEntry {
    task: string;
    topic?: string;
    n: number;
    /** The nodes in order, each with what it got and what it gave (compact text or JSON). */
    nodes: Array<{ node: string; input?: unknown; output?: unknown; ms?: number }>;
    outcome: string;
}

const sha = (v: unknown): string => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v ?? null)).digest("hex").slice(0, 12);
const block = (v: unknown, lang = ""): string => {
    const text = typeof v === "string" ? v : JSON.stringify(v, null, 2);
    const fence = text.includes("```") ? "````" : "```";
    return `${fence}${lang}\n${text}\n${fence}`;
};
const json = (v: unknown): string => block(v, "json");
const stamp = (d = new Date()): string => d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

function gitCommit(): string {
    try {
        return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: fromRoot("."), encoding: "utf8" }).trim() + (execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: fromRoot("."), encoding: "utf8" }).trim() ? " (with uncommitted changes)" : "");
    } catch {
        return "unknown";
    }
}

/** What a request to a language model looks like on the wire: its parts, whatever the wire. */
interface WireRequest {
    model: string;
    system: unknown;
    tools: unknown[];
    messages: unknown[];
    settings: Record<string, unknown>;
}

function readRequest(body: Record<string, unknown>): WireRequest | null {
    if (typeof body.model !== "string") return null;
    const raw = (body.messages ?? body.input) as unknown;
    if (!Array.isArray(raw)) return null;
    let messages = raw;
    let system: unknown = body.system ?? body.instructions ?? null;
    // An OpenAI-compatible conversation carries its system prompt as its first message.
    const first = messages[0] as { role?: string; content?: unknown } | undefined;
    if (system === null && first?.role === "system") {
        system = first.content;
        messages = messages.slice(1);
    }
    const { model, messages: _m, input: _i, system: _s, instructions: _n, tools, ...settings } = body;
    return { model: model as string, system, tools: Array.isArray(tools) ? tools : [], messages, settings };
}

/** The tokens the server says it served from its cache, read from whichever usage fields the wire has. */
function cacheOf(usage: Record<string, unknown> | undefined): string {
    if (!usage) return "the server gave no usage";
    const details = usage.prompt_tokens_details as Record<string, unknown> | undefined;
    const prompt = usage.prompt_tokens ?? usage.input_tokens;
    const parts: string[] = [];
    if (typeof prompt === "number") parts.push(`prompt ${prompt} tokens`);
    if (typeof details?.cached_tokens === "number") parts.push(`${details.cached_tokens} served from cache (prompt_tokens_details.cached_tokens)`);
    if (typeof usage.prompt_cache_hit_tokens === "number") parts.push(`${usage.prompt_cache_hit_tokens} cache hit, ${usage.prompt_cache_miss_tokens ?? "?"} miss (prompt_cache_hit/miss_tokens)`);
    if (typeof usage.cache_read_input_tokens === "number") parts.push(`${usage.cache_read_input_tokens} read from cache, ${usage.cache_creation_input_tokens ?? 0} written to it (cache_read/creation_input_tokens)`);
    const completion = usage.completion_tokens ?? usage.output_tokens;
    if (typeof completion === "number") parts.push(`completion ${completion} tokens`);
    const reasoning = (usage.completion_tokens_details as Record<string, unknown> | undefined)?.reasoning_tokens;
    if (typeof reasoning === "number") parts.push(`of which ${reasoning} reasoning`);
    return parts.join(", ") || JSON.stringify(usage);
}

export class RunLog {
    readonly id: string;
    readonly dir: string;
    private readonly started = new Date();
    private llmCalls = 0;
    private readonly byModel = new Map<string, { calls: number; prompt: number; cached: number; completion: number }>();
    /** The last request of each conversation (model + system + tools), for the cacheable prefix. */
    private readonly lastOf = new Map<string, { call: number; messages: unknown[] }>();
    /** Where a system prompt or a tool list was first written in full. */
    private readonly firstSeen = new Map<string, number>();
    private steps = 0;
    private closed = false;
    /** How each harness task of the test ended, for the README. */
    private readonly tasks: string[] = [];

    constructor(private readonly meta: RunLogMeta) {
        this.id = `${meta.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}-${stamp(this.started)}-${Math.random().toString(36).slice(2, 6)}`;
        this.dir = fromRoot(path.join(".logs", this.id));
        mkdirSync(this.dir, { recursive: true });
        this.writeReadme(null);
        writeFileSync(path.join(this.dir, "log.md"), `# Log of ${this.id}\n\nTest \`${this.id}\` (see README.md). Started ${this.started.toISOString()}.\n\nEach harness step is written node by node (observe, context, lookup, gate, reason, interpret, guard, execute, observe-after, evaluate, record): what each node got and what it gave. Each language model call is written whole where it happened: the request, its parts marked \`cacheable\` when they repeat the start of the previous request of the same conversation, the cache the server reports, and the answer.\n`);
    }

    private append(text: string): void {
        if (this.closed) return;
        appendFileSync(path.join(this.dir, "log.md"), `\n${text}\n`);
    }

    private writeReadme(outcome: { text: string; facts?: Record<string, string> } | null): void {
        const facts = { ...(this.meta.facts ?? {}), ...(outcome?.facts ?? {}) };
        const models = [...this.byModel.entries()].map(([m, s]) => `| ${m} | ${s.calls} | ${s.prompt} | ${s.cached} | ${s.completion} |`);
        const lines = [
            `# Test ${this.id}`,
            "",
            `- **id**: \`${this.id}\``,
            `- **started**: ${this.started.toISOString()}`,
            ...(this.meta.command ? [`- **command**: \`${this.meta.command}\``] : []),
            `- **commit**: ${gitCommit()}`,
            ...Object.entries(facts).map(([k, v]) => `- **${k}**: ${v}`),
            "",
            "## What it exercises",
            "",
            this.meta.description,
            "",
            "## Outcome",
            "",
            outcome ? outcome.text : "_running: the outcome is written when the test ends._",
            "",
            ...(this.tasks.length ? ["### Harness tasks", "", ...this.tasks.map((t) => `- ${t}`), ""] : []),
            "## Language model calls",
            "",
            ...(models.length ? ["| model | calls | prompt tokens | served from cache | completion tokens |", "|---|---|---|---|---|", ...models, ""] : [outcome ? "None: no language model was called in this test." : "None so far.", ""]),
            `The whole account, step by step and call by call, is in [log.md](log.md) (${this.steps} harness steps, ${this.llmCalls} language model calls).`,
            "",
        ];
        writeFileSync(path.join(this.dir, "README.md"), lines.join("\n"));
    }

    /** A free section of the log: a phase of the test, a scenario's line, a task that starts or ends. */
    section(title: string, body?: unknown): void {
        this.append(`## ${title}${body === undefined ? "" : `\n\n${typeof body === "string" ? body : json(body)}`}`);
    }

    /** One harness step, node by node. */
    step(e: StepEntry): void {
        this.steps++;
        const out = [`### Step ${e.n} of task ${e.task}${e.topic ? ` (${e.topic})` : ""}: ${e.outcome}`, ""];
        for (const node of e.nodes) {
            out.push(`<details><summary><b>${node.node}</b>${node.ms !== undefined ? ` (${node.ms} ms)` : ""}</summary>`, "");
            if (node.input !== undefined) out.push("in:", "", typeof node.input === "string" ? block(node.input) : json(node.input), "");
            if (node.output !== undefined) out.push("out:", "", typeof node.output === "string" ? block(node.output) : json(node.output), "");
            out.push("</details>", "");
        }
        this.append(out.join("\n"));
    }

    /** One language model call, taken at the wire. */
    llm(url: string, body: Record<string, unknown>, status: number, response: unknown, ms: number): void {
        const req = readRequest(body);
        if (!req) return;
        const n = ++this.llmCalls;
        const usage = (response as { usage?: Record<string, unknown> } | null)?.usage;
        const stats = this.byModel.get(req.model) ?? { calls: 0, prompt: 0, cached: 0, completion: 0 };
        stats.calls++;
        stats.prompt += Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
        stats.cached += Number((usage?.prompt_tokens_details as Record<string, unknown> | undefined)?.cached_tokens ?? usage?.prompt_cache_hit_tokens ?? usage?.cache_read_input_tokens ?? 0);
        stats.completion += Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0);
        this.byModel.set(req.model, stats);

        const systemKey = `system:${sha(req.system)}`;
        const toolsKey = `tools:${sha(req.tools)}`;
        const conversation = `${req.model}|${systemKey}|${toolsKey}`;
        const previous = this.lastOf.get(conversation);
        let prefix = 0;
        if (previous) while (prefix < previous.messages.length && prefix < req.messages.length && JSON.stringify(previous.messages[prefix]) === JSON.stringify(req.messages[prefix])) prefix++;
        this.lastOf.set(conversation, { call: n, messages: req.messages });

        const out = [`### Language model call ${n}: ${req.model} (${ms} ms, HTTP ${status})`, "", `- endpoint: \`${url}\``, `- settings: \`${JSON.stringify(req.settings)}\``, `- cache reported by the server: ${cacheOf(usage)}`, ""];
        const once = (key: string, title: string, value: unknown): void => {
            const seen = this.firstSeen.get(key);
            if (seen) out.push(`**${title}** (cacheable): the same as in call ${seen} (sha256 ${key.split(":")[1]}).`, "");
            else {
                this.firstSeen.set(key, n);
                out.push(`<details><summary><b>${title}</b> (sha256 ${key.split(":")[1]}, written in full once; ${previous ? "cacheable" : "first of its conversation"})</summary>`, "", typeof value === "string" ? block(value) : json(value), "</details>", "");
            }
        };
        once(systemKey, "system prompt", req.system);
        once(toolsKey, `tools (${req.tools.length})`, req.tools);
        if (prefix > 0) out.push(`**messages 1 to ${prefix}** (cacheable): the same as the start of call ${previous!.call}, not repeated here.`, "");
        req.messages.slice(prefix).forEach((m, i) => {
            const role = (m as { role?: string }).role ?? (m as { type?: string }).type ?? "item";
            out.push(`**message ${prefix + i + 1}, ${role}** (new):`, "", json(m), "");
        });
        out.push("**answer**:", "", json(response), "");
        this.append(out.join("\n"));
    }

    /** A harness task ended: kept for the README's outcome. */
    taskEnded(taskId: string, topic: string, model: string, state: string, ended: string, steps: number): void {
        this.tasks.push(`${taskId} (${topic}, ${model}): ${state} after ${steps} step(s): ${ended.slice(0, 400)}`);
        this.writeReadme(null);
    }

    /** Ends the test: its outcome into the README. */
    close(outcome: string, facts?: Record<string, string>): void {
        if (this.closed) return;
        this.append(`## End\n\nEnded ${new Date().toISOString()}: ${outcome}`);
        this.writeReadme({ text: outcome, facts });
        this.closed = true;
        if (current === this) current = null;
    }
}

let current: RunLog | null = null;
let installed = false;

/** The log open in this process, or null. */
export function runLog(): RunLog | null {
    return current;
}

/** Opens a test's log (closing the one before), and takes the language model calls at the wire from now on. */
export function openRunLog(meta: RunLogMeta): RunLog {
    current?.close("closed: another test started");
    current = new RunLog(meta);
    if (!installed) {
        installed = true;
        const real = globalThis.fetch;
        globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
            const log = current;
            let body: Record<string, unknown> | null = null;
            if (log && typeof init?.body === "string" && (init.method ?? "GET").toUpperCase() === "POST") {
                try {
                    const parsed = JSON.parse(init.body) as unknown;
                    if (parsed && typeof parsed === "object" && "model" in parsed && ("messages" in parsed || "input" in parsed)) body = parsed as Record<string, unknown>;
                } catch {
                    body = null;
                }
            }
            const started = Date.now();
            const response = await real(input, init);
            if (log && body) {
                const text = await response.clone().text().catch(() => "");
                let parsed: unknown = text;
                try {
                    parsed = JSON.parse(text);
                } catch {
                    // kept as text
                }
                log.llm(String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url), body, response.status, parsed, Date.now() - started);
            }
            return response;
        }) as typeof fetch;
    }
    return current;
}
