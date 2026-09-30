/**
 * The evaluator's test corpus (2026-09-30, docs/evaluateur.fr.md, E1): the real tasks of the experiments of 29 and 30 September,
 * copied from their forks (outputs/forks/<id>/outputs/factory, which git does not keep) into tests/fixtures/evaluator/<id>/, lighter:
 *
 *   manifest.json  what the graph reads (the task, its provider, tools, words, prompt, context, its steps without their summaries,
 *                  and without their inputs but for the capabilities a guard judged);
 *   task.json      who asked and what for (requestedBy, the objective, the observations);
 *   trace.jsonl    only the lines the graph reads: a refused call's stop reason (a cut, before the manifest marked it), and the
 *                  memory's entries a state held (their rule and status);
 *   fork.json      the commit the fork was made from, and when.
 *
 * Nothing is rewritten: fields are dropped, never changed. A task a fork inherited from the one it was made from is copied once,
 * under the first fork that holds it (the forks in the order they were made).
 *
 *     node scripts/evaluator/corpus.mjs exp-control exp3-baseline exp4-sonnet-a exp4-gpt-a exp6-contract exp7-fixes exp8-paths
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const root = process.cwd();
const out = path.join(root, "tests", "fixtures", "evaluator");
const forkDir = (id) => path.join(root, "outputs", "forks", id);
const forks = process.argv
    .slice(2)
    .map((id) => ({ id, record: JSON.parse(readFileSync(path.join(forkDir(id), "fork.json"), "utf8")) }))
    .sort((a, b) => a.record.createdAt.localeCompare(b.record.createdAt));
if (!forks.length) throw new Error("name the forks to copy");

const STEP_KEYS = ["n", "capability", "input", "outcome", "reason", "judged", "truncated", "tokens"];
const MANIFEST_KEYS = ["version", "taskId", "state", "topic", "startedAt", "endedAt", "ended", "task", "profile", "prompt", "provider", "tools", "words", "context", "fork"];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** The trace's lines the graph reads, and only what of them it reads. */
function lightTrace(file) {
    if (!existsSync(file)) return "";
    const lines = [];
    let memory = false;
    for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        let l;
        try {
            l = JSON.parse(line);
        } catch {
            continue;
        }
        const r = l.exchange?.response;
        if (l.source === "refused" && typeof l.n === "number" && r) {
            const reason = { ...(r.stop_reason !== undefined ? { stop_reason: r.stop_reason } : {}), ...(r.choices ? { choices: r.choices.map((c) => ({ finish_reason: c.finish_reason })) } : {}), ...(r.status !== undefined ? { status: r.status, incomplete_details: r.incomplete_details ?? null } : {}) };
            lines.push({ n: l.n, source: l.source, exchange: { response: reason } });
        }
        if (!memory && line.includes('"learned":[{')) {
            const learned = [];
            JSON.parse(line, (k, v) => {
                if (k === "learned" && Array.isArray(v)) learned.push(...v);
                return v;
            });
            if (learned.length) {
                memory = true;
                lines.push({ n: l.n ?? null, source: l.source ?? null, exchange: { request: { state: { memory: { learned: learned.map((e) => ({ rule: e.rule, status: e.status ?? null })) } } } } });
            }
        }
    }
    return lines.map((l) => JSON.stringify(l)).join("\n") + (lines.length ? "\n" : "");
}

const seen = new Set();
let copied = 0;
for (const { id, record } of forks) {
    const from = path.join(forkDir(id), "outputs", "factory");
    const to = path.join(out, id);
    rmSync(to, { recursive: true, force: true });
    mkdirSync(to, { recursive: true });
    writeFileSync(path.join(to, "fork.json"), JSON.stringify({ id, createdAt: record.createdAt, origin: record.origin, parent: record.parent ?? null }, null, 1) + "\n");
    for (const t of readdirSync(from).filter((d) => d.startsWith("t-")).sort()) {
        const file = path.join(from, t, "manifest.json");
        if (!existsSync(file)) continue;
        const m = JSON.parse(readFileSync(file, "utf8"));
        const same = `${m.taskId}|${m.startedAt}`;
        if (seen.has(same)) continue;
        seen.add(same);
        const dir = path.join(to, t);
        mkdirSync(dir, { recursive: true });
        // The inputs of the capabilities a guard judged in this task (what its episode digests); the others' are not read.
        const judged = new Set((m.steps ?? []).filter((s) => s.judged).map((s) => s.capability));
        const steps = (m.steps ?? []).map((s) => pick(judged.has(s.capability) ? s : { ...s, input: undefined }, STEP_KEYS));
        writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...pick(m, MANIFEST_KEYS), steps }) + "\n");
        const task = JSON.parse(readFileSync(path.join(from, t, "task.json"), "utf8"));
        writeFileSync(path.join(dir, "task.json"), JSON.stringify({ task: { id: task.task?.id, topics: task.task?.topics, objective: task.task?.objective ?? null, observations: task.task?.observations ?? null, requestedBy: task.task?.requestedBy ?? null } }) + "\n");
        const trace = lightTrace(path.join(from, t, "trace.jsonl"));
        if (trace) writeFileSync(path.join(dir, "trace.jsonl"), trace);
        copied++;
    }
}
console.log(`${copied} task(s) of ${forks.length} fork(s) in ${path.relative(root, out)}`);
