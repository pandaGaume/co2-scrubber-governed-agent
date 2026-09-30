/**
 * The post-procedure evaluator's first detectors (2026-09-30, docs/evaluateur.fr.md, E1): what two days of reading failures by hand
 * did, as deterministic queries on the harness's graph (lib/harness-graph.ts), with no model. Each finding has its class, the nodes
 * it is about and the path that justifies it; a class a later detector settles says which (D1 and the register of the guard's rules
 * come with E2). It reads only; it changes nothing, recommends nothing yet (E3), and a model's own mistake is counted, never
 * recommended on.
 *
 *   D4  artefact of the harness   a call cut at the output limit; a task stuck in a loop; a refusal the harness made before any
 *                                 guard, in several tasks
 *   D5  regression / improvement  a form whose rate changed between two fingerprints in a row, for one model under the same memory,
 *                                 and the texts that changed between them
 *   D2  corrected at the retry    a form answered by the same correction (a reference narrowed, a field removed or added) in
 *                                 several tasks, at the first retry: a rule the models learn by being refused
 *   D3  divergence                a form frequent under one model and rare under another, on the same cases, under the same reading
 *   D8  a model's mistake         a form seen in one task only, not otherwise explained
 *
 * Thresholds: specs/harness/evaluator.json.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { JsonValue } from "@spiky-panda/harness";
import { fromRoot } from "./paths.js";
import { H, shortSha, type HarnessGraph, type HarnessNode } from "./harness-graph.js";

export const EVALUATOR_FILE = "specs/harness/evaluator.json";

export interface EvaluatorConfig {
    recurrence: { minTasks: number };
    firstRetry: { minShare: number };
    divergence: { minTasks: number; frequent: number; rare: number };
    change: { minTasks: number; minChange: number; minWithForm: number };
    commits: { texts: string[]; run: string[]; ignore: string[] };
    stuck: { endedPattern: string };
    models: { ignore: string[] };
}

export const evaluatorConfig = (): EvaluatorConfig => JSON.parse(readFileSync(fromRoot(...EVALUATOR_FILE.split("/")), "utf8")) as EvaluatorConfig;

export type FindingClass = "harness-artefact" | "regression" | "improvement" | "contract-gap" | "contract-gap-or-policy" | "model-error";

export interface Finding {
    id: string;
    detector: "D2" | "D3" | "D4" | "D5" | "D8";
    class: FindingClass;
    /** What settles a class this detector cannot: a later detector and its stage. */
    settledBy: string | null;
    title: string;
    /** The form of failure it is about, when it is about one. */
    form: { id: string; shape: string; by: string } | null;
    tasks: string[];
    models: Record<string, number>;
    /** The graph's nodes it is about. */
    about: string[];
    /** The path that justifies it, hop by hop, as the graph reads it. */
    path: string[];
    evidence: Record<string, JsonValue>;
    /** False for a model's own mistake: counted, nothing to change in the harness. */
    recommend: boolean;
}

export interface Evaluation {
    findings: Finding[];
    /** The guard's forms no detector of this stage classes: those D1 (E2) reads, with the register. */
    unclassified: Array<{ form: string; shape: string; tasks: number }>;
    counts: { tasks: number; models: Record<string, number>; forms: number; ignored: Record<string, number> };
}

const byType = (g: HarnessGraph, n: HarnessNode, type: string): HarnessNode | undefined => g.out(n, type)[0]?.ofin as HarnessNode | undefined;

/** Reading the graph the way the detectors do: the task of a refused item, its model, what it read, its case. */
class Reader {
    constructor(
        readonly g: HarnessGraph,
        private readonly ignore: RegExp[] = [],
    ) {}

    /** A task of a model the evaluator reads: a script's (a stand-in whose mistakes are written on purpose) is not one. */
    live(task: HarnessNode | undefined): task is HarnessNode {
        return Boolean(task) && !this.ignore.some((r) => r.test(this.modelOf(task!)));
    }

