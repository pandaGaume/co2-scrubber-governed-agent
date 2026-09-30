/**
 * The harness's graph (2026-09-30, docs/evaluateur.fr.md, E0): what the tasks of a workshop did and under what, as a SpikyPanda graph
 * (core Graph, GraphNode, GraphOLink) typed by the ontology of `specs/harness/graph.json`, the way the physics knowledge graph is. It
 * is derived: rebuilt from the sources whenever it is read (the manifests, the episodes, the store of the texts a model read), never
 * a second source of truth, and no model writes it.
 *
 *   task        --ran-by-->       model          --ran-under--> fingerprint --read--> statement (every text its model was given)
 *   attempt     --of-->           episode        --of--> task;  attempt --calls--> capability
 *   attempt     --refused-for-->  form           (the guard's own refusals, by their form)
 *   episode     --corrected-by--> correction     --answers--> form   (X refused, Y accepted, on the same field)
 *   fingerprint --after-->        fingerprint    (in the order tasks first ran under them)
 *   fingerprint --changed-->      statement      (a text it holds in a version the fingerprint before held another of)
 *
 * The first detectors of the evaluator (E1) are queries on it; the guard's rules and the contract's statements of them come with
 * their register (E2).
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { Graph, GraphNode, GraphOLink, ONTOLOGY, type INode, type IOlink } from "@spiky-panda/core";
import { fromRoot } from "./paths.js";
import { episodesOf, type EpisodeReading } from "./working-memory.js";
import { shapesOf } from "./reflection.js";

export const HARNESS_GRAPH_FILE = "specs/harness/graph.json";

export const H = {
    item: "harness.item",
    task: "harness.task",
    episode: "harness.episode",
    attempt: "harness.attempt",
    capability: "harness.capability",
    form: "harness.form",
    correction: "harness.correction",
    model: "harness.model",
    fingerprint: "harness.fingerprint",
    statement: "harness.statement",
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
} as const;

type Bag = Record<string, unknown>;
export type HarnessNode = GraphNode<Bag>;
export type HarnessLink = GraphOLink<Bag>;

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
    context?: { repository: string | null; fork: string | null };
    steps?: Array<{ tokens?: { prompt?: number; completion?: number } | null }>;
}

const short = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 12);

let registered = false;
function registerOntology(): void {
    if (registered) return;
    const spec = JSON.parse(readFileSync(fromRoot(...HARNESS_GRAPH_FILE.split("/")), "utf8")) as { types: Array<{ id: string; superType?: string }> };
    for (const t of spec.types) if (!ONTOLOGY.has(t.id)) ONTOLOGY.register({ id: t.id, ...(t.superType ? { superType: t.superType } : {}) });
    registered = true;
}

export class HarnessGraph {
    readonly graph: Graph<HarnessNode, HarnessLink>;
    private readonly byId = new Map<string, HarnessNode>();
    private readonly nodes: HarnessNode[] = [];
    private readonly links: HarnessLink[] = [];

    /** Built from a workshop's tasks, for the topics given with how their episodes are read (their judges and digest). */
    constructor(workshop: string, readings: Record<string, EpisodeReading>) {
        registerOntology();
        const fingerprints: Array<{ node: HarnessNode; first: string; slots: Map<string, string> }> = [];
        for (const [topic, reading] of Object.entries(readings)) {
            for (const e of episodesOf(workshop, topic, reading)) {
                const m = readManifest(path.join(workshop, e.taskId, "manifest.json"));
                const steps = m?.steps ?? [];
                const task = this.node(`task:${e.taskId}`, H.task, {
                    taskId: e.taskId,
                    topic,
                    state: m?.state ?? null,
                    startedAt: e.at,
                    ended: e.ended,
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
                const key = [m?.tools?.contract ?? m?.tools?.sha256 ?? "-", m?.words?.sha256 ?? "-", m?.prompt?.sha256 ?? "-"].join("|");
                const fpId = `fingerprint:${short(key)}`;
                const fresh = !this.byId.has(fpId);
                const fp = this.node(fpId, H.fingerprint, { tools: m?.tools?.contract ?? m?.tools?.sha256 ?? null, toolsDetailed: Boolean(m?.tools?.contract), words: m?.words?.sha256 ?? null, prompt: m?.prompt?.sha256 ?? null, repository: m?.context?.repository ?? null, fork: m?.context?.fork ?? null });
                if (fresh) fingerprints.push({ node: fp, first: e.at ?? e.taskId, slots });
                else {
                    const known = fingerprints.find((f) => f.node === fp);
                    if (known && String(e.at ?? e.taskId) < known.first) known.first = e.at ?? e.taskId;
                }
                this.link(task, fp, H.ranUnder);
                for (const [slot, sha] of slots) this.link(task, this.statement(workshop, slot, sha), H.read);
                // The episode, its attempts, the forms the guard refused them for, and what answered each.
                const episode = this.node(`episode:${e.taskId}`, H.episode, { finalOutcome: e.finalOutcome, action: e.action });
                this.link(episode, task, H.of);
                for (const a of e.attempts) {
                    const attempt = this.node(`attempt:${e.taskId}:${a.step}`, H.attempt, { step: a.step, capability: a.capability, outcome: a.outcome, ...(a.reason && a.outcome !== "ACCEPTED" ? { reason: a.reason.slice(0, 400) } : {}) });
                    this.link(attempt, episode, H.of);
                    this.link(attempt, this.node(`capability:${a.capability}`, H.capability, { id: a.capability }), H.calls);
                    if (a.outcome !== "GUARD_REJECTED") continue;
                    for (const p of a.problems.filter((x) => x.kind)) {
                        const shape = shapesOf(p.says)[0];
                        if (!shape) continue;
                        this.link(attempt, this.node(`form:${topic}:${short(shape)}`, H.form, { topic, shape, kind: p.kind }), H.refusedFor, { path: p.path ?? null });
                    }
                }
                for (const c of e.contrasts.filter((x) => x.accepted)) {
                    const correction = this.node(`correction:${e.taskId}:${c.path}`, H.correction, { path: c.path, kind: c.kind, refused: c.rejected.argument, accepted: c.accepted!.argument });
                    this.link(episode, correction, H.correctedBy);
                    const shape = shapesOf(c.rejected.says)[0];
                    if (shape) this.link(correction, this.node(`form:${topic}:${short(shape)}`, H.form, { topic, shape, kind: c.kind }), H.answers);
                }
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
                this.link(now.node, this.statement(workshop, slot, sha), H.changed, { slot, was: was ?? null });
            }
            for (const [slot, was] of before.slots) if (!now.slots.has(slot) && now.slots.size) this.link(now.node, this.node(`statement:removed:${slot}`, H.statement, { slot, removed: true }), H.changed, { slot, was });
        }
        this.graph = new Graph<HarnessNode, HarnessLink>(this.nodes, this.links);
    }

    /** A text a model read, by its sha256, with where it is kept when the store holds it. */
    private statement(workshop: string, slot: string, sha: string): HarnessNode {
        const stored = path.join(workshop, "_statements", `${sha}.json`);
        const [kind, ...rest] = slot.split(":");
        return this.node(`statement:${sha}`, H.statement, { slot, kind, of: rest.join(":"), sha256: sha, stored: existsSync(stored) ? path.relative(workshop, stored).split(path.sep).join("/") : null });
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

function readManifest(file: string): ManifestLike | null {
    try {
        return JSON.parse(readFileSync(file, "utf8")) as ManifestLike;
    } catch {
        return null;
    }
}
