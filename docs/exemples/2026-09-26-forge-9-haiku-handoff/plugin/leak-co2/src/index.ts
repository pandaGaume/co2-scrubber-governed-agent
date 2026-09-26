import type { NodeRegistry } from "@spiky-panda/core";
import { createLeakCo2Node, LeakCo2Node } from "./leak-co2.node.js";

/** The type, named under Generated. so that every catalogue says it is generated. */
export const LEAK_CO2_TYPE = "Generated.Physics:leak-co2";

/** The entry the forge calls: register every type of the plugin on the registry; `doc` turns a card's file name into the path the catalogue hands out. */
export function register(registry: NodeRegistry, doc: (file: string) => string): void {
    const reg = registry as unknown as { register: (type: string, factory: () => unknown, meta: Record<string, unknown>) => void };
    // The ports are the class's own declarations, read off one instance: never retyped here.
    const node = new LeakCo2Node();
    reg.register(LEAK_CO2_TYPE, () => createLeakCo2Node(), {
        label: "CO2 Leak",
        category: "Generated.Physics",
        docPath: doc("leak-co2.md"),
        inputPorts: [...node.inputPorts],
        outputPorts: [...node.outputPorts],
        signature: {
            purpose: "CO2 mass flow from a seal leak, proportional to opening fraction and pressure",
            inputs: {
                pressure_pa: { quantity: "Pressure", unit: "Pa", description: "ambient pressure in pascals; 101325 Pa when unwired" },
                opening_fraction: { quantity: "Dimensionless", unit: "1", description: "leak opening fraction from 0 (closed) to 1 (fully open); 0 when unwired" },
            },
            outputs: {
                leak_co2: { quantity: "MassFlow", unit: "kg/s", description: "CO2 mass flow out of the volume" },
            },
            capabilities: ["source", "leak"],
        },
    });
}
