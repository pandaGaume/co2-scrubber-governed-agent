/**
 * The `code` topic: write the node the catalogue lacks, through the forge
 * (docs/observateur-et-usines.fr.md, sections 6 to 6.2). Its entry is a
 * required output no node of the catalogue produces (a graph factory's
 * `missing_capabilities` with the topic `code`, or a task opened with the
 * topic itself); its exit is a signed plugin artifact proposed to the
 * station, the twin's catalogue untouched.
 *
 * What the topic does itself is little, and deterministic: the forge holds
 * the sandbox and the checks (`slots/forge`), the constructor holds the
 * loop; this file gives the loop what the `procedure` topic got on
 * 2026-09-25: the tools, a guard of its own (the plugin's types named
 * under `Generated.` before anything is compiled, one plugin per task, a
 * promotion only after the node ran, a hand-over only after the
 * promotion), its part of the reasoning state (what the forge answered at
 * each stage, whole where the model needs it whole: the diagnostics, the
 * refused checks, the tests' output), the brief stage by stage, the key
 * that tells the steps apart for the recipes, the claims built by code from
 * what the forge measured, and the validator (the claimed artifact is the
 * very file the forge signed).
 *
 * The stages, in the order a plugin goes through the forge:
 *   1  the gap and the catalogue      forge.registry_search: what exists, so
 *                                     that a node is written only for what
 *                                     nothing produces; the library for the physics
 *   2  the plan                       task.plan: selected_nodes empty, one
 *                                     missing capability per required output,
 *                                     topic "code"
 *   3  the plugin                     forge.plugin_write: the entry, the node,
 *                                     its tests, its card
 *   4  compiled, tested, loaded       forge.plugin_build, forge.plugin_test,
 *                                     forge.plugin_load; a refusal comes back
 *                                     whole and is corrected in place
 *   5  run                            graph.evaluate on the forge when the task
 *                                     carries telemetry (the same evaluator,
 *                                     the same thresholds, the same diagnosis
 *                                     as the graph factory's), a document run
 *                                     (forge.document_build, forge.session_run)
 *                                     otherwise
 *   6  proposed, handed over          forge.plugin_promote, then task.done with
 *                                     the artifact the forge signed
 */
