/**
 * The memory's evidence and its gate (2026-09-29, the memory audit, lib/memory.ts), on the episodes of two tasks Sonnet 5.5
 * ran in the learning experiment (tests/fixtures/episodes): each refused at its first judged attempt for a composite
 * reference, then accepted with the single signed fact. No model, no server.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { episodesOf } from "../lib/working-memory.js";
import { enterCandidate, episodeView, evidenceFor, memoryConfig, memoryProblems, promote, readyForTrial, relevantTo, type Remembered } from "../lib/memory.js";
import { readLedger } from "../lib/adaptations.js";
import type { Pattern } from "../lib/reflection.js";
import { PROCEDURE_TOPIC } from "../harness/topics/procedure/index.js";
import { fromRepository } from "../lib/paths.js";

const EPISODES = episodesOf(fromRepository("tests", "fixtures", "episodes"), "procedure", { judges: PROCEDURE_TOPIC.judges ?? [], digest: PROCEDURE_TOPIC.digest });
const SHAPE = "justification: *: … is not a fact of the library";
const FAMILY = `first-try-shape:procedure:${createHash("sha256").update(SHAPE).digest("hex").slice(0, 12)}`;
const PATTERN: Pattern = { id: "first-try-shape:procedure:t-2026-09-29-0102:x", kind: "first-try-shape", says: "", count: 2, source: "", target: null, detail: { topic: "procedure", shape: SHAPE }, family: FAMILY };
const good = (over: Partial<Remembered["memory"]> = {}): Remembered => ({
    memory: { kind: "constraint", rule: "A safety constant's reference is the one signed fact that bounds it, by its id alone, never joined to another fact.", appliesTo: ["procedure.revise"], evidence: { failures: EPISODES.map((e) => e.id), successes: EPISODES.map((e) => e.id) }, ...over },
    reason: "refused twice for a composite reference, accepted twice with the single fact",
    evidence: [PATTERN.id],
});

describe("an episode as a model reads it", () => {
    it("another task's comes as a lesson marked past, its points by path, never the words of its refusals (run xykl, 2026-10-10)", () => {
        const e = EPISODES[0];
        const refused = e.attempts.find((a) => a.outcome === "GUARD_REJECTED");
        assert.ok(refused && refused.problems.length, "the fixture holds a refusal with its problems");
        const past = episodeView(e) as unknown as { pastTask: string; lesson: { refusedOn: string[] }; attempts?: unknown };
        assert.equal(past.pastTask, e.taskId);
        assert.equal(past.attempts, undefined, "no attempt by attempt: a lesson");
        assert.ok(past.lesson.refusedOn.length && past.lesson.refusedOn.every((p) => / at |^[a-z]+$/.test(p)), "the points by kind and path");
        for (const p of refused.problems) assert.ok(!JSON.stringify(past).includes(p.says), "the words of a refusal are not repeated");
    });

    it("this task's says its attempts and the points they were refused on, the words left to lastRefusal", () => {
        const e = EPISODES[0];
        const now = episodeView(e, true) as unknown as { current: boolean; attempts: Array<{ call: string; outcome: string; refusedOn?: string[] }> };
        assert.equal(now.current, true);
        const refused = now.attempts.find((a) => a.outcome === "GUARD_REJECTED");
        assert.ok(refused?.refusedOn?.length && refused.refusedOn.every((p) => p.length < 160));
    });
});

describe("the memory's evidence, from real episodes", () => {
    it("the failures of a form of mistake and the successes that answered it, counted from the working memory", () => {
        assert.deepEqual(evidenceFor(EPISODES, [FAMILY]), { failures: EPISODES.map((e) => e.id), successes: EPISODES.map((e) => e.id) });
        assert.deepEqual(evidenceFor(EPISODES, ["first-try-shape:procedure:000000000000"]), { failures: [], successes: [] }, "another form: none");
        const cfg = memoryConfig();
        assert.equal(readyForTrial({ failures: ["a", "b"], successes: ["a"] }, cfg), true);
        assert.equal(readyForTrial({ failures: ["a", "b"], successes: [] }, cfg), false, "failures alone never make a trial: a success must have answered them");
        assert.equal(readyForTrial({ failures: ["a"], successes: ["a"] }, cfg), false);
        // The repository's settings since 2026-10-10: the session only (the long-term memory was corrupted); a fork turns either on again.
        assert.deepEqual([cfg.workingMemory.previousTasks, cfg.longTerm.read], [false, false]);
    });

    it("an entry proposed is checked: its episodes, what it applies to, no fact's value, nothing said again", () => {
        assert.deepEqual(memoryProblems(good(), [PATTERN], EPISODES, []), []);
        assert.match(memoryProblems(good({ appliesTo: ["procedure.analyse"] }), [PATTERN], EPISODES, []).join(), /"procedure.analyse" is no capability the episodes attempted/);
        assert.match(memoryProblems(good({ evidence: { failures: ["t-0#procedure"], successes: [] } }), [PATTERN], EPISODES, []).join(), /"t-0#procedure" is not an episode of the working memory/);
        assert.match(memoryProblems(good({ rule: "A step's speed cites test.speedFloorPercent (at least 30 percent) and nothing else." }), [PATTERN], EPISODES, []).join(), /it says the value of test\.speedFloorPercent/);
        const held = [{ id: "m", kind: "constraint" as const, rule: good().memory.rule, appliesTo: ["procedure.revise"], status: "trial" as const, confidence: null, evidence: { failures: [], successes: [] }, judgedOn: [], since: "", ledger: 1 }];
        assert.match(memoryProblems(good(), [PATTERN], EPISODES, held).join(), /says again what the memory holds already/);
        assert.match(memoryProblems({ ...good(), evidence: ["nobody"] }, [PATTERN], EPISODES, []).join(), /"nobody" is not a pattern of this task/);
    });

    it("a candidate the working memory supports goes to trial, in the domain's file; read only where its capability is called", () => {
        const workshop = mkdtempSync(path.join(tmpdir(), "memory-"));
        try {
            const entry = enterCandidate(workshop, "procedure", good(), [FAMILY], EPISODES, "t-reflection");
            assert.equal(entry.status, "candidate");
            assert.equal(readLedger(workshop)[0].memory?.rule, good().memory.rule);
            // Short of evidence (no episode yet): it stays a candidate.
            assert.deepEqual(promote(workshop, () => []), []);
            assert.equal(readLedger(workshop)[0].status, "candidate");
            // The working memory holds two failures answered by two successes: in trial.
            assert.equal(promote(workshop, () => EPISODES).length, 1);
            const file = JSON.parse(readFileSync(path.join(workshop, "memory", "procedure.json"), "utf8")) as { domain: string; entries: Array<{ status: string; evidence: { failures: string[]; successes: string[] } }> };
            assert.equal(file.domain, "procedure_authoring");
            assert.deepEqual([file.entries[0].status, file.entries[0].evidence.failures.length, file.entries[0].evidence.successes.length], ["trial", 2, 2]);
            assert.equal(relevantTo("Stage 4 of 5, the procedure. ... send only what these reasons name with procedure.revise", good().memory.appliesTo), true);
            assert.equal(relevantTo("Stage 1 of 5, the situation.", good().memory.appliesTo), false);
        } finally {
            rmSync(workshop, { recursive: true, force: true });
        }
    });
});
