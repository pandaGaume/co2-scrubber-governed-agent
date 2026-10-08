/**
 * The broker's authorization on (2026-10-08, broker/security.json, mcp-broker
 * 1.8.1 `auth.dev`): every client presents its role's token, and what the
 * policy denies never reaches a slot. The three layers of the architecture
 * stay apart in the outcome a client sees: `deny` (the broker said no),
 * `refused` (the board said no), `completed`.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { Broker } from "../harness/lib/broker.js";
import { startAllOrFail } from "./lib/start.js";

const PORT = 3213;
const quiet = (): undefined => undefined;

// This file runs in a process of its own: the tokens and the security file are this suite's, set before the broker starts.
for (const role of ["operator", "station", "agent", "factory", "monitor"]) process.env[`BROKER_TOKEN_${role.toUpperCase()}`] = randomBytes(24).toString("base64url");
process.env.MCP_BROKER_SECURITY_FILE = "broker/security.json";

describe("the broker's policy, with every client's token", () => {
    let broker: LocalBroker;
    let slots: PublishedSlot<object>[];
    const clients: Broker[] = [];
    const as = (role: "operator" | "agent" | "factory" | "monitor"): Broker => {
        const b = new Broker(broker.httpBase, { name: `${role}-test`, version: "0", locale: "en" }, role);
        clients.push(b);
        return b;
    };

    before(async () => {
        ({ broker, slots } = await startAllOrFail(PORT));
    });
    after(async () => {
        for (const c of clients) await c.close().catch(quiet);
        for (const s of slots) await s.close().catch(quiet);
        broker.stop();
    });

    it("lets the agent set the speed, and denies it the power off, the protection, the CO2 reading and the commander's answer", async () => {
        const agent = as("agent");
        assert.equal((await agent.call("scrubber", "motor.set_speed", { percent: 40 })).outcome, "completed");
        for (const [slot, tool, args] of [
            ["scrubber", "scrubber.power", { on: false }],
            ["scrubber", "scrubber.set_min_flow", { percent: 0 }],
            ["scrubber", "debug.set_co2", { state: "NOMINAL" }],
            ["station", "answer", { id: "q-1", answer: "authorise" }],
            ["library", "sign", { id: "scrubber-1-datasheet", by: "agent" }],
        ] as const) {
            const r = await agent.call(slot, tool, args);
            assert.equal(r.outcome, "deny", `${slot}.${tool}: ${r.error}`);
        }
    });

    it("lets the operator through to the board, which refuses the power off itself", async () => {
        const r = await as("operator").call("scrubber", "scrubber.power", { on: false });
        assert.equal(r.outcome, "refused", r.error);
        assert.match(String(r.error), /RUN FLOOR/u);
    });

    it("keeps the factories and the tablet off the board, and lets them read", async () => {
        for (const role of ["factory", "monitor"] as const) {
            const client = as(role);
            assert.equal((await client.call("scrubber", "motor.set_speed", { percent: 50 })).outcome, "deny", role);
            assert.equal((await client.call("scrubber", "motor.state")).outcome, "completed", role);
        }
        assert.equal((await as("monitor").call("biomed", "state")).outcome, "completed");
    });

    it("refuses a client without a token, and the station's own calls still work", async () => {
        const nobody = new Broker(broker.httpBase, { name: "nobody", version: "0" }, {});
        clients.push(nobody);
        const r = await nobody.call("scrubber", "motor.state");
        // A missing token is a policy deny too (the harness reads the 401 as one), not a slot down.
        assert.equal(r.outcome, "deny");
        assert.match(String(r.error), /401/u);
        // The station calls the scrubber and the library with its own token: its register answers.
        assert.equal((await as("operator").call("station", "registry_list")).outcome, "completed");
    });
});
