// The episodes rebuilt from the recorded tasks (2026-09-29, the memory audit, step 3): every procedure task of the given
// forks read as an episode (harness/core/episodes.ts, lib/working-memory.ts), its attempts with who decided them, and
// the contrasts between a field the guard refused and what the next accepted attempt sent there. Deterministic: no model.
//
//   npm run build
//   node scripts/learning-experiment/episodes.mjs exp-learn exp-control [--json out.json]
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import * as path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { episodesOf } = await imp("dist/lib/working-memory.js");
const { PROCEDURE_TOPIC } = await imp("dist/harness/topics/procedure/index.js");
const args = process.argv.slice(2);
const out = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const forks = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json");
const reading = { judges: PROCEDURE_TOPIC.judges, digest: PROCEDURE_TOPIC.digest };
const all = [];
for (const fork of forks) {
    const episodes = episodesOf(path.join(ROOT, "outputs", "forks", fork, "outputs", "factory"), "procedure", reading);
    for (const e of episodes) {
        all.push({ fork, ...e });
        console.log(`${fork} ${e.taskId}: ${e.attempts.map((a) => `${a.capability.replace("procedure.", "")}:${a.outcome}`).join(" -> ") || "no attempt"} => ${e.finalOutcome}`);
        for (const c of e.contrasts) console.log(`   ${c.path} [${c.kind}]  X ${JSON.stringify(c.rejected.argument?.reference ?? c.rejected.argument)} -> REJECTED   Y ${c.accepted ? JSON.stringify(c.accepted.argument?.reference ?? c.accepted.argument) : "(not sent again)"} -> ACCEPTED`);
    }
}
const count = (f) => all.filter(f).length;
const attempts = all.flatMap((e) => e.attempts);
console.log(`\n${all.length} episodes; attempts: ${["ACCEPTED", "GUARD_REJECTED", "PRE_GUARD_REJECTED", "TRUNCATED", "CAPABILITY_FAILED"].map((o) => `${o} ${attempts.filter((a) => a.outcome === o).length}`).join(", ")}`);
console.log(`final: ACCEPTED ${count((e) => e.finalOutcome === "ACCEPTED")}, NOT_ACCEPTED ${count((e) => e.finalOutcome === "NOT_ACCEPTED")}, NO_ATTEMPT ${count((e) => e.finalOutcome === "NO_ATTEMPT")}; contrasts ${all.reduce((a, e) => a + e.contrasts.length, 0)}`);
if (out) writeFileSync(out, `${JSON.stringify(all, null, 2)}\n`);
