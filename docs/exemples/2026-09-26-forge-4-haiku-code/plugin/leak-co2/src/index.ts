import type { NodeRegistry } from "@spiky-panda/core";
import { createLeakCo2Node, LeakCo2Node } from "./leak-co2.node.js";

/** The type, named under Generated. so that every catalogue says it is generated. */
export const LEAK_CO2_TYPE = "Generated.Habitat:leak_co2";

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
            purpose: "CO2 leak from a volume at a constant mass flow scaled by a command: a leak through a seal or a vent held open",
            inputs: { command: { quantity: "Dimensionless", unit: "ratio", description: "the opening fraction, 0 to 1; 1 when unwired" } },
            outputs: { co2Delta: { quantity: "MassFlow", unit: "kg/s", description: "the CO2 leaving the volume (negative: what leaves)" } },
            capabilities: ["leak", "vent"],
        },
    });
}
