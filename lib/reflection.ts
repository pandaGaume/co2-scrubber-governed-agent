/**
 * The reflection (2026-09-29, P4 of docs/comportement-en-donnees.fr.md): what the station reads in the traces a fork's
 * agents leave, and how an adaptation of their conduct is checked before it is adopted.
 *
 *   observe   the patterns of the traces, by code: the same cause stopping a commissioning's tests again, a factory
 *             refused on the same points again and again, a task that ended STUCK, the same mistake at the first try of
 *             several tasks (a model corrects itself within a task, and makes it again at the next, 2026-09-29). Each pattern has an id the
 *             adaptation cites, and the file its fix would touch.
 *   adapt     an adaptation is a patch (JSON Pointer operations, a segment `[id=x]` picking the element of a list by
 *             its id) on one file of the context the spec says may adapt, never on one it says may not (the library,
 *             its facts, the guard's rules, the roles, the reflection's own bounds); applied, the file is still what
 *             its reader needs: a playbook runs at every event, says only its words and does only what its player
 *             carries out; a words file keeps every key and every hole.
 *
 * Nothing here adopts anything: the station does, in a fork only (`slots/station`), after checking again.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { fromRoot } from "./paths.js";
import { loadPlaybook, playbookProblems, type PlaybookExpectations } from "../harness/core/conduct.js";
import { loadWords } from "../harness/core/words.js";
import { problemsOfReason, refusalKey } from "../harness/core/problems.js";

export const REFLECTION_FORMAT_FILE = "specs/reflection/format.json";

export interface ReflectionFormat {
    words: string;
    prompt: string;
    playbook: string;
    observation: string;
    file: string;
    /** The files an adaptation may change (globs of the repository's paths). */
    adaptable: string[];
    /** What never adapts, with why, even when a pattern of `adaptable` names it. */
    never: Array<{ pattern: string; why: string }>;
    /** What reads each adaptable playbook: its words, its actions, its gates' capabilities. */
    consumers: Record<string, { words?: string; actions?: string[]; capabilities?: string[] }>;
    /** How many times in a row makes a pattern. */
    repeatAt: number;
}

export const reflectionFormat = (): ReflectionFormat => JSON.parse(readFileSync(fromRoot(...REFLECTION_FORMAT_FILE.split("/")), "utf8")) as ReflectionFormat;

/** A pattern of the traces, with what it rests on and the file its fix would touch. */
export interface Pattern {
    id: string;
    kind: "abort-repeat" | "refusal-streak" | "stuck" | "first-try-repeat" | "first-try-category";
    says: string;
    count: number;
    /** The run or the task it was read in. */
    source: string;
    /** The file of the context its fix would touch, when one is known. */
    target: string | null;
    detail: Record<string, unknown>;
}

const readJson = <T>(file: string): T | null => {
    try {
        return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
        return null;
    }
};

