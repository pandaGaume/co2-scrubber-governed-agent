/**
 * The decision loop as a harness graph: the V1 flow of `@spiky-panda/harness`,
 * twelve typed nodes on a Core graph. The one graph of the demo: the habitat
 * agent (tier3) and the factory (harness/core) both step it; what differs is
 * the services the runtime is given (docs/harness-stages.fr.md).
 *
 *     observe > context > lookup > gate
 *                                    policy ------------------+
 *                                    fallback > request > reason
 *                                                             |
 *                         merge <-----------------------------+
 *                           > guard > execute > observe-after > evaluate > record
 *
 * The graph is built with Core's `RuntimeGraphBuilder` (nodes from the
 * harness's V1 catalogue, one channel per edge) and validated by the
 * harness, then handed to `createRuntimeGraphDriver`. The JSON definition
 * the harness's editor plugin loads is a serialization of that graph
 * (`toHarnessDefinition`), never a literal.
 */
import { RuntimeGraphBuilder, type Channel } from "@spiky-panda/core";
import { V1_HARNESS_NODES, createRuntimeGraphDriver, validateHarnessGraph, type HarnessDefinition, type HarnessDriver, type HarnessGraph, type HarnessNode, type Intention, type NodeObserver } from "@spiky-panda/harness";

/** The twelve channels of the V1 loop: [from stage, output slot, to stage, input slot]. */
export const V1_EDGES: ReadonlyArray<readonly [string, string, string, string]> = [
    ["observe", "state", "context", "state"],
    ["context", "context", "lookup", "context"],
    ["lookup", "candidates", "gate", "candidates"],
    ["gate", "policy", "merge", "policy"],
    ["gate", "fallback", "request", "fallback"],
    ["request", "request", "reason", "request"],
    ["reason", "decision", "merge", "reasoning"],
    ["merge", "decision", "guard", "decision"],
    ["guard", "authorized", "execute", "authorized"],
    ["execute", "result", "observe-after", "result"],
    ["observe-after", "outcome", "evaluate", "outcome"],
    ["evaluate", "experience", "record", "experience"],
];

/** Builds the V1 decision graph in code and validates the harness contract. */
export function buildHarnessGraph(): HarnessGraph {
    const nodes: HarnessNode[] = V1_HARNESS_NODES.map((entry) => {
        const node: HarnessNode = new entry.ctor();
        node.type = entry.type;
        node.id = node.stage;
        return node;
    });
    const byStage = new Map(nodes.map((n) => [n.stage, n]));
    const builder = new RuntimeGraphBuilder<HarnessNode, Channel>().withMode("static").withNodes(...nodes);
    for (const [from, output, to, input] of V1_EDGES) {
        const source = byStage.get(from);
        const target = byStage.get(to);
        if (!source || !target) throw new Error(`unknown harness stage in edge ${from} -> ${to}`);
        builder.withChannel(source, target, output, input);
    }
    const graph = builder.build();
    validateHarnessGraph(graph);
    return graph;
}

/** The driver the runtime steps: the built graph, executed by the harness. */
export function createHarnessDriver(onNode?: NodeObserver): HarnessDriver {
    return createRuntimeGraphDriver(buildHarnessGraph(), onNode);
}

/** The editor layout of the twelve stages (x, y), as the harness's own example lays them out. */
export const DEFAULT_POSITIONS: Readonly<Record<string, readonly [number, number]>> = {
    observe: [30, 40],
    context: [280, 40],
    lookup: [530, 40],
    gate: [780, 40],
    request: [780, 240],
    reason: [1040, 240],
    merge: [1040, 40],
    guard: [1300, 40],
    execute: [1560, 40],
    "observe-after": [1560, 430],
    evaluate: [1300, 430],
    record: [1040, 430],
};

/** Serializes a built graph into the version-1 document the harness's editor plugin loads. */
export function toHarnessDefinition(graph: HarnessGraph, intention: Intention, positions: Readonly<Record<string, readonly [number, number]>> = DEFAULT_POSITIONS): HarnessDefinition {
    const nodes = graph.nodes.map((node, i) => {
        const id = String(node.id);
        const [x, y] = positions[id] ?? positions[node.stage] ?? [40 + 250 * i, 40];
        return { id, type: node.type ?? V1_HARNESS_NODES.find((e) => node instanceof e.ctor)?.type ?? node.stage, x, y };
    });
    const edges = graph.links
        .filter((link) => link.oini && link.ofin)
        .map((link) => ({ from: String((link.oini as HarnessNode).id), output: String(link.slot), to: String((link.ofin as HarnessNode).id), input: String(link.toSlot ?? link.slot) }));
    return { version: 1, intention, nodes, edges };
}
