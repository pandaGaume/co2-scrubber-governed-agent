/**
 * The physics slot's knowledge graph (2026-09-28): how quantities relate,
 * as a SpikyPanda graph of the core (`Graph`, `GraphNode`, `GraphOLink`),
 * each node and link typed by the ontology (`ONTOLOGY`), read from
 * `specs/physics/knowledge.json`. Quantities, units, constants, laws and
 * relations are nodes; what ties them are typed links:
 *
 *   quantity  --from-->       relation   the quantity a relation reads
 *   relation  --to-->         quantity   the quantity it gives
 *   quantity  --parameter-->  relation   a quantity it needs, by name
 *   relation  --follows-->    law        the law it applies
 *   constant  --uses-->       law        a constant the law holds
 *   unit      --measures-->   quantity   a unit of a quantity, with its factor
 *
 * Navigating is following typed links: which relations read a quantity,
 * which give it, which need it, which law a relation follows and the
 * constants of that law, which units measure a quantity, and a chain of
 * relations from one quantity to another. Nothing of a relation is code: its
 * formulas are data, evaluated by `lib/expression.ts`.
 */
import { readFileSync } from "node:fs";
import { Graph, GraphNode, GraphOLink, ONTOLOGY, type INode, type IOlink } from "@spiky-panda/core";
import { fromRoot } from "../../lib/paths.js";
import { evaluateExpression } from "../../lib/expression.js";

export const KNOWLEDGE_FILE = "specs/physics/knowledge.json";

export const T = {
    quantity: "physics.quantity",
    unit: "physics.unit",
    constant: "physics.constant",
    law: "physics.law",
    relation: "physics.relation",
    from: "physics.from",
    to: "physics.to",
    parameter: "physics.parameter",
    follows: "physics.follows",
    uses: "physics.uses",
    measures: "physics.measures",
} as const;

type Bag = Record<string, unknown>;
export type KnowledgeNode = GraphNode<Bag>;
export type KnowledgeLink = GraphOLink<Bag>;

interface KnowledgeFile {
    types: Array<{ id: string; superType?: string }>;
    nodes: Array<{ id: string; type: string; bag?: Bag }>;
    links: Array<{ type: string; from: string; to: string; bag?: Bag }>;
}

/** The graph, built once from its file: its types registered in the ontology, its nodes by id. */
export class KnowledgeGraph {
    readonly graph: Graph<KnowledgeNode, KnowledgeLink>;
    private readonly byId = new Map<string, KnowledgeNode>();

    constructor(file: KnowledgeFile) {
        for (const t of file.types) ONTOLOGY.register({ id: t.id, ...(t.superType ? { superType: t.superType } : {}) });
        const nodes: KnowledgeNode[] = file.nodes.map((n) => {
            if (!ONTOLOGY.has(n.type)) throw new Error(`${KNOWLEDGE_FILE}: node "${n.id}" has the type "${n.type}", which the ontology does not declare`);
            if (this.byId.has(n.id)) throw new Error(`${KNOWLEDGE_FILE}: two nodes are "${n.id}"`);
            const node = new GraphNode<Bag>();
            node.id = n.id;
            node.type = n.type;
            node.bag = { ...(n.bag ?? {}) };
            this.byId.set(n.id, node);
            return node;
        });
        const links: KnowledgeLink[] = file.links.map((l) => {
            const a = this.byId.get(l.from);
            const b = this.byId.get(l.to);
            if (!a || !b) throw new Error(`${KNOWLEDGE_FILE}: a ${l.type} link names "${!a ? l.from : l.to}", which is no node`);
            if (!ONTOLOGY.isA(l.type, "physics.link")) throw new Error(`${KNOWLEDGE_FILE}: "${l.type}" is not a link type of the ontology`);
            // The core wires a link into both its nodes as it is made (oini, ofin).
            const link = new GraphOLink<Bag>(a, b);
            link.type = l.type;
            link.bag = { ...(l.bag ?? {}) };
            return link;
        });
        this.graph = new Graph<KnowledgeNode, KnowledgeLink>(nodes, links);
    }

    node(id: string): KnowledgeNode | undefined {
        return this.byId.get(id);
    }

    /** The nodes of a type (or of a type under it in the ontology). */
    nodesOf(type: string): KnowledgeNode[] {
        return this.graph.nodes.filter((n) => ONTOLOGY.isA(n.type, type));
    }

    /** The links leaving a node, of a type. */
    out(node: INode, type: string): KnowledgeLink[] {
        return node.onsc<KnowledgeLink>((l: IOlink) => ONTOLOGY.isA(l.type, type));
    }

