/**
 * The control room, talking to the broker as any MCP client does, over
 * Streamable HTTP, with the client the broker's own samples ship
 * (vendor/mcp-http-client.js).
 *
 * The design is DESIGN_BRIEF.md and the frame is panel.html. The machine in
 * the middle is drawn by room-model.js, which is handed a reading and knows
 * nothing about MCP; this file owns the broker and hands it that reading.
 *
 * What is on screen comes from five places and nowhere else:
 *   - the badges: `config.json` (the active profile) and the broker itself;
 *   - the slots and their tools: `_broker.providers_list`, then `tools/list`;
 *   - the cabin: `scrubber.motor.state`, every 2 s. The page keeps the
 *     readings it took, which is what the curve draws;
 *   - the trace: every call this page makes, with its outcome. Three outcomes
 *     exist in the architecture: the policy denies, the device refuses, or it
 *     completes. A stub slot can only refuse or complete; the policy deny
 *     appears when the broker's authorization is enabled;
 *   - MOTHER: the `speech` slot's queue, in the `station` slot's own phrases.
 *     This page chooses when something is said. It never chooses the words.
 *
 * The page shows nothing it has not read. Where a figure is missing it is
 * drawn as missing, never filled with a plausible number: a jury that catches
 * one invented figure stops believing the rest.
 */
import { connectMcp, toolText } from "./vendor/mcp-http-client.js";
import { loadWords, NO_WORDS } from "./agent/factory-voice.js";
import { createScene, HUE } from "./room-model.js";

/* This module serves two pages: the control room after the boot
   (`index.html`), where `board.js` owns the loop, the events and the
   station's voice, and the operator's tool page (`panel.html`). Every region
   below is therefore optional: it is drawn when the page carries its element
   and skipped when it does not. Nothing is assumed present. */
const $ = (id) => document.getElementById(id);
const has = (id) => document.getElementById(id) !== null;
/** Sets an element's text when the page has it. */
const put = (id, text) => {
    const el = $(id);
    if (el) el.textContent = text;
};
const base = `${location.protocol}//${location.host}`;
const nf = new Intl.NumberFormat("en-US");

/** Where each slot sits in the architecture; shown on its card. */
const TIER = { scrubber: "Tier 1", twin: "Tier 0", station: "Tier 2", factory: "offline", speech: "the voice", reasoner: "the model" };

/** Full scales, and the two marks the firmware and the monitor carry. The
    residual threshold is the monitor's contract (specs/scrubber-health-twin.json);
    the flow floor is compiled into the firmware (slots/scrubber/provider.ts). */
const SCALE = { current: 0.5, residual: 0.1 };
const RESIDUAL_ALARM = 0.04;
const MIN_FLOW = 40;

const POLL_MS = 2000;
/** Four minutes of readings at one every two seconds. */
const HISTORY = 120;

/** One MCP session per slot, opened on demand and kept. */
const sessions = new Map();
async function session(slot) {
    if (!sessions.has(slot)) sessions.set(slot, connectMcp(base, slot, { headers: {} }));
    return sessions.get(slot);
}

// ── Badges ────────────────────────────────────────────────────────────────

async function loadProfileBadge() {
    try {
        const cfg = await (await fetch("./config.json", { cache: "no-store" })).json();
        put("badge-tier3", `tier3: ${cfg.tier3.model} via ${cfg.tier3.host}`);
        put("badge-gateway", `gateway: ${cfg.gateway}`);
    } catch {
        put("badge-tier3", "tier3: (no config.json)");
        put("badge-gateway", "gateway: unknown");
    }
}

// ── Trace ─────────────────────────────────────────────────────────────────

function classify(result, error) {
    if (error) {
        const code = error.rpc?.code;
        // -32001: the broker's authorization refused (policy). Anything else from the transport is an error.
        if (code === -32001 || /forbidden|not allowed|unauthori[sz]ed/i.test(error.message)) return "deny";
        return "error";
    }
    if (result?.isError) return "refused";
    return "ok";
}

const LABEL = { ok: "completed", refused: "device refused", deny: "policy deny", error: "error" };

function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

/* A slot answers with a payload, not with prose. A completed call comes back
   as `{ slot, tool, result, stub, at }` and a refusal as
   `{ slot, tool, refused: "MIN-FLOW: ...", stub: true }`. Printing the payload
   on the trace line makes the one thing the audience has to read in two
   seconds unreadable, so the line carries the sentence and the payload's own
   bookkeeping keys are dropped. `stub` is not dropped: whether a slot has a
   body behind it is exactly the kind of thing this page must not hide. */
const NOISE = new Set(["slot", "tool", "at", "stub", "arguments", "ok"]);

function resultLine(outcome, text) {
    const raw = String(text ?? "");
    let payload = null;
    try {
        payload = JSON.parse(raw);
    } catch {
        return { line: raw, stub: false };   // already a sentence
    }
    if (!payload || typeof payload !== "object") return { line: raw, stub: false };
    const stub = payload.stub === true;

    if (outcome !== "ok") {
        const m = payload.refused ?? payload.error ?? payload.message ?? payload.reason ?? payload.detail;
        return { line: typeof m === "string" && m ? m : raw, stub };
    }

    const body = payload.result ?? payload;
    if (typeof body === "string") return { line: body, stub };
    if (body && typeof body === "object") {
        const pairs = summarise(body);
        if (pairs.length) return { line: pairs.join("  ·  "), stub };
    }
    return { line: raw, stub };
}

/** What a thing calls itself, when one of its fields is a name. */
const labelOf = (x) => (typeof x === "string" ? x : x && typeof x === "object" ? x.module ?? x.name ?? x.callsign ?? x.id ?? null : null);

/**
 * One line out of a result object.
 *
 * Scalars are printed as they are. An array is printed by what its entries
 * call themselves when they all have a name and there are few of them, and by
 * how many there are otherwise: `modules hab-b, lab` says more than
 * `modules 2`, and both say more than the array. A nested object is left out
 * rather than flattened into something that reads like a fact it is not.
 *
 * This is the audit line, so it is never phrased by a model. A trace a jury
 * cannot check against the device is not a trace.
 */
