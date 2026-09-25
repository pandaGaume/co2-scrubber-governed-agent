import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createLeakCo2Node } from "./leak-co2.node.js";

test("LeakCo2Node: basic instantiation", () => {
    const node = createLeakCo2Node();
    assert.ok(node, "Node should be created");
    assert.equal(node.maxRateKgPerS, 0.001, "Default max rate should be 0.001 kg/s");
    assert.equal(node.lastLeakRate, 0, "Initial leak rate should be 0");
});

test("LeakCo2Node: input and output ports", () => {
    const node = createLeakCo2Node();
    assert.equal(node.inputPorts.length, 1, "Should have 1 input port");
    assert.equal(node.inputPorts[0].name, "command", "Input port should be named 'command'");
    assert.equal(node.outputPorts.length, 2, "Should have 2 output ports");
    assert.equal(node.outputPorts[0].name, "co2Delta", "First output should be 'co2Delta'");
    assert.equal(node.outputPorts[1].name, "lastLeakRate", "Second output should be 'lastLeakRate'");
});

test("LeakCo2Node: editable maxRateKgPerS", () => {
    const node = createLeakCo2Node();
    node.maxRateKgPerS = 0.005;
    assert.equal(node.maxRateKgPerS, 0.005, "Should set max rate to 0.005 kg/s");
    node.maxRateKgPerS = -0.001;
    assert.equal(node.maxRateKgPerS, 0, "Should clamp negative values to 0");
});

test("LeakCo2Node: fire with command 0 (closed)", () => {
    const node = createLeakCo2Node();
    node.maxRateKgPerS = 0.002;
    const session = {
        readSignal: () => 0,
        writeSignal: () => {}
    };
    node.fire(session, 0);
    assert.equal(node.lastLeakRate, 0, "Leak rate should be 0 when command is 0");
});

test("LeakCo2Node: fire with command 1 (fully open)", () => {
    const node = createLeakCo2Node();
    node.maxRateKgPerS = 0.002;
    const session = {
        readSignal: () => 1,
        writeSignal: () => {}
    };
    node.fire(session, 0);
    assert.equal(node.lastLeakRate, -0.002, "Leak rate should be -maxRate when command is 1");
});

test("LeakCo2Node: fire with command 0.5 (half open)", () => {
    const node = createLeakCo2Node();
    node.maxRateKgPerS = 0.004;
    const session = {
        readSignal: () => 0.5,
        writeSignal: () => {}
    };
    node.fire(session, 0);
    assert.equal(node.lastLeakRate, -0.002, "Leak rate should be -0.5 * maxRate when command is 0.5");
});

test("LeakCo2Node: fire with unwired command (defaults to 0)", () => {
    const node = createLeakCo2Node();
    node.maxRateKgPerS = 0.003;
    const session = {
        readSignal: () => undefined,
        writeSignal: () => {}
    };
    node.fire(session, 0);
    assert.equal(node.lastLeakRate, 0, "Leak rate should be 0 when command is unwired");
});

test("LeakCo2Node: fire clamps command to [0, 1]", () => {
    const node = createLeakCo2Node();
    node.maxRateKgPerS = 0.001;
    const session = {
        readSignal: () => 1.5,
        writeSignal: () => {}
    };
    node.fire(session, 0);
    assert.equal(node.lastLeakRate, -0.001, "Leak rate should be clamped to -maxRate when command > 1");
});
