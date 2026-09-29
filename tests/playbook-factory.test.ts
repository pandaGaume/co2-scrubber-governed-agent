/**
 * A factory writes a playbook, and its signature is asked of the role that signs (2026-09-29, levels 2 and 3 of
 * docs/comportement-en-donnees.fr.md), through the broker the factories use:
 *
 *   the playbook factory (its script) changes the commissioning's recovery playbook as asked (two aborts, not three),
 *   its guard running the graph on every event and the task's cases; the station checks it again, puts it on the
 *   library's proposals shelf, unsigned, and asks the role authorised-signatory to sign it; the commander may not,
 *   a signatory does; signed, it conducts, and changed since, it no longer does. A playbook that breaks a case is
 *   refused by the guard and never proposed.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { taskDir } from "../slots/tools/lib/workshop.js";
import { loadPlaybook, signedPlaybook, type PlaybookFile } from "../harness/core/conduct.js";
import { RECOVERY_PLAYBOOK, type Run } from "../slots/scenario/commissioning.js";

const PORT = 3152;
const ID = "commissioning-recovery-two-aborts";

const request = (id: string, atLeast: number) => ({
    objective: { required_outputs: [{ name: id, quantity: "Playbook" }] },
    observations: {
        playbook: {
            id,
            title: "What follows a test, the commissioning ended after two aborts",
            change: "end the commissioning after two aborted tests, not three: a cause that stopped two tests is looked at by a person before a third",
            base: RECOVERY_PLAYBOOK,
            words: "specs/commissioning/words.json",
            actions: ["go-on", "ask", "end", "reopen"],
            capabilities: ["station.commissioning_reopen"],
            cases: [
                { evidence: { aborted: false, answered: false, rewrite: false, aborts: 0 }, stage: "report", refusing: ["reopen-on-decision"] },
                { evidence: { aborted: true, answered: false, rewrite: false, aborts: 1 }, stage: "ask", refusing: ["reopen-on-decision"] },
                { evidence: { aborted: true, answered: true, rewrite: true, aborts: 1 }, stage: "rewrite-test", refusing: [] },
                { evidence: { aborted: true, answered: false, rewrite: false, aborts: 2 }, stage: "give-up", refusing: ["reopen-on-decision"] },
            ],
        },
        script: { bound: { node: "exhausted", atLeast, why: "a test aborted twice does not hold the cause the analysis names: the commissioning ends, and a person looks at it before any other" } },
    },
    topics: ["playbook"],
    builder: "scripted",
    requestedBy: "the test",
});

describe("a factory writes a playbook, and an authorised signatory is asked to sign it", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let operator: Broker;
    let recipesDir = "";
    const tasks: string[] = [];
    const ok = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const r = await operator.call(slot, tool, args);
        assert.ok(r.ok, `${slot}.${tool}: ${r.error}`);
        return r.output as T;
    };
    type Task = { state: string; run?: { ended?: string | null }; manifest?: { ended?: string | null; steps?: Array<{ capability?: string; outcome?: string }> } };
    const ended = async (taskId: string, ms = 60_000): Promise<Task> => {
        const t0 = Date.now();
        for (;;) {
            const s = await ok<Task>("factory", "task", { taskId });
            if (s.run?.ended) return s;
            if (Date.now() - t0 > ms) throw new Error(`task ${taskId} did not end in ${ms} ms`);
            await new Promise((r) => setTimeout(r, 300));
        }
    };
    type Question = { id: string; kind: string; status: string; role: string | null; holders?: string[]; taskId: string | null; context: { document?: string; bounds?: Array<{ id: string; atLeast: number }> } };
    const questions = async (): Promise<Question[]> => JSON.parse((await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://questions" })).contents[0].text) as Question[];
    type Read = { id: string; proposed: boolean; playbook: PlaybookFile; signed: { valid: boolean; by: string } | null };

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        process.env.BIOMED_PROVIDER = "simulated";
        recipesDir = mkdtempSync(path.join(tmpdir(), "recipes-playbook-"));
        process.env.FACTORY_RECIPES_DIR = recipesDir;
        ({ broker: local, slots } = await startAllOrFail(PORT));
        operator = new Broker(local.httpBase, { name: "operator-test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        delete process.env.BIOMED_PROVIDER;
        delete process.env.FACTORY_RECIPES_DIR;
        await operator?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
        for (const t of tasks) rmSync(taskDir(t), { recursive: true, force: true });
        rmSync(recipesDir, { recursive: true, force: true });
    });

    it("the factory writes it, the station proposes it unsigned, the signature is the role's; signed it conducts, changed it no longer does", async () => {
        const { taskId } = await ok<{ taskId: string }>("factory", "request", request(ID, 2));
        tasks.push(taskId);
        const task = await ended(taskId);
        assert.equal(task.state, "proposed", String(task.manifest?.ended ?? task.run?.ended));
        const steps = (task.manifest?.steps ?? []).map((s) => s.capability);
        assert.deepEqual(steps.filter((c) => c === "task.plan" || c === "playbook.submit" || c === "task.done"), ["task.plan", "playbook.submit", "task.done"]);

        // On the proposals' shelf, not in the library: unsigned, it conducts nothing.
        const list = await ok<{ documents: Array<{ id: string; proposed: boolean; playbook: boolean; signature: unknown }> }>("library", "list");
        const doc = list.documents.find((d) => d.id === ID);
        assert.deepEqual([doc?.proposed, doc?.playbook, doc?.signature], [true, true, null]);
        const review = await ok<{ files: Array<{ name: string; text: string }> }>("library", "review", { id: ID });
        assert.deepEqual(review.files.map((f) => f.name), [`${ID}.md`, `${ID}.playbook.json`]);
        assert.match(review.files[0].text, /It is not signed: it conducts nothing until an authorised signatory reads it and signs it/);
        assert.match(review.files[0].text, /`exhausted`: aborts at least 2\./);
        const unsigned = await ok<Read>("library", "playbook", { id: ID });
        assert.throws(() => signedPlaybook(unsigned), /is not signed: it conducts nothing until a person signs it/);

        // The signature is asked of the role, with its holders; no standing order, and not the commander.
        const q = (await questions()).find((x) => x.kind === "sign" && x.status === "open" && x.context.document === ID);
        assert.ok(q, "a sign question for the proposed playbook");
        assert.equal(q.role, "authorised-signatory");
        assert.deepEqual(q.holders, ["signatory-test", "a reviewer"]);
        assert.deepEqual(q.context.bounds?.map((b) => [b.id, b.atLeast]), [["exhausted", 2]]);
        await ok("station", "questions_policy", { mode: "auto" });
        const commander = await operator.call("station", "answer", { questionId: q.id, choice: "sign", by: "commander-test", how: "script" });
        assert.equal(commander.ok, false);
        assert.match(String(commander.error), /"commander-test" does not hold the role authorised-signatory/);
        await ok("station", "questions_policy", { mode: "ask" });
        await ok("station", "answer", { questionId: q.id, choice: "sign", by: "signatory-test", how: "script" });

        // Signed: it conducts; the same event now ends the commissioning after the second abort, where the repository's asks.
        const signed = await ok<Read>("library", "playbook", { id: ID });
        assert.deepEqual([signed.signed?.by, signed.signed?.valid], ["signatory-test", true]);
        const event = { aborted: true, answered: false, rewrite: false, aborts: 2 };
        assert.equal(signedPlaybook(signed).evaluate(event).stage.id, "give-up");
        assert.equal(loadPlaybook(RECOVERY_PLAYBOOK).evaluate(event).stage.id, "ask", "the repository's own is untouched");

        // Changed since it was signed: it conducts nothing until a signatory signs it again.
        const file = path.join(process.env.LIBRARY_PROPOSALS_DIR!, `${ID}.playbook.json`);
        const pb = JSON.parse(readFileSync(file, "utf8")) as PlaybookFile;
        writeFileSync(file, JSON.stringify({ ...pb, nodes: pb.nodes.map((n) => (n.id === "exhausted" ? { ...n, bag: { ...n.bag, atLeast: 9 } } : n)) }, null, 4));
        const changed = await ok<Read>("library", "playbook", { id: ID });
        assert.equal(changed.signed?.valid, false);
        assert.throws(() => signedPlaybook(changed), /changed since signatory-test signed it/);
    });

    it("outside a fork, Mother does not reflect: an adaptation is adopted and measured in a fork only (2026-09-29, P4)", async () => {
        const r = await operator.call("station", "reflect", { builder: "scripted" });
        assert.equal(r.ok, false);
        assert.match(String(r.error), /the reflection runs in a fork only/);
    });

    it("a playbook that breaks a case the task gives is refused by the guard, and never proposed", async () => {
        const id = "commissioning-recovery-never-asks";
        const { taskId } = await ok<{ taskId: string }>("factory", "request", request(id, 1));
        tasks.push(taskId);
        const task = await ended(taskId);
        assert.equal(task.state, "failed");
        assert.match(String(task.manifest?.ended ?? ""), /case 2 .*the stage is "give-up", not "ask"/);
        const list = await ok<{ documents: Array<{ id: string }> }>("library", "list");
        assert.ok(!list.documents.some((d) => d.id === id), "nothing refused reaches the library");
    });

    it("the scenario player conducts by the signed playbook: unsigned, the run stops before anything; signed, the commissioning ends at the second abort, where the repository's asks again", async () => {
        const id = "commissioning-recovery-signed-run";
        const { taskId } = await ok<{ taskId: string }>("factory", "request", request(id, 2));
        tasks.push(taskId);
        assert.equal((await ended(taskId)).state, "proposed");
        const readRun = async (): Promise<Run | null> => JSON.parse((await (await operator.session("scenario")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "scenario://run" })).contents[0].text) as Run | null;
        const until = async (what: string, test: (run: Run) => boolean, ms = 120_000): Promise<Run> => {
            const t0 = Date.now();
            for (;;) {
                const run = await readRun();
                if (run && (test(run) || run.status !== "running")) return run;
                if (Date.now() - t0 > ms) throw new Error(`${what}: not reached in ${ms} ms`);
                await new Promise((r) => setTimeout(r, 300));
            }
        };
        const open = async (kind: string, ms = 60_000): Promise<Question> => {
            const t0 = Date.now();
            for (;;) {
                const q = (await questions()).find((x) => x.kind === kind && x.status === "open");
                if (q) return q;
                if (Date.now() - t0 > ms) throw new Error(`no open question of kind ${kind}`);
                await new Promise((r) => setTimeout(r, 300));
            }
        };
        const play = { id: "commissioning", builder: "scripted", request: {}, playbook: `library:${id}` };
        assert.equal((await operator.call("scenario", "play", { ...play, playbook: "specs/commissioning/recovery.playbook.json" })).ok, false, "at play time, only a playbook of the library, whose signature is checked");

        // Unsigned: the run stops before a device registers.
        await ok("scenario", "play", play);
        const unsigned = await until("the end", () => false);
        assert.equal(unsigned.status, "failed");
        assert.match(unsigned.ended ?? "", new RegExp(`the playbook "${id}" is not signed: it conducts nothing until a person signs it`));
        assert.equal(unsigned.commissioningId, null, "nothing was registered, no commissioning opened");

        // Signed by a signatory.
        const q = (await questions()).find((x) => x.kind === "sign" && x.status === "open" && x.context.document === id);
        await ok("station", "answer", { questionId: q!.id, choice: "sign", by: "signatory-test", how: "script" });

        // Played again: FE-1's alarm aborts the first test; a new one is asked; the alarm, raised again, aborts the second.
        await ok("scenario", "play", play);
        const first = await until("the first authorisation", (r) => r.loops[3].status === "waiting");
        assert.equal(first.status, "running", first.ended ?? "");
        assert.deepEqual([first.options.playbook], [`library:${id}`]);
        tasks.push(first.loops[1].taskId!);
        await ok("biomed", "alarm", { subjectId: "fe-1", what: "chest pain", by: "the medical panel" });
        await ok("station", "commissioning_authorise", { commissioningId: first.commissioningId, decision: "authorise", by: "commander-test" });
        const asking = await until("the recover question", (r) => r.conduct?.stage === "ask");
        assert.deepEqual([asking.conduct?.playbook, asking.conduct?.signedBy], [`library:${id}`, "signatory-test"]);
        await ok("biomed", "alarm_clear", { subjectId: "fe-1", by: "the medical panel" });
        await ok("station", "answer", { questionId: (await open("recover")).id, choice: "rewrite", by: "commander-test", how: "script" });
        const second = await until("the second authorisation", (r) => r.loops[3].status === "waiting" && r.tasks.length === 2);
        assert.equal(second.status, "running", second.ended ?? "");
        tasks.push(second.loops[1].taskId!);
        await ok("biomed", "alarm", { subjectId: "fe-1", what: "chest pain again", by: "the medical panel" });
        await ok("station", "commissioning_authorise", { commissioningId: second.commissioningId, decision: "authorise", by: "commander-test" });
        const done = await until("the end", () => false);
        await ok("biomed", "alarm_clear", { subjectId: "fe-1", by: "the medical panel" });
        assert.equal(done.status, "failed");
        assert.deepEqual(done.conduct?.stages.map((s) => s.stage), ["ask", "rewrite-test", "give-up"]);
        assert.match(done.ended ?? "", /the test was aborted 2 times; the last time: FE-1: critical health alarm: chest pain again/);
        const repository = loadPlaybook(RECOVERY_PLAYBOOK).evaluate({ aborted: true, answered: false, rewrite: false, aborts: 2 }).stage.id;
        assert.equal(repository, "ask", "the repository's playbook would have asked the commander a third time");
    });
});
