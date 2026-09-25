/**
 * A reference graph, and a candidate compared with it.
 *
 * The station's reference is the habitat graph of the library
 * (`graphs/habitat.spikypanda`, its template `habitat.template.json`, its
 * words in `habitat.grammars/`): two volumes in mass, the persons by name,
 * the scrubber in its datasheet's units, the ventilation through its
 * filter, the sensors. Before it, the cabin twin (`graphs/cabin.spikypanda`,
 * one room, its rates folded on a volume nobody measured) was the
 * reference; it is still read, for comparison.
 *
 * Two uses, both by code:
 *
 *   wiring      the reference's connections, as node types and ports,
 *               given to the builder so it starts from what already runs
 *               rather than rediscovering how a timeline feeds a port;
 *   comparison  a candidate against a reference, at the level of types and
 *               ports (ids differ from one author to the next): the types
 *               both use, the connections the candidate shares, lacks, or
 *               adds. Two references are compared: the station's twin, and
 *               the graph written by hand for the commissioning
 *               (`labCandidate`, `harness/scripted/graph.ts`).
 */
import { readFileSync } from "node:fs";
import { resolveSpec, type Row, type Spec, type Variables } from "./params.js";

export interface Wire {
    from: string;
    to: string;
}

export interface ReferenceGraph {
    name: string;
    types: string[];
    wires: Wire[];
}

/** Node types that frame a saved document (the scene preset, the solver) and are not part of a twin's physics; the atmosphere and its gate are physics. */
const FRAME = /^Control\.Sim:|^Physics\.Scene:(?!atmosphere)/;
/** Node types outside the CO2 balance a commissioning twin is about (the battery the cabin twin also feeds). */
const OUTSIDE = /^Physics\.Electric:/;

const typeWire = (typeOf: (id: string) => string | undefined, from: [string, string], to: [string, string]): Wire | null => {
    const a = typeOf(from[0]);
    const b = typeOf(to[0]);
    return a && b ? { from: `${a}.${from[1]}`, to: `${b}.${to[1]}` } : null;
};

/** A saved document (`*.spikypanda`) as a reference: its physics types and its connections by type and port. */
export function referenceOfDocument(file: string, name: string): ReferenceGraph {
    const doc = JSON.parse(readFileSync(file, "utf8")) as { model?: { nodes?: Array<{ id: string; typeId: string }>; connections?: Array<{ from: { node: string; port: string }; to: { node: string; port: string } }> } };
    const nodes = (doc.model?.nodes ?? []).filter((n) => !FRAME.test(n.typeId) && !OUTSIDE.test(n.typeId));
    const typeOf = (id: string) => nodes.find((n) => n.id === id)?.typeId;
    const wires = (doc.model?.connections ?? []).map((c) => typeWire(typeOf, [c.from.node, c.from.port], [c.to.node, c.to.port])).filter((w): w is Wire => w !== null);
    return { name, types: [...new Set(nodes.map((n) => n.typeId))].sort(), wires: dedupe(wires) };
}

/** A spec (the form `graph.evaluate` takes) as a reference: the same frame left out as for a document. */
export function referenceOfSpec(spec: Spec, name: string): ReferenceGraph {
    const nodes = spec.nodes.filter((n) => !FRAME.test(n.typeId) && !OUTSIDE.test(n.typeId));
    const typeOf = (id: string) => nodes.find((n) => n.id === id)?.typeId;
    const wires = spec.connections.map((c) => typeWire(typeOf, c.from, c.to)).filter((w): w is Wire => w !== null);
    return { name, types: [...new Set(nodes.map((n) => n.typeId))].sort(), wires: dedupe(wires) };
}

const key = (w: Wire) => `${w.from} -> ${w.to}`;
function dedupe(wires: Wire[]): Wire[] {
    const seen = new Set<string>();
    return wires.filter((w) => (seen.has(key(w)) ? false : (seen.add(key(w)), true)));
}

export interface StructureComparison {
    reference: string;
    sharedTypes: string[];
    missingTypes: string[];
    extraTypes: string[];
    sharedWires: string[];
    missingWires: string[];
    extraWires: string[];
    /** Shared wires over the reference's wires, 0 to 1. */
    wiringMatch: number;
}

/** A candidate against a reference, by types and by typed connections. */
export function compareStructure(candidate: Spec, reference: ReferenceGraph): StructureComparison {
    return compareGraphs(referenceOfSpec(candidate, "candidate"), reference);
}

/** Two structures compared, the first against the second. */
export function compareGraphs(c: ReferenceGraph, reference: ReferenceGraph): StructureComparison {
    const cw = new Set(c.wires.map(key));
    const rw = new Set(reference.wires.map(key));
    const shared = [...rw].filter((w) => cw.has(w));
    return {
        reference: reference.name,
        sharedTypes: c.types.filter((t) => reference.types.includes(t)),
        missingTypes: reference.types.filter((t) => !c.types.includes(t)),
        extraTypes: c.types.filter((t) => !reference.types.includes(t)),
        sharedWires: shared,
        missingWires: [...rw].filter((w) => !cw.has(w)),
        extraWires: [...cw].filter((w) => !rw.has(w)),
        wiringMatch: rw.size ? Number((shared.length / rw.size).toFixed(2)) : 1,
    };
}

export interface ParameterGap {
    parameter: string;
    candidate: number;
    reference: number;
    /** candidate / reference */
    ratio: number;
}

/**
 * Two graphs' numbers side by side, once each is resolved at its own fitted
 * variables: every numeric parameter of a node type both use, by type and
 * parameter name. A structure can match and a number be off by ten; this is
 * where it shows.
 */
export function compareParameters(candidate: { spec: Spec; variables: Variables }, reference: { spec: Spec; variables: Variables }, rows: Row[]): ParameterGap[] {
    const valuesOf = (g: { spec: Spec; variables: Variables }) => {
        const out = new Map<string, number>();
        let resolved: Spec;
        try {
            resolved = resolveSpec(g.spec, g.variables, rows);
        } catch {
            return out;
        }
        for (const n of resolved.nodes) for (const [k, v] of Object.entries(n.params ?? {})) if (typeof v === "number" && Number.isFinite(v)) out.set(`${n.typeId}.${k}`, v);
        return out;
    };
    const c = valuesOf(candidate);
    const r = valuesOf(reference);
    return [...r]
        .filter(([k]) => c.has(k))
        .map(([k, v]) => ({ parameter: k, candidate: Number(c.get(k)!.toPrecision(4)), reference: Number(v.toPrecision(4)), ratio: v !== 0 ? Number((c.get(k)! / v).toFixed(2)) : Number.NaN }));
}

/** The reference's wiring in words, for the builder's brief. */
export const wiringLines = (r: ReferenceGraph): string => r.wires.map(key).join("; ");
