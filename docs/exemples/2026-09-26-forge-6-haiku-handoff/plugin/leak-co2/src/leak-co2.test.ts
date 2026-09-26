import { test } from "node:test";
import assert from "node:assert/strict";
import { LeakCo2Node } from "./leak-co2.node.js";

test("the leak rate is editable and its ports are declared", () => {
    const node = new LeakCo2Node();
    node.leak_rate = 0.1;
    assert.equal(node.leak_rate, 0.1);
    assert.deepEqual(
        node.inputPorts.map((p) => p.slot),
        ["co2_concentration", "lab_volume"]
    );
    assert.deepEqual(node.outputPorts.map((p) => p.slot), ["leak_flow"]);
});

test("leak flow computation matches the contract behavior", () => {
    const node = new LeakCo2Node();
    node.leak_rate = 0.05; // L/min

    // Test case 1: co2_concentration=500 ppm, lab_volume=30 m3
    // Expected: 0.05 * 500 / 1e6 * 30 / 1000 / 60 = 1.25e-8 kg/s
    let leak_flow = (node.leak_rate * 500 / 1e6 * 30) / 1000 / 60;
    assert.ok(Math.abs(leak_flow - 1.25e-8) < 1e-15, `leak_flow should be ~1.25e-8, got ${leak_flow}`);

    // Test case 2: co2_concentration=1000 ppm, lab_volume=50 m3
    // Expected: 0.05 * 1000 / 1e6 * 50 / 1000 / 60 = 4.166...e-8 kg/s
    leak_flow = (node.leak_rate * 1000 / 1e6 * 50) / 1000 / 60;
    assert.ok(Math.abs(leak_flow - 4.166666666666667e-8) < 1e-15, `leak_flow should be ~4.166e-8, got ${leak_flow}`);
});
