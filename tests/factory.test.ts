/**
 * The constructor's loop (F4, docs/harness-stages.fr.md) through the broker,
 * without a model: a task opened by the factory's front, the scripted
 * `onnx` builder stepping the twelve stages (catalogue, plan, listing, fit,
 * inspection, contract check, done), the manifest and the trace written in
 * the workshop, the proposal received by the station with the manifest's
 * sha256; then the guard, the evaluator and the budget on a builder that
 * misbehaves; then the recipes: after three tasks of the same kind, the
 * fourth replays the steps that built; and the words about a task, the
 * phrases of the factory slot's wording, read by a session in its language.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { Provider, ProviderExchange } from "../harness/lib/provider.js";
import { runTask, type BuilderContext } from "../harness/core/runner.js";
import { ScriptedBuilder } from "../harness/scripted/onnx.js";
import { pathProblem } from "../harness/core/builder-guard.js";
import { taskSignature } from "../harness/core/recipes.js";
import { taskDir } from "../slots/tools/lib/workshop.js";
import { sha256Of } from "../slots/tools/lib/workshop.js";
import { endSentence, loadWords, stageSentence, stepSentence } from "../harness/browser/factory-voice.js";

const PORT = 3120;

/** Twenty stable operating points of a scrubber whose current follows 0.6 + 2.2 * duty (normalized), plus a little noise. */
const TELEMETRY = Array.from({ length: 20 }, (_, i) => {
    const dutyPercent = 20 + i * 3;
    const d = dutyPercent / 100;
    return { duty_percent: dutyPercent, current_amps: 4 * (0.15 + 0.55 * d + (i % 3 === 0 ? 0.004 : i % 3 === 1 ? -0.003 : 0)) };
});

const REQUEST = {
    objective: {
        required_outputs: [
            { name: "predicted_co2", quantity: "Concentration", unit: "ppm", horizonMinutes: 20 },
            { name: "scrubber_2_efficiency", quantity: "Ratio", unit: "1" },
        ],
        constraints: { residualPpmMax: 150, windowMinutes: 20 },
    },
    observations: { volumes: 2, door: "open" },
    data: [{ file: "telemetry.json", columns: ["duty_percent", "current_amps"] }],
    topics: ["onnx"],
    requestedBy: "factory-test",
    run: false,
};

/** A builder that misbehaves on purpose: a path out of the task, a plan with a ghost node, a claim with no model, then repeats. */
class ClumsyBuilder implements Provider {
    readonly name = "scripted:clumsy";
    readonly model = "scripted/clumsy";
    readonly family = "scripted";
    readonly exchanges: ProviderExchange[] = [];
    calls = 0;
    private line = 0;
    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        const lines: Array<[string, JsonValue]> = [
            ["workspace.read", { path: "../task.json" }],
            ["task.plan", { selected_nodes: ["Physics.LifeSupport:cabin-air", "Nope:ghost"], missing_capabilities: [] }],
            ["scrubber.motor.set_speed", { percent: 100 }],
            ["task.plan", { selected_nodes: ["Physics.LifeSupport:cabin-air"], missing_capabilities: [{ required_output: "scrubber_2_efficiency", quantity: "Ratio", unit: "1", reason: "nothing in the catalogue", topic: "onnx" }] }],
            ["task.done", { summary: "done without a model", artifacts: [{ kind: "model", path: "models/none.onnx" }] }],
        ];
        const [capabilityId, args] = lines[Math.min(this.line++, lines.length - 1)];
        const decision: PolicyDecision = { action: { id: capabilityId, description: capabilityId }, invocation: { actionId: capabilityId, capabilityId, input: args }, rationale: "clumsy" };
        this.exchanges.push({ decisionId: input.decisionId, model: this.model, request: null, response: null, decision, proposedCapabilityId: capabilityId, proposedInput: args, latencyMs: 0, tokens: null });
        return decision;
    }
}

