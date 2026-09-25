import type { NodeRegistry } from "@spiky-panda/core";
import { createLeakCo2Node, LeakCo2Node } from "./leak-co2.node.js";

/** The type, named under Generated. so that every catalogue says it is generated. */
export const LEAK_CO2_TYPE = "Generated.Physics:leak-co2";

/** The entry the forge calls: register every type of the plugin on the registry. */
export function register(registry: NodeRegistry, doc: (file: string) => string): void {
    const instance = createLeakCo2Node();
    registry.register(
        LEAK_CO2_TYPE,
        () => createLeakCo2Node(),
        {
            label: "CO2 Leak",
            category: "Physics.Habitat",
            docPath: doc("leak-co2.md"),
            inputPorts: instance.inputPorts,
            outputPorts: instance.outputPorts,
            signature: {
                purpose: "A CO2 leak or controlled vent: mass flow out of the habitat scaled by a command (0 to 1), with an editable maximum rate at full opening",
                inputs: {
                    command: {
                        quantity: "Dimensionless",
                        unit: "ratio",
                        description: "Control signal from 0 (closed) to 1 (fully open); defaults to 0 when unwired"
                    }
                },
                outputs: {
                    co2Delta: {
                        quantity: "MassFlow",
                        unit: "kg/s",
                        description: "CO2 mass flow out of the atmosphere (negative: leaves the system)"
                    },
                    lastLeakRate: {
                        quantity: "MassFlow",
                        unit: "kg/s",
                        description: "The CO2 leak rate on the last tick"
                    }
                },
                capabilities: []
            }
        }
    );
}
