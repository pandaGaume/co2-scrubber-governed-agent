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
 *
 * Since 2026-09-28 (zero domain in the harness) what the factory knows of the
 * application is its spec's (`specs/graph/format.json`: the reference graph,
 * where a generated node is wired, who is told), the schema of an evaluation
 * is `specs/graph/evaluate.schema.json`, and every sentence it says is a
 * template of `specs/graph/words.json`.
 */
import { withBase } from "../../core/base.js";
import { JUSTIFICATIONS_SCHEMA, numbersOf, type Constant, type Justified } from "../../core/justify.js";
import type { CapabilityResult, Intention, JsonValue } from "@spiky-panda/harness";
import type { LocalCapability } from "../../core/capabilities.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicContext, TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { evaluateCandidate, evaluationOutput, knownOf, REFERENCE_GRAPH_ID, referenceGraph, type Candidate, type EvaluateInput } from "./evaluate.js";
import { RMSE_CONSTRAINT, thresholdsOf } from "../../core/task.js";
import { readFileSync } from "node:fs";
import { fromRoot } from "../../../lib/paths.js";
import { APP, observedLine } from "../../core/application.js";
import { GRAPH_FORMAT, GRAPH_WORDS, gw } from "./format.js";
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
export const GRAPH_PROMPT = GRAPH_FORMAT.prompt;
const UNIT = APP.thresholds.unit;

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
    throw new Error(gw("noTelemetry"));
}

/** The schema of an evaluation, the spec's, with the socle's justifications. */
export const EVALUATE_SCHEMA: Record<string, unknown> = (() => {
    const schema = JSON.parse(readFileSync(fromRoot(...GRAPH_FORMAT.evaluateSchema.split("/")), "utf8")) as { properties: Record<string, unknown> };
    schema.properties.justifications = JUSTIFICATIONS_SCHEMA;
    return schema;
})();

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
        description: gw("capability"),
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
                if (GRAPH_FORMAT.notify) {
                    const told = await broker.call(GRAPH_FORMAT.notify.slot, GRAPH_FORMAT.notify.tool, { taskId, n: c.n, nodes: c.nodes, connections: c.connections, rmse, threshold: c.threshold, pass: c.pass });
                    if (!told.ok) progress.topic.notifyFailed = told.error ?? told.outcome;
                }
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
        for (const [name, m] of mapped) if (candidate && !candidate.types.includes(m.type)) problems.push(gw("validate.unmapped", { type: m.type, name, n: candidate.n, port: m.port }));
    }
    // A twin handed over with a capability declared missing would be a twin short of what was asked: the task ends with task.fail naming it, and the harness opens the code task on the contract.
    const missing = (progress.plan?.missing_capabilities ?? []).map((m) => m.required_output);
    if (missing.length) problems.push(gw("validate.missing", { names: missing.map((m) => `"${m}"`).join(", ") }));
    // A twin is a graph here: the claim may name it either way, the file is what counts.
    const graphs = claim.artifacts.filter((a) => a.kind === "graph" || a.kind === "twin" || a.path.endsWith(".spikypanda"));
    if (!graphs.length) problems.push(gw("validate.none"));
    for (const g of graphs) {
        const file = files.find((f) => f.path === g.path);
        const candidate = candidatesOf(progress).find((c) => c.path === g.path);
        if (!file) problems.push(gw("validate.notAFile", { path: g.path }));
        else if (!candidate) problems.push(gw("validate.notACandidate", { path: g.path }));
        else if (candidate.sha256 !== file.sha256) problems.push(gw("validate.notTheFile", { path: g.path, sha: candidate.sha256.slice(0, 12) }));
        else if (!candidate.pass) problems.push(gw("validate.above", { path: g.path, rmse: Math.max(...candidate.residuals.map((r) => r.rmse)), threshold: candidate.threshold, unit: UNIT }));
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

/** What would satisfy an unmet requirement of the context phase: the requirements the words file says how to meet. */
const HOW_KEYS = ["sourcesConsistent", "telemetryAvailable", "knownConstantsResolved", "referenceGraphsKnown"];
const howOf = (k: string): string => gw(`how.${k}`);

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
            ...(last.persons ? { persons: last.persons.map((p) => personLine(p as unknown as Record<string, unknown>)) } : {}),
        };
        evaluation = {
            candidate: last.n,
            status: last.status,
            diagnosis: last.diagnosis,
            calibration: last.calibration,
            validation: last.validation,
            pass: last.pass,
            thresholds: (last.thresholds ?? { rmseMax: last.threshold, absoluteMax: null, unit: UNIT }) as unknown as JsonValue,
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
                openQuestions.push(gw("openQuestions.invalid", { n: last.n, reasons: (last.diagnostics ?? []).map((d) => d.reason).join(", ") }));
                break;
            case "PARAMETER_MISMATCH":
                if (last.heldFitted?.length) openQuestions.push(gw("openQuestions.heldFitted", { n: last.n, names: last.heldFitted.join(", "), them: last.heldFitted.length > 1 ? "them" : "it" }));
                else openQuestions.push(gw("openQuestions.atBounds", { n: last.n, names: (last.atBounds ?? []).join(", ") }));
                break;
            case "STRUCTURAL_MISMATCH":
                openQuestions.push(gw("openQuestions.structural", { column: worst?.column ?? "the telemetry", worst: worst?.worst ?? "?", unit: UNIT, minute: worst?.worstMinute ?? "?" }));
                break;
            default:
                break;
        }
        if (last.pass && last.fitted.length) openQuestions.push(gw("openQuestions.identifiability", { names: last.fitted.join(", ") }));
        if (last.pass) openQuestions.push(gw("openQuestions.calibrated"));
    }
    return { hypothesis, evaluation, openQuestions, requirements };
}