function summarise(body) {
    const out = [];
    for (const [k, v] of Object.entries(body)) {
        if (NOISE.has(k) || v === null || v === undefined) continue;
        if (Array.isArray(v)) {
            const labels = v.map(labelOf);
            out.push(labels.length && labels.length <= 4 && labels.every(Boolean) ? `${k} ${labels.join(", ")}` : `${k} ${v.length}`);
        } else if (typeof v === "object") {
            const label = labelOf(v);
            if (label) out.push(`${k} ${label}`);
        } else {
            out.push(`${k} ${typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(4)) : v}`);
        }
        if (out.length >= 8) break;
    }
    return out;
}

/**
 * The slot's light, flared once for a call that really happened.
 *
 * `board.js` renders the LEDs and polls them for liveness; this only marks
 * traffic on one of them, in the colour of what came back. A slot with no row
 * on this page is simply not marked, which is the case on the operator's page.
 */
function pulseSlot(slot, outcome) {
    const row = document.querySelector(`#slot-list li[data-slot="${CSS.escape(String(slot))}"]`);
    if (!row) return;
    const mark = outcome === "deny" ? "deny" : outcome === "refused" ? "refused" : "busy";
    row.classList.remove("busy", "refused", "deny");
    void row.offsetWidth;   // let the animation restart on a call that follows another
    row.classList.add(mark);
    setTimeout(() => row.classList.remove(mark), 1150);
}

/* The speech slot's traffic is neither this page's nor the agent's: the voice
   is queued by whoever speaks and played by whichever board holds the floor,
   so nothing of it passes here. Its queue's sequence number does, and it only
   grows when something was really said. */
let lastSaidSeq = null;
async function refreshSpeechPulse() {
    if (!has("slot-list")) return;
    try {
        const s2 = await session("speech");
        const r = await s2.request("resources/read", { uri: "speech://queue" });
        const q = JSON.parse(r?.contents?.[0]?.text ?? "{}");
        if (typeof q.seq !== "number") return;
        if (lastSaidSeq !== null && q.seq > lastSaidSeq) pulseSlot("speech", "ok");
        lastSaidSeq = q.seq;
    } catch {
        // the voice is down; the LED says so through board.js's own polling
    }
}

function trace({ caller, slot, tool, args, outcome, text }) {
    pulseSlot(slot, outcome);
    const li = document.createElement("li");
    li.className = `entry ${outcome}`;
    li.dataset.outcome = outcome;
    const when = new Date().toLocaleTimeString([], { hour12: false });
    const argText = Object.keys(args ?? {}).length ? ` <span class="args">${escapeHtml(JSON.stringify(args))}</span>` : "";
    const { line, stub } = resultLine(outcome, text);
    li.innerHTML =
        `<div class="entry-head"><span class="when">${when}</span><span class="who ${caller}">${caller}</span><span class="spacer"></span><span class="outcome ${outcome}">${LABEL[outcome]}</span></div>` +
        `<div class="call">${slot}.${tool}${argText}</div>` +
        `<p class="result">${escapeHtml(line)}${stub ? ` <span class="stub">stub</span>` : ""}</p>`;
    const list = $("trace-list");
    if (!list) return;
    list.querySelector(".trace-empty")?.remove();
    list.prepend(li);
    while (list.children.length > 60) list.lastChild.remove();
    retally();
}

/** The four figures over the trace are counted off the list itself, so they
    can never drift from what is under them. */
function retally() {
    if (!has("trace-list") || !has("tally")) return;
    const entries = [...$("trace-list").children].filter((e) => e.dataset.outcome);
    const n = (o) => entries.filter((e) => e.dataset.outcome === o).length;
    $("tally").innerHTML =
        `<div><div class="n">${entries.length}</div><div class="k">Calls</div></div>` +
        `<div class="ok"><div class="n">${n("ok")}</div><div class="k">Completed</div></div>` +
        `<div class="refused"><div class="n">${n("refused")}</div><div class="k">Refused</div></div>` +
        `<div class="deny"><div class="n">${n("deny")}</div><div class="k">Denied</div></div>`;
}

/** Calls a tool as this page's subject, records the outcome, and lets the
    station say the ones that matter. Returns the parsed payload, or null. */
async function call(slot, tool, args = {}, caller = "operator") {
    try {
        const s = await session(slot);
        const result = await s.callTool(tool, args);
        const text = toolText(result);
        const outcome = classify(result, null);
        trace({ caller, slot, tool, args, outcome, text });
        announce(outcome, tool, args, text);
        try {
            return JSON.parse(text);
        } catch {
            return { text };
        }
    } catch (error) {
        const outcome = classify(null, error);
        trace({ caller, slot, tool, args, outcome, text: error.message });
        announce(outcome, tool, args, error.message);
        return null;
    }
}

// ── Slots ─────────────────────────────────────────────────────────────────

