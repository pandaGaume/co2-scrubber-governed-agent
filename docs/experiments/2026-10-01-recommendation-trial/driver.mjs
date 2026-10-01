import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import * as path from "node:path";
const R = process.cwd();
const { Broker } = await import(pathToFileURL(path.join(R, "dist/harness/lib/broker.js")).href);
const broker = new Broker("http://localhost:3032", { name: "recommendation-trial", version: "0", locale: "en" });
const FORKS = "exp-learn exp-control exp3-baseline exp4-train exp4-sonnet-a exp4-gpt-a exp4-sonnet-c exp4-gpt-c exp5-fable-screen-a exp6-contract exp7-fixes exp8-paths".split(" ");
const ok = async (slot, tool, args = {}) => { const r = await broker.call(slot, tool, args); if (!r.ok) throw new Error(`${slot}.${tool}: ${r.error}`); return r.output; };
for (let i = 0; ; i++) { try { await ok("station", "harness_graph", {}); break; } catch (e) { if (i > 60) throw e; await new Promise((r) => setTimeout(r, 1000)); } }
const ev = await ok("station", "harness_evaluate", { forks: FORKS });
const pick = {
  analyse: ev.findings.find((f) => f.detector === "D4" && /data\/evidence must be array/.test(f.title)),
  expected: ev.findings.find((f) => f.detector === "D1" && f.evidence.code === "expected"),
  memory: ev.findings.find((f) => f.detector === "D6"),
};
const out = {};
for (const [name, f] of Object.entries(pick)) {
  const t0 = Date.now();
  const r = await ok("station", "recommend", { forks: FORKS, finding: f.id });
  let task;
  for (;;) { task = await ok("factory", "task", { taskId: r.taskId }); if (task.run?.ended) break; await new Promise((x) => setTimeout(x, 2000)); }
  const steps = (task.manifest?.steps ?? []).map((s) => ({ n: s.n, capability: s.capability, outcome: s.outcome, judged: s.judged ?? null, reason: s.outcome !== "completed" ? String(s.reason).slice(0, 600) : null, tokens: s.tokens }));
  let review = null;
  try { review = await ok("library", "review", { id: r.recommendation }); } catch {}
  out[name] = { finding: f.id, findingTitle: f.title, recommendation: r.recommendation, taskId: r.taskId, state: task.state, ended: task.manifest?.ended ?? task.run?.ended, proposal: task.manifest?.proposal ?? null, seconds: Math.round((Date.now() - t0) / 1000), model: task.manifest?.provider?.model, steps, files: review?.files ?? null };
  console.log(name, out[name].state, out[name].ended, out[name].seconds + "s", steps.map((s) => `${s.capability}:${s.outcome}${s.judged ? "/" + s.judged : ""}`).join(" "));
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
await broker.close?.();