/** Who is on board, one line each, by the application's template. */
const personLine = (p: Record<string, unknown>): string => observedLine("persons", { ...p, callsign: p.callsign || p.id || "someone" }) ?? JSON.stringify(p);

/** The harness's brief, stage by stage: what the task holds, the plan, the candidates and what the last one showed; every sentence the spec's. */
export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    const { candidates } = stateOf(progress);
    const bounds = thresholdsOf(task);
    const threshold = bounds ? gw("threshold.some", { rmse: bounds.rmseMax, unit: bounds.unit, absolute: bounds.absoluteMax !== null ? gw("threshold.absolute", { absolute: bounds.absoluteMax, unit: bounds.unit }) : "" }) : gw("threshold.none", { constraint: RMSE_CONSTRAINT });
    const outputs = task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join(", ");
    const known = knownOf(task);
    // The documented constants, said at every stage: held in variables under their symbol, never fitted.
    const held = known.length
        ? gw("held", {
              known: known
                  .map((k) => gw("heldOne", { symbol: k.symbol, value: k.value, unit: k.unit ? ` ${k.unit}` : "", band: typeof k.min === "number" && typeof k.max === "number" ? gw("heldBand", { min: k.min, max: k.max }) : "", name: k.name ?? "", source: k.source ? `, ${k.source}` : "" }))
                  .join("; "),
          })
        : "";
    const requirements = requirementsOf(progress, task);
    const unmet = Object.entries(requirements).filter(([k, v]) => !v && HOW_KEYS.includes(k)).map(([k]) => `${k}: ${howOf(k)}`);
    if (progress.phase === "plan") {
        if (unmet.length) return gw("brief.planNotYet", { unmet: unmet.join(". "), outputs, threshold, held });
        const rt = task.runtime ?? "twin";
        const generated = generatedOf(task);
        const generatedNote = generated.length ? gw("brief.generated", { types: generated.map((g) => `"${g.type}"`).join(", "), runtime: rt }) : "";
        return gw("brief.plan", { reference: REFERENCE_GRAPH_ID, runtime: rt, generated: generatedNote, outputs, threshold, held });
    }
    const last = candidates.at(-1);
    // An evaluation the harness could not run says why, here, until one runs: the builder reads it at every step, not only in the answer it may have skimmed.
    const call = progress.lastCall;
    const refused = call?.id === "graph.evaluate" && !call.result.ok ? gw("brief.refused", { error: String(call.result.error ?? call.result.outcome).slice(0, 600) }) : "";
    // What already exists: the reference graph on the library's shelf, its wiring by types and ports, read from its template by code.
    const reference = referenceGraph();
    const observations = (task.observations ?? {}) as { devices?: unknown; persons?: unknown };
    const devices = Array.isArray(observations.devices) ? (observations.devices as Array<{ path: string }>).map((d) => d.path).join(", ") : "";
    const persons = Array.isArray(observations.persons) ? (observations.persons as Array<Record<string, unknown>>).map(personLine).join(", ") : "";
    const start = reference
        ? gw("brief.start", {
              reference: REFERENCE_GRAPH_ID,
              devices: devices ? gw("brief.startDevices", { devices }) : gw("brief.startNoDevice"),
              persons: persons ? gw("brief.startPersons", { persons }) : "",
              wiring: wiringLines(reference),
          })
        : "";
    // A type the plan maps outside the library graph (a generated node): the evaluation holds it through add, said here with the exact wiring, before the first candidate and before a hand-over.
    const needFirst = reference ? addNeededFor(progress, REFERENCE_GRAPH_ID) : null;
    if (!last) return gw("brief.first", { start, also: needFirst ? gw("brief.firstAlso", { sentence: addSentence(needFirst, REFERENCE_GRAPH_ID) }) : "", threshold, held, refused });
    const where = last.residuals.map((r) => gw("brief.where", { column: r.column, rmse: r.rmse, unit: UNIT, worst: r.worst, minute: r.worstMinute })).join("; ");
    const needLast = last.graph ? addNeededFor(progress, last.graph, last.types) : null;
    if (last.diagnosis === "PASS" && needLast) return gw("brief.notYet", { n: last.n, path: last.path, where, types: needLast.types.map((t) => `"${t}"`).join(", "), graph: last.graph ?? "", add: JSON.stringify(needLast.add), sinks: needLast.where });
    if (last.diagnosis === "PASS") return gw("brief.handOver", { n: last.n, path: last.path, where });
    if (last.diagnosis === "INVALID_EVALUATION") return gw("brief.invalid", { n: last.n, diagnostics: (last.diagnostics ?? []).map((d) => `${d.reason}${d.column ? ` on ${d.column}` : ""}${d.minute !== undefined ? ` at minute ${d.minute}` : ""}${d.detail ? ` (${d.detail})` : ""}`).join("; "), refused });
    const warned = last.warnings?.length ? ` ${last.warnings.map((w) => w.slice(0, 400)).join(" ")}` : "";
    // On a library graph the levers of the next candidate are its interface, nothing to read: the bounds (fit) of the variables the graph leaves to the installation, who is on board, the settings; or a spec of one's own.
    const worst = [...last.residuals].sort((a, b) => b.rmse - a.rmse)[0];
    const fittable = last.graph ? fittableOf(last.graph) : [];
    const levers = last.graph ? gw("brief.levers", { graph: last.graph, fitted: fittable.join(", ") || last.fitted.join(", "), worst: worst ? gw("brief.leversWorst", { column: worst.column, rmse: worst.rmse, unit: UNIT }) : gw("brief.leversNoWorst") }) : "";
    if (last.diagnosis === "PARAMETER_MISMATCH") {
        const them = (last.heldFitted?.length ?? 0) > 1 ? "them" : "it";
        const why = last.heldFitted?.length
            ? gw("brief.parameterHeld", { names: last.heldFitted.join(", "), values: JSON.stringify(Object.fromEntries(last.heldFitted.map((k) => [k, last.variables[k]]))), them })
            : gw("brief.parameterEdge", { names: (last.atBounds ?? []).join(", "), variables: JSON.stringify(last.variables), runs: last.combinations });
        return gw("brief.parameter", { n: last.n, label: last.label, threshold: last.threshold, unit: UNIT, where, why, warned, count: candidates.length, levers, held, refused });
    }
    const lacks = last.reference && last.reference.missingWires.length ? gw("brief.lacks", { n: last.n, wires: last.reference.missingWires.join("; ") }) : "";
    return gw("brief.structural", { n: last.n, label: last.label, threshold: last.threshold, unit: UNIT, where, variables: JSON.stringify(last.variables), runs: last.combinations, count: candidates.length, warned, levers, lacks, held, refused });
}

