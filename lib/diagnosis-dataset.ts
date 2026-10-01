/**
 * The diagnoses' dataset (2026-10-01, docs/evaluateur.fr.md, E5.3): what a diagnosis task's model sent and what the harness observed,
 * kept whole, once per task, however it ended, so the confidence can be calibrated again, its weights, its threshold, its predicates
 * changed, without paying a model again. The factory writes an entry when a diagnosis task ends (the topic's record);
 * scripts/evaluator/dataset.mjs sweeps workshops for the tasks it missed (a task of before, a fork's). Joined with the labels
 * (tests/fixtures/evaluator/labels.json), the entries are the labelled input of the calibration (scripts/evaluator/calibrate.mjs).
 *
 * An entry keeps, from the task's own files, never from a model's word: what the factory was given (observations.diagnosis, whole,
 * and its sha256), the model and how it ran (provider, settings, profile), the harness's version (the commits), each step as the
 * manifest has it (the capability, what the model sent, the outcome, the refusal's words, the tokens), each submission of a diagnosis
 * with its outcome, the diagnosis the guard accepted with each prediction's result, and what the station decided of it. It keeps
 * no state the model read (the trace has it): the inputs are reproducible from the forks and the commits, the outputs are not.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { forkId, fromRoot, pathFromEnv } from "./paths.js";

export const DATASET_SCHEMA = 1;
export const datasetDir = (): string => pathFromEnv("DIAGNOSIS_DATASET_DIR") ?? fromRoot("datasets", "diagnosis");

export interface DatasetStep {
    n: number;
    capability: string;
    input?: unknown;
    outcome: string;
    judged?: string;
    reason?: string | null;
    truncated?: boolean;
    tokens?: unknown;
}

export interface DatasetEntry {
    schema: number;
    /** The workshop and the task: a fork's id, or "repository". */
    key: string;
    workshop: string;
    taskId: string;
    recordedAt: string;
    startedAt: string | null;
    endedAt: string | null;
    /** How the task ended: its state (proposed, failed, ...) and the manifest's words. */
    state: string | null;
    ended: string | null;
    requestedBy: string | null;
    /** The labelled corpus whose forks the lead was read in, when they are one (tests/fixtures/<corpus>); null otherwise. */
    corpus: string | null;
    forks: string[] | null;
    lead: string;
    diagnosisId: string;
    model: string;
    family: string;
    provider: unknown;
    profile: unknown;
    /** The harness's version the task ran under: the manifest's context (the repository's commit, the fork's). */
    harness: unknown;
    asked: unknown;
    askedSha256: string;
    steps: DatasetStep[];
    /** Each diagnosis.submit: what was sent, and whether the guard took it or refused it, with its words. */
    submissions: Array<{ step: number; outcome: string; refused: boolean; reason: string | null; diagnosis: unknown }>;
    /** The diagnosis the guard accepted, as the factory kept it (each prediction's result in it); null when none was. */
    accepted: unknown;
    /** What the station decided of it: diagnosed (checked again and kept), rejected, or nothing when it was never proposed. */
    station: { status: string; reason?: string } | null;
    tokens: { prompt: number; completion: number };
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const readJson = <T>(file: string): T | null => {
    try {
        return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
        return null;
    }
};

/** The labelled corpus a set of forks is, when it is one: the fixtures' directories, each a fork by its fork.json. */
export function corpusOf(forks: string[] | null): string | null {
    if (!forks?.length) return null;
    const root = fromRoot("tests", "fixtures");
    if (!existsSync(root)) return null;
    const wanted = [...forks].sort().join("|");
    for (const corpus of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith("evaluator")).map((d) => d.name)) {
        const dir = path.join(root, corpus);
        const names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, "fork.json"))).map((d) => d.name);
        if (names.sort().join("|") === wanted) return corpus;
    }
    return null;
}

