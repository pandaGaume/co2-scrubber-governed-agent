/**
 * The `onnx` topic: fit a model on the task's data and hand it over with
 * its contract (docs/factory-harness.fr.md, section 3.5). Its tools are the
 * socle's (`base.ts`), the workshop, the catalogue (to plan) and the model
 * slot. Its validator says the contract is held when the claimed model is
 * a file of the workshop, a contract sits next to it, and a
 * `model.contract` check passed on that very file (same sha256) during this
 * task.
 *
 * Since 2026-09-28 it stands on the socle like the other factories: a model
 * may build on it (its prompt, its brief stage by stage, its reasoning
 * state), while the board's requests keep the script by default (the fit is
 * deterministic, and the board asks for it without a key).
 */
import type { JsonValue } from "@spiky-panda/harness";
import { readFileSync } from "node:fs";
import { fromRoot } from "../../../lib/paths.js";
import { withBase } from "../../core/base.js";
import { refusedNote } from "../../core/brief.js";
import { numbersOf, type Justified } from "../../core/justify.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicDefinition, Validation } from "../../core/topic.js";
import type { TopicState } from "../../core/reasoning-state.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { loadWords, say } from "../../core/words.js";

/** What the ONNX factory knows of the application and says to its model: its spec (`specs/onnx/format.json`) and its words (2026-09-28, zero domain in the harness). */
interface OnnxFormat {
    words: string;
    prompt: string;
    /** The reviewed fit spec the state shows as the shape of one: its numbers are that device's, not a task's. */
    referenceSpec: string;
}
export const ONNX_FORMAT_FILE = "specs/onnx/format.json";
export const ONNX_FORMAT: OnnxFormat = JSON.parse(readFileSync(fromRoot(...ONNX_FORMAT_FILE.split("/")), "utf8")) as OnnxFormat;
export const ONNX_WORDS = loadWords(ONNX_FORMAT.words);
const ow = (key: string, vars?: Record<string, string | number>): string => say(ONNX_WORDS, key, vars);

/** The words the topic asks for: the conformance test checks the file holds them all. */
export const ONNX_WORD_KEYS = [
    "validate.none", "validate.notAFile", "validate.notOnnx", "validate.noContract", "validate.notChecked",
    "openQuestions.catalogue", "openQuestions.plan", "openQuestions.fit", "openQuestions.inspect", "openQuestions.contract", "openQuestions.handOver",
    "brief.gap", "brief.plan", "brief.fit", "brief.noneGiven", "brief.model", "brief.parityOk", "brief.parityNotOk", "brief.unknown", "brief.contract", "brief.handOver",
];

export const ONNX_TOOLS: ReadonlyArray<RegExp> = withBase([/^workspace\.(list|read|write)$/, /^twin\.registry_(search|describe_node|list_nodes)$/, /^model\.(fit|inspect|contract)$/]);

export const ONNX_PROMPT = ONNX_FORMAT.prompt;

/** The reviewed fit spec the state shows as the shape of one, the format's. */
const REFERENCE_SPEC = ONNX_FORMAT.referenceSpec;

export function validateOnnx(claim: DoneClaim, files: WorkshopFile[], progress: Progress): Validation {
    const problems: string[] = [];
    const models = claim.artifacts.filter((a) => a.kind === "model");
    if (!models.length) problems.push(ow("validate.none"));
    for (const m of models) {
        const file = files.find((f) => f.path === m.path);
        if (!file) {
            problems.push(ow("validate.notAFile", { path: m.path }));
            continue;
        }
        if (!m.path.endsWith(".onnx")) problems.push(ow("validate.notOnnx", { path: m.path }));
        const dir = m.path.includes("/") ? m.path.slice(0, m.path.lastIndexOf("/") + 1) : "";
        if (!files.some((f) => f.path.startsWith(dir) && f.path.endsWith("contract.json"))) problems.push(ow("validate.noContract", { path: m.path }));
        if (!progress.checkedModels.includes(file.sha256)) problems.push(ow("validate.notChecked", { path: m.path, sha: file.sha256.slice(0, 12) }));
    }
    return { ok: problems.length === 0, problems };
}

interface Fit {
    onnx?: { path?: string; sha256?: string };
    contract?: { path?: string; sha256?: string } | null;
    quality?: { rows?: number; kept?: number; rmse?: number; worstCaseError?: number };
    parity?: { ok?: boolean };
    coefficients?: Record<string, number>;
}

const readOf = <T>(progress: Progress, id: string): T | null => (progress.reads[id]?.value ?? null) as T | null;
const fitOf = (progress: Progress): Fit | null => readOf<Fit>(progress, "model.fit");
const inspectOf = (progress: Progress): { sha256?: string; inputs?: string[]; outputs?: string[] } | null => readOf(progress, "model.inspect");

/** The evidence the stages need: the catalogue searched, the plan, the fit, its inspection, the contract checked on that very file. */
export function requirementsOf(progress: Progress): Record<string, boolean> {
    const fit = fitOf(progress);
    const sha = fit?.onnx?.sha256 ?? null;
    return {
        catalogueSearched: progress.reads["twin.registry_search"] !== undefined,
        planAccepted: progress.plan !== null,
        fitted: Boolean(fit?.onnx?.path),
        inspected: Boolean(sha) && inspectOf(progress)?.sha256 === sha,
        checked: Boolean(sha) && progress.checkedModels.includes(sha!),
    };
}