/** The patterns of a workshop's traces (the fork's, in a fork): its scenario runs, its tasks' manifests. */
export function observe(workshop: string, format: Pick<ReflectionFormat, "repeatAt"> = reflectionFormat()): Pattern[] {
    const patterns: Pattern[] = [];
    const at = Math.max(2, format.repeatAt);
    // The commissioning's runs: the same condition stopping its tests again.
    const runs = path.join(workshop, "runs");
    if (existsSync(runs))
        for (const file of readdirSync(runs).filter((f) => f.endsWith(".json")).sort()) {
            const run = readJson<{ id: string; startedAt: string; conduct?: { playbook?: string; causes?: Array<{ condition: string | null; reason: string }> } }>(path.join(runs, file));
            const byCondition = new Map<string, string[]>();
            for (const c of run?.conduct?.causes ?? []) byCondition.set(c.condition ?? "unknown", [...(byCondition.get(c.condition ?? "unknown") ?? []), c.reason]);
            for (const [condition, reasons] of byCondition)
                if (reasons.length >= at)
                    patterns.push({
                        id: `abort-repeat:${file.replace(/\.json$/, "")}:${condition}`,
                        kind: "abort-repeat",
                        says: `the condition ${condition} stopped ${reasons.length} tests of the same commissioning (run ${run!.id}): ${reasons.join("; ")}`,
                        count: reasons.length,
                        source: `runs/${file}`,
                        target: run?.conduct?.playbook && !run.conduct.playbook.startsWith("library:") ? run.conduct.playbook : null,
                        detail: { run: run!.id, condition, reasons, playbook: run?.conduct?.playbook ?? null },
                    });
        }
    // The factories' tasks: a capability refused on the same points again and again; a task that ended STUCK; the first refusal of each, by topic.
    const firstTries = new Map<string, { topic: string; capability: string; reason: string; tasks: string[] }>();
    // The same kind of mistake at the first try, whatever the field (2026-09-29, the replays: four tasks of four refused at their first
    // submission on a safety constant's justification, each on another field): by topic and kind of refusal, with what each task was told.
    const firstKinds = new Map<string, { topic: string; kind: string; capability: string; examples: Array<{ task: string; reason: string }> }>();
    if (existsSync(workshop))
        for (const task of readdirSync(workshop).filter((d) => /^t-/.test(d)).sort()) {
            const m = readJson<{ topic: string; ended: string | null; steps: Array<{ capability: string | null; outcome: string; reason: string | null }> }>(path.join(workshop, task, "manifest.json"));
            if (!m) continue;
            type Streak = { capability: string; key: string; times: number; reason: string };
            let streak: Streak | null = null as Streak | null;
            let longest: Streak | null = null as Streak | null;
            for (const s of m.steps) {
                if (s.outcome !== "refused" || !s.capability) continue;
                const key = refusalKey(problemsOfReason(s.reason ?? ""));
                // On the same points, whatever the capability (a submission, then its revisions), as the harness counts a streak (problems.ts); the first capability names it.
                streak = streak && streak.key === key ? { ...streak, times: streak.times + 1 } : { capability: s.capability, key, times: 1, reason: s.reason ?? "" };
                if (!longest || streak.times > longest.times) longest = streak;
            }
            if (longest && longest.times >= at)
                patterns.push({
                    id: `refusal-streak:${task}:${longest.capability}`,
                    kind: "refusal-streak",
                    says: `${longest.capability} was refused ${longest.times} times in a row on the same point(s) in task ${task} (${m.topic}): ${longest.reason.slice(0, 300)}`,
                    count: longest.times,
                    source: `${task}/manifest.json`,
                    target: existsSync(fromRoot("specs", m.topic, "words.json")) ? `specs/${m.topic}/words.json` : null,
                    detail: { task, topic: m.topic, capability: longest.capability, reason: longest.reason },
                });
            const first = m.steps.find((s) => s.outcome === "refused" && s.capability);
            if (first) {
                // The same mistake: the same kind of refusal on the same fields (a justification and a floor on one step are two mistakes).
                const k = `${m.topic}|${[...new Set(problemsOfReason(first.reason ?? "").map((x) => `${x.kind ?? ""}:${x.path ?? x.says.replace(/[\d.]+/g, "#").slice(0, 120)}`))].sort().join("|")}`;
                const seen = firstTries.get(k) ?? { topic: m.topic, capability: first.capability!, reason: first.reason ?? "", tasks: [] };
                seen.tasks.push(task);
                firstTries.set(k, seen);
                for (const kind of new Set(problemsOfReason(first.reason ?? "").map((x) => x.kind).filter((x): x is string => Boolean(x)))) {
                    const c = firstKinds.get(`${m.topic}|${kind}`) ?? { topic: m.topic, kind, capability: first.capability!, examples: [] };
                    c.examples.push({ task, reason: first.reason ?? "" });
                    firstKinds.set(`${m.topic}|${kind}`, c);
                }
            }
            if (/^STUCK/.test(m.ended ?? ""))
                patterns.push({ id: `stuck:${task}`, kind: "stuck", says: `task ${task} (${m.topic}) ended ${String(m.ended).slice(0, 300)}`, count: 1, source: `${task}/manifest.json`, target: existsSync(fromRoot("specs", m.topic, "words.json")) ? `specs/${m.topic}/words.json` : null, detail: { task, topic: m.topic, ended: m.ended } });
        }
    for (const c of firstKinds.values())
        if (c.examples.length >= at)
            patterns.push({
                id: `first-try-category:${c.topic}:${c.kind}:${c.examples.at(-1)!.task}`,
                kind: "first-try-category",
                says: `the first submission of ${c.examples.length} tasks (${c.topic}) was refused for ${c.kind}, on a different field each time or not: ${c.examples.map((e) => `${e.task}: ${e.reason.replace(/^[a-z]+ refused:\s*/i, "").slice(0, 160)}`).join(" | ")}`,
                count: c.examples.length,
                source: c.examples.map((e) => `${e.task}/manifest.json`).join(" "),
                target: existsSync(fromRoot("specs", c.topic, "words.json")) ? `specs/${c.topic}/words.json` : null,
                detail: { topic: c.topic, kind: c.kind, capability: c.capability, reason: c.examples.at(-1)!.reason, examples: c.examples.map((e) => ({ task: e.task, reason: e.reason.slice(0, 400) })) },
            });
    // The same mistake at the first try of several tasks: what a model does again at each new task, whatever it corrects within one.
    for (const f of firstTries.values())
        if (f.tasks.length >= at)
            patterns.push({
                id: `first-try-repeat:${f.topic}:${f.tasks.at(-1)}`,
                kind: "first-try-repeat",
                says: `the first submission of ${f.tasks.length} tasks (${f.topic}) was refused on the same point(s): ${f.reason.slice(0, 300)}`,
                count: f.tasks.length,
                // Every task it rests on: a reflection focused on any of them reads it.
                source: f.tasks.map((x) => `${x}/manifest.json`).join(" "),
                target: existsSync(fromRoot("specs", f.topic, "words.json")) ? `specs/${f.topic}/words.json` : null,
                detail: { topic: f.topic, capability: f.capability, reason: f.reason, tasks: f.tasks },
            });
    return patterns;
}

