/**
 * The board takes its slot back at once (2026-10-08): with the server started as --board (no stub), the board authenticated
 * as the provider scrubber-board (broker/security.json) occupies the scrubber slot; switched off and on, its new socket
 * replaces the dead one at once (providerTakeover always, .mcp-broker/config.json), with no heartbeat to wait for; and
 * nobody else can take that slot, nor the board another one.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { startAllOrFail } from "./lib/start.js";

const PORT = 3215;
const quiet = (): undefined => undefined;

for (const role of ["operator", "station", "agent", "factory", "monitor"]) process.env[`BROKER_TOKEN_${role.toUpperCase()}`] = randomBytes(24).toString("base64url");
for (const p of ["SLOTS", "BOARD"]) process.env[`BROKER_PROVIDER_SECRET_${p}`] = randomBytes(24).toString("base64url");
process.env.MCP_BROKER_SECURITY_FILE = "broker/security.json";
process.env.SCRUBBER_SOURCE = "board";

/** A provider socket on `/provider/<slot>`, as the board opens it: its secret in X-Provider-Token. */
function providerSocket(base: string, slot: string, secret: string | null): Promise<{ ws: WebSocket; opened: boolean; closed: Promise<{ code: number; reason: string }> }> {
    return new Promise((resolve) => {
        const ws = new WebSocket(`${base.replace(/^http/, "ws")}/provider/${slot}`, secret ? { headers: { "X-Provider-Token": secret } } : {});
        const closed = new Promise<{ code: number; reason: string }>((done) => ws.on("close", (code: number, reason: Buffer) => done({ code, reason: String(reason) })));
        ws.on("open", () => setTimeout(() => resolve({ ws, opened: ws.readyState === WebSocket.OPEN, closed }), 300));
        ws.on("unexpected-response", (_req: unknown, res: { statusCode?: number }) => resolve({ ws, opened: false, closed: Promise.resolve({ code: res.statusCode ?? 0, reason: "refused at the handshake" }) }));
        ws.on("error", () => undefined);
    });
}

describe("the board takes its slot back at once, and nobody else can", () => {
    let broker: LocalBroker;
    let slots: PublishedSlot<object>[];

    before(async () => {
        ({ broker, slots } = await startAllOrFail(PORT));
    });
    after(async () => {
        for (const s of slots) await s.close().catch(quiet);
        broker.stop();
    });

    it("the server's slots publish under their own secret, without the stub", () => {
        assert.ok(slots.some((s) => s.slot === "station"), "the server's slots authenticated");
        assert.ok(!slots.some((s) => s.slot === "scrubber"), "no stub under --board");
    });

    it("occupies, is replaced by itself at once, refuses everyone else, and stays on its own slot", async () => {
        const board = process.env.BROKER_PROVIDER_SECRET_BOARD!;
        const first = await providerSocket(broker.httpBase, "scrubber", board);
        assert.ok(first.opened, `the board occupies its slot (${first.opened ? "" : JSON.stringify(await first.closed)})`);
        // Switched off and on: the old socket is still open as far as the broker knows; the new one takes over at once.
        const second = await providerSocket(broker.httpBase, "scrubber", board);
        assert.ok(second.opened, `the board switched on again takes its slot back (${second.opened ? "" : JSON.stringify(await second.closed)})`);
        await first.closed;
        // No secret: refused at the handshake. The server's secret: another principal, the live board keeps its slot.
        assert.equal((await providerSocket(broker.httpBase, "scrubber", null)).opened, false);
        const other = await providerSocket(broker.httpBase, "scrubber", process.env.BROKER_PROVIDER_SECRET_SLOTS!);
        assert.equal((await other.closed).code, 1008);
        // The board may publish its own slot only.
        const elsewhere = await providerSocket(broker.httpBase, "elsewhere", board);
        const outcome = elsewhere.opened ? await Promise.race([elsewhere.closed, new Promise<{ code: number }>((r) => setTimeout(() => r({ code: -1 }), 1500))]) : { code: 0 };
        assert.notEqual(outcome.code, -1, "the board cannot hold another slot");
        second.ws.close();
    });
});
