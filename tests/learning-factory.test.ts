/**
 * The factory learns from its episodes, in a fork (2026-09-29, the memory audit; it replaces the test where a reflection
 * wrote a rule into the factory's words, which learning no longer touches). Both sides are scripts: what is proved is the
 * chain, never what a model learns. The procedure factory's script sends a first step that stops the scrubber, is refused
 * by the guard, and revises it to the floor, accepted: two tasks, two episodes, each a refusal then an accepted retry.
 * Mother reads them; the reflection's script proposes, for the factory's memory, what the accepted retries did; the station
 * enters it as a candidate, and puts it in trial at once, the working memory holding the failures and the successes it
 * needs. The next tasks read it in their state at the stage that submits, and are accepted at their first attempt; after
 * three of them the entry is consolidated, with its confidence. The factory's words are never written.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createFork, forkHistory, forkPath } from "../lib/fork.js";
import { fromRepository } from "../lib/paths.js";
import { Broker } from "../harness/lib/broker.js";

const PORT = 3191;
const WORDS = "specs/procedure/words.json";

describe("the procedure factory learns from its episodes, in a fork: a memory, not its words", () => {
    const forks = mkdtempSync(path.join(tmpdir(), "forks-learning-factory-"));
    before(() => {
        process.env.FORKS_DIR = forks;
    });
    after(() => {
        for (const k of ["FORKS_DIR", "FORK_DIR", "FORK_LEARNING"]) delete process.env[k];
        rmSync(forks, { recursive: true, force: true });
    });

    it("two refusals answered by accepted retries become a candidate, then a trial the next tasks read and pass with, then a consolidated entry", async () => {
        createFork("factory-remembers");
        const dir = forkPath("factory-remembers");
        // The repository reads the session only since 2026-10-10 (its long-term memory was corrupted): a fork that learns turns both memories on.
        const settingsFile = path.join(dir, "specs", "harness", "memory.json");
        const settings = JSON.parse(readFileSync(settingsFile, "utf8")) as { workingMemory: Record<string, unknown> };
        writeFileSync(settingsFile, JSON.stringify({ ...settings, workingMemory: { ...settings.workingMemory, previousTasks: true }, longTerm: { read: true } }, null, 2));
        const repositoryWords = readFileSync(fromRepository(...WORDS.split("/")), "utf8");
        Object.assign(process.env, { FORK_DIR: dir, SPEECH_PROVIDER: "silent", STATION_VOICE: "off", BIOMED_PROVIDER: "simulated", STATION_REMIND_SECONDS: "0", CAD_MCP_URL: "http://127.0.0.1:1/mcp" });
        delete process.env.FORK_LEARNING;
        const { startAll } = await import("../slots/run-all.js");
        const started = await startAll(PORT, () => undefined, "ignore");
        const operator = new Broker(started.broker.httpBase, { name: "learning-factory-test", version: "0", locale: "en" });
        const workshop = path.join(dir, "outputs", "factory");
        try {
            const ok = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
                const x = await operator.call(slot, tool, args);
                assert.ok(x.ok, `${slot}.${tool}: ${x.error}`);
                return x.output as T;
            };
            const read = async <T>(slot: string, uri: string): Promise<T> => JSON.parse((await (await operator.session(slot)).request<{ contents: Array<{ text: string }> }>("resources/read", { uri })).contents[0].text) as T;
            type Step = { n: number; capability: string | null; outcome: string; judged?: string };
            type Task = { state: string; run?: { ended?: string | null }; manifest?: { ended?: string | null; steps?: Step[]; proposal?: { status?: string } | null } };
            const ended = async (taskId: string): Promise<Task> => {
                for (let t0 = Date.now(); Date.now() - t0 < 120_000; await new Promise((x) => setTimeout(x, 200))) {
                    const t = await ok<Task>("factory", "task", { taskId });
                    if (t.run?.ended) return t;
                }
                throw new Error(`task ${taskId} did not end`);
            };
            // One procedure task on a commissioning of its own (the scene under a suffix of its own); the procedure relayed is refused.
            const scene = JSON.parse(readFileSync(fromRepository("specs", "commissioning-devices.json"), "utf8")) as { devices: Array<{ path: string; descriptor: Record<string, unknown> }> };
            let k = 0;
            const procedureTask = async (): Promise<{ taskId: string; task: Task }> => {
                const suffix = `-m${++k}`;
                const devices = scene.devices.map((d) => ({ ...d, path: d.path.replace(/(\/[a-z0-9-]+)$/, `$1${suffix}`), descriptor: { ...d.descriptor, links: ((d.descriptor.links as Array<{ href: string }> | undefined) ?? []).map((l) => ({ ...l, href: l.href.replace(/(\/[a-z0-9-]+)$/, `$1${suffix}`) })) } as Record<string, unknown> }));
                let commissioningId: string | null = null;
                for (const d of devices) commissioningId = (await ok<{ commissioning: string | null }>("station", "registry_register", d)).commissioning ?? commissioningId;
                await ok("station", "registry_report", { path: devices.find((d) => d.descriptor["@type"] === "Battery")!.path, readings: { stateOfCharge: 80 } });
                const scrubber = devices.find((d) => d.descriptor["@type"] === "Scrubber")!.path;
                const { taskId } = await ok<{ taskId: string }>("factory", "request", { objective: { required_outputs: [{ name: "V_lab", quantity: "Volume", unit: "m3" }] }, observations: { device: scrubber }, topics: ["procedure"], builder: "scripted", requestedBy: "learning-factory-test" });
                const task = await ended(taskId);
                const c = (await ok<{ commissioning: { status: string } }>("station", "commissioning_state", { commissioningId })).commissioning;
                if (c.status === "awaiting-authorisation") await ok("station", "commissioning_authorise", { commissioningId, decision: "refuse", by: "commander-test" });
                return { taskId, task };
            };
            const judged = (t: Task) => (t.manifest?.steps ?? []).filter((s) => s.judged).map((s) => `${s.capability}:${s.judged}`);

            // Two tasks: the first submission refused by the guard, the revision accepted. Two episodes, X refused then Y accepted.
            const one = await procedureTask();
            const two = await procedureTask();
            for (const t of [one, two]) {
                assert.equal(t.task.state, "proposed", t.task.manifest?.ended ?? "");
                assert.deepEqual(judged(t.task), ["procedure.submit:refused", "procedure.revise:accepted"]);
            }

            // Mother reflects: the same form of mistake at the first try of two tasks, answered by an accepted retry both times.
            const reflected = await ok<{ taskId: string | null; patterns: Array<{ kind: string; detail: { successes?: unknown[] } }> }>("station", "reflect", { builder: "scripted" });
            const shape = reflected.patterns.find((p) => p.kind === "first-try-shape" && (p.detail.successes ?? []).length);
            assert.ok(shape, JSON.stringify(reflected.patterns.map((p) => p.kind)));
            assert.equal((shape!.detail.successes ?? []).length >= 2, true, "each task's retry answered the mistake");
            const reflection = await ended(reflected.taskId!);
            assert.equal(reflection.manifest?.proposal?.status, "adopted", "in trial: in force from the next task");

            // The memory of the domain: one entry in trial, with its evidence; the ledger says how it got there; the words untouched.
            const memoryFile = path.join(workshop, "memory", "procedure.json");
            const memory = JSON.parse(readFileSync(memoryFile, "utf8")) as { domain: string; entries: Array<{ rule: string; status: string; appliesTo: string[]; evidence: { failures: string[]; successes: string[] }; confidence: unknown }> };
            assert.equal(memory.domain, "procedure_authoring");
            assert.equal(memory.entries.length, 1);
            const [entry] = memory.entries;
            assert.equal(entry.status, "trial");
            assert.match(entry.rule, /^For \S+, send from the first attempt what the guard then accepted, as the accepted attempts did \(test\.speedFloorPercent\)/);
            assert.ok(entry.appliesTo.includes("procedure.submit"));
            assert.deepEqual([entry.evidence.failures.length, entry.evidence.successes.length], [2, 2]);
            assert.equal(readFileSync(path.join(dir, ...WORDS.split("/")), "utf8"), repositoryWords, "learning does not write the factory's words");
            const mother = await read<Array<{ key: string; text: { en: string } }>>("station", "station://mother");
            assert.ok(mother.some((l) => l.key === "mother.memory.trial" && /In the fork factory-remembers, I put on trial in the memory of procedure_authoring/.test(l.text.en)));

            // The next tasks read it at the stage that submits, and are accepted at their first attempt.
            for (let i = 0; i < 3; i++) {
                const t = await procedureTask();
                assert.deepEqual(judged(t.task), ["procedure.submit:accepted"], `task ${t.taskId}`);
                if (i === 0) {
                    const trace = readFileSync(path.join(workshop, t.taskId, "trace.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { exchange?: { proposedCapabilityId?: string; request?: { state?: { features?: { state?: { memory?: { learned?: Array<{ rule: string; status: string }> } } } } } } });
                    const submit = trace.find((l) => l.exchange?.proposedCapabilityId === "procedure.submit");
                    assert.equal(submit?.exchange?.request?.state?.features?.state?.memory?.learned?.[0]?.status, "trial", "the entry is in the state it decided on");
                }
            }

            // Three tasks since its trial, the mistake in none: consolidated, with its confidence.
            // The harness's graph of this workshop, through the station (2026-09-30, E0): the five procedure tasks and the reflection's (its
            // topic judges its proposals too), the form the first attempts were refused for, answered by the corrections of the two first.
            const graph = await ok<{ nodes: Record<string, number>; links: Record<string, number> }>("station", "harness_graph", {});
            assert.equal(graph.nodes["harness.task"], 6, JSON.stringify(graph));
            assert.ok((graph.links["harness.answers"] ?? 0) >= 2, JSON.stringify(graph.links));
            const forms = await ok<{ nodes: Array<{ id: string }> }>("station", "harness_graph", { type: "harness.form" });
            const form = await ok<{ in: Array<{ type: string }> }>("station", "harness_graph", { id: forms.nodes[0].id });
            assert.ok(form.in.some((l) => l.type === "harness.refused-for"));
            const again = await ok<{ taskId: string | null }>("station", "reflect", { builder: "scripted" });
            assert.equal(again.taskId, null, "the failures the memory answers are not read again: nothing new to reflect on");
            const consolidated = JSON.parse(readFileSync(memoryFile, "utf8")) as typeof memory;
            assert.equal(consolidated.entries[0].status, "consolidated");
            assert.deepEqual(consolidated.entries[0].confidence, { rate: 1, tasks: 3 });
            const ledger = JSON.parse(readFileSync(path.join(workshop, "adaptations", "ledger.json"), "utf8")) as Array<{ status: string; why?: string }>;
            assert.equal(ledger[0].status, "consolidated");
            assert.match(String(ledger[0].why), /the mistake showed in 0 of the 3 task\(s\) since its trial, against 2 of 2 before/);
        } finally {
            await operator.close();
            await started.stop();
        }
        // The memory in the fork's history, never in the repository.
        assert.ok(forkHistory("factory-remembers").some((c) => /memory 1 of procedure_authoring, in trial/.test(c.label)));
        delete process.env.FORK_DIR;
        assert.equal(existsSync(fromRepository("outputs", "factory", "memory", "procedure.json")) && readFileSync(fromRepository("outputs", "factory", "memory", "procedure.json"), "utf8").includes("factory-remembers"), false);
        assert.equal(readFileSync(fromRepository(...WORDS.split("/")), "utf8"), repositoryWords);
    });
});