/** The columns of the task's telemetry, as the request gives them. */
const columnsOf = (task: TaskFile["task"]): { file: string | null; columns: string[] } => ({ file: task.data?.[0]?.file ?? null, columns: task.data?.[0]?.columns ?? [] });

let reference: JsonValue | null | undefined;
const referenceSpec = (): JsonValue | null => {
    if (reference === undefined) {
        try {
            reference = JSON.parse(readFileSync(fromRoot(REFERENCE_SPEC), "utf8")) as JsonValue;
        } catch {
            reference = null;
        }
    }
    return reference;
};

export function stateOfTopic(progress: Progress, task: TaskFile["task"]): TopicState {
    const r = requirementsOf(progress);
    const fit = fitOf(progress);
    const inspect = inspectOf(progress);
    const catalogue = readOf<{ matches?: Array<{ type: string; produces?: Array<{ quantity: string; unit?: string }> }> }>(progress, "twin.registry_search");
    const openQuestions: string[] = [];
    if (!r.catalogueSearched) openQuestions.push(ow("openQuestions.catalogue"));
    else if (!r.planAccepted) openQuestions.push(ow("openQuestions.plan"));
    else if (!r.fitted) openQuestions.push(ow("openQuestions.fit"));
    else if (!r.inspected) openQuestions.push(ow("openQuestions.inspect"));
    else if (!r.checked) openQuestions.push(ow("openQuestions.contract"));
    else openQuestions.push(ow("openQuestions.handOver"));
    return {
        hypothesis: {
            gap: task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`),
            telemetry: columnsOf(task) as unknown as JsonValue,
            catalogue: catalogue ? (catalogue.matches ?? []).slice(0, 12).map((m) => `${m.type}: ${(m.produces ?? []).map((p) => `${p.quantity}${p.unit ? ` ${p.unit}` : ""}`).join(", ")}`) : null,
            missing: progress.plan?.missing_capabilities.map((m) => ({ output: m.required_output, reason: m.reason })) ?? null,
            // The shape of a fit spec, as a reviewed one is written: its numbers are that device's, not this task's.
            spec: r.fitted ? null : referenceSpec(),
        },
        evaluation: fit
            ? ({
                  model: fit.onnx?.path ?? null,
                  sha256: fit.onnx?.sha256 ?? null,
                  quality: (fit.quality ?? null) as JsonValue,
                  parity: fit.parity?.ok ?? null,
                  coefficients: (fit.coefficients ?? null) as JsonValue,
                  inspected: inspect ? { inputs: inspect.inputs ?? [], outputs: inspect.outputs ?? [] } : null,
                  checked: r.checked,
              } as JsonValue)
            : null,
        openQuestions,
        requirements: r,
    };
}

export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    const r = requirementsOf(progress);
    const fit = fitOf(progress);
    const outputs = task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`).join(", ");
    const { file, columns } = columnsOf(task);
    const refused = (cap: string) => refusedNote(progress, cap);
    const none = ow("brief.noneGiven");
    if (!r.catalogueSearched) return ow("brief.gap", { outputs });
    if (!r.planAccepted) return ow("brief.plan", { refused: refused("task.plan") });
    if (!r.fitted) return ow("brief.fit", { file: file ?? none, columns: columns.join(", ") || none, refused: refused("model.fit") });
    if (!r.inspected) return ow("brief.model", { path: String(fit?.onnx?.path), rmse: fit?.quality?.rmse ?? ow("brief.unknown"), parity: fit?.parity?.ok ? ow("brief.parityOk") : ow("brief.parityNotOk"), refused: refused("model.inspect") });
    if (!r.checked) return ow("brief.contract", { path: String(fit?.onnx?.path), sha: String(fit?.onnx?.sha256), refused: refused("model.contract") });
    return ow("brief.handOver", { path: String(fit?.onnx?.path), refused: refused("task.done") });
}

/** Where a fit's constants are: every number of its spec but its version (the full scale, the domain, the monitor, a column's scale). */
export const FIT_JUSTIFIED: Justified = {
    capability: /^model\.fit$/,
    constants: (input) => numbersOf((input as { spec?: unknown } | null)?.spec, "").filter((c) => c.constant !== "version"),
    measured: (task) => (task.data ?? []).length > 0,
};

export const ONNX_TOPIC: TopicDefinition = {
    name: "onnx",
    tools: ONNX_TOOLS,
    validate: validateOnnx,
    // The fit is deterministic on the task's telemetry: its plan, its files, the fit, the check and the claim are a recipe.
    replayedActions: [/^workspace\.write$/, /^model\.(fit|contract)$/, /^task\.(plan|done)$/],
    justified: FIT_JUSTIFIED,
    state: stateOfTopic,
    brief: briefOf,
    prompt: ONNX_PROMPT,
    words: { words: ONNX_WORDS, keys: ONNX_WORD_KEYS },
    // The board asks for a fit without a key: the script, unless the request names the model.
    defaultBuilder: "scripted",
    // No graph is built here: the shelf's reference graphs are not read for nothing.
    shelf: false,
};
