/**
 * The habitat plugin: the nodes the substrate's catalogue lacked to write
 * the physical reference of the two-module habitat, written by hand in
 * this repository (`plugins/habitat/`), registered next to the substrate's
 * plugins in every registry the demo builds (`lib/registry.ts`).
 *
 * What the substrate already has, and the reference uses as it is: the
 * scene presets (`Physics.Scene:moon`, gravity and the ambient frame), the
 * atmosphere (`Physics.Scene:atmosphere`: a mass per species, ideal gas,
 * the composition presets of the core, its CO2 ports declared since
 * plugin-physics 0.1.2), the gate that couples two atmospheres
 * (`Physics.Scene:atmosphere-gate`: the ventilation loop in its `exchange`
 * mode at the flow a fan wires into it, and the hatch, closed), the
 * particulates (`Physics.Particulate:lunar_dust`, the dust), a transducer
 * (`DSP.Sensor:transducer`, the CO2 sensors). What it lacked, and this
 * plugin adds:
 *
 *   Physics.Habitat:person     one person by name, at an activity of their own
 *                              (a word or a rung a timeline schedules), a CO2
 *                              source in kg/s from NASA's rate per activity
 *   Physics.Habitat:crew       people as a CO2 source in kg/s, no volume folded
 *                              in: the persons wired into its pool (`person_<k>`,
 *                              one input per person, the pool growing as they are
 *                              added) plus a head count for the unnamed
 *   Physics.Habitat:scrubber   the scrubber in the datasheet's units (m3/s, an
 *                              efficiency, a lag), removing mass from an atmosphere
 *   Physics.Habitat:fan        a fan on a duct: command to flow through a fan
 *                              curve against the duct's and the filter's resistance
 *   Physics.Habitat:filter     a filter and its fouling: a resistance that grows
 *                              with the dust it captures, the fault of a
 *                              commissioning that finds less flow than designed
 *
 * This plugin is the hand-written case of the `code` topic: what a code
 * factory would have to produce when a graph factory declares a node
 * missing (`docs/plugin-habitat.fr.md`, `docs/journal-noeuds-habitat.fr.md`).
 * A generated plugin would sit next to it, `plugins/generated/`, and
 * register the same way.
 *
 * Every registration carries a signature (purpose, ports with quantity
 * and unit, capabilities) for the planner, and a documentation card.
 */
import type { NodeRegistry } from "@spiky-panda/core";
import { createHabitatPersonNode, HabitatPersonNode } from "./person.node.js";
import { CREW_PERSON_PREFIX, createHabitatCrewNode, HabitatCrewNode, HABITAT_ACTIVITIES } from "./crew.node.js";
import { createHabitatScrubberNode, HabitatScrubberNode } from "./scrubber.node.js";
import { createHabitatFanNode, HabitatFanNode } from "./fan.node.js";
import { createHabitatFilterNode, HabitatFilterNode } from "./filter.node.js";

export { HabitatPersonNode, HabitatCrewNode, HabitatScrubberNode, HabitatFanNode, HabitatFilterNode, HABITAT_ACTIVITIES, CREW_PERSON_PREFIX };

export const HABITAT_PLUGIN_ID = "local.habitat";

/** The node types this plugin registers, in registration order. */
export const HABITAT_NODE_TYPES = ["Physics.Habitat:person", "Physics.Habitat:crew", "Physics.Habitat:scrubber", "Physics.Habitat:fan", "Physics.Habitat:filter"] as const;

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

    reg.register("Physics.Habitat:person", () => createHabitatPersonNode(), {
        label: "Person (CO2 source)",
        category: "Physics.Habitat",
        docPath: doc("person.md"),
        ...ports(new HabitatPersonNode()),
        signature: {
            purpose: "one person by name as a CO2 source in kg/s, at an activity of their own (sleep, rest, light_work, heavy_work) at NASA's rate per activity in litres per minute, their own rates editable; wired into a crew's person pool or straight into an atmosphere",
            inputs: {
                activity: { quantity: "Category", description: "what they do: a word (sleep, rest, light_work, heavy_work) or a rung of that ladder as a number (0 to 3), so a timeline can schedule their day; the editable when unwired" },
            },
            outputs: {
                co2Delta: { ...KGPS, description: "their CO2, for a crew's person_<k> input or an atmosphere's delta_CO2 input" },
                litresPerMinute: { quantity: "VolumetricFlow", unit: "L/min", description: "the same, as a volume of CO2 per minute" },
                activityLevel: { ...RATIO, description: "what they are doing, as the rung of the ladder (0 asleep to 3 at heavy work)" },
            },
            capabilities: ["source", "co2", "crew", "person", "air_quality"],
        },
    });

    reg.register("Physics.Habitat:crew", () => createHabitatCrewNode(), {
        label: "Crew (CO2 source)",
        category: "Physics.Habitat",
        docPath: doc("crew.md"),
        ...ports(new HabitatCrewNode()),
        // The persons' pool: one input per person wired in, the next appearing as the last is taken.
        variadicInput: [{ prefix: CREW_PERSON_PREFIX, type: "float" }],
        signature: {
            purpose: "people as a CO2 source in kg/s: the persons wired into its pool (one person_<k> input each, the pool growing as persons are added), plus a head count at one activity for the people nobody names, each at the activity's rate in litres per minute (NASA's bands), no volume folded in",
            inputs: {
                [`${CREW_PERSON_PREFIX}0`]: { ...KGPS, description: "a person's co2Delta (Physics.Habitat:person); the pool grows (person_1, person_2, ...) as persons are wired" },
                count: { quantity: "Count", unit: "person", description: "head count of the unnamed people, on top of the persons wired; the editable when unwired" },
                activity: { quantity: "Category", description: "the unnamed people's activity: sleep, rest, light_work or heavy_work; the editable when unwired" },
            },
            outputs: {
                co2Delta: { ...KGPS, description: "the crew's CO2, persons and count together, for an atmosphere's delta_CO2 input" },
                litresPerMinute: { quantity: "VolumetricFlow", unit: "L/min", description: "the same, as a volume of CO2 per minute" },
                headcount: { quantity: "Count", unit: "person", description: "the persons wired plus the count" },
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
                particulate_in: { quantity: "Particulate", description: "the dust it captures: a Physics.Particulate node (declarative in V1)" },
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
}