    /** The links arriving at a node, of a type. */
    in(node: INode, type: string): KnowledgeLink[] {
        return node.opsc<KnowledgeLink>((l: IOlink) => ONTOLOGY.isA(l.type, type));
    }

    /** A quantity by its name, case aside. */
    quantity(name: string): KnowledgeNode | undefined {
        const wanted = name.toLowerCase();
        return this.nodesOf(T.quantity).find((n) => String(n.id).toLowerCase() === wanted);
    }

    /** The relation's quantities: what it reads, what it gives, what it needs by name. */
    sidesOf(relation: KnowledgeNode): { from: KnowledgeNode; to: KnowledgeNode; parameters: Array<{ name: string; description: string; quantity: KnowledgeNode }> } {
        const from = this.in(relation, T.from)[0]?.oini as KnowledgeNode | undefined;
        const to = this.out(relation, T.to)[0]?.ofin as KnowledgeNode | undefined;
        if (!from || !to) throw new Error(`relation "${String(relation.id)}" does not read and give a quantity`);
        const parameters = this.in(relation, T.parameter).map((l) => ({ name: String(l.bag?.name), description: String(l.bag?.description ?? ""), quantity: l.oini as KnowledgeNode }));
        return { from, to, parameters };
    }

    /** The constants a relation may name: those of the laws it follows, by their symbols. */
    constantsOf(relation: KnowledgeNode): Record<string, number> {
        const out: Record<string, number> = {};
        for (const follows of this.out(relation, T.follows)) {
            const law = follows.ofin as KnowledgeNode;
            for (const uses of this.in(law, T.uses)) {
                const c = (uses.oini as KnowledgeNode).bag ?? {};
                out[String(c.symbol)] = Number(c.value);
            }
        }
        return out;
    }

    /** The relation that ties two quantities, either way; null when none does. */
    relationBetween(from: string, to: string): { relation: KnowledgeNode; direction: "forward" | "inverse" } | null {
        const a = this.quantity(from);
        const b = this.quantity(to);
        if (!a || !b) return null;
        for (const relation of this.nodesOf(T.relation)) {
            const s = this.sidesOf(relation);
            if (s.from === a && s.to === b) return { relation, direction: "forward" };
            if (s.to === a && s.from === b) return { relation, direction: "inverse" };
        }
        return null;
    }

    /** A chain of relations from one quantity to another, the shortest, following them either way; null when none reaches. */
    pathBetween(from: string, to: string): Array<{ relation: KnowledgeNode; direction: "forward" | "inverse" }> | null {
        const start = this.quantity(from);
        const goal = this.quantity(to);
        if (!start || !goal) return null;
        const previous = new Map<KnowledgeNode, { via: KnowledgeNode; direction: "forward" | "inverse"; at: KnowledgeNode }>();
        const queue: KnowledgeNode[] = [start];
        const seen = new Set<KnowledgeNode>([start]);
        while (queue.length) {
            const q = queue.shift()!;
            if (q === goal) break;
            const steps = [
                ...this.out(q, T.from).map((l) => ({ relation: l.ofin as KnowledgeNode, direction: "forward" as const })),
                ...this.in(q, T.to).map((l) => ({ relation: l.oini as KnowledgeNode, direction: "inverse" as const })),
            ];
            for (const step of steps) {
                const s = this.sidesOf(step.relation);
                const next = step.direction === "forward" ? s.to : s.from;
                if (seen.has(next)) continue;
                seen.add(next);
                previous.set(next, { via: step.relation, direction: step.direction, at: q });
                queue.push(next);
            }
        }
        if (!seen.has(goal)) return null;
        const path: Array<{ relation: KnowledgeNode; direction: "forward" | "inverse" }> = [];
        for (let at = goal; at !== start; ) {
            const p = previous.get(at)!;
            path.unshift({ relation: p.via, direction: p.direction });
            at = p.at;
        }
        return path;
    }

    /** The units that measure a quantity, with their factor to its unit (a factor may be a formula). */
    unitsOf(quantity: KnowledgeNode): Record<string, number> {
        return Object.fromEntries(
            this.in(quantity, T.measures).map((l) => {
                const f = l.bag?.factor;
                return [String((l.oini as KnowledgeNode).bag?.symbol), typeof f === "string" ? evaluateExpression(f, {}) : Number(f)];
            }),
        );
    }
}

let knowledge: KnowledgeGraph | null = null;

/** The physics slot's knowledge graph, read once. */
export function physicsKnowledge(): KnowledgeGraph {
    knowledge ??= new KnowledgeGraph(JSON.parse(readFileSync(fromRoot(...KNOWLEDGE_FILE.split("/")), "utf8")) as KnowledgeFile);
    return knowledge;
}
