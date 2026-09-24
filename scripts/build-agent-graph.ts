/**
 * Builds the loop documents: the agent's, `graphs/tier3-agent.spikypanda`,
 * and the factory's, `graphs/factory-agent.spikypanda`: the twelve stages of
 * the harness's V1 decision loop as the studio shows them, with a run
 * monitor tile on the dashboard; the same graph, the labels of each use.
 * Nothing is typed by hand: the nodes come from the harness's catalogue
 * (`HARNESS_NODES`), the edges from the same list the Node runner wires
 * (`harness/lib/flow.ts`), the layout from `DEFAULT_POSITIONS`, and the
 * document from the factory's builder through a registry.
 *
 *     node dist/scripts/build-agent-graph.js                       both documents
 *     node dist/scripts/build-agent-graph.js graphs/x.spikypanda   one (factory labels when the name says factory)
 *
 * The loaders open them in the studio (`tier3/browser/loader.ts`,
 * `harness/browser/factory-loader.ts`); the agent's extension executes the
 * very instances the studio created, the factory's replays the steps its
 * slot ran.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { DocumentConnectionSpec, DocumentNodeSpec, DocumentTileSpec } from "@spiky-panda/factory";
import { HARNESS_NODES, V1_HARNESS_NODES, createHarnessNode } from "@spiky-panda/harness";
import { sha256File } from "../lib/files.js";
import { loadFactory } from "../lib/factory.js";
import { fromRoot, isMain, relativeToRoot } from "../lib/paths.js";
import { buildRegistry } from "../lib/registry.js";
import { DEFAULT_POSITIONS, V1_EDGES } from "../harness/lib/flow.js";

export const MONITOR_TYPE = "Harness.Monitor:trace";
export const MONITOR_NODE_ID = "monitor";

/**
 * What the studio prints on each stage, numbered in the order the loop runs
 * them: the harness's catalogue labels are French, the demo is filmed in
 * English, and a jury reads a sequence better with its numbers.
 */
export const STAGE_LABELS: Readonly<Record<string, string>> = {
    observe: "1  Observe the cabin",
    context: "2  Context + intention",
    lookup: "3  Look up a learned decision",
    gate: "4  Confident enough?",
    request: "5  Build the request",
    reason: "6  Ask the reasoner",
    merge: "7  Merge the branches",
    guard: "8  Guard + authorize",
    execute: "9  Execute through the broker",
    "observe-after": "10  Observe the outcome",
    evaluate: "11  Evaluate",
    record: "12  Learn",
};

/**
 * The layout Guillaume set in the studio on 19 September 2026 (graph (43).json,
 * saved from the page): one line, read left to right, with the reasoner's
 * branch (5, 6) one step below; the viewer follows the lit node along it.
 */
export const STAGE_POSITIONS: Readonly<Record<string, readonly [number, number]>> = {
    observe: [-280, 0],
    context: [-100, 0],
    lookup: [80, 0],
    gate: [300, 0],
    request: [500, 100],
    reason: [680, 100],
    merge: [900, 0],
    guard: [1100, 0],
    execute: [1280, 0],
    "observe-after": [1520, 0],
    evaluate: [1720, 0],
    record: [1900, 0],
};

/** The factory's labels: the same loop, the workshop instead of the cabin, the builder instead of the reasoner. */
export const FACTORY_STAGE_LABELS: Readonly<Record<string, string>> = {
    observe: "1  Observe the workshop",
    context: "2  Context + task kind",
    lookup: "3  Look up a recipe",
    gate: "4  Recipe trusted?",
    request: "5  Build the request",
    reason: "6  Ask the builder",
    merge: "7  Merge the branches",
    guard: "8  Builder guard",
    execute: "9  Execute through the broker",
    "observe-after": "10  Observe the workshop",
    evaluate: "11  Evaluate, validate",
    record: "12  Learn the recipe",
};

export function buildAgentDocument(outFile: string, labels: Readonly<Record<string, string>> = STAGE_LABELS): void {
    const factory = loadFactory();
    const registry = buildRegistry();
    // The harness's nodes, registered as the studio's plugin registers them: same type ids, same ports.
    for (const entry of HARNESS_NODES) {
        const sample = createHarnessNode(entry.type);
        registry.register(entry.type, () => createHarnessNode(entry.type) as never, { label: entry.label, category: entry.type.split(":")[0], inputPorts: sample.inputPorts, outputPorts: sample.outputPorts });
    }
    // The monitor tile lives in the studio's harness plugin; the document only needs its type, label and an empty state.
    registry.register(MONITOR_TYPE, () => ({ serialize: () => ({}) }) as never, { label: "Run monitor", category: "Harness.Monitor", inputPorts: [], outputPorts: [] });

    const nodes: DocumentNodeSpec[] = V1_HARNESS_NODES.map((entry) => {
        const stage = new entry.ctor().stage;
        const [x, y] = STAGE_POSITIONS[stage] ?? DEFAULT_POSITIONS[stage] ?? [0, 0];
        return { id: stage, typeId: entry.type, x, y, label: labels[stage] ?? entry.label };
    });
    nodes.push({ id: MONITOR_NODE_ID, typeId: MONITOR_TYPE, x: 0, y: 460, label: "Run monitor" });
    const connections: DocumentConnectionSpec[] = V1_EDGES.map(([from, output, to, input]) => ({ from: [from, output], to: [to, input] }));
    const tiles: DocumentTileSpec[] = [{ nodeId: MONITOR_NODE_ID, renderableType: MONITOR_TYPE, x: 0, y: 0, w: 12, h: 5 }];

    const json = factory.buildDocumentJson(registry, nodes, connections, tiles);
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, json + "\n");
    const manifest = {
        document: relativeToRoot(outFile),
        builtOn: new Date().toISOString(),
        harness: { nodes: nodes.map((n) => ({ id: n.id, typeId: n.typeId })), edges: connections.length, tiles: tiles.length },
        sha256: sha256File(outFile),
    };
    writeFileSync(outFile.replace(/\.spikypanda$/, ".manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(`${relativeToRoot(outFile)}: ${nodes.length} nodes, ${connections.length} connections, ${tiles.length} tile, sha256 ${manifest.sha256.slice(0, 12)}`);
}

if (isMain(import.meta.url)) {
    const one = process.argv[2];
    if (one) buildAgentDocument(fromRoot(one), /factory/i.test(one) ? FACTORY_STAGE_LABELS : STAGE_LABELS);
    else {
        buildAgentDocument(fromRoot("graphs/tier3-agent.spikypanda"), STAGE_LABELS);
        buildAgentDocument(fromRoot("graphs/factory-agent.spikypanda"), FACTORY_STAGE_LABELS);
    }
}
