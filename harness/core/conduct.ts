/**
 * Playbooks (2026-09-29, docs/comportement-en-donnees.fr.md, section 2): the
 * conduct of a factory as an executable SpikyPanda graph, not as code. Its
 * nodes are runtime nodes of the core, typed by the ontology (`conduct.*`),
 * wired by channels, and run by the core's scheduler in one topological
 * pass per event; between two events it does not run at all.
 *
 *   conduct.start      out next            the playbook's entry
 *   conduct.evidence   out value           a proof of the event, by name (what the runner recorded, never what a model says)
 *   conduct.bound      out value           a count of the event reached a bound of the mechanism (bag: count, atLeast, why)
 *   conduct.not/all/any in..., out value   proofs combined
 *   conduct.stage      in entered, passes  active when entered and not passing; otherwise hands over on `next`
 *                      out next
 *   conduct.gate       in refuses          while it holds, the capabilities it names are refused, with its words
 *
 * The same nodes conduct at two levels (section 2 of the note): the step, in
 * the runner, where a stage says the brief (`says`) and the position is
 * read again from the task's progress at every step; and the process, above
 * the tasks, where a stage also names what the process does (`action`, and
 * whatever its bag says of it) and the position is the record the process
 * keeps between two events, hours of the world apart.
 *
 * A playbook is read from a file (`specs/<topic>/playbook.json`): its nodes by
 * id and type, with their bag (what a stage or a gate says: a key of the
 * topic's words, the view that fills its holes, a gate's capabilities), and
 * its channels as "node.port" pairs. What a factory keeps in code is its
 * sensors (the evidence, read from the task's progress) and its views (the
 * holes of its words, filled from what the task read); the order of the
 * stages and the conduct refusals are only in the graph.
 *
 * Exactly one stage is active at every event: a playbook where none or two
 * are is a fault of the playbook, said with its file.
 */
import { readFileSync } from "node:fs";
import { fromRoot } from "../../lib/paths.js";
import { ONTOLOGY, RuntimeGraphBuilder, RuntimeNode, Session, type IPortDescriptor, type IRuntimeGraph, type ISession } from "@spiky-panda/core";

export const CONDUCT = {
    node: "conduct.node",
    start: "conduct.start",
    evidence: "conduct.evidence",
    bound: "conduct.bound",
    not: "conduct.not",
    all: "conduct.all",
    any: "conduct.any",
    stage: "conduct.stage",
    gate: "conduct.gate",
} as const;

for (const id of Object.values(CONDUCT)) if (!ONTOLOGY.has(id)) ONTOLOGY.register(id === CONDUCT.node ? { id } : { id, superType: CONDUCT.node });

/** A value a hole of the words is filled with: a literal, or another key of the words. */
export type SayVar = string | number | { word: string };

/** What a stage or a gate says: a key of the topic's words, the topic's view that fills its holes, and holes filled here; at the process level, what it does (`action`), with the rest of its bag. */
export interface Saying {
    id: string;
    says: string;
    action?: string;
    bag: Record<string, unknown>;
    view?: string;
    vars?: Record<string, SayVar>;
}
export interface Gate extends Saying {
    capabilities: string[];
}

export interface PlaybookFile {
    title?: string;
    nodes: Array<{ id: string; type: string; bag?: Record<string, unknown> }>;
    /** Channels, "node.port" to "node.port". */
    links: Array<{ from: string; to: string }>;
}

/** The event as the playbook reads it: each proof by name, and the counts its bounds compare. */
export type Evidence = Record<string, boolean | number>;

class ConductSession extends Session {
    evidence: Evidence = {};
    active: string[] = [];
    refusing: string[] = [];
}

const bool = (slot: string): IPortDescriptor => ({ slot, optional: false, type: "boolean" });

abstract class ConductNode extends RuntimeNode {
    inputPorts: ReadonlyArray<IPortDescriptor> = [];
    outputPorts: ReadonlyArray<IPortDescriptor> = [];
    protected in(session: ISession, slot: string): boolean {
        return this.consumeLatest(session, slot) === true;
    }
    protected out(session: ISession, slot: string, value: boolean): void {
        this.publishAll(session, slot, value);
    }
}

class StartNode extends ConductNode {
    override outputPorts = [bool("next")];
    override fire(session: ISession): void {
        this.out(session, "next", true);
    }
}

