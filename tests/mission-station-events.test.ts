/** Local model fixture and simulated board. Station decisions return facts, never chosen next actions. */
import { it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";

it("returns an authorised operation to its waiting mission without waking it for another request", { timeout: 30000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mission-station-events-"));
    let requests = 0;
    const seen: string[] = [];
    const server = createServer(async (req, res) => {
        let body = "";
        for await (const chunk of req) body += chunk;
        seen.push(body);
        requests++;
        const name = requests === 1 ? "station__operation_request" : "mission__wait";
        const args = requests === 1 ? { operation: "scrubber.set_speed", input: { percent: 41 }, reason: "Local fixture operation, no data collection claimed.", _mother: "I am proposing an operating point." } : { reason: requests === 2 ? "Awaiting the station decision." : "Decision received; the fixture chooses to wait.", _mother: "I am checking the station decision." };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", tool_calls: [{ id: `call-${requests}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }], usage: {} }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = path.join(dir, "profile.json");
    const routing = path.join(dir, "routing.json");
    writeFileSync(profile, JSON.stringify({ tier3: { wire: "openai-compatible", baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: "local-fixture", apiKey: { env: "STATION_EVENTS_KEY" }, toolChoice: "required" } }));
    writeFileSync(routing, JSON.stringify({ uses: {} }));
    const keys = ["REASONER_PROFILE", "REASONER_ROUTING", "STATION_EVENTS_KEY", "SCRUBBER_SOURCE"];
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, { REASONER_PROFILE: profile, REASONER_ROUTING: routing, STATION_EVENTS_KEY: "local-only", SCRUBBER_SOURCE: "" });
    let started: Awaited<ReturnType<typeof startAllOrFail>> | undefined;
    let operator: Broker | undefined;
    try {
        started = await startAllOrFail(3185);
        operator = new Broker(started.broker.httpBase, { name: "station-events-test", version: "1" }, "station");
        const start = await operator.call("agent", "mission_start", { missionId: "station-events", objective: "Observe the actual human decision and device result.", observation: {} });
        assert.equal(start.ok, true, start.error);
        const deadline = Date.now() + 15000;
        const waitFor = async (decisions: number) => {
            for (;;) {
                const r = await operator!.call("agent", "state", {});
                const mission = (r.output as { mission: { decisions: number; status: string; observations: unknown[] } }).mission;
                if (mission.status === "waiting" && mission.decisions >= decisions) return mission;
                assert.ok(Date.now() < deadline, "mission did not settle");
                await new Promise((resolve) => setTimeout(resolve, 25));
            }
        };
        await waitFor(2);
        const unrelated = await operator.call("station", "operation_request", { operation: "scrubber.set_speed", input: { percent: 72 }, reason: "Another caller's request." });
        const otherId = (unrelated.output as { requestId: string }).requestId;
        await operator.call("station", "operation_decide", { requestId: otherId, decision: "refuse", by: "commander-test" });
        assert.equal(requests, 2);
        const result = await operator.call("station", "operation_decide", { requestId: "op-1", decision: "authorise", by: "commander-test" });
        assert.equal(result.ok, true, result.error);
        const mission = await waitFor(3);
        assert.equal(requests, 3, "the reasoner receives a new turn after the decision");
        const events = mission.observations as Array<{ kind?: string; requestId?: string; request?: { status: string; outcome: { ok: boolean; output: { speedPercent: number } } } }>;
        const event = events.find((e) => e.kind === "station.operation-decided");
        assert.equal(event?.requestId, "op-1");
        assert.equal(event?.request?.status, "executed");
        assert.equal(event?.request?.outcome.output.speedPercent, 41);
        assert.ok(!events.some((e) => e.requestId === otherId));
        assert.match(seen[2], /station.operation-decided/);
        assert.equal(mission.status, "waiting", "the host did not choose a test or complete the mission");
    } finally {
        await operator?.close();
        if (started) { for (const slot of started.slots) await slot.close(); await started.broker.stop(); }
        await new Promise<void>((resolve) => server.close(() => resolve()));
        for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
});
