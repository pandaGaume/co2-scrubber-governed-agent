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
import { withBase } from "../../core/base.js";
import { JUSTIFICATIONS_SCHEMA, numbersOf, type Constant, type Justified } from "../../core/justify.js";
import type { CapabilityResult, Intention, JsonValue } from "@spiky-panda/harness";
import type { LocalCapability } from "../../core/capabilities.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicContext, TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { evaluateCandidate, evaluationOutput, knownOf, STATION_GRAPH_ID, stationReference, type Candidate, type EvaluateInput } from "./evaluate.js";
import { thresholdsOf } from "../../core/task.js";
import { wiringLines } from "./reference.js";
import { loadGraphLibrary } from "../../../lib/graph-library.js";
import type { Row } from "./params.js";
import type { TopicState } from "../../core/reasoning-state.js";

export const GRAPH_TOOLS: ReadonlyArray<RegExp> = withBase([/^workspace\.(list|read)$/, /^library\.(graphs|graph)$/, /^(twin|forge)\.registry_(search|describe_node|list_nodes)$/, /^(twin|forge)\.document_validate$/, /^graph\.evaluate$/]);

/** The generated types a replayed request may use, named in its observations by the hand-off (`slots/factory/handoff.ts`). */
export function generatedOf(task: TaskFile["task"]): Array<{ type: string; plugin: string; sha256: string; task: string }> {
    const g = (task.observations as { generated?: unknown } | undefined)?.generated;
    return Array.isArray(g) ? (g as Array<{ type: string; plugin: string; sha256: string; task: string }>).filter((x) => x && typeof x.type === "string") : [];
}
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
const PARAM_DOC = "a number, or {\"$expr\": \"formula over the variables\"}, or {\"$series\": {\"column\": \"telemetry column\", \"scale\": \"formula\", \"offset\": \"formula\"}} for the segments of a Logic.Time:timeline driven by a measured column, or {\"$first\": \"telemetry column\"}, or {\"$initialMasses\": {\"co2Ppm\": ..., \"volume\": \"V\", \"temperatureK\": 295.15}} for a Physics.Scene:atmosphere's _initialMassKg";

export const EVALUATE_SCHEMA = {
    type: "object",
    properties: {
        label: { type: "string", minLength: 1, description: "What this candidate is, in a few words (its topology and hypothesis)." },
        graph: { type: "string", description: "A graph of the library to instantiate on the twin (its id, from library.graphs), instead of a spec: its template is resolved with the settings given, the variables you do not name are taken at the graph's defaults (a known constant is held and cannot be fitted; a bounded variable is searched within its bounds), and its own probes are compared with their columns unless compare says otherwise." },
        settings: { type: "object", additionalProperties: { type: "number" }, description: "The settings of the library graph (who is on board: labOccupants, habOccupants); its defaults when absent." },
        add: {
            type: "object",
            properties: {
                nodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, typeId: { type: "string" }, params: { type: "object" } }, required: ["id", "typeId"] } },
                connections: { type: "array", items: { type: "object", properties: { from: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 }, to: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 } }, required: ["from", "to"] } },
            },
            required: ["nodes", "connections"],
            description: "With graph: nodes and connections added to the library graph once instantiated (a generated node wired into it: its output into an atmosphere's next delta_CO2_<k> input, for instance). The graph's own nodes keep their ids.",
        },
        persons: { type: "array", items: { type: "object", properties: { id: { type: "string" }, callsign: { type: "string" }, name: { type: "string" }, module: { type: "string", description: "lab or habB" }, activity: { type: "string", enum: ["sleep", "rest", "light_work", "heavy_work"] } }, required: ["module", "activity"] }, description: "Who is on board, one entry per person (their module and activity; id, callsign and name when the medical monitor names them): replaces the library graph's roster, the settings follow. The task's observations may list them (observations.persons)." },
        spec: {
            type: "object",
            properties: {
                nodes: { type: "array", minItems: 1, items: { type: "object", properties: { id: { type: "string" }, typeId: { type: "string" }, params: { type: "object", description: `node parameters; each value is ${PARAM_DOC}` } }, required: ["id", "typeId"] } },
                connections: { type: "array", items: { type: "object", properties: { from: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 }, to: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 } }, required: ["from", "to"] } },
            },
            required: ["nodes", "connections"],
            description: "The candidate graph: nodes of the catalogue and their connections [node, port]. Not with graph.",
        },
        compare: { type: "array", minItems: 1, items: COMPARE, description: "Which probe of the graph (node, property) is judged against which telemetry column. A library graph brings its own when absent." },
        variables: { type: "object", additionalProperties: { type: "number" }, description: "Variables held fixed for this evaluation. For a library graph, only names of its interface (the shelf's variables); a graph carries its known constants itself, so this is rarely needed." },
        fit: { type: "object", additionalProperties: { type: "object", properties: { min: { type: "number" }, max: { type: "number" } }, required: ["min", "max"] }, description: "The bounds of each variable nobody knows: the harness searches them with an optimiser (a few dozen runs). A constant the documentation gives goes in variables, not here." },
        estimator: { type: "string", enum: ["nelder-mead", "grid"], description: "How the bounds are searched: nelder-mead (default; a simplex search, about 10 to 20 runs per parameter, local) or grid (every combination of evenly spaced levels; levels ^ parameters runs; shows the shape of the cost)." },
        levels: { type: "number", description: "For the grid: levels per parameter (5 when absent)." },
        maxRuns: { type: "number", description: "Sandbox runs the estimator may spend on this candidate (40 when absent, 80 at most)." },
        justifications: JUSTIFICATIONS_SCHEMA,
    },
    required: ["label"],
} as const;

