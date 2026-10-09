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
import { readFileSync } from "node:fs";
import { fromRoot } from "../lib/paths.js";
import assert from "node:assert/strict";
import { loadPlaybook, Playbook, playbookProblems, type Evidence, type PlaybookFile } from "../harness/core/conduct.js";
import { loadWords, missingWords } from "../harness/core/words.js";
import { RECOVERY_PLAYBOOK } from "../slots/scenario/commissioning.js";
import { PLAYBOOK, WORDS } from "../harness/topics/procedure/index.js";

const PROOFS = ["procedureAccepted", "installationRead", "methodRead", "planPhase", "previous", "analysisAccepted", "planDeclared", "signedNorm"] as const;

const everyEvent = (): Evidence[] =>
    Array.from({ length: 1 << PROOFS.length }, (_, n) => Object.fromEntries(PROOFS.map((p, i) => [p, Boolean(n & (1 << i))])) as Evidence);

/** The stage as the code chose it until 2026-09-29; since 2026-10-09 a signed norm read is the plan (no plan to declare). */
function stageByCode(e: Evidence): string {
    if (e.procedureAccepted) return "hand-over";
    if (!e.installationRead) return "situation";
    if (!e.methodRead) return "method";
    if (e.planPhase && !e.signedNorm) return "plan";
    if (e.previous && !e.analysisAccepted) return "analysis";
    return "procedure";
}

/** The conduct refusals as the guard made them until 2026-09-29, by capability; since 2026-10-09, no plan, no procedure (a plan declared, or a signed norm read). */
function refusalsByCode(e: Evidence, capability: string): string[] {
    if (capability === "task.plan") return [...(e.installationRead ? [] : ["plan-needs-installation"]), ...(e.methodRead ? [] : ["plan-needs-method"])];
    if (capability !== "procedure.submit" && capability !== "procedure.revise") return [];
    const noPlan = !e.planDeclared && !e.signedNorm ? ["procedure-needs-plan"] : [];
    if (e.previous && !e.analysisAccepted && !e.procedureAccepted) return [...noPlan, "analysis-first"];
    if (e.procedureAccepted) return [...noPlan, "already-accepted"];
    return noPlan;
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

describe("the commissioning's process playbook: what follows a test", () => {
    const RECOVERY = loadPlaybook(RECOVERY_PLAYBOOK);
    const events = (): Evidence[] => {
        const out: Evidence[] = [];
        for (let n = 0; n < 8; n++) for (let aborts = 0; aborts <= 4; aborts++) out.push({ aborted: Boolean(n & 1), answered: Boolean(n & 2), rewrite: Boolean(n & 4), aborts });
        return out;
    };
    /** What the scenario player did until 2026-09-29, as an if-chain: at most two new tests after an abort, on the commander's word only. */
    const byCode = (e: Evidence): string => {
        if (!e.aborted) return "report";
        if ((e.aborts as number) >= 3) return "give-up";
        if (!e.answered) return "ask";
        if (!e.rewrite) return "stopped";
        return "rewrite-test";
    };

    it("does what the player did, for every answer and every count of aborts", () => {
        for (const e of events()) {
            const { stage, refusing } = RECOVERY.evaluate(e);
            assert.equal(stage.id, byCode(e), JSON.stringify(e));
            assert.equal(refusing.some((g) => g.capabilities.includes("station.commissioning_reopen")), !e.rewrite, `the reopen waits for the commander's word ${JSON.stringify(e)}`);
        }
    });

    it("names what each stage does, and its bound says why", () => {
        assert.deepEqual(Object.fromEntries(RECOVERY.stages.map((s) => [s.id, s.action])), { report: "go-on", "give-up": "end", ask: "ask", stopped: "end", "rewrite-test": "reopen" });
        assert.equal(RECOVERY.stages.find((s) => s.id === "ask")?.bag.kind, "recover", "a question no standing order answers");
        assert.deepEqual(missingWords(loadWords("specs/commissioning/words.json"), RECOVERY.words()), []);
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

    it("a bound that does not say why", () => {
        const doc = base();
        doc.nodes.push({ id: "b", type: "conduct.bound", bag: { count: "n", atLeast: 3 } });
        assert.throws(() => new Playbook("t", doc), /bound "b" names its count, its bound and why/);
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

describe("a playbook proposed, checked whole before anyone reads it (2026-09-29)", () => {
    const recovery = (): PlaybookFile => JSON.parse(readFileSync(fromRoot(...RECOVERY_PLAYBOOK.split("/")), "utf8")) as PlaybookFile;
    const words = loadWords("specs/commissioning/words.json");
    const expect = { words, actions: ["go-on", "ask", "end", "reopen"], capabilities: ["station.commissioning_reopen"] };

    it("the repository's recovery playbook passes every event, its words, its actions and its gates", () => {
        assert.deepEqual(playbookProblems(recovery(), "recovery", expect), []);
    });

    it("an event with two stages active, a word its file does not hold, an action the process does not know, a case not held", () => {
        const doc = recovery();
        // "stopped" entered from the start rather than after the question: it is active beside another stage whenever no new test was asked.
        doc.links = doc.links.map((l) => (l.to === "stopped.entered" ? { from: "start.next", to: "stopped.entered" } : l));
        doc.nodes = doc.nodes.map((n) => (n.id === "ask" ? { ...n, bag: { ...n.bag, says: "recover.nowhere", action: "improvise" } } : n));
        const problems = playbookProblems(doc, "broken", { ...expect, cases: [{ evidence: { aborted: false, answered: false, rewrite: false, aborts: 0 }, stage: "ask" }] });
        assert.ok(problems.some((x) => /2 stages are active \(report, stopped\), not one/.test(x)), problems.join("\n"));
        assert.ok(problems.some((x) => /"recover\.nowhere" is not a key of specs\/commissioning\/words\.json/.test(x)));
        assert.ok(problems.some((x) => /stage "ask" does "improvise"/.test(x)));
        assert.ok(problems.some((x) => /^case 1: /.test(x)), "the case is not held: at that event no single stage answers");
    });
});
