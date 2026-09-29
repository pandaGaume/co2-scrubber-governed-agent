// The learning experiment's numbers, from the driver's records: node report.mjs train-out.json with-out.json without-out.json
import { readFileSync } from "node:fs";
const [trainFile, withFile, withoutFile] = process.argv.slice(2);
const load = (f) => JSON.parse(readFileSync(f, "utf8"));
const train = load(trainFile);
const withA = load(withFile);
const without = load(withoutFile);
const judged = (t) => t.firstGuardSubmission;
const metrics = (tasks) => {
    const n = tasks.length;
    const pass = tasks.filter((t) => judged(t)?.accepted).length;
    const problems = tasks.reduce((a, t) => a + (judged(t)?.problems.length ?? 0), 0);
    const shapes = new Map();
    for (const t of tasks) for (const s of judged(t)?.shapes ?? []) shapes.set(s, (shapes.get(s) ?? 0) + 1);
    const categories = new Map();
    for (const t of tasks) for (const k of new Set((judged(t)?.problems ?? []).map((p) => p.kind))) categories.set(k, (categories.get(k) ?? 0) + 1);
    return {
        tasks: n,
        first_guard_evaluated_submission_pass_rate: `${pass}/${n} (${Math.round((100 * pass) / n)} %)`,
        problems_at_first_judged_submission: problems,
        tasks_by_category: Object.fromEntries(categories),
        tasks_by_form: Object.fromEntries(shapes),
        pre_guard_refusals: tasks.reduce((a, t) => a + t.preGuardRefusals.length, 0),
        no_judged_submission: tasks.filter((t) => !judged(t)).length,
        average_steps: +(tasks.reduce((a, t) => a + t.steps, 0) / n).toFixed(1),
        average_tokens: Math.round(tasks.reduce((a, t) => a + t.tokens, 0) / n),
        ended_proposed: tasks.filter((t) => t.state === "proposed").length,
    };
};
const issue = (t) => (judged(t) ? (judged(t).accepted ? "accepted" : judged(t).problems.map((p) => `${p.kind}: ${p.path ?? ""}`).join("; ")) : "no judged submission");
console.log("## baseline (training)");
for (const t of train.tasks) console.log(`${t.variant.id} ${t.taskId}: ${issue(t)} | forms: ${(judged(t)?.shapes ?? []).join(" + ")} | refs: ${(judged(t)?.references ?? []).map((r) => `${r.constant}=${r.value} <- ${r.reference}`).join(" | ")} | pre-guard ${t.preGuardRefusals.length} | steps ${t.steps} | tokens ${t.tokens} | adaptations ${JSON.stringify(t.adaptationsActive)}`);
console.log(JSON.stringify(metrics(train.tasks), null, 2));
console.log("\n## generalisation");
console.log("| Task | Without adaptation | With adaptation | Guard issue before | Guard issue after |");
console.log("|---|---|---|---|---|");
for (const w of withA.tasks) {
    const o = without.tasks.find((x) => x.variant.id === w.variant.id);
    console.log(`| ${w.variant.id} (${w.variant.co2Ppm} ppm, ${w.variant.lab.join("+")}${w.variant.previous ? `, after a ${w.variant.previous.aborted.condition} abort` : ""}) | ${o && judged(o)?.accepted ? "pass" : "fail"} | ${judged(w)?.accepted ? "pass" : "fail"} | ${o ? issue(o) : "?"} | ${issue(w)} |`);
}
console.log("\n## metrics without / with");
console.log(JSON.stringify({ without: metrics(without.tasks), with: metrics(withA.tasks) }, null, 2));
