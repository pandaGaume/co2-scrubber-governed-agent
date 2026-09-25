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
 *
 * The factory's document also carries, under the twelve stages, the
 * scientific loop of the graph factory (2026-09-25): observe, hypothesize,
 * build, execute, evaluate, then pass or diagnose (a parameter at the edge
 * of its range, a structure that cannot follow, an evaluation not to be
 * trusted) and revise. Its states are plain gates of the Logic plugin with
 * the ids `loop-<state>`; the factory's page lights them from what the
 * harness decided at each step (`harness/browser/factory-loop.ts`).
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

/** The loop's states as drawn: id, label, position (a second row under the stages, the diagnosis a third). */
export const LOOP_NODES: ReadonlyArray<{ id: string; label: string; x: number; y: number }> = [
    { id: "observe", label: "OBSERVE  the task, the shelf, the telemetry", x: -280, y: 260 },
    { id: "hypothesize", label: "HYPOTHESIZE  the structure and what is fitted", x: 20, y: 260 },
    { id: "build", label: "BUILD  instantiate the graph", x: 340, y: 260 },
    { id: "execute", label: "EXECUTE  fit and run in the sandbox", x: 620, y: 260 },
    { id: "evaluate", label: "EVALUATE  coverage, residual, identifiability", x: 900, y: 260 },
    { id: "pass", label: "PASS  calibration held", x: 1240, y: 260 },
    { id: "done", label: "DONE  handed over, validation pending", x: 1520, y: 260 },
    { id: "diagnose", label: "DIAGNOSE  why it does not hold", x: 900, y: 420 },
    { id: "parameter", label: "PARAMETER MISMATCH  a fitted value at the edge of its range", x: 620, y: 420 },
    { id: "structural", label: "STRUCTURAL MISMATCH  no admissible set follows the curve", x: 1240, y: 420 },
    { id: "invalid", label: "INVALID EVALUATION  a prediction missing, not finite", x: 900, y: 560 },
    { id: "revise", label: "REVISE  the bounds if the physics allows, else the topology", x: 340, y: 420 },
    { id: "experiment", label: "INSUFFICIENT INFORMATION  plan an experiment", x: 1520, y: 420 },
];
/** The loop's transitions, from state to state. */
export const LOOP_EDGES: ReadonlyArray<readonly [string, string]> = [
    ["observe", "hypothesize"],
    ["hypothesize", "build"],
    ["build", "execute"],
    ["execute", "evaluate"],
    ["evaluate", "pass"],
    ["pass", "done"],
    ["evaluate", "diagnose"],
    ["diagnose", "parameter"],
    ["diagnose", "structural"],
    ["diagnose", "invalid"],
    ["diagnose", "experiment"],
    ["parameter", "revise"],
    ["structural", "revise"],
    ["invalid", "revise"],
    ["revise", "execute"],
];
export const LOOP_TYPE = "Logic.Flow:gate";

export function buildAgentDocument(outFile: string, labels: Readonly<Record<string, string>> = STAGE_LABELS, options: { loop?: boolean } = {}): void {
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
    nodes.push({ id: MONITOR_NODE_ID, typeId: MONITOR_TYPE, x: 0, y: 700, label: "Run monitor" });
    const connections: DocumentConnectionSpec[] = V1_EDGES.map(([from, output, to, input]) => ({ from: [from, output], to: [to, input] }));
    if (options.loop) {
        // The scientific loop under the stages: gates of the Logic plugin, one in and one out, lit by the factory's page.
        for (const n of LOOP_NODES) nodes.push({ id: `loop-${n.id}`, typeId: LOOP_TYPE, x: n.x, y: n.y, label: n.label });
        for (const [from, to] of LOOP_EDGES) connections.push({ from: [`loop-${from}`, "then"], to: [`loop-${to}`, "in"] });
    }
    const tiles: DocumentTileSpec[] = [{ nodeId: MONITOR_NODE_ID, renderableType: MONITOR_TYPE, x: 0, y: 0, w: 12, h: 5 }];

    const json = factory.buildDocumentJson(registry, nodes, connections, tiles);
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, json + "\n");
    const manifest = {
        document: relativeToRoot(outFile),
        builtOn: new Date().toISOString(),
        harness: { nodes: nodes.map((n) => ({ id: n.id, typeId: n.typeId })), edges: connections.length, tiles: tiles.length, loop: options.loop ? LOOP_NODES.map((n) => n.id) : [] },
        sha256: sha256File(outFile),
    };
    writeFileSync(outFile.replace(/\.spikypanda$/, ".manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(`${relativeToRoot(outFile)}: ${nodes.length} nodes, ${connections.length} connections, ${tiles.length} tile, sha256 ${manifest.sha256.slice(0, 12)}`);
}

if (isMain(import.meta.url)) {
    const one = process.argv[2];
    if (one) buildAgentDocument(fromRoot(one), /factory/i.test(one) ? FACTORY_STAGE_LABELS : STAGE_LABELS, { loop: /factory/i.test(one) });
    else {
        buildAgentDocument(fromRoot("graphs/tier3-agent.spikypanda"), STAGE_LABELS);
        buildAgentDocument(fromRoot("graphs/factory-agent.spikypanda"), FACTORY_STAGE_LABELS, { loop: true });
    }
}
