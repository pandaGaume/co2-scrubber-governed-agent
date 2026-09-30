/**
 * The harness's graph (2026-09-30, docs/evaluateur.fr.md, E0 and E1): what the tasks of one workshop or several did and under what,
 * as a SpikyPanda graph (core Graph, GraphNode, GraphOLink) typed by the ontology of `specs/harness/graph.json`, the way the physics
 * knowledge graph is. It is derived: rebuilt from the sources whenever it is read (the manifests, the episodes, the traces, the store
 * of the texts a model read), never a second source of truth, and no model writes it. The evaluator's findings are the one thing
 * added to it that the sources do not hold: its own writing (`addFinding`).
 *
 *   task        --ran-by-->       model          --ran-under--> fingerprint --read--> statement (every text its model was given,
 *                                                                                      the memory's entries in its state too)
 *   attempt     --of-->           episode        --of--> task;  attempt --calls--> capability
 *   attempt     --refused-for-->  form           (by the guard, or by the harness before it: cut, schema, a repeat)
 *   step        --of-->           task           (a step refused or failed outside the judged capabilities) --refused-for--> form
 *   episode     --corrected-by--> correction     --answers--> form   (X refused, Y accepted or the field removed)
 *   fingerprint --after-->        fingerprint    (in the order tasks first ran under them)
 *   fingerprint --changed-->      statement      (a text it holds in a version the fingerprint before held another of)
 *   finding     --about-->        any node
 *
 * Several workshops (the repository's and forks') give one graph: a task a fork inherited from the one it was made from is the same
 * task (its id and its start), counted once; tasks of different workshops that share an id are told apart by the workshop's name.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { Graph, GraphNode, GraphOLink, ONTOLOGY, type INode, type IOlink } from "@spiky-panda/core";
import { fromRoot } from "./paths.js";
import { cutSteps, episodesOf, type EpisodeReading } from "./working-memory.js";
import { shapesOf } from "./reflection.js";
import { outcomeOf, type AttemptOutcome, type StepLike } from "../harness/core/episodes.js";
import { codesOf, stated, statementKey, type Register, type Statement, type TextVersion } from "./rules-register.js";
import { readMemory } from "./memory.js";

export const HARNESS_GRAPH_FILE = "specs/harness/graph.json";

export const H = {
    item: "harness.item",
    task: "harness.task",
    episode: "harness.episode",
    attempt: "harness.attempt",
    step: "harness.step",
    capability: "harness.capability",
    form: "harness.form",
    correction: "harness.correction",
    model: "harness.model",
    fingerprint: "harness.fingerprint",
    statement: "harness.statement",
    finding: "harness.finding",
    rule: "harness.rule",
    convention: "harness.convention",
    memoryEntry: "harness.memory-entry",
    link: "harness.link",
    of: "harness.of",
    calls: "harness.calls",
    ranBy: "harness.ran-by",
    ranUnder: "harness.ran-under",
    read: "harness.read",
    refusedFor: "harness.refused-for",
    correctedBy: "harness.corrected-by",
    answers: "harness.answers",
    after: "harness.after",
    changed: "harness.changed",
    about: "harness.about",
    states: "harness.states",
    applies: "harness.applies",
    restsOn: "harness.rests-on",
} as const;

/** How a topic's tasks are read: their episodes, and the register of its guard's rules when it has one (E2). */
export type HarnessReading = EpisodeReading & { register?: Register | null };

type Bag = Record<string, unknown>;
export type HarnessNode = GraphNode<Bag>;
export type HarnessLink = GraphOLink<Bag>;

/** A workshop the graph reads, by the name its tasks are told apart by (a fork's id; "" for a graph of one). */
export interface Workshop {
    name: string;
    dir: string;
}

/** What of a manifest the graph reads besides its episode. */
interface ManifestLike {
    taskId?: string;
    topic: string;
    state?: string;
    startedAt?: string;
    ended?: string | null;
    provider?: { name?: string; model?: string; family?: string };
    tools?: { sha256?: string; contract?: string; list?: Array<{ id: string; sha256?: string }> };
    words?: { file: string; sha256: string } | null;
    prompt?: { file: string | null; sha256: string | null };
    profile?: { file: string; sha256: string | null };
    context?: { repository: string | null; fork: string | null };
    steps?: Array<StepLike & { tokens?: { prompt?: number; completion?: number } | null }>;
}

