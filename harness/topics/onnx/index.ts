/**
 * The `onnx` topic: fit a model on the task's data and hand it over with
 * its contract (docs/factory-harness.fr.md, section 3.5). Its tools are the
 * workshop, the catalogue (to plan), the model slot, and the two task
 * capabilities. Its validator says the contract is held when the claimed
 * model is a file of the workshop, a contract sits next to it, and a
 * `model.contract` check passed on that very file (same sha256) during this
 * task. The prompt of the topic is F5.
 */
import type { TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";

export const ONNX_TOOLS: ReadonlyArray<RegExp> = [/^workspace\.(list|read|write)$/, /^twin\.registry_(search|describe_node|list_nodes)$/, /^model\.(fit|inspect|contract)$/, /^task\.(plan|done|fail|ask)$/];

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

export const ONNX_TOPIC: TopicDefinition = { name: "onnx", tools: ONNX_TOOLS, validate: validateOnnx };
