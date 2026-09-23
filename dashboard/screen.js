/**
 * A screen of the room (`screen.html`).
 *
 * It keeps an id of its own in the browser, so a reload is the same screen,
 * and registers with the `screens` slot under it: when it opens, every twenty
 * seconds after (that is how the slot knows it is still there), and whenever
 * its push stream comes back. The slot answers with its code and the page it
 * should show.
 *
 * What to show arrives by push: the slot sends `resources/updated` on
 * `screens://list` with the whole list in `_meta` (`agent/pushes.js`), and the
 * screen finds itself in it. A page is shown in a frame over the whole window,
 * so this page stays and hears the next one; no page brings its code back.
 * Missing from the list means the slot forgot it or restarted: it registers
 * again and gets a code.
 *
 * `?name=` names the screen (`scripts/screen.mjs` passes the machine's name);
 * clicking the name renames it.
 */
import { connectMcp, toolText } from "./vendor/mcp-http-client.js";
import { watchSlot } from "./agent/pushes.js";

const $ = (id) => document.getElementById(id);
const base = `${location.protocol}//${location.host}`;
const params = new URLSearchParams(location.search);
const LIST_URI = "screens://list";
const META_SCREENS = "spikypanda/screens";
const HEARTBEAT_MS = 20_000;

/** The browser's storage, where it has one: a private window may refuse it, and the screen then lives for this visit only. */
const store = {
    get(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch {
            // this visit only
        }
    },
};
const screenId = store.get("spk.screen.id") ?? (crypto.randomUUID?.() ?? `screen-${Math.random().toString(36).slice(2, 12)}`);
store.set("spk.screen.id", screenId);
let name = params.get("name") ?? store.get("spk.screen.name") ?? "screen";
store.set("spk.screen.name", name);

let sessionPromise = null;
const session = () =>
    (sessionPromise ??= connectMcp(base, "screens", { headers: {}, clientInfo: { name: "screen", version: "0" } }).catch((e) => {
        sessionPromise = null;
        throw e;
    }));
async function call(tool, args) {
    const s = await session();
    const r = await s.callTool(tool, args);
    const text = toolText(r);
    const payload = JSON.parse(text);
    if (r?.isError) throw new Error(String(payload?.refused ?? text));
    return payload && "result" in payload ? payload.result : payload;
}

const setStatus = (text, warn = false) => {
    $("status").textContent = text;
    $("status").classList.toggle("warn", warn);
};

let shown = null;
/** The screen as the slot has it: its code and name on the idle view, its page in the frame. */
function apply(screen) {
    $("code").textContent = screen.code;
    $("name").textContent = screen.name;
    $("tag").textContent = `${screen.code} · ${screen.name}`;
    document.title = `screen ${screen.code}, ${screen.name}`;
    if (screen.page === shown) return;
    shown = screen.page;
    const frame = $("frame");
    if (shown) {
        frame.src = `${base}/${shown}`;
        frame.hidden = false;
        $("tag").hidden = false;
        $("idle").hidden = true;
    } else {
        frame.src = "about:blank";
        frame.hidden = true;
        $("tag").hidden = true;
        $("idle").hidden = false;
        setStatus(`waiting for a page from the control room (${base.replace(/^https?:\/\//u, "")})`);
    }
}

let registering = null;
async function register() {
    if (registering) return registering;
    registering = (async () => {
        try {
            apply(await call("register", { screenId, name }));
            if (!shown) setStatus(`waiting for a page from the control room (${base.replace(/^https?:\/\//u, "")})`);
        } catch (e) {
            setStatus(`the demo does not answer (${e.message}); trying again`, true);
        } finally {
            registering = null;
        }
    })();
    return registering;
}

$("name").addEventListener("click", () => {
    const next = prompt("What should this screen be called?", name);
    if (!next || !next.trim()) return;
    name = next.trim().slice(0, 40);
    store.set("spk.screen.name", name);
    void register();
});

await register();
watchSlot(
    base,
    "screens",
    (update) => {
        if (update.uri !== LIST_URI) return;
        const list = update.meta[META_SCREENS];
        const me = Array.isArray(list) ? list.find((s) => s.screenId === screenId) : null;
        if (me) apply(me);
        else void register();
    },
    (open) => {
        if (open) void register();
        else if (!shown) setStatus("the link to the demo dropped; it comes back by itself", true);
    },
);
setInterval(() => void register(), HEARTBEAT_MS);
