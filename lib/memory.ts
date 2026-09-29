/**
 * The long-term memory of the factories, and how it is earned (2026-09-29, the memory audit):
 *
 *   working memory   the last episodes of a topic (`lib/working-memory.ts`), rebuilt from the manifests;
 *   candidate        what a reflection proposes from them: a rule, what it applies to (the capabilities it concerns),
 *                    the episodes it rests on; entered in the ledger, not yet in force;
 *   trial            once the working memory holds enough failures of the form it answers and enough successes that
 *                    answered it (a refusal, then an accepted retry: X refused, Y accepted), the entry is written to the
 *                    domain's memory file and read by the factory, provisionally;
 *   consolidated     after `judgeAfter` tasks of its topic in trial, when its mistake shows less often than before it,
 *                    with its confidence (the share of those tasks without the mistake, and how many); rejected
 *                    otherwise, and taken out of the file.
 *
 * The memory file is the fork's (`<workshop>/memory/<topic>.json`), one per domain; a factory reads, at the stage whose brief
 * calls a capability, the entries about it. The words of a topic are never written by learning. Nothing here decides alone:
 * the station calls it at the event, in a fork only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { JsonValue } from "@spiky-panda/harness";
import { fromRoot } from "./paths.js";
import { copiedFacts, judgedOn, repeated, shapesOf, showsFamily, type Pattern, type TaskTrace } from "./reflection.js";
import { mistakeRate, readLedger, writeLedger, type LedgerEntry } from "./adaptations.js";
import { firstJudged, type Episode } from "../harness/core/episodes.js";

export interface MemoryConfig {
    workingMemory: { size: number; shown: number; previousTasks: boolean };
    consolidation: { trial: { failures: number; successes: number }; judgeAfter: number };
    file: string;
    domains: Record<string, string>;
}

const DEFAULTS: MemoryConfig = { workingMemory: { size: 10, shown: 5, previousTasks: true }, consolidation: { trial: { failures: 2, successes: 1 }, judgeAfter: 3 }, file: "memory/{topic}.json", domains: {} };

/** The memory's settings, read now (a fork has its own: an ablation turns the previous tasks off there). */
export function memoryConfig(): MemoryConfig {
    const file = fromRoot("specs", "harness", "memory.json");
    try {
        const c = JSON.parse(readFileSync(file, "utf8")) as Partial<MemoryConfig>;
        return { ...DEFAULTS, ...c, workingMemory: { ...DEFAULTS.workingMemory, ...(c.workingMemory ?? {}) }, consolidation: { ...DEFAULTS.consolidation, ...(c.consolidation ?? {}), trial: { ...DEFAULTS.consolidation.trial, ...(c.consolidation?.trial ?? {}) } } };
    } catch {
        return DEFAULTS;
    }
}

/** A rule learned: what it says, what it applies to, where it stands, what it rests on. */
export interface MemoryEntry {
    id: string;
    kind: "constraint" | "workflow";
    rule: string;
    /** The capabilities it concerns: read at the stage whose brief calls one of them. */
    appliesTo: string[];
    status: "trial" | "consolidated";
    /** Once judged: the share of the tasks since its trial without its mistake, and how many tasks. */
    confidence: { rate: number; tasks: number } | null;
    evidence: { failures: string[]; successes: string[] };
    judgedOn: string[];
    since: string;
    ledger: number;
}

export interface MemoryFile {
    domain: string;
    topic: string;
    entries: MemoryEntry[];
}

export const memoryFileOf = (workshop: string, topic: string, cfg: MemoryConfig = memoryConfig()): string => path.join(workshop, ...cfg.file.replace("{topic}", topic).split("/"));

export function readMemory(workshop: string, topic: string, cfg: MemoryConfig = memoryConfig()): MemoryFile {
    const empty = { domain: cfg.domains[topic] ?? topic, topic, entries: [] };
    const file = memoryFileOf(workshop, topic, cfg);
    if (!existsSync(file)) return empty;
    try {
        const m = JSON.parse(readFileSync(file, "utf8")) as MemoryFile;
        return Array.isArray(m.entries) ? m : empty;
    } catch {
        return empty;
    }
}

export function writeMemory(workshop: string, memory: MemoryFile, cfg: MemoryConfig = memoryConfig()): string {
    const file = memoryFileOf(workshop, memory.topic, cfg);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
    return file;
}

