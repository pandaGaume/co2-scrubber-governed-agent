/**
 * What a slot pushes to a page: `notifications/resources/updated`, the MCP
 * notification for a changed resource, relayed by the broker to every client
 * of the slot.
 *
 * A page opens one stream per slot it follows, the broker's SSE endpoint
 * (`/<slot>/sse`): the broker hands a slot's notifications to its SSE
 * sessions as they are, with no request made on them, so the stream needs no
 * MCP session of its own. The page's calls still go the usual way.
 *
 * The slots of this demo put what changed in the notification's `_meta`
 * (`spikypanda/events` on `spk://events`, `spikypanda/task` on
 * `factory://tasks`), so a page reads nothing back. A page that finds no such
 * key does what the specification says and reads the resource.
 *
 * The stream can drop (the server restarts, the laptop sleeps). The browser
 * reconnects on its own; `onState` says when it is down, so a page can look
 * now and then until it is back, and look once when it comes back, for what it
 * missed in between.
 *
 * Also bundled alone as `dashboard/agent/pushes.js`, for the control room.
 */

/** One `notifications/resources/updated`: the resource, and the `_meta` the slot joined to it. */
export interface ResourceUpdate {
    uri: string;
    meta: Record<string, unknown>;
}

export interface Watch {
    close(): void;
    /** Whether the stream is open right now. */
    readonly open: boolean;
}

/**
 * Follows the notifications of one slot.
 *
 * `onUpdate` receives every `resources/updated` the slot sends; `onState`
 * whether the stream is up (true once open, false as soon as it drops).
 */
export function watchSlot(base: string, slot: string, onUpdate: (update: ResourceUpdate) => void, onState: (open: boolean) => void = () => undefined): Watch {
    const source = new EventSource(`${base.replace(/\/+$/u, "")}/${encodeURIComponent(slot)}/sse`);
    let open = false;
    const setOpen = (value: boolean) => {
        if (value === open) return;
        open = value;
        onState(value);
    };
    source.onopen = () => setOpen(true);
    source.onerror = () => setOpen(false);
    // The broker writes every JSON-RPC message as an SSE `message` event; the first event, `endpoint`, is named and not read here.
    source.onmessage = (m: MessageEvent<string>) => {
        let frame: { method?: string; params?: { uri?: unknown; _meta?: unknown } };
        try {
            frame = JSON.parse(m.data);
        } catch {
            return;
        }
        if (frame.method !== "notifications/resources/updated" || typeof frame.params?.uri !== "string") return;
        const meta = frame.params._meta && typeof frame.params._meta === "object" ? (frame.params._meta as Record<string, unknown>) : {};
        onUpdate({ uri: frame.params.uri, meta });
    };
    return {
        close: () => {
            source.close();
            setOpen(false);
        },
        get open() {
            return open;
        },
    };
}

/**
 * The events a push on `spk://events` carries, when they follow the reader's
 * cursor without a gap; null when the reader must read the log with its cursor
 * (the slot sent no events, or some were missed while the stream was down).
 */
export function eventsAfter<E extends { seq?: number }>(update: ResourceUpdate, cursor: number): E[] | null {
    const events = update.meta["spikypanda/events"];
    if (!Array.isArray(events) || !events.length) return null;
    const first = (events[0] as E).seq;
    if (typeof first !== "number" || first > cursor + 1) return null;
    return (events as E[]).filter((e) => typeof e.seq === "number" && e.seq > cursor);
}
