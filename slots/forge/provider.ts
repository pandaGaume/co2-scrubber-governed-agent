/**
 * The `forge` slot: the code sandbox (docs/observateur-et-usines.fr.md,
 * section 6.1; decided 2026-09-25 at night). Where an artifact of the model
 * runs as code and not as data, and so a slot of its own on the broker,
 * with its tools, its grammar, its resources and its guard, like `twin` or
 * `library`. Nothing enters the twin's process until it has come out of
 * here, and the forge never pushes anything.
 *
 * Its own runtime: a registry of its own (the substrate's plugins and the
 * hand-written habitat plugin, the generated plugins loaded on top), with
 * the substrate's runtime surface on it (`registry_search`,
 * `registry_describe_node`, `document_build`, `session_run`: the same tools
 * as the twin's, so `graph.evaluate` targets `runtimeSlot: "forge"` and
 * nothing else changes). Its own tools, in the order a plugin goes through:
 *
 *   plugin_template  a complete minimal plugin exactly as the substrate
 *                    accepts it (a gain), to write one on its shape
 *   plugin_write     the files of a plugin into the task's workshop
 *                    (outputs/factory/<task>/forge/<plugin>/): sources under
 *                    src/, cards under docs/; the layout and the imports
 *                    checked as they are written (plugin-check.ts)
 *   plugin_build     the compilation, in a child process (tsc), imports on
 *                    the allow-list, a time budget, the diagnostics whole
 *   plugin_test      the plugin's own tests (node:test, a child process, a
 *                    time budget) and the deterministic checks on a scratch
 *                    registry: types under Generated., a signature present
 *                    and valid for the substrate, every unit resolved by the
 *                    units service, the card on disk
 *   plugin_acceptance the capability contract the task wrote (never the
 *                    model): the signature against its inputs and outputs
 *                    (the units service), its parameters as editables of the
 *                    node, and every behavior run on a scratch runtime (the
 *                    node in a document, its inputs wired at the values or
 *                    left unwired, its output read through a transducer)
 *                    and compared with the formula; the forge's own tests,
 *                    derived from the contract, beside the model's
 *   plugin_load      the plugin into the forge's live registry, by its
 *                    sha256; refused before a positive test; a type the
 *                    registry already holds is never overridden
 *   plugin_promote   a signed artifact (the plugin, its sha256, its types,
 *                    its tests and checks, the evaluate report the caller
 *                    names) proposed to the station and nowhere else: Mother
 *                    keeps it, the commander authorises, the twin loads.
 *
 * Resources: `forge://plugins` (loaded, sha256 and provenance),
 * `forge://builds` (every compilation and test, passed or not),
 * `forge://proposals`.
 *
 * The isolation, said as it is: the compilation and the tests run in child
 * processes with a working directory of their own, an emptied environment
 * and a time budget; the loaded plugin runs in the forge's process, which is
 * the demo's process unless the forge is started on its own
 * (`slots/forge/main.ts`, `npm run forge`). No network isolation is done.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { MemoryDocumentStore, RuntimeBehavior, RuntimeController } from "@spiky-panda/mcp/runtime";
import type { NodeRegistry } from "@spiky-panda/core";
import { fromRoot, ROOT } from "../../lib/paths.js";
import { buildRegistry, type Registry } from "../../lib/registry.js";
import { Broker } from "../../harness/lib/broker.js";
import { objectSchema, publishSlot, type PublishedSlot, type SlotTool } from "../lib/slot-server.js";
import { runtimeEvents } from "../lib/events.js";
import { checkPath, checkSources, checkTypes, type PluginFile, type Problem, type TypeCheck } from "./plugin-check.js";
import { sha256Of, taskDir, WorkshopDocumentStore } from "../tools/lib/workshop.js";
import { TEMPLATE_FILES, TEMPLATE_NOTE } from "./template.js";
import { contractProblems, expectedOf, parameterProblems, parameterValues, parseBehavior, satisfies, signatureProblems, type Behavior, type CapabilityContract } from "./contract.js";

const VERSION = "0.1.0";
export const PLUGINS_URI = "forge://plugins";
export const BUILDS_URI = "forge://builds";
export const PROPOSALS_URI = "forge://proposals";

const PLUGIN_NAME = /^[a-z][a-z0-9-]{0,39}$/;
const BUILD_BUDGET_MS = 120_000;
const TEST_BUDGET_MS = 60_000;
const MAX_FILE_BYTES = 200_000;
const MAX_OUTPUT_CHARS = 20_000;

export interface Diagnostic {
    file: string;
    line: number;
    column: number;
    code: string;
    message: string;
}

export interface Build {
    id: string;
    taskId: string;
    plugin: string;
    at: string;
    sha256: string;
    ok: boolean;
    ms: number;
    /** What refused the plugin before or during compilation. */
    problems: Problem[];
    diagnostics: Diagnostic[];
    /** The tests and checks, once plugin_test ran on this build. */
    tests?: TestRun;
    /** The contract's acceptance, once plugin_acceptance ran on this build. */
    acceptance?: Acceptance;
}