/** The variables a library graph leaves to the fit (fitted, or within a documented band): the levers of its next candidate, read from its template. */
function fittableOf(graphId: string): string[] {
    const entry = loadGraphLibrary().find((g) => g.template.id === graphId);
    if (!entry) return [];
    return Object.entries(entry.template.variables as Record<string, { status?: string }>)
        .filter(([, v]) => v?.status === "fitted" || v?.status === "band")
        .map(([k]) => k);
}

function intentionOf(task: TaskFile["task"], generic: Intention): Intention {
    const outputs = task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join("; ");
    return { ...generic, description: gw("intention", { outputs }) };
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
    // The sink: the node type that sums the sources, and the prefix of its numbered inputs (the spec's).
    const { type: sinkType, port: prefix } = GRAPH_FORMAT.sink;
    const numbered = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\d+$`);
    const sinks = spec.nodes
        .filter((n) => n.typeId === sinkType)
        .map((n) => {
            const used = spec.connections.filter((c) => c.to[0] === n.id && numbered.test(c.to[1])).map((c) => Number(c.to[1].slice(prefix.length)));
            return { id: n.id, next: used.length ? Math.max(...used) + 1 : 0 };
        });
    const first = sinks[0];
    const nodes = short.map(([, m], i) => ({ id: `generated-${i + 1}`, typeId: m.type, params: {} as Record<string, never> }));
    const connections = first ? short.map(([, m], i): { from: [string, string]; to: [string, string] } => ({ from: [`generated-${i + 1}`, m.port], to: [first.id, `${prefix}${first.next + i}`] })) : [];
    const where = sinks.map((a) => gw("add.sink", { id: a.id, port: `${prefix}${a.next}` })).join(", ");
    return { types: short.map(([, m]) => m.type), add: { nodes, connections }, where };
}

/** The sentence the brief and the guard say about a mapped type the graph does not hold. */
function addSentence(need: NonNullable<ReturnType<typeof addNeededFor>>, graphId: string): string {
    return gw("add.sentence", { types: need.types.map((t) => `"${t}"`).join(", "), graph: graphId, add: JSON.stringify(need.add), sinks: need.where });
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
        .filter(([k, v]) => !v && HOW_KEYS.includes(k))
        .map(([k]) => gw("how.missing", { requirement: k, how: howOf(k) }));
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
            thresholds: (last.thresholds ?? { rmseMax: last.threshold, absoluteMax: null, unit: UNIT }) as unknown as JsonValue,
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
    words: { words: GRAPH_WORDS, keys: Object.keys(GRAPH_WORDS.templates) },
    brief: briefOf,
};
