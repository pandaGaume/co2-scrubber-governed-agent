/**
 * The workshop through the broker: a task opened by the factory's front, its
 * files (workspace), the runtime's surface on the twin (the catalogue, a
 * document validated, built by name into the task, run in the sandbox), a
 * model fitted on the task's telemetry, its contract checked with the
 * board's rules, and the proposal received by the station. No model of
 * language, no judgment: that is F4 and step D.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import { startAllOrFail } from "./lib/start.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { connectMcp, toolText, type McpSession } from "../harness/lib/mcp-http.js";
import { taskDir } from "../slots/tools/lib/workshop.js";

const PORT = 3110;
const quiet = () => undefined;

/** Twenty stable operating points of a scrubber whose current follows 0.6 + 2.2 * duty (normalized), plus a little noise. */
const TELEMETRY = Array.from({ length: 20 }, (_, i) => {
    const dutyPercent = 20 + i * 3;
    const d = dutyPercent / 100;
    return { duty_percent: dutyPercent, current_amps: 4 * (0.15 + 0.55 * d + (i % 3 === 0 ? 0.004 : i % 3 === 1 ? -0.003 : 0)) };
});

const FIT_SPEC = {
    version: 1,
    job: "fit",
    name: "scrubber-2",
    model: "affine-residual",
    dataset: { file: "telemetry.json", duty: { column: "duty_percent" }, current: { column: "current_amps" } },
    fullScale: { duty: 100, current: 4, senseSpan: 100 },
    domain: { dutyMin: 0.1875, dutyMax: 0.8 },
    monitor: { residual: { threshold: 0.04, debounceCycles: 30, severity: 350, alarm: "drift.current" } },
    outputs: { file: "scrubber_2.onnx" },
};

