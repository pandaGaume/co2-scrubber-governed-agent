/**
 * The factory learns from its refusals, in a fork (2026-09-29; Guillaume: "montre-moi un scénario un peu plus explicite
 * que ne plus demander"): the learning scenario (`specs/scenario-commissioning-learning.json`) played in a fork started
 * to learn. The procedure factory's script does not understand its refusals but follows its written instructions: it
 * sends a first step that stops the scrubber three times, and its task ends STUCK. That end is the event: Mother reads
 * the task's traces, the reflection writes the rule it kept breaking into its instructions (the fork's copy of
 * specs/procedure/words.json), the station adopts it, and the factory, asked again, is accepted at its first submission.
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

const PORT = 3191;
const WORDS = "specs/procedure/words.json";

describe("the procedure factory learns from its refusals, in a fork", () => {
    const forks = mkdtempSync(path.join(tmpdir(), "forks-learning-factory-"));
    before(() => {
        process.env.FORKS_DIR = forks;
    });
    after(() => {
        for (const k of ["FORKS_DIR", "FORK_DIR", "FORK_LEARNING"]) delete process.env[k];
        rmSync(forks, { recursive: true, force: true });
    });

    it("three refusals on the floor end the first task STUCK; the fork adds the rule to the factory's instructions; the second task is accepted at its first submission", async () => {
        createFork("factory-learns");
        const dir = forkPath("factory-learns");
        const repositoryWords = readFileSync(fromRepository(...WORDS.split("/")), "utf8");
        Object.assign(process.env, { FORK_DIR: dir, FORK_LEARNING: "scripted", SPEECH_PROVIDER: "silent", STATION_VOICE: "off", BIOMED_PROVIDER: "simulated", SCENARIO_SECONDS_PER_MINUTE: "0", STATION_REMIND_SECONDS: "0", CAD_MCP_URL: "http://127.0.0.1:1/mcp" });
        const { startAll } = await import("../slots/run-all.js");
        const started = await startAll(PORT, () => undefined, "ignore");
        const operator = new Broker(started.broker.httpBase, { name: "learning-factory-test", version: "0", locale: "en" });
        try {
            const ok = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
                const x = await operator.call(slot, tool, args);
                assert.ok(x.ok, `${slot}.${tool}: ${x.error}`);
                return x.output as T;
            };
            const read = async <T>(slot: string, uri: string): Promise<T> => JSON.parse((await (await operator.session(slot)).request<{ contents: Array<{ text: string }> }>("resources/read", { uri })).contents[0].text) as T;
            type Run = { status: string; ended: string | null; commissioningId: string | null; tasks: string[]; loops: Array<{ status: string }>; learning?: Array<{ patterns: string[]; taskId: string | null; adopted?: boolean; after: string }> };
            type Task = { state: string; manifest?: { ended?: string | null; steps?: Array<{ capability: string | null; outcome: string; judged?: string }> } };

            await ok("scenario", "play", { id: "commissioning-learning", builder: "scripted", request: {} });
            let run: Run | null = null;
            for (let t0 = Date.now(); Date.now() - t0 < 180_000; await new Promise((x) => setTimeout(x, 300))) {
                run = await read<Run | null>("scenario", "scenario://run");
                if (run && (run.loops[3].status === "waiting" || run.status !== "running")) break;
            }
            assert.equal(run?.status, "running", `${run?.ended ?? ""} | learning ${JSON.stringify(run?.learning)} | tasks ${JSON.stringify(run?.tasks)} | fork words learned: ${readFileSync(path.join(dir, ...WORDS.split("/")), "utf8").includes("Learned in this fork")}`);
            assert.equal(run?.loops[3].status, "waiting", "the second procedure passed and was relayed: the run waits for the authorisation");

            // Before: the first task, refused three times on the same point, ended STUCK.
            const [first, second] = run!.tasks;
            const before = await ok<Task>("factory", "task", { taskId: first });
            assert.match(String(before.manifest?.ended), /^STUCK: procedure\.(submit|revise) refused 3 times in a row on the same point/);
            assert.equal((before.manifest?.steps ?? []).filter((s) => s.outcome === "refused").length, 3);
            // Each refusal is the guard's judgement of a submission, and the manifest says so (2026-09-29, the learning experiment).
            assert.deepEqual((before.manifest?.steps ?? []).filter((s) => s.outcome === "refused").map((s) => s.judged), ["refused", "refused", "refused"]);

            // The event, and what the fork learned from it.
            const learned = run!.learning ?? [];
            assert.equal(learned.length, 1);
            assert.equal(learned[0].after, first);
            assert.ok(learned[0].patterns.some((p) => p === `refusal-streak:${first}:procedure.submit`), learned[0].patterns.join(", "));
            assert.equal(learned[0].adopted, true);
            const words = JSON.parse(readFileSync(path.join(dir, ...WORDS.split("/")), "utf8")) as { brief: { procedure: string } };
            assert.match(words.brief.procedure, /Learned in this fork, after 3 refusals in a row of procedure\.submit on the same point: floor: .*Hold it from the first submission\./);
            const mother = await read<Array<{ key: string; text: { en: string } }>>("station", "station://mother");
            assert.ok(mother.some((l) => l.key === "mother.adaptation.adopted" && /In the fork factory-learns, I adopted a change of specs\/procedure\/words\.json/.test(l.text.en)));

            // After: the second task, with its instructions as the fork adapted them, accepted at its first submission.
            const after = await ok<Task>("factory", "task", { taskId: second });
            assert.equal(after.state, "proposed");
            const submissions = (after.manifest?.steps ?? []).filter((s) => s.capability === "procedure.submit" || s.capability === "procedure.revise");
            assert.deepEqual(submissions.map((s) => s.outcome), ["completed"], "one submission, accepted");
            assert.deepEqual(submissions.map((s) => s.judged), ["accepted"]);

            await ok("station", "commissioning_authorise", { commissioningId: run!.commissioningId, decision: "refuse", by: "commander-test" });
        } finally {
            await operator.close();
            await started.stop();
        }
        // The evolution in the fork's history; the repository's instructions as they were.
        const snapshot = forkHistory("factory-learns").find((c) => c.label.startsWith(`adaptation 1 of ${WORDS}`));
        assert.ok(snapshot?.files.includes(WORDS));
        delete process.env.FORK_DIR;
        assert.equal(readFileSync(fromRepository(...WORDS.split("/")), "utf8"), repositoryWords);
    });
});