class EvidenceNode extends ConductNode {
    override outputPorts = [bool("value")];
    constructor(readonly evidence: string) {
        super();
    }
    override fire(session: ISession): void {
        this.out(session, "value", (session as ConductSession).evidence[this.evidence] === true);
    }
}

class BoundNode extends ConductNode {
    override outputPorts = [bool("value")];
    constructor(
        readonly count: string,
        readonly atLeast: number,
    ) {
        super();
    }
    override fire(session: ISession): void {
        const n = (session as ConductSession).evidence[this.count];
        this.out(session, "value", typeof n === "number" && n >= this.atLeast);
    }
}

class NotNode extends ConductNode {
    override inputPorts = [bool("in")];
    override outputPorts = [bool("value")];
    override fire(session: ISession): void {
        this.out(session, "value", !this.in(session, "in"));
    }
}

class CombineNode extends ConductNode {
    override outputPorts = [bool("value")];
    constructor(readonly every: boolean, inputs: string[]) {
        super();
        this.inputPorts = inputs.map(bool);
    }
    override fire(session: ISession): void {
        const values = this.inputPorts.map((p) => this.in(session, String(p.slot)));
        this.out(session, "value", this.every ? values.every(Boolean) : values.some(Boolean));
    }
}

class StageNode extends ConductNode {
    override outputPorts = [bool("next")];
    constructor(readonly saying: Saying, passes: boolean) {
        super();
        this.inputPorts = passes ? [bool("entered"), bool("passes")] : [bool("entered")];
    }
    override fire(session: ISession): void {
        const entered = this.in(session, "entered");
        const passes = this.inputPorts.length > 1 && this.in(session, "passes");
        if (entered && !passes) (session as ConductSession).active.push(this.saying.id);
        this.out(session, "next", entered && passes);
    }
}

class GateNode extends ConductNode {
    override inputPorts = [bool("refuses")];
    constructor(readonly gate: Gate) {
        super();
    }
    override fire(session: ISession): void {
        if (this.in(session, "refuses")) (session as ConductSession).refusing.push(this.gate.id);
    }
}

const sayingOf = (id: string, bag: Record<string, unknown>, file: string): Saying => {
    if (typeof bag.says !== "string") throw new Error(`${file}: "${id}" says nothing (bag.says, a key of the words)`);
    return { id, says: bag.says, bag, ...(typeof bag.action === "string" ? { action: bag.action } : {}), ...(typeof bag.view === "string" ? { view: bag.view } : {}), ...(bag.vars && typeof bag.vars === "object" ? { vars: bag.vars as Record<string, SayVar> } : {}) };
};

const portOf = (end: string, file: string): [string, string] => {
    const dot = end.lastIndexOf(".");
    if (dot <= 0) throw new Error(`${file}: a channel end is "node.port", not "${end}"`);
    return [end.slice(0, dot), end.slice(dot + 1)];
};

/** A playbook built into a runtime graph, run once per event. */
export class Playbook {
    readonly graph: IRuntimeGraph;
    readonly stages: Saying[] = [];
    readonly gates: Gate[] = [];
    private readonly gateOrder = new Map<string, number>();

