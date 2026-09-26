/**
 * The forge (docs/observateur-et-usines.fr.md, section 6.1): the guard on
 * the sources, then a generated plugin through the slot, in the order a
 * plugin goes: written, compiled in a child process, tested, checked,
 * loaded into the forge's registry, run by the runtime, proposed to the
 * station. No model, no key: the plugin is the test's fixture, a CO2 leak.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { checkSources, checkImports, importsOf } from "../slots/forge/plugin-check.js";
import { parseDiagnostics, pluginDir, type Build, type ForgeState, type LoadedPlugin, type TestRun } from "../slots/forge/provider.js";
import { taskDir } from "../slots/tools/lib/workshop.js";
import { leakFixture, leakSpec, LEAK_CONTRACT, LEAK_TYPE } from "../harness/scripted/code-fixture.js";
import { contractProblems, parseBehavior, satisfies } from "../slots/forge/contract.js";

const PORT = 3130;

const fixture = (type = LEAK_TYPE, unit = "kg/s", unwired = 1) => leakFixture(type, unit, unwired);

describe("the forge's guard on the sources", () => {
    it("reads the imports as written, and refuses what is not the substrate's core or the plugin's own files", () => {
        assert.deepEqual(importsOf(`import { a } from "@spiky-panda/core";\nimport "./x.js";\nexport { b } from "../y.js";\nconst c = await import("node:fs");\nconst d = require("child_process");`), ["@spiky-panda/core", "./x.js", "../y.js", "node:fs", "child_process"]);
        const bad = checkImports({ path: "src/a.node.ts", content: `import { readFileSync } from "node:fs";\nimport { x } from "../../lib/paths.js";\nimport { y } from "./b.js";\nimport { z } from "@spiky-panda/core";\nconst f = new Function("return 1");` });
        assert.deepEqual(bad.map((p) => p.what), [
            'imports "node:fs"; a generated plugin imports "@spiky-panda/core" and its own files, nothing else',
            'imports "../../lib/paths.js", which leaves the plugin\'s sources',
            "uses eval or the Function constructor; generated code is written, not evaluated",
        ]);
        assert.deepEqual(checkImports({ path: "src/a.test.ts", content: `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { A } from "./a.node.js";` }), []);
        assert.deepEqual(checkImports({ path: "src/a.node.ts", content: `import { test } from "node:test";` }).map((p) => p.what), ['imports "node:test"; a generated plugin imports "@spiky-panda/core" and its own files, nothing else']);
    });

    it("the layout: an entry exporting register, a node file, a test file, a card; nothing elsewhere", () => {
        assert.deepEqual(checkSources(fixture()), []);
        const missing = checkSources([{ path: "src/index.ts", content: "export const x = 1;" }, { path: "lib/other.ts", content: "" }]);
        assert.deepEqual(missing.map((p) => p.where), ["lib/other.ts", "src/index.ts", "src/", "src/", "docs/"]);
        assert.match(missing[1].what, /does not export register\(registry, doc\)/);
    });

    it("a capability contract: its shape judged, its behaviors parsed, a comparison with a tolerance", () => {
        assert.deepEqual(contractProblems(LEAK_CONTRACT), []);
        const bad = contractProblems({ inputs: { command: { quantity: "Dimensionless", unit: "fortnight" } }, outputs: {}, parameters: {}, behaviors: ["output(x=1) == 2", "nonsense"] });
        assert.equal(bad.length, 4, bad.join(" | "));
        assert.match(bad[0], /inputs "command": /);
        assert.equal(bad[1], "outputs: a capability produces at least one output");
        assert.match(bad[2], /"output" names the contract's one output, and the contract has 0/);
        assert.match(bad[3], /"nonsense" is not a behavior/);
        const p = parseBehavior("output(command=0.5) == -0.5 * rateKgps", LEAK_CONTRACT);
        assert.ok(p.ok);
        if (p.ok) {
            assert.deepEqual(p.behavior.inputs, { command: 0.5 });
            assert.equal(p.behavior.output, null);
            assert.equal(satisfies(p.behavior, -0.001, -0.001), true);
            assert.equal(satisfies(p.behavior, -0.0010000001, -0.001), true);
            assert.equal(satisfies(p.behavior, 0, -0.001), false);
        }
        const u = parseBehavior("co2Delta(unwired) >= -rateKgps", LEAK_CONTRACT);
        assert.ok(u.ok && u.behavior.inputs === null && u.behavior.output === "co2Delta");
    });

    it("tsc's diagnostics are read whole: file, line, column, code, message", () => {
        assert.deepEqual(parseDiagnostics("src/leak.node.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.\n", "C:/x"), [{ file: "src/leak.node.ts", line: 12, column: 5, code: "TS2322", message: "Type 'string' is not assignable to type 'number'." }]);
    });
});

describe("a generated plugin through the forge", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let broker: Broker;
    const taskId = `forge-test-${Date.now().toString(36)}`;
    const forge = () => slots.find((s) => s.slot === "forge") as unknown as PublishedSlot<ForgeState>;
    const call = async <T,>(tool: string, args: Record<string, unknown>): Promise<T> => {
        const r = await broker.call("forge", tool, args);
        if (!r.ok) throw new Error(r.error ?? `forge.${tool} failed`);
        return r.output as T;
    };

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        process.env.BIOMED_PROVIDER = "simulated";
        ({ broker: local, slots } = await startAllOrFail(PORT));
        broker = new Broker(local.httpBase, { name: "forge-test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        delete process.env.BIOMED_PROVIDER;
        await broker?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
        rmSync(taskDir(taskId), { recursive: true, force: true });
    });

    it("written, compiled, tested, checked, loaded, run and proposed: the leak node lives in the forge's catalogue and the station holds the proposal", async () => {
        // Written: a path outside src/ or docs/ is refused before anything is written.
        const refused = await call<{ ok: boolean; problems: Array<{ where: string; what: string }> }>("plugin_write", { taskId, plugin: "leak", files: [{ path: "../escape.ts", content: "" }] });
        assert.equal(refused.ok, false);
        assert.match(refused.problems[0].what, /is not a file of a plugin/);
        assert.equal(existsSync(pluginDir(taskId, "leak")), false);
        const written = await call<{ ok: boolean; files: string[]; sha256: string; problems: unknown[] }>("plugin_write", { taskId, plugin: "leak", files: fixture() });
        assert.equal(written.ok, true, JSON.stringify(written.problems));
        assert.deepEqual(written.files, ["docs/leak.md", "src/index.ts", "src/leak.node.ts", "src/leak.test.ts"]);

        // Nothing is loaded before a build and a test.
        const early = await broker.call("forge", "plugin_load", { taskId, plugin: "leak" });
        assert.equal(early.ok, false);
        assert.match(early.error ?? "", /no successful build/);

        // Compiled in a child process, on the allow-list.
        const build = await call<Build>("plugin_build", { taskId, plugin: "leak" });
        assert.equal(build.ok, true, JSON.stringify({ problems: build.problems, diagnostics: build.diagnostics }));
        assert.equal(build.sha256, written.sha256);
        assert.ok(existsSync(`${pluginDir(taskId, "leak")}/dist/index.js`));

        // Tested by node's runner, checked on a scratch registry.
        const tests = await call<TestRun & { build: string }>("plugin_test", { taskId, plugin: "leak" });
        assert.equal(tests.pass, 1, tests.output);
        assert.equal(tests.fail, 0);
        assert.deepEqual(tests.types.map((t) => [t.type, t.ok, t.problems]), [["Generated.Habitat:leak", true, []]]);
        assert.equal(tests.ok, true);

        // Accepted against the task's contract, run by the forge: the signature, the parameter, the four behaviors measured.
        const accepted = await call<{ ok: boolean; type: string; static: string[]; behaviors: Array<{ behavior: string; expected: number; actual: number; ok: boolean; reason?: string }> }>("plugin_acceptance", { taskId, plugin: "leak", contract: LEAK_CONTRACT });
        assert.equal(accepted.ok, true, JSON.stringify({ static: accepted.static, behaviors: accepted.behaviors }));
        assert.equal(accepted.type, "Generated.Habitat:leak");
        assert.deepEqual(accepted.behaviors.map((b) => [b.behavior, b.expected, b.actual, b.ok]), [
            ["output(command=0) == 0", 0, 0, true],
            ["output(command=0.5) == -0.5 * rateKgps", -0.001, -0.001, true],
            ["output(command=1) == -rateKgps", -0.002, -0.002, true],
            ["output(unwired) == -rateKgps", -0.002, -0.002, true],
        ]);

        // Loaded, by sha256; the runtime on the forge sees it.
        const loaded = await call<LoadedPlugin>("plugin_load", { taskId, plugin: "leak" });
        assert.deepEqual(loaded.types, ["Generated.Habitat:leak"]);
        assert.equal(loaded.id, `leak@${written.sha256.slice(0, 12)}`);
        assert.equal((await call<LoadedPlugin & { alreadyLoaded?: boolean }>("plugin_load", { taskId, plugin: "leak" })).alreadyLoaded, true);
        const found = await call<{ matches: Array<{ type: string }> }>("registry_search", { capabilities: ["leak"] });
        assert.equal(found.matches[0]?.type, "Generated.Habitat:leak");
        const twinSearch = await broker.call("twin", "registry_search", { capabilities: ["leak"] });
        assert.ok(twinSearch.ok && !(twinSearch.output as { matches: Array<{ type: string }> }).matches.some((m) => m.type.startsWith("Generated.")), "the twin's catalogue does not see the forge's plugin");
        const spec = leakSpec();
        const built = await call<{ ok: boolean; problems?: unknown[] }>("document_build", { spec, name: `${taskId}/leak-run` });
        assert.equal(built.ok, true, JSON.stringify(built.problems));
        const run = await call<{ ticks: number; summary: Record<string, { first: number; last: number }> }>("session_run", { name: `${taskId}/leak-run`, dt: 60, duration: 180, probes: [{ node: "leak", property: "co2DeltaKgps" }] });
        assert.ok(Math.abs(run.summary["leak.co2DeltaKgps"].last + 1e-5) < 1e-9, JSON.stringify(run.summary));

        // Proposed to the station, and nowhere else.
        const proposal = await call<{ stationProposalId: string | null; note: string; artifact: { types: string[]; tests: { pass: number } } }>("plugin_promote", { taskId, plugin: "leak", reportId: "a".repeat(64), verdict: "pass" });
        assert.ok(proposal.stationProposalId, proposal.note);
        assert.deepEqual(proposal.artifact.types, ["Generated.Habitat:leak"]);
        assert.ok(existsSync(`${pluginDir(taskId, "leak")}/artifact.json`));
        const state = forge().state;
        assert.deepEqual(state.plugins.map((p) => p.id), [loaded.id]);
        assert.equal(state.proposals.length, 1);
        assert.equal(state.builds.filter((b) => b.plugin === "leak").length, 1);
    });

    it("the contract catches what the model's own tests do not: a node that takes an unwired command as 0 where the contract says 1, refused with the value measured, and not loaded", async () => {
        const w = await call<{ ok: boolean }>("plugin_write", { taskId, plugin: "leak-unwired", files: fixture("Generated.Habitat:leak_unwired", "kg/s", 0) });
        assert.equal(w.ok, true);
        const build = await call<Build>("plugin_build", { taskId, plugin: "leak-unwired" });
        assert.equal(build.ok, true, JSON.stringify(build.diagnostics));
        const tests = await call<TestRun>("plugin_test", { taskId, plugin: "leak-unwired" });
        assert.equal(tests.ok, true, "the plugin's own tests and the checks pass: they say nothing of the unwired case");
        const accepted = await call<{ ok: boolean; behaviors: Array<{ behavior: string; expected: number; actual: number; ok: boolean; reason?: string }> }>("plugin_acceptance", { taskId, plugin: "leak-unwired", contract: LEAK_CONTRACT });
        assert.equal(accepted.ok, false);
        const failed = accepted.behaviors.filter((b) => !b.ok);
        assert.deepEqual(failed.map((b) => [b.behavior, b.expected, b.actual]), [["output(unwired) == -rateKgps", -0.002, 0]]);
        assert.match(failed[0].reason ?? "", /co2Delta\(unwired\) is 0, the contract says == -0\.002 \(-rateKgps\)/);
        const load = await broker.call("forge", "plugin_load", { taskId, plugin: "leak-unwired" });
        assert.equal(load.ok, false);
        assert.match(load.error ?? "", /did not satisfy its contract/);
        // A signature short of a contract port, and a parameter the node lacks, are named without a run.
        const other = await call<{ ok: boolean; static: string[] }>("plugin_acceptance", { taskId, plugin: "leak-unwired", contract: { ...LEAK_CONTRACT, inputs: { ...LEAK_CONTRACT.inputs, pressure: { quantity: "Pressure", unit: "Pa" } }, parameters: { rateKgps: LEAK_CONTRACT.parameters.rateKgps, lagSeconds: { quantity: "Time", unit: "s", editable: true } } } });
        assert.equal(other.ok, false);
        assert.deepEqual(other.static, ['inputs "pressure" (Pressure, Pa) is required by the contract and not declared by the signature', 'parameter "lagSeconds" is required by the contract and the node has no setter by that name (an @editable getter and setter)']);
    });

    it("the forge's template compiles, passes its test and the checks: what it hands out is what it accepts", async () => {
        const template = await call<{ plugin: string; files: Array<{ path: string; content: string }>; note: string }>("plugin_template", {});
        assert.deepEqual(template.files.map((f) => f.path), ["src/index.ts", "src/gain.node.ts", "src/gain.test.ts", "docs/gain.md"]);
        const w = await call<{ ok: boolean; problems: unknown[] }>("plugin_write", { taskId, plugin: template.plugin, files: template.files });
        assert.equal(w.ok, true, JSON.stringify(w.problems));
        const build = await call<Build>("plugin_build", { taskId, plugin: template.plugin });
        assert.equal(build.ok, true, JSON.stringify(build.diagnostics));
        const tests = await call<TestRun>("plugin_test", { taskId, plugin: template.plugin });
        assert.equal(tests.ok, true, JSON.stringify({ output: tests.output, types: tests.types }));
        assert.deepEqual(tests.types.map((t) => t.type), ["Generated.Example:gain"]);
    });

    it("refused by the checks: a type not named under Generated. and a unit the units service does not know; refused by the compiler: a type error named", async () => {
        const w = await call<{ ok: boolean }>("plugin_write", { taskId, plugin: "leak-bad", files: fixture("Physics.Habitat:leak", "kg/fortnight") });
        assert.equal(w.ok, true);
        const build = await call<Build>("plugin_build", { taskId, plugin: "leak-bad" });
        assert.equal(build.ok, true, JSON.stringify(build.diagnostics));
        const tests = await call<TestRun>("plugin_test", { taskId, plugin: "leak-bad" });
        assert.equal(tests.pass, 1);
        assert.equal(tests.ok, false);
        const [check] = tests.types;
        assert.equal(check.type, "Physics.Habitat:leak");
        assert.match(check.problems[0], /is not named under "Generated\."/);
        assert.ok(check.problems.some((p) => /port "co2Delta"/.test(p)), check.problems.join("; "));
        const load = await broker.call("forge", "plugin_load", { taskId, plugin: "leak-bad" });
        assert.equal(load.ok, false);
        assert.match(load.error ?? "", /did not pass its tests and checks/);

        const broken = await call<{ ok: boolean }>("plugin_write", { taskId, plugin: "leak-broken", files: fixture().map((f) => (f.path === "src/leak.node.ts" ? { ...f, content: f.content.replace("const delta = -this._rate * command;", 'const delta: number = "not a number";') } : f)) });
        assert.equal(broken.ok, true);
        const failed = await call<Build>("plugin_build", { taskId, plugin: "leak-broken" });
        assert.equal(failed.ok, false);
        assert.equal(failed.diagnostics[0]?.file, "src/leak.node.ts");
        assert.equal(failed.diagnostics[0]?.code, "TS2322");

        const foreign = await call<{ ok: boolean; problems: Array<{ what: string }> }>("plugin_write", { taskId, plugin: "leak-foreign", files: fixture().map((f) => (f.path === "src/leak.node.ts" ? { ...f, content: `import { readFileSync } from "node:fs";\n${f.content}` } : f)) });
        assert.equal(foreign.ok, false);
        assert.match(foreign.problems[0].what, /imports "node:fs"/);
        const notBuilt = await call<Build>("plugin_build", { taskId, plugin: "leak-foreign" });
        assert.equal(notBuilt.ok, false);
        assert.equal(notBuilt.ms, 0, "refused before any compilation");
    });
});