/** A diagnosis task's entry, read from its directory; null when the task is no diagnosis. */
export function entryOfTask(dir: string, workshop: string = forkId() ?? "repository"): DatasetEntry | null {
    const task = readJson<{ task?: { topics?: string[]; requestedBy?: string; observations?: { diagnosis?: Record<string, unknown> } }; profile?: string }>(path.join(dir, "task.json"));
    const asked = task?.task?.observations?.diagnosis;
    if (!task?.task?.topics?.includes("diagnosis") || !asked) return null;
    const m = readJson<{
        taskId?: string;
        state?: string;
        startedAt?: string;
        endedAt?: string;
        ended?: string | null;
        provider?: { model?: string; family?: string; settings?: unknown; profile?: unknown };
        profile?: unknown;
        context?: unknown;
        steps?: DatasetStep[];
        proposal?: { status?: string; reason?: string } | null;
    }>(path.join(dir, "manifest.json"));
    const taskId = m?.taskId ?? path.basename(dir);
    const steps = (m?.steps ?? []).map((s) => ({ n: s.n, capability: s.capability, ...(s.input !== undefined ? { input: s.input } : {}), outcome: s.outcome, ...(s.judged ? { judged: s.judged } : {}), reason: s.reason ?? null, ...(s.truncated ? { truncated: true } : {}), ...(s.tokens ? { tokens: s.tokens } : {}) }));
    const id = String(asked.id ?? "");
    const accepted = readJson<unknown>(path.join(dir, "diagnoses", `${id}.json`));
    const forks = Array.isArray(asked.forks) ? (asked.forks as unknown[]).map(String) : null;
    const tokens = steps.reduce((t, s) => ({ prompt: t.prompt + Number((s.tokens as { prompt?: number } | undefined)?.prompt ?? 0), completion: t.completion + Number((s.tokens as { completion?: number } | undefined)?.completion ?? 0) }), { prompt: 0, completion: 0 });
    return {
        schema: DATASET_SCHEMA,
        key: `${workshop}/${taskId}`,
        workshop,
        taskId,
        recordedAt: new Date().toISOString(),
        startedAt: m?.startedAt ?? null,
        endedAt: m?.endedAt ?? null,
        state: m?.state ?? null,
        ended: m?.ended ?? null,
        requestedBy: task.task.requestedBy ?? null,
        corpus: corpusOf(forks),
        forks,
        lead: String((asked.lead as { id?: unknown } | undefined)?.id ?? ""),
        diagnosisId: id,
        model: String(m?.provider?.model ?? "unknown"),
        family: String(m?.provider?.family ?? "unknown"),
        provider: m?.provider ?? null,
        profile: m?.profile ?? task.profile ?? null,
        harness: m?.context ?? null,
        asked,
        askedSha256: sha256(JSON.stringify(asked)),
        steps,
        submissions: steps.filter((s) => s.capability === "diagnosis.submit").map((s) => ({ step: s.n, outcome: s.outcome, refused: s.outcome !== "completed", reason: s.reason ?? null, diagnosis: s.input ?? null })),
        accepted,
        station: m?.proposal?.status ? { status: m.proposal.status, ...(m.proposal.reason ? { reason: m.proposal.reason } : {}) } : null,
        tokens,
    };
}

const fileOf = (dir: string, key: string): string => path.join(dir, `${key.replace(/[^A-Za-z0-9_.-]/g, "__")}.json`);

/**
 * A task's entry written to the dataset, once: an entry kept is never overwritten (what a model sent is a measure, not a draft),
 * except one written before its task had ended. Returns the file, or null when the task is no diagnosis.
 */
export function recordDiagnosisTask(taskDir: string, options: { workshop?: string; dir?: string } = {}): { file: string; written: boolean } | null {
    const entry = entryOfTask(taskDir, options.workshop);
    if (!entry) return null;
    const dir = options.dir ?? datasetDir();
    mkdirSync(dir, { recursive: true });
    const file = fileOf(dir, entry.key);
    const kept = readJson<DatasetEntry>(file);
    if (kept && kept.endedAt && kept.startedAt === entry.startedAt) return { file, written: false };
    writeFileSync(file, `${JSON.stringify(entry, null, 1)}\n`);
    return { file, written: true };
}

/** Every entry of the dataset. */
export function loadDataset(dir: string = datasetDir()): DatasetEntry[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => readJson<DatasetEntry>(path.join(dir, f)))
        .filter((e): e is DatasetEntry => Boolean(e && e.schema === DATASET_SCHEMA))
        .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
}