    constructor(
        readonly file: string,
        doc: PlaybookFile,
    ) {
        const inputs = new Map<string, string[]>();
        for (const l of doc.links) {
            const [to, port] = portOf(l.to, file);
            inputs.set(to, [...(inputs.get(to) ?? []), port]);
        }
        const byId = new Map<string, ConductNode>();
        for (const n of doc.nodes) {
            if (!ONTOLOGY.isA(n.type, CONDUCT.node)) throw new Error(`${file}: node "${n.id}" has the type "${n.type}", which is no conduct node`);
            if (byId.has(n.id)) throw new Error(`${file}: two nodes are "${n.id}"`);
            const bag = n.bag ?? {};
            const node: ConductNode = (() => {
                switch (n.type) {
                    case CONDUCT.start:
                        return new StartNode();
                    case CONDUCT.evidence:
                        if (typeof bag.evidence !== "string") throw new Error(`${file}: evidence "${n.id}" names no proof (bag.evidence)`);
                        return new EvidenceNode(bag.evidence);
                    case CONDUCT.bound:
                        if (typeof bag.count !== "string" || typeof bag.atLeast !== "number" || typeof bag.why !== "string") throw new Error(`${file}: bound "${n.id}" names its count, its bound and why (bag.count, bag.atLeast, bag.why)`);
                        return new BoundNode(bag.count, bag.atLeast);
                    case CONDUCT.not:
                        return new NotNode();
                    case CONDUCT.all:
                    case CONDUCT.any:
                        return new CombineNode(n.type === CONDUCT.all, inputs.get(n.id) ?? []);
                    case CONDUCT.stage: {
                        const saying = sayingOf(n.id, bag, file);
                        this.stages.push(saying);
                        return new StageNode(saying, (inputs.get(n.id) ?? []).includes("passes"));
                    }
                    case CONDUCT.gate: {
                        const gate: Gate = { ...sayingOf(n.id, bag, file), capabilities: Array.isArray(bag.capabilities) ? bag.capabilities.map(String) : [] };
                        if (!gate.capabilities.length) throw new Error(`${file}: gate "${n.id}" refuses no capability (bag.capabilities)`);
                        this.gateOrder.set(n.id, this.gates.length);
                        this.gates.push(gate);
                        return new GateNode(gate);
                    }
                    default:
                        throw new Error(`${file}: no conduct node is "${n.type}"`);
                }
            })();
            node.id = n.id;
            node.type = n.type;
            byId.set(n.id, node);
        }
        if ([...byId.values()].filter((n) => n instanceof StartNode).length !== 1) throw new Error(`${file}: a playbook has one conduct.start`);
        const builder = new RuntimeGraphBuilder<ConductNode>().withMode("static").withNodes(...byId.values());
        for (const l of doc.links) {
            const [from, output] = portOf(l.from, file);
            const [to, input] = portOf(l.to, file);
            const source = byId.get(from);
            const target = byId.get(to);
            if (!source || !target) throw new Error(`${file}: the channel ${l.from} -> ${l.to} names a node the playbook does not hold`);
            if (!source.outputPorts.some((p) => p.slot === output)) throw new Error(`${file}: "${from}" has no output "${output}"`);
            builder.withChannel(source, target, output, input);
        }
        for (const node of byId.values())
            for (const p of node.inputPorts)
                if (doc.links.filter((l) => l.to === `${node.id}.${p.slot}`).length !== 1) throw new Error(`${file}: "${node.id}.${p.slot}" is fed by ${doc.links.filter((l) => l.to === `${node.id}.${p.slot}`).length} channels, not one`);
        this.graph = builder.build();
    }

    /** One event: the active stage and the gates that refuse, in the order the file declares them. */
    evaluate(evidence: Evidence): { stage: Saying; refusing: Gate[] } {
        const session = new ConductSession(this.graph);
        session.evidence = evidence;
        this.graph.run(0, session);
        if (session.active.length !== 1) throw new Error(`${this.file}: ${session.active.length} stages are active (${session.active.join(", ") || "none"}), not one, for ${JSON.stringify(evidence)}`);
        const stage = this.stages.find((s) => s.id === session.active[0]) as Saying;
        const refusing = session.refusing.map((id) => this.gates[this.gateOrder.get(id) as number]).sort((a, b) => (this.gateOrder.get(a.id) ?? 0) - (this.gateOrder.get(b.id) ?? 0));
        return { stage, refusing };
    }

    /** The keys of the words the playbook says: the conformance test checks the words hold them. */
    words(): string[] {
        const keys = new Set<string>();
        for (const s of [...this.stages, ...this.gates]) {
            keys.add(s.says);
            for (const [k, v] of Object.entries(s.bag)) if (/^[a-z]+Says$/.test(k) && typeof v === "string") keys.add(v);
            for (const v of Object.values(s.vars ?? {})) if (typeof v === "object") keys.add(v.word);
        }
        return [...keys];
    }
}

export function loadPlaybook(file: string): Playbook {
    return new Playbook(file, JSON.parse(readFileSync(fromRoot(...file.split("/")), "utf8")) as PlaybookFile);
}

/**
 * A stage or a gate said: its holes filled by the topic's view, then by its own vars (a `{word}` var is another key,
 * said without holes). `key` says another of its words than `says`: a bag field named `<something>Says`.
 */
export function sayingText(saying: Saying, say: (key: string, vars?: Record<string, string | number>) => string, views: Record<string, () => Record<string, string | number>>, key: string = saying.says): string {
    const view = saying.view ? views[saying.view] : undefined;
    if (saying.view && !view) throw new Error(`the playbook's "${saying.id}" asks for the view "${saying.view}", which the topic does not give`);
    const own = Object.fromEntries(Object.entries(saying.vars ?? {}).map(([k, v]) => [k, typeof v === "object" ? say(v.word) : v]));
    return say(key, { ...(view ? view() : {}), ...own });
}
