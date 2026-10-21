import assert from "node:assert/strict";
import type { Broker } from "../../harness/lib/broker.js";

/** Explicit human decision in legacy test drivers, never a production standing order. */
export async function approveScientificTest(broker: Broker, commissioningId: string | null): Promise<void> {
    assert.ok(commissioningId, "the test requires a real commissioning identifier");
    const read = await broker.call("station", "commissioning_state", { commissioningId });
    assert.equal(read.ok, true, read.error);
    const c = (read.output as { commissioning: { status: string; procedure: { sha256: string } } }).commissioning;
    assert.equal(c.status, "awaiting-scientific-approval");
    const review = await broker.call("station", "commissioning_review", { commissioningId, procedureSha256: c.procedure.sha256, decision: "approve", by: "scientist-test", note: "Explicit scientific decision by the test driver." });
    assert.equal(review.ok, true, review.error);
}