    taskOf(item: HarnessNode): HarnessNode | undefined {
        const up = byType(this.g, item, H.of);
        return up?.type === H.episode ? byType(this.g, up, H.of) : up;
    }
    modelOf(task: HarnessNode): string {
        return String(byType(this.g, task, H.ranBy)?.bag?.model ?? "unknown");
    }
    fingerprintOf(task: HarnessNode): HarnessNode | undefined {
        return byType(this.g, task, H.ranUnder);
    }
    /** The memory's entries its model was given. */
    memoryOf(task: HarnessNode): string[] {
        return this.g
            .out(task, H.read)
            .map((l) => l.ofin as HarnessNode)
            .filter((s) => s.bag?.kind === "memory")
            .map((s) => String(s.id))
            .sort();
    }
    /** What its model read: the fingerprint and the memory. Two tasks under the same reading were given the same texts. */
    readingOf(task: HarnessNode): string {
        return [String(this.fingerprintOf(task)?.id ?? "?"), ...this.memoryOf(task)].join("+");
    }
    /** The case: the same request run twice (by two models, in two forks) is the same case. */
    caseOf(task: HarnessNode): string {
        return String(task.bag?.case ?? task.id);
    }
    /** The tasks whose attempts or steps a form was refused for, each once. */
    tasksOf(form: HarnessNode): HarnessNode[] {
        const out = new Map<string, HarnessNode>();
        for (const l of this.g.in(form, H.refusedFor)) {
            const t = this.taskOf(l.oini as HarnessNode);
            if (this.live(t)) out.set(String(t.id), t);
        }
        return [...out.values()];
    }
    models(tasks: HarnessNode[]): Record<string, number> {
        return tasks.reduce<Record<string, number>>((m, t) => ({ ...m, [this.modelOf(t)]: (m[this.modelOf(t)] ?? 0) + 1 }), {});
    }
    /** The texts of a fingerprint, by slot: from the read links of a task that ran under it (a memory entry is not one). */
    slotsOf(fp: HarnessNode): Map<string, HarnessNode> {
        const task = this.g.in(fp, H.ranUnder)[0]?.oini as HarnessNode | undefined;
        const out = new Map<string, HarnessNode>();
        if (!task) return out;
        for (const l of this.g.out(task, H.read)) {
            const s = l.ofin as HarnessNode;
            if (s.bag?.kind !== "memory") out.set(String(s.bag?.slot), s);
        }
        return out;
    }
}

/** How a correction changed a value: the field taken out, supplied, narrowed to a part of what was sent, or replaced. */
function relation(x: JsonValue | undefined, y: JsonValue | undefined): string {
    if (y === null || y === undefined) return "removed";
    if (x === null || x === undefined) return "added";
    if (typeof x === "string" && typeof y === "string" && x !== y) return x.includes(y) ? "narrowed" : y.includes(x) ? "widened" : "replaced";
    return JSON.stringify(x) === JSON.stringify(y) ? "same" : "replaced";
}

/** A correction's signature: what it did, field by field, whatever the values: two tasks corrected the same way share it. */
export function correctionSignature(bag: Record<string, unknown>): string {
    if (bag.removed) return "removed";
    const x = bag.refused as JsonValue;
    const y = bag.accepted as JsonValue;
    const isObject = (v: JsonValue): v is Record<string, JsonValue> => typeof v === "object" && v !== null && !Array.isArray(v);
    if (isObject(x) && isObject(y)) {
        const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
        const changed = keys.map((k) => [k, relation(x[k], y[k])] as const).filter(([, r]) => r !== "same");
        return changed.map(([k, r]) => `${k}:${r}`).join(",") || "same";
    }
    return relation(x, y);
}