/** A glob of the repository's paths: `**` any depth, `*` within a segment. */
export function globMatches(glob: string, file: string): boolean {
    const re = glob
        .split("**")
        .map((part) => part.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
        .join(".*");
    return new RegExp(`^${re}$`).test(file);
}

/** One operation of an adaptation: JSON Pointer paths, a segment `[id=x]` picking the element of a list whose id is x. */
export interface PatchOp {
    /** `append` adds its value at the end of the text the pointer names: a sentence added to an instruction without copying it. */
    op: "replace" | "add" | "remove" | "append";
    /** A JSON Pointer (not `path`: a path, for the socle, is a file of the task). */
    pointer: string;
    value?: unknown;
}

export interface Adaptation {
    target: string;
    ops: PatchOp[];
    reason: string;
    /** The ids of the patterns it answers. */
    evidence: string[];
    justifications?: unknown[];
}

const segmentsOf = (pointer: string): string[] => {
    if (!pointer.startsWith("/")) throw new Error(`"${pointer}" is no JSON Pointer (it starts with /)`);
    return pointer
        .slice(1)
        .split("/")
        .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
};

/** A patch applied to a copy of a document: the copy, or why it cannot be applied. */
export function applyPatch(doc: unknown, ops: PatchOp[]): unknown {
    const out = JSON.parse(JSON.stringify(doc)) as unknown;
    for (const [i, o] of ops.entries()) {
        const segs = segmentsOf(String(o.pointer ?? ""));
        let parent: unknown = out;
        for (const s of segs.slice(0, -1)) parent = step(parent, s, `${i + 1}: ${o.pointer}`);
        const last = segs.at(-1)!;
        const where = `operation ${i + 1} (${o.op} ${o.pointer})`;
        const appended = (current: unknown): string => {
            if (typeof current !== "string" || typeof o.value !== "string") throw new Error(`${where}: append adds text to a text`);
            return current + o.value;
        };
        if (Array.isArray(parent)) {
            const idx = last === "-" ? parent.length : indexOf(parent, last, where);
            if (o.op === "add") parent.splice(idx, 0, o.value);
            else if (idx >= parent.length) throw new Error(`${where}: no element ${last}`);
            else if (o.op === "remove") parent.splice(idx, 1);
            else parent[idx] = o.op === "append" ? appended(parent[idx]) : o.value;
        } else if (parent && typeof parent === "object") {
            const obj = parent as Record<string, unknown>;
            if (o.op !== "add" && !(last in obj)) throw new Error(`${where}: no field "${last}"`);
            if (o.op === "remove") delete obj[last];
            else obj[last] = o.op === "append" ? appended(obj[last]) : o.value;
        } else throw new Error(`${where}: its parent is not an object or a list`);
    }
    return out;
}

function indexOf(list: unknown[], seg: string, where: string): number {
    const byId = /^\[id=(.+)\]$/.exec(seg);
    if (byId) {
        const i = list.findIndex((x) => x && typeof x === "object" && (x as { id?: unknown }).id === byId[1]);
        if (i < 0) throw new Error(`${where}: no element with the id "${byId[1]}"`);
        return i;
    }
    if (!/^\d+$/.test(seg)) throw new Error(`${where}: "${seg}" is no index of a list (a number, or [id=...])`);
    return Number(seg);
}

function step(value: unknown, seg: string, where: string): unknown {
    if (Array.isArray(value)) {
        const i = indexOf(value, seg, `operation ${where}`);
        if (i >= value.length) throw new Error(`operation ${where}: no element ${seg}`);
        return value[i];
    }
    if (value && typeof value === "object" && seg in (value as Record<string, unknown>)) return (value as Record<string, unknown>)[seg];
    throw new Error(`operation ${where}: no "${seg}" on the way`);
}

const holesOf = (template: string): string => [...template.matchAll(/\{([A-Za-z][A-Za-z0-9_.]*)\}/g)].map((m) => m[1]).sort().join(",");

/** The keys of a words file, flattened as the words are read (`words.ts`). */
function templatesOf(value: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (v: unknown, prefix: string) => {
        if (typeof v === "string") out[prefix] = v;
        else if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) if (k !== "note") walk(x, prefix ? `${prefix}.${k}` : k);
    };
    walk(value, "");
    return out;
}

