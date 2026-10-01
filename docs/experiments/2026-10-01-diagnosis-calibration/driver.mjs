/**
 * E5.4, the diagnosis by two models on the labelled leads (2026-10-01, docs/evaluateur.fr.md): drives a server already running
 * (its reasoner on one profile) through station.diagnose, one lead at a time or a few, the leads whose label is established or
 * likely, in the two labelled corpora presented as forks. Every task is recorded by the factory in datasets/diagnosis/; this keeps
 * a summary of the run beside it.
 *
 *     node docs/experiments/2026-10-01-diagnosis-calibration/driver.mjs --port 3040 --out <file> [--only <lead>] [--parallel 2]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const R = process.cwd();
const { Broker } = await import(pathToFileURL(path.join(R, "dist/harness/lib/broker.js")).href);
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const port = Number(option("--port", "3040"));
const out = option("--out");
const only = option("--only");
const parallel = Number(option("--parallel", "2"));
const broker = new Broker(`http://localhost:${port}`, { name: "diagnosis-calibration", version: "0", locale: "en" });
const ok = async (slot, tool, a = {}) => {
    const r = await broker.call(slot, tool, a);
    if (!r.ok) throw new Error(`${slot}.${tool}: ${r.error}`);
    return r.output;
};
for (let i = 0; ; i++) {
    try {
        await ok("station", "harness_graph", {});
        break;
    } catch (e) {
        if (i > 90) throw e;
        await new Promise((r) => setTimeout(r, 1000));
    }
}

const labels = JSON.parse(readFileSync(path.join(R, "tests/fixtures/evaluator/labels.json"), "utf8")).labels.filter((l) => l.certainty !== "unknown" && !l.lead.startsWith("form:"));
const corpora = ["evaluator", "evaluator-repository"].map((c) => ({ corpus: c, forks: readdirSync(path.join(R, "tests/fixtures", c), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) }));
const jobs = [];
for (const { corpus, forks } of corpora) {
    const { findings } = await ok("station", "harness_evaluate", { forks });
    for (const l of labels.filter((x) => x.corpus === corpus && (!only || x.lead === only))) {
        if (!findings.some((f) => f.id === l.lead)) throw new Error(`${corpus}|${l.lead}: the lead the label names is not found`);
        jobs.push({ corpus, forks, lead: l.lead });
    }
}
console.log(`${jobs.length} lead(s) to diagnose`);
const results = [];
const run = async (job) => {
    const t0 = Date.now();
    let r;
    try {
        r = await ok("station", "diagnose", { forks: job.forks, lead: job.lead });
    } catch (e) {
        results.push({ ...job, forks: undefined, error: String(e.message ?? e) });
        console.log(`${job.lead}: not asked: ${e.message ?? e}`);
        return;
    }
    let task;
    for (;;) {
        task = await ok("factory", "task", { taskId: r.taskId });
        if (task.run?.ended) break;
        await new Promise((x) => setTimeout(x, 3000));
    }
    const steps = (task.manifest?.steps ?? []).map((s) => ({ n: s.n, capability: s.capability, outcome: s.outcome, tokens: s.tokens ?? null }));
    const tokens = steps.reduce((t, s) => ({ prompt: t.prompt + (s.tokens?.prompt ?? 0), completion: t.completion + (s.tokens?.completion ?? 0) }), { prompt: 0, completion: 0 });
    const res = { corpus: job.corpus, lead: job.lead, taskId: r.taskId, model: task.manifest?.provider?.model ?? null, state: task.state, ended: task.manifest?.ended ?? task.run?.ended, proposal: task.manifest?.proposal ?? null, seconds: Math.round((Date.now() - t0) / 1000), calls: steps.length, submits: steps.filter((s) => s.capability === "diagnosis.submit").map((s) => s.outcome), tokens };
    results.push(res);
    console.log(`${job.lead} ${res.state} ${res.proposal?.status ?? "-"} ${res.seconds}s calls ${res.calls} submits ${res.submits.join(",")} tokens ${tokens.prompt}/${tokens.completion}`);
};
const queue = [...jobs];
await Promise.all(Array.from({ length: parallel }, async () => {
    while (queue.length) await run(queue.shift());
}));
if (out) writeFileSync(out, JSON.stringify(results, null, 2));
await broker.close?.();