export function evaluate(g: HarnessGraph, cfg: EvaluatorConfig = evaluatorConfig()): Evaluation {
    const r = new Reader(g, cfg.models.ignore.map((p) => new RegExp(p)));
    const findings: Finding[] = [];
    const formRef = (f: HarnessNode) => ({ id: String(f.id), shape: String(f.bag?.shape), by: String(f.bag?.by) });
    const ids = (ns: HarnessNode[]) => ns.map((n) => String(n.id));
    const forms = g.nodesOf(H.form);
    const guardForms = forms.filter((f) => f.bag?.by === "guard");

    // D3 first: D2 classes a correction a divergence also explains as a gap of the contract.
    const all = g.nodesOf(H.task);
    const tasks = all.filter((t) => r.live(t));
    const byReading = new Map<string, HarnessNode[]>();
    for (const t of tasks) byReading.set(`${t.bag?.topic}|${r.readingOf(t)}`, [...(byReading.get(`${t.bag?.topic}|${r.readingOf(t)}`) ?? []), t]);
    const divergent = new Set<string>();
    // The guard's forms only: what the harness refused before any guard is D4's, whichever model it happened to.
    for (const f of guardForms) {
        const withForm = new Set(ids(r.tasksOf(f)));
        if (!withForm.size) continue;
        for (const [reading, ts] of byReading) {
            if (!reading.startsWith(`${f.bag?.topic}|`)) continue;
            const models = [...new Set(ts.map((t) => r.modelOf(t)))].sort();
            for (let i = 0; i < models.length; i++)
                for (let j = i + 1; j < models.length; j++) {
                    const [a, b] = [models[i], models[j]];
                    const casesOf = (m: string) => new Set(ts.filter((t) => r.modelOf(t) === m).map((t) => r.caseOf(t)));
                    const shared = [...casesOf(a)].filter((c) => casesOf(b).has(c));
                    const on = (m: string) => ts.filter((t) => r.modelOf(t) === m && shared.includes(r.caseOf(t)));
                    if (on(a).length < cfg.divergence.minTasks || on(b).length < cfg.divergence.minTasks) continue;
                    const rate = (m: string) => on(m).filter((t) => withForm.has(String(t.id))).length / on(m).length;
                    const [ra, rb] = [rate(a), rate(b)];
                    const [hi, lo, rh, rl] = ra >= rb ? [a, b, ra, rb] : [b, a, rb, ra];
                    if (rh < cfg.divergence.frequent || rl > cfg.divergence.rare) continue;
                    divergent.add(String(f.id));
                    const involved = [...on(a), ...on(b)].filter((t) => withForm.has(String(t.id)));
                    findings.push({
                        id: `D3:${shortSha(`${f.id}|${reading}|${a}|${b}`)}`,
                        detector: "D3",
                        class: "contract-gap",
                        settledBy: "D1 (E2): which statement the two models read two ways",
                        title: `${String(f.bag?.shape)}: ${on(hi).filter((t) => withForm.has(String(t.id))).length} of ${on(hi).length} tasks of ${hi}, ${on(lo).filter((t) => withForm.has(String(t.id))).length} of ${on(lo).length} of ${lo}, on the same ${shared.length} cases, under the same reading: the same text read two ways`,
                        form: formRef(f),
                        tasks: ids(involved),
                        models: r.models(involved),
                        about: [String(f.id), `model:${hi}`, `model:${lo}`, reading.split("|")[1].split("+")[0]],
                        path: [`model:${hi} <-ran-by- task (${Math.round(rh * 100)} %) -refused-for-> ${f.id}`, `model:${lo} <-ran-by- task (${Math.round(rl * 100)} %) on the same cases`, `both -ran-under-> ${reading.split("|")[1]}`],
                        evidence: { frequent: { model: hi, rate: rh, tasks: on(hi).length }, rare: { model: lo, rate: rl, tasks: on(lo).length }, cases: shared.length },
                        recommend: true,
                    });
                }
        }
    }

    // D2: a form answered by the same correction in several tasks, mostly at the first retry.
    const corrected = new Set<string>();
    for (const f of guardForms) {
        const groups = new Map<string, HarnessNode[]>();
        for (const l of g.in(f, H.answers)) {
            const c = l.oini as HarnessNode;
            const s = correctionSignature(c.bag ?? {});
            groups.set(s, [...(groups.get(s) ?? []), c]);
        }
        for (const [signature, cs] of groups) {
            const owners = new Map<string, HarnessNode>();
            const live: HarnessNode[] = [];
            for (const c of cs) {
                const episode = g.in(c, H.correctedBy)[0]?.oini as HarnessNode | undefined;
                const t = episode ? byType(g, episode, H.of) : undefined;
                if (!r.live(t)) continue;
                owners.set(String(t.id), t);
                live.push(c);
            }
            cs.splice(0, cs.length, ...live);
            if (owners.size < cfg.recurrence.minTasks) continue;
            const first = cs.filter((c) => c.bag?.retries === 1).length / cs.length;
            if (first < cfg.firstRetry.minShare) continue;
            corrected.add(String(f.id));
            const gap = divergent.has(String(f.id));
            const example = cs[0].bag ?? {};
            findings.push({
                id: `D2:${shortSha(`${f.id}|${signature}`)}`,
                detector: "D2",
                class: gap ? "contract-gap" : "contract-gap-or-policy",
                settledBy: gap ? null : "D1 (E2): a gap of the contract if no statement the models read states the rule, a learned policy otherwise",
                title: `${String(f.bag?.shape)}: answered the same way (${signature}) in ${owners.size} tasks, at the first retry ${Math.round(first * 100)} % of the time: a rule the models learn by being refused${gap ? ", which models read two ways (D3)" : ""}`,
                form: formRef(f),
                tasks: [...owners.keys()],
                models: r.models([...owners.values()]),
                about: [String(f.id), ...ids(cs.slice(0, 5))],
                path: [`task -refused-for-> ${f.id}`, `${f.id} <-answers- correction (${signature})`, `x ${cs.length} corrections in ${owners.size} tasks`],
                evidence: { signature, corrections: cs.length, firstRetryShare: first, example: { path: String(example.path), refused: (example.refused ?? null) as JsonValue, accepted: (example.accepted ?? null) as JsonValue } },
                recommend: true,
            });
        }
    }

    // D4: what the harness did, not the model: a cut, a loop, a refusal before any guard in several tasks.
    for (const f of forms.filter((x) => x.bag?.by === "harness")) {
        const ts = r.tasksOf(f);
        const cut = f.bag?.kind === "TRUNCATED";
        if (!cut && ts.length < cfg.recurrence.minTasks) continue;
        const items = g.in(f, H.refusedFor).map((l) => l.oini as HarnessNode).filter((i) => r.live(r.taskOf(i)));
        const capabilities = [...new Set(items.map((i) => String(i.bag?.capability)))].sort();
        findings.push({
            id: `D4:${shortSha(String(f.id))}`,
            detector: "D4",
            class: "harness-artefact",
            settledBy: null,
            title: cut
                ? `${items.length} call(s) cut at the output limit in ${ts.length} task(s) (${capabilities.join(", ")}): unfinished arguments no guard judged`
                : `the harness refused "${String(f.bag?.shape)}" ${items.length} times in ${ts.length} tasks, before any guard (${capabilities.join(", ")})`,
            form: formRef(f),
            tasks: ids(ts),
            models: r.models(ts),
            about: [String(f.id), ...ids(items.slice(0, 5))],
            path: [`step or attempt -refused-for-> ${f.id} (by the harness)`, `x ${items.length} in ${ts.length} tasks`, `-calls-> ${capabilities.join(", ")}`],
            evidence: { refusals: items.length, capabilities, example: String(items[0]?.bag?.reason ?? "").slice(0, 300) },
            recommend: true,
        });
    }
    // A task stuck in a loop: on the harness's own refusals, an artefact; on the guard's, sent back unchanged, what the refusal says is
    // in question (D1). Grouped by the forms of the refusals that ended it.
    const stuck = new RegExp(cfg.stuck.endedPattern);
    const loops = new Map<string, Array<{ task: HarnessNode; last: HarnessNode[]; forms: HarnessNode[] }>>();
    for (const t of tasks.filter((x) => stuck.test(String(x.bag?.ended ?? "")))) {
        const refused = [...g.in(t, H.of).map((l) => l.oini as HarnessNode)].flatMap((n) => (n.type === H.episode ? g.in(n, H.of).map((l) => l.oini as HarnessNode) : [n])).filter((n) => g.out(n, H.refusedFor).length);
        const last = refused.sort((x, y) => Number(x.bag?.step) - Number(y.bag?.step)).slice(-3);
        const fs = [...new Map(last.flatMap((n) => g.out(n, H.refusedFor).map((l) => l.ofin as HarnessNode)).map((f) => [String(f.id), f])).values()];
        const key = fs.map((f) => String(f.id)).sort().join("+");
        loops.set(key, [...(loops.get(key) ?? []), { task: t, last, forms: fs }]);
    }
    for (const [key, xs] of loops) {
        const fs = xs[0].forms;
        const byHarness = fs.length > 0 && fs.every((f) => f.bag?.by === "harness");
        const shapes = fs.map((f) => String(f.bag?.shape)).join("; ");
        findings.push({
            id: `D4:${shortSha(`loop|${key}`)}`,
            detector: "D4",
            class: byHarness ? "harness-artefact" : "contract-gap-or-policy",
            settledBy: byHarness ? null : "D1 (E2): whether the guard's refusal says what it expects there",
            title: byHarness ? `${xs.length} task(s) ended in a loop of the harness's refusals: "${shapes}"` : `${xs.length} task(s) stuck on the guard's refusal, sent back unchanged: "${shapes}"`,
            form: fs.length === 1 ? formRef(fs[0]) : null,
            tasks: ids(xs.map((x) => x.task)),
            models: r.models(xs.map((x) => x.task)),
            about: [...fs.map((f) => String(f.id)), ...ids(xs.map((x) => x.task))],
            path: [`${xs.length} task(s) ended "${String(xs[0].task.bag?.ended).slice(0, 80)}"`, ...xs[0].last.map((n) => `${n.id} (${String(n.bag?.capability)}) -refused-for-> ${g.out(n, H.refusedFor).map((l) => l.ofin?.id).join(", ")}`)],
            evidence: { loops: Object.fromEntries(xs.map((x) => [String(x.task.id), x.last.map((n) => Number(n.bag?.step))])) as JsonValue, forms: fs.map((f) => String(f.id)) },
            recommend: true,
        });
    }

    // D5: one model, the same memory, two fingerprints in a row: a form whose rate changed, and the texts that changed between them.
    for (const [topicModelMemory, ts] of groupBy(tasks, (t) => `${t.bag?.topic}|${r.modelOf(t)}|${r.memoryOf(t).join("+")}`)) {
        const byFp = groupBy(ts, (t) => String(r.fingerprintOf(t)?.id));
        const order = [...byFp].map(([fp, xs]) => ({ fp, xs, first: xs.map((x) => String(x.bag?.startedAt ?? "")).sort()[0] })).sort((a, b) => a.first.localeCompare(b.first));
        for (let i = 1; i < order.length; i++) {
            const [a, b] = [order[i - 1], order[i]];
            if (a.xs.length < cfg.change.minTasks || b.xs.length < cfg.change.minTasks) continue;
            const [fa, fb] = [g.get(a.fp)!, g.get(b.fp)!];
            const [sa, sb] = [r.slotsOf(fa), r.slotsOf(fb)];
            const changed: Array<{ slot: string; statement: string | null; stored: string | null; was: string | null }> = [...sb].filter(([slot, s]) => sa.size && sa.get(slot)?.id !== s.id).map(([slot, s]) => ({ slot, statement: String(s.id), stored: (s.bag?.stored ?? null) as string | null, was: sa.has(slot) ? String(sa.get(slot)!.id) : null }));
            // A manifest before E0 holds the tools' digest as a whole, no text: that they changed is all it says.
            const described = Boolean(fa.bag?.toolsDetailed && fb.bag?.toolsDetailed);
            // How the model was run: its profile is not a text it read, and not in the fingerprint, but a change of it is a change.
            const profiles = (xs: HarnessNode[]) => new Set(xs.map((t) => JSON.stringify(t.bag?.profile ?? null)));
            const [pa, pb] = [profiles(a.xs), profiles(b.xs)];
            if (pa.size === 1 && pb.size === 1 && [...pa][0] !== [...pb][0]) {
                const [was, now] = [JSON.parse([...pa][0]), JSON.parse([...pb][0])] as Array<{ file: string; sha256: string } | null>;
                changed.push({ slot: `profile:${now?.file ?? was?.file ?? "?"}`, statement: null, stored: null, was: was?.sha256 ?? null });
            }
            let files: string[] = [];
            if (!described) {
                // Before E0, the commits: what git says changed between them, the texts a model is given first.
                const [ca, cb] = [fa.bag?.repository, fb.bag?.repository].map((c) => (typeof c === "string" ? c : null));
                if (ca && cb && ca !== cb) files = changedFiles(ca, cb, cfg.commits);
                const matches = (patterns: string[]) => files.filter((f) => patterns.some((p) => new RegExp(p).test(f)));
                const [texts, run] = [matches(cfg.commits.texts), matches(cfg.commits.run)];
                for (const f of texts) changed.push({ slot: `file:${f}`, statement: null, stored: null, was: ca });
                for (const f of run) changed.push({ slot: `run:${f}`, statement: null, stored: null, was: ca });
                const code = files.length - texts.length - run.length;
                if (code > 0) changed.push({ slot: `${code} file(s) of code`, statement: null, stored: null, was: ca });
                if (!files.length && fa.bag?.tools !== fb.bag?.tools) changed.push({ slot: "tools (no text kept before E0)", statement: null, stored: null, was: (fa.bag?.tools ?? null) as string | null });
            }
            for (const f of forms.filter((x) => x.bag?.topic === ts[0].bag?.topic)) {
                const withForm = new Set(ids(r.tasksOf(f)));
                const na = a.xs.filter((t) => withForm.has(String(t.id))).length;
                const nb = b.xs.filter((t) => withForm.has(String(t.id))).length;
                const [ra, rb] = [na / a.xs.length, nb / b.xs.length];
                const worse = rb - ra >= cfg.change.minChange && nb >= cfg.change.minWithForm;
                const better = ra - rb >= cfg.change.minChange && na >= cfg.change.minWithForm;
                if (!worse && !better) continue;
                const [, model] = topicModelMemory.split("|");
                findings.push({
                    id: `D5:${shortSha(`${f.id}|${a.fp}|${b.fp}|${topicModelMemory}`)}`,
                    detector: "D5",
                    class: worse ? "regression" : "improvement",
                    settledBy: null,
                    title: `${String(f.bag?.shape)}: ${na} of ${a.xs.length} tasks of ${model} before, ${nb} of ${b.xs.length} after the harness changed: ${changed.map((c) => c.slot).join(", ") || "no text a model read"}`,
                    form: formRef(f),
                    tasks: ids([...a.xs, ...b.xs].filter((t) => withForm.has(String(t.id)))),
                    models: { [model]: na + nb },
                    about: [String(f.id), a.fp, b.fp, ...(changed.map((c) => c.statement).filter(Boolean) as string[])],
                    path: [`${a.fp}: ${na}/${a.xs.length} -refused-for-> ${f.id}`, `${b.fp}: ${nb}/${b.xs.length}`, ...changed.map((c) => `${b.fp} -changed-> ${c.statement ?? "?"} (${c.slot}, was ${c.was ?? "absent"})`)],
                    evidence: {
                        before: { fingerprint: a.fp, tasks: a.xs.length, withForm: na },
                        after: { fingerprint: b.fp, tasks: b.xs.length, withForm: nb },
                        changed: changed as unknown as JsonValue,
                        described,
                        files,
                        toolsBefore: (fa.bag?.tools ?? null) as JsonValue,
                        toolsAfter: (fb.bag?.tools ?? null) as JsonValue,
                    },
                    recommend: worse,
                });
            }
        }
    }

    // D8: a guard's form no detector above explains, seen in one task only: the model's own mistake, counted. A form a model makes
    // again, even on the same request, is not isolated: D1 reads it (E2).
    const unclassified: Evaluation["unclassified"] = [];
    const explained = new Set(findings.map((f) => f.form?.id).filter(Boolean) as string[]);
    for (const f of guardForms) {
        if (corrected.has(String(f.id)) || divergent.has(String(f.id)) || explained.has(String(f.id))) continue;
        const ts = r.tasksOf(f);
        if (!ts.length) continue;
        if (ts.length > 1) {
            unclassified.push({ form: String(f.id), shape: String(f.bag?.shape), tasks: ts.length });
            continue;
        }
        findings.push({
            id: `D8:${shortSha(String(f.id))}`,
            detector: "D8",
            class: "model-error",
            settledBy: "D1 (E2): that a statement the model read states the rule",
            title: `${String(f.bag?.shape)}: in one task (${String(ts[0].bag?.requestedBy ?? ts[0].id)}), answered by no common correction and read no differently by another model: the model's own mistake`,
            form: formRef(f),
            tasks: ids(ts),
            models: r.models(ts),
            about: [String(f.id), ...ids(ts)],
            path: [`${ids(ts)[0]} -refused-for-> ${f.id}`, `no other task`],
            evidence: { requestedBy: (ts[0].bag?.requestedBy ?? null) as JsonValue },
            recommend: false,
        });
    }

    return { findings, unclassified, counts: { tasks: tasks.length, models: r.models(tasks), forms: forms.length, ignored: r.models(all.filter((t) => !r.live(t))) } };
}

/** The files changed between two commits, from git, less those no run reads; none when git or a commit is not there. */
function changedFiles(a: string, b: string, cfg: EvaluatorConfig["commits"]): string[] {
    try {
        const out = execFileSync("git", ["diff", "--name-only", a, b], { cwd: fromRoot(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        return out
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((f) => f && !cfg.ignore.some((p) => new RegExp(p).test(f)))
            .sort();
    } catch {
        return [];
    }
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
    return m;
}
