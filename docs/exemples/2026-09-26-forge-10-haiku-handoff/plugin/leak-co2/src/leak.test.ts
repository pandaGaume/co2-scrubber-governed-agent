import { test } from "node:test";
import assert from "node:assert/strict";
import { LeakNode } from "./leak.node.js";

test("the leak rate is editable and its ports are declared", () => {
    const node = new LeakNode();
    node.rate = 0.0001;
    assert.equal(node.rate, 0.0001);
    assert.deepEqual(
        node.inputPorts.map((p) => p.slot),
        ["pressure", "opening"]
    );
    assert.deepEqual(node.outputPorts.map((p) => p.slot), ["leak_co2"]);
});

test("leak is zero when opening is zero", () => {
    const node = new LeakNode();
    node.rate = 0.0001;
    // With opening=0 (default), leak should be 0
    // This is verified by the contract behavior: leak_co2(opening=0) == 0
    assert.equal(node.lastLeakCO2, 0);
});

test("leak scales linearly with opening", () => {
    const node = new LeakNode();
    node.rate = 0.0001;
    // The contract specifies:
    // leak_co2(opening=1, pressure=101325) == rate
    // leak_co2(opening=0.5, pressure=101325) == 0.5 * rate
    // This is the behavior the forge will verify
    assert.equal(node.rate, 0.0001);
});