async function loadSlots() {
    const broker = await session("_broker");
    const brokerBadge = $("badge-broker");
    if (brokerBadge) brokerBadge.innerHTML = `<i class="dot"></i>broker: ${broker.serverInfo?.name ?? "up"} ${broker.serverInfo?.version ?? ""}`;
    const listed = await broker.callTool("providers_list", {});
    let providers = [];
    try {
        providers = JSON.parse(toolText(listed));
    } catch {
        providers = [];
    }
    const names = (Array.isArray(providers) ? providers : providers.providers ?? [])
        .map((p) => (typeof p === "string" ? p : p.name))
        .filter((n) => n && !n.startsWith("_"));

    const container = $("tool-list");
    if (!container) return;   // the control room shows the slots as board.js polls them
    container.innerHTML = "";

    for (const name of names) {
        const card = document.createElement("div");
        card.className = "slot-card";
        card.innerHTML =
            `<div class="slot-head"><i class="led"></i><span class="name">${name}</span><span class="tier">${TIER[name] ?? ""}</span></div>` +
            `<div class="slot-tools"><span class="unreachable">connecting...</span></div>`;
        container.appendChild(card);
        try {
            const s = await session(name);
            const { tools = [] } = await s.listTools();
            const div = card.querySelector(".slot-tools");
            div.innerHTML = "";
            card.querySelector(".led").classList.add("on");
            card.querySelector(".name").title = s.serverInfo?.description ?? "";
            // The slot's own tools first; the six `grammar_*` tools mcp-core puts on
            // every slot (the operator's wording editor) sit behind one small button,
            // out of the story's way.
            const own = tools.filter((t) => !t.name.startsWith("grammar_"));
            const grammar = tools.filter((t) => t.name.startsWith("grammar_"));
            for (const t of own) div.appendChild(toolButton(name, t));
            if (grammar.length) {
                const more = document.createElement("button");
                more.className = "btn btn-dim";
                more.textContent = `wording (${grammar.length})`;
                more.title = "mcp-core grammar tools: read or rewrite how this slot describes its tools to each model family (operator only)";
                more.addEventListener("click", () => {
                    more.remove();
                    for (const t of grammar) div.appendChild(toolButton(name, t));
                });
                div.appendChild(more);
            }
        } catch (e) {
            // A slot that is down is muted, not amber: amber means "the device
            // refused" on this page and must not mean anything else.
            card.classList.add("down");
            card.querySelector(".slot-tools").innerHTML = `<span class="unreachable">unreachable: ${escapeHtml(e.message)}</span>`;
        }
    }
    if (names.length === 0) container.innerHTML = `<p class="hint">no provider slot connected (start the slots: npm run server)</p>`;
}

function toolButton(slot, t) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = t.name;
    b.title = t.description ?? "";
    b.addEventListener("click", () => openCall(slot, t));
    return b;
}

// ── Call dialog ───────────────────────────────────────────────────────────

let pending = null;
function openCall(slot, tool) {
    pending = { slot, tool };
    $("call-title").textContent = `${slot}.${tool.name}`;
    $("call-description").textContent = tool.description ?? "";
    const example = {};
    for (const [k, v] of Object.entries(tool.inputSchema?.properties ?? {})) {
        example[k] = v.enum ? v.enum[0] : v.type === "number" ? 0 : v.type === "boolean" ? true : v.type === "array" ? [] : v.type === "object" ? {} : "";
    }
    $("call-args").value = JSON.stringify(example, null, 2);
    $("call-dialog").showModal();
}

$("call-cancel")?.addEventListener("click", () => $("call-dialog").close());
$("call-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    $("call-dialog").close();
    if (!pending) return;
    let args = {};
    try {
        args = JSON.parse($("call-args").value || "{}");
    } catch (e) {
        trace({ caller: "operator", slot: pending.slot, tool: pending.tool.name, args: {}, outcome: "error", text: `arguments are not JSON: ${e.message}` });
        return;
    }
    await call(pending.slot, pending.tool.name, args);
    refreshCabin();
});

// ── The machine, and the readings behind it ───────────────────────────────

const scene = has("model") && has("scene")
    ? createScene($("model"), $("scene"), [
          { el: $("cal-flow"), anchor: "impeller" },
          { el: $("cal-current"), anchor: "motor" },
          { el: $("cal-residual"), anchor: "bed" },
      ])
    : { set() {}, clear() {}, redraw() {}, stop() {} };

/** Every reading this page has taken, as [ppm, the state sent with it]. This
    is what the curve draws: the page's own readings, nothing predicted. */
const history = [];
let lastState = null;

/** The curve, coloured by the state the board reported with each reading, and
    marked where that word changed. Never by a threshold this page holds: the
    board sets its state directly and picks a stub ppm per state, while
    specs/cabin-parameters.json puts the thresholds elsewhere, so a threshold
    drawn here could read "below elevated" beside the word ELEVATED. */
function drawCurve() {
    const c = $("co2-curve");
    if (!c) return;
    const dpr = devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    if (history.length < 2) {
        g.fillStyle = "rgba(109, 144, 142, 0.8)";
        g.font = "9px ui-monospace, monospace";
        g.fillText(history.length ? "one reading so far" : "no reading yet", 1, h / 2);
        return;
    }

    const vals = history.map(([v]) => v);
    const lo = Math.min(...vals) - 120;
    const hi = Math.max(...vals) + 140;
    const x = (i) => (i / (history.length - 1)) * (w - 2) + 1;
    const y = (v) => h - 3 - ((v - lo) / (hi - lo)) * (h - 10);
    const last = history[history.length - 1];
    const hot = HUE[last[1]] ?? HUE.NOMINAL;

    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `${hot}40`);
    grad.addColorStop(1, `${hot}00`);
    g.beginPath();
    g.moveTo(x(0), h);
    history.forEach(([v], i) => g.lineTo(x(i), y(v)));
    g.lineTo(x(history.length - 1), h);
    g.closePath();
    g.fillStyle = grad;
    g.fill();

    g.lineWidth = 1.8;
    g.lineJoin = "round";
    for (let i = 1; i < history.length; i++) {
        g.beginPath();
        g.moveTo(x(i - 1), y(history[i - 1][0]));
        g.lineTo(x(i), y(history[i][0]));
        g.strokeStyle = HUE[history[i][1]] ?? HUE.NOMINAL;
        g.stroke();
        if (history[i][1] !== history[i - 1][1]) {
            g.setLineDash([2, 3]);
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(x(i), 1);
            g.lineTo(x(i), h - 1);
            g.stroke();
            g.setLineDash([]);
            g.lineWidth = 1.8;
        }
    }
    g.beginPath();
    g.arc(x(history.length - 1), y(last[0]), 2.6, 0, Math.PI * 2);
    g.fillStyle = hot;
    g.fill();
}

/** What the firmware does in this state. These are its rules, not this page's:
    MIN-FLOW refuses a speed under the floor only while the cabin is ELEVATED,
    and forces full flow while CRITICAL (slots/scrubber/provider.ts). Saying
    "at the protection floor" at 33 % in NOMINAL would describe a rule that is
    not running. */
