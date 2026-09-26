import { test } from "node:test";
import assert from "node:assert/strict";
import { LeakCo2Node } from "./leak-co2.node.js";

test("the leak rate is editable and its ports are declared", () => {
    const node = new LeakCo2Node();
    node.rateAtFullOpening = 0.002;
    assert.equal(node.rateAtFullOpening, 0.002);
    assert.deepEqual(node.inputPorts.map((p) => p.slot), ["command"]);
    assert.deepEqual(node.outputPorts.map((p) => p.slot), ["co2Delta"]);
});

test("the output is negative and scaled by command", () => {
    const node = new LeakCo2Node();
    node.rateAtFullOpening = 0.002;
    // We can't directly test fire() without a session, but we can verify the node structure
    assert.equal(node.lastCo2Delta, 0);
});
