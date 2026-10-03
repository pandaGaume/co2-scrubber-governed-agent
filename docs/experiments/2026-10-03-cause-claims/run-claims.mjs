// Runs the claims of claims.mjs on the labelled corpora (built code: npm run build first); writes claims-result.json beside it.
//     node docs/experiments/2026-10-03-cause-claims/run-claims.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs"; import * as path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const R = process.cwd(); const imp = (p) => import(pathToFileURL(path.join(R, "dist", p)).href);
const { HarnessGraph } = await imp("lib/harness-graph.js"); const { evaluatePrediction } = await imp("lib/predicates.js");
const { loadRegister } = await imp("lib/rules-register.js"); const { readingsOf } = await imp("harness/topics/diagnosis/index.js");
const { TOPIC_DEFINITIONS } = await imp("harness/core/runner.js"); const { loadDataset } = await imp("lib/diagnosis-dataset.js");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { CLAIMS } = await import(pathToFileURL(path.join(HERE, "claims.mjs")).href);
const graphOf = (c) => { const d = path.join(R, "tests/fixtures", c); return new HarnessGraph(readdirSync(d, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => ({ name: x.name, dir: path.join(d, x.name), c: JSON.parse(readFileSync(path.join(d, x.name, "fork.json"))).createdAt })).sort((a, b) => a.c.localeCompare(b.c)), readingsOf(TOPIC_DEFINITIONS)); };
const G = { evaluator: graphOf("evaluator"), "evaluator-repository": graphOf("evaluator-repository") };
const E = loadDataset().sort((a, b) => (a.corpus + a.lead + a.family).localeCompare(b.corpus + b.lead + b.family));
const forms = { $D3: E.find((e) => e.lead === "D3:652d6e9fdffe").asked.lead.form.id, $D5c6: E.find((e) => e.lead === "D5:c6d772db8922").asked.lead.form.id };
const ctx = { registers: Object.fromEntries(Object.keys(TOPIC_DEFINITIONS).map((t) => [t, loadRegister(t)])) };
const out = [];
for (const c of CLAIMS) {
  const e = E[c.n - 1];
  if (c.kind !== "C") { out.push({ ...c, lead: e.lead, model: e.model }); continue; }
  const p = JSON.parse(JSON.stringify(c.p)); if (typeof p.args.form === "string" && p.args.form.startsWith("$")) p.args.form = forms[p.args.form];
  const r = evaluatePrediction(G[e.corpus], p, ctx);
  const verdict = r.truth === "unknown" ? "unknown" : (r.truth === "true") === c.expect ? "holds" : "false";
  out.push({ ...c, lead: e.lead, model: e.model, truth: r.truth, verdict, observed: r.observed.slice(0, 220) });
}
writeFileSync(path.join(HERE, "claims-result.json"), JSON.stringify(out, null, 1));
for (const o of out.filter((x) => x.kind === "C")) console.log(String(o.n).padStart(2), o.lead.padEnd(18), o.model.slice(0, 6), o.verdict.padEnd(8), o.says.slice(0, 60).padEnd(60), "|", o.observed);
const k = (f) => out.filter(f).length;
console.log({ claims: out.length, C: k((x) => x.kind === "C"), N: k((x) => x.kind === "N"), I: k((x) => x.kind === "I"), holds: k((x) => x.verdict === "holds"), false: k((x) => x.verdict === "false"), unknown: k((x) => x.verdict === "unknown") });