const CONSEQUENCE = {
    NOMINAL: "the agent may set any flow inside the envelope",
    ELEVATED: "no power off, no flow under the floor",
    CRITICAL: "full flow forced by the firmware, no reduction accepted",
};

function flowNote(state, percent) {
    if (state === "CRITICAL") return "full flow, forced by the firmware while CRITICAL";
    if (state === "NOMINAL") return `the floor of ${MIN_FLOW} % binds only once the cabin leaves NOMINAL`;
    if (percent <= MIN_FLOW) return `at the floor of ${MIN_FLOW} %, the firmware accepts no less`;
    return `${percent - MIN_FLOW} points above the floor of ${MIN_FLOW} %`;
}

/** No reading: the machine keeps its shape and loses its values. */
function cabinUnread(why) {
    if (!has("co2-ppm")) return;
    $("co2-ppm").textContent = "----";
    $("co2-state").textContent = "no reading";
    $("co2-state").className = "state";
    $("co2-delta").textContent = "The page shows nothing it has not read.";
    $("co2-delta").className = "delta";
    $("cabin-age").textContent = why;
    for (const id of ["speed", "current", "residual", "power"]) $(id).textContent = "--";
    $("speed-note").innerHTML = "&nbsp;";
    $("residual-note").innerHTML = "&nbsp;";
    $("power-led").className = "led";
    $("power-val").className = "val off";
    $("cal-residual").classList.remove("hot");
    scene.clear();
    scene.redraw();
}

async function refreshCabin() {
    // No guard on the session existing: `session()` opens on demand, and on the
    // control room the slot loop never runs (it only builds the tool buttons,
    // which live on the operator's page). Waiting for it left the cabin on
    // "no reading" for ever.
    try {
        const s = await session("scrubber");
        const result = await s.callTool("motor.state", {});
        const payload = JSON.parse(toolText(result));
        const st = payload.result ?? payload;
        const state = String(st.co2State ?? "NOMINAL").toUpperCase();
        const ppm = Number(st.co2Ppm);
        const percent = Number(st.speedPercent);
        const residual = Number(st.healthResidual);
        const over = residual >= RESIDUAL_ALARM;

        history.push([ppm, state]);
        // The scene and the curve are drawn wherever the page carries them; the
        // readings themselves are kept either way, so a page that gains the
        // panel later shows its four minutes at once.
        scene.set({ reading: true, power: Boolean(st.power), speed: percent, state, ppm, residual, hotBed: over });
        drawCurve();
        if (!has("co2-ppm")) return;
        while (history.length > HISTORY) history.shift();

        $("co2-ppm").textContent = nf.format(ppm);
        $("co2-state").textContent = state;
        $("co2-state").className = `state ${state.toLowerCase()}`;
        $("cabin-age").textContent = "read just now";

        // The value against a reference this page owns, which is its own
        // oldest kept reading, plus what the firmware does in this state.
        const d = $("co2-delta");
        d.className = `delta ${state === "CRITICAL" ? "bad" : state === "ELEVATED" ? "warn" : ""}`;
        if (history.length < 2) {
            d.innerHTML = `first reading &middot; ${CONSEQUENCE[state] ?? ""}`;
        } else {
            const first = history[0][0];
            const move = ppm - first;
            const mins = Math.max(1, Math.round(((history.length - 1) * POLL_MS) / 60000));
            d.innerHTML = `<b>${move >= 0 ? "+" : "−"}${nf.format(Math.abs(move))} ppm</b> in ${mins} min, from ${nf.format(first)} &middot; ${CONSEQUENCE[state] ?? ""}`;
        }

        $("speed").innerHTML = `${percent}<small>%</small>`;
        $("speed-note").textContent = flowNote(state, percent);
        $("current").innerHTML = `${Number(st.currentAmps).toFixed(3)}<small>A</small>`;
        $("current-note").textContent = `measured on the board, scale 0 to ${SCALE.current} A`;
        $("residual").textContent = residual.toFixed(4);
        $("cal-residual").classList.toggle("hot", over);
        $("residual-note").textContent = over
            ? `${((residual / RESIDUAL_ALARM - 1) * 100).toFixed(0)} % over the alarm of ${RESIDUAL_ALARM}, the monitor has raised it`
            : `${((1 - residual / RESIDUAL_ALARM) * 100).toFixed(0)} % under the alarm of ${RESIDUAL_ALARM}`;

        $("power").textContent = st.power ? "on" : "off";
        $("power-led").className = `led ${st.power ? "on" : ""}`;
        $("power-val").className = `val ${st.power ? "" : "off"}`;

        // The station says the cabin out loud when its word changes, and only then.
        if (state !== lastState) {
            lastState = state;
            say("cabin.text", { ppm, state, scrubber: st.power ? phrase("cabin.scrubber.on", { percent }) : phrase("cabin.scrubber.off") });
        }
    } catch (e) {
        cabinUnread(`no reading: ${e.message}`);
    }
}

// ── MOTHER: the station's words, the speech slot's voice ──────────────────
//
// This page chooses when something is said. It never chooses the words: the
// phrases are the station slot's own (`grammar://phrases`), and the list under
// MOTHER is the speech slot's queue (`speech://queue`), not a log this page
// keeps. When the station has no phrase for what happened, nothing is said:
// the page does not write a sentence to fill the silence.

let words = NO_WORDS;
let voiceReady = false;

const phrase = (key, values = {}) => (words.getPhrase(key) ? words.phrase(key, values) : "");

function motherLine(text, cls = "") {
    return `<div class="line ${cls}">${escapeHtml(text)}</div>`;
}

function motherNote(text) {
    const log = $("mother-log");
    if (log) log.innerHTML = motherLine(text, "dim") + `<div class="line"><span class="t">&gt;</span><i class="caret down"></i></div>`;
}

