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
    /** A stage's goal in one sentence, for the marching order the model reads (`marchingOrder`). */
    goal?: string;
    /** The capabilities that serve the stage, for the marching order. */
    tools?: string[];
    /** Where the stage stands in the marching order (1 first); the file's order when absent. */
    order?: number;
    /**
     * A way out of the work, not a stage of it (2026-10-10, run 7): entered, it is the whole marching order, its tools the only ones
     * offered, every other closed with its words; never shown otherwise. The Observer's attempts spent, the request stage still said
     * "hand over the request" beside a closed observer.submit, and Nemotron Nano went on searching the library.
     */
    exit?: boolean;
}

/** One stage of the marching order: what it is for, with what, and where the task stands on it. */
export interface MarchingStep {
    step: number;
    stage: string;
    goal: string;
    tools: string[];
    status: "passed" | "current" | "next";
    /** On the current stage: its tools that have already answered in this task, their answers in the state (2026-10-10). */
    answered?: string[];
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
    return {
        id,
        says: bag.says,
        bag,
        ...(typeof bag.action === "string" ? { action: bag.action } : {}),
        ...(typeof bag.view === "string" ? { view: bag.view } : {}),
        ...(bag.vars && typeof bag.vars === "object" ? { vars: bag.vars as Record<string, SayVar> } : {}),
        ...(typeof bag.goal === "string" ? { goal: bag.goal } : {}),
        ...(Array.isArray(bag.tools) ? { tools: bag.tools.map(String) } : {}),
        ...(typeof bag.order === "number" ? { order: bag.order } : {}),
        ...(bag.exit === true ? { exit: true } : {}),
    };
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
    /** The proofs its evidence nodes read, and the bounds of the mechanism it holds, each with why. */
    readonly proofs: string[] = [];
    readonly bounds: Array<{ id: string; count: string; atLeast: number; why: string }> = [];
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
                        if (!this.proofs.includes(bag.evidence)) this.proofs.push(bag.evidence);
                        return new EvidenceNode(bag.evidence);
                    case CONDUCT.bound:
                        if (typeof bag.count !== "string" || typeof bag.atLeast !== "number" || typeof bag.why !== "string") throw new Error(`${file}: bound "${n.id}" names its count, its bound and why (bag.count, bag.atLeast, bag.why)`);
                        this.bounds.push({ id: n.id, count: bag.count, atLeast: bag.atLeast, why: bag.why });
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

