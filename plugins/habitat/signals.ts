/**
 * How a node of this plugin reads its inputs and writes its outputs: the
 * same two loops every node of the substrate writes by hand (the scrubber,
 * the crew, the cabin), kept here once so a node's `fire` says only its
 * physics. A signal input is the latest value published on the link into
 * that slot; an output is published on every enabled link leaving the slot.
 */
import { inSlotOf } from "@spiky-panda/core";
import type { IChannel, ISession, RuntimeNode } from "@spiky-panda/core";

/** Every signal input by destination slot, as last published; a slot nobody wired is absent. */
export function readInputs(node: RuntimeNode, session: ISession): Map<string, unknown> {
    const links = session.graph.links as ReadonlyArray<IChannel>;
    const out = new Map<string, unknown>();
    for (const link of node.opsc<IChannel>()) {
        if (!link.enabled) continue;
        const idx = links.indexOf(link);
        if (idx < 0) continue;
        out.set(String(inSlotOf(link)), session.readSignal(idx));
    }
    return out;
}

/** A finite number from a signal, or the fallback. */
export const numberOr = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** Publish each value on the links leaving its slot; a slot with no link is simply not published. */
export function publishOutputs(node: RuntimeNode, session: ISession, values: Readonly<Record<string, number>>): void {
    const links = session.graph.links as ReadonlyArray<IChannel>;
    for (const link of node.onsc<IChannel>()) {
        if (!link.enabled) continue;
        const idx = links.indexOf(link);
        if (idx < 0) continue;
        const value = values[String(link.slot)];
        if (typeof value === "number") session.publish(idx, value);
    }
}

/** Universal gas constant, J/(mol K), as the substrate's atmosphere uses it. */
export { GAS_CONSTANT_R } from "@spiky-panda/core";

/** Molar mass of CO2, kg/mol, the substrate's value for the species "CO2". */
export const CO2_MOLAR_MASS = 44.0095e-3;

/** Density of pure CO2 at a pressure (Pa) and a temperature (K), ideal gas, kg/m3. */
export function co2Density(pressurePa: number, temperatureK: number): number {
    return (pressurePa * CO2_MOLAR_MASS) / (8.314462618 * Math.max(1e-9, temperatureK));
}

/** The CO2 in a volume at a concentration (ppm) and conditions, as a mass density, kg of CO2 per m3 of air. */
export function co2MassPerM3(ppm: number, pressurePa: number, temperatureK: number): number {
    return Math.max(0, ppm) * 1e-6 * co2Density(pressurePa, temperatureK);
}
