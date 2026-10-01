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
    /** A submission the topic's guard judged (`judges`): accepted, or refused by the guard itself; absent when the harness stopped it before the guard. */
    judged?: "accepted" | "refused";
    /** A call the model's answer did not finish (the output limit): not run, judged by nobody. */
    truncated?: boolean;
}

export interface ManifestArtifact {
    kind: "graph" | "model" | "twin" | "procedure" | "plugin" | "playbook" | "adaptation" | "recommendation" | "diagnosis" | "contract" | "file";
    path: string;
    sha256: string;
    bytes: number;
    contractSha256?: string;
}

export interface Manifest {
    version: 1;
    taskId: string;
    /** The fork the task ran in, when it ran in one: what it produced is the fork's (2026-09-29). */
    fork?: string;
    state: TaskState;
    topic: string;
    signature: TaskSignature;
    startedAt: string;
    endedAt: string | null;
    task: { file: string; sha256: string };
    profile: { file: string; sha256: string | null };
    prompt: { file: string | null; sha256: string | null };
    provider: { name: string; model: string; family: string; settings?: Record<string, string | number | null>; profile?: { file: string; sha256: string } };
    /**
     * The catalogue: `sha256` of the ids, descriptions and policies, as it always was; `contract` of the same with the input schemas,
     * and each tool's own (2026-09-30, the harness's graph: which text a model read changed between two runs, the store under
     * `_statements/<sha256>.json` holding each text once).
     */
    tools: { count: number; sha256: string; contract?: string; list: Array<{ id: string; replayPolicy: string; origin: string; sha256?: string }> };
    /** The words file of the topic (its briefs and refusals), by its sha256; the text in the store. */
    words?: { file: string; sha256: string } | null;
    /** The code and the context the task ran under: the repository's commit, and a fork's own history's (2026-09-30). */
    context?: { repository: string | null; fork: string | null };
    recipes: { file: string; loaded: boolean; experiencesBefore: number; experiencesAfter: number | null; replayedSteps: number; sha256: string | null };
    budget: { iterations: number; minutes: number };
    steps: ManifestStep[];
    artifacts: ManifestArtifact[];
    sandbox: JsonValue | null;
    proposal: { proposalId: string; status: string } | null;
    verdict: JsonValue | null;
    /** Why the task ended the way it did, in one sentence. */
    ended: string | null;
    /** Where the tokens went (2026-09-25): the model's usage, cache included, and the characters of each part of the context, so the cost of every part is known. */
    telemetry?: Telemetry;
}

export interface Telemetry {
    modelCalls: number;
    modelInputTokens: number;
    modelOutputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    /** Characters of the context by category, summed over the calls: the system prompt, the intention, the observation (the state), the tool results, the history replayed. */
    contextCharsByCategory: Record<string, number>;
    /** Characters of the tools' whole answers, and of what the model read of them. */
    toolResultBytes: number;
    compactedContextBytes: number;
    /** The context mode the model ran with: `state` (the reasoning state alone) or `conversation` (the transcript replayed). */
    contextMode: string;
}

export function newTelemetry(contextMode = "unknown"): Telemetry {
    return { modelCalls: 0, modelInputTokens: 0, modelOutputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, contextCharsByCategory: {}, toolResultBytes: 0, compactedContextBytes: 0, contextMode };
}

export const sha256Text = (text: string): string => createHash("sha256").update(text).digest("hex");

/** The catalogue as the manifest names it, and its sha256 (ids, descriptions, policies: what the model was given). */
export function toolsOf(catalogue: CatalogueEntry[]): Manifest["tools"] {
    const sorted = [...catalogue].sort((a, b) => a.id.localeCompare(b.id));
    const each = sorted.map((c) => ({ id: c.id, replayPolicy: c.replayPolicy, origin: c.origin, sha256: statementSha(c) }));
    return { count: sorted.length, sha256: sha256Text(JSON.stringify(sorted.map((c) => [c.id, c.description, c.replayPolicy]))), contract: sha256Text(JSON.stringify(each.map((c) => [c.id, c.sha256]))), list: each };
}

/** A tool as the model reads it: its id, its description, its input schema. */
export const statementOf = (c: CatalogueEntry): { id: string; description: string; inputSchema: JsonValue } => ({ id: c.id, description: c.description, inputSchema: (c.inputSchema ?? null) as JsonValue });
export const statementSha = (c: CatalogueEntry): string => sha256Text(JSON.stringify(statementOf(c)));

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