    /**
     * The marching order (2026-10-09): every stage in order, each with its goal, the tools that serve it, and where the task stands
     * on it (passed, current, next), read off the same graph that judges. A small model given only the current stage's brief fails
     * on the order of the work (a plan or a procedure first?); given the whole order and its place in it, it follows it.
     */
    marchingOrder(evidence: Evidence): MarchingStep[] {
        const stage = this.evaluate(evidence).stage;
        const current = stage.id;
        // A way out entered is the whole order; never shown otherwise.
        if (stage.exit) return [{ step: 1, stage: stage.id, goal: stage.goal ?? "", tools: stage.tools ?? [], status: "current" }];
        const ordered = this.stages.filter((s) => !s.exit).map((s, i) => ({ s, at: s.order ?? i + 1 })).sort((a, b) => a.at - b.at);
        const here = ordered.findIndex((x) => x.s.id === current);
        return ordered.map((x, i) => ({ step: i + 1, stage: x.s.id, goal: x.s.goal ?? "", tools: x.s.tools ?? [], status: i < here ? "passed" : i === here ? "current" : "next" }));
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

/**
 * What the state shows of a topic's conduct (2026-10-09): the marching order, the tools of the current stage that may be called now,
 * and what is closed now with why, said in the topic's words. Each topic adds what must hold before handing over (`doneWhen`).
 * `answered` names the tools that have answered in this task: the current stage says which of its own did (2026-10-10, run xykl:
 * Nano called library.methods again at the stage whose goal names it first, its answer already in the state).
 */
export function conductView(playbook: Playbook, evidence: Evidence, say: (key: string, vars?: Record<string, string | number>) => string, views: Record<string, () => Record<string, string | number>>, answered: Iterable<string> = []): { stages: MarchingStep[]; allowedNow: string[]; closedNow: Array<{ tools: string[]; why: string }> } {
    const done = new Set(answered);
    const stages = playbook.marchingOrder(evidence).map((s) => {
        const own = s.status === "current" ? s.tools.filter((t) => done.has(t)) : [];
        return own.length ? { ...s, answered: own } : s;
    });
    const { stage, refusing } = playbook.evaluate(evidence);
    const closed = new Set(refusing.flatMap((g) => g.capabilities));
    return {
        stages,
        allowedNow: (stages.find((s) => s.status === "current")?.tools ?? []).filter((t) => !closed.has(t)),
        // A way out closes every tool but its own ("*"), with its own words.
        closedNow: [...refusing.map((g) => ({ tools: g.capabilities, why: sayingText(g, say, views) })), ...(stage.exit ? [{ tools: ["*"], why: sayingText(stage, say, views) }] : [])],
    };
}

/**
 * The current stage's tools, the tools of the stages passed, and whether it is a way out: what a step offers the model (the runner
 * keeps of the stages passed their reads alone, and adds the support of base.ts).
 */
export function stageToolsOf(playbook: Playbook, evidence: Evidence): { tools: string[]; passed: string[]; exit: boolean } {
    const stage = playbook.evaluate(evidence).stage;
    const passed = playbook.marchingOrder(evidence).filter((s) => s.status === "passed").flatMap((s) => s.tools);
    return { tools: stage.tools ?? [], passed: stage.exit ? [] : passed, exit: Boolean(stage.exit) };
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

/** What a playbook proposed is checked against: the words it may say, what a stage may do, what a gate may refuse, and cases it must hold. */
export interface PlaybookExpectations {
    words?: { file: string; templates: Record<string, string> };
    /** What a stage may do (the process level): every stage names one of them. */
    actions?: string[];
    /** What a gate may refuse. */
    capabilities?: string[];
    /** Events and what the playbook must do at each: the stage, and the gates that refuse. */
    cases?: Array<{ evidence: Evidence; stage: string; refusing?: string[] }>;
}

/** More events than this and a playbook is too wide to be checked whole: it is refused as such. */
export const MAX_EVENTS = 4096;

/**
 * The problems of a playbook proposed (2026-09-29, level 2 of the note): it builds on the core's runtime; at every
 * event its proofs and its counts can make (each proof true or false, each count from 0 to one past its bound) one
 * stage and one only is active; it says only words its file holds; its stages do what the process knows and its gates
 * refuse capabilities that exist; and it holds the cases it is given. What the factory's guard runs on every
 * submission, and the station again on what is proposed to it.
 */
export function playbookProblems(doc: unknown, file: string, expect: PlaybookExpectations = {}): string[] {
    let playbook: Playbook;
    try {
        const d = doc as PlaybookFile;
        if (!d || typeof d !== "object" || !Array.isArray(d.nodes) || !Array.isArray(d.links)) return [`${file}: a playbook is { nodes: [{ id, type, bag }], links: [{ from: "node.port", to: "node.port" }] }`];
        playbook = new Playbook(file, d);
    } catch (e) {
        return [e instanceof Error ? e.message : String(e)];
    }
    const problems: string[] = [];
    const counts = [...new Set(playbook.bounds.map((b) => b.count))];
    const axes: Array<{ name: string; values: Array<boolean | number> }> = [
        ...playbook.proofs.map((name) => ({ name, values: [false, true] as Array<boolean | number> })),
        ...counts.map((name) => ({ name, values: Array.from({ length: Math.max(...playbook.bounds.filter((b) => b.count === name).map((b) => b.atLeast)) + 2 }, (_, i) => i) as Array<boolean | number> })),
    ];
    const total = axes.reduce((n, a) => n * a.values.length, 1);
    if (total > MAX_EVENTS) problems.push(`${file}: ${total} events to check (proofs ${playbook.proofs.join(", ")}; counts ${counts.join(", ") || "none"}), more than ${MAX_EVENTS}: a playbook is checked whole or not at all`);
    else {
        const faults: string[] = [];
        for (let n = 0; n < total; n++) {
            let rest = n;
            const evidence: Evidence = {};
            for (const a of axes) {
                evidence[a.name] = a.values[rest % a.values.length];
                rest = Math.floor(rest / a.values.length);
            }
            try {
                playbook.evaluate(evidence);
            } catch (e) {
                faults.push(e instanceof Error ? e.message : String(e));
            }
        }
        if (faults.length) problems.push(...faults.slice(0, 5), ...(faults.length > 5 ? [`and ${faults.length - 5} more events with no stage or two`] : []));
    }
    if (expect.words) for (const key of playbook.words()) if (expect.words.templates[key] === undefined) problems.push(`"${key}" is not a key of ${expect.words.file}: a playbook says only the words its file holds`);
    if (expect.actions)
        for (const s of playbook.stages) if (!s.action || !expect.actions.includes(s.action)) problems.push(`stage "${s.id}" does "${s.action ?? "nothing"}": a stage does one of ${expect.actions.join(", ")}`);
    if (expect.capabilities)
        for (const g of playbook.gates) for (const c of g.capabilities) if (!expect.capabilities.includes(c)) problems.push(`gate "${g.id}" refuses "${c}", which is not one of ${expect.capabilities.join(", ")}`);
    for (const [i, c] of (expect.cases ?? []).entries()) {
        try {
            const { stage, refusing } = playbook.evaluate(c.evidence);
            if (stage.id !== c.stage) problems.push(`case ${i + 1} (${JSON.stringify(c.evidence)}): the stage is "${stage.id}", not "${c.stage}"`);
            if (c.refusing && JSON.stringify(refusing.map((g) => g.id).sort()) !== JSON.stringify([...c.refusing].sort())) problems.push(`case ${i + 1} (${JSON.stringify(c.evidence)}): the gates that refuse are [${refusing.map((g) => g.id).join(", ")}], not [${c.refusing.join(", ")}]`);
        } catch (e) {
            problems.push(`case ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return problems;
}

/**
 * A playbook of the library conducts only signed (level 3 of the note): what `library.playbook` answers, refused
 * while no person signed it, or when it changed since.
 */
export function signedPlaybook(read: { id: string; playbook: PlaybookFile; signed: { valid: boolean; by?: string } | null }): Playbook {
    if (!read.signed) throw new Error(`the playbook "${read.id}" is not signed: it conducts nothing until a person signs it`);
    if (!read.signed.valid) throw new Error(`the playbook "${read.id}" changed since ${read.signed.by ?? "its signer"} signed it: it conducts nothing until a person signs it again`);
    return new Playbook(`library:${read.id}`, read.playbook);
}