/**
 * The constants a candidate sets (2026-09-28), each justified like every factory's (`justify.ts`): the variables
 * held, the bounds searched (a range each), the settings, the numbers of the nodes' parameters. The estimator's
 * knobs (estimator, levels, maxRuns) are the harness's, not the installation's.
 */
export function candidateConstants(input: JsonValue): Constant[] {
    const i = (input ?? {}) as { variables?: unknown; settings?: unknown; fit?: Record<string, { min?: unknown; max?: unknown }>; spec?: { nodes?: Array<{ id?: string; params?: unknown }> }; add?: { nodes?: Array<{ id?: string; params?: unknown }> } };
    const out: Constant[] = [...numbersOf(i.variables, "variables"), ...numbersOf(i.settings, "settings")];
    for (const [name, b] of Object.entries(i.fit && typeof i.fit === "object" ? i.fit : {})) if (typeof b?.min === "number" && typeof b?.max === "number") out.push({ constant: `fit.${name}`, value: [b.min, b.max] });
    for (const [where, nodes] of [["spec", i.spec?.nodes], ["add", i.add?.nodes]] as const) for (const n of Array.isArray(nodes) ? nodes : []) out.push(...numbersOf(n?.params, `${where}.${String(n?.id)}`));
    return out;
}

/** Where a candidate's constants are: graph.evaluate, for the graph factory and for the code factory that judges its node. */
export const CANDIDATE_JUSTIFIED: Justified = { capability: /^graph\.evaluate$/, constants: candidateConstants };

