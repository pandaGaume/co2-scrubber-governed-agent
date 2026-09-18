/**
 * slot `twin`, stub. Tier 0 in the architecture: the oracle. The real slot runs
 * the cabin + scrubber graph (in a browser tab, or headless) and answers the
 * agent's questions with a `sweep` of a few points. This stub only knows the
 * shape of the question and answers with a placeholder: an arithmetic guess so
 * the dashboard has something to show, marked as such.
 */
import { publishStub } from "../lib/stub-provider.mjs";

const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });

export function twinSlot(wsBase, log) {
    return publishStub({
        slot: "twin",
        description: "The digital twin of the cabin and the scrubber (stub): what-if questions on a physics graph",
        wsBase,
        log,
        state: { graph: "graphs/rs385-complete.spikypanda", budget: { points: 20, secondsPerPoint: 5 } },
        tools: [
            {
                name: "sweep",
                description: "Run the twin over a few settings and record fields; the same job as the factory's sweep, under a budget. Stub: returns a placeholder without running anything.",
                inputSchema: obj(
                    {
                        grid: { type: "array", items: obj({ node: { type: "string" }, property: { type: "string" }, values: { type: "array" } }, ["node", "property", "values"]) },
                        record: { type: "array", items: obj({ node: { type: "string" }, property: { type: "string" }, as: { type: "string" } }, ["node", "property"]) },
                        duration: { type: "number", minimum: 0 },
                    },
                    ["grid", "record"]
                ),
                handle: ({ grid, duration }, s) => {
                    const points = grid.reduce((n, axis) => n * axis.values.length, 1);
                    if (points > s.budget.points) throw new Error(`${points} points exceed the twin budget of ${s.budget.points}`);
                    if ((duration ?? 0) > s.budget.secondsPerPoint) throw new Error(`${duration} s per point exceed the twin budget of ${s.budget.secondsPerPoint} s`);
                    return { points, duration: duration ?? 0, rows: [], note: "stub: no graph was run" };
                },
            },
            {
                name: "time_to_critical",
                description: "How long before the cabin CO2 reaches CRITICAL at the current production and scrubbing capacity, in seconds. Stub: a placeholder from a fixed rate.",
                inputSchema: obj({ co2Ppm: { type: "number" }, productionFactor: { type: "number" }, capacityFactor: { type: "number" } }, ["co2Ppm"]),
                handle: ({ co2Ppm, productionFactor = 1, capacityFactor = 1 }) => {
                    const net = 2 * productionFactor - 1.6 * capacityFactor; // ppm per second, placeholder
                    const seconds = net <= 0 ? null : Math.max(0, (5000 - co2Ppm) / net);
                    return { seconds, note: "stub: fixed rates, not the graph" };
                },
            },
        ],
        resources: [{ uri: "twin://graph", name: "Graph", description: "The document the twin runs", read: (s) => ({ graph: s.graph, budget: s.budget }) }],
    });
}
