import type { NodeRegistry } from "@spiky-panda/core";
import { createLeakNode, LeakNode } from "./leak.node.js";

/** The type, named under Generated. so that every catalogue says it is generated. */
export const LEAK_TYPE = "Generated.Physics.Habitat:leak";

/** The entry the forge calls: register every type of the plugin on the registry; `doc` turns a card's file name into the path the catalogue hands out. */
export function register(registry: NodeRegistry, doc: (file: string) => string): void {
    const reg = registry as unknown as { register: (type: string, factory: () => unknown, meta: Record<string, unknown>) => void };
    // The ports are the class's own declarations, read off one instance: never retyped here.
    const node = new LeakNode();
    reg.register(LEAK_TYPE, () => createLeakNode(), {
        label: "Leak (CO2 source)",
        category: "Generated.Physics.Habitat",
        docPath: doc("leak.md"),
        inputPorts: [...node.inputPorts],
        outputPorts: [...node.outputPorts],
        signature: {
            purpose: "a CO2 leak from a seal as a constant mass flow source: the leak rate at full opening, scaled by a command between 0 and 1 (fully open when unwired)",
            inputs: { command: { quantity: "Dimensionless", unit: "ratio", description: "the leak opening fraction from 0 to 1; 1 (fully open) when unwired" } },
            outputs: { leak_rate: { quantity: "MassFlow", unit: "kg/s", description: "the CO2 mass flow out of the volume through the leak" } },
            capabilities: ["source", "leak"],
        },
    });
}