/** What a stage needs of the memory: the entries about a capability its brief calls. */
export const relevantTo = (stage: string, appliesTo: string[]): boolean => appliesTo.some((c) => stage.includes(c));

/** An entry as a factory reads it. */
export const entryView = (e: MemoryEntry): JsonValue => ({ rule: e.rule, kind: e.kind, appliesTo: e.appliesTo, status: e.status, ...(e.confidence ? { confidence: e.confidence } : {}), evidence: { failures: e.evidence.failures.length, successes: e.evidence.successes.length } });

/** An episode as a model reads it: each attempt with who decided it and why, and what was refused then accepted. */
export function episodeView(e: Episode, current = false): JsonValue {
    return {
        episode: e.id,
        ...(current ? { current: true } : {}),
        outcome: e.finalOutcome,
        attempts: e.attempts.map((a) => ({
            call: a.capability,
            outcome: a.outcome,
            ...(a.outcome === "GUARD_REJECTED" ? { refusedOn: a.problems.slice(0, 4).map((p) => p.says.slice(0, 240)) } : a.outcome !== "ACCEPTED" && a.reason ? { reason: a.reason.slice(0, 240) } : {}),
        })),
        ...(e.contrasts.length ? { refusedThenAccepted: e.contrasts.map((c) => ({ field: c.path, refused: c.rejected.argument, accepted: c.accepted?.argument ?? null })) } : {}),
    } as JsonValue;
}

/** A task's trace as a family is read on it: its first judged attempt, refused. */
const traceOf = (e: Episode): TaskTrace => {
    const first = firstJudged(e);
    return { topic: e.topic, ended: e.ended, steps: first && first.outcome === "GUARD_REJECTED" ? [{ capability: first.capability, outcome: "refused", reason: first.reason, judged: "refused" }] : first ? [{ capability: first.capability, outcome: "completed", reason: null, judged: "accepted" }] : [] };
};

/**
 * What the working memory says for a family of mistakes: the episodes whose first judged attempt made it (failures), and
 * those of them where a retry was then accepted (successes: the mistake, then what answered it, observed).
 */
export function evidenceFor(episodes: Episode[], families: string[]): { failures: string[]; successes: string[] } {
    const failures = episodes.filter((e) => families.some((f) => showsFamily(traceOf(e), f) === true));
    return { failures: failures.map((e) => e.id), successes: failures.filter((e) => e.finalOutcome === "ACCEPTED" && e.contrasts.some((c) => c.accepted)).map((e) => e.id) };
}

/** What a reflection proposes to remember. */
export interface Remembered {
    memory: { kind: "constraint" | "workflow"; rule: string; appliesTo: string[]; evidence: { failures: string[]; successes: string[] } };
    reason: string;
    evidence: string[];
}

