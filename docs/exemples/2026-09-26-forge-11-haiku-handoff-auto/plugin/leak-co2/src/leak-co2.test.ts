import { test } from "node:test";
import assert from "node:assert/strict";
import { LeakCo2Node } from "./leak-co2.node.js";

test("leak-co2 node: conductance is editable and ports are declared", () => {
    const node = new LeakCo2Node();
    node.conductance = 1e-11;
    assert.equal(node.conductance, 1e-11);
    assert.deepEqual(
        node.inputPorts.map((p) => p.slot),
        ["pressure_source", "pressure_sink", "density"]
    );
    assert.deepEqual(node.outputPorts.map((p) => p.slot), ["leak_co2"]);
});

test("leak-co2 node: pressure_reference is not editable", () => {
    const node = new LeakCo2Node();
    const original = node.pressure_reference;
    node.pressure_reference = 99999;
    assert.equal(node.pressure_reference, original);
});

test("leak-co2 node: conductance cannot be negative", () => {
    const node = new LeakCo2Node();
    node.conductance = 1e-11;
    node.conductance = -1e-11;
    assert.equal(node.conductance, 1e-11);
});
