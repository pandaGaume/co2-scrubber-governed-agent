import { createHash } from "node:crypto";
import type { JsonValue } from "@spiky-panda/harness";
import type { Progress } from "./workspace-observer.js";

function canonical(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
}

/** Distinct queries and JSON pointers must not overwrite one another's answers. */
export function evidenceKey(capability: string, input: JsonValue): string {
    const arg = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const main = ["id", "path", "type", "quantity", "query"].find((key) => typeof arg[key] === "string");
    const name = main ? String(arg[main]) : "";
    const rest = Object.fromEntries(Object.entries(arg).filter(([key]) => key !== main && key !== "taskId"));
    const detail = Object.keys(rest).length ? JSON.stringify(canonical(rest)) : "";
    const suffix = detail.length > 300 ? `${detail.slice(0, 200)} sha256:${createHash("sha256").update(detail).digest("hex")}` : detail;
    return [capability, name, suffix].filter(Boolean).join(" ");
}

/** Keep failed lookups as evidence too, so another read does not erase the blockage. */
export function rememberEvidence(progress: Progress, capability: string, input: JsonValue, summary: JsonValue, cap = 10): void {
    if (/^(task|graph)\./.test(capability)) return;
    const key = evidenceKey(capability, input);
    delete progress.evidence[key];
    progress.evidence[key] = { at: new Date().toISOString(), summary };
    const keys = Object.keys(progress.evidence);
    for (const old of keys.slice(0, Math.max(0, keys.length - cap))) delete progress.evidence[old];
}
