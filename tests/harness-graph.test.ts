/**
 * The harness's graph (2026-09-30, docs/evaluateur.fr.md, E0): three tasks of a workshop, the first two under one fingerprint, the
 * third after the description of procedure.submit changed; each refused for a composite reference, then accepted with the single
 * fact. The graph is built from their manifests alone, typed by specs/harness/graph.json. No model, no server.
 *
 *     node --test dist/tests/
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { H, HarnessGraph } from "../lib/harness-graph.js";
import { PROCEDURE_TOPIC } from "../harness/topics/procedure/index.js";

const workshop = mkdtempSync(path.join(tmpdir(), "harness-graph-"));
const READINGS = { procedure: { judges: PROCEDURE_TOPIC.judges ?? [], digest: PROCEDURE_TOPIC.digest } };
const refusal = 'procedure refused: justification: steps.2.speedPercent: "test.speedFloorPercent; scrubber.effectiveFlowAtFull 1 m3/min" is not a fact of the library (a safety constant cites a fact by its id, as library.facts lists them); the signed rules bound it by test.speedFloorPercent = 30 percent (at or above it): cite it (source "library", reference "test.speedFloorPercent")';

function task(id: string, at: string, submitSha: string): void {
    mkdirSync(path.join(workshop, id), { recursive: true });
    const manifest = {
        taskId: id,
        topic: "procedure",
        state: "proposed",
        startedAt: at,
        ended: "contract held",
        provider: { name: "reasoner:claude", model: "claude-sonnet-5-5", family: "claude" },
        tools: { sha256: "old", contract: `contract-${submitSha}`, list: [{ id: "library.read", sha256: "read-1" }, { id: "procedure.submit", sha256: submitSha }] },
        words: { file: "specs/procedure/words.json", sha256: "words-1" },
        prompt: { file: "specs/procedure/prompt.md", sha256: "prompt-1" },
        context: { repository: "abc1234", fork: null },
        steps: [
            { n: 1, capability: "library.read", input: {}, outcome: "completed", reason: null, tokens: { prompt: 1000, completion: 100 } },
            { n: 2, capability: "procedure.submit", input: { justifications: [{ constant: "steps.2.speedPercent", value: 100, source: "library", reference: "test.speedFloorPercent; scrubber.effectiveFlowAtFull 1 m3/min" }] }, outcome: "refused", judged: "refused", reason: refusal, tokens: { prompt: 5000, completion: 4000 } },
            { n: 3, capability: "procedure.revise", input: { changes: {}, justifications: [{ constant: "steps.2.speedPercent", value: 100, source: "library", reference: "test.speedFloorPercent" }] }, outcome: "completed", judged: "accepted", reason: null, tokens: { prompt: 6000, completion: 300 } },
        ],
    };
    writeFileSync(path.join(workshop, id, "manifest.json"), JSON.stringify(manifest));
}
task("t-2026-09-30-0001", "2026-09-30T10:00:00Z", "submit-1");
task("t-2026-09-30-0002", "2026-09-30T10:10:00Z", "submit-1");
task("t-2026-09-30-0003", "2026-09-30T11:00:00Z", "submit-2");
// The store holds the second version of procedure.submit as the model read it.
mkdirSync(path.join(workshop, "_statements"), { recursive: true });
writeFileSync(path.join(workshop, "_statements", "submit-2.json"), JSON.stringify({ kind: "tool", id: "procedure.submit", description: "Submit the procedure (a JSON Pointer: /steps/0/reason)", inputSchema: {} }));

after(() => rmSync(workshop, { recursive: true, force: true }));

describe("the harness's graph, rebuilt from a workshop's manifests", () => {
    const g = new HarnessGraph(workshop, READINGS);

    it("the tasks, their episodes and attempts, the model they ran by", () => {
        assert.equal(g.nodesOf(H.task).length, 3);
        assert.equal(g.nodesOf(H.episode).length, 3);
        assert.deepEqual(g.nodesOf(H.attempt).map((a) => `${a.bag?.capability}:${a.bag?.outcome}`).sort(), ["procedure.revise:ACCEPTED", "procedure.revise:ACCEPTED", "procedure.revise:ACCEPTED", "procedure.submit:GUARD_REJECTED", "procedure.submit:GUARD_REJECTED", "procedure.submit:GUARD_REJECTED"]);
        const model = g.get("model:claude-sonnet-5-5")!;
        assert.equal(g.in(model, H.ranBy).length, 3);
        assert.deepEqual(g.get("task:t-2026-09-30-0001")?.bag, { taskId: "t-2026-09-30-0001", topic: "procedure", state: "proposed", startedAt: "2026-09-30T10:00:00Z", ended: "contract held", steps: 3, inputTokens: 12000, outputTokens: 4400 });
    });

    it("one form of failure, refused three times and answered three times by the same correction", () => {
        const [form] = g.nodesOf(H.form);
        assert.equal(form.bag?.shape, "justification: *: … is not a fact of the library");
        assert.equal(g.in(form, H.refusedFor).length, 3);
        const answers = g.in(form, H.answers).map((l) => l.oini);
        assert.equal(answers.length, 3);
        assert.deepEqual(answers.map((c) => (c?.bag as { accepted: { reference: string } }).accepted.reference), ["test.speedFloorPercent", "test.speedFloorPercent", "test.speedFloorPercent"]);
    });

    it("two fingerprints, the second after the first, and the text it changed: the description of procedure.submit, its version before named, its text kept", () => {
        const fps = g.nodesOf(H.fingerprint);
        assert.equal(fps.length, 2);
        const later = fps.find((f) => g.in(f, H.ranUnder).length === 1)!;
        const earlier = fps.find((f) => g.in(f, H.ranUnder).length === 2)!;
        assert.equal(g.out(later, H.after)[0]?.ofin, earlier);
        const changed = g.out(later, H.changed);
        assert.equal(changed.length, 1);
        assert.deepEqual(changed[0].bag, { slot: "tool:procedure.submit", was: "submit-1" });
        assert.equal((changed[0].ofin?.bag as { stored?: string } | undefined)?.stored, "_statements/submit-2.json");
        assert.equal(g.out(earlier, H.changed).length, 0, "the first has nothing before it");
        // What each task read: the two tools, the words, the prompt.
        assert.equal(g.out(g.get("task:t-2026-09-30-0003")!, H.read).length, 4);
    });

    it("derived only: the same sources give the same graph", () => {
        assert.deepEqual(new HarnessGraph(workshop, READINGS).summary(), g.summary());
    });
});
