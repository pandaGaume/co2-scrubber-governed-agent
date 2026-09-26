import { test } from "node:test";
import assert from "node:assert/strict";
import { LeakCo2Node } from "./leak-co2.node.js";

test("leak_rate is editable and ports are declared", () => {
    const node = new LeakCo2Node();
    node.leak_rate = 0.1;
    assert.equal(node.leak_rate, 0.1);
    assert.deepEqual(node.inputPorts.map((p) => p.slot), ["pressure", "volume", "command"]);
    assert.deepEqual(node.outputPorts.map((p) => p.slot), ["leak_co2"]);
});

test("leak_rate must be non-negative", () => {
    const node = new LeakCo2Node();
    node.leak_rate = -1;
    assert.equal(node.leak_rate, 0.05); // Should remain at default
});

test("leak_rate accepts valid positive values", () => {
    const node = new LeakCo2Node();
    node.leak_rate = 0.5;
    assert.equal(node.leak_rate, 0.5);
});
