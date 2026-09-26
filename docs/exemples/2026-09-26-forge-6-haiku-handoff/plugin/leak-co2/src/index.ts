import type { NodeRegistry } from "@spiky-panda/core";
import { createLeakCo2Node, LeakCo2Node } from "./leak-co2.node.js";

/** The type, named under Generated. so that every catalogue says it is generated. */
export const LEAK_CO2_TYPE = "Generated.Habitat:leak-co2";

/** The entry the forge calls: register every type of the plugin on the registry; `doc` turns a card's file name into the path the catalogue hands out. */
export function register(registry: NodeRegistry, doc: (file: string) => string): void {
    const reg = registry as unknown as { register: (type: string, factory: () => unknown, meta: Record<string, unknown>) => void };
    // The ports are the class's own declarations, read off one instance: never retyped here.
    const node = new LeakCo2Node();
    reg.register(LEAK_CO2_TYPE, () => createLeakCo2Node(), {
        label: "CO2 Leak",
        category: "Generated.Habitat",
        docPath: doc("leak-co2.md"),
        inputPorts: [...node.inputPorts],
        outputPorts: [...node.outputPorts],
        signature: {
            purpose: "CO2 mass flow leaking from a sealed volume through a passive leak, proportional to the leak rate and the CO2 concentration",
            inputs: {
                co2_concentration: { quantity: "Concentration", unit: "ppm", description: "CO2 concentration in the volume; 500 ppm when unwired" },
                lab_volume: { quantity: "Volume", unit: "m3", description: "volume of the sealed space; 30 m3 when unwired" },
            },
            outputs: {
                leak_flow: { quantity: "MassFlow", unit: "kg/s", description: "CO2 mass flow leaking out" },
            },
            capabilities: ["leak", "co2-source"],
        },
    });
}