describe("the workshop, through the broker", () => {
    let broker: LocalBroker;
    let slots: PublishedSlot<object>[];
    const sessions = new Map<string, McpSession>();
    let taskId = "";
    const session = async (slot: string): Promise<McpSession> => {
        let s = sessions.get(slot);
        if (!s) {
            s = await connectMcp(broker.httpBase, slot, { name: "factory-test", version: "0", locale: "en" });
            sessions.set(slot, s);
        }
        return s;
    };
    const call = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const r = await (await session(slot)).callTool(tool, args);
        const body = JSON.parse(toolText(r)) as { result?: T; refused?: string; error?: string };
        if (r?.isError) throw new Error(body.refused ?? body.error ?? "refused");
        return body.result as T;
    };
    /** The runtime's tools answer in the MCP shape directly (no slot envelope). */
    const runtime = async <T>(tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const r = await (await session("twin")).callTool(tool, args);
        const text = toolText(r);
        if (r?.isError) throw new Error(text);
        return JSON.parse(text) as T;
    };

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        ({ broker, slots } = await startAllOrFail(PORT));
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        for (const s of sessions.values()) await s.close().catch(() => undefined);
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await broker?.stop();
        if (taskId && existsSync(taskDir(taskId))) rmSync(taskDir(taskId), { recursive: true, force: true });
    });

    it("the factory's front opens a task from a functional contract, and refuses one without a required output", async () => {
        const r = await call<{ taskId: string; state: string; workspace: string; taskSha256: string }>("factory", "request", {
            objective: { required_outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm", horizonMinutes: 20 }], constraints: { residualPpmMax: 150, windowMinutes: 20 } },
            observations: { volumes: 2, door: "open" },
            data: [{ file: "telemetry.json", columns: ["duty_percent", "current_amps"] }],
            requestedBy: "test",
            run: false,
        });
        taskId = r.taskId;
        assert.match(taskId, /^t-\d{4}-\d{2}-\d{2}-\d{4}$/);
        assert.equal(r.state, "created");
        assert.match(r.taskSha256, /^[0-9a-f]{64}$/);
        await assert.rejects(call("factory", "request", { objective: { required_outputs: [] } }), /at least one output/);
        const status = await call<{ state: string; files: number }>("factory", "task", { taskId });
        assert.equal(status.state, "created");
        assert.equal(status.files, 1);
    });

    it("the workspace writes, lists and reads the task's files, and refuses a path that leaves the task", async () => {
        const w = await call<{ bytes: number; sha256: string; replaced: string | null }>("workspace", "write", { taskId, path: "telemetry.json", text: JSON.stringify(TELEMETRY) });
        assert.equal(w.replaced, null);
        const again = await call<{ replaced: string | null }>("workspace", "write", { taskId, path: "telemetry.json", text: JSON.stringify(TELEMETRY) });
        assert.equal(again.replaced, w.sha256);
        const list = await call<{ files: Array<{ path: string; sha256: string }> }>("workspace", "list", { taskId });
        assert.deepEqual(list.files.map((f) => f.path), ["task.json", "telemetry.json"]);
        const read = await call<{ text: string; sha256: string }>("workspace", "read", { taskId, path: "telemetry.json" });
        assert.equal(read.sha256, w.sha256);
        assert.equal((JSON.parse(read.text) as unknown[]).length, 20);
        await assert.rejects(call("workspace", "read", { taskId, path: "../task.json" }), /leaves the task/);
        await assert.rejects(call("workspace", "write", { taskId, path: "C:/x.txt", text: "no" }), /absolute/);
        await assert.rejects(call("workspace", "read", { taskId, path: "nothing.txt" }), /no file/);
    });

    it("the runtime on the twin: the catalogue, a spec validated, a document built by name into the task and run in the sandbox", async () => {
        const found = await runtime<{ matches: Array<{ type: string }> }>("registry_search", { requiredOutputs: [{ quantity: "Concentration", unit: "ppm" }] });
        assert.equal(found.matches[0]?.type, "Physics.LifeSupport:cabin-air");
        const spec = {
            nodes: [
                { id: "crew", typeId: "Physics.LifeSupport:crew", params: { count: 4, activity: "sleep" } },
                { id: "command", typeId: "Logic.Time:timeline", params: { segments: JSON.stringify([{ from: 0, to: 1e9, value: 0.33 }]), defaultValue: 0.33 } },
                { id: "scrubber", typeId: "Physics.LifeSupport:scrubber" },
                { id: "cabin", typeId: "Physics.LifeSupport:cabin-air", params: { initialPpm: 1500 } },
            ],
            connections: [
                { from: ["command", "value"], to: ["scrubber", "command"] },
                { from: ["crew", "co2Emission"], to: ["cabin", "emissionA"] },
                { from: ["scrubber", "effectiveRate"], to: ["cabin", "scrubberRate"] },
            ],
        };
        assert.deepEqual(await runtime("document_validate", { spec }), { ok: true, problems: [] });
        const built = await runtime<{ ok: boolean; sha256: string; name: string }>("document_build", { spec, name: `${taskId}/twin-v2` });
        assert.equal(built.ok, true);
        const files = await call<{ files: Array<{ path: string; sha256: string }> }>("workspace", "list", { taskId });
        const doc = files.files.find((f) => f.path === "twin-v2.spikypanda");
        assert.ok(doc, "the built document is a file of the task");
        assert.equal(doc?.sha256, built.sha256);
        const run = await runtime<{ ticks: number; summary: Record<string, { first: number; last: number }>; wallMs: number }>("session_run", { name: `${taskId}/twin-v2`, dt: 60, duration: 3600, probes: [{ node: "cabin", property: "co2Ppm" }] });
        assert.equal(run.ticks, 60);
        assert.ok(Math.abs(run.summary["cabin.co2Ppm"].first - 1500) < 1);
        assert.ok(Number.isFinite(run.summary["cabin.co2Ppm"].last));
    });

    it("the model slot fits on the task's telemetry, writes the model and its contract into the task, and checks the contract with the board's rules", async () => {
        const fit = await call<{ onnx: { path: string; sha256: string }; contract: { path: string; sha256: string } | null; quality: { rows: number; kept: number; rmse: number }; parity: { ok: boolean }; coefficients: Record<string, number> }>("model", "fit", { taskId, spec: FIT_SPEC });
        assert.equal(fit.quality.rows, 20);
        assert.equal(fit.parity.ok, true);
        assert.ok(fit.quality.rmse < 0.01, `rmse ${fit.quality.rmse}`);
        assert.ok(fit.contract, "a contract is written next to the model");
        const inspect = await call<{ ok: boolean; sha256: string; inputs: string[]; outputs: string[] }>("model", "inspect", { taskId, path: fit.onnx.path });
        assert.equal(inspect.ok, true);
        assert.equal(inspect.sha256, fit.onnx.sha256);
        assert.ok(inspect.inputs.length >= 1 && inspect.outputs.length >= 1);
        const good = await call<{ ok: boolean }>("model", "contract", { taskId, path: fit.onnx.path, contract: { sha256: fit.onnx.sha256, expectOutputCount: inspect.outputs.length } });
        assert.equal(good.ok, true);
        const bad = await call<{ ok: boolean; error: string | null }>("model", "contract", { taskId, path: fit.onnx.path, contract: { sha256: "0".repeat(64) } });
        assert.equal(bad.ok, false);
        assert.match(String(bad.error), /SHA-256 mismatch/);
        await assert.rejects(call("model", "fit", { taskId, spec: { ...FIT_SPEC, dataset: { ...FIT_SPEC.dataset, file: "missing.json" } } }), /no dataset/);
    });

    it("the station receives the proposal and holds it for the twin's judgment; the factory never registers", async () => {
        const p = await call<{ proposalId: string; status: string }>("station", "propose", {
            taskId,
            artifacts: [{ kind: "model", path: "models/scrubber-2/scrubber_2.onnx", sha256: "a".repeat(64), contractSha256: "b".repeat(64) }],
            manifestSha256: "c".repeat(64),
            claims: { requiredOutputs: ["predicted_co2"], sandbox: { residual: 40, wallMs: 8 } },
        });
        assert.match(p.proposalId, /^p\d{4}-[0-9a-f]{8}$/);
        assert.equal(p.status, "received");
        await assert.rejects(call("station", "propose", { taskId, artifacts: [], manifestSha256: "c".repeat(64) }), /at least one artifact/);
        const r = await (await session("station")).request<{ contents: Array<{ text?: string }> }>("resources/read", { uri: "station://proposals" });
        const proposals = JSON.parse(r.contents[0].text ?? "[]") as Array<{ proposalId: string }>;
        assert.equal(proposals[0]?.proposalId, p.proposalId);
    });
});