/** What is wrong with an entry proposed: its form, its patterns, its episodes, a fact's value copied, an entry said again. */
export function memoryProblems(input: unknown, patterns: Pattern[], episodes: Episode[], existing: MemoryEntry[]): string[] {
    const problems: string[] = [];
    const r = input as Partial<Remembered> | null;
    const m = r?.memory;
    if (!m || typeof m !== "object") return ["memory: the entry is missing (memory: kind, rule, appliesTo, evidence)"];
    if (m.kind !== "constraint" && m.kind !== "workflow") problems.push(`memory.kind: "${String(m.kind)}" is neither constraint (what a submission must hold) nor workflow (how the work goes)`);
    const rule = typeof m.rule === "string" ? m.rule.trim() : "";
    if (rule.length < 20 || rule.length > 400) problems.push(`memory.rule: ${rule.length} characters; a rule is one sentence of 20 to 400`);
    const cited = patterns.filter((p) => (r?.evidence ?? []).includes(p.id));
    if (!Array.isArray(r?.evidence) || !r!.evidence.length) problems.push("evidence: the ids of the patterns the entry answers");
    else for (const id of r!.evidence) if (!patterns.some((p) => p.id === id)) problems.push(`evidence: "${id}" is not a pattern of this task`);
    const topics = [...new Set(cited.map((p) => String(p.detail.topic ?? "")).filter(Boolean))];
    if (cited.length && topics.length !== 1) problems.push(`evidence: the patterns cited are about ${topics.length ? topics.join(" and ") : "no factory"}; an entry is about one factory's work`);
    // What it applies to: a capability the episodes attempted, so it is read where that capability is called.
    const attempted = new Set(episodes.flatMap((e) => e.attempts.map((a) => a.capability)));
    if (!Array.isArray(m.appliesTo) || !m.appliesTo.length) problems.push(`memory.appliesTo: the capabilities it concerns (${[...attempted].join(", ") || "none attempted"})`);
    else for (const c of m.appliesTo) if (!attempted.has(c)) problems.push(`memory.appliesTo: "${c}" is no capability the episodes attempted (${[...attempted].join(", ")})`);
    // The episodes it rests on: failures where the mistake was made, successes where it was then answered.
    const byId = new Map(episodes.map((e) => [e.id, e]));
    const failures = Array.isArray(m.evidence?.failures) ? m.evidence.failures : [];
    const successes = Array.isArray(m.evidence?.successes) ? m.evidence.successes : [];
    if (!failures.length) problems.push("memory.evidence.failures: the episodes where the mistake was made");
    for (const id of failures) {
        const e = byId.get(id);
        if (!e) problems.push(`memory.evidence.failures: "${id}" is not an episode of the working memory`);
        else if (firstJudged(e)?.outcome !== "GUARD_REJECTED") problems.push(`memory.evidence.failures: "${id}" was not refused at its first judged attempt`);
    }
    for (const id of successes) {
        const e = byId.get(id);
        if (!e) problems.push(`memory.evidence.successes: "${id}" is not an episode of the working memory`);
        else if (e.finalOutcome !== "ACCEPTED") problems.push(`memory.evidence.successes: "${id}" was never accepted`);
    }
    // Said by its words and the facts' ids, never a fact's value: a second source lies once the card changes.
    for (const f of copiedFacts(rule)) problems.push(`memory.rule: it says the value of ${f.id} (${f.value} ${f.unit}); name the fact by its id`);
    for (const e of existing) {
        const again = repeated(e.rule, rule);
        if (again) problems.push(`memory.rule: it says again what the memory holds already ("${e.rule.slice(0, 120)}")`);
    }
    return problems;
}

/** The topic of the patterns an entry answers. */
export const topicOfPatterns = (patterns: Pattern[], ids: string[]): string => String(patterns.find((p) => ids.includes(p.id))?.detail.topic ?? "");

/** An entry proposed, entered in the ledger as a candidate, with the families it answers and the evidence the working memory holds for it. */
export function enterCandidate(workshop: string, topic: string, r: Remembered, families: string[], episodes: Episode[], reflectionTask: string | null): LedgerEntry {
    const entries = readLedger(workshop);
    const at = new Date().toISOString();
    const on = judgedOn(families);
    const entry: LedgerEntry = {
        n: entries.length + 1,
        at,
        target: memoryConfig().file.replace("{topic}", topic),
        reason: r.reason,
        evidence: r.evidence,
        families,
        judgedOn: on,
        changes: [],
        baseline: mistakeRate(workshop, on, "before", at),
        reflectionTask,
        commit: null,
        status: "candidate",
        memory: { topic, kind: r.memory.kind, rule: r.memory.rule.trim(), appliesTo: r.memory.appliesTo, cited: r.memory.evidence },
        observed: evidenceFor(episodes, on),
    };
    writeLedger(workshop, [...entries, entry]);
    return entry;
}

/** Whether the working memory holds enough for a candidate to be tried. */
export const readyForTrial = (observed: { failures: string[]; successes: string[] }, cfg: MemoryConfig = memoryConfig()): boolean => observed.failures.length >= cfg.consolidation.trial.failures && observed.successes.length >= cfg.consolidation.trial.successes;

const entryId = (rule: string): string => `m-${createHash("sha256").update(rule).digest("hex").slice(0, 10)}`;

/**
 * The candidates the working memory now supports, put in trial: written to the domain's file, in force from the next task.
 * The evidence is counted again from the working memory as it is now; a candidate short of it stays a candidate.
 */
