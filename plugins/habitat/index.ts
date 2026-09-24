/**
 * The habitat plugin: the nodes the substrate's catalogue lacked to write
 * the physical reference of the two-module habitat, written by hand in
 * this repository (`plugins/habitat/`), registered next to the substrate's
 * plugins in every registry the demo builds (`lib/registry.ts`).
 *
 * What it adds, and why each node is here rather than in the substrate:
 *
 *   Physics.Habitat:atmosphere   the substrate's atmosphere with its CO2 sources,
 *                            sinks and observables declared as ports, so a
 *                            document built headless can wire them
 *   Physics.Habitat:crew         people as a CO2 source in kg/s, no volume folded in
 *   Physics.Habitat:scrubber     the scrubber in the datasheet's units (m3/s, an
 *                            efficiency, a lag), removing mass from an atmosphere
 *   Physics.Habitat:fan         a fan on a duct: command to flow through a fan
 *                            curve against the duct's and the filter's resistance
 *   Physics.Habitat:filter      a filter and its fouling: a resistance that grows
 *                            with the dust it captures, the fault of a
 *                            commissioning that finds less flow than designed
 *   Physics.Habitat:duct        the CO2 the ventilation exchanges between two
 *                            volumes at a flow a fan sets
 *   Physics.Habitat:hatch       the same exchange through an opening, open or closed
 *
 * This plugin is the hand-written case of the `code` topic: what a code
 * factory would have to produce when a graph factory declares a node
 * missing (`docs/plugin-habitat.fr.md`, `docs/journal-noeuds-habitat.fr.md`). A generated plugin would sit next
 * to it, `plugins/generated/`, and register the same way.
 *
 * Every registration carries a signature (purpose, ports with quantity
 * and unit, capabilities) for the planner, and a documentation card.
 */
import type { NodeRegistry } from "@spiky-panda/core";
import { createHabitatAtmosphereNode, HabitatAtmosphereNode, CO2_DELTA_SLOTS } from "./atmosphere.node.js";
import { createHabitatCrewNode, HabitatCrewNode, HABITAT_ACTIVITIES } from "./crew.node.js";
import { createHabitatScrubberNode, HabitatScrubberNode } from "./scrubber.node.js";
import { createHabitatFanNode, HabitatFanNode } from "./fan.node.js";
import { createHabitatFilterNode, HabitatFilterNode } from "./filter.node.js";
import { createHabitatDuctNode, createHabitatHatchNode, HabitatDuctNode, HabitatHatchNode } from "./duct.node.js";

export { HabitatAtmosphereNode, HabitatCrewNode, HabitatScrubberNode, HabitatFanNode, HabitatFilterNode, HabitatDuctNode, HabitatHatchNode, HABITAT_ACTIVITIES, CO2_DELTA_SLOTS };

export const HABITAT_PLUGIN_ID = "local.habitat";

/** The node types this plugin registers, in registration order. */
export const HABITAT_NODE_TYPES = ["Physics.Habitat:atmosphere", "Physics.Habitat:crew", "Physics.Habitat:scrubber", "Physics.Habitat:fan", "Physics.Habitat:filter", "Physics.Habitat:duct", "Physics.Habitat:hatch"] as const;

const KGPS = { quantity: "MassFlow", unit: "kg/s" } as const;
const M3PS = { quantity: "VolumetricFlow", unit: "m3ps" } as const;
const PPM = { quantity: "Concentration", unit: "ppm" } as const;
const RATIO = { quantity: "Dimensionless", unit: "ratio" } as const;
const WATT = { quantity: "Power", unit: "watt" } as const;
const PA = { quantity: "Pressure", unit: "Pa" } as const;
const KELVIN = { quantity: "Temperature", unit: "k" } as const;
const RESISTANCE = { quantity: "FlowResistance", unit: "Pa/(m3/s)^2" } as const;

