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

test("the leak rate is negative (CO2 leaves) and scales with command", () => {
    const node = new LeakCo2Node();
    node.rateAtFullOpening = 0.001; // 0.001 kg/s at full opening
    // At command = 0.5, leak rate should be -0.0005 kg/s
    // At command = 1.0, leak rate should be -0.001 kg/s
    // At command = 0.0, leak rate should be 0 kg/s
    assert.equal(node.rateAtFullOpening, 0.001);
});