export interface BehaviorResult {
    behavior: string;
    expected: number | null;
    actual: number | null;
    ok: boolean;
    reason?: string;
}

export interface Acceptance {
    at: string;
    ok: boolean;
    type: string | null;
    /** The signature and the parameters against the contract. */
    static: string[];
    behaviors: BehaviorResult[];
    ms: number;
}

export interface TestRun {
    at: string;
    ok: boolean;
    ms: number;
    pass: number;
    fail: number;
    output: string;
    types: TypeCheck[];
}

export interface LoadedPlugin {
    id: string;
    taskId: string;
    plugin: string;
    sha256: string;
    types: string[];
    loadedAt: string;
    files: Array<{ path: string; sha256: string }>;
}

export interface Proposal {
    id: string;
    at: string;
    taskId: string;
    plugin: string;
    sha256: string;
    artifactSha256: string;
    path: string;
    stationProposalId: string | null;
    note: string;
}

export interface ForgeState {
    builds: Build[];
    plugins: LoadedPlugin[];
    proposals: Proposal[];
}

export interface ForgeSlotOptions {
    /** The registry the forge runs on; by default the demo's (substrate plugins plus the habitat plugin), built fresh for this slot. */
    registry?: () => Registry;
    buildBudgetMs?: number;
    testBudgetMs?: number;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The plugin's directory inside a task's workshop. */
export function pluginDir(taskId: string, plugin: string): string {
    if (!PLUGIN_NAME.test(plugin)) throw new Error(`plugin "${plugin}" is not a plugin name (lowercase letters, digits, dashes, 40 at most)`);
    return path.join(taskDir(taskId), "forge", plugin);
}

/** The source and card files of a plugin on disk, sorted by path. */
export function readPluginFiles(dir: string): PluginFile[] {
    const out: PluginFile[] = [];
    const walk = (sub: string) => {
        const full = path.join(dir, sub);
        if (!existsSync(full)) return;
        for (const entry of readdirSync(full, { withFileTypes: true })) {
            const rel = `${sub}/${entry.name}`;
            if (entry.isFile()) out.push({ path: rel, content: readFileSync(path.join(dir, ...rel.split("/")), "utf8") });
        }
    };
    walk("src");
    walk("docs");
    return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** One sha256 for a plugin: its files, path and content, in path order. */
export const pluginSha256 = (files: PluginFile[]): string => sha256Of(files.map((f) => `${f.path}\n${f.content}\n`).join(""));

/** A child process with a time budget: its exit code, its output, and whether it was cut. */
function run(command: string, args: string[], cwd: string, budgetMs: number): Promise<{ code: number | null; output: string; timedOut: boolean; ms: number }> {
    return new Promise((resolve) => {
        const t0 = Date.now();
        // An emptied environment: the path to find node, nothing of this process's keys.
        const env: Record<string, string> = { PATH: process.env.PATH ?? "", SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot ?? "", TEMP: process.env.TEMP ?? "", TMP: process.env.TMP ?? "", NODE_OPTIONS: "" };
        const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        let output = "";
        let timedOut = false;
        const keep = (chunk: Buffer) => {
            if (output.length < MAX_OUTPUT_CHARS) output += chunk.toString("utf8");
        };
        child.stdout.on("data", keep);
        child.stderr.on("data", keep);
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, budgetMs);
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ code, output: output.slice(0, MAX_OUTPUT_CHARS), timedOut, ms: Date.now() - t0 });
        });
        child.on("error", (e) => {
            clearTimeout(timer);
            resolve({ code: null, output: `${output}\n${e.message}`, timedOut, ms: Date.now() - t0 });
        });
    });
}

