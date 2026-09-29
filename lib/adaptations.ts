/**
 * The adaptations a fork adopted, and what became of them (2026-09-29; the replays: four adaptations stacked one per run,
 * none of which made the factory's first submission pass, and nothing said so).
 *
 *   the ledger    every adaptation adopted in the fork (`outputs/factory/adaptations/ledger.json`, in the fork's history):
 *                 its file, each place it changed with the value before and after, the families of the patterns it answers,
 *                 how often their mistake showed before it, the snapshot that adopted it.
 *   the judgement after `evaluateAfter` tasks of its topic since it was adopted, an adaptation is kept when its families'
 *                 mistake shows less often than before it, and undone otherwise: the value before put back at each place
 *                 (a place changed since is not touched, and said), a snapshot taken.
 *   the memory    what was tried for a family, and what it did: what the reflection is shown, so it tries something else
 *                 rather than saying the same again; and no new adaptation of a family while one of it is being judged.
 *
 * Nothing here decides alone: the station calls it at the event, in a fork only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot } from "./paths.js";
import { applyPatch, pointerGet, showsFamily, tasksOf, type PatchOp } from "./reflection.js";

export interface LedgerEntry {
    n: number;
    at: string;
    target: string;
    reason: string;
    evidence: string[];
    families: string[];
    changes: Array<{ pointer: string; op: PatchOp["op"]; before: unknown; after: unknown }>;
    /** How often the families' mistake showed in the tasks of the topic before it was adopted. */
    baseline: { tasks: number; withMistake: number };
    reflectionTask: string | null;
    commit: string | null;
    status: "adopted" | "kept" | "undone" | "not undone";
    decidedAt?: string;
    /** Why it was kept or undone, with what the tasks since showed. */
    why?: string;
    since?: { tasks: number; withMistake: number };
}

export const ledgerFile = (workshop: string): string => path.join(workshop, "adaptations", "ledger.json");

export function readLedger(workshop: string): LedgerEntry[] {
    const file = ledgerFile(workshop);
    if (!existsSync(file)) return [];
    try {
        return JSON.parse(readFileSync(file, "utf8")) as LedgerEntry[];
    } catch {
        return [];
    }
}

