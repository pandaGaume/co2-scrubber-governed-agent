/**
 * The one event log of this process.
 *
 * `run-all` publishes every slot from a single Node process, so there is one
 * log and every slot appends to it. The runtime's surface on the `twin` slot
 * publishes it as `spk://events` and `spk://events{?since}` (see
 * `docs/runtime-events.md`); a reader gets one ordered stream instead of one
 * sequence per mount point, which is what makes a cursor meaningful.
 *
 * It exists because a resource is a snapshot and some facts are only
 * expressible as events. The control room has to show **when the model was
 * asked**, and it cannot: the call is the station harness's, not the page's,
 * and a call made by one client of the broker is invisible to another. The
 * broker keeps no trace, and a slot hands its result to the one caller that
 * asked. So the reasoner slot says what it did here, and whoever cares reads
 * it.
 *
 * Nothing is added to the protocol to carry this: an event log is a document,
 * a document behind a URI is a resource, and a cursor is a query parameter of
 * an RFC 6570 template that `McpResourceTemplate` already defines.
 */
import { EventLog, type RuntimeEvent } from "@spiky-panda/mcp/runtime";
import type { PublishedSlot } from "./slot-server.js";

/** The log, and whoever wants to know when it grows: the slot that publishes it tells its readers. */
class AnnouncedEventLog extends EventLog {
    private readonly listeners = new Set<(event: RuntimeEvent) => void>();

    override append(kind: string, fields?: Record<string, unknown>): RuntimeEvent {
        const event = super.append(kind, fields);
        for (const listener of this.listeners) listener(event);
        return event;
    }

    onAppend(listener: (event: RuntimeEvent) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

/** Kept small on purpose: a log is not a store. A reader that falls behind
    sees `dropped` grow and can say so. */
export const runtimeEvents = new AnnouncedEventLog(200);

/** The URI the log is read at, and the `_meta` keys its notification carries. */
export const EVENTS_URI = "spk://events";
export const META_EVENTS = "spikypanda/events";
export const META_SEQ = "spikypanda/seq";

/**
 * Pushes the log to the readers of `slot`: `notifications/resources/updated`
 * on `spk://events`, the MCP notification for "this resource changed", with
 * the new events in its `_meta` so a reader that knows the key has nothing to
 * read back. A reader that does not know it does what the specification says
 * and reads the resource, with its cursor. Events appended in the same turn of
 * the loop go out as one notification.
 *
 * `spikypanda/seq` is the last event's; a reader whose cursor is not right
 * before the first event carried missed a notification (a stream that dropped
 * and came back) and reads `spk://events?since=<cursor>` to fill the gap.
 */
export function pushEvents(slot: Pick<PublishedSlot<object>, "notify">): () => void {
    let pending: RuntimeEvent[] = [];
    return runtimeEvents.onAppend((event) => {
        if (!pending.length) {
            setImmediate(() => {
                const events = pending;
                pending = [];
                slot.notify("notifications/resources/updated", { uri: EVENTS_URI, _meta: { [META_EVENTS]: events, [META_SEQ]: events.at(-1)?.seq ?? runtimeEvents.seq } });
            });
        }
        pending.push(event);
    });
}

/** One line of something, for a human, never a payload and never a prompt. */
export function oneLine(value: unknown, max = 160): string {
    const text = typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value);
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
