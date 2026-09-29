// The failure patterns that occur by themselves (2026-09-29, Guillaume's baseline: discover a recurring behaviour worth learning,
// choose none in advance). Every task of the given forks is read as an episode (harness/core/episodes.ts); each first guard-judged
// failure is classified by its form (shapesOf: fields, ids, quotes and numbers taken out); for each form, how often, in how many
// tasks, whether the same task then corrected it, whether a deterministic X refused / Y accepted contrast can be read, whether the
// same correction came back, the steps and tokens of the tasks it hit, and what in the task points at the harness rather than the
// model (an attempt cut at the output limit, or stopped before the guard, earlier in the same episode). Deterministic: no model.
//
//   npm run build
//   node scripts/learning-experiment/patterns.mjs <fork> [<fork> ...] [--json out.json]
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { episodesOf } = await imp("dist/lib/working-memory.js");
const { firstJudged } = await imp("dist/harness/core/episodes.js");
const { shapesOf } = await imp("dist/lib/reflection.js");
const { PROCEDURE_TOPIC } = await imp("dist/harness/topics/procedure/index.js");
const args = process.argv.slice(2);
const out = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const forks = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json");
const reading = { judges: PROCEDURE_TOPIC.judges, digest: PROCEDURE_TOPIC.digest };

const tasks = [];
for (const fork of forks) {
    const workshop = path.join(ROOT, "outputs", "forks", fork, "outputs", "factory");
    for (const e of episodesOf(workshop, "procedure", reading)) {
        const m = JSON.parse(readFileSync(path.join(workshop, e.taskId, "manifest.json"), "utf8"));
        const steps = m.steps ?? [];
        tasks.push({
            fork,
            episode: e,
            steps: steps.length,
            inputTokens: steps.reduce((a, s) => a + (s.tokens?.prompt ?? 0), 0),
            outputTokens: steps.reduce((a, s) => a + (s.tokens?.completion ?? 0), 0),
            truncations: steps.filter((s) => s.truncated).length,
            state: m.state,
            ended: m.ended,
        });
    }
}

/** What an argument says, for comparing corrections: a justification by its reference, a value by itself. */
const said = (a) => (a && typeof a === "object" && "reference" in a ? `reference ${JSON.stringify(a.reference)}` : a && typeof a === "object" && "value" in a ? `value ${JSON.stringify(a.value)}` : JSON.stringify(a));
const general = (p) => (p ? p.replace(/\.\d+\./g, ".*.").replace(/\.\d+$/, ".*") : "(no field)");

const patterns = new Map();
for (const t of tasks) {
    const e = t.episode;
    const first = firstJudged(e);
    if (!first || first.outcome !== "GUARD_REJECTED") continue;
    const before = e.attempts.slice(0, e.attempts.indexOf(first));
    const harness = before.filter((a) => a.outcome === "TRUNCATED" || a.outcome === "PRE_GUARD_REJECTED").map((a) => `${a.capability}:${a.outcome}`);
    const retries = e.attempts.slice(e.attempts.indexOf(first) + 1);
    // A problem with a kind is a mistake; a clause without one ("the signed rules bound it by ...") is what the guard adds to it.
    for (const p of first.problems.filter((x) => x.kind)) {
        const form = shapesOf(p.says)[0] ?? `${p.kind ?? "?"}: ${p.says.slice(0, 80)}`;
        const c = e.contrasts.find((x) => x.path === p.path && x.rejected.step === first.step);
        const rec = patterns.get(form) ?? { form, kind: p.kind ?? null, fields: new Set(), occurrences: [], tasks: new Set() };
        rec.fields.add(general(p.path));
        rec.tasks.add(`${t.fork}/${t.episode.taskId}`);
        rec.occurrences.push({
            task: `${t.fork}/${t.episode.taskId}`,
            field: p.path ?? null,
            capability: first.capability,
            says: p.says.slice(0, 300),
            corrected: e.finalOutcome === "ACCEPTED",
            retriesToAccept: e.finalOutcome === "ACCEPTED" ? retries.findIndex((a) => a.outcome === "ACCEPTED") + 1 : null,
            contrast: c ? { refused: c.rejected.argument, accepted: c.accepted?.argument ?? null } : null,
            harnessBefore: harness,
            taskTruncations: t.truncations,
            steps: t.steps,
            inputTokens: t.inputTokens,
            outputTokens: t.outputTokens,
        });
        patterns.set(form, rec);
    }
}

