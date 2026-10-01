/**
 * The precision of the evaluator's detectors on its labelled corpora (2026-10-01, docs/evaluateur.fr.md, E5.0): every finding of
 * tests/fixtures/evaluator and tests/fixtures/evaluator-repository against tests/fixtures/evaluator/labels.json. Built code only
 * (npm run build first); it reads, and writes nothing.
 *
 *     node scripts/evaluator/precision.mjs [--json]
 */
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const load = (p) => import(pathToFileURL(path.join(root, "dist", p)).href);
const { HarnessGraph } = await load("lib/harness-graph.js");
const { evaluate } = await load("lib/evaluator.js");
const { guardWordsOf } = await load("lib/working-memory.js");
const { loadRegister } = await load("lib/rules-register.js");
const { loadLabels, measure } = await load("lib/evaluator-labels.js");
const { PROCEDURE_TOPIC } = await load("harness/topics/procedure/index.js");

const readings = { procedure: { judges: PROCEDURE_TOPIC.judges, digest: PROCEDURE_TOPIC.digest, guardWords: guardWordsOf(path.join(root, "specs", "procedure", "words.json")), register: loadRegister("procedure") } };
const evaluations = {};
for (const corpus of ["evaluator", "evaluator-repository"]) {
    const dir = path.join(root, "tests", "fixtures", corpus);
    const forks = readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({ name: d.name, dir: path.join(dir, d.name), createdAt: JSON.parse(readFileSync(path.join(dir, d.name, "fork.json"), "utf8")).createdAt }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    evaluations[corpus] = evaluate(new HarnessGraph(forks, readings));
}
const m = measure(evaluations, loadLabels(path.join(root, "tests", "fixtures", "evaluator", "labels.json")));
if (process.argv.includes("--json")) {
    console.log(JSON.stringify(m, null, 2));
} else {
    const t = (x) => `${x.right} right, ${x.wrong} wrong, ${x.stale} stale, ${x.unsure} unsure: precision ${x.precision === null ? "n/a" : `${Math.round(x.precision * 100)} %`}`;
    console.log(`every finding     established  ${t(m.findings.established)}`);
    console.log(`                  + likely     ${t(m.findings.likely)}`);
    console.log(`                  all labels   ${t(m.findings.all)}`);
    console.log(`asks to be acted  established  ${t(m.actionable.established)}`);
    console.log(`on (recommend)    + likely     ${t(m.actionable.likely)}`);
    console.log(`                  all labels   ${t(m.actionable.all)}`);
    for (const [d, x] of Object.entries(m.byDetector)) console.log(`${d.padEnd(18)}(est.+likely) ${t(x)}`);
    const u = m.unclassified;
    console.log(`left unclassified ${u.right} rightly, ${u.wrong} a known cause missed, ${u.unsure} unsure`);
    if (m.missing.length) console.log(`labels whose lead is gone: ${m.missing.map((l) => `${l.corpus}|${l.lead}`).join(", ")}`);
    if (m.unlabeled.length) console.log(`leads without a label: ${m.unlabeled.map((u) => `${u.corpus}|${u.lead}`).join(", ")}`);
}