export function writeLedger(workshop: string, entries: LedgerEntry[]): void {
    mkdirSync(path.dirname(ledgerFile(workshop)), { recursive: true });
    writeFileSync(ledgerFile(workshop), `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

const topicOf = (family: string): string => family.split(":")[1] ?? "";

/** How often a family's mistake shows in the workshop's tasks of its topic, before or after a moment. */
export function mistakeRate(workshop: string, families: string[], side: "before" | "after", at: string): { tasks: number; withMistake: number } {
    const t = Date.parse(at);
    let tasks = 0;
    let withMistake = 0;
    for (const { manifest } of tasksOf(workshop)) {
        const started = Date.parse(manifest.startedAt ?? "");
        if (!Number.isFinite(started) || (side === "before" ? started >= t : started <= t)) continue;
        const shows = families.map((f) => showsFamily(manifest, f)).filter((x): x is boolean => x !== null);
        if (!shows.length) continue;
        tasks++;
        if (shows.some(Boolean)) withMistake++;
    }
    return { tasks, withMistake };
}

/** An adaptation adopted, entered in the ledger with what a judgement and an undo need. */
export function enterAdoption(workshop: string, a: { target: string; ops: PatchOp[]; reason: string; evidence: string[] }, families: string[], before: unknown, reflectionTask: string | null, commit: string | null): LedgerEntry {
    const entries = readLedger(workshop);
    const at = new Date().toISOString();
    let doc = before;
    const changes = a.ops.map((o) => {
        const was = pointerGet(doc, o.pointer);
        doc = applyPatch(doc, [o]);
        return { pointer: o.pointer, op: o.op, before: was, after: pointerGet(doc, o.pointer) };
    });
    const entry: LedgerEntry = { n: entries.length + 1, at, target: a.target, reason: a.reason, evidence: a.evidence, families, changes, baseline: mistakeRate(workshop, families, "before", at), reflectionTask, commit, status: "adopted" };
    writeLedger(workshop, [...entries, entry]);
    return entry;
}

/** The adoptions being judged: adopted, not yet decided, with fewer tasks of their topic since than the judgement needs. */
export function underJudgement(workshop: string, evaluateAfter: number): LedgerEntry[] {
    return readLedger(workshop).filter((e) => e.status === "adopted" && mistakeRate(workshop, e.families, "after", e.at).tasks < evaluateAfter);
}

/**
 * The judgement of the adoptions that have had their tasks: kept when their families' mistake shows less often since than
 * before, undone otherwise (the value before put back at each place, when the place still holds the value after). Returns
 * what was decided; the caller writes the file (`undo`), snapshots and says it.
 */
export function judge(workshop: string, evaluateAfter: number, entries: LedgerEntry[] = readLedger(workshop)): Array<{ entry: LedgerEntry; decision: "keep" | "undo" }> {
    const out: Array<{ entry: LedgerEntry; decision: "keep" | "undo" }> = [];
    for (const e of entries) {
        if (e.status !== "adopted" || !e.families.some((f) => ["first-try-category", "first-try-repeat", "stuck", "refusal-streak"].includes(f.split(":")[0]))) continue;
        const since = mistakeRate(workshop, e.families, "after", e.at);
        if (since.tasks < evaluateAfter) continue;
        const before = e.baseline.tasks ? e.baseline.withMistake / e.baseline.tasks : 1;
        const after = since.withMistake / since.tasks;
        e.since = since;
        e.decidedAt = new Date().toISOString();
        const said = `the mistake showed in ${since.withMistake} of the ${since.tasks} task(s) of ${topicOf(e.families[0])} since it was adopted, against ${e.baseline.withMistake} of ${e.baseline.tasks} before`;
        if (after < before) {
            e.status = "kept";
            e.why = `kept: ${said}`;
            out.push({ entry: e, decision: "keep" });
        } else {
            e.why = `no effect: ${said}`;
            out.push({ entry: e, decision: "undo" });
        }
    }
    return out;
}

/** An adoption undone in its file: the value before put back at each place that still holds the value after; what could not be. */
export function undo(entry: LedgerEntry, resolve: (target: string) => string = (t) => fromRoot(...t.split("/"))): { file: string; left: string[] } {
    const file = resolve(entry.target);
    let doc = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const left: string[] = [];
    for (const c of [...entry.changes].reverse()) {
        const now = pointerGet(doc, c.pointer);
        if (JSON.stringify(now) === JSON.stringify(c.after)) doc = c.before === undefined ? applyPatch(doc, [{ op: "remove", pointer: c.pointer }]) : applyPatch(doc, [{ op: "replace", pointer: c.pointer, value: c.before }]);
        else if (c.op === "append" && typeof now === "string" && typeof c.after === "string" && typeof c.before === "string" && now.includes(c.after.slice(c.before.length))) doc = applyPatch(doc, [{ op: "replace", pointer: c.pointer, value: now.replace(c.after.slice(c.before.length), "") }]);
        else left.push(c.pointer);
    }
    writeFileSync(file, `${JSON.stringify(doc, null, 4)}\n`, "utf8");
    return { file, left };
}

/** What was tried for these families, and what it did: what the reflection is shown. */
export function historyOf(workshop: string, families: string[]): Array<{ n: number; target: string; reason: string; changes: Array<{ pointer: string; op: string; added?: string; value?: unknown }>; status: string; why: string | null }> {
    return readLedger(workshop)
        .filter((e) => e.families.some((f) => families.includes(f)))
        .map((e) => ({
            n: e.n,
            target: e.target,
            reason: e.reason,
            changes: e.changes.map((c) => (c.op === "append" && typeof c.after === "string" && typeof c.before === "string" ? { pointer: c.pointer, op: c.op, added: c.after.slice(c.before.length) } : { pointer: c.pointer, op: c.op, value: c.after })),
            status: e.status,
            why: e.why ?? null,
        }));
}