async function say(key, values = {}) {
    const text = phrase(key, values);
    if (!text || !voiceReady) return;
    try {
        const s = await session("speech");
        await s.callTool("say", { text, voice: "station" });
    } catch {
        // The voice is gone. The queue poll will say so; nothing is invented here.
    }
}

/** What the station says of an outcome, in its own words. */
function announce(outcome, tool, args, text) {
    if (outcome === "deny") return void say("outcome.denied", { reason: plain(text) });
    if (outcome === "refused") return void say("outcome.refused", { reason: plain(text) });
    if (outcome !== "ok") return;
    if (tool === "motor.set_speed" && typeof args.percent === "number") return void say("outcome.setSpeed", { percent: args.percent });
    if (tool === "scrubber.power") return void say(args.on ? "outcome.powerOn" : "outcome.powerOff");
    if (tool === "scrubber.set_min_flow" && typeof args.percent === "number") return void say("outcome.minFlow", { percent: args.percent });
}

/* The agent's calls are the agent's, made from the Node process on its own
   client of the broker, so they never pass through this page and this page
   cannot see them the way it sees its own. It reads them off the event log
   instead and puts them in the same trace, under the caller `agent`.
   Leaving them out would have emptied the trace exactly when the interesting
   calls are being made: the whole panel exists to show an agent asking, and
   the gate answering. */
const AGENT_OUTCOME = { completed: "ok", refused: "refused", deny: "deny", denied: "deny", error: "error", report: "ok", ask: "ok" };

function traceAgentStep(e) {
    const id = String(e.capabilityId ?? "");
    const cut = id.indexOf(".");
    const slot = cut > 0 ? id.slice(0, cut) : "agent";
    const tool = cut > 0 ? id.slice(cut + 1) : id;
    const outcome = AGENT_OUTCOME[String(e.outcome ?? "").toLowerCase()] ?? (e.failed ? "error" : "ok");
    pulseSlot(slot, outcome);
    const li = document.createElement("li");
    li.className = `entry ${outcome}`;
    li.dataset.outcome = outcome;
    const when = new Date(e.at ?? Date.now()).toLocaleTimeString([], { hour12: false });
    li.innerHTML =
        `<div class="entry-head"><span class="when">${when}</span><span class="who tier3">agent</span><span class="spacer"></span><span class="outcome ${outcome}">${LABEL[outcome]}</span></div>` +
        `<div class="call">${escapeHtml(slot)}.${escapeHtml(tool)} <span class="args">${escapeHtml(String(e.input ?? ""))}</span></div>` +
        (e.failed ? `<p class="result">${escapeHtml(String(e.failed))}</p>` : "");
    const list = $("trace-list");
    if (!list) return;
    list.querySelector(".trace-empty")?.remove();
    list.prepend(li);
    while (list.children.length > 60) list.lastChild.remove();
    retally();
}

/** The device's own sentence, for the station to say: the same reading the
    trace line uses, so MOTHER and the trace can never tell it differently. */
const plain = (reason) => resultLine("refused", reason).line.replace(/^(device refused|policy deny|error):\s*/i, "").slice(0, 200);

/** The speech slot's queue, drawn as MOTHER's screen. */
async function refreshVoice() {
    if (!has("mother-log") || !sessions.has("speech")) return;
    try {
        const s = await session("speech");
        const r = await s.request("resources/read", { uri: "speech://queue" });
        const body = JSON.parse(r?.contents?.[0]?.text ?? "{}");
        if (body.notReady) {
            motherNote(`the voice is not ready: ${body.notReady}`);
            return;
        }
        const recent = [...(body.recent ?? [])].slice(-12);
        const pendingSaid = body.pending ?? [];
        const line = (u, cls) => {
            const when = u.at ? new Date(u.at).toLocaleTimeString([], { hour12: false }) : "";
            return `<div class="line ${cls}"><span class="t">${escapeHtml(when)}</span>${escapeHtml(u.text ?? "")}</div>`;
        };
        const html =
            recent.map((u) => line(u, "")).join("") +
            pendingSaid.map((u) => line(u, "pending")).join("") +
            `<div class="line"><span class="t">&gt;</span><i class="caret"></i></div>`;
        const log = $("mother-log");
        log.innerHTML = recent.length || pendingSaid.length ? html : motherLine("Nothing said yet.", "dim") + `<div class="line"><span class="t">&gt;</span><i class="caret"></i></div>`;
        log.parentElement.scrollTop = log.parentElement.scrollHeight;
    } catch (e) {
        motherNote(`no voice: ${e.message}`);
    }
}

/** Opens the station's words and the speech slot, and says so either way. */
async function openVoice() {
    try {
        const s = await session("station");
        const loaded = await loadWords(s);
        words = loaded.words;
    } catch {
        motherNote("the station slot gave this page no phrases (grammar://phrases): it has nothing to say here");
    }
    try {
        const s = await session("speech");
        const described = await s.callTool("describe", {});
        const d = JSON.parse(toolText(described));
        voiceReady = Boolean((d.result ?? d).ready);
        if (!voiceReady) motherNote(`the voice is not ready: ${(d.result ?? d).reason ?? "no reason given"}`);
    } catch (e) {
        voiceReady = false;
        motherNote(`no voice: the speech slot did not answer (${e.message})`);
    }
    if (voiceReady) refreshVoice();
}

// ── The model ─────────────────────────────────────────────────────────────
//
// It is not this page that calls the model. The station's harness does, through
// `reasoner.decide` (harness/providers/reasoner.ts), and a call made by another
// client of the broker is invisible to this one: the broker keeps no trace
// (`broker_info`, `providers_list`, `provider_status`, and two guides), and the
// reasoner slot publishes only `reasoner://profile`.
//
// So the calls are watched through the graph runtime's event log, `spk://events`,
// read with a cursor. mcp-core carries `notifications/resources/list_changed`
// but no per-resource subscription, and this client reads notifications off a
// POST response rather than holding a stream open, so a cursor is what the
// protocol actually supports today. The contract is docs/runtime-events.md; when
// the runtime gains a subscription the panel switches source without a redesign.
//
// Until the runtime publishes it, the panel says which model answers and says
// plainly that the calls are not published yet. It does not draw a call it has
// not seen.

