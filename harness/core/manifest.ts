/**
 * The manifest of a task (docs/factory-harness.fr.md, section 5): what the
 * task was (sha256 of `task.json`), the profile, the prompt, the tools the
 * loop had (sha256 of the catalogue), the recipes (loaded, replayed steps),
 * every step (source, capability, input, outcome, a summary of the result,
 * milliseconds, tokens), the artifacts with their sha256 and contract, the
 * sandbox's result, the proposal, and the verdict when it comes back. Every
 * number the station will say is read here, never typed. `state` is what
 * `factory.task` reads.
 */
import { createHash } from "node:crypto";
import type { JsonValue } from "@spiky-panda/harness";
import type { CatalogueEntry } from "./capabilities.js";
import type { TaskState } from "./task.js";
import type { TaskSignature } from "./recipes.js";

export interface ManifestStep {
    n: number;
    decisionId: string | null;
    /** `policy` when replayed from the recipes, `fallback` when the model decided, `refused` when the harness stopped the step, `failed` when the reasoner failed. */
    source: "policy" | "fallback" | "refused" | "failed";
    capability: string | null;
    input: JsonValue;
    outcome: string;
    /** The result in short: the tool's answer without series or files, or the reason of a refusal. */
    summary: JsonValue;
    reward: number | null;
    reason: string | null;
    ms: number;
    tokens: { prompt: number; completion: number; total: number } | null;
}

export interface ManifestArtifact {
    kind: "graph" | "model" | "twin" | "contract" | "file";
    path: string;
    sha256: string;
    bytes: number;
    contractSha256?: string;
}

export interface Manifest {
    version: 1;
    taskId: string;
    state: TaskState;
    topic: string;
    signature: TaskSignature;
    startedAt: string;
    endedAt: string | null;
    task: { file: string; sha256: string };
    profile: { file: string; sha256: string | null };
    prompt: { file: string | null; sha256: string | null };
    provider: { name: string; model: string; family: string };
    tools: { count: number; sha256: string; list: Array<{ id: string; replayPolicy: string; origin: string }> };
    recipes: { file: string; loaded: boolean; experiencesBefore: number; experiencesAfter: number | null; replayedSteps: number; sha256: string | null };
    budget: { iterations: number; minutes: number };
    steps: ManifestStep[];
    artifacts: ManifestArtifact[];
    sandbox: JsonValue | null;
    proposal: { proposalId: string; status: string } | null;
    verdict: JsonValue | null;
    /** Why the task ended the way it did, in one sentence. */
    ended: string | null;
}

export const sha256Text = (text: string): string => createHash("sha256").update(text).digest("hex");

/** The catalogue as the manifest names it, and its sha256 (ids, descriptions, policies: what the model was given). */
export function toolsOf(catalogue: CatalogueEntry[]): Manifest["tools"] {
    const sorted = [...catalogue].sort((a, b) => a.id.localeCompare(b.id));
    return { count: sorted.length, sha256: sha256Text(JSON.stringify(sorted.map((c) => [c.id, c.description, c.replayPolicy]))), list: sorted.map((c) => ({ id: c.id, replayPolicy: c.replayPolicy, origin: c.origin })) };
}

const HEAVY = new Set(["series", "samples", "text", "base64", "coefficients", "checked"]);

/** A tool's answer without what would swell the manifest (series, file contents). */
export function summarize(value: JsonValue, depth = 0): JsonValue {
    if (Array.isArray(value)) return depth > 2 ? `[${value.length} items]` : value.slice(0, 20).map((v) => summarize(v, depth + 1));
    if (value && typeof value === "object") {
        const out: Record<string, JsonValue> = {};
        for (const [k, v] of Object.entries(value)) {
            if (HEAVY.has(k)) out[k] = Array.isArray(v) ? `[${v.length} items]` : typeof v === "string" ? `[${v.length} chars]` : "[omitted]";
            else out[k] = summarize(v, depth + 1);
        }
        return out;
    }
    if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}...`;
    return value;
}

export function manifestText(manifest: Manifest): string {
    return JSON.stringify(manifest, null, 2) + "\n";
}
