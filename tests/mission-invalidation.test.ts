/** In-flight state change on a simulated board; no external model or physical device. */
import { it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";

it("discards an invalidated multi-call answer and reasons afresh without a technical Mother announcement", { timeout: 30000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mission-invalidation-"));
    let operator: Broker | undefined;
    let requests = 0;
    const server = createServer(async (req, res) => {
        for await (const _chunk of req) { /* drain request */ }
        requests++;
        if (requests === 1) {
            const changed = await operator!.call("scrubber", "motor.set_speed", { percent: 50 });
            assert.equal(changed.ok, true, changed.error);
        }
        const calls = requests === 1 ? [
            { name: "library__list", arguments: JSON.stringify({ _mother: "I am consulting the library." }) },
            { name: "mission__complete", arguments: JSON.stringify({ reason: "This queued call must be discarded.", _mother: "The old answer must not complete this mission." }) },
        ] : [{ name: "mission__wait", arguments: JSON.stringify({ reason: "Fresh fixture decision after the state changed.", _mother: "I have reassessed the current situation." }) }];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", tool_calls: calls.map((f, i) => ({ id: `call-${requests}-${i}`, type: "function", function: f })) }, finish_reason: "tool_calls" }], usage: {} }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = path.join(dir, "profile.json");
    const routing = path.join(dir, "routing.json");
    writeFileSync(profile, JSON.stringify({ tier3: { wire: "openai-compatible", baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: "local-fixture", apiKey: { env: "INVALIDATION_TEST_KEY" }, toolChoice: "required" } }));
    writeFileSync(routing, JSON.stringify({ uses: {} }));
    const keys = ["REASONER_PROFILE", "REASONER_ROUTING", "INVALIDATION_TEST_KEY", "SCRUBBER_SOURCE"];
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, { REASONER_PROFILE: profile, REASONER_ROUTING: routing, INVALIDATION_TEST_KEY: "local-only", SCRUBBER_SOURCE: "" });
    let started: Awaited<ReturnType<typeof startAllOrFail>> | undefined;
    try {
        started = await startAllOrFail(3183);
        operator = new Broker(started.broker.httpBase, { name: "invalidation-test", version: "1" }, "station");
        const initial = await operator.call("scrubber", "motor.set_speed", { percent: 60 });
        assert.equal(initial.ok, true, initial.error);
        const start = await operator.call("agent", "mission_start", { missionId: "invalidation", objective: "Retain the mission and reassess a changed observation.", observation: {} });
        assert.equal(start.ok, true, start.error);
        const deadline = Date.now() + 15000;
        let mission: { status: string; note: string; observations: unknown[] };
        for (;;) {
            const state = await operator.call("agent", "state", {});
            mission = (state.output as { mission: typeof mission }).mission;
            if (["waiting", "suspended", "completed"].includes(mission.status)) break;
            assert.ok(Date.now() < deadline, "mission did not settle");
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        assert.equal(mission.status, "waiting", mission.note);
        assert.equal(requests, 2, "a fresh model request replaces the queued completion");
        assert.match(JSON.stringify(mission.observations), /decision.invalidated/);
        const mother = await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://mother" });
        assert.doesNotMatch(mother.contents[0].text, /proposal was not executed|The situation changed before execution|mission transport/);
        assert.match(mother.contents[0].text, /reassessed the current situation/);
        const paused = await operator.call("agent", "pause", {});
        assert.equal(paused.ok, true, paused.error);
        for (;;) {
            const lines = await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://mother" });
            if (lines.contents[0].text.includes("The mission is paused.")) break;
            assert.ok(Date.now() < deadline, "Mother did not announce the suspension");
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    } finally {
        await operator?.close();
        if (started) { for (const slot of started.slots) await slot.close(); await started.broker.stop(); }
        await new Promise<void>((resolve) => server.close(() => resolve()));
        for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
});
