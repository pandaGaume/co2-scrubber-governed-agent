/**
 * What the harness asks of physics, and nothing of its content (2026-09-28,
 * zero domain in the harness): the units (a quantity's canonical name, a unit
 * resolved, a value converted, two units compared, a constant against what a
 * document states) and the relations between quantities (which relation ties
 * two, which of its parameters the physics slot defaults). The units, the
 * laws and their constants are the physics slot's (`slots/physics/`): it
 * plugs itself in here (`usePhysics`) when it is loaded, and every harness
 * of the process asks through `physics()`. A harness that runs with no
 * physics slot says so at the first question, instead of guessing a unit.
 */

export interface UnitRef {
    unit: string;
    quantity?: string;
}

type Refusal = { ok: false; code: string; reason: string };

export interface PhysicsPort {
    /** The quantity's name as the unit system knows it, or null when it does not. */
    canonicalQuantity(name: string): string | null;
    resolveUnitRef(ref: UnitRef): { ok: true; unit: unknown } | Refusal;
    convertValue(value: number, from: UnitRef, to: UnitRef): { ok: true; value: number } | Refusal;
    compatibleUnits(a: UnitRef, b: UnitRef): { ok: true; compatible: boolean; reason?: string } | Refusal;
    /** A constant against what a document's text states, converted by the unit system. */
    checkAgainstDocument(constant: UnitRef & { value: number }, documentText: string): { verdict: "OK" | "INVALID_CONVERSION" | "NOT_STATED" | "UNKNOWN_UNIT"; reason: string };
    /** The relation that ties two quantities, either way, with its parameters; null when none does. */
    relationBetween(from: string, to: string): { relation: { id: string; parameters: Record<string, { description: string; unit: string }> }; direction: "forward" | "inverse" } | null;
    /** The parameters of the relations a caller may leave out: the physics slot defaults them from the library's facts. */
    defaultedParameters(): string[];
}

let port: PhysicsPort | null = null;

/** The physics slot plugs its units and laws in; the last one plugged answers. */
export function usePhysics(physics: PhysicsPort): void {
    port = physics;
}

/** The physics of this process, as the physics slot plugged it in. */
export function physics(): PhysicsPort {
    if (!port) throw new Error("no physics: the units and the laws are the physics slot's (slots/physics), and none is loaded in this process");
    return port;
}
