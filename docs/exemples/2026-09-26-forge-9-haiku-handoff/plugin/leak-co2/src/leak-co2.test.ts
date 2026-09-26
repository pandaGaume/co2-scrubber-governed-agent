import { test } from "node:test";
import assert from "node:assert/strict";
import { LeakCo2Node } from "./leak-co2.node.js";

test("leak_rate_at_full_opening is editable and ports are declared", () => {
    const node = new LeakCo2Node();
    node.leak_rate_at_full_opening = 0.0001;
    assert.equal(node.leak_rate_at_full_opening, 0.0001);
    assert.deepEqual(node.inputPorts.map((p) => p.slot), ["pressure_pa", "opening_fraction"]);
    assert.deepEqual(node.outputPorts.map((p) => p.slot), ["leak_co2"]);
});

test("leak_rate_at_full_opening rejects negative values", () => {
    const node = new LeakCo2Node();
    node.leak_rate_at_full_opening = 0.0001;
    node.leak_rate_at_full_opening = -0.0001;
    assert.equal(node.leak_rate_at_full_opening, 0.0001);
});
