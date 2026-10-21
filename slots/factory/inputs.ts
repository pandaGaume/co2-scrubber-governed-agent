/** Read the task's actual data files. Describing telemetry never creates a measurement table. */
import { readFileSync } from "node:fs";
import { thresholdsOf, topicFor, type TaskFile } from "../../harness/core/task.js";
import { sha256Of, taskFile } from "../tools/lib/workshop.js";

export function factoryInputs(task: TaskFile["task"]) {
    const files = task.data.map((d) => {
        try {
            const bytes = readFileSync(taskFile(task.id, d.file));
            if (!d.sha256 || sha256Of(bytes) !== d.sha256) return { file: d.file, rows: 0, telemetry: false, columns: [] as string[], error: "data hash missing or mismatched" };
            const rows = JSON.parse(bytes.toString("utf8"));
            const telemetry = Array.isArray(rows) && rows.length >= 3 && rows.every((r) => r && typeof r === "object" && typeof r.minute === "number" && Number.isFinite(r.minute));
            return { file: d.file, rows: Array.isArray(rows) ? rows.length : 0, telemetry, columns: Array.isArray(rows) ? [...new Set(rows.flatMap((r) => r && typeof r === "object" ? Object.keys(r) : []))] : [], error: null };
        } catch (e) { return { file: d.file, rows: 0, telemetry: false, columns: [] as string[], error: e instanceof Error ? e.message : String(e) }; }
    });
    const thresholds = thresholdsOf(task);
    const missing: string[] = [];
    if (topicFor(task) === "graph") {
        if (!files.some((f) => f.telemetry)) missing.push("telemetry table: task.data must reference a hashed file with at least three samples and a numeric minute column; neither profile nor descriptive text supplies telemetry");
        if (!thresholds) missing.push("numeric comparison threshold: objective.constraints.rmsePpmMax (or residualPpmMax); prose validation criteria are not a numeric bound");
    }
    return { ready: missing.length === 0, files, thresholds, missing };
}