/** A reference that names two facts or more ("a.b (...); c.d", "c.d / a.b"): the composite reference, whatever joins them. */
const factIds = (text) => String(text ?? "").match(/\b[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+\b/g) ?? [];
const composite = (o) => /is not a fact of the library/.test(o.says) && new Set(factIds(o.contrast?.refused?.reference ?? o.says.split(" is not a fact")[0])).size >= 2;
const clean = tasks.filter((t) => firstJudged(t.episode)?.outcome === "ACCEPTED");
const avg = (xs, f) => (xs.length ? Math.round(xs.reduce((a, x) => a + f(x), 0) / xs.length) : null);
const ranked = [...patterns.values()]
    .map((r) => {
        const occ = r.occurrences;
        const byTask = [...r.tasks];
        const corrections = occ.filter((o) => o.contrast?.accepted).map((o) => said(o.contrast.accepted));
        const counts = corrections.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
        const repeated = [...counts.entries()].filter(([, n]) => n > 1).map(([y, n]) => `${y} (x${n})`);
        const tasksOf = (f) => byTask.filter((id) => occ.some((o) => o.task === id && f(o)));
        const harnessTasks = tasksOf((o) => o.harnessBefore.length > 0 || o.taskTruncations > 0);
        const firstOcc = byTask.map((id) => occ.find((o) => o.task === id));
        const row = {
            form: r.form,
            kind: r.kind,
            fields: [...r.fields],
            occurrences: occ.length,
            tasksAffected: byTask.length,
            correctedInTask: `${tasksOf((o) => o.corrected).length}/${byTask.length}`,
            contrastExtracted: `${tasksOf((o) => o.contrast?.accepted).length}/${byTask.length}`,
            sameCorrectionRepeated: repeated.length ? repeated : "no",
            corrections: [...counts.entries()].map(([y, n]) => ({ y, n })),
            retriesToAccept: occ.map((o) => o.retriesToAccept),
            avgSteps: avg(firstOcc, (o) => o.steps),
            avgInputTokens: avg(firstOcc, (o) => o.inputTokens),
            avgOutputTokens: avg(firstOcc, (o) => o.outputTokens),
            harnessSigns: harnessTasks.length ? `${harnessTasks.length}/${byTask.length} task(s) with an attempt cut or stopped before the guard: ${[...new Set(occ.flatMap((o) => o.harnessBefore))].join(", ") || "a truncation elsewhere in the task"}` : "none seen",
            compositeReference: occ.filter(composite).length,
            examples: occ.slice(0, 3).map((o) => ({ task: o.task, field: o.field, says: o.says.slice(0, 200), refused: o.contrast?.refused ?? null, accepted: o.contrast?.accepted ?? null })),
        };
        // The criteria of a learning target: natural (by construction), repeated across tasks, corrected after the guard, the correction observed, no harness sign.
        row.criteria = {
            naturally: true,
            repeatedAcrossTasks: byTask.length >= 2,
            correctedAfterGuard: tasksOf((o) => o.corrected).length >= Math.ceil(byTask.length / 2),
            correctionObserved: tasksOf((o) => o.contrast?.accepted).length >= 1,
            notHarness: harnessTasks.length === 0,
        };
        row.target = Object.values(row.criteria).every(Boolean);
        return row;
    })
    .sort((a, b) => b.tasksAffected - a.tasksAffected || b.occurrences - a.occurrences);

const summary = {
    forks,
    tasks: tasks.length,
    firstJudged: { accepted: clean.length, refused: tasks.filter((t) => firstJudged(t.episode)?.outcome === "GUARD_REJECTED").length, none: tasks.filter((t) => !firstJudged(t.episode)).length },
    truncations: tasks.reduce((a, t) => a + t.truncations, 0),
    preGuardOrCut: tasks.reduce((a, t) => a + t.episode.attempts.filter((x) => x.outcome === "TRUNCATED" || x.outcome === "PRE_GUARD_REJECTED").length, 0),
    finalAccepted: tasks.filter((t) => t.episode.finalOutcome === "ACCEPTED").length,
    cleanTasks: { avgSteps: avg(clean, (t) => t.steps), avgInputTokens: avg(clean, (t) => t.inputTokens), avgOutputTokens: avg(clean, (t) => t.outputTokens) },
    compositeReference: { occurrences: [...patterns.values()].flatMap((r) => r.occurrences).filter(composite).length, tasks: new Set([...patterns.values()].flatMap((r) => r.occurrences.filter(composite).map((o) => o.task))).size },
};
console.log(JSON.stringify(summary, null, 2));
console.log("\n| # | Form of the first guard failure | Kind | Occurrences | Tasks | Corrected in task | X/Y extracted | Same correction repeated | Avg steps / in / out | Harness signs | Target? |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
ranked.forEach((r, i) => console.log(`| ${i + 1} | ${r.form} | ${r.kind} | ${r.occurrences} | ${r.tasksAffected} | ${r.correctedInTask} | ${r.contrastExtracted} | ${Array.isArray(r.sameCorrectionRepeated) ? r.sameCorrectionRepeated.join("; ") : r.sameCorrectionRepeated} | ${r.avgSteps} / ${r.avgInputTokens} / ${r.avgOutputTokens} | ${r.harnessSigns} | ${r.target ? "yes" : `no (${Object.entries(r.criteria).filter(([, v]) => !v).map(([k]) => k).join(", ")})`} |`));
for (const t of tasks) console.log(`${t.fork}/${t.episode.taskId}: ${t.episode.attempts.map((a) => `${a.capability.replace("procedure.", "")}:${a.outcome}`).join(" -> ") || "no attempt"} => ${t.episode.finalOutcome}; steps ${t.steps}, in ${t.inputTokens}, out ${t.outputTokens}, truncations ${t.truncations}`);
if (out) writeFileSync(out, `${JSON.stringify({ summary, patterns: ranked, tasks: tasks.map((t) => ({ fork: t.fork, taskId: t.episode.taskId, attempts: t.episode.attempts.map((a) => ({ capability: a.capability, outcome: a.outcome, problems: a.problems })), contrasts: t.episode.contrasts, finalOutcome: t.episode.finalOutcome, steps: t.steps, inputTokens: t.inputTokens, outputTokens: t.outputTokens, truncations: t.truncations, ended: t.ended })) }, null, 2)}\n`);