export const shortSha = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 12);

/**
 * The form of a refusal the harness made before any guard: what it says, its ids, quotes and numbers taken out, as `shapesOf` does
 * for the guard's; a label ("Invalid capability arguments") keeps its first detail, which is what tells one refusal from another.
 */
export function harnessShapeOf(outcome: AttemptOutcome, reason: string | null): string {
    if (outcome === "TRUNCATED") return "cut at the output limit";
    const text = String(reason ?? "")
        .replace(/"[^"]*"/g, "…")
        .replace(/\b[A-Za-z_][\w-]*(\.[\w*-]+)+\b/g, "*");
    const [head, next] = text.split(/:\s+/);
    const shape = head.length < 40 && next ? `${head}: ${next.split(/[,;]/)[0]}` : head;
    return shape
        .replace(/-?\d+(\.\d+)?/g, "#")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
}

/** The memory's entries a task's model was given in its state, read from its trace (the lines that carry some), by their rule. */
const memoryCache = new Map<string, { key: string; rules: Array<{ rule: string; status: string | null }> }>();
function memoryRead(dir: string): Array<{ rule: string; status: string | null }> {
    const file = path.join(dir, "trace.jsonl");
    if (!existsSync(file)) return [];
    const st = statSync(file);
    const key = `${st.size}:${st.mtimeMs}`;
    const known = memoryCache.get(file);
    if (known?.key === key) return known.rules;
    const rules = new Map<string, string | null>();
    for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.includes('"learned":[{')) continue;
        try {
            const found: unknown[] = [];
            JSON.parse(line, (k, v) => {
                if (k === "learned" && Array.isArray(v)) found.push(...v);
                return v;
            });
            for (const e of found as Array<{ rule?: unknown; status?: unknown }>) if (typeof e?.rule === "string" && !rules.has(e.rule)) rules.set(e.rule, typeof e.status === "string" ? e.status : null);
        } catch {
            // a line cut by a crash says nothing
        }
    }
    const out = [...rules].map(([rule, status]) => ({ rule, status }));
    memoryCache.set(file, { key, rules: out });
    return out;
}

let registered = false;
function registerOntology(): void {
    if (registered) return;
    const spec = JSON.parse(readFileSync(fromRoot(...HARNESS_GRAPH_FILE.split("/")), "utf8")) as { types: Array<{ id: string; superType?: string }> };
    for (const t of spec.types) if (!ONTOLOGY.has(t.id)) ONTOLOGY.register({ id: t.id, ...(t.superType ? { superType: t.superType } : {}) });
    registered = true;
}

export class HarnessGraph {
    graph: Graph<HarnessNode, HarnessLink>;
    private readonly byId = new Map<string, HarnessNode>();
    private readonly nodes: HarnessNode[] = [];
    private readonly links: HarnessLink[] = [];

