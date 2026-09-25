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
import { checkSources, checkImports, importsOf, GENERATED_PREFIX } from "../slots/forge/plugin-check.js";
import { parseDiagnostics, pluginDir, type Build, type ForgeState, type LoadedPlugin, type TestRun } from "../slots/forge/provider.js";
import { taskDir } from "../slots/tools/lib/workshop.js";

const PORT = 3130;

const INDEX = `import type { NodeRegistry } from "@spiky-panda/core";
import { createLeakNode, LeakNode } from "./leak.node.js";

export const LEAK_TYPE = "TYPE_NAME";

export function register(registry: NodeRegistry, doc: (file: string) => string): void {
    const reg = registry as unknown as { register: (type: string, factory: () => unknown, meta: Record<string, unknown>) => void };
    const node = new LeakNode();
    reg.register(LEAK_TYPE, () => createLeakNode(), {
        label: "CO2 leak",
        category: "Generated.Habitat",
        docPath: doc("leak.md"),
        inputPorts: [...node.inputPorts],
        outputPorts: [...node.outputPorts],
        signature: {
            purpose: "a leak of CO2 out of a volume: a constant mass flow scaled by a command, for an atmosphere's delta_CO2 input",
            inputs: { command: { quantity: "Dimensionless", unit: "ratio", description: "0 to 1, how open the leak is; 1 when unwired" } },
            outputs: { co2Delta: { quantity: "MassFlow", unit: "UNIT_NAME", description: "minus the mass leaking per second" } },
            capabilities: ["sink", "co2", "leak"],
        },
    });
}
`;

const NODE = `import { cloneable, editable, viewable, inSlotOf, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IChannel, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";

/** A leak: CO2 leaves the volume at a constant rate, scaled by a command. */
export class LeakNode extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _rate: number = 1e-5;
    @cloneable private _delta: number = 0;

    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "command", optional: true, type: "float", kind: "signal" }];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "co2Delta", optional: false, type: "float", kind: "signal" }];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** The mass leaking per second at full opening, kg/s. */
    @editable("number") public get rateKgps(): number {
        return this._rate;
    }
    public set rateKgps(v: number) {
        this.setField("rateKgps", this._rate, Math.max(0, v), (n) => (this._rate = n));
    }
    /** What left on the last tick, kg/s (negative). */
    @viewable("number") public get co2DeltaKgps(): number {
        return this._delta;
    }

    public override reset(_session: ISession): void {
        this._delta = 0;
    }

    public override fire(session: ISession, _t: number): void {
        const links = session.graph.links as ReadonlyArray<IChannel>;
        let command = 1;
        for (const link of this.opsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx < 0 || String(inSlotOf(link)) !== "command") continue;
            const v = session.readSignal(idx);
            if (typeof v === "number" && Number.isFinite(v)) command = Math.max(0, Math.min(1, v));
        }
        const delta = -this._rate * command;
        this.setField("co2DeltaKgps", this._delta, delta, (n) => (this._delta = n));
        for (const link of this.onsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx >= 0 && String(link.slot) === "co2Delta") session.publish(idx, delta);
        }
    }
}

export function createLeakNode(): LeakNode {
    return new LeakNode();
}
`;

const TEST = `import { test } from "node:test";
import assert from "node:assert/strict";
import { LeakNode } from "./leak.node.js";

test("the leak's rate is editable and never negative; its ports are declared", () => {
    const node = new LeakNode();
    node.rateKgps = 2e-5;
    assert.equal(node.rateKgps, 2e-5);
    node.rateKgps = -1;
    assert.equal(node.rateKgps, 0);
    assert.deepEqual(node.outputPorts.map((p) => p.slot), ["co2Delta"]);
    assert.deepEqual(node.inputPorts.map((p) => p.slot), ["command"]);
});
`;

const CARD = `# CO2 leak (generated)

A leak out of a volume: a constant mass flow of CO2, in kg/s, scaled by a command between 0 and 1 (1 when nothing is wired). Wire \`co2Delta\` into an atmosphere's \`delta_CO2\` input. Generated in the forge; not a hand-written node.
`;

const fixture = (type = `${GENERATED_PREFIX}Habitat:leak`, unit = "kg/s") => [
    { path: "src/index.ts", content: INDEX.replace("TYPE_NAME", type).replace("UNIT_NAME", unit) },
    { path: "src/leak.node.ts", content: NODE },
    { path: "src/leak.test.ts", content: TEST },
    { path: "docs/leak.md", content: CARD },
];

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

        // Loaded, by sha256; the runtime on the forge sees it.
        const loaded = await call<LoadedPlugin>("plugin_load", { taskId, plugin: "leak" });
        assert.deepEqual(loaded.types, ["Generated.Habitat:leak"]);
        assert.equal(loaded.id, `leak@${written.sha256.slice(0, 12)}`);
        assert.equal((await call<LoadedPlugin & { alreadyLoaded?: boolean }>("plugin_load", { taskId, plugin: "leak" })).alreadyLoaded, true);
        const found = await call<{ matches: Array<{ type: string }> }>("registry_search", { capabilities: ["leak"] });
        assert.equal(found.matches[0]?.type, "Generated.Habitat:leak");
        const twinSearch = await broker.call("twin", "registry_search", { capabilities: ["leak"] });
        assert.ok(twinSearch.ok && !(twinSearch.output as { matches: Array<{ type: string }> }).matches.some((m) => m.type.startsWith("Generated.")), "the twin's catalogue does not see the forge's plugin");
        const spec = {
            nodes: [
                { id: "command", typeId: "Logic.Time:timeline", params: { segments: JSON.stringify([{ from: 0, to: 1e9, value: 0.5 }]), defaultValue: 0.5 } },
                { id: "leak", typeId: "Generated.Habitat:leak", params: { rateKgps: 2e-5 } },
            ],
            connections: [{ from: ["command", "value"], to: ["leak", "command"] }],
        };
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