/** An adaptation's problems: the file it may change, the patterns it cites, the patch applied, the file still what its reader needs. */
export function adaptationProblems(input: unknown, patterns: Pattern[], format: ReflectionFormat = reflectionFormat()): { problems: string[]; before?: unknown; after?: unknown } {
    const a = (input ?? {}) as Partial<Adaptation>;
    const problems: string[] = [];
    const target = String(a.target ?? "").replace(/\\/g, "/");
    const never = format.never.find((n) => globMatches(n.pattern, target));
    if (never) return { problems: [`${target} never adapts: ${never.why}`] };
    if (!format.adaptable.some((g) => globMatches(g, target))) return { problems: [`${target} is not a file an adaptation may change (${format.adaptable.join(", ")})`] };
    const file = fromRoot(...target.split("/"));
    if (!existsSync(file) || !statSync(file).isFile()) return { problems: [`${target} is not a file of the context`] };
    if (!String(a.reason ?? "").trim()) problems.push("an adaptation says why (reason)");
    const cited = Array.isArray(a.evidence) ? a.evidence.map(String) : [];
    if (!cited.length) problems.push("an adaptation cites the patterns it answers (evidence, their ids)");
    for (const id of cited) if (!patterns.some((p) => p.id === id)) problems.push(`"${id}" is not a pattern of the traces (${patterns.map((p) => p.id).join(", ") || "none"})`);
    if (!Array.isArray(a.ops) || !a.ops.length) return { problems: [...problems, "an adaptation changes something (ops)"] };
    const before = JSON.parse(readFileSync(file, "utf8")) as unknown;
    let after: unknown;
    try {
        after = applyPatch(before, a.ops as PatchOp[]);
    } catch (e) {
        return { problems: [...problems, e instanceof Error ? e.message : String(e)] };
    }
    if (JSON.stringify(after) === JSON.stringify(before)) problems.push("the patch changes nothing");
    // The file is still what its reader needs.
    if (/playbook\.json$/.test(target)) {
        const consumer = format.consumers[target] ?? {};
        const expect: PlaybookExpectations = { ...(consumer.words ? { words: loadWords(consumer.words) } : {}), ...(consumer.actions ? { actions: consumer.actions } : {}), ...(consumer.capabilities ? { capabilities: consumer.capabilities } : {}) };
        problems.push(...playbookProblems(after, target, expect));
    } else if (/words\.json$/.test(target)) {
        const was = templatesOf(before);
        const is = templatesOf(after);
        for (const [key, template] of Object.entries(was)) {
            if (is[key] === undefined) problems.push(`${target}: the key "${key}" is gone, and the code says it`);
            else if (holesOf(is[key]) !== holesOf(template)) problems.push(`${target}: "${key}" has the holes {${holesOf(is[key])}}, not the {${holesOf(template)}} the code fills`);
        }
        // What an adaptation writes never copies a value of the library (2026-09-29, the replays: the reflection wrote the signed facts'
        // values into the factory's instructions, a second source for the same number, which lies once the card is changed and signed
        // again): it cites the fact by its id, and the value is read from the library.
        for (const [key, text] of Object.entries(is)) {
            const added = was[key] === undefined ? text : text.startsWith(was[key]) ? text.slice(was[key].length) : text === was[key] ? "" : text;
            for (const copy of copiedFacts(added)) problems.push(`${target}: "${key}" writes ${copy.id} = ${copy.value} ${copy.unit}, the value of a fact of the library: cite ${copy.id} by its id, never its value (the library is the one source of it)`);
        }
    }
    return { problems, before, after };
}

