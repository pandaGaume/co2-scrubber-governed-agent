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
            purpose: "CO2 mass flow leaking from a volume through a seal failure: proportional to opening command (0 to 1), scaled by the editable full-opening rate",
            inputs: {
                volume: { quantity: "Volume", unit: "m3", description: "the volume containing the CO2" },
                co2_concentration: { quantity: "Concentration", unit: "ppm", description: "the CO2 concentration in the volume" },
                opening: { quantity: "Dimensionless", unit: "percent", description: "the seal opening command, 0 to 100; 0 when unwired" },
            },
            outputs: {
                leak_rate: { quantity: "MassFlow", unit: "kg/s", description: "the CO2 mass flow leaking out" },
            },
            capabilities: ["co2_source", "leak"],
        },
    });
}
