/**
 * Mother's register of the base's devices (docs/mise-en-service.fr.md,
 * section 5): every device that plugs in says where it is (an ISA-95 path,
 * `/habitat/lab/eclss/scrubber-1`) and what it is (a descriptor in the
 * shape of a W3C Thing Description, reduced to what the demo reads: a
 * type, a title, its properties with their quantity and unit, the actions
 * it accepts, the links it declares). The register is the station's; the
 * factory reads it through the broker (`factory.inventory`), like
 * everything else.
 *
 * The one rule written here, with no model in it: a registered device
 * without a qualified simulator opens a commissioning. Decided on
 * 2026-09-23 for the rule's reach: it applies to a device that acts (its
 * descriptor declares actions). A sensor, a hatch or a battery is
 * described by what it publishes and needs no simulator of its own; a
 * device that takes commands does, because it is the one an agent will
 * ask "what if". Read literally the rule would open five commissionings
 * for the five lines of the scene, and Mother would announce four that
 * mean nothing.
 */

export interface PropertyDescriptor {
    quantity: string;
    unit: string;
    readOnly?: boolean;
    /** A constant the device declares (its flow at full speed), when it has one. */
    value?: number;
}

export interface DeviceDescriptor {
    "@type": string;
    title: string;
    properties: Record<string, PropertyDescriptor>;
    /** The commands it accepts; a device with none only publishes. */
    actions?: string[];
    /** What it declares about the place: `connects` for an opening between two volumes. */
    links?: Array<{ rel: string; href: string }>;
}

export interface Device {
    path: string;
    descriptor: DeviceDescriptor;
    registeredAt: string;
    /** The simulator qualified for it (a positive evaluate report), or none: then it is being commissioned. */
    simulator: { sha256: string; reportId: string } | null;
    /** The last value of each property the device reported, and when. */
    readings: Record<string, { value: number | string; at: string }>;
}

/** An ISA-95 path: a site, then at least one level. */
export const ISA95 = /^\/[a-z0-9-]+(\/[a-z0-9-]+)+$/;

/** The levels of a path: `/habitat/lab/eclss/scrubber-1` -> site habitat, area lab, the rest. */
export function levelsOf(path: string): { site: string; area: string; rest: string[] } {
    const [site = "", area = "", ...rest] = path.split("/").filter(Boolean);
    return { site, area, rest };
}

/** Does this device act, so that an agent will question a simulator of it. */
export const acts = (d: Pick<Device, "descriptor">): boolean => (d.descriptor.actions?.length ?? 0) > 0;

/** The written rule: a device that acts and has no qualified simulator is to be commissioned. */
export const needsCommissioning = (d: Pick<Device, "descriptor" | "simulator">): boolean => acts(d) && !d.simulator;

/** The problems of a descriptor as a device hands it over; empty when it can be registered. */
export function descriptorProblems(path: string, d: unknown): string[] {
    const problems: string[] = [];
    if (!ISA95.test(path)) problems.push(`path "${path}" is not an ISA-95 path such as /habitat/lab/eclss/scrubber-1`);
    const x = (d && typeof d === "object" ? d : {}) as Partial<DeviceDescriptor>;
    if (typeof x["@type"] !== "string" || !x["@type"]) problems.push("the descriptor has no @type");
    if (typeof x.title !== "string" || !x.title) problems.push("the descriptor has no title");
    if (!x.properties || typeof x.properties !== "object") problems.push("the descriptor has no properties");
    else for (const [name, p] of Object.entries(x.properties)) if (typeof p?.quantity !== "string" || typeof p?.unit !== "string") problems.push(`property "${name}" does not say its quantity and unit`);
    for (const l of x.links ?? []) if (!ISA95.test(String(l?.href))) problems.push(`link "${String(l?.rel)}" to "${String(l?.href)}" is not an ISA-95 path`);
    return problems;
}