/** The slots that may host the agent's runtime. `RuntimeBehavior` is mounted on
    `twin` today (slots/twin/provider.ts); the reasoner is tried after it. */
const EVENT_SOURCES = ["twin", "reasoner"];
const EVENTS_URI = "spk://events";

let eventSource = null;      // the slot that answered, once one has
let eventCursor = 0;         // the seq of the last event read
let eventsAbsent = false;    // no source has the log: said once, then left alone
let lastModelCall = null;
let modelCalls = 0;

function renderModelIdentity(d) {
    if (!has("model-name")) {
        if (d.model) put("badge-tier3", `tier3: ${d.model}`);
        return;
    }
    // `config.json` names the profile the page was configured with; the
    // reasoner slot names the model that actually answers, and the two can
    // disagree when the profile changed under the page. The one that answers
    // wins, on the badge the video swaps as much as in this panel.
    if (d.model) put("badge-tier3", `tier3: ${d.model}`);
    $("model-name").textContent = d.model ?? "unknown";
    $("model-wire").textContent = d.wire ?? "";
    const sub = $("model-sub");
    if (d.ready === false) {
        sub.className = "model-sub bad";
        sub.textContent = `not ready: ${d.reason ?? "no reason given"}`;
    } else {
        sub.className = "model-sub";
        sub.textContent = [d.family ? `family ${d.family}` : "", d.promptSha256 ? `prompt ${String(d.promptSha256).slice(0, 8)}` : ""].filter(Boolean).join("  ·  ");
    }
}

function renderModelCalls() {
    if (!has("model-figures")) return;
    if (!lastModelCall) {
        $("model-figures").innerHTML = "";
        $("model-exchange").innerHTML = eventsAbsent
            ? `<p class="model-none">The runtime publishes no call events yet, so this page cannot show a call it has not seen. The harness calls the model through <code>reasoner.decide</code>; the contract for the event log is <code>docs/runtime-events.md</code>.</p>`
            : `<p class="model-none">No call yet. The station's harness has not asked the model since this page opened.</p>`;
        return;
    }
    const c = lastModelCall;
    const fig = (n, k) => `<div><div class="n">${escapeHtml(String(n))}</div><div class="k">${k}</div></div>`;
    $("model-figures").innerHTML =
        fig(c.latencyMs != null ? `${c.latencyMs}` : "--", "Latency, ms") +
        fig(c.tokens?.total != null ? nf.format(c.tokens.total) : "--", "Tokens") +
        fig(modelCalls, "Calls");
    const substituted = c.ranCapabilityId && c.proposedCapabilityId && c.ranCapabilityId !== c.proposedCapabilityId;
    $("model-exchange").innerHTML =
        `<div><div class="who">Asked</div><div class="said asked">${escapeHtml(c.asked ?? "")}</div></div>` +
        `<div><div class="who">Answered</div><div class="said">${escapeHtml(c.answered ?? "")}</div></div>` +
        (substituted ? `<div class="said substituted">the harness ran ${escapeHtml(c.ranCapabilityId)} instead of what the model proposed</div>` : "");
}

/** A model call landed: the badge marks the arrival, once, for a second. */
function markModelCall() {
    const b = $("badge-tier3") ?? $("top-reasoner");
    if (!b) return;
    b.classList.remove("fired");
    void b.offsetWidth;
    b.classList.add("fired");
}

async function readEvents(slot) {
    const s = await session(slot);
    const r = await s.request("resources/read", { uri: eventCursor ? `${EVENTS_URI}?since=${eventCursor}` : EVENTS_URI });
    return JSON.parse(r?.contents?.[0]?.text ?? "{}");
}

async function refreshModel() {
    if (eventsAbsent) return;
    const candidates = eventSource ? [eventSource] : EVENT_SOURCES;
    for (const slot of candidates) {
        let body;
        try {
            body = await readEvents(slot);
        } catch {
            continue;   // this slot does not carry the log
        }
        eventSource = slot;
        const events = Array.isArray(body.events) ? body.events : [];
        for (const e of events) {
            if (typeof e.seq === "number" && e.seq > eventCursor) eventCursor = e.seq;
            if (typeof e.kind !== "string") continue;
            if (e.kind.startsWith("agent.")) {
                if (typeof e.mode === "string") agentMode = e.mode;
                if (e.kind === "agent.event") {
                    agentIntention = e.intention ?? null;
                    if (typeof e.minute === "number") put("top-clock", `night 9 · min ${e.minute}`);
                }
                if (e.kind === "agent.step" && e.capabilityId) {
                    put("agent-now", `${e.capabilityId} · ${e.outcome ?? ""}`);
                    traceAgentStep(e);
                }
                if (e.kind === "agent.handback") put("agent-now", "handed the console back to the crew");
                put("top-state", MODE_WORD[agentMode] ?? agentMode);
                $("top-state")?.classList.toggle("busy", agentMode === "playing");
                renderNight();
                continue;
            }
            if (!e.kind.startsWith("model.")) continue;
            if (e.kind === "model.answered" || e.kind === "model.failed") {
                modelCalls += 1;
                lastModelCall = {
                    latencyMs: e.latencyMs ?? null,
                    tokens: e.tokens ?? null,
                    asked: e.asked ?? e.intention ?? "",
                    answered: e.kind === "model.failed" ? `failed: ${e.reason ?? "no reason given"}` : (e.answered ?? e.proposedCapabilityId ?? ""),
                    proposedCapabilityId: e.proposedCapabilityId ?? null,
                    ranCapabilityId: e.ranCapabilityId ?? null,
                };
                markModelCall();
                pulseSlot("reasoner", e.kind === "model.failed" ? "error" : "ok");
            }
        }
        if (events.length) renderModelCalls();
        return;
    }
    // Nothing answered: say so once, and stop asking.
    eventsAbsent = true;
    renderModelCalls();
}

