/**
 * Episodes (2026-09-29, the memory audit): a task's submissions read from its trace as one unit, with who decided each
 * attempt and the contrast between what the guard refused and what it then accepted. The fixtures are two tasks Sonnet
 * 5.5 ran in the learning experiment (tests/fixtures/episodes), their manifests as written then, with no truncation
 * marked: the working memory reads it from their traces. No model.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { episodeOf, firstJudged, outcomeOf } from "../harness/core/episodes.js";
import { episodesOf, workingMemory } from "../lib/working-memory.js";
import { PROCEDURE_TOPIC } from "../harness/topics/procedure/index.js";
import { fromRepository } from "../lib/paths.js";

const FIXTURES = fromRepository("tests", "fixtures", "episodes");
const READING = { judges: PROCEDURE_TOPIC.judges ?? [], digest: PROCEDURE_TOPIC.digest };

describe("episodes, read from the traces of real tasks", () => {
    it("rebuilds each task's attempts: cut at the output limit, refused by the guard, accepted; the cut read from the trace", () => {
        const episodes = episodesOf(FIXTURES, "procedure", READING);
        assert.deepEqual(
            episodes.map((e) => e.attempts.map((a) => `${a.capability}:${a.outcome}`)),
            [
                ["procedure.submit:TRUNCATED", "procedure.revise:GUARD_REJECTED", "procedure.revise:ACCEPTED"],
                ["procedure.submit:TRUNCATED", "procedure.revise:GUARD_REJECTED", "procedure.revise:ACCEPTED"],
            ],
        );
        assert.deepEqual(episodes.map((e) => e.finalOutcome), ["ACCEPTED", "ACCEPTED"]);
        assert.equal(episodes[0].intent, "procedure: V_lab (Volume, m3)");
        assert.equal(firstJudged(episodes[0])?.outcome, "GUARD_REJECTED", "the first try is the first attempt a guard judged, not the cut one");
    });

    it("the contrast, found by the extraction alone: the composite reference REJECTED, the single signed fact ACCEPTED, on the same field", () => {
        for (const e of episodesOf(FIXTURES, "procedure", READING)) {
            assert.equal(e.contrasts.length, 1, e.taskId);
            const [c] = e.contrasts;
            assert.equal(c.path, "steps.2.speedPercent");
            assert.equal(c.kind, "justification");
            const x = String((c.rejected.argument as { reference?: string }).reference);
            const y = String((c.accepted?.argument as { reference?: string } | undefined)?.reference);
            assert.match(x, /;/, `X, refused: two facts joined in one reference (${x})`);
            assert.match(c.rejected.says, /is not a fact of the library/);
            assert.equal(y, "test.speedFloorPercent", "Y, accepted: one signed fact, by its id");
        }
    });

    it("who decided: the guard, the harness before it, the output limit, the capability run", () => {
        const step = (x: object) => ({ n: 1, capability: "procedure.submit", input: {}, outcome: "refused", reason: "r", ...x });
        assert.equal(outcomeOf(step({ judged: "refused" })), "GUARD_REJECTED");
        assert.equal(outcomeOf(step({})), "PRE_GUARD_REJECTED");
        assert.equal(outcomeOf(step({ truncated: true })), "TRUNCATED");
        assert.equal(outcomeOf(step({ judged: "accepted", outcome: "completed" })), "ACCEPTED");
        assert.equal(outcomeOf(step({ judged: "accepted", outcome: "error" })), "CAPABILITY_FAILED", "past the guard, the run failed");
        // A task that never submitted, and the window of the working memory.
        const none = episodeOf({ taskId: "t", topic: "procedure", intent: "procedure: ?", steps: [{ n: 1, capability: "library.read", input: {}, outcome: "refused", reason: "same input" }] }, READING.judges, READING.digest);
        assert.equal(none.finalOutcome, "NO_ATTEMPT");
        assert.deepEqual(workingMemory(FIXTURES, "procedure", READING, 1).map((e) => e.taskId), ["t-2026-09-29-0102"]);
    });
});
