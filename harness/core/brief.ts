/**
 * What every factory's brief says the same way (2026-09-28, the socle's fifth
 * point): the rules a builder follows at every step are said once, in the
 * socle's prompt (`kernel.md, policy.md`); the brief says where this task stands, and
 * these sentences, which every topic writes alike, are written here once.
 */
import type { Progress } from "./workspace-observer.js";

/** The last refusal of a capability, when there is one: its reasons, and where what was sent is. */
export function refusedNote(progress: Progress, capabilityId: string): string {
    const r = progress.refusals[capabilityId];
    return r ? ` Your last ${capabilityId} was refused: ${r.reason}. What you sent is in the state (lastRefusal); change what the reasons name.` : "";
}

/** The rules the socle's prompt says once, by a phrase each: a topic's own prompt does not say them again (`tests/conformance.test.ts`). */
export const SOCLE_RULES: ReadonlyArray<string> = ["Each call is judged and run on its own", "Answer with tool calls, not with text.", "end with `task.fail` and the reason", "Every number you set is accounted for"];
