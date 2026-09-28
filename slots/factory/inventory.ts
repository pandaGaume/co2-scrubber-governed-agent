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
 * And what can be acted upon, from the register alone (2026-09-25): each
 * commandable property is an intervention an agent may propose (commanded,
 * through whoever authorises); each opening is one a person operates. It is
 * the space an experiment is chosen in, when two hypotheses fit the same
 * data: which intervention parts them most.
 *
 * A pure function: the factory slot's `inventory` tool reads the register
 * and hands it here. Since 2026-09-28 the rules are the spec's
 * (`specs/factory/inventory.json`: the quantity that makes a place a volume
 * of air, the relation that makes a device an opening, the unknowns a device
 * under commissioning leaves and how each is found): this code applies
 * them and knows none.
 */
import { readFileSync } from "node:fs";
import { fromRoot } from "../../lib/paths.js";
import { commandsOf, levelsOf, needsCommissioning, type Device } from "../station/registry.js";

interface InventoryRules {
    volume: { measures: string };
    opening: { rel: string; places: number };
    unknowns: Array<{ through?: "opening"; what: string; quantity: string; unit: string; how: "measured" | "hypothesis" }>;
    states: { separator: string };
    lineWidth: number;
}

export const INVENTORY_RULES_FILE = "specs/factory/inventory.json";
export const INVENTORY_RULES: InventoryRules = JSON.parse(readFileSync(fromRoot(...INVENTORY_RULES_FILE.split("/")), "utf8")) as InventoryRules;

const fill = (template: string, vars: Record<string, string>): string => template.replace(/\{([A-Za-z]+)\}/g, (hole, name: string) => vars[name] ?? hole);

export interface InventoryLine {
    path: string;
    type: string;
    title: string;
    site: string;
    area: string;
    measures: Array<{ property: string; quantity: string; unit: string }>;
    acts: string[];
    /** What can be commanded on it: the property, the action that sets it, its range. */
    commands: ReturnType<typeof commandsOf>;
    commissioning: boolean;
}

/** An intervention on the physical world the installation allows: a command on a device (an agent may propose it, the commander authorises) or an opening a person operates. */
export interface Intervention {
    device: string;
    property: string;
    quantity: string;
    unit: string;
    how: "commanded" | "operated";
    /** The action that sets it, for a command. */
    action?: string;
    min?: number;
    max?: number;
    states?: string[];
}

export interface Inventory {
    /** The five lines of section 5: path and what the device is. */
    lines: string[];
    devices: InventoryLine[];
    /** Places that hold a sensor of the spec's quantity: volumes of air. */
    volumes: Array<{ name: string; path: string; sensors: string[]; devices: string[] }>;
    /** Openings between volumes, from the devices' `connects` links. */
    openings: Array<{ device: string; between: string[] }>;
    /** What the register does not say and the factory must not guess. */
    unknowns: Array<{ what: string; quantity: string; unit: string; volume: string; how: "measured" | "hypothesis" }>;
    /** What can be acted upon: the commands of the devices, then the openings a person operates. */
    interventions: Intervention[];
}

export function inventoryOf(devices: Device[], rules: InventoryRules = INVENTORY_RULES): Inventory {
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
                commands: commandsOf(d),
                commissioning: needsCommissioning(d),
            };
        });
    const senses = (l: InventoryLine) => l.measures.some((m) => m.quantity === rules.volume.measures);
    const volumes = [...new Set(lines.filter(senses).map((l) => l.area))].sort().map((name) => {
        const site = lines.find((l) => l.area === name)?.site ?? "";
        const here = lines.filter((l) => l.area === name);
        return { name, path: `/${site}/${name}`, sensors: here.filter(senses).map((l) => l.path), devices: here.map((l) => l.path) };
    });
    const openings = devices
        .map((d) => ({ device: d.path, between: (d.descriptor.links ?? []).filter((l) => l.rel === rules.opening.rel).map((l) => levelsOf(l.href).area) }))
        .filter((o) => o.between.length >= rules.opening.places);
    const unknowns: Inventory["unknowns"] = [];
    for (const l of lines.filter((x) => x.commissioning)) {
        const volume = volumes.find((v) => v.name === l.area);
        if (!volume) continue;
        for (const u of rules.unknowns) {
            const at = { quantity: u.quantity, unit: u.unit, volume: volume.path, how: u.how };
            if (u.through !== "opening") unknowns.push({ what: fill(u.what, { volume: volume.name }), ...at });
            else for (const o of openings.filter((x) => x.between.includes(volume.name))) for (const other of o.between.filter((b) => b !== volume.name)) unknowns.push({ what: fill(u.what, { volume: volume.name, other, device: o.device }), ...at });
        }
    }
    const interventions: Intervention[] = [
        ...lines.flatMap((l) => l.commands.map((c) => ({ device: l.path, property: c.property, quantity: c.quantity, unit: c.unit, how: "commanded" as const, action: c.action, ...(typeof c.min === "number" ? { min: c.min } : {}), ...(typeof c.max === "number" ? { max: c.max } : {}), ...(c.states ? { states: c.states } : {}) }))),
        ...openings.flatMap((o) => {
            const device = devices.find((d) => d.path === o.device);
            return Object.entries(device?.descriptor.properties ?? {}).filter(([, p]) => !p.commandable).map(([property, p]) => ({ device: o.device, property, quantity: p.quantity, unit: p.unit, how: "operated" as const, ...(p.unit.includes(rules.states.separator) ? { states: p.unit.split(rules.states.separator) } : {}) }));
        }),
    ];
    return { lines: lines.map((l) => `${l.path.padEnd(rules.lineWidth)} ${l.title}`), devices: lines, volumes, openings, unknowns, interventions };
}
