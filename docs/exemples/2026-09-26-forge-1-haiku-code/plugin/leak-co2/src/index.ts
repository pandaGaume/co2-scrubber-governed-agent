import { RuntimeRegistry, RuntimeNode } from '@spiky-panda/core';
import { LeakCO2 } from './leak-co2.node';

export function register(registry: RuntimeRegistry, doc: (name: string) => string) {
  registry.registerNodeType({
    type: 'Generated.Physics.Habitat:leak-co2',
    label: 'CO2 Leak',
    category: 'Physics.Habitat',
    docPath: doc('leak-co2.md'),
    factory: () => new LeakCO2(),
    ports: (instance: RuntimeNode) => {
      const node = instance as LeakCO2;
      return {
        inputPorts: node.inputPorts,
        outputPorts: node.outputPorts,
      };
    },
    signature: {
      purpose: 'CO2 leak source: a mass flow output scaled by a command (0 to 1) from an editable rate, for seals or vents',
      inputs: {
        command: {
          quantity: 'Dimensionless',
          unit: 'ratio',
          description: 'leak opening fraction (0 to 1); 1 when unwired',
        },
      },
      outputs: {
        co2Delta: {
          quantity: 'MassFlow',
          unit: 'kg/s',
          description: 'CO2 mass flow leaving (negative: what leaves the atmosphere)',
        },
        lastLeaked: {
          quantity: 'Mass',
          unit: 'kg',
          description: 'CO2 mass that left on the last tick',
        },
      },
      capabilities: [],
    },
  });
}
