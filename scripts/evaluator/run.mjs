/**
 * The post-procedure evaluator from the command line (2026-09-30, docs/evaluateur.fr.md, E1): what station.harness_evaluate answers,
 * on the repository's workshop or on forks read together, printed one finding per line (with --json, the whole evaluation). Built
 * code only (npm run build first); it reads, and writes nothing.
 *
 *     node scripts/evaluator/run.mjs                          the repository's workshop
 *     node scripts/evaluator/run.mjs exp6-contract exp7-fixes  those forks, in the order they were made
 *     node scripts/evaluator/run.mjs --all-forks [--json]
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const load = (p) => import(pathToFileURL(path.join(root, "dist", p)).href);
const { HarnessGraph } = await load("lib/harness-graph.js");
const { evaluate } = await load("lib/evaluator.js");
const { guardWordsOf } = await load("lib/working-memory.js");
const { TOPIC_DEFINITIONS } = await load("harness/core/runner.js");
const { loadRegister } = await load("lib/rules-register.js");

const args = process.argv.slice(2);
const json = args.includes("--json");
const forksRoot = path.join(root, "outputs", "forks");
let ids = args.filter((a) => !a.startsWith("--"));
if (args.includes("--all-forks")) ids = readdirSync(forksRoot).filter((d) => existsSync(path.join(forksRoot, d, "fork.json")));
const readings = Object.fromEntries(
    Object.entries(TOPIC_DEFINITIONS)
        .filter(([, d]) => d?.judges)
        .map(([t, d]) => [t, { judges: d.judges, digest: d.digest, guardWords: d.words ? guardWordsOf(path.join(root, ...d.words.words.file.split("/"))) : undefined, register: loadRegister(t) }]),
);
const source = ids.length
    ? ids
          .map((id) => ({ name: id, dir: path.join(forksRoot, id, "outputs", "factory"), createdAt: JSON.parse(readFileSync(path.join(forksRoot, id, "fork.json"), "utf8")).createdAt }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : path.join(root, "outputs", "factory");
const e = evaluate(new HarnessGraph(source, readings));
if (json) {
    console.log(JSON.stringify(e, null, 2));
} else {
    console.log(`${ids.length ? `forks ${ids.join(", ")}` : "the repository's workshop"}: ${JSON.stringify(e.counts)}`);
    for (const f of e.findings) console.log(`${f.detector} ${f.class}${f.settledBy ? ` (to settle: ${f.settledBy})` : ""}${f.recommend ? "" : " (nothing to recommend)"}\n    ${f.title}`);
    for (const u of e.unclassified) console.log(`unclassified, ${u.tasks} task(s)${u.rules?.length ? ` [${u.rules.join(", ")}]` : ""}: ${u.shape}`);
}
