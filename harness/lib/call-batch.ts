/**
 * Several tool calls in one answer (2026-10-08). A model that knows it needs ten reads asks for the ten at once: Nemotron 3 Ultra
 * planned 6 to 29 calls per answer on the procedure factory, the harness ran the first and answered "not executed" to the others,
 * and the model planned them all again at the next step, 25 steps of reading in circles. A harness that can take one call can take
 * ten.
 *
 * The answer's calls are kept here, in their order, and handed to the loop one per step without asking the model again: each goes
 * through the whole loop as if the model had asked it alone (the interpreter, the schema, the guard, execution, the record, the
 * memory, the budget), so nothing of the governance is bypassed and every call keeps its own trace line. Its result is read from
 * the state at the next step and buffered. When the last one has run, the model is asked again with every result at once, each
 * under its own call id: the whenAll of the answer, one model turn for the whole batch.
 *
 * A refusal ends the batch: what the guard refused changes what the rest means, so the calls after it are not run and the model
 * decides again with the refusal and the results so far. A call no longer allowed at its step (the step's allowlist moved) ends it
 * the same way. The calls run in the answer's order, one after the other: an action on a device follows the order its author wrote,
 * and a read after a write reads what the write did.
 */
import type { JsonValue } from "@spiky-panda/harness";
import { fromApiName } from "./llm-common.js";

export interface BatchCall {
    /** The API's id of the call (what its result is sent back under). */
    id: string;
    /** The tool's API name (`library__read`). */
    name: string;
    args: JsonValue;
    /** What the model reads back for it: set when it ran, was refused, or was not run. */
    result: string | null;
}

/** A call's arguments when complete: an answer cut at the output limit leaves its last call's JSON unfinished, which does not parse. */
export function completeArgs(raw: unknown): JsonValue | null {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as JsonValue;
    if (typeof raw !== "string") return null;
    if (!raw.trim()) return {};
    try {
        const v = JSON.parse(raw) as unknown;
        return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonValue) : null;
    } catch {
        return null;
    }
}

/**
 * The calls of an answer without the repeated ones: the same tool with the same arguments twice in one answer is never meant twice
 * (a read answers the same, an action would be done twice); Nemotron repeated its whole list until the output limit. The first is kept.
 */
export function distinctCalls<T>(calls: T[], keyOf: (c: T) => [string, unknown]): T[] {
    const seen = new Set<string>();
    return calls.filter((c) => {
        const [name, args] = keyOf(c);
        const parsed = typeof args === "string" ? (completeArgs(args) ?? args) : args;
        const key = `${name}:${JSON.stringify(canonical(parsed))}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
const canonical = (v: unknown): unknown => (Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v);

export class CallBatch {
    private handed = 0;
    private readonly iteration: number | null;

    /** `calls[0]` is handed to the loop by the answer itself; the batch hands the others. */
    constructor(
        readonly calls: BatchCall[],
        features: Record<string, unknown>,
    ) {
        this.iteration = typeof features.iteration === "number" ? features.iteration : null;
    }

    /** Which call of the batch is the one handed last (1-based), and how many there are. */
    get position(): { index: number; of: number } {
        return { index: this.handed + 1, of: this.calls.length };
    }

    /**
     * At the next step: the result of the call handed last, read from the state (`lastOutcome`, `lastOutput`; `lastRefusal` when the
     * harness refused it), then the next call to hand, or null when the batch is over (every call then has its result).
     */
    advance(features: Record<string, unknown>, allowed: ReadonlySet<string>): BatchCall | null {
        const last = this.calls[this.handed]!;
        const id = fromApiName(last.name);
        const refusal = String(features.lastRefusal ?? "");
        // A step that is not the one after (the memory replayed a decision in between): what the state says is not this call's answer.
        const step = typeof features.iteration === "number" ? features.iteration : null;
        if (this.iteration !== null && step !== null && step !== this.iteration + this.handed + 1) {
            last.result ??= "not known: another decision ran in between";
            this.close("not executed: the batch was interrupted by another decision; ask again if it is still needed");
            return null;
        }
        if (refusal.startsWith(`${id}:`)) {
            last.result = `refused: ${refusal.slice(id.length + 1).trim()}`;
            this.close(`not executed: ${id}, before it in the same answer, was refused; decide again with that refusal`);
            return null;
        }
        last.result = `${String(features.lastOutcome || "unknown")}: ${String(features.lastOutput || "no output")}`;
        const next = this.calls[this.handed + 1];
        if (!next) return null;
        if (!allowed.has(fromApiName(next.name))) {
            this.close(`not executed: ${fromApiName(next.name)} is not allowed at this step`);
            return null;
        }
        this.handed++;
        return next;
    }

    /** Every call's result, under its id, for the model's next turn. */
    results(): Array<{ id: string; content: string }> {
        return this.calls.map((c) => ({ id: c.id, content: c.result ?? "not executed" }));
    }

    /**
     * Every call with its result, as text, for the state mode: nothing is replayed there, the state alone carries the last call's
     * answer, so the batch's results are said with the next observation (2026-10-08, Ultra in state mode: without them it read the
     * same documents again at every turn). Each result up to `each` characters.
     */
    summary(each = 1500): string {
        return [
            `The results of the ${this.calls.length} calls of your last answer, in order:`,
            ...this.calls.map((c, i) => `${i + 1}. ${fromApiName(c.name)} ${JSON.stringify(c.args)}: ${(c.result ?? "not executed").slice(0, each)}`),
        ].join("\n");
    }

    private close(reason: string): void {
        for (let i = this.handed + 1; i < this.calls.length; i++) this.calls[i]!.result ??= reason;
    }
}
