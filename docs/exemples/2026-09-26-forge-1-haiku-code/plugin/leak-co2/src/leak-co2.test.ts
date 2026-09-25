import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { LeakCO2 } from './leak-co2.node';

describe('LeakCO2', () => {
  test('default rate is 0.001 kg/s', () => {
    const node = new LeakCO2();
    assert.equal(node.rateKgPerS, 0.001);
  });

  test('rate can be set and clamped to non-negative', () => {
    const node = new LeakCO2();
    node.rateKgPerS = 0.005;
    assert.equal(node.rateKgPerS, 0.005);
    node.rateKgPerS = -0.001;
    assert.equal(node.rateKgPerS, 0);
  });

  test('lastLeaked is initially zero', () => {
    const node = new LeakCO2();
    assert.equal(node.lastLeaked, 0);
  });

  test('inputPorts and outputPorts are defined', () => {
    const node = new LeakCO2();
    assert.equal(node.inputPorts.length, 1);
    assert.equal(node.inputPorts[0].slot, 'command');
    assert.equal(node.outputPorts.length, 2);
    assert.equal(node.outputPorts[0].slot, 'co2Delta');
    assert.equal(node.outputPorts[1].slot, 'lastLeaked');
  });
});
