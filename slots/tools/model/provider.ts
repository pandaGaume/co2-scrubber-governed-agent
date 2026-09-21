/**
 * The `model` slot: the learned side of the workshop. `fit` runs the fit job
 * of `@spiky-panda/factory` (the scrubber health family, `affine-residual`:
 * expected current = intercept + slope * duty, residual = the distance to
 * it) on a telemetry file of the task, and writes the ONNX file, its
 * contract and the fit report under the task's directory; `inspect` reads
 * an ONNX file the way the board does (sha256, input and output names);
 * `contract` checks an ONNX file against a contract with exactly the rules
 * of `loadModelValidated` on the board (`sha256`, `expectInputShape`,
 * `expectOutputCount`, `expectOutputShape`). Nothing here judges: the twin
 * judges, on the station's request. `docs/factory-harness.fr.md`, 3.5.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { OnnxModelGraph, type OnnxModelLoadOptions } from "@spiky-panda/plugin-onnx";
import { fromRoot, relativeToRoot } from "../../../lib/paths.js";
import { loadFactory } from "../../../lib/factory.js";
import { objectSchema, publishSlot, type PublishedSlot, type SlotTool } from "../../lib/slot-server.js";
import { checkTaskId, safeRelative, sha256Of, taskDir, taskFile } from "../lib/workshop.js";

export interface ModelState {
    fits: Array<{ taskId: string; name: string; sha256: string; rmse: number; worstCaseError: number; wallMs: number; at: string }>;
}

const TASK = { type: "string" };

/** The ONNX bytes of a file of the task, refused with the reason when it is not there. */
function onnxBytes(taskId: string, p: unknown): { file: string; rel: string; bytes: Buffer } {
    const rel = safeRelative(p);
    const file = taskFile(taskId, rel);
    if (!rel || !existsSync(file)) throw new Error(`no file "${rel}" in task ${taskId}`);
    return { file, rel, bytes: readFileSync(file) };
}

export function modelSlot(wsBase: string, log: (line: string) => void): PublishedSlot<ModelState> {
    const state: ModelState = { fits: [] };
    const factory = loadFactory();

    const tools: SlotTool<ModelState>[] = [
        {
            name: "fit",
            inputSchema: objectSchema({ taskId: TASK, spec: { type: "object" } }, ["taskId", "spec"]),
            handle: (args, s) => {
                const taskId = checkTaskId(args.taskId);
                const raw = args.spec;
                if (!raw || typeof raw !== "object") throw new Error("spec is required (an object)");
                const spec = factory.parseSpec(raw);
                if (spec.job !== "fit") throw new Error(`spec.job is "${spec.job}"; this tool runs fit specs`);
                const dir = taskDir(taskId);
                const datasetRel = safeRelative(spec.dataset.file);
                const datasetFile = taskFile(taskId, datasetRel);
                if (!existsSync(datasetFile)) throw new Error(`no dataset "${datasetRel}" in task ${taskId}`);
                const outDir = path.join(dir, "models", spec.name);
                mkdirSync(outDir, { recursive: true });
                const fitSpec = { ...spec, dataset: { ...spec.dataset, file: datasetFile } };
                const report = factory.runFit(fitSpec, { specDir: dir, outDir, log: (line: string) => log(`[model] ${line}`), factoryVersion: "demo" });
                s.fits.push({ taskId, name: spec.name, sha256: report.sha256, rmse: report.quality.rmse, worstCaseError: report.quality.worstCaseError, wallMs: report.wallMs, at: new Date().toISOString() });
                const under = (f: string) => path.relative(dir, path.join(outDir, f)).split(path.sep).join("/");
                const contractFile = path.join(outDir, "contract.json");
                return {
                    name: spec.name,
                    family: spec.model,
                    onnx: { path: under(spec.outputs.file), sha256: report.sha256 },
                    contract: existsSync(contractFile) ? { path: under("contract.json"), sha256: sha256Of(readFileSync(contractFile)) } : null,
                    files: report.files.map(under),
                    coefficients: report.coefficients,
                    quality: report.quality,
                    parity: report.parity,
                    wallMs: report.wallMs,
                    dataset: { path: datasetRel, sha256: sha256Of(readFileSync(datasetFile)) },
                };
            },
        },
        {
            name: "inspect",
            inputSchema: objectSchema({ taskId: TASK, path: { type: "string" } }, ["taskId", "path"]),
            handle: (args) => {
                const taskId = checkTaskId(args.taskId);
                const { rel, bytes } = onnxBytes(taskId, args.path);
                const report = new OnnxModelGraph().loadModelValidated(bytes, {});
                return { path: rel, bytes: bytes.length, sha256: report.sha256, ok: report.ok, error: report.error ?? null, inputs: report.inputNames, outputs: report.outputNames };
            },
        },
        {
            name: "contract",
            inputSchema: objectSchema(
                {
                    taskId: TASK,
                    path: { type: "string" },
                    contract: { type: "object", properties: { sha256: { type: "string" }, expectInputShape: { type: "array", items: { type: "number" } }, expectOutputCount: { type: "number" }, expectOutputShape: { type: "array", items: { type: "number" } } } },
                    contractPath: { type: "string" },
                },
                ["taskId", "path"],
            ),
            handle: (args) => {
                const taskId = checkTaskId(args.taskId);
                const { rel, bytes } = onnxBytes(taskId, args.path);
                let contract: Record<string, unknown> = {};
                let contractSha256: string | null = null;
                if (typeof args.contractPath === "string") {
                    const cf = taskFile(taskId, args.contractPath);
                    if (!existsSync(cf)) throw new Error(`no contract "${String(args.contractPath)}" in task ${taskId}`);
                    const text = readFileSync(cf, "utf8");
                    contract = JSON.parse(text) as Record<string, unknown>;
                    contractSha256 = sha256Of(text);
                } else if (args.contract && typeof args.contract === "object") contract = args.contract as Record<string, unknown>;
                else throw new Error("give contract (an object) or contractPath");
                const opts: OnnxModelLoadOptions = {};
                if (typeof contract.sha256 === "string") opts.sha256 = contract.sha256;
                if (Array.isArray(contract.expectInputShape)) opts.expectInputShape = (contract.expectInputShape as unknown[]).map(Number);
                if (typeof contract.expectOutputCount === "number") opts.expectOutputCount = contract.expectOutputCount;
                if (Array.isArray(contract.expectOutputShape)) opts.expectOutputShape = (contract.expectOutputShape as unknown[]).map(Number);
                const report = new OnnxModelGraph().loadModelValidated(bytes, opts);
                return { path: rel, ok: report.ok, error: report.error ?? null, sha256: report.sha256, checked: opts, contractSha256, inputs: report.inputNames, outputs: report.outputNames };
            },
        },
    ];

    return publishSlot<ModelState>({
        slot: "model",
        tools,
        resources: [{ uri: "model://fits", read: (s) => s.fits }],
        state,
        wsBase,
        log: (line) => log(line.replace(/^\[model\] \[model\]/, "[model]")),
        stub: false,
        version: "0.1.0",
        grammarsDir: fromRoot("slots", "tools", "model", "grammars"),
    });
}

/** For the tests and the trace: where a task's models are, relative to the repository. */
export const modelsDirOf = (taskId: string): string => relativeToRoot(path.join(taskDir(taskId), "models"));