/** Register the plugin's nodes on a registry; `doc` turns a card's file name into the path the catalogue hands out. */
export function registerHabitatNodes(registry: NodeRegistry, doc: (file: string) => string = (file) => `plugins/habitat/docs/${file}`): void {
    const reg = registry as unknown as { register: (type: string, factory: () => unknown, meta: Record<string, unknown>) => void };
    // The ports of each type are the class's own declarations, read off one instance: never retyped here.
    const ports = (node: { inputPorts: ReadonlyArray<unknown>; outputPorts: ReadonlyArray<unknown> }) => ({ inputPorts: [...node.inputPorts], outputPorts: [...node.outputPorts] });

    reg.register("Physics.Habitat:atmosphere", () => createHabitatAtmosphereNode(), {
        label: "Habitat atmosphere (CO2)",
        category: "Physics.Habitat",
        docPath: doc("atmosphere.md"),
        ...ports(new HabitatAtmosphereNode()),
        signature: {
            purpose: "the air of one well-mixed volume as a mass inventory per species (ideal gas): CO2 sources and sinks in kg/s summed into its CO2 mass, its CO2 concentration in ppm and its pressure published",
            inputs: {
                delta_CO2_0: { ...KGPS, description: "a CO2 source (positive) or sink (negative), summed with the others" },
                delta_CO2_1: { ...KGPS, description: "another source or sink" },
                delta_CO2_2: { ...KGPS, description: "another source or sink" },
                delta_CO2_3: { ...KGPS, description: "another source or sink" },
            },
            outputs: {
                ppm_CO2: { ...PPM, description: "the CO2 concentration of the volume" },
                mass_CO2: { quantity: "Mass", unit: "kg", description: "the CO2 in the volume" },
                partial_pressure_CO2: { ...PA, description: "the CO2 partial pressure" },
                pressure: { ...PA, description: "the total pressure" },
                temperature: { ...KELVIN, description: "the air temperature" },
                density: { quantity: "Density", unit: "kg/m3", description: "the air density" },
            },
            capabilities: ["prediction", "co2", "air_quality", "volume", "mass_balance", "atmosphere"],
        },
    });

    reg.register("Physics.Habitat:crew", () => createHabitatCrewNode(), {
        label: "Crew (CO2 source)",
        category: "Physics.Habitat",
        docPath: doc("crew.md"),
        ...ports(new HabitatCrewNode()),
        signature: {
            purpose: "people as a CO2 source in kg/s: a head count at one activity, each person at the activity's rate in litres per minute (NASA's bands), no volume folded in",
            inputs: {
                count: { quantity: "Count", unit: "person", description: "head count of the group; the editable when unwired" },
                activity: { quantity: "Category", description: "sleep, rest, light_work or heavy_work; the editable when unwired" },
            },
            outputs: {
                co2Delta: { ...KGPS, description: "the group's CO2, for an atmosphere's delta_CO2 input" },
                litresPerMinute: { quantity: "VolumetricFlow", unit: "L/min", description: "the same, as a volume of CO2 per minute" },
            },
            capabilities: ["source", "co2", "crew", "air_quality"],
        },
    });

    reg.register("Physics.Habitat:scrubber", () => createHabitatScrubberNode(), {
        label: "CO2 scrubber (mass)",
        category: "Physics.Habitat",
        docPath: doc("scrubber.md"),
        ...ports(new HabitatScrubberNode()),
        signature: {
            purpose: "a CO2 scrubber at a command fraction, in its datasheet's units: a flow in m3/s that follows the command with a lag, a single-pass efficiency, the CO2 removed in kg/s from the concentration it draws, and its electrical power",
            inputs: {
                command: { ...RATIO, description: "0 to 1, the commanded fraction of full speed" },
                ppm: { ...PPM, description: "the CO2 concentration of the air it draws (the volume's ppm_CO2)" },
                pressure: { ...PA, description: "the air pressure, the editable default when unwired" },
                temperature: { ...KELVIN, description: "the air temperature, the editable default when unwired" },
            },
            outputs: {
                co2Delta: { ...KGPS, description: "minus the CO2 removed, for an atmosphere's delta_CO2 input" },
                flow: { ...M3PS, description: "the air flow through the beds, after the lag" },
                effectiveFlow: { ...M3PS, description: "efficiency times the flow: the air cleaned per second" },
                power: { ...WATT, description: "electrical power drawn" },
            },
            capabilities: ["sink", "co2", "scrubber", "air_quality", "power_load"],
        },
    });

    reg.register("Physics.Habitat:fan", () => createHabitatFanNode(), {
        label: "HVAC fan",
        category: "Physics.Habitat",
        docPath: doc("fan.md"),
        ...ports(new HabitatFanNode()),
        signature: {
            purpose: "a ventilation fan: from a command to the flow it delivers against the duct's and the filter's resistance, through its fan curve (shutoff pressure, free delivery, fan laws), with a spin-up lag and its power",
            inputs: {
                command: { ...RATIO, description: "0 to 1, the commanded fraction of rated speed" },
                resistance: { ...RESISTANCE, description: "the resistance of what the fan blows through besides its own duct (a filter's)" },
            },
            outputs: {
                flow: { ...M3PS, description: "the flow delivered at the operating point" },
                pressureRise: { ...PA, description: "the pressure the fan develops at that flow" },
                power: { ...WATT, description: "electrical power drawn" },
                speedRatio: { ...RATIO, description: "the speed reached, 0 to 1, after the spin-up" },
            },
            capabilities: ["ventilation", "hvac", "fan", "flow", "power_load"],
        },
    });

    reg.register("Physics.Habitat:filter", () => createHabitatFilterNode(), {
        label: "HVAC filter",
        category: "Physics.Habitat",
        docPath: doc("filter.md"),
        ...ports(new HabitatFilterNode()),
        signature: {
            purpose: "an air filter on a duct: a resistance to the flow that grows with the dust it captures (its loading, the fault of a fouled filter), the pressure drop, and how far it stands from its end of life",
            inputs: {
                flow: { ...M3PS, description: "the air flow through the filter (a fan's)" },
                dustConcentration: { quantity: "Density", unit: "kg/m3", description: "the dust the air carries; the editable ambient value when unwired" },
            },
            outputs: {
                resistance: { ...RESISTANCE, description: "the resistance at the current loading, for a fan's resistance input" },
                pressureDrop: { ...PA, description: "the pressure drop at the current flow" },
                loading: { quantity: "Mass", unit: "kg", description: "dust captured so far" },
                clogging: { ...RATIO, description: "loading over end-of-life loading: 0 clean, 1 to be replaced" },
            },
            capabilities: ["ventilation", "hvac", "filter", "fault", "fouling", "degradation"],
        },
    });

    reg.register("Physics.Habitat:duct", () => createHabitatDuctNode(), {
        label: "Inter-module duct",
        category: "Physics.Habitat",
        docPath: doc("duct.md"),
        ...ports(new HabitatDuctNode()),
        signature: {
            purpose: "the CO2 a ventilation exchanges between two volumes at the flow a fan delivers, as two opposite mass flows: what leaves one volume enters the other",
            inputs: {
                flow: { ...M3PS, description: "the air exchanged each way (a fan's flow)" },
                ppmA: { ...PPM, description: "the CO2 concentration of volume A" },
                ppmB: { ...PPM, description: "the CO2 concentration of volume B" },
                pressure: { ...PA, description: "the air pressure, the editable default when unwired" },
                temperature: { ...KELVIN, description: "the air temperature, the editable default when unwired" },
            },
            outputs: {
                co2DeltaA: { ...KGPS, description: "for volume A's delta_CO2 input" },
                co2DeltaB: { ...KGPS, description: "for volume B's delta_CO2 input" },
                exchangeFlow: { ...M3PS, description: "the flow exchanged" },
            },
            capabilities: ["exchange", "ventilation", "hvac", "co2", "mass_balance"],
        },
    });

    reg.register("Physics.Habitat:hatch", () => createHabitatHatchNode(), {
        label: "Hatch",
        category: "Physics.Habitat",
        docPath: doc("hatch.md"),
        ...ports(new HabitatHatchNode()),
        signature: {
            purpose: "the CO2 exchanged between two volumes through a hatch: an exchange flow when open, the seals' leak when closed, as two opposite mass flows",
            inputs: {
                open: { ...RATIO, description: "1 open, 0 closed; the editable when unwired" },
                ppmA: { ...PPM, description: "the CO2 concentration of volume A" },
                ppmB: { ...PPM, description: "the CO2 concentration of volume B" },
                pressure: { ...PA, description: "the air pressure, the editable default when unwired" },
                temperature: { ...KELVIN, description: "the air temperature, the editable default when unwired" },
            },
            outputs: {
                co2DeltaA: { ...KGPS, description: "for volume A's delta_CO2 input" },
                co2DeltaB: { ...KGPS, description: "for volume B's delta_CO2 input" },
                exchangeFlow: { ...M3PS, description: "the flow exchanged" },
            },
            capabilities: ["exchange", "hatch", "opening", "co2", "mass_balance"],
        },
    });
}
