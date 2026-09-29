/**
 * The reflection (2026-09-29, P4 of docs/comportement-en-donnees.fr.md): the patterns of the traces, an adaptation of
 * the conduct checked before anything adopts it, and the loop in a fork: the agents at work, the traces they leave,
 * Mother reading them, the reflection factory proposing, the station adopting in the fork, the evolution in its
 * history, the repository's conduct untouched.
 *
 * The modules that read where the data is are imported once FORK_DIR is set (node --test runs each file in its own
 * process).
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { adaptationProblems, applyPatch, globMatches, observe, placesOf, reflectionFormat, stageKeysOf, type Pattern } from "../lib/reflection.js";
import { createFork, forkHistory, forkPath } from "../lib/fork.js";
import { fromRepository } from "../lib/paths.js";
import { Broker } from "../harness/lib/broker.js";

const PORT = 3171;
const RECOVERY = "specs/commissioning/recovery.playbook.json";

describe("the patterns of the traces, and an adaptation checked before anything adopts it", () => {
    const workshop = mkdtempSync(path.join(tmpdir(), "reflection-"));
    after(() => rmSync(workshop, { recursive: true, force: true }));

    it("reads a cause stopping tests again, a factory refused on the same points again, a task stuck", () => {
        mkdirSync(path.join(workshop, "runs"), { recursive: true });
        const cause = (reason: string) => ({ condition: "vitals", reason, step: 1, at: "2026-09-29T10:00:00Z" });
        writeFileSync(path.join(workshop, "runs", "2026-09-29-R001.json"), JSON.stringify({ id: "R001", startedAt: "2026-09-29T10:00:00Z", conduct: { playbook: RECOVERY, causes: [cause("FE-1: critical health alarm: chest pain"), cause("FE-1: critical health alarm: chest pain again")] } }));
        writeFileSync(path.join(workshop, "runs", "2026-09-29-R002.json"), JSON.stringify({ id: "R002", startedAt: "2026-09-29T11:00:00Z", conduct: { playbook: RECOVERY, causes: [cause("once")] } }));
        mkdirSync(path.join(workshop, "t-2026-09-29-0001"), { recursive: true });
        const refused = { capability: "procedure.submit", outcome: "refused", reason: "procedure refused: floor: the procedure sets its own minimum speed at 0 %, below the floor" };
        writeFileSync(path.join(workshop, "t-2026-09-29-0001", "manifest.json"), JSON.stringify({ topic: "procedure", ended: "STUCK: procedure.submit refused 3 times in a row on the same point(s)", steps: [{ capability: "library.read", outcome: "completed", reason: null }, refused, refused, refused] }));
        const patterns = observe(workshop, { repeatAt: 2 });
        assert.deepEqual(patterns.map((p) => [p.kind, p.count, p.target]), [
            ["abort-repeat", 2, RECOVERY],
            ["refusal-streak", 3, "specs/procedure/words.json"],
            ["stuck", 1, "specs/procedure/words.json"],
        ]);
        assert.equal(patterns[0].id, "abort-repeat:2026-09-29-R001:vitals");
        assert.match(patterns[0].says, /the condition vitals stopped 2 tests of the same commissioning \(run R001\)/);
    });

    it("reads the same mistake at the first try of several tasks, what a model corrects within a task and makes again at the next", () => {
        const shop = mkdtempSync(path.join(tmpdir(), "reflection-first-"));
        try {
            const wrong = { capability: "procedure.submit", outcome: "refused", reason: "procedure refused: justification: steps.1.speedPercent = 40 cites scrubber.minimumSpeedElevated (40 percent), which the signed rules do not bound it by" };
            const other = { capability: "procedure.submit", outcome: "refused", reason: "procedure refused: floor: steps.1.speedPercent = 0 is not above 0" };
            const task = (id: string, first: object) => {
                mkdirSync(path.join(shop, id), { recursive: true });
                writeFileSync(path.join(shop, id, "manifest.json"), JSON.stringify({ topic: "procedure", ended: "contract held", steps: [{ capability: "library.read", outcome: "completed", reason: null }, first, { capability: "procedure.revise", outcome: "completed", reason: null }] }));
            };
            task("t-2026-09-29-0001", wrong);
            task("t-2026-09-29-0002", other);
            assert.deepEqual(observe(shop, { repeatAt: 2 }).filter((p) => p.kind === "first-try-repeat"), [], "two tasks, two different first mistakes: no pattern");
            task("t-2026-09-29-0003", { ...wrong, reason: wrong.reason.replace("40", "45") });
            const [p] = observe(shop, { repeatAt: 2 }).filter((x) => x.kind === "first-try-repeat");
            assert.deepEqual([p?.count, p?.target, (p?.detail as { tasks: string[] }).tasks], [2, "specs/procedure/words.json", ["t-2026-09-29-0001", "t-2026-09-29-0003"]]);
            assert.ok(p.source.includes("t-2026-09-29-0003"), "a reflection focused on the last task reads it");
            // The category: the same kind of refusal at the first try, on another field (the replays' finding): justification twice, floor once.
            task("t-2026-09-29-0004", { ...wrong, reason: "procedure refused: justification: limits.co2MaxPpm: \"commissioning-test-safety\" is not a fact of the library" });
            const categories = observe(shop, { repeatAt: 2 }).filter((x) => x.kind === "first-try-category");
            assert.deepEqual(categories.map((c) => [c.count, (c.detail as { kind: string }).kind]), [[3, "justification"]]);
            assert.match(categories[0].says, /the first submission of 3 tasks \(procedure\) was refused for justification/);
            assert.deepEqual((categories[0].detail as { examples: Array<{ task: string }> }).examples.map((e) => e.task), ["t-2026-09-29-0001", "t-2026-09-29-0003", "t-2026-09-29-0004"]);
        } finally {
            rmSync(shop, { recursive: true, force: true });
        }
    });

    it("says where a factory reads what it is told about a capability: the brief of the stage that calls it, the tool's description", () => {
        const words = JSON.parse(readFileSync(fromRepository("specs", "procedure", "words.json"), "utf8")) as Record<string, unknown>;
        const places = placesOf(words, "procedure.submit", stageKeysOf("procedure"));
        assert.deepEqual(places.map((p) => p.key), ["brief.procedure", "capabilities.submit"]);
        assert.match(places[0].read, /reads it at every step of that stage, before it submits/);
    });

    it("patches by JSON Pointer, a list's element picked by its id", () => {
        const doc = { nodes: [{ id: "a", bag: { n: 1 } }, { id: "b", bag: { n: 2 } }] };
        assert.deepEqual(applyPatch(doc, [{ op: "replace", pointer: "/nodes/[id=b]/bag/n", value: 5 }]), { nodes: [{ id: "a", bag: { n: 1 } }, { id: "b", bag: { n: 5 } }] });
        assert.deepEqual(applyPatch(doc, [{ op: "remove", pointer: "/nodes/0" }, { op: "add", pointer: "/nodes/-", value: { id: "c" } }]), { nodes: [{ id: "b", bag: { n: 2 } }, { id: "c" }] });
        assert.throws(() => applyPatch(doc, [{ op: "replace", pointer: "/nodes/[id=z]/bag/n", value: 1 }]), /no element with the id "z"/);
        assert.equal(doc.nodes[1].bag.n, 2, "the document itself is untouched");
        assert.ok(globMatches("specs/*/*.playbook.json", RECOVERY));
        assert.ok(!globMatches("specs/*/words.json", "specs/a/b/words.json"));
        assert.ok(globMatches("docs/library/**", "docs/library/signatures/x.json"));
    });

    it("refuses what never adapts, whatever the pattern; accepts the smallest change that still runs, and nothing that breaks its reader", () => {
        const format = reflectionFormat();
        const patterns = [{ id: "p1", kind: "abort-repeat", says: "", count: 2, source: "", target: RECOVERY, detail: {} }] as Pattern[];
        const bound = (value: unknown) => ({ target: RECOVERY, ops: [{ op: "replace", pointer: "/nodes/[id=exhausted]/bag/atLeast", value }], reason: "two aborts on one cause", evidence: ["p1"] });
        for (const [target, why] of [
            ["specs/station/roles.json", /who may decide/],
            ["docs/library/commissioning-test-safety.rules.json", /never adapts/],
            ["specs/reflection/format.json", /widens its own freedom/],
            ["graphs/habitat.template.json", /not a file an adaptation may change/],
        ] as const)
            assert.match(adaptationProblems({ ...bound(2), target }, patterns, format).problems.join(), why, target);
        assert.deepEqual(adaptationProblems(bound(2), patterns, format).problems, [], "the bound brought to two: a playbook that still runs");
        assert.match(adaptationProblems({ ...bound(2), evidence: ["nobody"] }, patterns, format).problems.join(), /"nobody" is not a pattern of the traces/);
        assert.match(adaptationProblems(bound(3), patterns, format).problems.join(), /the patch changes nothing/);
        const unlinked = { target: RECOVERY, ops: [{ op: "remove", pointer: "/links/0" }], reason: "x", evidence: ["p1"] };
        assert.match(adaptationProblems(unlinked, patterns, format).problems.join(), /is fed by 0 channels, not one/);
        // A sentence appended to an instruction; the one the reflection wrote in the replays, copying the signed facts' values, refused.
        const procedureWords = { target: "specs/procedure/words.json", reason: "x", evidence: ["p1"] };
        const cite = " A safety constant cites the fact the signed rules bound it by: a step's speed, test.speedFloorPercent.";
        assert.deepEqual(adaptationProblems({ ...procedureWords, ops: [{ op: "append", pointer: "/capabilities/submit", value: cite }] }, patterns, format).problems, []);
        const copied = " Every safety constant must cite a fact by its exact fact id: test.speedFloorPercent (at least 30 percent), test.co2AbortCeilingPpm (at most 3200 ppm).";
        const refusedCopy = adaptationProblems({ ...procedureWords, ops: [{ op: "append", pointer: "/capabilities/submit", value: copied }] }, patterns, format).problems.join(" | ");
        assert.match(refusedCopy, /"capabilities.submit" writes test.speedFloorPercent = 30 percent, the value of a fact of the library: cite test.speedFloorPercent by its id, never its value/);
        assert.match(refusedCopy, /test.co2AbortCeilingPpm = 3200 ppm/);
        assert.match(adaptationProblems({ ...procedureWords, ops: [{ op: "append", pointer: "/capabilities/submit", value: 5 }] }, patterns, format).problems.join(), /append adds text to a text/);
        const words = { target: "specs/commissioning/words.json", reason: "x", evidence: ["p1"] };
        assert.match(adaptationProblems({ ...words, ops: [{ op: "remove", pointer: "/recover/ask" }] }, patterns, format).problems.join(), /no field "ask"|the key "recover.ask" is gone/);
        assert.match(adaptationProblems({ ...words, ops: [{ op: "replace", pointer: "/recover/stopped", value: "stopped" }] }, patterns, format).problems.join(), /"recover.stopped" has the holes \{\}, not the \{why\}/);
    });
});