describe("the constructor's loop (F4), through the broker", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let broker: Broker;
    let recipesDir = "";
    const tasks: string[] = [];

    const request = async (overrides: Record<string, unknown> = {}): Promise<string> => {
        const r = await broker.call("factory", "request", { ...REQUEST, ...overrides });
        assert.ok(r.ok, r.error);
        const taskId = (r.output as { taskId: string }).taskId;
        tasks.push(taskId);
        const w = await broker.call("workspace", "write", { taskId, path: "telemetry.json", text: JSON.stringify(TELEMETRY) });
        assert.ok(w.ok, w.error);
        return taskId;
    };

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        recipesDir = mkdtempSync(path.join(tmpdir(), "recipes-"));
        process.env.FACTORY_RECIPES_DIR = recipesDir;
        ({ broker: local, slots } = await startAllOrFail(PORT));
        broker = new Broker(local.httpBase, { name: "factory-test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        delete process.env.FACTORY_RECIPES_DIR;
        await broker?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
        for (const t of tasks) if (existsSync(taskDir(t))) rmSync(taskDir(t), { recursive: true, force: true });
        if (recipesDir) rmSync(recipesDir, { recursive: true, force: true });
    });

    it("the factory slot hands a session its phrases in the language it announced (grammar://phrases), the same keys in every locale", async () => {
        const fr = new Broker(local.httpBase, { name: "board-test", version: "0", locale: "fr-CA" });
        try {
            const loadedFr = await loadWords(await fr.session("factory"));
            assert.equal(loadedFr.grammar, "default:fr");
            assert.equal(loadedFr.words.phrase("board.asking", { samples: 12 }), "Demande à l'usine du moniteur du scrubber, avec 12 relevés de la nuit.");
            const loadedEn = await loadWords(await broker.session("factory"));
            assert.equal(loadedEn.grammar, "default:en");
            assert.deepEqual(loadedFr.words.listPhrases().sort(), loadedEn.words.listPhrases().sort(), "the two locales carry the same keys");
            const fit = { n: 4, source: "fallback", capability: "model.fit", outcome: "completed", summary: { outcome: "completed", value: { quality: { rows: 19, kept: 19, rmse: 0.000832, worstCaseError: 0.00104 }, parity: { ok: true } } }, reward: 1, reason: "", ms: 32 };
            assert.equal(stepSentence(loadedEn.words, fit), "Model fitted on 19 rows, 19 inside the domain: rmse 0.0008, worst error 0.001, parity ok.");
            assert.equal(stepSentence(loadedFr.words, { ...fit, source: "policy" }), "Modèle ajusté sur 19 lignes, 19 dans le domaine : rmse 0.0008, pire erreur 0.001, parité ok, d'après une recette.");
            assert.equal(stepSentence(loadedEn.words, { n: 1, source: "refused", capability: "workspace.read", outcome: "refused", reason: "path leaves the task" }), "The guard refused workspace.read: path leaves the task.");
            assert.equal(endSentence(loadedEn.words, { state: "proposed", manifest: { proposal: { proposalId: "p0001-abc" }, artifacts: [{}, {}], steps: "[7 items]" } }), "Proposed to the station: p0001-abc, 2 artifact(s), 7 step(s). The twin's judgment is the next step.");
            assert.deepEqual(stageSentence(loadedEn.words, "gate", {}, "merge"), ["A recipe is trusted: the builder is not asked", "Recipe replayed, the builder is not asked"]);
            assert.deepEqual(stageSentence(loadedEn.words, "nowhere", {}), ["nowhere", "nowhere"]);
            assert.equal(loadedEn.words.phrase("board.asking"), "Asking the factory for the scrubber's monitor, with ? samples of the night.", "a value the manifest lacks reads ?");
            const listed = (await (await broker.session("factory")).request<{ resources: Array<{ uri: string }> }>("resources/list", {})).resources.map((r) => r.uri);
            assert.ok(listed.includes("grammar://phrases"), listed.join(","));
        } finally {
            await fr.close();
        }
    });

    it("the guard's path rule, without a broker", () => {
        assert.equal(pathProblem({ path: "models/a.onnx", spec: { dataset: { file: "telemetry.json" } } }), null);
        assert.match(String(pathProblem({ path: "../task.json" })), /leaves the task/);
        assert.match(String(pathProblem({ spec: { dataset: { file: "C:/secrets.json" } } })), /absolute/);
        assert.match(String(pathProblem({ artifacts: [{ kind: "model", path: "/etc/x" }] })), /absolute/);
        assert.equal(pathProblem({ selected_nodes: ["../not-a-path"] }), null);
    });

    it("the task's signature is its kind, not its id", () => {
        const task = (id: string, objective: typeof REQUEST.objective, extra: Record<string, unknown> = {}) => ({ id, topics: ["onnx"], objective, observations: {}, data: [], budget: { iterations: 1, minutes: 1, twinPoints: 1 }, requestedBy: "", requestedAt: "", ...extra });
        const a = taskSignature(task("t-1", REQUEST.objective), "onnx");
        const b = taskSignature(task("t-2", { ...REQUEST.objective, constraints: { windowMinutes: 5, residualPpmMax: 10 } }, { observations: { other: 1 }, data: [{ file: "x" }], requestedBy: "someone" }), "onnx");
        assert.equal(a.id, b.id, "same outputs, same constraint names, other values: the same kind");
        const c = taskSignature(task("t-3", { required_outputs: REQUEST.objective.required_outputs.slice(0, 1), constraints: REQUEST.objective.constraints }), "onnx");
        assert.notEqual(a.id, c.id, "one output less: another kind");
        assert.notEqual(a.id, taskSignature(task("t-1", REQUEST.objective), "graph").id, "another topic: another kind");
    });

    it("the scripted onnx builder takes a task from the catalogue to the proposal, and every number of the manifest is read from a step", async () => {
        const taskId = await request();
        const stages: string[] = [];
        const result = await runTask({ broker, taskId, recipesDir, provider: (ctx: BuilderContext) => new ScriptedBuilder(ctx), onStage: (e) => e.status === "complete" && stages.push(e.stage) });
        assert.equal(result.state, "proposed", result.manifest.ended ?? "");
        assert.equal(result.phase, "done");
        assert.deepEqual(
            result.manifest.steps.map((s) => s.capability),
            ["twin.registry_search", "task.plan", "workspace.list", "model.fit", "model.inspect", "model.contract", "task.done"],
        );
        assert.ok(result.manifest.steps.every((s) => s.source === "fallback" && s.outcome === "completed"), "first task: every step by the builder, every one completed");
        assert.equal(stages.filter((s) => s === "record").length, 7, "seven decisions reached the recorder");
        assert.ok(stages.includes("reason") && stages.includes("guard") && stages.includes("execute"));
        // The plan: the cabin's air node for the concentration, the efficiency declared missing.
        const plan = result.manifest.steps[1];
        assert.deepEqual((plan.input as { selected_nodes: string[] }).selected_nodes, ["Physics.LifeSupport:cabin-air"]);
        assert.equal((plan.input as { missing_capabilities: unknown[] }).missing_capabilities.length, 1);
        // The tools the builder had: the topic's, bound to the task (no taskId in what the model sees), nothing of the board.
        const ids = result.manifest.tools.list.map((t) => t.id);
        assert.ok(ids.includes("model.fit") && ids.includes("task.plan") && ids.includes("twin.registry_search"));
        assert.ok(!ids.some((id) => id.startsWith("scrubber.") || id === "station.propose" || id === "twin.session_run"), ids.join(","));
        assert.ok(!JSON.stringify(result.manifest.steps[3].summary).includes(taskId), "the model's input to the fit does not carry the task id");
        // The artifacts: the model with its contract's sha256.
        const model = result.manifest.artifacts.find((a) => a.kind === "model");
        assert.ok(model && /^[0-9a-f]{64}$/.test(model.sha256) && model.contractSha256, "a model with a contract");
        assert.equal(result.manifest.task.sha256.length, 64);
        assert.equal(result.manifest.recipes.experiencesAfter, 7);
        // What the station received is the manifest as proposed, byte for byte.
        const proposed = readFileSync(path.join(taskDir(taskId), "manifest.proposed.json"));
        assert.equal(sha256Of(proposed), result.proposedManifestSha256);
        const r = await broker.call("station", "propose", {}); // a refused call, only to reach the slot's session
        assert.equal(r.ok, false);
        const proposals = JSON.parse((await (await broker.session("station")).request<{ contents: Array<{ text?: string }> }>("resources/read", { uri: "station://proposals" })).contents[0].text ?? "[]") as Array<{ proposalId: string; manifestSha256: string; artifacts: Array<{ sha256: string }> }>;
        const mine = proposals.find((p) => p.proposalId === result.proposalId);
        assert.ok(mine, "the station holds the proposal");
        assert.equal(mine?.manifestSha256, result.proposedManifestSha256);
        assert.equal(mine?.artifacts[0]?.sha256, model?.sha256);
        // The front reads the state from the manifest.
        const status = await broker.call("factory", "task", { taskId });
        assert.equal((status.output as { state: string }).state, "proposed");
        for (const f of ["plan.json", "done.json", "trace.jsonl", "manifest.json"]) assert.ok(existsSync(path.join(taskDir(taskId), f)), f);
    });

    it("the guard refuses a path out of the task and a plan with a ghost node, the evaluator refuses a claim without a model, and the budget ends the task in failure, said as such", async () => {
        const taskId = await request({ budget: { iterations: 5 } });
        const result = await runTask({ broker, taskId, recipesDir: mkdtempSync(path.join(tmpdir(), "recipes-clumsy-")), provider: new ClumsyBuilder() });
        assert.equal(result.state, "failed");
        assert.equal(result.manifest.ended, "iteration budget spent (5)");
        const [read, ghost, board, plan, done] = result.manifest.steps;
        assert.equal(read.source, "refused");
        assert.match(String(read.reason), /leaves the task/);
        assert.equal(ghost.source, "refused");
        assert.match(String(ghost.reason), /Nope:ghost.*not in the catalogue/);
        assert.equal(board.source, "refused");
        assert.match(String(board.reason), /outside the allowlist|not a tool of topic/);
        assert.equal(plan.source, "fallback");
        assert.equal(plan.outcome, "completed");
        assert.equal(done.outcome, "completed");
        assert.equal(done.reward, -1);
        assert.match(String(done.reason), /contract not held.*not a file of the workshop/);
        assert.equal(result.proposalId, null);
        assert.equal(((await broker.call("factory", "task", { taskId })).output as { state: string }).state, "failed");
    });

    it("the front runs the task by itself: a request with the telemetry's rows starts the loop, and factory.task follows it to the proposal", async () => {
        // The board's telemetry: the stub scrubber's own columns, sampled as the control board samples them.
        const rows = Array.from({ length: 30 }, (_, i) => {
            const speedPercent = [20, 33, 40, 60][i % 4];
            return { t: i * 2, co2Ppm: 1500 - i, co2State: "NOMINAL", speedPercent, currentAmps: Number((0.09 + 0.16 * (speedPercent / 100)).toFixed(3)), power: true };
        });
        const r = await broker.call("factory", "request", { ...REQUEST, run: undefined, data: [{ file: "telemetry.json", columns: Object.keys(rows[0]), rows }], requestedBy: "board-test" });
        assert.ok(r.ok, r.error);
        const opened = r.output as { taskId: string; state: string; started: boolean; builder: string | null; data: Array<{ file: string; sha256?: string }> };
        tasks.push(opened.taskId);
        assert.equal(opened.started, true);
        assert.equal(opened.state, "running");
        assert.equal(opened.builder, "scripted:onnx");
        assert.match(String(opened.data[0]?.sha256), /^[0-9a-f]{64}$/, "the data handed over is written with its sha256");
        assert.ok(existsSync(path.join(taskDir(opened.taskId), "telemetry.json")));
        interface Followed {
            state: string;
            manifest: { steps: Array<{ capability: string }>; proposal: { proposalId: string } | null; ended: string | null } | null;
            run: { lastStage: string | null; steps: number } | null;
        }
        const follow = async (): Promise<Followed> => {
            for (let i = 0; i < 100; i++) {
                const t = await broker.call("factory", "task", { taskId: opened.taskId });
                assert.ok(t.ok, t.error);
                const status = t.output as Followed;
                if (status.state !== "created" && status.state !== "running") return status;
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            throw new Error("the task did not end in ten seconds");
        };
        const status = await follow();
        assert.equal(status.state, "proposed", status.manifest?.ended ?? "");
        assert.equal(status.manifest?.steps.length, 7);
        assert.equal(status.run?.steps, 7);
        assert.equal(status.run?.lastStage, "record");
        assert.ok(status.manifest?.proposal?.proposalId, "the proposal is in the manifest");
        // The old front only opened tasks: `run: false` still does.
        const only = await broker.call("factory", "request", { ...REQUEST, requestedBy: "board-test" });
        tasks.push((only.output as { taskId: string }).taskId);
        assert.equal((only.output as { started: boolean; state: string }).started, false);
        assert.equal((only.output as { state: string }).state, "created");
    });

    it("telemetry on one speed only: the fit cannot be made, the builder gives up with the tool's reason, the task ends failed at once", async () => {
        const rows = Array.from({ length: 8 }, (_, i) => ({ t: i * 2, co2Ppm: 1200, co2State: "NOMINAL", speedPercent: 33, currentAmps: 0.143, power: true }));
        const r = await broker.call("factory", "request", { ...REQUEST, run: undefined, data: [{ file: "telemetry.json", columns: Object.keys(rows[0]), rows }], requestedBy: "board-test" });
        assert.ok(r.ok, r.error);
        const taskId = (r.output as { taskId: string }).taskId;
        tasks.push(taskId);
        interface Ended {
            state: string;
            manifest: { steps: Array<{ capability: string | null; source: string }>; ended: string | null } | null;
        }
        const follow = async (): Promise<Ended> => {
            for (let i = 0; i < 100; i++) {
                const status = (await broker.call("factory", "task", { taskId })).output as Ended;
                if (status.state !== "created" && status.state !== "running") return status;
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            throw new Error("the task did not end in ten seconds");
        };
        const status = await follow();
        assert.equal(status.state, "failed");
        assert.match(String(status.manifest?.ended), /the builder gave up: .*same duty/);
        const capabilities = status.manifest?.steps.map((s) => s.capability) ?? [];
        assert.deepEqual(capabilities, ["twin.registry_search", "task.plan", "workspace.list", "model.fit", "task.fail"], "five steps, not a budget spent on the same failure");
        assert.ok(existsSync(path.join(taskDir(taskId), "failed.json")));
    });

    it("after five tasks of the same kind (three by hand, two by the front), the sixth replays the steps that built from the recipes, without asking the builder", async () => {
        for (let i = 0; i < 2; i++) {
            const r = await runTask({ broker, taskId: await request(), recipesDir, provider: (ctx: BuilderContext) => new ScriptedBuilder(ctx) });
            assert.equal(r.state, "proposed", `task ${i + 2}: ${r.manifest.ended ?? ""}`);
        }
        const asked: { builder?: ScriptedBuilder } = {};
        const fourth = await runTask({
            broker,
            taskId: await request(),
            recipesDir,
            provider: (ctx: BuilderContext) => (asked.builder = new ScriptedBuilder(ctx)),
        });
        assert.equal(fourth.state, "proposed", fourth.manifest.ended ?? "");
        const replayed = fourth.manifest.steps.filter((s) => s.source === "policy").map((s) => s.capability);
        assert.ok(replayed.includes("task.plan") && replayed.includes("model.fit") && replayed.includes("task.done"), `replayed: ${replayed.join(", ")}`);
        assert.equal(fourth.manifest.recipes.replayedSteps, replayed.length);
        assert.equal(asked.builder?.calls, 7 - replayed.length, "the builder is asked only for the steps that were not replayed");
        assert.equal(fourth.manifest.recipes.experiencesBefore, 33, "four tasks of seven steps and one of five in the recipes, the front's included");
    });
});
