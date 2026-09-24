/**
 * The `graph` topic, the graph factory: build the twin a request asks for
 * from the node catalogue, and make it evolve by its gap to the real
 * (docs/observateur-et-usines.fr.md, section 5).
 *
 *   the builder (a model)   chooses the nodes and the connections, writes
 *                           the physics as formulas over a few variables
 *                           (a volume, an exchange flow), and decides what
 *                           to change when a candidate does not hold: a
 *                           parameter's range, or the topology;
 *   the harness (code)      estimates the unknown variables within the
 *                           bounds given, with an interchangeable estimator
 *                           (`fit.ts`: a simplex search or a grid), runs every
 *                           trial in the twin's sandbox, measures the residual
 *                           against the telemetry, keeps every candidate with
 *                           its residual, and says whether the task's
 *                           threshold is held.
 *
 * The loop is the task's own: `graph.evaluate` answers with the residual and
 * where the curves part, the stage brief says what the last candidate
 * showed, and the next candidate follows. The validator accepts the graph
 * only when it is a candidate of this task whose residual the harness found
 * under the threshold: the builder's claim is checked against the harness's
 * record, never taken at its word.
 */
import type { CapabilityResult, Intention, JsonValue } from "@spiky-panda/harness";
import type { LocalCapability } from "../../core/capabilities.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicContext, TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { evaluateCandidate, evaluationOutput, knownOf, type Candidate, type EvaluateInput } from "./evaluate.js";
import type { Row } from "./params.js";

export const GRAPH_TOOLS: ReadonlyArray<RegExp> = [/^workspace\.(list|read)$/, /^library\.(list|methods|search|read)$/, /^twin\.registry_(search|describe_node|list_nodes)$/, /^twin\.document_validate$/, /^graph\.evaluate$/, /^task\.(plan|done|fail)$/];
export const GRAPH_PROMPT = "harness/topics/graph/prompt.md";

interface GraphTopicState {
    candidates: Candidate[];
    runs: number;
}

function stateOf(progress: Progress): GraphTopicState {
    const current = progress.topic.graph as unknown as GraphTopicState | undefined;
    if (current) return current;
    const fresh: GraphTopicState = { candidates: [], runs: 0 };
    progress.topic.graph = fresh as unknown as JsonValue;
    return fresh;
}

export const candidatesOf = (progress: Progress): Candidate[] => stateOf(progress).candidates;

/** The task's telemetry: the first data file whose rows carry a `minute` column, read once per task. */
const telemetryCache = new Map<string, Row[]>();
async function telemetryOf(context: TopicContext): Promise<Row[]> {
    const cached = telemetryCache.get(context.taskId);
    if (cached) return cached;
    for (const d of context.task.data ?? []) {
        const r = await context.broker.call("workspace", "read", { taskId: context.taskId, path: d.file });
        if (!r.ok) continue;
        try {
            const rows = JSON.parse((r.output as { text: string }).text) as Row[];
            if (Array.isArray(rows) && rows.length && rows.every((x) => x && typeof x === "object" && "minute" in x)) {
                telemetryCache.set(context.taskId, rows);
                return rows;
            }
        } catch {
            // not a JSON table: the next file
        }
    }
    throw new Error("the task holds no telemetry table with a \"minute\" column: a twin cannot be judged against nothing");
}

const COMPARE = { type: "object", properties: { node: { type: "string" }, property: { type: "string" }, column: { type: "string" } }, required: ["node", "property", "column"] };
const PARAM_DOC = "a number, or {\"$expr\": \"formula over the variables\"}, or {\"$series\": {\"column\": \"telemetry column\", \"scale\": \"formula\", \"offset\": \"formula\"}} for the segments of a Logic.Time:timeline driven by a measured column, or {\"$first\": \"telemetry column\"}";