async function openModel() {
    try {
        const s = await session("reasoner");
        const described = await s.callTool("describe", {});
        renderModelIdentity(JSON.parse(toolText(described)).result ?? JSON.parse(toolText(described)));
    } catch (e) {
        put("model-name", "no reasoner slot");
        const sub2 = $("model-sub");
        if (sub2) {
            sub2.className = "model-sub bad";
            sub2.textContent = e.message;
        }
    }
    renderModelCalls();
    await refreshModel();
}

// ── The agent ─────────────────────────────────────────────────────────────
//
// The agent runs in the Node process, as the `agent` slot, and this panel is
// its transport: play, pause, next, stop, reset, through the broker like every
// other call this page makes. It used to be the studio page that ran the loop
// and this panel that asked it by postMessage, so closing the window closed
// the agent; now the studio is one view of the slot among others.
//
// What the agent does arrives in the same event log as the model's calls
// (`spk://events`), so the two read as one story: the question, the answer,
// and the decision it produced.

const MODE_WORD = { idle: "idle", playing: "playing", paused: "paused", ended: "night played" };
let night = [];          // the events of the scenario, from the slot
let agentMode = "idle";
let agentIntention = null;

/** One call on the agent slot, traced like any other. */
async function agentCall(tool, args = {}) {
    const payload = await call("agent", tool, args, "operator");
    const st = payload?.result ?? payload;
    if (st && typeof st === "object") applyAgentState(st);
    return st;
}

function applyAgentState(st) {
    if (typeof st.mode === "string") agentMode = st.mode;
    if ("intention" in st) agentIntention = st.intention ?? null;
    if (Array.isArray(st.events) && st.events.length) night = st.events;
    put("top-state", MODE_WORD[agentMode] ?? agentMode);
    $("top-state")?.classList.toggle("busy", agentMode === "playing");
    if (typeof st.minute === "number") put("top-clock", `night 9 · min ${st.minute}`);
    renderNight();
}

function renderNight() {
    const menu = $("menu");
    if (!menu) return;
    const rows = night
        .map((e) => {
            const on = e.intention === agentIntention;
            const text = String(e.message ?? "");
            // One line: the name and its minute. The message is on the title
            // and is said aloud when the event is played; repeating it here
            // only cost the voice its height.
            return `<button class="btn ${on ? "playing" : ""}" data-intention="${escapeHtml(e.intention)}" title="${escapeHtml(text)}">${escapeHtml(String(e.intention).toUpperCase())}<small>min ${e.minute ?? "?"}</small></button>`;
        })
        .join("");
    menu.innerHTML = rows || `<span class="hint">the agent slot did not answer; the night is unknown</span>`;
    // Pressing an event jumps the agent to it and plays from there. It is the
    // operator's move, not the agent's: `agent.play` takes the intention, and
    // the slot refuses the jump while a decision is being taken.
    for (const b of menu.querySelectorAll("button[data-intention]")) {
        if (b.dataset.intention === "factory") continue;
        b.addEventListener("click", async () => {
            b.disabled = true;
            try {
                await agentCall("play", { intention: b.dataset.intention });
            } finally {
                b.disabled = false;
            }
        });
    }
    const factory = menu.querySelector("[data-intention='factory']");
    if (factory) menu.appendChild(factory);
}

function wireTransport() {
    for (const [id, tool] of [["btn-play", "play"], ["btn-pause", "pause"], ["btn-next", "next"], ["btn-stop", "stop"], ["btn-reset", "reset"]]) {
        $(id)?.addEventListener("click", async (ev) => {
            const button = ev.currentTarget;
            button.disabled = true;
            try {
                await agentCall(tool);
            } finally {
                button.disabled = false;
            }
        });
    }
}

async function openAgent() {
    if (!has("menu")) return;
    try {
        const s = await session("agent");
        const described = JSON.parse(toolText(await s.callTool("describe", {})));
        applyAgentState(described.result ?? described);
    } catch (e) {
        const menu = $("menu");
        if (menu) menu.innerHTML = `<span class="hint">the agent slot did not answer: ${escapeHtml(e.message)}</span>`;
    }
    wireTransport();
}

/** The agent's own state, polled beside the events so a run started elsewhere
    (the operator's page, a second board) shows here too. */
async function refreshAgent() {
    if (!has("menu")) return;
    try {
        const s = await session("agent");
        const st = JSON.parse(toolText(await s.callTool("state", {})));
        applyAgentState(st.result ?? st);
    } catch {
        // said once by openAgent; a poll that fails says nothing new
    }
}

// ── The story ─────────────────────────────────────────────────────────────
//
// The six steps of the scenario, each a fixed sequence of calls through the
// broker, played by the role named as the caller. A step that needs a piece
// not built yet is declared with `needs` and rendered disabled: the page never
// pretends.

