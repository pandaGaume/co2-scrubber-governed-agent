/** Local model fixture and simulated device only. No cloud or physical hardware is contacted. */
import { it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { MissionState } from "../tier3/mission.js";
import { fromRoot } from "../lib/paths.js";
import { runtimeEvents } from "../slots/lib/events.js";
import { taskDir, WORKSHOP_ROOT } from "../slots/tools/lib/workshop.js";
import type { FactoryState } from "../slots/factory/provider.js";
import { runLog } from "../harness/lib/run-log.js";

it("delivers one initial prompt, finishes scenario delivery, and leaves the same graph mission open until the model completes it", { timeout: 60000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mission-slot-"));
    const fixtureId = `transport-fixture-${Date.now()}`;
    const fixtureFile = fromRoot("specs", `scenario-${fixtureId}.json`);
    const fixture = JSON.parse(readFileSync(fromRoot("specs", "scenario-commissioning.json"), "utf8"));
    delete fixture.completion;
    fixture.mission = "Inspect the delegated fixture result and the human answer, then conclude this transport-only mission.";
    writeFileSync(fixtureFile, JSON.stringify(fixture));
    const requests: Array<{ messages: unknown[] }> = [];
    const delegation = { objective: { required_outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm" }] }, topics: ["graph"], run: false, requestedBy: "mission-slot-test" };
    const server = createServer(async (req, res) => {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        // A separate specialist fixture preserves this already valid contract.
        // Its calls must not advance the supervisor's fixture sequence.
        if (body.tools?.some((tool: { function: { name: string } }) => tool.function.name === "interpret__result")) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", tool_calls: [{ id: "interpret-fixture", type: "function", function: { name: "interpret__result", arguments: JSON.stringify({ value: delegation, reason: "The fixture's concentration contract is already valid.", _mother: "" }) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
            return;
        }
        requests.push(body);
        const name = requests.length === 1 ? "factory__request" : requests.length === 2 ? "mission__wait" : requests.length === 3 ? "crew__ask" : "mission__complete";
        const input = requests.length === 1 ? delegation : requests.length === 3 ? { message: "What limitations should the fixture conclusion retain?", responseType: "information" } : { reason: requests.length === 2 ? "Waiting for an external result." : "The result and the human's answer were examined. This fixture ends the mission explicitly." };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ id: "fixture", object: "chat.completion", model: "local-fixture", choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: "Detailed model reasoning for the trace only. ".repeat(50), tool_calls: [{ id: `call-${requests.length}`, type: "function", function: { name, arguments: JSON.stringify({ ...input, _mother: "I am checking the next mission step." }) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const profile = path.join(dir, "profile.json");
    const routing = path.join(dir, "routing.json");
    writeFileSync(profile, JSON.stringify({ tier3: { wire: "openai-compatible", baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "local-fixture", family: "test", apiKey: { env: "MISSION_TEST_KEY" }, toolChoice: "required" } }));
    writeFileSync(routing, JSON.stringify({ uses: {} }));
    const saved = Object.fromEntries(["REASONER_PROFILE", "REASONER_ROUTING", "MISSION_TEST_KEY", "SCRUBBER_SOURCE", "RUN_LOG", "DEBUG"].map((key) => [key, process.env[key]]));
    Object.assign(process.env, { REASONER_PROFILE: profile, REASONER_ROUTING: routing, MISSION_TEST_KEY: "local-only", SCRUBBER_SOURCE: "", RUN_LOG: "1", DEBUG: "false" });
    let started: Awaited<ReturnType<typeof startAllOrFail>> | undefined;
    let operator: Broker | undefined;
    let createdTaskPath: string | undefined;
    try {
        started = await startAllOrFail(3168);
        operator = new Broker("http://127.0.0.1:3168", { name: "mission-test", version: "1" }, "station");
        const play = await operator.call("scenario", "play", { id: fixtureId });
        assert.equal(play.ok, true, play.error);
        const read = async () => {
            const result = await operator!.call("agent", "state", {});
            assert.equal(result.ok, true, result.error);
            return result.output as { mission?: MissionState };
        };
        const until = async (test: (state: { mission?: MissionState }) => boolean) => {
            const end = Date.now() + 15000;
            for (;;) {
                const state = await read();
                if (test(state)) return state;
                if (Date.now() >= end) throw new Error(`mission did not settle: ${JSON.stringify(state)}`);
                await new Promise((resolve) => setTimeout(resolve, 30));
            }
        };
        const waiting = await until((state) => state.mission?.status === "waiting");
        const logDir = runLog()?.dir;
        assert.ok(logDir, "the existing run log remains open after scenario delivery ends");
        const conflicting = await operator.call("scenario", "play", { id: "energy-shortage-a" });
        assert.equal(conflicting.ok, false, "another scenario cannot reset the world under an open mission");
        assert.match(conflicting.error ?? "", /mission remains open/);
        const runs = await operator.call("scenario", "runs", {});
        const run = (runs.output as { current: { status: string; loops: unknown[]; tasks: unknown[]; mission: { status: string } } }).current;
        assert.equal(run.status, "done", "only the initial scene and prompt delivery is done");
        assert.equal(run.mission.status, "delivered");
        assert.deepEqual(run.loops, [], "no predetermined workflow stages were executed");
        assert.deepEqual(run.tasks, [], "the scenario did not choose factory tasks for the supervisor");
        assert.equal(requests.length, 2, "the model, not the scenario, chose the delegation and the wait");
        const offered = requests[0] as unknown as { tools: Array<{ function: { name: string; parameters: { properties: { topics?: unknown } } } }> };
        const factoryTool = offered.tools.find((t) => t.function.name === "factory__request");
        assert.ok(factoryTool, "the supervisor can delegate factory work");
        assert.match(JSON.stringify(factoryTool.function.parameters.properties.topics), /"procedure"/, "the actual model-facing schema exposes the procedure topic, not only graph construction");
        assert.match(JSON.stringify(requests[0]), /station__twin_validate/);
        assert.match(JSON.stringify(requests[0]), /station__twin_admit/);
        assert.doesNotMatch(JSON.stringify(requests[0]), /"name":"(?:station__twin_install|twin__install)"/);
        const mother = await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://mother" });
        assert.match(mother.contents[0].text, /I am checking the next mission step/);
        assert.doesNotMatch(mother.contents[0].text, /Detailed model reasoning/);
        const factoryState = started.slots.find((slot) => slot.slot === "factory")!.state as FactoryState;
        const taskIds = Object.keys(factoryState.tasks);
        assert.equal(taskIds.length, 1);
        const candidatePath = path.resolve(taskDir(taskIds[0]));
        assert.equal(path.dirname(candidatePath), path.resolve(WORKSHOP_ROOT));
        assert.equal(JSON.parse(readFileSync(path.join(candidatePath, "task.json"), "utf8")).task.requestedBy, "mission-slot-test");
        createdTaskPath = candidatePath;
        runtimeEvents.append("factory.task-ended", { taskId: taskIds[0], externalResult: "returned" });
        await until((state) => state.mission?.waitingFor === "human");
        const questions = await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://questions" });
        const question = (JSON.parse(questions.contents[0].text) as Array<{ id: string; kind: string; status: string }>).find((q) => q.kind === "ask" && q.status === "open");
        assert.ok(question, "the question is really present in Mother's chat");
        const answer = await operator.call("station", "answer", { questionId: question.id, choice: "text", by: "commander-test", how: "typed", note: "Keep all unfulfilled requirements explicit." });
        assert.equal(answer.ok, true, answer.error);
        assert.equal((answer.output as { answer: { choice: string; note: string } }).answer.choice, "text");
        assert.equal((answer.output as { answer: { note: string } }).answer.note, "Keep all unfulfilled requirements explicit.");
        const completed = await until((state) => state.mission?.status === "completed");
        assert.equal(completed.mission!.id, waiting.mission!.id);
        assert.equal(completed.mission!.objective, waiting.mission!.objective);
        assert.equal(completed.mission!.decisions, 4);
        assert.equal(requests.length, 4);
        assert.match(JSON.stringify(requests[2]), /externalResult/);
        assert.match(JSON.stringify(requests[3]), /commander-test/);
        assert.match(JSON.stringify(requests[3]), /What limitations should the fixture conclusion retain/);
        assert.match(JSON.stringify(requests[3]), /Keep all unfulfilled requirements explicit/);
        const recorded = readFileSync(path.join(logDir, "log.md"), "utf8");
        for (const marker of ["Model request sent", "Supervisor decision input", "Supervisor harness stage", "Supervisor tool call and result", "externalResult", "Keep all unfulfilled requirements explicit"]) assert.ok(recorded.includes(marker), `mission log retains ${marker}`);
        assert.equal(runLog(), null, "the log closes only on actual mission completion");
    } finally {
        rmSync(fixtureFile, { force: true });
        await operator?.close();
        if (started) { for (const slot of started.slots) await slot.close(); await started.broker.stop(); }
        await new Promise<void>((resolve) => server.close(() => resolve()));
        if (createdTaskPath && path.dirname(createdTaskPath) === path.resolve(WORKSHOP_ROOT)) rmSync(createdTaskPath, { recursive: true, force: true });
        for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
});