    /** Built from the tasks of a workshop (or of several), for the topics given with how their episodes are read (their judges and digest). */
    constructor(workshops: string | Workshop[], readings: Record<string, HarnessReading>) {
        registerOntology();
        const list: Workshop[] = typeof workshops === "string" ? [{ name: "", dir: workshops }] : workshops;
        const fingerprints: Array<{ node: HarnessNode; first: string; slots: Map<string, string> }> = [];
        // A task by its id and start, and by the workshop that holds it (a fork's inherited tasks too): what a memory's evidence names.
        const seen = new Map<string, string>();
        const aliases = new Map<string, string>();
        // The register of each topic's rules (E2): its rules, the conventions they assume, and the texts of the contract that state them.
        const contract = new Map<string, Array<{ stmt: Statement; node: HarnessNode }>>();
        for (const [topic, reading] of Object.entries(readings)) {
            const register = reading.register;
            if (!register) continue;
            const stmts: Array<{ stmt: Statement; node: HarnessNode }> = [];
            const stmtNode = (s: Statement): HarnessNode => {
                const n = this.node(`statement:contract:${shortSha(statementKey(s))}`, H.statement, { kind: "contract", ...(s.library ? { library: s.library } : { file: s.file }), ...(s.pointer ? { pointer: s.pointer } : {}), phrase: s.phrase });
                if (!stmts.some((x) => x.node === n)) stmts.push({ stmt: s, node: n });
                return n;
            };
            for (const [name, c] of Object.entries(register.conventions)) {
                const cn = this.node(`convention:${topic}:${name}`, H.convention, { topic, name, note: c.note ?? null });
                for (const s of c.states) this.link(stmtNode(s), cn, H.states);
            }
            for (const r of register.rules) {
                const rn = this.node(`rule:${topic}:${r.code}`, H.rule, { topic, code: r.code, status: r.status, signed: r.signed, ...(r.kind ? { kind: r.kind } : {}), ...(r.note ? { note: r.note } : {}) });
                for (const s of r.states) this.link(stmtNode(s), rn, H.states);
                for (const c of r.applies) {
                    const cn = this.byId.get(`convention:${topic}:${c}`);
                    if (cn) this.link(rn, cn, H.applies);
                }
            }
            contract.set(topic, stmts);
        }
        const memories: Array<{ name: string; dir: string; topic: string }> = [];
        for (const { name, dir: workshop } of list) {
            // The commit a fork was made from: before E0 a manifest's digest of the tools left their input schemas out, so the fork's
            // origin is what tells two states of the contract apart (a fork's record is two levels up, <fork>/outputs/factory, or beside
            // the tasks in a copy of them, as the evaluator's corpus is).
            const record = [path.join(workshop, "..", "..", "fork.json"), path.join(workshop, "fork.json")].map((f) => readJson<{ origin?: { commit?: string } }>(f)).find(Boolean);
            const origin = record?.origin?.commit ?? null;
            for (const [topic, reading] of Object.entries(readings)) {
                memories.push({ name, dir: workshop, topic });
                for (const e of episodesOf(workshop, topic, reading)) {
                    // A task a fork inherited is the one it was made from: counted once, under the first workshop that holds it.
                    const same = `${e.taskId}|${e.at ?? ""}`;
                    const known = seen.get(same);
                    if (known) {
                        aliases.set(`${name}|${e.taskId}`, known);
                        continue;
                    }
                    const q = name ? `${name}/${e.taskId}` : e.taskId;
                    seen.set(same, q);
                    aliases.set(`${name}|${e.taskId}`, q);
                    const dir = path.join(workshop, e.taskId);
                    const m = readJson<ManifestLike>(path.join(dir, "manifest.json"));
                    const request = readJson<{ task?: { requestedBy?: string; objective?: unknown; observations?: unknown } }>(path.join(dir, "task.json"));
                    const steps = m?.steps ?? [];
                    // The texts the task was given, at the version it ran under; the library documents it read before its first submission.
                    const version = versionOf(workshop, m, origin);
                    const firstJudged = e.attempts.find((a) => a.outcome === "ACCEPTED" || a.outcome === "GUARD_REJECTED")?.step ?? Infinity;
                    const libraryRead = new Set(
                        steps
                            .filter((s) => s.capability === "library.read" && s.outcome === "completed" && s.n < firstJudged)
                            .map((s) => (s.input as { id?: unknown } | null)?.id)
                            .filter((x): x is string => typeof x === "string"),
                    );
                    const task = this.node(`task:${q}`, H.task, {
                        taskId: e.taskId,
                        ...(name ? { workshop: name } : {}),
                        topic,
                        state: m?.state ?? null,
                        startedAt: e.at,
                        ended: e.ended,
                        intent: e.intent,
                        // Who asked, which tells one task of an experiment from another (the same request run by two models is the same case).
                        requestedBy: request?.task?.requestedBy ?? null,
                        // The request as asked, its measurements and times out: the same case run twice (by two models, in two forks) has the same.
                        case: shortSha(JSON.stringify([request?.task?.requestedBy ?? null, request?.task?.objective ?? null, request?.task?.observations ?? null], (_k, v: unknown) => (typeof v === "number" || (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v)) ? undefined : v))),
                        // How the model was run (its output limit, its effort): not a text it read, so not in the fingerprint.
                        profile: m?.profile?.sha256 ? { file: m.profile.file, sha256: m.profile.sha256 } : null,
                        // The version of the contract it ran under (null: not known, a manifest of a workshop that is no fork, before E0).
                        version: version ? { commit: version.commit, where: version.cwd === fromRoot() ? "repository" : "fork" } : null,
                        steps: steps.length,
                        inputTokens: steps.reduce((a, s) => a + (s.tokens?.prompt ?? 0), 0),
                        outputTokens: steps.reduce((a, s) => a + (s.tokens?.completion ?? 0), 0),
                    });
                    const model = this.node(`model:${m?.provider?.model ?? "unknown"}`, H.model, { model: m?.provider?.model ?? null, provider: m?.provider?.name ?? null, family: m?.provider?.family ?? null });
                    this.link(task, model, H.ranBy);
                    // What the task ran under, and every text its model was given.
                    const slots = new Map<string, string>();
                    for (const t of m?.tools?.list ?? []) if (t.sha256) slots.set(`tool:${t.id}`, t.sha256);
                    if (m?.words?.sha256) slots.set(`words:${m.words.file}`, m.words.sha256);
                    if (m?.prompt?.sha256) slots.set(`prompt:${m.prompt.file ?? "?"}`, m.prompt.sha256);
                    const detailed = Boolean(m?.tools?.contract);
                    const key = [m?.tools?.contract ?? m?.tools?.sha256 ?? "-", m?.words?.sha256 ?? "-", m?.prompt?.sha256 ?? "-", ...(detailed || !origin ? [] : [origin])].join("|");
                    const fpId = `fingerprint:${shortSha(key)}`;
                    const fresh = !this.byId.has(fpId);
                    const fp = this.node(fpId, H.fingerprint, { tools: m?.tools?.contract ?? m?.tools?.sha256 ?? null, toolsDetailed: detailed, words: m?.words?.sha256 ?? null, prompt: m?.prompt?.sha256 ?? null, repository: m?.context?.repository ?? (detailed ? null : origin), fork: m?.context?.fork ?? null });
                    if (fresh) fingerprints.push({ node: fp, first: e.at ?? e.taskId, slots });
                    else {
                        const known = fingerprints.find((f) => f.node === fp);
                        if (known && String(e.at ?? e.taskId) < known.first) known.first = e.at ?? e.taskId;
                    }
                    this.link(task, fp, H.ranUnder);
                    for (const [slot, sha] of slots) this.link(task, this.statement(workshop, slot, sha), H.read);
                    // The register's statements the texts it was given held (a library document's only if it read it before submitting).
                    if (version) for (const { stmt, node } of contract.get(topic) ?? []) if (stated(stmt, version, libraryRead)) this.link(task, node, H.read, { contract: true });
                    // The memory's entries in its state: texts it read too, which no fingerprint holds.
                    for (const r of memoryRead(dir)) this.link(task, this.node(`statement:memory:${shortSha(r.rule)}`, H.statement, { slot: `memory:${topic}`, kind: "memory", of: topic, text: r.rule.slice(0, 400) }), H.read, { status: r.status });
                    // The episode, its attempts, the forms they were refused for, and what answered each.
                    const episode = this.node(`episode:${q}`, H.episode, { finalOutcome: e.finalOutcome, action: e.action });
                    this.link(episode, task, H.of);
                    const order = new Map(e.attempts.map((a, i) => [a.step, i]));
                    for (const a of e.attempts) {
                        const attempt = this.node(`attempt:${q}:${a.step}`, H.attempt, { step: a.step, capability: a.capability, outcome: a.outcome, ...(a.reason && a.outcome !== "ACCEPTED" ? { reason: a.reason.slice(0, 400) } : {}) });
                        this.link(attempt, episode, H.of);
                        this.link(attempt, this.capability(a.capability), H.calls);
                        if (a.outcome === "PRE_GUARD_REJECTED" || a.outcome === "TRUNCATED") this.link(attempt, this.harnessForm(topic, a.outcome, a.reason), H.refusedFor, { by: "harness" });
                        if (a.outcome !== "GUARD_REJECTED") continue;
                        for (const p of a.problems.filter((x) => x.kind)) {
                            const shape = shapesOf(p.says)[0];
                            if (!shape) continue;
                            this.link(attempt, this.guardForm(topic, shape, p.kind!, p.says), H.refusedFor, { by: "guard", path: p.path ?? null });
                        }
                    }
                    for (const c of e.contrasts) {
                        const correction = this.node(`correction:${q}:${c.path}`, H.correction, {
                            path: c.path,
                            kind: c.kind,
                            refused: c.rejected.argument,
                            accepted: c.accepted?.argument ?? null,
                            // The next accepted attempt did not send the field again: the fix was to take it out, or was elsewhere.
                            removed: !c.accepted,
                            // How many attempts after the refused one the accepted one came: 1 is the first retry.
                            retries: (order.get(e.attempts.find((a) => a.outcome === "ACCEPTED")?.step ?? -1) ?? 0) - (order.get(c.rejected.step) ?? 0),
                        });
                        this.link(episode, correction, H.correctedBy);
                        const shape = shapesOf(c.rejected.says)[0];
                        if (shape) this.link(correction, this.guardForm(topic, shape, c.kind ?? null, c.rejected.says), H.answers);
                    }
                    // The steps refused or failed outside the capabilities the guard judges: a read refused as a repeat, a schema refusal, a cut.
                    const judged = new Set(e.attempts.map((a) => a.step));
                    const cut = steps.some((s) => s.truncated !== undefined) ? new Set<number>() : cutSteps(dir);
                    for (const s of steps) {
                        if (s.outcome === "completed" || judged.has(s.n) || !s.capability) continue;
                        const outcome: AttemptOutcome = s.truncated || cut.has(s.n) ? "TRUNCATED" : outcomeOf(s);
                        const step = this.node(`step:${q}:${s.n}`, H.step, { step: s.n, capability: s.capability, outcome, ...(s.reason ? { reason: s.reason.slice(0, 400) } : {}) });
                        this.link(step, task, H.of);
                        this.link(step, this.capability(s.capability), H.calls);
                        if (outcome !== "CAPABILITY_FAILED") this.link(step, this.harnessForm(topic, outcome, s.reason), H.refusedFor, { by: "harness" });
                    }
                }
            }
        }
        // Each guard's form, of the rule of the register its refusal is recognised as.
        for (const [topic, reading] of Object.entries(readings)) {
            if (!reading.register) continue;
            for (const f of this.nodes.filter((n) => n.type === H.form && n.bag?.topic === topic && n.bag?.by === "guard"))
                for (const code of codesOf(reading.register, String(f.bag?.sample ?? ""))) {
                    const rule = this.byId.get(`rule:${topic}:${code}`);
                    if (rule) this.link(f, rule, H.of);
                }
        }
        // The memory's entries of each workshop, on the episodes their evidence names (an entry a fork inherited, once).
        const rests = new Set<string>();
        for (const { name, dir, topic } of memories)
            for (const entry of readMemory(dir, topic).entries) {
                const mn = this.node(`memory:${topic}:${entry.id}`, H.memoryEntry, { id: entry.id, topic, rule: entry.rule.slice(0, 400), kind: entry.kind, status: entry.status, confidence: entry.confidence as unknown, since: entry.since, judgedOn: entry.judgedOn });
                for (const failure of entry.evidence?.failures ?? []) {
                    const q = aliases.get(`${name}|${failure.split("#")[0]}`);
                    const episode = q ? this.byId.get(`episode:${q}`) : undefined;
                    if (!episode || rests.has(`${mn.id}|${episode.id}`)) continue;
                    rests.add(`${mn.id}|${episode.id}`);
                    this.link(mn, episode, H.restsOn);
                }
            }
        // The fingerprints in the order tasks first ran under them; what each changed from the one before it.
        fingerprints.sort((a, b) => a.first.localeCompare(b.first));
        for (let i = 1; i < fingerprints.length; i++) {
            const before = fingerprints[i - 1];
            const now = fingerprints[i];
            this.link(now.node, before.node, H.after);
            for (const [slot, sha] of now.slots) {
                const was = before.slots.get(slot);
                if (was === sha || (was === undefined && before.slots.size === 0)) continue;
                this.link(now.node, this.statement(list[0].dir, slot, sha), H.changed, { slot, was: was ?? null });
            }
            for (const [slot, was] of before.slots) if (!now.slots.has(slot) && now.slots.size) this.link(now.node, this.node(`statement:removed:${slot}`, H.statement, { slot, removed: true }), H.changed, { slot, was });
        }
        this.graph = new Graph<HarnessNode, HarnessLink>(this.nodes, this.links);
    }

    /** A text a model read, by its sha256, with where it is kept when a workshop's store holds it. */
    private statement(workshop: string, slot: string, sha: string): HarnessNode {
        const stored = path.join(workshop, "_statements", `${sha}.json`);
        const [kind, ...rest] = slot.split(":");
        return this.node(`statement:${sha}`, H.statement, { slot, kind, of: rest.join(":"), sha256: sha, stored: existsSync(stored) ? path.relative(workshop, stored).split(path.sep).join("/") : null });
    }

    private capability(id: string): HarnessNode {
        return this.node(`capability:${id}`, H.capability, { id });
    }

    private guardForm(topic: string, shape: string, kind: string | null, sample: string): HarnessNode {
        // One problem it was made of, whole: what the register recognises the rule by.
        return this.node(`form:${topic}:${shortSha(shape)}`, H.form, { topic, shape, kind, by: "guard", sample: sample.slice(0, 400) });
    }

    private harnessForm(topic: string, outcome: AttemptOutcome, reason: string | null): HarnessNode {
        const shape = harnessShapeOf(outcome, reason);
        return this.node(`form:${topic}:harness:${shortSha(shape)}`, H.form, { topic, shape, kind: outcome, by: "harness" });
    }

    private node(id: string, type: string, bag: Bag): HarnessNode {
        const known = this.byId.get(id);
        if (known) return known;
        const node = new GraphNode<Bag>();
        node.id = id;
        node.type = type;
        node.bag = { ...bag };
        this.byId.set(id, node);
        this.nodes.push(node);
        return node;
    }

    private link(a: HarnessNode, b: HarnessNode, type: string, bag: Bag = {}): HarnessLink {
        const link = new GraphOLink<Bag>(a, b);
        link.type = type;
        link.bag = { ...bag };
        this.links.push(link);
        return link;
    }

    /** The evaluator's own writing: a finding, about the nodes it names (those the graph holds). */
    addFinding(id: string, bag: Bag, about: string[]): HarnessNode {
        const f = this.node(`finding:${id}`, H.finding, bag);
        for (const a of about) {
            const n = this.byId.get(a);
            if (n) this.link(f, n, H.about);
        }
        this.graph = new Graph<HarnessNode, HarnessLink>(this.nodes, this.links);
        return f;
    }

    get(id: string): HarnessNode | undefined {
        return this.byId.get(id);
    }

    /** The nodes of a type (or of a type under it in the ontology). */
    nodesOf(type: string): HarnessNode[] {
        return this.graph.nodes.filter((n) => ONTOLOGY.isA(n.type, type));
    }

    /** The links leaving a node, of a type. */
    out(node: INode, type: string = H.link): HarnessLink[] {
        return node.onsc<HarnessLink>((l: IOlink) => ONTOLOGY.isA(l.type, type));
    }

    /** The links arriving at a node, of a type. */
    in(node: INode, type: string = H.link): HarnessLink[] {
        return node.opsc<HarnessLink>((l: IOlink) => ONTOLOGY.isA(l.type, type));
    }

    /** How many nodes of each type, and links of each type: what a reading of the graph shows first. */
    summary(): { nodes: Record<string, number>; links: Record<string, number> } {
        const count = (xs: Array<{ type?: string }>): Record<string, number> => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [String(x.type)]: (m[String(x.type)] ?? 0) + 1 }), {});
        return { nodes: count(this.graph.nodes), links: count(this.links) };
    }
}

/**
 * Where a task's texts are read at the version it ran under: its fork's git at the fork's commit (E0 on), the repository at its commit
 * or at the commit the fork was made from, and its words as the workshop's store kept them. Null when nothing says which version.
 */
function versionOf(workshop: string, m: ManifestLike | null, origin: string | null): TextVersion | null {
    const stored = m?.words?.sha256 ? readJson<{ text?: string }>(path.join(workshop, "_statements", `${m.words.sha256}.json`)) : null;
    const words = stored?.text && m?.words ? { words: { file: m.words.file, text: stored.text } } : {};
    const forkGit = path.join(workshop, "..", "..");
    if (m?.context?.fork && existsSync(path.join(forkGit, ".git"))) return { cwd: forkGit, commit: m.context.fork, ...words };
    const commit = m?.context?.repository ?? origin;
    return commit ? { cwd: fromRoot(), commit, ...words } : null;
}

function readJson<T>(file: string): T | null {
    try {
        return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
        return null;
    }
}