export function promote(workshop: string, episodesOf: (topic: string) => Episode[], cfg: MemoryConfig = memoryConfig()): LedgerEntry[] {
    const ledger = readLedger(workshop);
    const promoted: LedgerEntry[] = [];
    for (const e of ledger) {
        if (e.status !== "candidate" || !e.memory) continue;
        e.observed = evidenceFor(episodesOf(e.memory.topic), e.judgedOn ?? judgedOn(e.families));
        if (!readyForTrial(e.observed, cfg)) continue;
        const memory = readMemory(workshop, e.memory.topic, cfg);
        const at = new Date().toISOString();
        memory.entries.push({ id: entryId(e.memory.rule), kind: e.memory.kind, rule: e.memory.rule, appliesTo: e.memory.appliesTo, status: "trial", confidence: null, evidence: e.observed, judgedOn: e.judgedOn ?? judgedOn(e.families), since: at, ledger: e.n });
        writeMemory(workshop, memory, cfg);
        e.status = "trial";
        e.trialAt = at;
        e.baseline = mistakeRate(workshop, e.judgedOn ?? judgedOn(e.families), "before", at);
        promoted.push(e);
    }
    if (promoted.length) writeLedger(workshop, ledger);
    return promoted;
}

/**
 * The entries in trial that have had their tasks: consolidated when their mistake shows less often since than before,
 * with their confidence; rejected otherwise, and taken out of the domain's file.
 */
export function judgeTrials(workshop: string, cfg: MemoryConfig = memoryConfig()): LedgerEntry[] {
    const ledger = readLedger(workshop);
    const decided: LedgerEntry[] = [];
    for (const e of ledger) {
        if (e.status !== "trial" || !e.memory || !e.trialAt) continue;
        const families = e.judgedOn ?? judgedOn(e.families);
        const since = mistakeRate(workshop, families, "after", e.trialAt);
        if (since.tasks < cfg.consolidation.judgeAfter) continue;
        const before = e.baseline.tasks ? e.baseline.withMistake / e.baseline.tasks : 1;
        const after = since.withMistake / since.tasks;
        const said = `the mistake showed in ${since.withMistake} of the ${since.tasks} task(s) since its trial, against ${e.baseline.withMistake} of ${e.baseline.tasks} before`;
        const memory = readMemory(workshop, e.memory.topic, cfg);
        const i = memory.entries.findIndex((x) => x.ledger === e.n);
        e.since = since;
        e.decidedAt = new Date().toISOString();
        if (after < before) {
            e.status = "consolidated";
            e.why = `consolidated: ${said}`;
            if (i >= 0) memory.entries[i] = { ...memory.entries[i], status: "consolidated", confidence: { rate: Math.round((1 - after) * 100) / 100, tasks: since.tasks } };
        } else {
            e.status = "rejected";
            e.why = `rejected, no effect: ${said}`;
            if (i >= 0) memory.entries.splice(i, 1);
        }
        writeMemory(workshop, memory, cfg);
        decided.push(e);
    }
    if (decided.length) writeLedger(workshop, ledger);
    return decided;
}

/** The entries of a topic still waiting (candidates) or being tried: one at a time per domain. */
export const pendingMemory = (workshop: string): LedgerEntry[] => readLedger(workshop).filter((e) => e.memory && (e.status === "candidate" || e.status === "trial"));

/**
 * Whether a pattern waits because the memory answers it (2026-09-29): its family is an entry's waiting for its evidence or
 * in trial; or, a first try's, its topic's memory put an entry in trial since, and no episode after that made its mistake
 * again (the failures it was read in are the ones already answered: read again, they would bring the same rule again). A
 * mistake that comes back after is read again.
 */
export function answeredByMemory(workshop: string, episodesOf: (topic: string) => Episode[], pattern: Pattern): boolean {
    const entries = readLedger(workshop).filter((e) => e.memory);
    if (pattern.family && entries.some((e) => (e.status === "candidate" || e.status === "trial") && e.families.includes(pattern.family!))) return true;
    if (!pattern.family || !pattern.kind.startsWith("first-try")) return false;
    const topic = String(pattern.detail.topic ?? "");
    const tried = entries.filter((e) => e.memory!.topic === topic && e.trialAt && (e.status === "trial" || e.status === "consolidated")).map((e) => Date.parse(e.trialAt!));
    if (!tried.length) return false;
    const since = episodesOf(topic).filter((x) => x.at && Date.parse(x.at) > Math.max(...tried));
    return evidenceFor(since, [pattern.family]).failures.length === 0;
}