export const EVALUATE_SCHEMA = {
    type: "object",
    properties: {
        label: { type: "string", minLength: 1, description: "What this candidate is, in a few words (its topology and hypothesis)." },
        spec: {
            type: "object",
            properties: {
                nodes: { type: "array", minItems: 1, items: { type: "object", properties: { id: { type: "string" }, typeId: { type: "string" }, params: { type: "object", description: `node parameters; each value is ${PARAM_DOC}` } }, required: ["id", "typeId"] } },
                connections: { type: "array", items: { type: "object", properties: { from: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 }, to: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 } }, required: ["from", "to"] } },
            },
            required: ["nodes", "connections"],
            description: "The candidate graph: nodes of the catalogue and their connections [node, port].",
        },
        compare: { type: "array", minItems: 1, items: COMPARE, description: "Which probe of the graph (node, property) is judged against which telemetry column." },
        variables: { type: "object", additionalProperties: { type: "number" }, description: "Variables held fixed for this evaluation." },
        fit: { type: "object", additionalProperties: { type: "object", properties: { min: { type: "number" }, max: { type: "number" } }, required: ["min", "max"] }, description: "The bounds of each variable nobody knows: the harness searches them with an optimiser (a few dozen runs). A constant the documentation gives goes in variables, not here." },
        estimator: { type: "string", enum: ["nelder-mead", "grid"], description: "How the bounds are searched: nelder-mead (default; a simplex search, about 10 to 20 runs per parameter, local) or grid (every combination of evenly spaced levels; levels ^ parameters runs; shows the shape of the cost)." },
        levels: { type: "number", description: "For the grid: levels per parameter (5 when absent)." },
        maxRuns: { type: "number", description: "Sandbox runs the estimator may spend on this candidate (40 when absent, 80 at most)." },
    },
    required: ["label", "spec", "compare"],
} as const;

function evaluateCapability(context: TopicContext): LocalCapability {
    const { broker, taskId, task, progress } = context;
    return {
        id: "graph.evaluate",
        description: "Build a candidate twin from a parametric graph, estimate its unknown variables within their bounds (fit, with the estimator chosen), run every trial in the twin's sandbox over the telemetry, and measure the residual against the columns named. The best is kept as candidate-<n>.spikypanda in the workshop. Answers whether the task's residual threshold is held, the residual per column and where the gap is worst, the prediction against the measurement every five minutes, and the best trials.",
        inputSchema: EVALUATE_SCHEMA as unknown as JsonValue,
        async execute(input: JsonValue): Promise<CapabilityResult> {
            const state = stateOf(progress);
            try {
                const rows = await telemetryOf(context);
                const budget = task.budget?.twinPoints ?? 40;
                const result = await evaluateCandidate(input as unknown as EvaluateInput, { broker, taskId, task, rows, remaining: budget - state.runs, n: state.candidates.length + 1 });
                state.runs += result.candidate.combinations;
                state.candidates.push(result.candidate);
                await broker.call("workspace", "write", { taskId, path: "candidates.json", text: JSON.stringify(state.candidates, null, 2) + "\n" });
                const c = result.candidate;
                const rmse = Math.max(...c.residuals.map((r) => r.rmse));
                const told = await broker.call("station", "candidate_evaluated", { taskId, n: c.n, nodes: c.nodes, connections: c.connections, rmse, threshold: c.threshold, pass: c.pass });
                if (!told.ok) progress.topic.motherNotTold = told.error ?? told.outcome;
                return { ok: true, output: { outcome: "completed", value: evaluationOutput(result) } };
            } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : String(e), output: { outcome: "refused" } };
            }
        },
    };
}

export function validateGraph(claim: DoneClaim, files: WorkshopFile[], progress: Progress): Validation {
    const problems: string[] = [];
    // A twin is a graph here: the claim may name it either way, the file is what counts.
    const graphs = claim.artifacts.filter((a) => a.kind === "graph" || a.kind === "twin" || a.path.endsWith(".spikypanda"));
    if (!graphs.length) problems.push("no graph among the claimed artifacts");
    for (const g of graphs) {
        const file = files.find((f) => f.path === g.path);
        const candidate = candidatesOf(progress).find((c) => c.path === g.path);
        if (!file) problems.push(`claimed graph "${g.path}" is not a file of the workshop`);
        else if (!candidate) problems.push(`claimed graph "${g.path}" is not a candidate graph.evaluate built in this task`);
        else if (candidate.sha256 !== file.sha256) problems.push(`claimed graph "${g.path}" is not the file graph.evaluate built (sha256 ${candidate.sha256.slice(0, 12)})`);
        else if (!candidate.pass) problems.push(`claimed graph "${g.path}" has a residual of ${Math.max(...candidate.residuals.map((r) => r.rmse))} ppm, above the threshold of ${candidate.threshold} ppm`);
    }
    return { ok: problems.length === 0, problems };
}

