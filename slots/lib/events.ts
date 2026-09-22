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
import { EventLog } from "@spiky-panda/mcp/runtime";

/** Kept small on purpose: a reader polls every two seconds and a log is not a
    store. A reader that falls behind sees `dropped` grow and can say so. */
export const runtimeEvents = new EventLog(200);

/** One line of something, for a human, never a payload and never a prompt. */
export function oneLine(value: unknown, max = 160): string {
    const text = typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value);
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
