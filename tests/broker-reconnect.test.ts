/**
 * A client that asks for a slot before the broker publishes it opens it again at its next call (2026-10-01): the session that could
 * not be opened was kept, and every later call of that client failed with the same "fetch failed" (the station at startup, before
 * the library: its recommendations refused by a library it never reached; the commissioning test's manifest, now and then).
 *
 *     node --test dist/tests/
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";

const PORT = 3199;

describe("a session that could not be opened is opened again", () => {
    let local: LocalBroker | undefined;
    let slots: PublishedSlot<object>[] = [];
    const client = new Broker(`http://localhost:${PORT}`, { name: "early-client", version: "0", locale: "en" });
    after(async () => {
        await client.close();
        for (const s of slots) await s.close().catch(() => undefined);
        await local?.stop();
    });

    it("a call before the broker is up fails; the same client's call after it succeeds", async () => {
        const early = await client.call("library", "list", {});
        assert.equal(early.ok, false);
        ({ broker: local, slots } = await startAllOrFail(PORT));
        const later = await client.call("library", "list", {});
        assert.equal(later.ok, true, later.error);
    });
});
