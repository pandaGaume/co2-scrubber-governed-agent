// The memory's experiment in numbers (2026-09-29, Guillaume's matrix): the same unseen tasks under A (control), B (working
// memory), C (long-term memory), D (both), each judged on its first guard-evaluated submission only.
//
//   node scripts/learning-experiment/report-conditions.mjs <train.json> A=<a.json> B=<b.json> C=<c.json> [D=<d.json>]
import { readFileSync } from "node:fs";
const [trainFile, ...rest] = process.argv.slice(2);
const load = (f) => JSON.parse(readFileSync(f, "utf8"));
const train = load(trainFile);
const conditions = Object.fromEntries(rest.map((a) => a.split("=")).map(([k, f]) => [k, load(f)]));
const judged = (t) => t.firstGuardSubmission;
// The original error: a safety constant's reference joining facts ("…; …"), refused as no fact of the library.
// Said since 2026-09-29 by its own code (INVALID_REFERENCE_CARDINALITY); before, as "no fact of the library" with a ";" in the quote.
const composite = (t) => (judged(t)?.problems ?? []).some((p) => p.kind === "justification" && (/INVALID_REFERENCE_CARDINALITY/.test(p.says) || (/is not a fact of the library/.test(p.says) && /;/.test(p.says))));
const compositeSent = (t) => (judged(t)?.references ?? []).some((r) => /;/.test(String(r.reference)));
const sum = (tasks, f) => tasks.reduce((a, t) => a + f(t), 0);
const metrics = (o) => {
    const tasks = o.tasks;
    const n = tasks.length;
    const pass = tasks.filter((t) => judged(t)?.accepted).length;
    const kinds = {};
    for (const t of tasks) for (const k of new Set((judged(t)?.problems ?? []).map((p) => p.kind))) kinds[k] = (kinds[k] ?? 0) + 1;
    const forms = {};
    for (const t of tasks) for (const s of judged(t)?.shapes ?? []) forms[s] = (forms[s] ?? 0) + 1;
    return {
        settings: o.settings,
        pass: `${pass}/${n}`,
        passRate: Math.round((100 * pass) / n),
        guardProblems: sum(tasks, (t) => judged(t)?.problems.length ?? 0),
        compositeRefused: tasks.filter(composite).length,
        compositeSent: tasks.filter(compositeSent).length,
        tasksByKind: kinds,
        tasksByForm: forms,
        noJudgedSubmission: tasks.filter((t) => !judged(t)).length,
        truncations: sum(tasks, (t) => t.truncations ?? 0),
        preGuard: sum(tasks, (t) => t.preGuardRefusals.length),
        avgSteps: +(sum(tasks, (t) => t.steps) / n).toFixed(1),
        avgInputTokens: Math.round(sum(tasks, (t) => t.inputTokens ?? 0) / n),
        avgOutputTokens: Math.round(sum(tasks, (t) => t.outputTokens ?? 0) / n),
        maxOutputInOneStep: Math.max(...tasks.map((t) => t.maxOutputTokensInOneStep ?? 0)),
        memorySeen: tasks.map((t) => (t.memorySeenAtFirstJudged ? `${t.memorySeenAtFirstJudged.learned.length}L/${t.memorySeenAtFirstJudged.previousEpisodes}E` : "-")).join(" "),
        memoryUnchanged: o.memoryUnchanged,
    };
};
console.log("## training");
for (const t of train.tasks) console.log(`${t.variant.id} ${t.taskId}: ${judged(t) ? (judged(t).accepted ? "ACCEPTED" : judged(t).problems.map((p) => `${p.kind}: ${p.path ?? ""}`).join("; ")) : "no judged submission"} | truncated ${t.truncations} | steps ${t.steps} | in ${t.inputTokens} out ${t.outputTokens} | memory seen ${t.memorySeenAtFirstJudged ? `${t.memorySeenAtFirstJudged.learned.map((e) => e.status).join(",") || "none"}` : "-"}`);
for (const r of train.reflections.filter((x) => x.taskId)) console.log(`reflection after ${r.after}: ${r.state}; ${(r.proposals ?? []).map((p) => `${p.capability} ${p.outcome}${p.refused ? ` (${p.refused.slice(0, 160)})` : ""}`).join(" | ")}; memory ${JSON.stringify(r.memory?.map((e) => `${e.n}:${e.status}`))}`);
console.log(`frozen: ${train.frozen ? `entry ${train.frozen.entry.n} consolidated after ${train.frozen.afterTask}: ${train.frozen.entry.memory.rule} (${train.frozen.entry.why})` : "never"}`);
console.log(`\n## validation, the first guard-evaluated submission of the same ${conditions[Object.keys(conditions)[0]].tasks.length} unseen tasks`);
const ids = Object.keys(conditions);
console.log(`| Task | ${ids.join(" | ")} |`);
console.log(`|---|${ids.map(() => "---").join("|")}|`);
for (const t0 of conditions[ids[0]].tasks) {
    const v = t0.variant;
    const cell = (o) => {
        const t = o.tasks.find((x) => x.variant.id === v.id);
        if (!t || !judged(t)) return "no submission";
        return judged(t).accepted ? "pass" : `fail (${[...new Set(judged(t).problems.map((p) => (composite(t) && p.kind === "justification" ? "composite" : p.kind)))].join(", ")})`;
    };
    console.log(`| ${v.id}: ${v.co2Ppm} ppm, ${v.lab.join("+")}${v.previous ? `, after a ${v.previous.aborted.condition} abort` : ""} | ${ids.map((k) => cell(conditions[k])).join(" | ")} |`);
}
console.log("\n## metrics");
console.log(JSON.stringify(Object.fromEntries(ids.map((k) => [k, metrics(conditions[k])])), null, 2));