/** The evaluator as a capability; `runtimeSlot` says which sandbox runs the trials (the twin's, or the forge's for the code topic, whose catalogue holds the generated plugins). */
export function evaluateCapability(context: TopicContext, runtimeSlot = "twin"): LocalCapability {
    const { broker, taskId, task, progress } = context;
    return {
        id: "graph.evaluate",
        description: "Build a candidate twin from a parametric graph, or instantiate a graph of the library on the twin (graph: its id), estimate its unknown variables within their bounds (fit, with the estimator chosen), run every trial in the twin's sandbox over the telemetry, and measure the residual against the columns named. The best is kept as candidate-<n>.spikypanda in the workshop. Answers whether the task's residual threshold is held, the residual per column and where the gap is worst, the prediction against the measurement every five minutes, and the best trials.",
        inputSchema: EVALUATE_SCHEMA as unknown as JsonValue,
        async execute(input: JsonValue): Promise<CapabilityResult> {
            const state = stateOf(progress);
            try {
                const rows = await telemetryOf(context);
                const budget = task.budget?.twinPoints ?? 40;
                const result = await evaluateCandidate(input as unknown as EvaluateInput, { broker, taskId, task, rows, runtimeSlot, remaining: budget - state.runs, n: state.candidates.length + 1, previous: state.candidates });
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
    // A required output the plan mapped to a type: the candidate handed over holds that type, or the mapping was words.
    const mapped = Object.entries(progress.plan?.produced ?? {});
    for (const g of claim.artifacts.filter((a) => a.kind === "graph" || a.kind === "twin")) {
        const candidate = candidatesOf(progress).find((c) => c.path === g.path);
        for (const [name, m] of mapped) if (candidate && !candidate.types.includes(m.type)) problems.push(`the plan says "${m.type}" produces "${name}", and candidate ${candidate.n} holds no node of that type: evaluate a candidate that holds it (for a library graph, graph.evaluate with the same graph and add: {nodes: [{id: "<an id>", typeId: "${m.type}", params: {...}}], connections: [{from: ["<that id>", "${m.port}"], to: ["<a node of the graph>", "<its input>"]}]}; library.graph gives the graph's node ids and their inputs)`);
    }
    // A twin handed over with a capability declared missing would be a twin short of what was asked: the task ends with task.fail naming it, and the harness opens the code task on the contract.
    const missing = (progress.plan?.missing_capabilities ?? []).map((m) => m.required_output);
    if (missing.length) problems.push(`the plan declares ${missing.map((m) => `"${m}"`).join(", ")} missing: a twin is not handed over short of a required output; end with task.fail naming the missing capability, the harness opens a code task on its contract and replays this request once the node exists`);
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

/**
 * The evidence each phase needs (2026-09-25): a phase moves on facts the
 * harness can check, not on a reasonable-looking call. The context phase
 * needs the telemetry, the known constants and the shelf; they are in the
 * state when the runner read them, so nothing has to be read again; when
 * one is missing, the guard refuses the plan and says what would satisfy
 * it.
 */
export function requirementsOf(progress: Progress, task: TaskFile["task"]): Record<string, boolean> {
    const { candidates } = stateOf(progress);
    const last = candidates.at(-1);
    return {
        telemetryAvailable: progress.context.telemetry !== null || (task.data ?? []).length > 0,
        // The documented constants are resolved when the task carries them, when a document was read, or when the shelf holds a reference graph: its template carries them with their sources.
        knownConstantsResolved: knownOf(task).length > 0 || progress.reads["library.read"] !== undefined || progress.context.shelf.length > 0,
        referenceGraphsKnown: progress.context.shelf.length > 0 || progress.reads["library.graphs"] !== undefined,
        // The task's sources agree on every fact they share (the request's known constants, the register's devices, the library): a SOURCE_CONFLICT is resolved upstream, not papered over by the reference graph.
        sourcesConsistent: progress.context.contracts?.status !== "CONFLICT",
        planAccepted: progress.plan !== null,
        candidateEvaluated: candidates.length > 0,
        candidateHeld: last?.pass === true,
    };
}

/** What would satisfy an unmet requirement of the context phase. */
const HOW: Record<string, string> = {
    sourcesConsistent: "SOURCE_CONFLICT: the task's sources disagree on a fact (the state's invariants.contracts names it, and who must revise); the reference graph would take the device's value and hide the error: end with task.fail naming the conflict and REQUIRE_RESOLUTION, so the request is revised upstream",
    telemetryAvailable: "the task carries no telemetry table: nothing to judge a twin against (task.fail with that reason)",
    knownConstantsResolved: "no known constant in the task and nothing read from the library: read the device's datasheet (library.read) so the documented constants are held",
    referenceGraphsKnown: "the shelf is not known: library.graphs lists the reference graphs",
};

/** The topic's part of the reasoning state: the hypothesis under test, the last evaluation made compact, the open questions, the evidence. */
export function stateOfTopic(progress: Progress, task: TaskFile["task"]): TopicState {
    const { candidates } = stateOf(progress);
    const last = candidates.at(-1);
    const requirements = requirementsOf(progress, task);
    const openQuestions: string[] = [];
    let hypothesis: TopicState["hypothesis"] = progress.plan ? { plannedTypes: progress.plan.selected_nodes, missing: progress.plan.missing_capabilities.map((m) => m.required_output) } : null;
    let evaluation: TopicState["evaluation"] = null;
    if (last) {
        const status = (k: string) => (last.fitted.includes(k) ? "fitted" : last.fromDevice?.[k] ? "device" : last.defaulted?.includes(k) ? "documented, the graph's default" : "given");
        hypothesis = {
            candidate: last.n,
            path: last.path,
            graph: last.graph ?? null,
            label: last.label,
            types: last.types,
            variables: Object.fromEntries(Object.entries(last.variables).map(([k, v]) => [k, { value: v, status: status(k) }])),
            ...(last.settings ? { settings: last.settings } : {}),
            ...(last.persons ? { persons: last.persons.map((p) => `${p.callsign || p.id || "someone"} in ${p.module} at ${p.activity}`) } : {}),
        };
        evaluation = {
            candidate: last.n,
            status: last.status,
            diagnosis: last.diagnosis,
            calibration: last.calibration,
            validation: last.validation,
            pass: last.pass,
            thresholds: (last.thresholds ?? { rmsePpmMax: last.threshold, absoluteResidualPpmMax: null }) as unknown as JsonValue,
            coverage: last.coverage ? { expected: last.coverage.expected, predicted: last.coverage.predicted, missing: last.coverage.missing.length, valid: last.coverage.valid } : null,
            residuals: last.residuals.map((r) => ({ column: r.column, rmse: r.rmse, worst: r.worst, worstMinute: r.worstMinute })),
            parameters: (last.parameters ?? null) as unknown as JsonValue,
            ...(last.atBounds?.length ? { atBounds: last.atBounds } : {}),
            ...(last.identifiability ? { identifiabilityAssessment: last.identifiabilityAssessment ?? "NOT_ASSESSED", identifiability: last.identifiability } : {}),
            ...(last.diagnostics ? { diagnostics: last.diagnostics } : {}),
            ...(last.early ? { firstSlope: { predicted: last.early.predicted, measured: last.early.measured } } : {}),
            warnings: last.warnings.map((w) => w.slice(0, 300)),
            runs: last.combinations,
            candidatesSoFar: candidates.length,
        };
        const worst = [...last.residuals].sort((a, b) => b.rmse - a.rmse)[0];
        switch (last.diagnosis) {
            case "INVALID_EVALUATION":
                openQuestions.push(`the evaluation of candidate ${last.n} is invalid (${(last.diagnostics ?? []).map((d) => d.reason).join(", ")}): fix what the diagnostics name before any residual is read`);
                break;
            case "PARAMETER_MISMATCH":
                if (last.heldFitted?.length) openQuestions.push(`candidate ${last.n} held ${last.heldFitted.join(", ")} at a value, and the graph says only the installation knows ${last.heldFitted.length > 1 ? "them" : "it"}: fit ${last.heldFitted.length > 1 ? "them" : "it"} within the graph's bounds before doubting the structure`);
                else openQuestions.push(`candidate ${last.n} ends at the edge of the range for ${(last.atBounds ?? []).join(", ")}: the range decided, not the physics; widen it only if the physics allows the value beyond, else the structure is in question`);
                break;
            case "STRUCTURAL_MISMATCH":
                openQuestions.push(`no admissible parameter set of this structure follows ${worst?.column ?? "the telemetry"} (worst ${worst?.worst ?? "?"} ppm at minute ${worst?.worstMinute ?? "?"}): a term is missing or wrong; revise the topology, do not widen the bounds again`);
                break;
            default:
                break;
        }
        if (last.pass && last.fitted.length) openQuestions.push(`the identifiability of ${last.fitted.join(", ")} is not assessed (no profile likelihood or sensitivity yet; evaluation.identifiability gives the range each takes among the trials under the threshold): say so when handing over`);
        if (last.pass) openQuestions.push("calibration passed on this telemetry; validation on another profile, hatch state or occupancy has not been performed: hand over as calibrated, not validated");    }
    return { hypothesis, evaluation, openQuestions, requirements };
}

/** The harness's brief, stage by stage: what the task holds, the plan, the candidates and what the last one showed. */
export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    const { candidates } = stateOf(progress);
    const bounds = thresholdsOf(task);
    const threshold = bounds ? `an RMSE of ${bounds.rmsePpmMax} ppm per compared column${bounds.absoluteResidualPpmMax !== null ? ` and ${bounds.absoluteResidualPpmMax} ppm at the worst minute` : ""}` : "no threshold (the task must give objective.constraints.rmsePpmMax)";
    const outputs = task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join(", ");
    const known = knownOf(task);
    // The documented constants, said at every stage: held in variables under their symbol, never fitted.
    const held = known.length ? ` Known, from the documentation, held in variables under these names and never fitted: ${known.map((k) => `${k.symbol} = ${k.value}${k.unit ? ` ${k.unit}` : ""}${typeof k.min === "number" && typeof k.max === "number" ? ` (band ${k.min} to ${k.max}: may be fitted within it)` : ""} (${k.name ?? ""}${k.source ? `, ${k.source}` : ""})`).join("; ")}. Watch their units against the nodes' (a flow in m3/min enters a node as flow / V).` : "";
    const requirements = requirementsOf(progress, task);
    const unmet = Object.entries(requirements).filter(([k, v]) => !v && k in HOW).map(([k]) => `${k}: ${HOW[k]}`);
    if (progress.phase === "plan") {
        if (unmet.length) return `Plan, not yet: the evidence the plan needs is incomplete. ${unmet.join(". ")}. The state (the observation) holds what the harness already read: the task's invariants, the telemetry's shape, the shelf; read nothing it already gives. The twin must produce ${outputs} within ${threshold}.${held}`;
        const rt = task.runtime ?? "twin";
        const generated = generatedOf(task);
        const generatedNote = generated.length ? ` This request is replayed on the forge's catalogue, which now holds the generated type(s) ${generated.map((g) => `"${g.type}"`).join(", ")} (${rt}.registry_describe_node for their ports and signature): select them, map the output they were made for in produced (its exact name, the type, the port), and wire them into the candidate (for a library graph, graph.evaluate's add: the node and its connections into the graph's own node ids); nothing is missing any more.` : "";
        return `Plan. The state holds the task's invariants (objective, outputs, threshold, the known constants with their status), the telemetry's shape and the library's shelf (the reference graph "${STATION_GRAPH_ID}" with its node types, its variables and their status): nothing needs reading first. Submit task.plan with the node types you will use, copied from the shelf's "types" for the reference graph (they are the catalogue's exact ids), or a structure of your own from the catalogue (${rt}.registry_search); declare missing only what no node can express.${generatedNote} A required output that no telemetry column judges is either mapped in produced (its exact name to the selected type and the output port that produce it: a quantity in common is not enough, a person's CO2 is a mass flow and not a leak) or declared missing. A required output no node of the catalogue produces is declared missing with the topic "code" and its contract, written on the library's card "capability-contract" (library.read it once before writing: the shape, the rules, three examples; the forge runs the contract on the node, so a behavior is a measurement): the code factory writes the node against it, the forge runs the contract on the node, and this request is replayed with the node in the catalogue; leave the type to the code factory (it is named under Generated.). After such a plan this task ends by itself: nothing to evaluate here, the twin is built on the replay. The twin must produce ${outputs} within ${threshold}.${held}`;
    }
    const last = candidates.at(-1);
    // An evaluation the harness could not run says why, here, until one runs: the builder reads it at every step, not only in the answer it may have skimmed.
    const call = progress.lastCall;
    const refused = call?.id === "graph.evaluate" && !call.result.ok ? ` Your last evaluation was not run: ${String(call.result.error ?? call.result.outcome).slice(0, 600)}. Change what that names; the same call gets the same answer.` : "";
    // What already exists: the station's reference graph on the library's shelf, its wiring by types and ports, read from its template by code.
    const station = stationReference();
    const devices = Array.isArray((task.observations as { devices?: unknown }).devices) ? ((task.observations as { devices: Array<{ path: string }> }).devices.map((d) => d.path).join(", ")) : "";
    const persons = Array.isArray((task.observations as { persons?: unknown }).persons) ? ((task.observations as { persons: Array<{ module: string; activity: string; callsign?: string }> }).persons.map((p) => `${p.callsign ?? "someone"} in ${p.module} at ${p.activity}`).join(", ")) : "";
    const start = station ? ` The library holds the station's reference graph (library.graphs, graph "${STATION_GRAPH_ID}": two volumes in mass, the persons by name, the scrubber in its datasheet's units, the ventilation through its filter, the sensors); do not rebuild it: instantiate it (graph.evaluate with graph: "${STATION_GRAPH_ID}", persons for who is on board, fit for the bounds of what only the installation knows; its interface is the shelf's variables and nothing else, a name outside it is refused) and adapt its numbers. The scrubber's own numbers come from the registered device (${devices ? `the task carries the register: ${devices}` : "the datasheet's defaults when the task carries no device"}) and are held; what is fitted is the volumes and the filter's loading, the operators' rate within its band.${persons ? ` On board, as observed: ${persons}: give them as persons.` : ""} It is wired: ${wiringLines(station)}. A spec of your own is accepted instead, with a measured input as a Logic.Time:timeline whose segments are the $series, its value port wired into the input.` : "";
    // A type the plan maps outside the library graph (a generated node): the evaluation holds it through add, said here with the exact wiring, before the first candidate and before a hand-over.
    const needFirst = station ? addNeededFor(progress, STATION_GRAPH_ID) : null;
    if (!last) return `Evaluate a first candidate.${start}${needFirst ? ` Also, ${addSentence(needFirst, STATION_GRAPH_ID)}.` : ""} Give the bounds of the variables nobody knows (fit), justify every number you set (justifications: each variable held, each bound, each setting, each parameter, with its source), and evaluate the candidate (graph.evaluate); its answer is compact, the whole is at the handle the state names. Threshold: ${threshold}.${held}${refused}`;
    const where = last.residuals.map((r) => `${r.column}: ${r.rmse} ppm, worst ${r.worst} at minute ${r.worstMinute}`).join("; ");
    const needLast = last.graph ? addNeededFor(progress, last.graph, last.types) : null;
    if (last.diagnosis === "PASS" && needLast) return `Not a hand-over yet. Candidate ${last.n} (${last.path}) holds the threshold (${where}) but not ${needLast.types.map((t) => `"${t}"`).join(", ")}, which the plan says produces a required output: a twin handed over without it is short of what was asked. Evaluate the same graph "${last.graph}" with the same levers and add wiring the node in, for instance add: ${JSON.stringify(needLast.add)} (the graph's atmospheres: ${needLast.where}; params left empty keep the values the contract set); then hand that candidate over.`;
    if (last.diagnosis === "PASS") return `Hand over. Candidate ${last.n} (${last.path}) holds the threshold: ${where}. The harness hands the numbers over itself, from the evaluation (the state's evaluation.parameters: for each variable its value, unit, name and how it was set); the summary says in words what was found and does not give a variable a meaning of its own. Its calibration passed on this telemetry; its validation on another profile, hatch state or occupancy was not performed, and the identifiability of the fitted parameters is not assessed: say both. End with task.done, the graph as the artifact: {"kind": "graph", "path": "${last.path}"}.`;
    if (last.diagnosis === "INVALID_EVALUATION") return `The evaluation of candidate ${last.n} is invalid, no residual was trusted: ${(last.diagnostics ?? []).map((d) => `${d.reason}${d.column ? ` on ${d.column}` : ""}${d.minute !== undefined ? ` at minute ${d.minute}` : ""}${d.detail ? ` (${d.detail})` : ""}`).join("; ")}. Fix what that names (a probe that exists, a run that covers the telemetry) and evaluate again.${refused}`;
    const warned = last.warnings?.length ? ` ${last.warnings.map((w) => w.slice(0, 400)).join(" ")}` : "";
    // On a library graph the levers of the next candidate are its interface, nothing to read: the bounds (fit), who is on board (persons: one more person where the curve parts, another activity), the settings; or a spec of one's own.
    const worst = [...last.residuals].sort((a, b) => b.rmse - a.rmse)[0];
    const levers = last.graph
        ? ` The next candidate is the same graph "${last.graph}" with its levers, which the state already holds (do not read the template again): fit (the bounds of V, Vh, L, g within the graph's), persons (who is on board: the observed persons plus one more in the module whose column parts most, ${worst ? `${worst.column}, ${worst.rmse} ppm` : "the worst column"}, or an activity changed: a CO2 source the observation missed is one more person at work there), settings; or a spec of your own from the catalogue. A rate at the top of its band with that column still under-predicted means more CO2 is produced there than the observed persons make: add a person there.`
        : "";
    if (last.diagnosis === "PARAMETER_MISMATCH") {
        const why = last.heldFitted?.length ? `it held ${last.heldFitted.join(", ")} at a value (${JSON.stringify(Object.fromEntries(last.heldFitted.map((k) => [k, last.variables[k]])))}), and the graph says only the installation knows ${last.heldFitted.length > 1 ? "them" : "it"}: fit ${last.heldFitted.length > 1 ? "them" : "it"} within the graph's bounds` : `its best fit sits at the edge of the range for ${(last.atBounds ?? []).join(", ")} (${JSON.stringify(last.variables)} over ${last.combinations} runs): the range decided, not the physics. Widen that range only if the physics allows the value beyond it (the graph's bounds are the template's; a documented band is never left); otherwise the structure is in question`;
        return `The gap is a parameter's. Candidate ${last.n} (${last.label}) misses the threshold of ${last.threshold} ppm: ${where}; ${why}.${warned} ${candidates.length} candidate(s) so far.${levers} Evaluate the next (graph.evaluate).${held}${refused}`;
    }
    return `The gap is structural. Candidate ${last.n} (${last.label}) misses the threshold of ${last.threshold} ppm: ${where}, with ${JSON.stringify(last.variables)} its best fit over ${last.combinations} runs, and no admissible parameter set of this structure closes it (${candidates.length} candidate(s) so far).${warned} Do not widen the bounds again: revise the topology where the curves part, guided by the task's hypotheses.${levers} ${last.reference && last.reference.missingWires.length ? `Against the station's reference graph, candidate ${last.n} lacks: ${last.reference.missingWires.join("; ")}. ` : ""}A term added must name its physical hypothesis (an exchange, a source); a constant term with no physics behind it closes a gap for the wrong reason.${held} Evaluate the next candidate (graph.evaluate).${refused}`;
}

function intentionOf(task: TaskFile["task"], generic: Intention): Intention {
    const outputs = task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join("; ");
    return { ...generic, description: `Build the twin graph that produces ${outputs} and reproduces the task's telemetry within its residual threshold, from the node catalogue; evaluate each candidate (graph.evaluate) and revise it by its gap until it holds.` };
}

/**
 * The `add` a library-graph evaluation needs so the candidate holds the types the plan maps outside the graph (a generated node, on the
 * replay of a hand-off): the node and its output into an atmosphere's next free delta_CO2_<k> input, where the graph sums its sources of
 * CO2. Computed by code from the template, said in the brief, required by the guard (2026-09-27: on two page runs the model evaluated the
 * library graph without the node it had mapped, then reworded task.done against the validator's verdict until its budget or STUCK ended it).
 * `present`: the types already held (the candidate's, or the call's add). Null when nothing is short.
 */
export function addNeededFor(progress: Progress, graphId: string, present: string[] = []): { types: string[]; add: { nodes: Array<{ id: string; typeId: string; params: Record<string, never> }>; connections: Array<{ from: [string, string]; to: [string, string] }> }; where: string } | null {
    const mapped = Object.entries(progress.plan?.produced ?? {});
    if (!mapped.length) return null;
    const entry = loadGraphLibrary().find((g) => g.template.id === graphId);
    if (!entry) return null;
    const spec = entry.template.spec;
    const own = new Set(spec.nodes.map((n) => n.typeId));
    const short = mapped.filter(([, m]) => !own.has(m.type) && !present.includes(m.type));
    if (!short.length) return null;
    const atmospheres = spec.nodes
        .filter((n) => n.typeId === "Physics.Scene:atmosphere")
        .map((n) => {
            const used = spec.connections.filter((c) => c.to[0] === n.id && /^delta_CO2_\d+$/.test(c.to[1])).map((c) => Number(c.to[1].slice("delta_CO2_".length)));
            return { id: n.id, next: used.length ? Math.max(...used) + 1 : 0 };
        });
    const first = atmospheres[0];
    const nodes = short.map(([, m], i) => ({ id: `generated-${i + 1}`, typeId: m.type, params: {} as Record<string, never> }));
    const connections = first ? short.map(([, m], i): { from: [string, string]; to: [string, string] } => ({ from: [`generated-${i + 1}`, m.port], to: [first.id, `delta_CO2_${first.next + i}`] })) : [];
    const where = atmospheres.map((a) => `${a.id} (its next free CO2 input: delta_CO2_${a.next})`).join(", ");
    return { types: short.map(([, m]) => m.type), add: { nodes, connections }, where };
}

/** The sentence the brief and the guard say about a mapped type the graph does not hold. */
function addSentence(need: NonNullable<ReturnType<typeof addNeededFor>>, graphId: string): string {
    return `the plan says ${need.types.map((t) => `"${t}"`).join(", ")} produce(s) a required output, and graph "${graphId}" holds no node of that type: evaluate it with add wiring the node into the module the request names, for instance add: ${JSON.stringify(need.add)} (the graph's atmospheres: ${need.where}; params left empty keep the values the contract set)`;
}

/** The topic's own refusals: a plan before its evidence is in (the phase moves on facts, not on a call); a library-graph evaluation short of a type the plan maps. */
function guardGraph(capabilityId: string, input: JsonValue, context: TopicContext): string[] {
    if (capabilityId === "graph.evaluate") {
        const call = input && typeof input === "object" && !Array.isArray(input) ? (input as { graph?: unknown; add?: { nodes?: Array<{ typeId?: unknown }> } }) : null;
        if (call && typeof call.graph === "string") {
            const need = addNeededFor(context.progress, call.graph, (call.add?.nodes ?? []).map((n) => String(n?.typeId ?? "")));
            if (need) return [addSentence(need, call.graph)];
        }
        return [];
    }
    if (capabilityId !== "task.plan") return [];
    const requirements = requirementsOf(context.progress, context.task);
    return Object.entries(requirements)
        .filter(([k, v]) => !v && k in HOW)
        .map(([k]) => `the plan needs ${k}: ${HOW[k]}`);
}

export const GRAPH_TOPIC: TopicDefinition = {
    name: "graph",
    tools: GRAPH_TOOLS,
    // A candidate is evaluated again against this task's data, a plan checked again by the guard, a claim by the validator: a recipe here is a first try, judged.
    replayedActions: [/^task\.(plan|done)$/, /^graph\.evaluate$/],
    justified: CANDIDATE_JUSTIFIED,
    validate: (claim, files, progress) => validateGraph(claim, files, progress),
    local: (context) => [evaluateCapability(context, context.runtimeSlot ?? "twin")],
    guard: guardGraph,
    state: stateOfTopic,
    runsSpent: (progress) => stateOf(progress).runs,
    // The hand-over is built from the evaluator's metadata, never from a sentence: the accepted candidate's parameters, residuals, bounds and statuses.
    claims: (progress) => {
        const last = [...candidatesOf(progress)].reverse().find((c) => c.pass);
        if (!last) return {};
        return {
            candidate: { n: last.n, path: last.path, sha256: last.sha256, graph: last.graph ?? null, label: last.label },
            parameters: (last.parameters ?? {}) as unknown as JsonValue,
            residuals: last.residuals as unknown as JsonValue,
            thresholds: (last.thresholds ?? { rmsePpmMax: last.threshold, absoluteResidualPpmMax: null }) as unknown as JsonValue,
            coverage: (last.coverage ?? null) as unknown as JsonValue,
            calibration: last.calibration,
            validation: last.validation,
            identifiability: { assessment: last.identifiabilityAssessment ?? "NOT_ASSESSED", ...((last.identifiability ?? {}) as Record<string, JsonValue>) },
            ...(last.persons ? { persons: last.persons as unknown as JsonValue } : {}),
        };
    },
    // The last candidate's diagnosis tells the steps apart: a step learned after a failed candidate does not replay after one that held.
    key: (progress) => stateOf(progress).candidates.at(-1)?.diagnosis ?? "",
    intention: intentionOf,
    prompt: GRAPH_PROMPT,
    brief: briefOf,
};
