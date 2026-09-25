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
 *
 * Since 2026-09-25 a property can say it is commandable: the action of the
 * device that sets it (`speed` through `set_speed`), and the range the
 * device accepts. It is the register's answer to "what can be acted upon
 * in the physical world", the notion that makes an agent of this station
 * embodied: it may, through whoever authorises, change the state of a
 * thing and not only read it. What it does not say is who may command:
 * that stays with the commander and the policy. A hatch's state is not
 * commandable (a person moves it; it is operated), a sensor's reading is
 * only published. The harness reads the commandable properties as the
 * interventions it can propose (an experiment that discriminates two
 * hypotheses is chosen among them), never as a licence to act.
 */

/** How a property is commanded: the action of the device that sets it, and the range it accepts when the device says one (states for a discrete one). */
export interface Command {
    action: string;
    min?: number;
    max?: number;
    states?: string[];
}

export interface PropertyDescriptor {
    quantity: string;
    unit: string;
    readOnly?: boolean;
    /** The action of this device that sets it: the property can be acted upon. Absent, the property is only published. */
    commandable?: Command;
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

/** What a device lets one command: each commandable property with the action that sets it, its quantity, its unit and its range. Empty for a device that only publishes. */
export function commandsOf(d: Pick<Device, "descriptor">): Array<{ property: string; action: string; quantity: string; unit: string; min?: number; max?: number; states?: string[] }> {
    return Object.entries(d.descriptor.properties)
        .filter(([, p]) => p.commandable)
        .map(([property, p]) => ({ property, action: p.commandable!.action, quantity: p.quantity, unit: p.unit, ...(typeof p.commandable!.min === "number" ? { min: p.commandable!.min } : {}), ...(typeof p.commandable!.max === "number" ? { max: p.commandable!.max } : {}), ...(p.commandable!.states ? { states: p.commandable!.states } : {}) }));
}

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
    else {
        for (const [name, p] of Object.entries(x.properties)) {
            if (typeof p?.quantity !== "string" || typeof p?.unit !== "string") problems.push(`property "${name}" does not say its quantity and unit`);
            const c = p?.commandable;
            if (c === undefined) continue;
            // A commandable property is set by an action the device declares, and is not read-only: the register says what can be acted upon, consistently.
            if (typeof c !== "object" || c === null || typeof c.action !== "string" || !c.action) problems.push(`property "${name}" is commandable but names no action that sets it`);
            else if (!(x.actions ?? []).includes(c.action)) problems.push(`property "${name}" is commandable through "${c.action}", which is not among the actions the device declares (${(x.actions ?? []).join(", ") || "none"})`);
            if (p?.readOnly) problems.push(`property "${name}" is commandable and read-only at once`);
            if (typeof c === "object" && c !== null && typeof c.min === "number" && typeof c.max === "number" && c.min > c.max) problems.push(`property "${name}" is commandable in a range whose min ${c.min} is above its max ${c.max}`);
        }
    }
    for (const l of x.links ?? []) if (!ISA95.test(String(l?.href))) problems.push(`link "${String(l?.rel)}" to "${String(l?.href)}" is not an ISA-95 path`);
    return problems;
}