describe("the reflection in a fork: the agents at work, Mother reading their traces, the adaptation adopted there", () => {
    const forks = mkdtempSync(path.join(tmpdir(), "forks-reflection-"));
    before(() => {
        process.env.FORKS_DIR = forks;
    });
    after(() => {
        delete process.env.FORKS_DIR;
        delete process.env.FORK_DIR;
        rmSync(forks, { recursive: true, force: true });
    });

    it("a cause stops two tests; Mother reads it; the reflection brings the bound to two; the station adopts it in the fork, with a snapshot; the repository's playbook untouched", async () => {
        const id = "learn";
        createFork(id);
        const dir = forkPath(id);
        const repositoryPlaybook = readFileSync(fromRepository(...RECOVERY.split("/")), "utf8");
        process.env.FORK_DIR = dir;
        process.env.SPEECH_PROVIDER = "silent";
        process.env.STATION_VOICE = "off";
        process.env.BIOMED_PROVIDER = "simulated";
        process.env.SCENARIO_SECONDS_PER_MINUTE = "0";
        process.env.STATION_REMIND_SECONDS = "0";
        process.env.CAD_MCP_URL = "http://127.0.0.1:1/mcp";
        const { startAll } = await import("../slots/run-all.js");
        const started = await startAll(PORT, () => undefined, "ignore");
        const operator = new Broker(started.broker.httpBase, { name: "reflection-test", version: "0", locale: "en" });
        try {
            const ok = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
                const x = await operator.call(slot, tool, args);
                assert.ok(x.ok, `${slot}.${tool}: ${x.error}`);
                return x.output as T;
            };
            const read = async <T>(slot: string, uri: string): Promise<T> => JSON.parse((await (await operator.session(slot)).request<{ contents: Array<{ text: string }> }>("resources/read", { uri })).contents[0].text) as T;
            type Run = { status: string; ended: string | null; commissioningId: string | null; tasks: string[]; loops: Array<{ status: string }>; conduct?: { stage: string | null } };
            const until = async (what: string, test: (r: Run) => boolean): Promise<Run> => {
                for (let t0 = Date.now(); Date.now() - t0 < 120_000; await new Promise((x) => setTimeout(x, 300))) {
                    const r = await read<Run | null>("scenario", "scenario://run");
                    if (r && (test(r) || r.status !== "running")) return r;
                }
                throw new Error(`${what}: not reached`);
            };
            const open = async (kind: string) => {
                for (let t0 = Date.now(); Date.now() - t0 < 60_000; await new Promise((x) => setTimeout(x, 300))) {
                    const q = (await read<Array<{ id: string; kind: string; status: string }>>("station", "station://questions")).find((x) => x.kind === kind && x.status === "open");
                    if (q) return q;
                }
                throw new Error(`no open ${kind} question`);
            };

            // Nothing to read yet: no pattern, no task.
            assert.deepEqual((await ok<{ patterns: unknown[]; taskId: string | null }>("station", "reflect", { builder: "scripted" })).taskId, null);

            // The agents at work in the fork: FE-1's alarm stops the first test and, after a new one is asked, the second; the commander stops there.
            await ok("scenario", "play", { id: "commissioning", builder: "scripted", request: {} });
            const first = await until("the first authorisation", (r) => r.loops[3].status === "waiting");
            await ok("biomed", "alarm", { subjectId: "fe-1", what: "chest pain", by: "the medical panel" });
            await ok("station", "commissioning_authorise", { commissioningId: first.commissioningId, decision: "authorise", by: "commander-test" });
            await until("the first recover question", (r) => r.conduct?.stage === "ask");
            await ok("biomed", "alarm_clear", { subjectId: "fe-1", by: "the medical panel" });
            await ok("station", "answer", { questionId: (await open("recover")).id, choice: "rewrite", by: "commander-test", how: "script" });
            const second = await until("the second authorisation", (r) => r.loops[3].status === "waiting" && r.tasks.length === 2);
            await ok("biomed", "alarm", { subjectId: "fe-1", what: "chest pain again", by: "the medical panel" });
            await ok("station", "commissioning_authorise", { commissioningId: second.commissioningId, decision: "authorise", by: "commander-test" });
            await until("the second recover question", (r) => r.conduct?.stage === "ask" && r.tasks.length === 2);
            await ok("station", "answer", { questionId: (await open("recover")).id, choice: "stop", by: "commander-test", how: "script" });
            const stopped = await until("the end", () => false);
            await ok("biomed", "alarm_clear", { subjectId: "fe-1", by: "the medical panel" });
            assert.match(stopped.ended ?? "", /the commander stopped the commissioning after the abort/);

            // Mother reads the traces: the same cause twice; the reflection (its script) proposes the bound at two; the station adopts it in the fork.
            const reflected = await ok<{ patterns: Pattern[]; taskId: string }>("station", "reflect", { builder: "scripted" });
            const pattern = reflected.patterns.find((p) => p.kind === "abort-repeat");
            assert.deepEqual([pattern?.count, pattern?.target], [2, RECOVERY]);
            let task: { state: string; run?: { ended?: string | null }; manifest?: { ended?: string | null; proposal?: { status: string } | null } } = { state: "running" };
            for (let t0 = Date.now(); !task.run?.ended && Date.now() - t0 < 60_000; await new Promise((x) => setTimeout(x, 300))) task = await ok("factory", "task", { taskId: reflected.taskId });
            assert.equal(task.state, "proposed", String(task.manifest?.ended));
            assert.equal(task.manifest?.proposal?.status, "adopted");
            const adopted = JSON.parse(readFileSync(path.join(dir, ...RECOVERY.split("/")), "utf8")) as { nodes: Array<{ id: string; bag?: { atLeast?: number; why?: string } }> };
            assert.equal(adopted.nodes.find((n) => n.id === "exhausted")?.bag?.atLeast, 2, "the fork's playbook ends the commissioning after two aborts");
            const mother = await read<Array<{ key: string; text: { en: string }; fork?: string }>>("station", "station://mother");
            assert.ok(mother.some((l) => l.key === "mother.reflection.read" && /I read \d+ pattern/.test(l.text.en)));
            assert.ok(mother.some((l) => l.key === "mother.adaptation.adopted" && /In the fork learn, I adopted a change of specs\/commissioning\/recovery\.playbook\.json/.test(l.text.en)));
        } finally {
            await operator.close();
            await started.stop();
        }

        // The evolution, in the fork's history: the adaptation is a snapshot of its own, with its reason; the repository's conduct is as it was.
        const history = forkHistory(id);
        const snapshot = history.find((c) => c.label.startsWith(`adaptation 1 of ${RECOVERY}`));
        assert.ok(snapshot, history.map((c) => c.label).join(" | "));
        assert.ok(snapshot.files.includes(RECOVERY));
        assert.match(snapshot.label, /abort-repeat:/);
        delete process.env.FORK_DIR;
        assert.equal(readFileSync(fromRepository(...RECOVERY.split("/")), "utf8"), repositoryPlaybook);
    });
});
