/**
 * The confidence calibrated again on what was recorded (2026-10-01, docs/evaluateur.fr.md, E5.3 for E5.4): the dataset's diagnoses
 * (datasets/diagnosis/) joined with the labels (tests/fixtures/evaluator/labels.json), each lead's confidence under a configuration,
 * how often a diagnosis says what its label says in each band of confidence and above each threshold. No model is called. Built code
 * only (npm run build first); it reads, and writes nothing.
 *
 *     node scripts/evaluator/calibrate.mjs                          under specs/harness/diagnosis.json
 *     node scripts/evaluator/calibrate.mjs --config other.json      under another configuration (weights, caps, threshold)
 *     node scripts/evaluator/calibrate.mjs --recheck                each prediction run again on its corpus as the code is now
 *     node scripts/evaluator/calibrate.mjs --likely --unchecked --json --dataset <dir>
 *
 * --recheck: what the model sent is kept, so a change of the predicates or of the guard is measured without a model: the accepted
 * diagnosis is checked again on the labelled corpus it was made on; one the guard would now refuse drops out, and says why.
 */
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const load = (p) => import(pathToFileURL(path.join(root, "dist", p)).href);
const { loadDataset, datasetDir } = await load("lib/diagnosis-dataset.js");
const { diagnosesOfDataset, calibrationRows, bands, thresholds, recheck } = await load("lib/calibration.js");
const { diagnosisConfig } = await load("lib/confidence.js");
const { loadLabels } = await load("lib/evaluator-labels.js");

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const cfg = option("--config") ? JSON.parse(readFileSync(path.resolve(option("--config")), "utf8")) : diagnosisConfig();
const certainty = args.includes("--likely") ? "likely" : "established";
const entries = loadDataset(option("--dataset") ? path.resolve(option("--dataset")) : datasetDir());
const labels = loadLabels(path.join(root, "tests", "fixtures", "evaluator", "labels.json"));

let record;
const dropped = [];
if (args.includes("--recheck")) {
    const { HarnessGraph } = await load("lib/harness-graph.js");
    const { loadRegister } = await load("lib/rules-register.js");
    const { TOPIC_DEFINITIONS } = await load("harness/core/runner.js");
    const { readingsOf } = await load("harness/topics/diagnosis/index.js");
    const registers = Object.fromEntries(Object.keys(TOPIC_DEFINITIONS).map((t) => [t, loadRegister(t)]));
    const graphs = new Map();
    const graphOf = (corpus) => {
        if (!graphs.has(corpus)) {
            const dir = path.join(root, "tests", "fixtures", corpus);
            const forks = readdirSync(dir, { withFileTypes: true })
                .filter((d) => d.isDirectory())
                .map((d) => ({ name: d.name, dir: path.join(dir, d.name), createdAt: JSON.parse(readFileSync(path.join(dir, d.name, "fork.json"), "utf8")).createdAt }))
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            graphs.set(corpus, new HarnessGraph(forks, readingsOf(TOPIC_DEFINITIONS)));
        }
        return graphs.get(corpus);
    };
    record = (e) => {
        if (!e.corpus) return dropped.push(`${e.key}: its forks are no labelled corpus`), null;
        const r = recheck(e, graphOf(e.corpus), { registers });
        if ("why" in r) return dropped.push(`${e.key}: ${r.why}`), null;
        return r.record;
    };
}

const rows = calibrationRows(diagnosesOfDataset(entries, { unchecked: args.includes("--unchecked"), ...(record ? { record } : {}) }), labels, cfg);
const out = { entries: entries.length, leads: rows.length, config: { calibrated: cfg.calibrated, threshold: cfg.threshold, weights: cfg.weights, caps: cfg.caps }, certainty, rows, bands: bands(rows, undefined, certainty), thresholds: thresholds(rows, 20, certainty), dropped };
if (args.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
    console.log(`${entries.length} entr(ies), ${rows.length} lead(s) diagnosed; labels ${certainty}${certainty === "likely" ? " and established" : ""}`);
    for (const r of rows)
        console.log(`${r.corpus.padEnd(22)} ${r.lead.padEnd(28)} ${r.confidence.confidence.toFixed(2)} ${r.confidence.cap ? `(cap ${r.confidence.cap.why})` : ""}`.padEnd(80) + ` said ${r.said.verdict}/${r.said.class}/${r.said.current}, label ${r.label ? `${r.label.verdict}/${r.label.class}/${r.label.current} (${r.label.certainty})` : "none"}: ${r.right === null ? "not judged" : r.right ? "right" : "wrong"}`);
    console.log("\nband        leads right precision");
    for (const b of out.bands) console.log(`${b.from.toFixed(2)}-${b.to.toFixed(2)}   ${String(b.leads).padStart(5)} ${String(b.right).padStart(5)} ${b.precision === null ? "n/a" : `${Math.round(b.precision * 100)} %`}`);
    console.log("\nthreshold   sent right precision coverage");
    for (const t of out.thresholds.filter((x) => x.sent)) console.log(`${t.threshold.toFixed(2)}       ${String(t.sent).padStart(4)} ${String(t.right).padStart(5)} ${t.precision === null ? "n/a" : `${Math.round(t.precision * 100)} %`.padStart(9)} ${`${Math.round(t.coverage * 100)} %`.padStart(8)}`);
    if (dropped.length) console.log(`\ndropped on recheck:\n${dropped.join("\n")}`);
}
