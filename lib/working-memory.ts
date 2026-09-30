/**
 * The working memory (2026-09-29, the memory audit): the last episodes of a topic in a workshop, rebuilt from the tasks'
 * manifests whenever it is read. It is not a store of its own: the manifests are the ground truth, an episode their
 * structured reading (`harness/core/episodes.ts`), the working memory a window of episodes.
 *
 * A manifest written before the harness marked a cut call (`truncated`) has the mark read from its trace: the raw answer
 * of that step said the output limit stopped it. One written before it marked the guard's judgement (`judged`, 2026-09-29)
 * has it read from the refusal's words, when the reading gives how the topic's guard words one (`guardWords`).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { JsonValue } from "@spiky-panda/harness";
import { episodeOf, type ArgumentDigest, type Episode, type StepLike } from "../harness/core/episodes.js";
import { cutAtOutputLimit } from "../harness/lib/llm-common.js";

const readJson = <T>(file: string): T | null => {
    try {
        return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
        return null;
    }
};

interface ManifestLike {
    taskId?: string;
    topic: string;
    startedAt?: string;
    ended?: string | null;
    steps: StepLike[];
}

/** The steps of a refused call whose raw answer says the output limit cut it, read from a task's trace. */
export function cutSteps(dir: string): Set<number> {
    const out = new Set<number>();
    const file = path.join(dir, "trace.jsonl");
    if (!existsSync(file)) return out;
    for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
            const l = JSON.parse(line) as { n?: number; source?: string; exchange?: { response?: unknown } };
            if (l.source === "refused" && typeof l.n === "number" && cutAtOutputLimit(l.exchange?.response)) out.add(l.n);
        } catch {
            // a line cut by a crash says nothing
        }
    }
    return out;
}

/** What a task was for, in short: its topic and its required outputs. */
function intentOf(dir: string, topic: string): string {
    const task = readJson<{ task?: { objective?: { required_outputs?: Array<{ name: string; quantity: string; unit?: string }> } } }>(path.join(dir, "task.json"));
    const outputs = (task?.task?.objective?.required_outputs ?? []).map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""})`);
    return `${topic}: ${outputs.join(", ") || "?"}`;
}

export interface EpisodeReading {
    judges: ReadonlyArray<RegExp>;
    digest?: (capability: string, input: JsonValue) => ArgumentDigest;
    /** How the topic's guard words a refusal: tells the guard's refusals in a manifest written before the `judged` mark. */
    guardWords?: RegExp;
}

/** How a topic's guard words a refusal, from its words (`guard.refused`, "procedure refused: {problems}"): what comes before the problems. */
export function guardWordsOf(wordsFile: string): RegExp | undefined {
    const template = readJson<{ guard?: { refused?: string } }>(wordsFile)?.guard?.refused;
    const head = template?.split("{problems}")[0];
    return head ? new RegExp(`^${head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) : undefined;
}

/** Every episode of a topic in a workshop, oldest first. */
export function episodesOf(workshop: string, topic: string, reading: EpisodeReading): Episode[] {
    if (!existsSync(workshop)) return [];
    const out: Episode[] = [];
    for (const task of readdirSync(workshop).filter((d) => /^t-/.test(d)).sort()) {
        const dir = path.join(workshop, task);
        const m = readJson<ManifestLike>(path.join(dir, "manifest.json"));
        if (!m || m.topic !== topic || !Array.isArray(m.steps)) continue;
        const marked = m.steps.some((s) => s.truncated !== undefined);
        const cut = marked ? new Set<number>() : cutSteps(dir);
        const judgedMarked = m.steps.some((s) => s.judged !== undefined);
        const byGuard = (s: StepLike) => !judgedMarked && reading.guardWords && s.outcome === "refused" && !cut.has(s.n) && s.capability && reading.judges.some((r) => r.test(s.capability!)) && reading.guardWords.test(s.reason ?? "");
        const steps = m.steps.map((s) => (cut.has(s.n) ? { ...s, truncated: true } : byGuard(s) ? { ...s, judged: "refused" as const } : s));
        out.push(episodeOf({ taskId: m.taskId ?? task, topic, startedAt: m.startedAt ?? null, ended: m.ended ?? null, intent: intentOf(dir, topic), steps }, reading.judges, reading.digest));
    }
    return out.sort((a, b) => String(a.at ?? a.taskId).localeCompare(String(b.at ?? b.taskId)));
}

/** The working memory: the last `size` episodes of a topic. */
export function workingMemory(workshop: string, topic: string, reading: EpisodeReading, size: number): Episode[] {
    return episodesOf(workshop, topic, reading).slice(-Math.max(0, size));
}
