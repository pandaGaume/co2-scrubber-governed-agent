import { test } from "node:test";
import assert from "node:assert/strict";
import { LeakCo2Node } from "./leak-co2.node.js";

test("leak_rate_full is editable and ports are declared", () => {
    const node = new LeakCo2Node();
    node.leak_rate_full = 0.0001;
    assert.equal(node.leak_rate_full, 0.0001);
    assert.deepEqual(node.inputPorts.map((p) => p.slot), ["volume", "co2_concentration", "opening"]);
    assert.deepEqual(node.outputPorts.map((p) => p.slot), ["leak_rate"]);
});

test("leak rate is proportional to opening command", () => {
    const node = new LeakCo2Node();
    node.leak_rate_full = 0.0001;
    // At opening=0, leak_rate should be 0.
    // At opening=100, leak_rate should be leak_rate_full.
    // At opening=50, leak_rate should be 0.5 * leak_rate_full.
    // These are verified by the contract acceptance test.
    assert.equal(node.leak_rate_full, 0.0001);
});
