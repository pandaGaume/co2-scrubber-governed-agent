/**
 * Playbooks (2026-09-29, docs/comportement-en-donnees.fr.md, section 2): the
 * procedure factory's conduct as an executable graph the core's runtime runs,
 * checked against the conduct it replaces, event by event.
 *
 * The reference below is the order the code held until then (briefOf and the
 * guard's conduct refusals, as if-chains): for every combination of the
 * proofs, the playbook is at the same stage and refuses the same
 * capabilities. The other tests (commissioning, recovery through the broker)
 * run the factory itself on it, unchanged.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Playbook, type Evidence, type PlaybookFile } from "../harness/core/conduct.js";
import { missingWords } from "../harness/core/words.js";
import { PLAYBOOK, WORDS } from "../harness/topics/procedure/index.js";

const PROOFS = ["procedureAccepted", "installationRead", "methodRead", "planPhase", "previous", "analysisAccepted"] as const;

const everyEvent = (): Evidence[] =>
    Array.from({ length: 1 << PROOFS.length }, (_, n) => Object.fromEntries(PROOFS.map((p, i) => [p, Boolean(n & (1 << i))])) as Evidence);

/** The stage as the code chose it until 2026-09-29. */
function stageByCode(e: Evidence): string {
    if (e.procedureAccepted) return "hand-over";
    if (!e.installationRead) return "situation";
    if (!e.methodRead) return "method";
    if (e.planPhase) return "plan";
    if (e.previous && !e.analysisAccepted) return "analysis";
    return "procedure";
}

/** The conduct refusals as the guard made them until 2026-09-29, by capability. */
function refusalsByCode(e: Evidence, capability: string): string[] {
    if (capability === "task.plan") return [...(e.installationRead ? [] : ["plan-needs-installation"]), ...(e.methodRead ? [] : ["plan-needs-method"])];
    if (capability !== "procedure.submit" && capability !== "procedure.revise") return [];
    if (e.previous && !e.analysisAccepted && !e.procedureAccepted) return ["analysis-first"];
    if (e.procedureAccepted) return ["already-accepted"];
    return [];
}

describe("the procedure factory's playbook", () => {
    it("is at the stage the code chose, for every combination of the proofs, and at one only", () => {
        for (const e of everyEvent()) assert.equal(PLAYBOOK.evaluate(e).stage.id, stageByCode(e), JSON.stringify(e));
    });

    it("refuses what the guard refused, capability by capability, in the same order", () => {
        for (const e of everyEvent())
            for (const capability of ["task.plan", "procedure.submit", "procedure.revise", "procedure.analyse", "library.read"])
                assert.deepEqual(
                    PLAYBOOK.evaluate(e)
                        .refusing.filter((g) => g.capabilities.includes(capability))
                        .map((g) => g.id),
                    refusalsByCode(e, capability),
                    `${capability} ${JSON.stringify(e)}`,
                );
    });

    it("says only words the factory's file holds", () => {
        assert.deepEqual(missingWords(WORDS, PLAYBOOK.words()), []);
    });

    it("is fast: the mechanism that runs the harness, one pass per event", () => {
        const events = everyEvent();
        const n = 2000;
        const t0 = performance.now();
        for (let i = 0; i < n; i++) PLAYBOOK.evaluate(events[i % events.length]);
        const perEvent = (performance.now() - t0) / n;
        assert.ok(perEvent < 1, `${perEvent.toFixed(3)} ms per event`);
    });
});

describe("a playbook the runtime refuses to run", () => {
    const base = (): PlaybookFile => ({
        nodes: [
            { id: "start", type: "conduct.start" },
            { id: "done", type: "conduct.evidence", bag: { evidence: "done" } },
            { id: "work", type: "conduct.stage", bag: { says: "work" } },
        ],
        links: [{ from: "start.next", to: "work.entered" }],
    });

    it("runs the smallest one", () => {
        assert.equal(new Playbook("t", base()).evaluate({}).stage.id, "work");
    });

    it("a node of a type that is no conduct node", () => {
        const doc = base();
        doc.nodes.push({ id: "x", type: "physics.quantity" });
        assert.throws(() => new Playbook("t", doc), /"x" has the type "physics.quantity", which is no conduct node/);
    });

    it("two entries", () => {
        const doc = base();
        doc.nodes.push({ id: "start2", type: "conduct.start" });
        assert.throws(() => new Playbook("t", doc), /one conduct.start/);
    });

    it("an input fed twice, or a stage that says nothing", () => {
        const twice = base();
        twice.links.push({ from: "start.next", to: "work.entered" });
        assert.throws(() => new Playbook("t", twice), /"work.entered" is fed by 2 channels/);
        const mute = base();
        mute.nodes[2].bag = {};
        assert.throws(() => new Playbook("t", mute), /"work" says nothing/);
    });

    it("an event where no stage is active: said, never a brief chosen by default", () => {
        const doc = base();
        doc.links.push({ from: "done.value", to: "work.passes" });
        const playbook = new Playbook("t", doc);
        assert.equal(playbook.evaluate({ done: false }).stage.id, "work");
        assert.throws(() => playbook.evaluate({ done: true }), /t: 0 stages are active \(none\), not one/);
    });
});
