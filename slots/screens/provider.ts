/**
 * The `screens` slot: the displays of the room, and what each one shows.
 *
 * A demo in a room has several machines on the same network, PCs and Macs,
 * each meant to show one page: the control room on one, the agent's loop on
 * another, the twin's graph on a third. Typing an address on each of them is
 * the thing to avoid on a filming day. So each machine opens one page, once,
 * `screen.html` (or is opened on it by `scripts/screen.mjs`, which finds this
 * server on the network by itself), and that page registers here: it gets a
 * code, `A`, `B`, `C`, shown large on it, and a name, the machine's. From the
 * control room, a page of a slot is sent to a screen by its code, and the
 * screen shows it.
 *
 * The screen learns what to show by being told: every change is pushed to the
 * slot's readers (`notifications/resources/updated` on `screens://list`, the
 * whole list in `_meta` under `spikypanda/screens`), which is how the control
 * room's pages already follow the twin and the factory. A screen says it is
 * still there by registering again every twenty seconds; one not heard from
 * in a minute is listed offline, and comes back with its code when it
 * registers again. The list lives in this process: after a restart the
 * screens register again, and get their codes back in the order they do.
 *
 * Kept out of the agent's catalogue (`tier3/lib/capabilities.ts`): what the
 * room's screens show is the operator's business, not a cabin capability.
 */
import { objectSchema as obj, publishSlot, type PublishedSlot } from "../lib/slot-server.js";

export const SCREENS_URI = "screens://list";
export const META_SCREENS = "spikypanda/screens";
/** A screen not heard from for this long is listed offline. */
const OFFLINE_AFTER_MS = 60_000;

export interface Screen {
    screenId: string;
    /** `A`, `B`... shown large on the screen: what the operator picks it by. */
    code: string;
    name: string;
    /** The page shown, a path under the dashboard; null for the screen's own code. */
    page: string | null;
    registeredAt: string;
    seenAt: string;
    online: boolean;
}
export interface ScreensState {
    screens: Screen[];
}

/** A path under the dashboard, with nothing that could climb out of it (the qr slot's rule). */
function safePage(value: unknown): string | null {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    if (/^[a-z][a-z0-9+.-]*:/iu.test(raw)) throw new Error("a page of this dashboard, not a full address");
    const path = raw.replace(/^\/+/u, "");
    if (path.includes("..")) throw new Error(`"${raw}" climbs out of the dashboard`);
    return path;
}

/** A, B, ... Z, AA, AB...: the first code no screen holds. */
function nextCode(taken: ReadonlySet<string>): string {
    for (let n = 0; ; n++) {
        let code = "";
        for (let k = n; k >= 0; k = Math.floor(k / 26) - 1) code = String.fromCharCode(65 + (k % 26)) + code;
        if (!taken.has(code)) return code;
    }
}

export function screensSlot(wsBase: string, log: (line: string) => void): PublishedSlot<ScreensState> {
    const state: ScreensState = { screens: [] };
    const find = (id: unknown): Screen => {
        const s = state.screens.find((x) => x.screenId === id);
        if (!s) throw new Error(`no screen ${String(id)}: it registers itself when screen.html opens`);
        return s;
    };
    const refresh = (): boolean => {
        let changed = false;
        const now = Date.now();
        for (const s of state.screens) {
            const online = now - Date.parse(s.seenAt) < OFFLINE_AFTER_MS;
            if (online !== s.online) {
                s.online = online;
                changed = true;
            }
        }
        return changed;
    };
    // Set once the slot is built (below).
    let announce: () => void = () => undefined;

    const published = publishSlot<ScreensState>({
        slot: "screens",
        description: "The displays of the room, and the page each one shows",
        instructions: {
            en: "The room's screens. A screen registers itself when screen.html opens on it and shows its code; `show` sends a page of the dashboard to a screen by its id. The list is pushed to readers of screens://list as it changes.",
            fr: "Les écrans de la salle. Un écran s'enregistre quand screen.html s'ouvre dessus et affiche son code ; `show` envoie une page du tableau de bord à un écran par son identifiant. La liste est poussée aux lecteurs de screens://list à chaque changement.",
        },
        stub: false,
        version: "0.1.0",
        wsBase,
        log,
        state,
        tools: [
            {
                name: "register",
                title: "A screen says it is here",
                description: "Called by screen.html when it opens and every twenty seconds after: registers the screen (a new one gets the next free code) or says it is still there. Returns the screen, with the page it should show.",
                inputSchema: obj({ screenId: { type: "string", description: "the id the screen keeps across reloads" }, name: { type: "string", description: "what to call it, the machine's name by default" } }, ["screenId"]),
                handle: (args) => {
                    const screenId = String(args.screenId ?? "").trim().slice(0, 64);
                    if (!screenId) throw new Error("a screen needs an id");
                    const now = new Date().toISOString();
                    let s = state.screens.find((x) => x.screenId === screenId);
                    const name = typeof args.name === "string" && args.name.trim() ? args.name.trim().slice(0, 40) : null;
                    if (!s) {
                        s = { screenId, code: nextCode(new Set(state.screens.map((x) => x.code))), name: name ?? "screen", page: null, registeredAt: now, seenAt: now, online: true };
                        state.screens.push(s);
                        log(`[screens] ${s.code} registered: ${s.name}`);
                        announce();
                        return s;
                    }
                    const renamed = name !== null && name !== s.name;
                    if (renamed) s.name = name;
                    s.seenAt = now;
                    if (refresh() || renamed) announce();
                    return s;
                },
            },
            {
                name: "show",
                title: "Send a page to a screen",
                description: "The screen shows this page of the dashboard (a path such as factory.html or studio/node-editor-v2/index.html?ext=/agent/twin.js); an empty page brings back its code.",
                inputSchema: obj({ screenId: { type: "string" }, page: { type: "string", description: "a page of the dashboard; empty for the screen's code" } }, ["screenId"]),
                handle: (args) => {
                    const s = find(args.screenId);
                    s.page = safePage(args.page);
                    log(`[screens] ${s.code} (${s.name}) shows ${s.page ?? "its code"}`);
                    announce();
                    return s;
                },
            },
            {
                name: "rename",
                title: "Name a screen",
                inputSchema: obj({ screenId: { type: "string" }, name: { type: "string" } }, ["screenId", "name"]),
                description: "What the operator calls a screen: the wall, the desk, the stand.",
                handle: (args) => {
                    const s = find(args.screenId);
                    s.name = String(args.name ?? "").trim().slice(0, 40) || s.name;
                    announce();
                    return s;
                },
            },
            {
                name: "forget",
                title: "Forget a screen",
                description: "Removes a screen from the list, its code freed; it comes back with a new code if it registers again.",
                inputSchema: obj({ screenId: { type: "string" } }, ["screenId"]),
                handle: (args) => {
                    const s = find(args.screenId);
                    state.screens = state.screens.filter((x) => x !== s);
                    announce();
                    return { forgotten: s.screenId, code: s.code };
                },
            },
        ],
        resources: [
            {
                uri: SCREENS_URI,
                name: "Screens",
                description: "The room's screens: code, name, the page each shows, whether it was heard from in the last minute",
                read: () => {
                    refresh();
                    return state.screens;
                },
            },
        ],
    });
    announce = () => published.notify("notifications/resources/updated", { uri: SCREENS_URI, _meta: { [META_SCREENS]: state.screens } });
    // A screen that stops registering goes offline without calling anything: looked at every fifteen seconds.
    const watch = setInterval(() => {
        if (refresh()) announce();
    }, 15_000);
    watch.unref();
    return published;
}
