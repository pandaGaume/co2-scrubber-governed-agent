/**
 * Roles (2026-09-29): who may decide what, read from `specs/station/roles.json`
 * (STATION_ROLES_FILE when set: the tests hold their own). A question the
 * station asks may be addressed to a role; the answer of a person the role
 * does not name is refused, and so is a signature by someone who is not an
 * authorised signatory. A role with no holder is held by nobody: what it
 * decides waits.
 */
import { existsSync, readFileSync } from "node:fs";
import { fromRoot } from "./paths.js";

export const ROLES_FILE = "specs/station/roles.json";
/** The role a signature of the library is asked of. */
export const SIGNATORY = "authorised-signatory";

export interface Role {
    does: string;
    holders: string[];
}

const file = (): string => process.env.STATION_ROLES_FILE || fromRoot(...ROLES_FILE.split("/"));

/** The roles as the file says them now: a holder changed is read at the next decision. */
export function loadRoles(): Record<string, Role> {
    const f = file();
    if (!existsSync(f)) return {};
    const parsed = JSON.parse(readFileSync(f, "utf8")) as { roles?: Record<string, Partial<Role>> };
    return Object.fromEntries(Object.entries(parsed.roles ?? {}).map(([id, r]) => [id, { does: String(r.does ?? ""), holders: Array.isArray(r.holders) ? r.holders.map(String) : [] }]));
}

export function roleOf(id: string): Role | null {
    return loadRoles()[id] ?? null;
}

/** Why a person may not act for a role, or null when the role names them (names compared without case or outer spaces). */
export function notHolder(role: string, who: string): string | null {
    const r = roleOf(role);
    if (!r) return `no role "${role}" in ${ROLES_FILE}`;
    const name = who.trim().toLowerCase();
    if (!name) return `the role ${role} is held by a person who says who they are`;
    if (r.holders.some((h) => h.trim().toLowerCase() === name)) return null;
    return `"${who}" does not hold the role ${role} (${ROLES_FILE}: ${r.holders.length ? r.holders.join(", ") : "nobody holds it yet"})`;
}
