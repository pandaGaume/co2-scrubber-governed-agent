/**
 * The `code` topic on the forge (docs/observateur-et-usines.fr.md,
 * section 6): the scripted builder walks a task through the whole chain
 * (the catalogue searched, the plan, the leak plugin written, compiled,
 * tested, loaded, run, proposed, handed over) on the reasoning state, and
 * the task ends proposed with the artifact the forge signed. Then the same
 * chain with a wrong type name first: the guard refuses the write before
 * any compilation, names the rule, and the script corrects it.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { runTask, type BuilderContext } from "../harness/core/runner.js";
import { ScriptedCodeBuilder, type ScriptedCodeOptions } from "../harness/scripted/code.js";
import { typesWritten, requirementsOf, briefOf } from "../harness/topics/code/index.js";
import { leakFixture } from "../harness/scripted/code-fixture.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import { taskDir } from "../slots/tools/lib/workshop.js";
import type { TaskFile } from "../harness/core/task.js";
import type { TraceLine } from "../harness/core/runner.js";

const PORT = 3131;

describe("the code topic's rules, without a broker", () => {
    it("reads the types a plugin's entry registers, literal or through a constant", () => {
        assert.deepEqual(typesWritten(leakFixture()), ["Generated.Habitat:leak"]);
        assert.deepEqual(typesWritten([{ path: "src/index.ts", content: 'reg.register("Physics.Habitat:leak", f, {});\nregistry.register(\'Generated.X:y\', g, {});' }]), ["Physics.Habitat:leak", "Generated.X:y"]);
        assert.deepEqual(typesWritten([{ path: "src/a.test.ts", content: 'reg.register("Physics.Habitat:leak", f, {});' }]), [], "a test file registers nothing");
    });

    it("the stages, from what the forge answered: nothing read, then each requirement in the order the forge takes them", () => {
        const task = { id: "t", objective: { required_outputs: [{ name: "leak", quantity: "MassFlow", unit: "kg/s" }], constraints: {} }, observations: {}, data: [] } as unknown as TaskFile["task"];
        const progress = newProgress();
        assert.deepEqual(requirementsOf(progress, task), { catalogueSearched: false, planAccepted: false, written: false, built: false, tested: false, loaded: false, ran: false, promoted: false });
        assert.match(briefOf(progress, task), /^Stage 1 of 6, the gap\. Required and produced by no node: leak \(MassFlow, kg\/s\)/);
        progress.reads["forge.registry_search"] = { at: "t", value: { matches: [] } };
        assert.match(briefOf(progress, task), /^Stage 2 of 6, the plan/);
        progress.plan = { selected_nodes: [], missing_capabilities: [] };
        assert.match(briefOf(progress, task), /^Stage 3 of 6, the plugin\. Write it with forge\.plugin_write \(taskId "t"\)/);
        progress.reads["forge.plugin_write"] = { at: "t", value: { ok: true, plugin: "leak", files: ["src/index.ts"], sha256: "s1" } };
        assert.match(briefOf(progress, task), /^Stage 4 of 6, compiled\. The plugin is written \(src\/index\.ts\)\. Compile it/);
        progress.reads["forge.plugin_build"] = { at: "t", value: { id: "b1", ok: false, sha256: "s1", diagnostics: [{ file: "src/leak.node.ts", line: 3, column: 1, code: "TS2322", message: "x" }] } };
        assert.match(briefOf(progress, task), /The build failed: the diagnostics are in the state under evaluation/);
        progress.reads["forge.plugin_build"] = { at: "t", value: { id: "b2", ok: true, sha256: "s1" } };
        progress.reads["forge.plugin_test"] = { at: "t", value: { build: "b2", ok: true, pass: 1, fail: 0, types: [{ type: "Generated.Habitat:leak", ok: true, problems: [] }] } };
        assert.match(briefOf(progress, task), /^Stage 4 of 6, loaded\. Tests and checks passed \(1 test\(s\), types Generated\.Habitat:leak\)/);
        progress.reads["forge.plugin_load"] = { at: "t", value: { id: "leak@s1", sha256: "s1", types: ["Generated.Habitat:leak"] } };
        assert.match(briefOf(progress, task), /^Stage 5 of 6, run\. .*The task carries no telemetry: run the node in a document/);
        progress.reads["forge.session_run"] = { at: "t", value: { ticks: 3, summary: {} } };
        assert.match(briefOf(progress, task), /^Stage 6 of 6, proposed\. The node ran \(session\)/);
        progress.reads["forge.plugin_promote"] = { at: "t", value: { id: "f0001", path: "forge/leak/artifact.json", sha256: "s1", artifactSha256: "a1", stationProposalId: "p0001" } };
        assert.deepEqual(requirementsOf(progress, task), { catalogueSearched: true, planAccepted: true, written: true, built: true, tested: true, loaded: true, ran: true, promoted: true });
        assert.match(briefOf(progress, task), /^Stage 6 of 6, hand over\. The forge signed forge\/leak\/artifact\.json \(proposal f0001, the station's p0001\)/);
        // A write after the build: the build no longer counts, nor what followed it.
        progress.reads["forge.plugin_write"] = { at: "t2", value: { ok: true, plugin: "leak", files: ["src/index.ts"], sha256: "s2" } };
        const again = requirementsOf(progress, task);
        assert.equal(again.built, false);
        assert.equal(again.loaded, false);
        assert.equal(again.promoted, false);
    });
});

describe("the code topic through the forge, scripted", () => {
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
    const build = async (options: Partial<ScriptedCodeOptions> = {}) => {
        const req = await ok<{ taskId: string; started: boolean }>("factory", "request", {
            objective: { required_outputs: [{ name: "leak_co2", quantity: "MassFlow", unit: "kg/s" }] },
            observations: { gap: "a graph factory found no node that removes CO2 from a volume at a constant rate" },
            topics: ["code"],
            builder: "scripted",
            requestedBy: "graph-factory",
            run: false,
        });
        assert.equal(req.started, false);
        tasks.push(req.taskId);
        return runTask({ broker: operator, taskId: req.taskId, recipesDir, provider: (ctx: BuilderContext) => new ScriptedCodeBuilder({ ...ctx, ...options }) });
    };

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        process.env.BIOMED_PROVIDER = "simulated";
        recipesDir = mkdtempSync(path.join(tmpdir(), "recipes-code-"));
        ({ broker: local, slots } = await startAllOrFail(PORT));
        operator = new Broker(local.httpBase, { name: "operator-test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        delete process.env.BIOMED_PROVIDER;
        await operator?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
        for (const t of tasks) rmSync(taskDir(t), { recursive: true, force: true });
        rmSync(recipesDir, { recursive: true, force: true });
    });

    it("the leak plugin, written, compiled, tested, loaded, run and proposed: the task ends proposed with the artifact the forge signed", async () => {
        const result = await build();
        assert.equal(result.state, "proposed", JSON.stringify(result.manifest.steps.map((s) => [s.capability, s.outcome, s.reason ?? s.summary]), null, 1));
        assert.deepEqual(result.manifest.steps.map((s) => s.capability), ["forge.registry_search", "task.plan", "forge.plugin_write", "forge.plugin_build", "forge.plugin_test", "forge.plugin_load", "forge.document_build", "forge.session_run", "forge.plugin_promote", "task.done"]);
        const plugin = result.manifest.artifacts.find((a) => a.kind === "plugin");
        assert.ok(plugin, "the manifest carries the plugin artifact");
        assert.equal(plugin?.path, "forge/leak/artifact.json");
        const artifact = JSON.parse(readFileSync(path.join(taskDir(result.taskId), "forge", "leak", "artifact.json"), "utf8")) as { types: string[]; tests: { pass: number; checks: Array<{ ok: boolean }> } };
        assert.deepEqual(artifact.types, ["Generated.Habitat:leak"]);
        assert.equal(artifact.tests.pass, 1);
        assert.ok(artifact.tests.checks.every((c) => c.ok));
        // The claims, built by code from what the forge measured, as the station received them with the manifest.
        const proposals = JSON.parse((await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://proposals" })).contents[0].text) as Array<{ proposalId: string; taskId: string; artifacts: Array<{ kind: string; sha256: string }>; claims: Record<string, unknown> }>;
        const mine = proposals.filter((p) => p.taskId === result.taskId);
        assert.equal(mine.length, 2, "the forge's own proposal of the artifact, then the task's with its manifest");
        assert.equal(mine[0].artifacts[0].kind, "plugin");
        assert.equal(mine[1].artifacts.find((a) => a.kind === "plugin")?.sha256, plugin?.sha256);
        const claims = mine[1].claims as { plugin?: string; types?: string[]; tests?: { pass: number; fail: number; checks: boolean }; ran?: { how: string }; proposal?: { station: string | null } };
        assert.equal(claims.plugin, "leak");
        assert.deepEqual(claims.types, ["Generated.Habitat:leak"]);
        assert.deepEqual(claims.tests, { pass: 1, fail: 0, checks: true });
        assert.equal(claims.ran?.how, "session");
        assert.ok(claims.proposal?.station, "the forge's own proposal reached the station");
        // The state the script read at the last step: the plugin whole under hypothesis, every requirement met.
        const trace = readFileSync(path.join(taskDir(result.taskId), "trace.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as TraceLine);
        const lastState = trace.at(-1)?.trace?.stateBefore.features.state as { requirements?: Record<string, boolean>; hypothesis?: { plugin?: { loaded?: string[]; ran?: string } } } | undefined;
        assert.deepEqual(lastState?.requirements, { catalogueSearched: true, planAccepted: true, written: true, built: true, tested: true, loaded: true, ran: true, promoted: true });
        assert.deepEqual(lastState?.hypothesis?.plugin?.loaded, ["Generated.Habitat:leak"]);
        // The twin's catalogue is untouched.
        const twin = await ok<{ matches: Array<{ type: string }> }>("twin", "registry_search", { capabilities: ["leak"] });
        assert.ok(!twin.matches.some((m) => m.type.startsWith("Generated.")));
    });

    it("a type not named under Generated. is refused by the guard before any compilation, the rule named; the script corrects it and the chain goes through", async () => {
        const result = await build({ firstType: "Physics.Habitat:leak", plugin: "leak-two" });
        assert.equal(result.state, "proposed", JSON.stringify(result.manifest.steps.map((s) => [s.capability, s.outcome, s.reason ?? s.summary]), null, 1));
        const refused = result.manifest.steps.find((s) => s.outcome === "refused");
        assert.ok(refused, "one step refused");
        assert.equal(refused?.capability, "forge.plugin_write");
        assert.match(String(refused?.reason), /the type "Physics\.Habitat:leak" is not named under "Generated\."/);
        assert.equal(result.manifest.steps.filter((s) => s.capability === "forge.plugin_build").length, 1, "no compilation was spent on the refused files");
    });
});
