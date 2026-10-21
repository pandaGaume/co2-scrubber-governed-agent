/** Independent replay validation and durable, content-addressed station twin installations. */
import { mkdirSync, readFileSync, realpathSync, renameSync, existsSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { forkDir, fromRoot } from "../../lib/paths.js";
import type { Broker } from "../../harness/lib/broker.js";
import { thresholdsOf, type TaskFile } from "../../harness/core/task.js";
import { coverageOf, residualsOf, type Candidate, type Compare, type Residual } from "../../harness/topics/graph/evaluate.js";
import type { Row } from "../../harness/topics/graph/params.js";
import { checkTaskId, safeRelative, sha256Of, taskDir, WORKSHOP_ROOT } from "../tools/lib/workshop.js";
import type { DeviceDescriptor } from "../station/registry.js";

/** Stable fingerprints also detect a dataset copied with different JSON whitespace or key ordering. */
export function fingerprint(value: unknown): string {
    const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
    return sha256Of(JSON.stringify(canonical(value)));
}

export function workshopBytes(taskId: string, relative: string): Buffer {
    const base = realpathSync(taskDir(checkTaskId(taskId)));
    const taskRelative = path.relative(realpathSync(WORKSHOP_ROOT), base);
    if (!taskRelative || taskRelative.startsWith("..") || path.isAbsolute(taskRelative) || taskRelative.includes(path.sep)) throw new Error("the task directory resolves outside the workshop");
    const rel = safeRelative(relative);
    if (!rel) throw new Error("an artifact or data file path is required");
    const target = realpathSync(path.join(base, rel));
    const inside = path.relative(base, target);
    if (inside.startsWith("..") || path.isAbsolute(inside)) throw new Error("a workshop file resolves outside its task");
    const bytes = readFileSync(target);
    if (bytes.length > 8 * 1024 * 1024) throw new Error("a deployment input exceeds 8 MiB");
    return bytes;
}

export interface TwinEvaluation {
    reportId: string;
    verdict: "pass" | "fail";
    taskId: string;
    artifactPath: string;
    artifactSha256: string;
    manifestSha256: string;
    deviceId: string;
    descriptorSha256: string;
    validation: { taskId: string; file: string; sha256: string; rowsSha256: string; samples: number; horizonMinutes: number; scope: string };
    compare: Compare[];
    thresholds: NonNullable<ReturnType<typeof thresholdsOf>>;
    residuals: Residual[];
    coverage: ReturnType<typeof coverageOf>;
    at: string;
}

export interface TwinInstallation {
    deviceId: string;
    descriptorSha256: string;
    sha256: string;
    reportId: string;
    approvedBy: string;
    questionId: string;
    installedAt: string;
}

export class TwinDeployments {
    readonly root: string;
    constructor() { this.root = path.resolve(process.env.TWIN_DEPLOYMENT_DIR ?? path.join(forkDir() ?? fromRoot(), "outputs", "twin-deployments")); }
    private file(kind: string, id: string): string {
        if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("a content hash is required");
        return path.join(this.root, kind, `${id}.json`);
    }
    private save(file: string, text: string): void {
        mkdirSync(path.dirname(file), { recursive: true });
        const temp = `${file}.${randomUUID()}.tmp`;
        writeFileSync(temp, text, { flag: "wx" });
        renameSync(temp, file);
    }
    evaluation(reportId: string): TwinEvaluation {
        const report = JSON.parse(readFileSync(this.file("reports", reportId), "utf8")) as TwinEvaluation;
        const { reportId: saved, ...body } = report;
        if (saved !== reportId || fingerprint(body) !== reportId) throw new Error("evaluation report integrity check failed");
        return report;
    }
    active(deviceId?: string): TwinInstallation[] {
        const index = path.join(this.root, "active.json");
        const rows: TwinInstallation[] = existsSync(index) ? JSON.parse(readFileSync(index, "utf8")) : [];
        for (const row of rows) {
            const report = this.evaluation(row.reportId);
            if (report.verdict !== "pass" || report.deviceId !== row.deviceId || report.descriptorSha256 !== row.descriptorSha256 || report.artifactSha256 !== row.sha256) throw new Error("active installation and independent report disagree");
            this.document(row.sha256);
        }
        return deviceId ? rows.filter((r) => r.deviceId === deviceId) : rows;
    }
    private document(sha256: string): unknown {
        const bytes = readFileSync(this.file("artifacts", sha256));
        if (sha256Of(bytes) !== sha256) throw new Error("installed artifact integrity check failed");
        return JSON.parse(bytes.toString("utf8"));
    }
    async evaluate(broker: Broker, input: { taskId: string; artifactPath: string; artifactSha256: string; manifestSha256: string; deviceId: string; descriptor: DeviceDescriptor; validationTaskId: string; validationFile: string }): Promise<TwinEvaluation> {
        const bytes = workshopBytes(input.taskId, input.artifactPath);
        if (sha256Of(bytes) !== input.artifactSha256) throw new Error("candidate artifact changed since its proposal");
        const manifestBytes = workshopBytes(input.taskId, "manifest.json");
        if (sha256Of(manifestBytes) !== input.manifestSha256) throw new Error("factory manifest changed since its proposal");
        const manifest = JSON.parse(manifestBytes.toString("utf8"));
        if (!["proposed", "accepted"].includes(manifest.state) || !(manifest.artifacts ?? []).some((a: { path: string; sha256: string; kind: string }) => a.path === input.artifactPath && a.sha256 === input.artifactSha256 && ["graph", "twin"].includes(a.kind))) throw new Error("no successful factory handover for this exact graph artifact");
        const taskBytes = workshopBytes(input.taskId, "task.json");
        if (manifest.task?.sha256 !== sha256Of(taskBytes)) throw new Error("factory contract changed since its successful handover");
        const task = JSON.parse(taskBytes.toString("utf8")) as TaskFile;
        const devices = task.task.observations?.devices;
        if (!Array.isArray(devices) || !devices.some((d: { path?: string; descriptor?: DeviceDescriptor }) => d.path === input.deviceId && fingerprint(d.descriptor) === fingerprint(input.descriptor))) throw new Error("the factory task does not bind this device and descriptor");
        const candidate = (JSON.parse(workshopBytes(input.taskId, "candidates.json").toString("utf8")) as Candidate[]).find((c) => c.path === input.artifactPath && c.sha256 === input.artifactSha256);
        if (!candidate?.pass || candidate.calibration !== "PASS") throw new Error("this exact candidate has no passing calibration record");
        const thresholds = thresholdsOf(task.task);
        if (!thresholds) throw new Error("the factory contract defines no positive residual threshold");
        const compare: Compare[] = candidate.residuals.map((r) => {
            const dot = r.probe.lastIndexOf(".");
            if (dot < 1) throw new Error("invalid calibrated probe");
            return { node: r.probe.slice(0, dot), property: r.probe.slice(dot + 1), column: r.column };
        });
        if (!compare.length) throw new Error("the calibrated candidate defines no compared outputs");
        if (input.validationTaskId === input.taskId) throw new Error("validation needs a separate held-out task, never the calibration task");
        const validationTask = JSON.parse(workshopBytes(input.validationTaskId, "task.json").toString("utf8")) as TaskFile;
        const data = validationTask.task.data.find((d) => d.file === input.validationFile);
        if (!data?.sha256) throw new Error("validation file is not a hashed data source of its task");
        const held = workshopBytes(input.validationTaskId, input.validationFile);
        if (sha256Of(held) !== data.sha256) throw new Error("validation telemetry changed after its task was created");
        const heldDevices = validationTask.task.observations?.devices;
        if (!Array.isArray(heldDevices) || !heldDevices.some((d: { path?: string; descriptor?: DeviceDescriptor }) => d.path === input.deviceId && fingerprint(d.descriptor) === fingerprint(input.descriptor))) throw new Error("validation telemetry is not bound to the same device and descriptor");
        const rows = JSON.parse(held.toString("utf8")) as Row[];
        if (!Array.isArray(rows) || rows.length < 3 || rows.length > 1441 || rows.some((r, i) => !Number.isInteger(r.minute) || Number(r.minute) < 0 || Number(r.minute) > 1440 || (i > 0 && Number(r.minute) <= Number(rows[i - 1].minute)) || compare.some((c) => typeof r[c.column] !== "number" || !Number.isFinite(r[c.column])))) throw new Error("validation needs 3 to 1441 ordered, finite samples at integer minutes within 24 hours");
        for (const calibration of task.task.data) {
            const calibrationBytes = workshopBytes(input.taskId, calibration.file);
            if (!calibration.sha256 || sha256Of(calibrationBytes) !== calibration.sha256) throw new Error("calibration data integrity check failed");
            let table: unknown;
            try { table = JSON.parse(calibrationBytes.toString("utf8")); } catch { continue; }
            if (fingerprint(table) === fingerprint(rows)) throw new Error("validation telemetry duplicates calibration data");
        }
        const document = JSON.parse(bytes.toString("utf8"));
        const ran = await broker.call("twin", "session_run", { document, dt: 6, duration: Number(rows.at(-1)!.minute) * 60 + 6, sampleEvery: 10, probes: compare.map(({ node, property }) => ({ node, property })) });
        if (!ran.ok) throw new Error(`independent sandbox replay failed: ${ran.error ?? ran.outcome}`);
        const series = (ran.output as { series?: Record<string, number[]> }).series ?? {};
        const coverage = coverageOf(series, compare, rows);
        const residuals = residualsOf(series, compare, rows);
        // Missing predictions are a failed validation; JSON never stores Infinity as a misleading null score.
        if (residuals.some((r) => !Number.isFinite(r.rmse) || !Number.isFinite(r.worst))) throw new Error("independent replay returned no finite residual for a required output");
        const pass = coverage.valid && residuals.every((r) => r.rmse <= thresholds.rmseMax && (thresholds.absoluteMax === null || r.worst <= thresholds.absoluteMax));
        const body: Omit<TwinEvaluation, "reportId"> = { verdict: pass ? "pass" : "fail", taskId: input.taskId, artifactPath: input.artifactPath, artifactSha256: input.artifactSha256, manifestSha256: input.manifestSha256, deviceId: input.deviceId, descriptorSha256: fingerprint(input.descriptor), validation: { taskId: input.validationTaskId, file: input.validationFile, sha256: data.sha256, rowsSha256: fingerprint(rows), samples: rows.length, horizonMinutes: Number(rows.at(-1)!.minute), scope: "Independent held-out replay of the exact serialized graph without refitting. Valid only for the inputs and conditions encoded in that graph and the supplied telemetry; not physical safety certification." }, compare, thresholds, residuals, coverage, at: new Date().toISOString() };
        const report: TwinEvaluation = { ...body, reportId: fingerprint(body) };
        this.save(this.file("artifacts", input.artifactSha256), bytes.toString("utf8"));
        this.save(this.file("reports", report.reportId), JSON.stringify(report));
        return report;
    }
    install(input: { reportId: string; deviceId: string; descriptorSha256: string; approvedBy: string; questionId: string }): TwinInstallation {
        const report = this.evaluation(input.reportId);
        if (report.verdict !== "pass" || report.deviceId !== input.deviceId || report.descriptorSha256 !== input.descriptorSha256) throw new Error("installation requires a passing report for this exact device and descriptor");
        if (!input.approvedBy || !input.questionId) throw new Error("installation requires the commander's approval identity");
        this.document(report.artifactSha256);
        const active = this.active();
        const previous = active.find((a) => a.deviceId === input.deviceId);
        if (previous?.reportId === input.reportId) return previous;
        const installation: TwinInstallation = { ...input, sha256: report.artifactSha256, installedAt: new Date().toISOString() };
        this.save(path.join(this.root, "active.json"), JSON.stringify([...active.filter((a) => a.deviceId !== input.deviceId), installation]));
        return installation;
    }
    async run(broker: Broker, deviceId: string, minutes?: number): Promise<unknown> {
        const active = this.active(deviceId)[0];
        if (!active) throw new Error(`no twin installed for ${deviceId}`);
        const report = this.evaluation(active.reportId);
        if (report.verdict !== "pass" || report.artifactSha256 !== active.sha256 || report.deviceId !== deviceId) throw new Error("active installation and validation report disagree");
        const horizon = minutes ?? Math.min(20, report.validation.horizonMinutes);
        if (!Number.isInteger(horizon) || horizon < 1 || horizon > report.validation.horizonMinutes) throw new Error(`run horizon must be 1 to ${report.validation.horizonMinutes} integer minutes, within the independently validated span`);
        const ran = await broker.call("twin", "session_run", { document: this.document(active.sha256), dt: 6, duration: horizon * 60 + 6, sampleEvery: 10, probes: report.compare.map(({ node, property }) => ({ node, property })) });
        if (!ran.ok) throw new Error(`installed twin execution failed: ${ran.error ?? ran.outcome}`);
        return { installation: active, validationScope: report.validation.scope, minutes: horizon, result: ran.output };
    }
}
