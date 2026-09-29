/**
 * A fork that adapts itself from an event (2026-09-29, before P5; Guillaume: "je veux assister à un fork qui
 * s'auto-adapte à partir d'un événement"): a server in a fork started to learn (FORK_LEARNING, npm run fork -- run
 * <id> --learn scripted), a commissioning played there, a critical alarm stopping its first test, then its second;
 * at each abort, the event, Mother reads the fork's traces; at the second, the same cause twice is a pattern, the
 * reflection brings the recovery playbook's bound to two, the station adopts it in the fork, and the playbook, read
 * again at that very event, ends the commissioning there, where it would have asked the commander a third time.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createFork, forkHistory, forkPath } from "../lib/fork.js";
import { fromRepository } from "../lib/paths.js";
import { Broker } from "../harness/lib/broker.js";

const PORT = 3181;
const RECOVERY = "specs/commissioning/recovery.playbook.json";

describe("a fork that learns: an abort is the event, the fork adapts itself at it", () => {
    const forks = mkdtempSync(path.join(tmpdir(), "forks-learning-"));
    before(() => {
        process.env.FORKS_DIR = forks;
    });
    after(() => {
        for (const k of ["FORKS_DIR", "FORK_DIR", "FORK_LEARNING"]) delete process.env[k];
        rmSync(forks, { recursive: true, force: true });
    });

    it("the second abort on the same cause: Mother reflects, the bound comes to two, and the same event ends the commissioning", async () => {
        createFork("live");
        const dir = forkPath("live");
        const repositoryPlaybook = readFileSync(fromRepository(...RECOVERY.split("/")), "utf8");
        Object.assign(process.env, { FORK_DIR: dir, FORK_LEARNING: "scripted", SPEECH_PROVIDER: "silent", STATION_VOICE: "off", BIOMED_PROVIDER: "simulated", SCENARIO_SECONDS_PER_MINUTE: "0", STATION_REMIND_SECONDS: "0", CAD_MCP_URL: "http://127.0.0.1:1/mcp" });
        const { startAll } = await import("../slots/run-all.js");
        const started = await startAll(PORT, () => undefined, "ignore");
        const operator = new Broker(started.broker.httpBase, { name: "learning-test", version: "0", locale: "en" });
        try {
            const ok = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
                const x = await operator.call(slot, tool, args);
                assert.ok(x.ok, `${slot}.${tool}: ${x.error}`);
                return x.output as T;
            };
            const read = async <T>(slot: string, uri: string): Promise<T> => JSON.parse((await (await operator.session(slot)).request<{ contents: Array<{ text: string }> }>("resources/read", { uri })).contents[0].text) as T;
            type Run = {
                status: string;
                ended: string | null;
                commissioningId: string | null;
                tasks: string[];
                loops: Array<{ status: string }>;
                conduct?: { stage: string | null; stages: Array<{ stage: string }>; adaptations?: Array<{ patterns: string[]; taskId: string | null; adopted?: boolean }> };
            };
            const until = async (what: string, test: (r: Run) => boolean): Promise<Run> => {
                for (let t0 = Date.now(); Date.now() - t0 < 120_000; await new Promise((x) => setTimeout(x, 300))) {
                    const r = await read<Run | null>("scenario", "scenario://run");
                    if (r && (test(r) || r.status !== "running")) return r;
                }
                throw new Error(`${what}: not reached`);
            };
            assert.equal((await read<{ fork: { learning: string | null } }>("station", "station://environment")).fork.learning, "scripted");

            await ok("scenario", "play", { id: "commissioning", builder: "scripted", request: {} });
            // The first abort: the event; nothing repeated yet, so no pattern; the commander asks for a new test.
            const first = await until("the first authorisation", (r) => r.loops[3].status === "waiting");
            await ok("biomed", "alarm", { subjectId: "fe-1", what: "chest pain", by: "the medical panel" });
            await ok("station", "commissioning_authorise", { commissioningId: first.commissioningId, decision: "authorise", by: "commander-test" });
            const asking = await until("the recover question", (r) => r.conduct?.stage === "ask");
            assert.deepEqual(asking.conduct?.adaptations?.map((a) => [a.patterns.length, a.taskId]), [[0, null]], "at the first abort, Mother read the traces and found nothing repeated");
            await ok("biomed", "alarm_clear", { subjectId: "fe-1", by: "the medical panel" });
            // The stage is said before the station has asked: the question is waited for.
            let q: { id: string } | undefined;
            for (let t0 = Date.now(); !q && Date.now() - t0 < 30_000; await new Promise((x) => setTimeout(x, 200))) q = (await read<Array<{ id: string; kind: string; status: string }>>("station", "station://questions")).find((x) => x.kind === "recover" && x.status === "open");
            await ok("station", "answer", { questionId: q!.id, choice: "rewrite", by: "commander-test", how: "script" });

            // The second abort on the same cause: the fork adapts itself at this event, and the adapted playbook ends the commissioning.
            const second = await until("the second authorisation", (r) => r.loops[3].status === "waiting" && r.tasks.length === 2);
            await ok("biomed", "alarm", { subjectId: "fe-1", what: "chest pain again", by: "the medical panel" });
            await ok("station", "commissioning_authorise", { commissioningId: second.commissioningId, decision: "authorise", by: "commander-test" });
            const done = await until("the end", () => false);
            await ok("biomed", "alarm_clear", { subjectId: "fe-1", by: "the medical panel" });
            assert.equal(done.status, "failed");
            assert.match(done.ended ?? "", /the test was aborted 2 times; the last time: FE-1: critical health alarm: chest pain again/);
            assert.deepEqual(done.conduct?.stages.map((s) => s.stage), ["ask", "rewrite-test", "give-up"], "no third question: the adapted playbook ended it at the second abort");
            const adaptations = done.conduct?.adaptations ?? [];
            assert.equal(adaptations.length, 2);
            assert.ok(adaptations[1].patterns.some((p) => p.startsWith("abort-repeat:")));
            assert.equal(adaptations[1].adopted, true);
            const mother = await read<Array<{ key: string; text: { en: string } }>>("station", "station://mother");
            assert.ok(mother.some((l) => l.key === "mother.adaptation.adopted" && /In the fork live, I adopted a change of specs\/commissioning\/recovery\.playbook\.json/.test(l.text.en)));
        } finally {
            await operator.close();
            await started.stop();
        }
        // The evolution: the adaptation, a snapshot of its own in the fork's history; the repository's playbook as it was.
        const snapshot = forkHistory("live").find((c) => c.label.startsWith(`adaptation 1 of ${RECOVERY}`));
        assert.ok(snapshot?.files.includes(RECOVERY));
        delete process.env.FORK_DIR;
        assert.equal(readFileSync(fromRepository(...RECOVERY.split("/")), "utf8"), repositoryPlaybook);
        assert.equal((JSON.parse(readFileSync(path.join(dir, ...RECOVERY.split("/")), "utf8")) as { nodes: Array<{ id: string; bag?: { atLeast?: number } }> }).nodes.find((n) => n.id === "exhausted")?.bag?.atLeast, 2);
    });
});