/** The harness's brief, stage by stage: what the task holds, the plan, the candidates and what the last one showed. */
export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    const { candidates } = stateOf(progress);
    const threshold = (task.objective.constraints as { residualPpmMax?: unknown })?.residualPpmMax;
    const outputs = task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join(", ");
    const known = knownOf(task);
    // The documented constants, said at every stage: held in variables under their symbol, never fitted.
    const held = known.length ? ` Known, from the documentation, held in variables under these names and never fitted: ${known.map((k) => `${k.symbol} = ${k.value}${k.unit ? ` ${k.unit}` : ""}${typeof k.min === "number" && typeof k.max === "number" ? ` (band ${k.min} to ${k.max}: may be fitted within it)` : ""} (${k.name ?? ""}${k.source ? `, ${k.source}` : ""})`).join("; ")}. Watch their units against the nodes' (a flow in m3/min enters a node as flow / V).` : "";
    if (!progress.reads["workspace.read"] && !progress.reads["library.read"] && progress.phase === "plan") return `Stage 1 of 5, what to reproduce. Read the task (workspace.read task.json: the requirements, the observations, the hypotheses) and its telemetry (the data file), the library's card on building a twin graph (library.read method-twin-graph), and the documentation of the devices and of the station (library.list: a device's datasheet, the station's topology and metrics): what the documentation gives is known, and is not fitted. The twin must produce ${outputs} within a residual of ${String(threshold)} ppm of the telemetry.${held}`;
    if (progress.phase === "plan") return `Stage 2 of 5, the plan. Choose the node types of the catalogue (twin.registry_search, twin.registry_describe_node) and submit them with task.plan; declare missing only what no node can express.`;
    const last = candidates.at(-1);
    // An evaluation the harness could not run says why, here, until one runs: the builder reads it at every step, not only in the answer it may have skimmed.
    const call = progress.lastCall;
    const refused = call?.id === "graph.evaluate" && !call.result.ok ? ` Your last evaluation was not run: ${String(call.result.error ?? call.result.outcome).slice(0, 600)}. Change what that names; the same call gets the same answer.` : "";
    if (!last) return `Stage 3 of 5, a first candidate. Write the graph with the physics as formulas over a few variables, give the bounds of the variables nobody knows (fit), and evaluate it (graph.evaluate). Threshold: ${String(threshold)} ppm.${held}${refused}`;
    if (last.pass) return `Stage 5 of 5, hand over. Candidate ${last.n} (${last.path}) holds the threshold: residual ${Math.max(...last.residuals.map((r) => r.rmse))} ppm. End with task.done, the graph as the artifact: {"kind": "graph", "path": "${last.path}"}.`;
    const where = last.residuals.map((r) => `${r.column}: ${r.rmse} ppm, worst ${r.worst} at minute ${r.worstMinute}`).join("; ");
    const warned = last.warnings?.length ? ` First, ${last.warnings.join(" ")}` : "";
    return `Stage 4 of 5, the gap. Candidate ${last.n} (${last.label}) misses the threshold of ${last.threshold} ppm: ${where}, with ${JSON.stringify(last.variables)} its best fit over ${last.combinations} runs. ${candidates.length} candidate(s) so far.${warned} Look at where the curves part: if a wider range of the same variables cannot close the gap, the topology is missing something the task's hypotheses may name. A term added must name its physical hypothesis (an exchange, a source); a constant term with no physics behind it closes a gap for the wrong reason.${held} Evaluate the next candidate.${refused}`;
}

function intentionOf(task: TaskFile["task"], generic: Intention): Intention {
    const outputs = task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join("; ");
    return { ...generic, description: `Build the twin graph that produces ${outputs} and reproduces the task's telemetry within its residual threshold, from the node catalogue; evaluate each candidate (graph.evaluate) and revise it by its gap until it holds.` };
}

export const GRAPH_TOPIC: TopicDefinition = {
    name: "graph",
    tools: GRAPH_TOOLS,
    validate: (claim, files, progress) => validateGraph(claim, files, progress),
    local: (context) => [evaluateCapability(context)],
    intention: intentionOf,
    prompt: GRAPH_PROMPT,
    brief: briefOf,
};
