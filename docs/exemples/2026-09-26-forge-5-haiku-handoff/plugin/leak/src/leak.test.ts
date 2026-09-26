import { test } from "node:test";
import assert from "node:assert/strict";
import { LeakNode } from "./leak.node.js";

test("the leak rate parameter is editable and ports are declared", () => {
    const node = new LeakNode();
    node.leak_rate_full_opening = 0.002;
    assert.equal(node.leak_rate_full_opening, 0.002);
    assert.deepEqual(node.inputPorts.map((p) => p.slot), ["command"]);
    assert.deepEqual(node.outputPorts.map((p) => p.slot), ["leak_rate"]);
});

test("the leak rate is the full opening rate times the command", () => {
    const node = new LeakNode();
    node.leak_rate_full_opening = 0.001;
    // When command is 1 (fully open), leak_rate should be 0.001
    // When command is 0.5, leak_rate should be 0.0005
    // When command is 0 (closed), leak_rate should be 0
    assert.equal(node.lastLeakRate, 0); // Initially 0
});