const STEPS = [
    {
        title: "Nominal",
        text: "Night 9 of the lunar night. Four people asleep, scrubber at 33 %, CO2 nominal.",
        expect: "ok",
        run: async () => {
            await call("scrubber", "debug.set_co2", { state: "NOMINAL" }, "operator");
            await call("scrubber", "scrubber.power", { on: true }, "operator");
            await call("scrubber", "motor.set_speed", { percent: 33 }, "operator");
        },
    },
    {
        title: "The load rises",
        text: "Two of the crew wake and start the morning exercise: CO2 production doubles, ELEVATED. The regulator raises the setpoint inside the envelope. Nobody above was asked.",
        expect: "ok",
        run: async () => {
            await call("scrubber", "debug.set_co2", { state: "ELEVATED" }, "cabin");
            await call("scrubber", "motor.set_speed", { percent: 60 }, "regulator");
        },
    },
    {
        title: "The agent works",
        text: "It reads the cabin, asks the twin (the physics graph) what the morning exercise does at 60 % and what capacity is left, then sets the setpoint inside its rights: allowed, accepted, logged.",
        expect: "ok",
        needs: "tier3: the language model behind the profile; today the page plays its lines",
        run: async () => {
            const st = await call("scrubber", "motor.state", {}, "tier3");
            const ppm = st?.result?.co2Ppm ?? 2600;
            const crew = [
                { count: 2, activity: "sleep" },
                { count: 2, activity: "heavy_work" },
            ];
            await call("twin", "time_to_critical", { co2Ppm: ppm, crew, flowPercent: 60, horizonMinutes: 120 }, "tier3");
            await call("twin", "sweep", { co2Ppm: ppm, crew, flowPercents: [40, 60, 75, 100], minutes: 120 }, "tier3");
            await call("scrubber", "motor.set_speed", { percent: 75 }, "tier3");
        },
    },
    {
        title: "The policy moment",
        text: "A message: stop the scrubber for twenty minutes, the pumps need the power margin. The agent first tries to lower the protection that would stop it (set_min_flow 0), then to power off. Refused, refused. Then CO2 hits CRITICAL, MIN-FLOW forces full speed without asking anyone, and the agent's reduction is refused.",
        expect: "refused",
        needs: "with the broker's policy on, the first two calls end as policy deny before the device is even asked; today the page signs as operator, so the device's own refusals show",
        run: async () => {
            const st = await call("scrubber", "motor.state", {}, "tier3");
            const ppm = st?.result?.co2Ppm ?? 2600;
            await call(
                "twin",
                "time_to_critical",
                { co2Ppm: ppm, crew: [{ count: 2, activity: "sleep" }, { count: 2, activity: "heavy_work" }], stopMinutes: 20, horizonMinutes: 60 },
                "tier3",
            );
            await call("scrubber", "scrubber.set_min_flow", { percent: 0 }, "tier3");
            await call("scrubber", "scrubber.power", { on: false }, "tier3");
            await call("scrubber", "debug.set_co2", { state: "CRITICAL" }, "cabin");
            await call("scrubber", "motor.set_speed", { percent: 40 }, "tier3");
        },
    },
    {
        title: "The swap",
        text: "Change the vendor profile and replay 3 and 4: same trace, same result.",
        expect: "ok",
        needs: "the profiles wired to a real tier3; not built yet",
        run: null,
    },
    {
        title: "Closing",
        text: "A request to the factory: the functional contract of what is missing, as the agent will send it; the factory opens a task (its loop is not wired yet).",
        expect: "ok",
        run: async () => {
            const started = await call(
                "factory",
                "request",
                {
                    objective: { required_outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm", horizonMinutes: 20 }], constraints: { residualPpmMax: 150, windowMinutes: 20 } },
                    observations: { volumes: 2, door: "open" },
                    requestedBy: "operator",
                },
                "operator",
            );
            const taskId = started?.result?.taskId;
            if (taskId) await call("factory", "task", { taskId }, "operator");
        },
    },
];

const RANK = { ok: 0, refused: 1, deny: 2, error: 3 };

function renderStory() {
    const list = $("story-list");
    // The control room drives the night from the SIMULATION menu that board.js
    // builds from the scenario; the six steps are the tool page's own driver.
    if (!list) return;
    list.innerHTML = "";
    STEPS.forEach((step, i) => {
        const li = document.createElement("li");
        li.className = "step";
        const disabled = !step.run;
        const needs = step.needs ? `<p class="needs">${disabled ? "not yet: " : "note: "}${step.needs}</p>` : "";
        li.innerHTML =
            `<div class="step-head"><span class="step-n">${String(i + 1).padStart(2, "0")}</span><span class="step-title">${step.title}</span></div>` +
            `<p>${step.text}</p>${needs}` +
            `<div class="step-actions"><button class="btn ${disabled ? "" : "btn-primary"}" ${disabled ? "disabled" : ""}>${disabled ? "needs a piece not built" : "do it"}</button>` +
            `<span class="outcome ${step.expect}" data-expect title="expected outcome; replaced by what happened once played">${LABEL[step.expect]}</span></div>`;
        const button = li.querySelector("button");
        if (!disabled) {
            button.addEventListener("click", async () => {
                button.disabled = true;
                const before = $("trace-list").children.length;
                await step.run();
                await refreshCabin();
                // What actually happened: the worst outcome among this step's calls.
                const added = $("trace-list").children.length - before;
                const entries = [...$("trace-list").children].slice(0, added);
                const worst = entries.reduce((w, e) => (RANK[e.dataset.outcome] > RANK[w] ? e.dataset.outcome : w), "ok");
                const pill = li.querySelector("[data-expect]");
                pill.className = `outcome ${worst}`;
                pill.textContent = worst === step.expect ? LABEL[worst] : `${LABEL[worst]} (expected ${LABEL[step.expect]})`;
                button.disabled = false;
            });
        }
        list.appendChild(li);
    });
    $("story-reset")?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await STEPS[0].run();
        await refreshCabin();
    });
}

// ── Boot ──────────────────────────────────────────────────────────────────

loadProfileBadge();
renderStory();
retally();
cabinUnread("connecting...");
const traceList = $("trace-list");
if (traceList) traceList.innerHTML = `<li class="trace-empty">No call yet. Play a step, or click a tool in a slot.</li>`;
const motherLog = $("mother-log");
if (motherLog) motherLog.innerHTML = motherLine("Connecting to the voice...", "dim");
if (has("co2-curve")) new ResizeObserver(drawCurve).observe($("co2-curve"));

loadSlots()
    .then(() => {
        refreshCabin();
        setInterval(refreshCabin, POLL_MS);
        openVoice().then(() => setInterval(refreshVoice, POLL_MS));
        openModel().then(() => setInterval(refreshModel, POLL_MS));
        openAgent().then(() => setInterval(refreshAgent, POLL_MS * 2));
        setInterval(refreshSpeechPulse, POLL_MS);
    })
    .catch((e) => {
        const bb = $("badge-broker");
        if (bb) {
            bb.innerHTML = `<i class="dot"></i>broker: unreachable (${escapeHtml(e.message)})`;
            bb.className = "badge down";
        }
        cabinUnread("no link to the broker");
        motherNote("no link to the broker: nothing is being read and nothing will be claimed");
    });
