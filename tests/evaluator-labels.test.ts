/**
 * The evaluator measured against its labels (2026-10-01, docs/evaluateur.fr.md, E5.0): every lead of the two corpora (the forks of
 * 29 and 30 September, the repository's workshop of 23 to 28 September) has a label, every label a lead; each label says who made
 * it and how, and whether a person confirmed it. The precision of the scripted detectors is recorded here as the baseline a
 * diagnosis by a reasoner (E5) has to beat: a change of the detectors that changes it changes this test, on purpose.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { HarnessGraph } from "../lib/harness-graph.js";
import { evaluate, type Evaluation } from "../lib/evaluator.js";
import { guardWordsOf } from "../lib/working-memory.js";
import { loadRegister } from "../lib/rules-register.js";
import { loadLabels, measure } from "../lib/evaluator-labels.js";
import { fromRepository } from "../lib/paths.js";
import { PROCEDURE_TOPIC } from "../harness/topics/procedure/index.js";

const READINGS = { procedure: { judges: PROCEDURE_TOPIC.judges ?? [], digest: PROCEDURE_TOPIC.digest, guardWords: guardWordsOf(fromRepository("specs", "procedure", "words.json")), register: loadRegister("procedure") } };
const evaluationOf = (corpus: string): Evaluation => {
    const dir = fromRepository("tests", "fixtures", corpus);
    const forks = readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({ name: d.name, dir: path.join(dir, d.name), createdAt: (JSON.parse(readFileSync(path.join(dir, d.name, "fork.json"), "utf8")) as { createdAt: string }).createdAt }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return evaluate(new HarnessGraph(forks, READINGS));
};

describe("the evaluator against its labels", () => {
    const labels = loadLabels(fromRepository("tests", "fixtures", "evaluator", "labels.json"));
    const m = measure({ evaluator: evaluationOf("evaluator"), "evaluator-repository": evaluationOf("evaluator-repository") }, labels);

    it("every lead labelled, every label a lead; each says who made it and how", () => {
        assert.deepEqual(m.unlabeled, [], "a lead the labels do not say");
        assert.deepEqual(m.missing.map((l) => l.lead), [], "a label whose lead the detectors no longer give");
        assert.equal(new Set(labels.map((l) => `${l.corpus}|${l.lead}`)).size, labels.length, "a lead labelled once");
        for (const l of labels) {
            assert.ok(["right", "wrong", "stale", "unsure"].includes(l.verdict), l.lead);
            assert.ok(l.by && l.how && l.cause, `${l.lead}: who, how and the cause`);
            assert.equal(l.verdict === "unsure", l.certainty === "unknown", `${l.lead}: unsure and only unsure has no certainty`);
        }
    });

    it("the baseline: the scripted detectors right 13 times in 17 on established labels, and 4 times in 9 on what they ask to act on (established and likely)", () => {
        assert.deepEqual(m.findings.established, { right: 13, wrong: 2, stale: 2, unsure: 0, precision: 13 / 17 });
        assert.deepEqual(m.actionable.likely, { right: 4, wrong: 1, stale: 4, unsure: 0, precision: 4 / 9 });
        // What they leave unclassified: two rules said nowhere even today, missed because the version the tasks ran under is not known.
        assert.equal(m.unclassified.wrong, 2);
    });
});
