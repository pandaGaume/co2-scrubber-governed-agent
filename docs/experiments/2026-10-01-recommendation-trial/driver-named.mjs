// The recommendation factory on named findings: node hard.mjs <port> <out.json> <forks,comma> <finding> [finding...]
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import * as path from "node:path";
const R = process.cwd();
const { Broker } = await import(pathToFileURL(path.join(R, "dist/harness/lib/broker.js")).href);
const [port, outFile, forksArg, ...findings] = process.argv.slice(2);
const FORKS = forksArg.split(",");
const broker = new Broker(`http://localhost:${port}`, { name: "recommendation-trial", version: "0", locale: "en" });
const ok = async (slot, tool, args = {}) => { const r = await broker.call(slot, tool, args); if (!r.ok) throw new Error(`${slot}.${tool}: ${r.error}`); return r.output; };
for (let i = 0; ; i++) { try { await ok("library", "list", {}); break; } catch (e) { if (i > 60) throw e; await new Promise((r) => setTimeout(r, 1000)); } }
const out = {};
for (const finding of findings) {
  const t0 = Date.now();
  let r;
  try { r = await ok("station", "recommend", { forks: FORKS, finding }); } catch (e) { out[finding] = { refused: String(e.message) }; console.log(finding, "refused:", e.message); continue; }
  let task;
  for (;;) { task = await ok("factory", "task", { taskId: r.taskId }); if (task.run?.ended) break; await new Promise((x) => setTimeout(x, 2000)); }
  const m = task.manifest ?? {};
  out[finding] = { recommendation: r.recommendation, taskId: r.taskId, state: task.state, ended: m.ended ?? task.run?.ended, proposal: m.proposal ?? null, seconds: Math.round((Date.now() - t0) / 1000), model: m.provider?.model, telemetry: m.telemetry ? { calls: m.telemetry.modelCalls, input: m.telemetry.modelInputTokens, output: m.telemetry.modelOutputTokens } : null, steps: (m.steps ?? []).map((s) => ({ n: s.n, capability: s.capability, outcome: s.outcome, judged: s.judged ?? null, input: /recommendation\.propose|task\.fail/.test(s.capability ?? "") ? s.input : undefined, reason: s.outcome !== "completed" ? String(s.reason).slice(0, 1500) : null })) };
  console.log(finding, out[finding].state, out[finding].ended, out[finding].seconds + "s", JSON.stringify(out[finding].proposal), out[finding].steps.map((s) => `${s.capability}:${s.outcome}${s.judged ? "/" + s.judged : ""}`).join(" "));
}
writeFileSync(outFile, JSON.stringify(out, null, 2));
await broker.close?.();