import type { Intention, JsonValue } from "@spiky-panda/harness";
import type { LocalCapability } from "../../core/capabilities.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicState } from "../../core/reasoning-state.js";
import type { TopicContext, TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { candidatesOf, evaluateCapability } from "../graph/index.js";

export const CODE_TOOLS: ReadonlyArray<RegExp> = [
    /^forge\.registry_(search|describe_node|list_nodes)$/,
    /^forge\.plugin_(template|write|build|test|load|promote)$/,
    /^forge\.document_(validate|build)$/,
    /^forge\.session_run$/,
    /^library\.(list|methods|search|read|facts)$/,
    /^physics\.units_(normalize|convert|compatible|validate_connection)$/,
    /^workspace\.(list|read)$/,
    /^graph\.evaluate$/,
    /^task\.(plan|done|fail)$/,
];

export const CODE_PROMPT = "harness/topics/code/prompt.md";

/** The prefix a generated type carries; the forge refuses the rest at its checks, the guard here before any compilation. */
export const GENERATED_PREFIX = "Generated.";

interface CodeTopicState {
    /** The one plugin of this task, named at the first write. */
    plugin: string | null;
}

interface WriteAnswer {
    ok?: boolean;
    plugin?: string;
    files?: string[];
    /** The plugin's files whole, as they stand after the write: the state carries them, the model corrects them there. */
    sources?: Array<{ path: string; content: string }>;
    sha256?: string;
    problems?: Array<{ where: string; what: string }>;
}
interface TemplateAnswer {
    plugin?: string;
    files?: Array<{ path: string; content: string }>;
    note?: string;
}
interface BuildAnswer {
    id?: string;
    ok?: boolean;
    sha256?: string;
    ms?: number;
    problems?: Array<{ where: string; what: string }>;
    diagnostics?: Array<{ file: string; line: number; column: number; code: string; message: string }>;
}
interface TestAnswer {
    build?: string;
    ok?: boolean;
    pass?: number;
    fail?: number;
    output?: string;
    types?: Array<{ type: string; ok: boolean; problems: string[] }>;
}
interface LoadAnswer {
    id?: string;
    sha256?: string;
    types?: string[];
}
interface RunAnswer {
    ticks?: number;
    summary?: Record<string, { first: number; last: number }>;
}
interface PromoteAnswer {
    id?: string;
    path?: string;
    sha256?: string;
    artifactSha256?: string;
    stationProposalId?: string | null;
    note?: string;
}

function stateOf(progress: Progress): CodeTopicState {
    const current = progress.topic.code as unknown as CodeTopicState | undefined;
    if (current) return current;
    const fresh: CodeTopicState = { plugin: null };
    progress.topic.code = fresh as unknown as JsonValue;
    return fresh;
}

const read = <T>(progress: Progress, capability: string): T | undefined => progress.reads[capability]?.value as T | undefined;

/** What the forge answered at each stage of this task, from the runner's reads (the last successful answer of each capability). */
function stagesOf(progress: Progress) {
    return {
        template: read<TemplateAnswer>(progress, "forge.plugin_template"),
        written: read<WriteAnswer>(progress, "forge.plugin_write"),
        build: read<BuildAnswer>(progress, "forge.plugin_build"),
        tests: read<TestAnswer>(progress, "forge.plugin_test"),
        loaded: read<LoadAnswer>(progress, "forge.plugin_load"),
        run: read<RunAnswer>(progress, "forge.session_run"),
        promoted: read<PromoteAnswer>(progress, "forge.plugin_promote"),
    };
}

/** The type names a plugin's entry registers, as written: `reg.register("Generated.Habitat:leak", ...)` or a constant `TYPE = "..."` passed to it. */
export function typesWritten(files: Array<{ path?: unknown; content?: unknown }>): string[] {
    const out = new Set<string>();
    for (const f of files) {
        if (typeof f?.content !== "string" || !/\.ts$/.test(String(f.path ?? "")) || /\.test\.ts$/.test(String(f.path))) continue;
        for (const m of f.content.matchAll(/\.register\s*\(\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))/g)) {
            const literal = m[1] ?? m[2];
            if (literal) out.add(literal);
            else if (m[3]) {
                const c = new RegExp(`(?:const|let|var)\\s+${m[3]}\\s*(?::\\s*string)?\\s*=\\s*(?:"([^"]+)"|'([^']+)')`).exec(f.content);
                if (c) out.add(c[1] ?? c[2]);
            }
        }
    }
    return [...out];
}

/** Has the node run in the forge: the same request judged by the evaluator (a candidate that held), or a document run that completed. */
function ranOf(progress: Progress): { ran: boolean; how: "evaluate" | "session" | null; held: boolean | null } {
    const candidate = candidatesOf(progress).at(-1);
    if (candidate) return { ran: true, how: "evaluate", held: candidate.pass };
    const { run } = stagesOf(progress);
    if (run && typeof run.ticks === "number" && run.ticks > 0) return { ran: true, how: "session", held: null };
    return { ran: false, how: null, held: null };
}

export function requirementsOf(progress: Progress, task: TaskFile["task"]): Record<string, boolean> {
    const s = stagesOf(progress);
    const ran = ranOf(progress);
    const telemetry = progress.context.telemetry !== null || (task.data ?? []).length > 0;
    return {
        catalogueSearched: progress.reads["forge.registry_search"] !== undefined,
        planAccepted: progress.plan !== null,
        templateRead: progress.reads["forge.plugin_template"] !== undefined,
        written: s.written?.ok === true,
        built: s.build?.ok === true && s.build.sha256 === s.written?.sha256,
        tested: s.tests?.ok === true && s.build?.ok === true && s.tests.build === s.build.id,
        loaded: Boolean(s.loaded?.sha256) && s.loaded?.sha256 === s.written?.sha256,
        // With telemetry the node is judged like any candidate (graph.evaluate on the forge) and must hold; without, a document run that completed is the evidence.
        ran: telemetry ? ran.how === "evaluate" && ran.held === true : ran.ran,
        promoted: Boolean(s.promoted?.artifactSha256) && s.promoted?.sha256 === s.written?.sha256,
    };
}

