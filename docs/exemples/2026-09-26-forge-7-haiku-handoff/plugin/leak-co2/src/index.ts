import type { NodeRegistry } from "@spiky-panda/core";
import { createLeakCo2Node, LeakCo2Node } from "./leak-co2.node.js";

/** The type, named under Generated. so that every catalogue says it is generated. */
export const LEAK_CO2_TYPE = "Generated.Leak";

/** The entry the forge calls: register every type of the plugin on the registry; `doc` turns a card's file name into the path the catalogue hands out. */
export function register(registry: NodeRegistry, doc: (file: string) => string): void {
    const reg = registry as unknown as { register: (type: string, factory: () => unknown, meta: Record<string, unknown>) => void };
    // The ports are the class's own declarations, read off one instance: never retyped here.
    const node = new LeakCo2Node();
    reg.register(LEAK_CO2_TYPE, () => createLeakCo2Node(), {
        label: "CO2 Leak",
        category: "Generated.Leak",
        docPath: doc("leak-co2.md"),
        inputPorts: [...node.inputPorts],
        outputPorts: [...node.outputPorts],
        signature: {
            purpose: "CO2 leak from a seal as a mass flow source: a constant leak rate scaled by a command between 0 and 1, the rate an editable parameter",
            inputs: {
                pressure: { quantity: "Pressure", unit: "Pa", description: "ambient pressure; unused when unwired" },
                volume: { quantity: "Volume", unit: "m3", description: "volume of the space; unused when unwired" },
                command: { quantity: "Dimensionless", unit: "ratio", description: "leak opening fraction from 0 to 1; 1 (fully open) when unwired" }
            },
            outputs: {
                leak_co2: { quantity: "MassFlow", unit: "kg/s", description: "CO2 mass flow out through the leak" }
            },
            capabilities: ["leak", "source"]
        }
    });
}
