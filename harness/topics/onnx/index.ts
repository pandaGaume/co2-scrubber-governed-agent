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

export const ONNX_TOOLS: ReadonlyArray<RegExp> = withBase([/^workspace\.(list|read|write)$/, /^twin\.registry_(search|describe_node|list_nodes)$/, /^model\.(fit|inspect|contract)$/]);

export const ONNX_PROMPT = "harness/topics/onnx/prompt.md";

/** The reviewed fit spec the state shows as the shape of one (`specs/scrubber-health-twin.json`). */
const REFERENCE_SPEC = "specs/scrubber-health-twin.json";

export function validateOnnx(claim: DoneClaim, files: WorkshopFile[], progress: Progress): Validation {
    const problems: string[] = [];
    const models = claim.artifacts.filter((a) => a.kind === "model");
    if (!models.length) problems.push("no model among the claimed artifacts");
    for (const m of models) {
        const file = files.find((f) => f.path === m.path);
        if (!file) {
            problems.push(`claimed model "${m.path}" is not a file of the workshop`);
            continue;
        }
        if (!m.path.endsWith(".onnx")) problems.push(`claimed model "${m.path}" is not an .onnx file`);
        const dir = m.path.includes("/") ? m.path.slice(0, m.path.lastIndexOf("/") + 1) : "";
        if (!files.some((f) => f.path.startsWith(dir) && f.path.endsWith("contract.json"))) problems.push(`no contract.json next to "${m.path}"`);
        if (!progress.checkedModels.includes(file.sha256)) problems.push(`no successful model.contract check on "${m.path}" (sha256 ${file.sha256.slice(0, 12)}) in this task`);
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
    if (!r.catalogueSearched) openQuestions.push("which node types of the catalogue already produce the required outputs (twin.registry_search)");
    else if (!r.planAccepted) openQuestions.push("the plan: the types found, and the outputs no type produces declared missing, to fit (task.plan)");
    else if (!r.fitted) openQuestions.push("the fit on the task's telemetry (model.fit)");
    else if (!r.inspected) openQuestions.push("the model's inputs and outputs, as the board loads it (model.inspect)");
    else if (!r.checked) openQuestions.push("the model against its contract, with the board's rules (model.contract)");
    else openQuestions.push("hand the model over (task.done)");
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
    if (!r.catalogueSearched) return `Stage 1 of 5, the gap. Required: ${outputs}. Ask the catalogue which node types produce them (twin.registry_search with requiredOutputs); what no type produces is fitted from the task's telemetry.`;
    if (!r.planAccepted) return `Stage 2 of 5, the plan. Declare with task.plan the types found for the outputs they produce (selected_nodes), and in missing_capabilities each required output no type produces, with its reason and the topic "onnx".${refused("task.plan")}`;
    if (!r.fitted) return `Stage 3 of 5, the fit. The task's telemetry is ${file ?? "(none given)"}, columns ${columns.join(", ") || "(none given)"}. Fit the model with model.fit: a spec of the shape the state shows under hypothesis, field "spec" (a reviewed one: its numbers are that device's), its dataset on this task's file and columns, its full scale, its domain and its monitor set for this device from what you read (the library, the telemetry), never copied; every number of the spec justified (justifications, with its source).${refused("model.fit")}`;
    if (!r.inspected) return `Stage 4 of 5, the model. Fitted: ${fit?.onnx?.path} (rmse ${fit?.quality?.rmse ?? "?"}, parity ${fit?.parity?.ok ? "ok" : "not ok"}). Load it as the board does: model.inspect on that path.${refused("model.inspect")}`;
    if (!r.checked) return `Stage 4 of 5, the contract. Check the model with the board's rules: model.contract on ${fit?.onnx?.path}, the contract with its sha256 (${fit?.onnx?.sha256}) and the output count model.inspect read.${refused("model.contract")}`;
    return `Stage 5 of 5, hand over. The model ${fit?.onnx?.path} holds its contract. End with task.done: the artifact of kind "model" at that path, and the numbers of the fit in the summary.${refused("task.done")}`;
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
    // The board asks for a fit without a key: the script, unless the request names the model.
    defaultBuilder: "scripted",
    // No graph is built here: the shelf's reference graphs are not read for nothing.
    shelf: false,
};