const HOW: Record<string, string> = {
    catalogueSearched: "search the forge's catalogue first (forge.registry_search, the required outputs' quantities): a node is written only for what nothing produces",
    templateRead: "read the forge's template (forge.plugin_template): a complete minimal plugin exactly as the substrate accepts it",
    written: "write the plugin (forge.plugin_write)",
    built: "compile it (forge.plugin_build); a build older than the files does not count",
    tested: "test it (forge.plugin_test) on the last build; the tests and the checks must pass",
    loaded: "load it (forge.plugin_load)",
    ran: "run it: graph.evaluate on the forge when the task carries telemetry (the candidate must hold), forge.document_build then forge.session_run otherwise",
    promoted: "propose it (forge.plugin_promote)",
};

/**
 * A document that runs the generated node must wire it: a node whose inputs
 * are all unwired shows nothing of its behaviour (the third passage on Haiku
 * ran the leak with its command unwired, at zero, and the harness took it
 * as a run). Deterministic: the spec's connections, the loaded types.
 */
export function documentProblems(spec: unknown, generatedTypes: string[]): string[] {
    const s = (spec && typeof spec === "object" ? spec : {}) as { nodes?: Array<{ id?: unknown; typeId?: unknown }>; connections?: Array<{ to?: unknown[] }> };
    const nodes = Array.isArray(s.nodes) ? s.nodes : [];
    const wiredInto = new Set((Array.isArray(s.connections) ? s.connections : []).map((c) => String((c?.to ?? [])[0] ?? "")));
    const generated = nodes.filter((n) => generatedTypes.includes(String(n?.typeId)));
    if (!generated.length) return [`the document holds no node of the plugin's types (${generatedTypes.join(", ") || "none loaded"}): the run must show the generated node`];
    return generated.filter((n) => !wiredInto.has(String(n?.id))).map((n) => `node "${String(n?.id)}" (${String(n?.typeId)}) has no input wired: a run with every input unwired shows nothing of the node (wire a Logic.Time:timeline's value into one of its inputs so that its output is seen over time)`);
}

async function guardCode(capabilityId: string, input: JsonValue, context: TopicContext): Promise<string[]> {
    const { progress, task } = context;
    const state = stateOf(progress);
    const requirements = requirementsOf(progress, task);
    const need = (keys: string[]) => keys.filter((k) => !requirements[k]).map((k) => `${capabilityId} needs ${k}: ${HOW[k]}`);
    if (capabilityId === "task.plan") {
        const problems = need(["catalogueSearched"]);
        const plan = (input ?? {}) as { selected_nodes?: unknown[]; missing_capabilities?: Array<{ topic?: string; required_output?: string }> };
        if (Array.isArray(plan.selected_nodes) && plan.selected_nodes.length) problems.push("this topic builds no graph: selected_nodes is empty, the node to write goes in missing_capabilities");
        for (const m of Array.isArray(plan.missing_capabilities) ? plan.missing_capabilities : []) if (m?.topic !== "code") problems.push(`missing capability "${String(m?.required_output)}": its topic is "${String(m?.topic)}", this task makes it: "code"`);
        return problems;
    }
    if (capabilityId === "forge.plugin_write") {
        const problems: string[] = [];
        const w = (input ?? {}) as { plugin?: unknown; files?: unknown };
        const plugin = String(w.plugin ?? "");
        if (state.plugin && plugin && plugin !== state.plugin) problems.push(`one plugin per task: this task's is "${state.plugin}" (write into it, with replace: true to start it over)`);
        if (!requirements.templateRead) problems.push("read the forge's template first (forge.plugin_template): a complete minimal plugin exactly as the substrate accepts it; the first passage guessed the registry's API and the compiler would have refused every file");
        const files = Array.isArray(w.files) ? (w.files as Array<{ path?: unknown; content?: unknown }>) : [];
        for (const type of typesWritten(files)) if (!type.startsWith(GENERATED_PREFIX)) problems.push(`the type "${type}" is not named under "${GENERATED_PREFIX}" (as in "${GENERATED_PREFIX}Habitat:leak"): every catalogue must say a node is generated; the forge refuses it at its checks, so name it now`);
        return problems;
    }
    if (capabilityId === "forge.document_build") {
        const loaded = stagesOf(progress).loaded?.types ?? [];
        return loaded.length ? documentProblems((input as { spec?: unknown } | null)?.spec, loaded) : ["forge.document_build needs loaded: load the plugin first (forge.plugin_load), the document runs its node"];
    }
    if (capabilityId === "forge.plugin_promote") return need(["loaded", "ran"]);
    if (capabilityId === "task.done") {
        const problems = need(["promoted"]);
        const claim = (input ?? {}) as Partial<DoneClaim>;
        if (!(claim.artifacts ?? []).some((a) => a.kind === "plugin")) problems.push(`the artifact handed over is the plugin the forge signed (kind "plugin", path ${stagesOf(progress).promoted?.path ?? "forge/<plugin>/artifact.json"})`);
        return problems;
    }
    return [];
}