/** tsc's diagnostics, parsed from its output: file(line,col): error TSxxxx: message. */
export function parseDiagnostics(output: string, dir: string): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const m of output.matchAll(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm)) {
        const file = path.isAbsolute(m[1]) ? path.relative(dir, m[1]).split(path.sep).join("/") : m[1].replace(/\\/g, "/");
        out.push({ file, line: Number(m[2]), column: Number(m[3]), code: m[4], message: m[5].trim() });
    }
    return out;
}

/** The plugin's own resolution of `@spiky-panda/core` and `@types/node`: the repository's node_modules, reached by walking up when the workshop is inside the repository, linked in otherwise. */
function linkModules(dir: string): void {
    if (path.resolve(dir).startsWith(path.resolve(ROOT) + path.sep)) return;
    const link = path.join(dir, "node_modules");
    if (existsSync(link)) return;
    symlinkSync(fromRoot("node_modules"), link, process.platform === "win32" ? "junction" : "dir");
}

export function forgeSlot(wsBase: string, log: (line: string) => void, options: ForgeSlotOptions = {}): PublishedSlot<ForgeState> {
    const httpBase = wsBase.replace(/^ws(s?):\/\//, "http$1://");
    const state: ForgeState = { builds: [], plugins: [], proposals: [] };
    const buildBudget = options.buildBudgetMs ?? BUILD_BUDGET_MS;
    const testBudget = options.testBudgetMs ?? TEST_BUDGET_MS;
    let live: Registry | null = null;
    const registry = (): Registry => {
        if (!live) live = (options.registry ?? buildRegistry)();
        return live;
    };
    // The modules imported, by plugin sha256: the same module object registers on the scratch registry (the checks) and on the live one (the load).
    const modules = new Map<string, { register: (registry: NodeRegistry, doc: (file: string) => string) => void | Promise<void> }>();

    const lastBuild = (taskId: string, plugin: string): Build | undefined => [...state.builds].reverse().find((b) => b.taskId === taskId && b.plugin === plugin);
    const docOf = (dir: string) => (file: string) => path.join(dir, "docs", file);

    const importPlugin = async (dir: string, sha256: string) => {
        const cached = modules.get(sha256);
        if (cached) return cached;
        const entry = path.join(dir, "dist", "index.js");
        if (!existsSync(entry)) throw new Error(`no compiled entry at ${path.relative(ROOT, entry).split(path.sep).join("/")}: build the plugin first`);
        const mod = (await import(`${pathToFileURL(entry).href}?sha=${sha256.slice(0, 16)}`)) as { register?: unknown };
        if (typeof mod.register !== "function") throw new Error("the compiled entry exports no register(registry, doc) function");
        const loaded = { register: mod.register as (registry: NodeRegistry, doc: (file: string) => string) => void };
        modules.set(sha256, loaded);
        return loaded;
    };

    const tools: SlotTool<ForgeState>[] = [
        {
            name: "plugin_template",
            inputSchema: objectSchema({}),
            handle: () => ({ note: TEMPLATE_NOTE, plugin: "gain-template", files: TEMPLATE_FILES }),
        },
        {
            name: "plugin_write",
            inputSchema: objectSchema(
                {
                    taskId: { type: "string" },
                    plugin: { type: "string", description: "the plugin's name: lowercase letters, digits, dashes" },
                    files: { type: "array", items: { type: "object", properties: { path: { type: "string", description: "src/<name>.ts, src/<name>.test.ts or docs/<name>.md" }, content: { type: "string" } }, required: ["path", "content"] } },
                    replace: { type: "boolean", description: "true to start the plugin over: what was written before is removed first" },
                },
                ["taskId", "plugin", "files"],
            ),
            handle: (args) => {
                const taskId = str(args.taskId);
                const plugin = str(args.plugin);
                const dir = pluginDir(taskId, plugin);
                const files = (Array.isArray(args.files) ? args.files : []) as Array<{ path?: unknown; content?: unknown }>;
                if (!files.length) throw new Error("no file to write");
                const problems: Problem[] = [];
                const written: Array<{ path: string; sha256: string; bytes: number }> = [];
                for (const f of files) {
                    const p = str(f.path).replace(/\\/g, "/");
                    const bad = checkPath(p);
                    if (bad) problems.push({ where: p, what: bad });
                    else if (typeof f.content !== "string") problems.push({ where: p, what: "content is not text" });
                    else if (Buffer.byteLength(f.content, "utf8") > MAX_FILE_BYTES) problems.push({ where: p, what: `${Buffer.byteLength(f.content, "utf8")} bytes; a file of a plugin is ${MAX_FILE_BYTES} at most` });
                }
                if (problems.length) return { ok: false, problems };
                if (args.replace === true && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
                for (const f of files) {
                    const p = str(f.path).replace(/\\/g, "/");
                    const full = path.join(dir, ...p.split("/"));
                    mkdirSync(path.dirname(full), { recursive: true });
                    writeFileSync(full, f.content as string, "utf8");
                    written.push({ path: p, sha256: sha256Of(f.content as string), bytes: Buffer.byteLength(f.content as string, "utf8") });
                }
                // The layout and the imports, judged on the whole plugin as it now stands: a refusal here is a refusal before any compilation.
                const all = readPluginFiles(dir);
                const layout = checkSources(all);
                // The sources whole, as the plugin now stands: a builder on the reasoning state corrects what it reads here, not what it remembers.
                return { ok: layout.length === 0, plugin, written, files: all.map((f) => f.path), sources: all, sha256: pluginSha256(all), problems: layout };
            },
        },
        {
            name: "plugin_build",
            inputSchema: objectSchema({ taskId: { type: "string" }, plugin: { type: "string" } }, ["taskId", "plugin"]),
            handle: async (args, s) => {
                const taskId = str(args.taskId);
                const plugin = str(args.plugin);
                const dir = pluginDir(taskId, plugin);
                const files = readPluginFiles(dir);
                if (!files.length) throw new Error(`plugin "${plugin}" has no file in task ${taskId}: write it first (plugin_write)`);
                const sha256 = pluginSha256(files);
                const id = `b${(s.builds.length + 1).toString().padStart(4, "0")}-${sha256.slice(0, 8)}`;
                const at = new Date().toISOString();
                const problems = checkSources(files);
                if (problems.length) {
                    const build: Build = { id, taskId, plugin, at, sha256, ok: false, ms: 0, problems, diagnostics: [] };
                    s.builds.push(build);
                    log(`[forge] ${id}: ${plugin} refused before compilation (${problems.length} problem(s))`);
                    return build;
                }
                rmSync(path.join(dir, "dist"), { recursive: true, force: true });
                linkModules(dir);
                const tsconfig = {
                    compilerOptions: { target: "ES2022", lib: ["ES2022"], module: "NodeNext", moduleResolution: "NodeNext", types: ["node"], strict: true, noImplicitOverride: true, esModuleInterop: true, experimentalDecorators: true, skipLibCheck: true, sourceMap: false, declaration: false, rootDir: "src", outDir: "dist" },
                    include: ["src/**/*.ts"],
                };
                writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2), "utf8");
                const tsc = fromRoot("node_modules", "typescript", "bin", "tsc");
                const r = await run(process.execPath, [tsc, "-p", "tsconfig.json", "--pretty", "false"], dir, buildBudget);
                const diagnostics = parseDiagnostics(r.output, dir);
                const ok = !r.timedOut && r.code === 0 && diagnostics.length === 0 && existsSync(path.join(dir, "dist", "index.js"));
                const failures: Problem[] = [];
                if (r.timedOut) failures.push({ where: "tsc", what: `the compilation exceeded its budget of ${buildBudget} ms and was stopped` });
                else if (!ok && !diagnostics.length) failures.push({ where: "tsc", what: `exit code ${r.code}: ${r.output.trim().slice(0, 2000) || "no output"}` });
                const build: Build = { id, taskId, plugin, at, sha256, ok, ms: r.ms, problems: failures, diagnostics };
                s.builds.push(build);
                log(`[forge] ${id}: ${plugin} ${ok ? "compiled" : "failed"} in ${r.ms} ms${diagnostics.length ? ` (${diagnostics.length} diagnostic(s))` : ""}`);
                return build;
            },
        },
        {
            name: "plugin_test",
            inputSchema: objectSchema({ taskId: { type: "string" }, plugin: { type: "string" } }, ["taskId", "plugin"]),
            handle: async (args, s) => {
                const taskId = str(args.taskId);
                const plugin = str(args.plugin);
                const dir = pluginDir(taskId, plugin);
                const files = readPluginFiles(dir);
                const sha256 = pluginSha256(files);
                const build = lastBuild(taskId, plugin);
                if (!build || !build.ok) throw new Error(`plugin "${plugin}" has no successful build: compile it first (plugin_build)`);
                if (build.sha256 !== sha256) throw new Error(`plugin "${plugin}" changed since its last build (${build.sha256.slice(0, 8)}): compile it again`);
                const at = new Date().toISOString();
                // The plugin's own tests, in a child process with a budget: node's runner on the compiled test files.
                const testFiles = files.filter((f) => /\.test\.ts$/.test(f.path)).map((f) => path.join(dir, "dist", ...f.path.replace(/^src\//, "").replace(/\.ts$/, ".js").split("/")));
                const r = await run(process.execPath, ["--test", ...testFiles], dir, testBudget);
                const pass = Number(/^# pass (\d+)/m.exec(r.output)?.[1] ?? 0);
                const fail = Number(/^# fail (\d+)/m.exec(r.output)?.[1] ?? 0);
                let output = r.output.trim();
                if (r.timedOut) output = `the tests exceeded their budget of ${testBudget} ms and were stopped\n${output}`;
                const testsOk = !r.timedOut && r.code === 0 && fail === 0 && pass > 0;
                // The deterministic checks, on a scratch registry: what the plugin registers, judged before it touches the live one.
                let types: TypeCheck[] = [];
                try {
                    const mod = await importPlugin(dir, sha256);
                    const scratch = (options.registry ?? buildRegistry)();
                    const before = new Set(scratch.types());
                    await mod.register(scratch as unknown as NodeRegistry, docOf(dir));
                    const registered = scratch.types().filter((t) => !before.has(t));
                    types = checkTypes(scratch as unknown as NodeRegistry, before, registered);
                } catch (e) {
                    types = [{ type: "(load)", ok: false, problems: [`the plugin could not register on a scratch registry: ${e instanceof Error ? e.message : String(e)}`] }];
                }
                const tests: TestRun = { at, ok: testsOk && types.every((t) => t.ok), ms: r.ms, pass, fail, output: output.slice(0, 8000), types };
                build.tests = tests;
                log(`[forge] ${build.id}: ${plugin} tests ${pass} passed, ${fail} failed; checks ${types.every((t) => t.ok) ? "ok" : "refused"}`);
                return { build: build.id, sha256, ...tests };
            },
        },
        {
            name: "plugin_acceptance",
            inputSchema: objectSchema({ taskId: { type: "string" }, plugin: { type: "string" }, contract: { type: "object", description: "the capability contract: inputs, outputs, parameters, behaviors" } }, ["taskId", "plugin", "contract"]),
            handle: async (args, s) => {
                const taskId = str(args.taskId);
                const plugin = str(args.plugin);
                const dir = pluginDir(taskId, plugin);
                const files = readPluginFiles(dir);
                const sha256 = pluginSha256(files);
                const build = lastBuild(taskId, plugin);
                if (!build || !build.ok || build.sha256 !== sha256) throw new Error(`plugin "${plugin}" has no successful build of its current files: compile it first (plugin_build)`);
                const shape = contractProblems(args.contract);
                if (shape.length) throw new Error(`the contract is not one the forge can run: ${shape.join("; ")}`);
                const contract = args.contract as unknown as CapabilityContract;
                const t0 = Date.now();
                const result = await acceptPlugin(dir, sha256, contract);
                const acceptance: Acceptance = { at: new Date().toISOString(), ...result, ms: Date.now() - t0 };
                build.acceptance = acceptance;
                log(`[forge] ${build.id}: ${plugin} acceptance ${acceptance.ok ? "held" : "refused"} (${acceptance.behaviors.filter((b) => b.ok).length}/${acceptance.behaviors.length} behavior(s), ${acceptance.static.length} static problem(s))`);
                return { build: build.id, sha256, ...acceptance };
            },
        },
        {
            name: "plugin_load",
            inputSchema: objectSchema({ taskId: { type: "string" }, plugin: { type: "string" } }, ["taskId", "plugin"]),
            handle: async (args, s) => {
                const taskId = str(args.taskId);
                const plugin = str(args.plugin);
                const dir = pluginDir(taskId, plugin);
                const files = readPluginFiles(dir);
                const sha256 = pluginSha256(files);
                const build = lastBuild(taskId, plugin);
                if (!build || !build.ok || build.sha256 !== sha256) throw new Error(`plugin "${plugin}" has no successful build of its current files: compile it first (plugin_build)`);
                if (!build.tests) throw new Error(`plugin "${plugin}" was not tested: run plugin_test first`);
                if (!build.tests.ok) throw new Error(`plugin "${plugin}" did not pass its tests and checks (build ${build.id}): nothing is loaded from a refused plugin`);
                if (build.acceptance && !build.acceptance.ok) throw new Error(`plugin "${plugin}" did not satisfy its contract (build ${build.id}: ${[...build.acceptance.static, ...build.acceptance.behaviors.filter((b) => !b.ok).map((b) => b.reason ?? b.behavior)].join("; ")}): nothing is loaded from a refused plugin`);
                const already = s.plugins.find((p) => p.sha256 === sha256);
                if (already) return { ...already, alreadyLoaded: true };
                const reg = registry();
                const held = reg.types().filter((t) => build.tests!.types.some((c) => c.type === t));
                if (held.length) throw new Error(`the forge's registry already holds ${held.join(", ")}: a generated plugin never overrides a type (change the plugin's types, or the plugin already loaded is the one to use)`);
                const mod = await importPlugin(dir, sha256);
                const before = new Set(reg.types());
                await mod.register(reg as unknown as NodeRegistry, docOf(dir));
                const types = reg.types().filter((t) => !before.has(t));
                const loaded: LoadedPlugin = { id: `${plugin}@${sha256.slice(0, 12)}`, taskId, plugin, sha256, types, loadedAt: new Date().toISOString(), files: files.map((f) => ({ path: f.path, sha256: sha256Of(f.content) })) };
                s.plugins.push(loaded);
                log(`[forge] loaded ${loaded.id}: ${types.join(", ")}`);
                return loaded;
            },
        },
        {
            name: "plugin_promote",
            // No verdict from the caller: what the artifact says of the plugin is what the forge measured (its tests, its checks, the contract's acceptance).
            inputSchema: objectSchema(
                {
                    taskId: { type: "string" },
                    plugin: { type: "string" },
                    claims: { type: "object", description: "what the proposal claims, for the record; the forge's own record (tests, checks, acceptance) is attached whatever is claimed" },
                },
                ["taskId", "plugin"],
            ),
            handle: async (args, s) => {
                const taskId = str(args.taskId);
                const plugin = str(args.plugin);
                // The plugin as its files stand now, by sha256: the same bytes loaded once (from this task or another) serve every task that writes them.
                const dir = pluginDir(taskId, plugin);
                const current = pluginSha256(readPluginFiles(dir));
                const loaded = [...s.plugins].reverse().find((p) => p.sha256 === current);
                if (!loaded) throw new Error(`plugin "${plugin}" is not loaded in the forge (its files' sha256 ${current.slice(0, 8)} was never loaded): nothing is proposed before it was built, tested and loaded here`);
                const build = s.builds.find((b) => b.sha256 === loaded.sha256 && b.tests?.ok);
                if (!build?.tests) throw new Error(`plugin "${plugin}": no passed test run for ${loaded.sha256.slice(0, 8)}`);
                const artifact = {
                    kind: "plugin",
                    plugin,
                    taskId,
                    sha256: loaded.sha256,
                    files: loaded.files,
                    types: loaded.types,
                    build: { id: build.id, at: build.at, ms: build.ms },
                    tests: { at: build.tests.at, pass: build.tests.pass, fail: build.tests.fail, checks: build.tests.types },
                    // The contract's acceptance as the forge ran it, or null when no contract was given: an artifact without one says so.
                    acceptance: build.acceptance ?? null,
                    proposedAt: new Date().toISOString(),
                };
                const text = JSON.stringify(artifact, null, 2);
                const artifactSha256 = sha256Of(text);
                const file = path.join(dir, "artifact.json");
                writeFileSync(file, text, "utf8");
                const rel = path.relative(taskDir(taskId), file).split(path.sep).join("/");
                // Proposed to the station, and nowhere else: Mother keeps it, the commander authorises, the twin loads. The forge does not push.
                let stationProposalId: string | null = null;
                let note = "";
                const broker = new Broker(httpBase, { name: "forge", version: VERSION, locale: "en" });
                try {
                    const r = await broker.call("station", "propose", { taskId, artifacts: [{ kind: "plugin", path: rel, sha256: artifactSha256, contractSha256: loaded.sha256 }], manifestSha256: artifactSha256, claims: { ...((args.claims as Record<string, unknown> | undefined) ?? {}), plugin, types: loaded.types, acceptance: artifact.acceptance ? { ok: artifact.acceptance.ok, behaviors: artifact.acceptance.behaviors.length } : null } });
                    if (r.ok) {
                        const out = r.output as { proposalId?: string; note?: string };
                        stationProposalId = out.proposalId ?? null;
                        note = out.note ?? "proposed to the station";
                    } else note = `the station did not take the proposal: ${str((r as { error?: unknown }).error) || "no reason given"}`;
                } catch (e) {
                    note = `the station could not be reached: ${e instanceof Error ? e.message : String(e)}`;
                } finally {
                    await broker.close();
                }
                const proposal: Proposal = { id: `f${(s.proposals.length + 1).toString().padStart(4, "0")}-${artifactSha256.slice(0, 8)}`, at: artifact.proposedAt, taskId, plugin, sha256: loaded.sha256, artifactSha256, path: rel, stationProposalId, note };
                s.proposals.push(proposal);
                log(`[forge] ${proposal.id}: ${plugin} proposed to the station${stationProposalId ? ` (${stationProposalId})` : ""}: ${note}`);
                return { ...proposal, artifact };
            },
        },
    ];

    /**
     * The contract's acceptance, run by the forge on a scratch registry and a
     * scratch runtime: the plugin registered beside the substrate's types, the
     * signature and the parameters judged, then each behavior as a document
     * (the node, a timeline per wired input at its value, a transducer on the
     * output judged with its filter open and no noise) run a few ticks, the
     * transducer's last measurement against the formula.
     */
    const acceptPlugin = async (dir: string, sha256: string, contract: CapabilityContract): Promise<Omit<Acceptance, "at" | "ms">> => {
        const mod = await importPlugin(dir, sha256);
        const scratch = (options.registry ?? buildRegistry)();
        const before = new Set(scratch.types());
        await mod.register(scratch as unknown as NodeRegistry, docOf(dir));
        const registered = scratch.types().filter((t) => !before.has(t));
        const type = contract.type ? (registered.includes(contract.type) ? contract.type : null) : registered.length === 1 ? registered[0] : null;
        if (!type) return { ok: false, type: null, static: [contract.type ? `the contract names "${contract.type}" and the plugin registers ${registered.join(", ") || "nothing"}` : `the contract names no type and the plugin registers ${registered.length} (${registered.join(", ") || "none"}): name one in the contract`], behaviors: [] };
        const meta = (scratch as unknown as NodeRegistry).meta(type);
        const instance = (scratch as unknown as { create: (t: string) => object | undefined }).create(type);
        const problems = [...signatureProblems(meta?.signature as never, contract), ...parameterProblems(instance, contract)];
        const behaviors: BehaviorResult[] = [];
        const controller = new RuntimeController(scratch as never, { documents: new MemoryDocumentStore(), maxTicks: 100_000 });
        const params = parameterValues(contract);
        const outputs = Object.keys(contract.outputs);
        for (const text of contract.behaviors) {
            const parsed = parseBehavior(text, contract);
            if (!parsed.ok) {
                behaviors.push({ behavior: text, expected: null, actual: null, ok: false, reason: parsed.reason });
                continue;
            }
            const b: Behavior = parsed.behavior;
            const port = b.output ?? outputs[0];
            let expected: number | null = null;
            try {
                expected = expectedOf(b, contract);
            } catch (e) {
                behaviors.push({ behavior: text, expected: null, actual: null, ok: false, reason: e instanceof Error ? e.message : String(e) });
                continue;
            }
            const nodes: unknown[] = [{ id: "unit", typeId: type, params }];
            const connections: unknown[] = [];
            for (const [input, value] of Object.entries(b.inputs ?? {})) {
                nodes.push({ id: `in_${input}`, typeId: "Logic.Time:timeline", params: { segments: JSON.stringify([{ from: 0, to: 1e9, value }]), defaultValue: value } });
                connections.push({ from: [`in_${input}`, "value"], to: ["unit", input] });
            }
            nodes.push({ id: "probe", typeId: "DSP.Sensor:transducer", params: { cutoffHz: 1e9, noiseStdev: 0, quantizationStep: 0, driftPerSec: 0 } });
            connections.push({ from: ["unit", port], to: ["probe", "value"] });
            const name = `acceptance/${behaviors.length}`;
            const built = await controller.executeToolAsync("document_build", { spec: { nodes, connections }, name });
            if (!built.ok) {
                behaviors.push({ behavior: text, expected, actual: null, ok: false, reason: `the document could not be built: ${built.error}` });
                continue;
            }
            const data = (built.data ?? {}) as { ok?: boolean; problems?: unknown[] };
            if (data.ok === false) {
                behaviors.push({ behavior: text, expected, actual: null, ok: false, reason: `the document could not be built: ${JSON.stringify(data.problems ?? [])}` });
                continue;
            }
            const ran = await controller.executeToolAsync("session_run", { name, dt: 1, duration: 8, probes: [{ node: "probe", property: "lastMeasured" }] });
            if (!ran.ok) {
                behaviors.push({ behavior: text, expected, actual: null, ok: false, reason: `the run failed: ${ran.error}` });
                continue;
            }
            const summary = ((ran.data ?? {}) as { summary?: Record<string, { last?: number }> }).summary ?? {};
            const actual = summary["probe.lastMeasured"]?.last;
            const ok = typeof actual === "number" && satisfies(b, actual, expected);
            behaviors.push({ behavior: text, expected, actual: typeof actual === "number" ? actual : null, ok, ...(ok ? {} : { reason: `${port}(${b.inputs ? Object.entries(b.inputs).map(([k, v]) => `${k}=${v}`).join(", ") : "unwired"}) is ${typeof actual === "number" ? actual : "not a number"}, the contract says ${b.op} ${expected} (${b.expression})` }) });
        }
        return { ok: problems.length === 0 && behaviors.length > 0 && behaviors.every((x) => x.ok), type, static: problems, behaviors };
    };

    const runtime = RuntimeBehavior.on(registry() as never, { documents: new WorkshopDocumentStore(), events: runtimeEvents, maxTicks: 1440 * 20 * 60 });
    return publishSlot<ForgeState>({
        slot: "forge",
        behaviors: [runtime],
        tools,
        resources: [
            { uri: PLUGINS_URI, read: (s) => s.plugins },
            { uri: BUILDS_URI, read: (s) => s.builds },
            { uri: PROPOSALS_URI, read: (s) => s.proposals },
        ],
        state,
        wsBase,
        log,
        stub: false,
        version: VERSION,
        grammarsDir: fromRoot("slots", "forge", "grammars"),
    });
}

/** What the forge holds, for a test or a page: the types its registry has beyond the demo's. */
export function generatedTypes(slot: PublishedSlot<ForgeState>): string[] {
    return slot.state.plugins.flatMap((p) => p.types);
}

/** The files a plugin holds on disk, for whoever reads the workshop. */
export function pluginFilesOf(taskId: string, plugin: string): Array<{ path: string; bytes: number }> {
    const dir = pluginDir(taskId, plugin);
    return readPluginFiles(dir).map((f) => ({ path: f.path, bytes: statSync(path.join(dir, ...f.path.split("/"))).size }));
}
