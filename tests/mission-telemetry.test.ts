/** A real checked procedure on the simulated board, selected through mission services. No cloud or hardware. */
import { it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fromRoot } from "../lib/paths.js";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import { taskDir, WORKSHOP_ROOT, sha256Of } from "../slots/tools/lib/workshop.js";
import { MissionProcedureExecutor } from "../slots/agent/procedure-execution.js";

it("blocks a graph without inputs, executes only a commander-authorised test, and transfers its recorded telemetry to a new graph task", { timeout: 60000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mission-telemetry-"));
    const server = createServer(async (req, res) => {
        for await (const _chunk of req) { /* drain the request */ }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", tool_calls: [{ id: "wait", type: "function", function: { name: "mission__wait", arguments: JSON.stringify({ reason: "Waiting for the authorised procedure result.", _mother: "Waiting for the authorised test." }) } }] }, finish_reason: "tool_calls" }], usage: {} }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = path.join(dir, "profile.json");
    const routing = path.join(dir, "routing.json");
    writeFileSync(profile, JSON.stringify({ tier3: { wire: "openai-compatible", baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: "local-fixture", apiKey: { env: "MISSION_TELEMETRY_KEY" }, toolChoice: "required" } }));
    writeFileSync(routing, JSON.stringify({ uses: {} }));
    const keys = ["REASONER_PROFILE", "REASONER_ROUTING", "MISSION_TELEMETRY_KEY", "PROCEDURE_LOG_DIR", "SCRUBBER_SOURCE", "SCENARIO_SECONDS_PER_MINUTE"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    Object.assign(process.env, { REASONER_PROFILE: profile, REASONER_ROUTING: routing, MISSION_TELEMETRY_KEY: "test-only", PROCEDURE_LOG_DIR: path.join(dir, "logs"), SCRUBBER_SOURCE: "", SCENARIO_SECONDS_PER_MINUTE: "0.02" });
    let started: Awaited<ReturnType<typeof startAllOrFail>> | undefined;
    let operator: Broker | undefined;
    const tasks: string[] = [];
    try {
        started = await startAllOrFail(3175);
        operator = new Broker(started.broker.httpBase, { name: "mission-telemetry-test", version: "1" }, "station");
        const call = async <T>(slot: string, tool: string, input: Record<string, unknown> = {}) => {
            const r = await operator!.call(slot, tool, input);
            assert.equal(r.ok, true, r.error);
            return r.output as T;
        };
        const scene = JSON.parse(readFileSync(fromRoot("specs", "commissioning-devices.json"), "utf8"));
        let commissioningId = "";
        for (const device of scene.devices) {
            const r = await call<{ commissioning: string | null }>("station", "registry_register", device);
            if (r.commissioning) commissioningId = r.commissioning;
        }
        const battery = scene.devices.find((d: { descriptor: { "@type": string } }) => d.descriptor["@type"] === "Battery");
        await call("station", "registry_report", { path: battery.path, readings: { stateOfCharge: 80 } });
        await call("agent", "mission_start", { missionId: "telemetry-test", objective: "Collect an authorised identification log without manual data entry.", observation: { commissioningId, atmosphere: "simulated", world: "lab", devices: scene.devices.map((d: { path: string }) => d.path) } });
        const empty = await call<{ taskId: string; started: boolean; inputStatus: { ready: boolean; missing: string[] } }>("factory", "request", { topics: ["graph"], objective: { required_outputs: [{ name: "co2_lab_ppm", quantity: "Concentration", unit: "ppm" }] }, requestedBy: "mission-telemetry-test" });
        tasks.push(empty.taskId);
        assert.equal(empty.started, false);
        assert.equal(empty.inputStatus.ready, false);
        assert.equal(empty.inputStatus.missing.length, 2);
        assert.equal((await operator.call("factory", "start", { taskId: empty.taskId })).ok, false);

        const request = await call<{ taskId: string }>("factory", "request", { topics: ["procedure"], objective: { required_outputs: [{ name: "V_lab", quantity: "Volume", unit: "m3" }] }, observations: { device: scene.devices[0].path }, builder: "scripted", budget: { iterations: 25 }, requestedBy: "mission-telemetry-test" });
        tasks.push(request.taskId);
        const deadline = Date.now() + 20000;
        for (;;) {
            const task = await call<{ state: string; manifest?: { ended?: string } }>("factory", "task", { taskId: request.taskId });
            if (task.state === "proposed") break;
            assert.notEqual(task.state, "failed", task.manifest?.ended);
            assert.ok(Date.now() < deadline, "procedure factory did not finish");
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.equal((await operator.call("agent", "procedure_execute", { commissioningId })).ok, false, "the model cannot execute an unauthorised procedure");
        const questions = async () => {
            const r = await (await operator!.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://questions" });
            return JSON.parse(r.contents[0].text) as Array<{ id: string; kind: string; status: string; role: string; holders: string[]; context: { commissioningId: string } }>;
        };
        const beforeReview = await questions();
        const review = beforeReview.find((q) => q.kind === "procedure-review" && q.status === "open" && q.context.commissioningId === commissioningId)!;
        assert.equal(review.role, "scientific-officer");
        assert.deepEqual(review.holders, ["scientist-test"]);
        assert.equal(beforeReview.some((q) => q.kind === "authorise" && q.context?.commissioningId === commissioningId), false, "no launch request before scientific approval");
        assert.equal((await operator.call("station", "commissioning_authorise", { commissioningId, decision: "authorise", by: "commander-test" })).ok, false);
        assert.equal((await operator.call("station", "answer", { questionId: review.id, choice: "approve", by: "commander-test" })).ok, false, "Kirk cannot substitute for Spock");
        const blocker = await call<{ questionId: string; status: string }>("station", "ask", { from: "test operator", kind: "ask", role: "commander", question: "Decide the first pending operational question.", options: [{ id: "yes", label: "yes" }, { id: "no", label: "no" }] });
        assert.equal(blocker.status, "open");
        assert.equal((await operator.call("station", "commissioning_review", { commissioningId, procedureSha256: "0".repeat(64), decision: "approve", by: "scientist-test" })).ok, false, "a stale hash cannot approve another procedure");
        await call("station", "answer", { questionId: review.id, choice: "approve", by: "scientist-test" });
        assert.equal((await operator.call("agent", "procedure_execute", { commissioningId })).ok, false, "scientific approval alone does not launch the test");
        const queuedLaunch = (await questions()).find((q) => q.kind === "authorise" && q.context.commissioningId === commissioningId)!;
        assert.equal(queuedLaunch.status, "queued", "launch does not accumulate as a second active commander question");
        assert.equal((await operator.call("station", "answer", { questionId: queuedLaunch.id, choice: "authorise", by: "commander-test" })).ok, false);
        assert.equal((await operator.call("station", "commissioning_authorise", { commissioningId, decision: "authorise", by: "commander-test" })).ok, false, "a direct call cannot bypass the queue");
        await call("station", "answer", { questionId: blocker.questionId, choice: "yes", by: "commander-test" });
        assert.equal((await questions()).find((q) => q.id === queuedLaunch.id)?.status, "open", "the next question requires its own answer");
        const questionResource = await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://questions" });
        const question = JSON.parse(questionResource.contents[0].text).find((q: { kind: string; status: string; context?: { commissioningId?: string } }) => q.kind === "authorise" && q.status === "open" && q.context?.commissioningId === commissioningId);
        assert.equal(question.role, "commander");
        assert.deepEqual(question.holders, ["commander-test"]);
        const proposed = (await call<{ commissioning: { procedure: { content: { steps: Array<{ n: number; speedPercent: number; minutes: number; hatch: string }> }; sha256: string } } }>("station", "commissioning_state", { commissioningId })).commissioning.procedure;
        assert.deepEqual(question.context.procedure.operatingPoints, proposed.content.steps.map(({ n, speedPercent, minutes, hatch }) => ({ n, speedPercent, minutes, hatch })), "the commander sees the exact proposed operating points, never a substituted range");
        assert.equal(question.context.procedure.sha256, proposed.sha256);
        assert.equal((await operator.call("station", "answer", { questionId: question.id, choice: "authorise", by: "scientist-test" })).ok, false, "Spock cannot substitute for Kirk");
        assert.equal((await operator.call("station", "answer", { questionId: question.id, choice: "text", note: "yes authorise", by: "commander-test" })).ok, false, "free text cannot authorise a physical test");
        await call("station", "answer", { questionId: question.id, choice: "authorise", by: "commander-test", how: "typed", note: "local test fixture" });
        const afterAuthorisation = await call<{ mission: { observations: unknown[] } }>("agent", "state");
        assert.match(JSON.stringify(afterAuthorisation.mission.observations), /station.commissioning-decision/, "a real test authorisation returns to the owning mission without auto-executing it");
        const execution = await call<{ runId: string; source: string }>("agent", "procedure_execute", { commissioningId });
        assert.match(execution.source, /simulated cabin/);
        const activity = await call<{ procedureExecutions: Array<{ runId: string; source: string; plannedMinutes: number; minute: number; samples: number }> }>("agent", "state");
        const progress = activity.procedureExecutions.find((r) => r.runId === execution.runId);
        assert.ok(progress, "the operator sees the actual running procedure");
        assert.equal(progress.plannedMinutes, proposed.content.steps.reduce((sum, step) => sum + step.minutes, 0));
        assert.ok(progress.minute >= 0 && progress.samples >= 0);
        assert.match(progress.source, /simulated cabin/);
        assert.equal((await operator.call("agent", "procedure_execute", { commissioningId })).ok, false, "duplicate execution is refused");
        let record: { status: string; rows: Array<{ minute: number; co2_lab_ppm: number; co2_habb_ppm: number; speed_percent: number }>; error: string | null };
        for (;;) {
            record = await call("agent", "procedure_result", { runId: execution.runId });
            if (record.status !== "running") break;
            assert.ok(Date.now() < deadline, "authorised test did not finish");
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.equal(record.status, "done", record.error ?? "");
        const late = await operator.call("factory", "request", { topics: ["procedure"], objective: { required_outputs: [{ name: "speedPercent", quantity: "Ratio", unit: "percent" }] }, observations: { device: scene.devices[0].path }, run: false });
        assert.equal(late.ok, false, "the completed commissioning cannot open another procedure and ask the late speed question");
        assert.match(late.error ?? "", /is done, not open/);
        assert.deepEqual((await call<{ procedureExecutions: unknown[] }>("agent", "state")).procedureExecutions, [], "finished collection no longer appears active");
        assert.ok(record.rows.length > 10);
        assert.ok(new Set(record.rows.map((r) => r.speed_percent)).size >= 2);
        assert.ok(new Set(record.rows.map((r) => r.co2_lab_ppm)).size > 2);
        const graph = await call<{ taskId: string; inputStatus: { ready: boolean } }>("factory", "request", { topics: ["graph"], objective: { required_outputs: [{ name: "co2_lab_ppm", quantity: "Concentration", unit: "ppm" }], constraints: { rmsePpmMax: 10 } }, telemetryRunId: execution.runId, run: false, requestedBy: "mission-telemetry-test" });
        tasks.push(graph.taskId);
        assert.equal(graph.inputStatus.ready, true);
        const graphTask = JSON.parse(readFileSync(path.join(taskDir(graph.taskId), "task.json"), "utf8"));
        const bytes = readFileSync(path.join(taskDir(graph.taskId), "telemetry.json"));
        assert.equal(graphTask.task.data[0].sha256, sha256Of(bytes));
        assert.deepEqual(JSON.parse(bytes.toString("utf8")), record.rows);
        assert.equal(graphTask.task.observations.telemetryRunId, execution.runId);
        assert.ok(graphTask.task.observations.devices.some((d: { path: string }) => d.path === scene.devices[0].path));
        const reader = new MissionProcedureExecutor(operator, operator, () => undefined);
        assert.deepEqual(reader.result(execution.runId).rows, record.rows, "logs survive a new reader instance");
        await reader.close();
        const state = await call<{ mission: { id: string; status: string; observations: unknown[] } }>("agent", "state");
        assert.equal(state.mission.id, "telemetry-test");
        assert.notEqual(state.mission.status, "completed");
        assert.match(JSON.stringify(state.mission.observations), new RegExp(execution.runId));
    } finally {
        await operator?.close();
        if (started) { for (const s of started.slots) await s.close(); await started.broker.stop(); }
        await new Promise<void>((resolve) => server.close(() => resolve()));
        for (const id of tasks) {
            const target = path.resolve(taskDir(id));
            if (path.dirname(target) === path.resolve(WORKSHOP_ROOT)) rmSync(target, { recursive: true, force: true });
        }
        rmSync(dir, { recursive: true, force: true });
        for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
});