const headOf = (text: string | undefined, n: number): string | null => (typeof text === "string" ? (text.length <= n ? text : `${text.slice(0, n)}... (${text.length} characters)`) : null);

export function stateOfTopic(progress: Progress, task: TaskFile["task"]): TopicState {
    const s = stagesOf(progress);
    const state = stateOf(progress);
    const requirements = requirementsOf(progress, task);
    const ran = ranOf(progress);
    const catalogue = read<{ matches?: Array<{ type: string; signature?: { purpose?: string } }> }>(progress, "forge.registry_search");
    const openQuestions: string[] = [];
    if (!catalogue) openQuestions.push("what the forge's catalogue already produces for the required outputs (forge.registry_search)");
    if (!s.written) openQuestions.push("the node: its ports (quantity, unit), its physics, its tests, its card (forge.plugin_write)");
    else if (!requirements.built) openQuestions.push(s.build && !s.build.ok ? "the compilation failed: the diagnostics are under evaluation, correct the files they name" : "the plugin is written and not compiled (forge.plugin_build)");
    else if (!requirements.tested) openQuestions.push(s.tests && !s.tests.ok ? "the tests or the checks refused: the reasons are under evaluation" : "the plugin is compiled and not tested (forge.plugin_test)");
    else if (!requirements.loaded) openQuestions.push("the plugin is tested and not loaded (forge.plugin_load)");
    else if (!requirements.ran) openQuestions.push(ran.how === "evaluate" ? "the candidate with the node did not hold: revise the node or the candidate" : HOW.ran);
    else if (!requirements.promoted) openQuestions.push("the node ran; propose it (forge.plugin_promote), then hand it over (task.done)");
    const candidate = candidatesOf(progress).at(-1);
    let evaluation: JsonValue | null = null;
    if (s.build && !s.build.ok) evaluation = { stage: "build", ok: false, problems: s.build.problems ?? [], diagnostics: s.build.diagnostics ?? [] } as JsonValue;
    else if (s.tests && !s.tests.ok && s.tests.build === s.build?.id) evaluation = { stage: "test", ok: false, pass: s.tests.pass ?? 0, fail: s.tests.fail ?? 0, checks: (s.tests.types ?? []).filter((t) => !t.ok), output: headOf(s.tests.output, 3000) } as JsonValue;
    else if (candidate) evaluation = { stage: "evaluate", candidate: candidate.n, pass: candidate.pass, diagnosis: candidate.diagnosis ?? null, residuals: candidate.residuals.map((r) => ({ column: r.column, rmse: r.rmse })) } as unknown as JsonValue;
    else if (s.run) evaluation = { stage: "run", ticks: s.run.ticks ?? 0, summary: s.run.summary ?? {} } as JsonValue;
    else if (s.tests) evaluation = { stage: "test", ok: s.tests.ok === true, pass: s.tests.pass ?? 0, fail: s.tests.fail ?? 0 } as JsonValue;
    const lastRefusal = Object.entries(progress.refusals).filter(([k]) => k.startsWith("forge.") || k === "task.done" || k === "task.plan").sort((a, b) => a[1].at.localeCompare(b[1].at)).at(-1);
    return {
        hypothesis: {
            gap: task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`),
            missing: progress.plan?.missing_capabilities.map((m) => ({ output: m.required_output, reason: m.reason })) ?? null,
            catalogue: catalogue ? (catalogue.matches ?? []).slice(0, 12).map((m) => `${m.type}: ${m.signature?.purpose ?? ""}`.slice(0, 160)) : null,
            // The template whole until the plugin compiles (the shape to write on), the plugin's sources whole from the first write (what is corrected): the state carries what the model needs whole.
            template: s.template && !requirements.built ? (s.template.files ?? []) : null,
            plugin: state.plugin ? { name: state.plugin, files: s.written?.files ?? [], sources: s.written?.sources ?? [], sha256: s.written?.sha256 ?? null, build: s.build ? { id: s.build.id ?? null, ok: s.build.ok === true, current: s.build.sha256 === s.written?.sha256 } : null, tests: s.tests ? { ok: s.tests.ok === true, pass: s.tests.pass ?? 0, fail: s.tests.fail ?? 0, types: (s.tests.types ?? []).map((t) => `${t.type}: ${t.ok ? "ok" : t.problems.join("; ")}`) } : null, loaded: s.loaded?.types ?? null, ran: ran.ran ? ran.how : null, proposal: s.promoted ? { id: s.promoted.id ?? null, path: s.promoted.path ?? null, artifactSha256: s.promoted.artifactSha256 ?? null, station: s.promoted.stationProposalId ?? null } : null } : null,
        } as JsonValue,
        evaluation: lastRefusal && (!evaluation || lastRefusal[1].at > (progress.reads[Object.keys(progress.reads).at(-1) ?? ""]?.at ?? "")) ? ({ refused: lastRefusal[0], reason: lastRefusal[1].reason, ...(evaluation && typeof evaluation === "object" ? { last: evaluation } : {}) } as JsonValue) : evaluation,
        openQuestions,
        requirements,
    };
}

export function validateCode(claim: DoneClaim, files: WorkshopFile[], progress: Progress): Validation {
    const problems: string[] = [];
    const claimed = claim.artifacts.filter((a) => a.kind === "plugin");
    const { promoted } = stagesOf(progress);
    if (!claimed.length) problems.push("no plugin among the claimed artifacts");
    if (!promoted?.artifactSha256) problems.push("no plugin was proposed by the forge in this task (forge.plugin_promote)");
    for (const c of claimed) {
        const file = files.find((f) => f.path === c.path);
        if (!file) problems.push(`claimed plugin "${c.path}" is not a file of the workshop`);
        else if (promoted && (file.path !== promoted.path || file.sha256 !== promoted.artifactSha256)) problems.push(`claimed plugin "${c.path}" is not the artifact the forge signed (${promoted.path}, sha256 ${String(promoted.artifactSha256).slice(0, 12)})`);
    }
    return { ok: problems.length === 0, problems };
}

function intentionOf(task: TaskFile["task"], generic: Intention): Intention {
    const outputs = task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join("; ");
    return { ...generic, description: `Write, through the forge, the node no type of the catalogue produces for ${outputs}: a generated plugin, compiled, tested, checked, loaded and run in the forge, then proposed to the station as a signed artifact. Nothing here touches the twin's catalogue.` };
}

/** The harness's brief, stage by stage; the rules of the forge are in the tools' descriptions and its refusals, never restated as advice. */
export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    const s = stagesOf(progress);
    const r = requirementsOf(progress, task);
    const ran = ranOf(progress);
    const outputs = task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join(", ");
    const telemetry = progress.context.telemetry !== null || (task.data ?? []).length > 0;
    const refused = (cap: string) => (progress.refusals[cap] ? ` Your last ${cap} was refused: ${progress.refusals[cap].reason}. What you sent is in the state (lastRefusal); change what the reasons name.` : "");
    if (r.promoted) return `Stage 6 of 6, hand over. The forge signed ${s.promoted?.path ?? "the artifact"} (proposal ${s.promoted?.id ?? "?"}${s.promoted?.stationProposalId ? `, the station's ${s.promoted.stationProposalId}` : ""}). End with task.done, the artifact of kind "plugin" at that path.${refused("task.done")}`;
    if (!r.catalogueSearched) return `Stage 1 of 6, the gap. Required and produced by no node: ${outputs}. Search the forge's catalogue for these quantities first (forge.registry_search with requiredOutputs, then registry_describe_node on the closest types: their ports say how this catalogue names quantities and units). The library holds the physics (library.search, library.read).`;
    const names = task.objective.required_outputs.map((o) => `required_output "${o.name}" (quantity "${o.quantity}"${o.unit ? `, unit "${o.unit}"` : ""})`).join("; ");
    if (!r.planAccepted) return `Stage 2 of 6, the plan. Declare with task.plan: selected_nodes empty, and in missing_capabilities one entry per required output, ${names}, with its reason and the topic "code"; required_output is the name exactly, nothing added to it.${refused("task.plan")}`;
    if (!r.templateRead) return `Stage 3 of 6, the plugin. Read the forge's template first (forge.plugin_template): a complete minimal plugin exactly as the substrate accepts it, its entry, its node class, its test, its card. You will write yours on its shape.`;
    if (!r.written) return `Stage 3 of 6, the plugin. Write it with forge.plugin_write, on the template's shape (the template's files are in the state under hypothesis, field "template", whole; nothing to read again): src/index.ts exporting register(registry, doc) that calls reg.register(type, factory, meta) for each type named under "${GENERATED_PREFIX}", the meta with label, category, docPath (doc("<card>.md")), inputPorts and outputPorts read off one instance, and a signature (purpose, inputs and outputs with quantity and unit as the catalogue names them, each one a declared port, at least one capability); src/<name>.node.ts, a class on RuntimeNode (IntegrableRuntimeNode for a state integrated over time) with its ports on the instance, @editable parameters, @viewable values, fire() reading the session's signals and publishing; src/<name>.test.ts on node:test; docs/<name>.md. Imports: "@spiky-panda/core" and the plugin's own files with the .js extension, nothing else.${refused("forge.plugin_write")}`;
    if (!r.built) return `Stage 4 of 6, compiled. ${s.build && !s.build.ok ? `The build failed: the diagnostics are in the state under evaluation (file, line, code, message). Your files are in the state under hypothesis, field "plugin.sources" (path and content, whole; they are not files of the workshop root, nothing to read): correct them there, against the template (field "template": its imports, its ports as IPortDescriptor objects, its decorators with their argument, its override modifiers), and send with forge.plugin_write only the files that change (plugin "${stateOf(progress).plugin}"; the others stay); then forge.plugin_build again.` : `The plugin is written (${(s.written?.files ?? []).join(", ")}). Compile it: forge.plugin_build.`}${refused("forge.plugin_build")}`;
    if (!r.tested) return `Stage 4 of 6, tested. ${s.tests && !s.tests.ok && s.tests.build === s.build?.id ? `The tests or the checks refused: the reasons are in the state under evaluation (the failing checks name the type, the port, the rule; the tests' output is there). Your files are in the state under hypothesis, field "plugin.sources": correct them there, send with forge.plugin_write only the files that change (plugin "${stateOf(progress).plugin}"), compile again, test again.` : "Compiled. Test it: forge.plugin_test (the plugin's tests, then the forge's checks)."}${refused("forge.plugin_test")}`;
    if (!r.loaded) return `Stage 4 of 6, loaded. Tests and checks passed (${s.tests?.pass ?? 0} test(s), types ${(s.tests?.types ?? []).map((t) => t.type).join(", ")}). Load it: forge.plugin_load.${refused("forge.plugin_load")}`;
    if (!r.ran) {
        if (telemetry) return `Stage 5 of 6, judged. The plugin is loaded in the forge (${(s.loaded?.types ?? []).join(", ")}). Build the candidate that answers the request with it and judge it against the telemetry: graph.evaluate (it runs on the forge's catalogue; the same thresholds and diagnosis as the graph factory's).${ran.how === "evaluate" && ran.held === false ? " The last candidate did not hold: its residuals are under evaluation; revise the node (write, build, test, load again) or the candidate." : ""}${refused("graph.evaluate")}`;
        return `Stage 5 of 6, run. The plugin is loaded in the forge (${(s.loaded?.types ?? []).join(", ")}). The task carries no telemetry: run the node in a document (forge.document_build with a spec that wires at least one of its inputs, a Logic.Time:timeline's value into it with segments that change; a name under "${task.id}/"; then forge.session_run on that name with a probe on one of its viewables) so that its outputs are seen over time; a document that leaves every input of the node unwired is refused.${refused("forge.session_run")}${refused("forge.document_build")}`;
    }
    return `Stage 6 of 6, proposed. The node ran (${ran.how}). Propose the plugin to the station: forge.plugin_promote${candidatesOf(progress).at(-1) ? " with the evaluate report's id and verdict" : ""}.${refused("forge.plugin_promote")}`;
}

function claimsOf(progress: Progress): Record<string, JsonValue> {
    const s = stagesOf(progress);
    const ran = ranOf(progress);
    const candidate = candidatesOf(progress).at(-1);
    return {
        plugin: (stateOf(progress).plugin ?? null) as JsonValue,
        sha256: (s.written?.sha256 ?? null) as JsonValue,
        types: (s.loaded?.types ?? []) as JsonValue,
        tests: (s.tests ? { pass: s.tests.pass ?? 0, fail: s.tests.fail ?? 0, checks: (s.tests.types ?? []).every((t) => t.ok) } : null) as JsonValue,
        ran: (ran.ran ? { how: ran.how, ...(candidate ? { candidate: candidate.n, held: candidate.pass, rmse: Math.max(...candidate.residuals.map((r) => r.rmse)) } : {}) } : null) as JsonValue,
        proposal: (s.promoted ? { id: s.promoted.id ?? null, artifactSha256: s.promoted.artifactSha256 ?? null, station: s.promoted.stationProposalId ?? null } : null) as JsonValue,
    };
}

/** The plugin named at the first accepted write, kept for the guard; the forge's answers say the rest. */
function noteWrite(context: TopicContext): LocalCapability[] {
    // No capability of its own: the forge's tools are the topic's. The plugin's name is noted from the runner's reads at each state build (stateOfTopic), which is enough for the guard: it reads the state after the write completed.
    const state = stateOf(context.progress);
    const w = read<WriteAnswer>(context.progress, "forge.plugin_write");
    if (!state.plugin && w?.plugin) state.plugin = w.plugin;
    return [evaluateCapability(context, "forge")];
}

export const CODE_TOPIC: TopicDefinition = {
    name: "code",
    tools: CODE_TOOLS,
    validate: (claim, files, progress) => validateCode(claim, files, progress),
    local: noteWrite,
    guard: (capabilityId, input, context) => {
        // The plugin's name, noted before the guard judges (the runner builds the local capabilities once; the reads move after).
        const state = stateOf(context.progress);
        const w = read<WriteAnswer>(context.progress, "forge.plugin_write");
        if (!state.plugin && w?.plugin) state.plugin = w.plugin;
        return guardCode(capabilityId, input, context);
    },
    state: (progress, task) => {
        const state = stateOf(progress);
        const w = read<WriteAnswer>(progress, "forge.plugin_write");
        if (!state.plugin && w?.plugin) state.plugin = w.plugin;
        return stateOfTopic(progress, task);
    },
    key: (progress) => {
        const r = requirementsOf(progress, { objective: { required_outputs: [], constraints: {} }, data: [] } as unknown as TaskFile["task"]);
        return ["templateRead", "written", "built", "tested", "loaded", "ran", "promoted"].filter((k) => r[k]).join(",");
    },
    intention: intentionOf,
    prompt: CODE_PROMPT,
    brief: briefOf,
    claims: claimsOf,
};
