/**
 * The physics slot's units and laws, plugged into the harnesses of this
 * process (2026-09-28, zero domain in the harness): the harness declares what
 * it asks (`harness/core/physics.ts`), this slot answers, in process, with
 * the same code its tools answer with over the broker (`units_*`).
 */
import { usePhysics, type PhysicsPort } from "../../harness/core/physics.js";
import { canonicalQuantity, checkAgainstDocument, compatibleUnits, convertValue, resolveUnitRef } from "./units.js";
import { defaultedParameters, relationBetween } from "./relations.js";

export const PHYSICS: PhysicsPort = { canonicalQuantity, resolveUnitRef, convertValue, compatibleUnits, checkAgainstDocument, relationBetween, defaultedParameters };

/** Plugs the slot's physics into the harness; loading the slot does it. */
export function installPhysics(): void {
    usePhysics(PHYSICS);
}

installPhysics();