/** The keys of a factory's words its stages say, from its playbook (`specs/<topic>/format.json`, field playbook); null when it has none. */
export function stageKeysOf(topic: string): string[] | null {
    const format = readJson<{ playbook?: string }>(fromRoot("specs", topic, "format.json"));
    if (!format?.playbook) return null;
    try {
        return loadPlaybook(format.playbook).stages.map((s) => s.says);
    } catch {
        return null;
    }
}

/** How a unit of the library's facts may be written in a sentence. */
const UNIT_WORDS: Record<string, string[]> = { percent: ["percent", "%"], min: ["min", "minute", "minutes"], ppm: ["ppm"], bpm: ["bpm"] };
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The facts of the library (the fork's, in a fork) whose value a text copies: its id and its value, or its value and its unit. */
export function copiedFacts(text: string): Array<{ id: string; value: number; unit: string }> {
    if (!text.trim()) return [];
    const dir = fromRoot("docs", "library");
    if (!existsSync(dir)) return [];
    const facts = readdirSync(dir)
        .filter((f) => f.endsWith(".facts.json"))
        .flatMap((f) => (readJson<{ facts?: Array<{ id: string; value: number; unit: string }> }>(path.join(dir, f))?.facts ?? []).filter((x) => typeof x.value === "number"));
    const out: Array<{ id: string; value: number; unit: string }> = [];
    for (const f of facts) {
        const number = new RegExp(`(^|[^\\d.])${escapeRe(String(f.value))}(?![\\d.]*\\d)`);
        const withUnit = new RegExp(`(^|[^\\d.])${escapeRe(String(f.value))}\\s*(${(UNIT_WORDS[f.unit] ?? [f.unit]).map(escapeRe).join("|")})(?![A-Za-z])`, "i");
        if ((text.includes(f.id) && number.test(text)) || withUnit.test(text)) out.push({ id: f.id, value: f.value, unit: f.unit });
    }
    return out;
}

/**
 * Where a factory reads what it is told about a capability, in its words file: the brief of the stage that calls it (read at
 * every step of that stage) and the tool's own description (read with every call); what the reflection is shown with a pattern.
 */
export function placesOf(words: Record<string, unknown>, capability: string, stageKeys: string[] | null = null): Array<{ key: string; read: string; text: string }> {
    const flat = templatesOf(words);
    const places: Array<{ key: string; read: string; text: string }> = [];
    // The stages' briefs, as the factory's playbook says them (a text read only after a refusal is no stage's brief); every brief when no playbook says.
    for (const [key, text] of Object.entries(flat))
        if ((stageKeys ? stageKeys.includes(key) : key.startsWith("brief.")) && capability && text.includes(capability)) places.push({ key, read: `the brief of the stage that calls ${capability}: the factory reads it at every step of that stage, before it submits`, text });
    const tool = `capabilities.${capability.split(".").pop()}`;
    if (flat[tool] !== undefined) places.push({ key: tool, read: `the description of the tool ${capability}: the factory reads it with every call`, text: flat[tool] });
    return places;
}
