import type { NodeRegistry } from "@spiky-panda/core";
import { createLeakNode, LeakNode } from "./leak.node.js";

/** The type, named under Generated. so that every catalogue says it is generated. */
export const LEAK_TYPE = "Generated.Physics:leak_co2";

/** The entry the forge calls: register every type of the plugin on the registry; `doc` turns a card's file name into the path the catalogue hands out. */
export function register(registry: NodeRegistry, doc: (file: string) => string): void {
    const reg = registry as unknown as { register: (type: string, factory: () => unknown, meta: Record<string, unknown>) => void };
    // The ports are the class's own declarations, read off one instance: never retyped here.
    const node = new LeakNode();
    reg.register(LEAK_TYPE, () => createLeakNode(), {
        label: "CO2 Leak",
        category: "Generated.Physics",
        docPath: doc("leak.md"),
        inputPorts: [...node.inputPorts],
        outputPorts: [...node.outputPorts],
        signature: {
            purpose: "CO2 mass flow out of the atmosphere through a leak, scaled by opening fraction and an editable rate parameter",
            inputs: {
                pressure: { quantity: "Pressure", unit: "Pa", description: "pressure in the atmosphere; 101325 Pa when unwired" },
                opening: { quantity: "Dimensionless", unit: "1", description: "leak opening fraction from 0 (closed) to 1 (fully open); 0 when unwired" },
            },
            outputs: {
                leak_co2: { quantity: "MassFlow", unit: "kg/s", description: "CO2 mass flow out through the leak" },
            },
            capabilities: ["leak", "co2_sink"],
        },
    });
}
