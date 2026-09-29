/**
 * The adaptations a fork adopted, judged and undone (2026-09-29, after the replays: four adaptations stacked, one per run,
 * none of which made the factory's first submission pass, and nothing said so). On a workshop and a file of the test's own.
 *
 *     node --test dist/tests/
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { enterAdoption, historyOf, judge, mistakeRate, readLedger, underJudgement, undo, writeLedger } from "../lib/adaptations.js";
import { adaptationProblems, repeated, reflectionFormat, showsFamily } from "../lib/reflection.js";

const FAMILY = "first-try-category:procedure:justification";
const wrong = { capability: "procedure.submit", outcome: "refused", reason: "procedure refused: justification: steps.1.speedPercent = 40 cites scrubber.minimumSpeedElevated (40 percent), which the signed rules do not bound it by" };
const right = { capability: "procedure.submit", outcome: "completed", reason: null };

describe("the adaptations of a fork: entered, judged, kept or undone, remembered", () => {
    const root = mkdtempSync(path.join(tmpdir(), "adaptations-"));
    const workshop = path.join(root, "factory");
    const target = path.join(root, "words.json");
    after(() => rmSync(root, { recursive: true, force: true }));
    let n = 0;
    const task = (steps: object[], startedAt: string) => {
        n++;
        const dir = path.join(workshop, `t-2026-09-29-${String(n).padStart(4, "0")}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ topic: "procedure", startedAt, ended: "contract held", steps }));
    };
    const past = (s: number) => new Date(Date.now() - s * 1000).toISOString();
    const later = (s: number) => new Date(Date.now() + s * 1000).toISOString();
    const brief = "Stage 4 of 5, the procedure. Submit with procedure.submit.";

    it("says whether a task shows a family's mistake", () => {
        assert.equal(showsFamily({ topic: "procedure", ended: null, steps: [wrong] }, FAMILY), true);
        assert.equal(showsFamily({ topic: "procedure", ended: null, steps: [right] }, FAMILY), false);
        assert.equal(showsFamily({ topic: "graph", ended: null, steps: [wrong] }, FAMILY), null, "another topic: not judged on it");
    });

    it("an adaptation with no effect after its tasks is undone, the value before put back; being judged, it holds the family", () => {
        task([wrong], past(30));
        task([wrong], past(20));
        writeFileSync(target, JSON.stringify({ brief: { procedure: brief } }));
        const a = { target: "specs/procedure/words.json", ops: [{ op: "append" as const, pointer: "/brief/procedure", value: " Cite the fact the rules bound a step's speed by." }], reason: "the same mistake at the first try", evidence: ["p1"] };
        const entry = enterAdoption(workshop, a, [FAMILY], { brief: { procedure: brief } }, "t-reflection", null);
        assert.deepEqual([entry.n, entry.baseline], [1, { tasks: 2, withMistake: 2 }]);
        writeFileSync(target, JSON.stringify({ brief: { procedure: brief + " Cite the fact the rules bound a step's speed by." } }));
        // One task since: being judged, nothing decided, the family held.
        task([wrong], later(1));
        assert.deepEqual(underJudgement(workshop, 2).map((e) => e.n), [1]);
        assert.deepEqual(judge(workshop, 2), []);
        // Two tasks since, the mistake in both: no effect, undone.
        task([wrong], later(2));
        const ledger = readLedger(workshop);
        const [d] = judge(workshop, 2, ledger);
        assert.equal(d.decision, "undo");
        assert.match(d.entry.why ?? "", /^no effect: the mistake showed in 2 of the 2 task\(s\) of procedure since it was adopted, against 2 of 2 before/);
        const { left } = undo(d.entry, () => target);
        assert.deepEqual(left, []);
        assert.equal((JSON.parse(readFileSync(target, "utf8")) as { brief: { procedure: string } }).brief.procedure, brief, "the instruction as it was");
        d.entry.status = "undone";
        writeLedger(workshop, ledger);
        assert.deepEqual(underJudgement(workshop, 2), [], "undone: the family is free again");
        // Remembered: what was tried, and what it did.
        const [h] = historyOf(workshop, [FAMILY]);
        assert.deepEqual([h.n, h.status, h.changes[0].added], [1, "undone", " Cite the fact the rules bound a step's speed by."]);
        assert.match(h.why ?? "", /no effect/);
    });

    it("an adaptation after which the mistake shows less often is kept", () => {
        const entry = enterAdoption(workshop, { target: "specs/procedure/words.json", ops: [{ op: "append", pointer: "/brief/procedure", value: " A step's speed cites test.speedFloorPercent." }], reason: "precise", evidence: ["p2"] }, [FAMILY], { brief: { procedure: brief } }, null, null);
        assert.equal(entry.n, 2);
        // Before it: the two tasks already started (the test's later ones are still ahead of it).
        assert.deepEqual(mistakeRate(workshop, [FAMILY], "before", entry.at), { tasks: 2, withMistake: 2 });
        task([right], later(3));
        task([right], later(4));
        const kept = judge(workshop, 2).find((x) => x.entry.n === 2);
        assert.equal(kept?.decision, "keep");
        assert.match(kept?.entry.why ?? "", /^kept: the mistake showed in 2 of the 4 task\(s\) of procedure since it was adopted, against 2 of 2 before/);
    });

    it("an adaptation that says again what the instruction already says is refused", () => {
        const said = "Every safety constant cites a fact of a signed library document by its id, never by a value or a calculation.";
        assert.ok(repeated(`Stage 4. ${said}`, " Each safety constant must cite a fact of a signed library document by its id, never a value or a calculation."));
        assert.equal(repeated(`Stage 4. ${said}`, " A step's speed is bounded by test.speedFloorPercent in the signed rules, whatever other fact of the card has the same number."), null);
        const patterns = [{ id: "p1", kind: "first-try-category" as const, says: "", count: 2, source: "", target: "specs/procedure/words.json", detail: {} }];
        const problems = adaptationProblems({ target: "specs/procedure/words.json", ops: [{ op: "append", pointer: "/brief/procedure", value: " Every constant you set is justified in justifications, and the safety constants cite a fact of a library document a person signed." }], reason: "x", evidence: ["p1"] }, patterns, reflectionFormat()).problems;
        assert.match(problems.join(), /says again what it already says/);
    });
});
