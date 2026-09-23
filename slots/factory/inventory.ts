/**
 * The inventory the factory starts from (docs/mise-en-service.fr.md,
 * section 5): who is there, read from Mother's register through the
 * broker, and what can be told from it without guessing. The ISA-95 paths
 * are the map of the place: the area of a path is a place, a place that
 * holds a CO2 sensor is a volume of air, a device that declares
 * `connects` links is an opening between two volumes. Each device says
 * what it is and what it measures, in which unit.
 *
 * And what cannot be told from it, said as such: the served volume of the
 * volume that holds the device being commissioned, and the exchange with a
 * volume it is connected to. The first is measured by the procedure; the
 * second, since 2026-09-23, is a hypothesis the candidate simulators
 * decide.
 *
 * A pure function: the factory slot's `inventory` tool reads the register
 * and hands it here.
 */
import { levelsOf, needsCommissioning, type Device } from "../station/registry.js";

export interface InventoryLine {
    path: string;
    type: string;
    title: string;
    site: string;
    area: string;
    measures: Array<{ property: string; quantity: string; unit: string }>;
    acts: string[];
    commissioning: boolean;
}

export interface Inventory {
    /** The five lines of section 5: path and what the device is. */
    lines: string[];
    devices: InventoryLine[];
    /** Places that hold a CO2 sensor: volumes of air. */
    volumes: Array<{ name: string; path: string; sensors: string[]; devices: string[] }>;
    /** Openings between volumes, from the devices' `connects` links. */
    openings: Array<{ device: string; between: string[] }>;
    /** What the register does not say and the factory must not guess. */
    unknowns: Array<{ what: string; quantity: string; unit: string; volume: string; how: "measured" | "hypothesis" }>;
}

export function inventoryOf(devices: Device[]): Inventory {
    const lines: InventoryLine[] = [...devices]
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((d) => {
            const { site, area } = levelsOf(d.path);
            return {
                path: d.path,
                type: d.descriptor["@type"],
                title: d.descriptor.title,
                site,
                area,
                measures: Object.entries(d.descriptor.properties).map(([property, p]) => ({ property, quantity: p.quantity, unit: p.unit })),
                acts: d.descriptor.actions ?? [],
                commissioning: needsCommissioning(d),
            };
        });
    const volumes = [...new Set(lines.filter((l) => l.measures.some((m) => m.quantity === "Concentration")).map((l) => l.area))].sort().map((name) => {
        const site = lines.find((l) => l.area === name)?.site ?? "";
        const here = lines.filter((l) => l.area === name);
        return { name, path: `/${site}/${name}`, sensors: here.filter((l) => l.measures.some((m) => m.quantity === "Concentration")).map((l) => l.path), devices: here.map((l) => l.path) };
    });
    const openings = devices
        .map((d) => ({ device: d.path, between: (d.descriptor.links ?? []).filter((l) => l.rel === "connects").map((l) => levelsOf(l.href).area) }))
        .filter((o) => o.between.length >= 2);
    const unknowns: Inventory["unknowns"] = [];
    for (const l of lines.filter((x) => x.commissioning)) {
        const volume = volumes.find((v) => v.name === l.area);
        if (!volume) continue;
        unknowns.push({ what: `served volume of ${volume.name}`, quantity: "Volume", unit: "m3", volume: volume.path, how: "measured" });
        for (const o of openings.filter((x) => x.between.includes(volume.name))) {
            for (const other of o.between.filter((b) => b !== volume.name)) unknowns.push({ what: `exchange between ${volume.name} and ${other} through ${o.device}`, quantity: "VolumetricFlow", unit: "m3ps", volume: volume.path, how: "hypothesis" });
        }
    }
    return { lines: lines.map((l) => `${l.path.padEnd(34)} ${l.title}`), devices: lines, volumes, openings, unknowns };
}
