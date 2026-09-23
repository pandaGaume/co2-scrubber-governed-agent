/**
 * The boot console and the Control Board (docs/ui-brief.fr.md, section 12).
 *
 * The console writes its log line by line; every line is a request this page
 * really made: the broker, the slots (a missing one waits, then fails, and
 * stays red on the board), the studio and the agent's files, the parameters
 * and the scenario with their sha256 computed here, the reasoner, the voice.
 * A key press ends the boot (the gesture that allows sound), and the board
 * appears: the slots with a LED each, polled every two seconds; the agent's
 * loop, the studio page embedded and driven by postMessage; the station's
 * voice, which says hello with a welcome the model phrases from the boot
 * report; the simulation menu, one button per event of the scenario, and
 * the FACTORY button: the board asks the factory for the monitor that is
 * missing (the request is in the scenario file, `factory.request`), with the
 * telemetry it sampled from the board during the night (`motor.state`, one
 * sample every two seconds), then follows the task (`factory.task` every
 * second) and the station says one sentence per step, read from the task's
 * manifest (`factory-voice.js`).
 *
 * The board is the audio output of the speech slot (the loop page speaks and
 * does not play: `&output=none`).
 */
import { connectMcp, toolText } from "./vendor/mcp-http-client.js";
import { AudioOutput } from "./agent/audio-output.js";
import { endSentence, loadWords, NO_WORDS, stepSentence } from "./agent/factory-voice.js";

const $ = (id) => document.getElementById(id);
const base = `${location.protocol}//${location.host}`;
const EXPECTED = ["scrubber", "twin", "station", "factory", "reasoner", "speech"];
const TIER = { scrubber: "Tier 1, the board", twin: "Tier 0, the oracle", station: "Tier 2", factory: "the factory", reasoner: "the model", speech: "the voice" };
/* The slots that serve a page of their own, and what it is. A page is how a
   slot reaches a hand that is not at this keyboard: the agent is driven from a
   phone, the medical module is read on one, the factory is reviewed on a
   second screen. `app.js` turns these rows into buttons that show the address
   as a code. */
const PAGES = {
    agent: { page: "simulation.html", what: "The night, in hand" },
    biomed: { page: "biomed.html", what: "The medical module" },
    factory: { page: "factory.html", what: "The factory" },
};
/* A code, small: three finder squares and some noise. It says a code is
   behind the row without drawing one on every row. */
const PAGE_GLYPH =
    '<svg class="page-glyph" viewBox="0 0 11 11" aria-hidden="true">' +
    '<path d="M0 0h4v4H0zm1 1v2h2V1zM7 0h4v4H7zm1 1v2h2V1zM0 7h4v4H0zm1 1v2h2V8z"/>' +
    '<path d="M5 0h1v2H5zM6 5h2v1H6zM5 6h1v2H5zM9 6h1v1H9zM7 9h1v2H7zM5 10h1v1H5zM10 5h1v1h-1z"/></svg>';
const SLOT_WAIT_MS = 20_000;
const POLL_MS = 2000;
// The console's pace: the checks take milliseconds, the eye needs more. A line every LINE_MS at least,
// a WAIT shown HOLD_MS at least before its answer replaces it; the answer carries its measured time.
const LINE_MS = 450;
const HOLD_MS = 300;
const TYPE_MS = 28;
const LOOP_URL = "./studio/node-editor-v2/index.html?mcp=0&ext=/agent/tier3.js&output=none&view=fit";

// ── The broker, as this page sees it ──────────────────────────────────────

/** The page's language: `?locale=`, else en-US (the demo is filmed in English; the scenario's messages and the model's words are English); every slot picks its wording for this page's sessions on it. */
const LOCALE = new URLSearchParams(location.search).get("locale") ?? "en-US";
const sessions = new Map();
async function session(slot) {
    if (!sessions.has(slot)) {
        const p = connectMcp(base, slot, { headers: {}, locale: LOCALE, clientInfo: { name: "control-board", version: "0" } }).catch((e) => {
            sessions.delete(slot);
            throw e;
        });
        sessions.set(slot, p);
    }
    return sessions.get(slot);
}
/** `{ ok, output }` from a tool call, in the slots' wire shape. */
async function call(slot, tool, args = {}) {
    try {
        const s = await session(slot);
        const r = await s.callTool(tool, args);
        const text = toolText(r);
        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            payload = { text };
        }
        if (r?.isError) return { ok: false, error: String(payload?.refused ?? text), output: payload };
        return { ok: true, output: payload && "result" in payload ? payload.result : payload };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}
/** The slot names the broker lists (its own `_broker` left out). */
async function listSlots() {
    const b = await session("_broker");
    const listed = await b.callTool("providers_list", {});
    let providers = [];
    try {
        providers = JSON.parse(toolText(listed));
    } catch {
        providers = [];
    }
    return (Array.isArray(providers) ? providers : providers.providers ?? []).map((p) => (typeof p === "string" ? p : p.name)).filter((n) => n && !n.startsWith("_"));
}
const grammarOf = (session) => (typeof session?.grammar === "string" ? session.grammar : null);
const sha256 = async (text) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Boot console ──────────────────────────────────────────────────────────

const bootLog = $("boot-log");
let lastLineAt = 0;
/** Writes one line, at the console's pace; returns a setter to rewrite it (a WAIT that becomes OK or FAIL, not before HOLD_MS). */
async function line(status, text, cls) {
    await sleep(Math.max(0, LINE_MS - (Date.now() - lastLineAt)));
    const el = document.createElement("span");
    const shownAt = Date.now();
    const paint = (st, tx, c) => {
        const tag = st === "ok" ? "[ OK ]" : st === "wait" ? "[WAIT]" : st === "fail" ? "[FAIL]" : "      ";
        el.className = c ?? st ?? "";
        el.textContent = `${tag} ${tx}\n`;
    };
    paint(status, text, cls);
    bootLog.appendChild(el);
    bootLog.scrollTop = bootLog.scrollHeight;
    lastLineAt = shownAt;
    return async (st, tx, c) => {
        await sleep(Math.max(0, HOLD_MS - (Date.now() - shownAt)));
        paint(st, tx, c);
    };
}
async function typed(text) {
    await sleep(Math.max(0, LINE_MS - (Date.now() - lastLineAt)));
    const el = document.createElement("span");
    bootLog.appendChild(el);
    for (const ch of text) {
        el.textContent += ch;
        await sleep(TYPE_MS);
    }
    el.textContent += "\n";
    lastLineAt = Date.now();
}

/** The facts the boot established, for the board and for the welcome. */
const report = { slots: {}, versions: {}, reasoner: null, voice: null, scenario: null, parameters: null, missing: [] };
/** The words about a factory task: the phrases of the factory slot's wording for this page's session (`grammar://phrases`, mcp-core 1.2.0), read at boot. */
let words = null;
/** What the station says of itself (hello, the boot report): the phrases of the station slot's wording, read at boot; every key shows as itself until then. */
let station = NO_WORDS;

async function boot() {
    await typed("SYSTEM STARTING ...");
    await line(null, `lunar habitat · night 9 of 14 · ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`, "dim");

    // The broker.
    const setBroker = await line("wait", "broker: connecting");
    let names = [];
    try {
        const t0 = Date.now();
        const b = await session("_broker");
        await setBroker("ok", `broker: ${b.serverInfo?.name ?? "up"} ${b.serverInfo?.version ?? ""} at ${base} · ${Date.now() - t0} ms`);
        names = await listSlots();
    } catch (e) {
        await setBroker("fail", `broker: ${e.message}`);
    }

    // The slots: each expected one answers initialize, or waits, then fails.
    const setters = {};
    for (const slot of EXPECTED) setters[slot] = await line("wait", `slot ${slot}: waiting (${TIER[slot]})`);
    const started = Date.now();
    const pending = new Set(EXPECTED);
    while (pending.size) {
        for (const slot of [...pending]) {
            if (!names.includes(slot)) continue;
            try {
                const t0 = Date.now();
                const s = await session(slot);
                const version = s.serverInfo?.version ?? "?";
                report.slots[slot] = true;
                report.versions[slot] = version;
                await setters[slot]("ok", `slot ${slot}: ${version}${version.includes("stub") ? " (a stub: no body behind it)" : ""} · grammar ${grammarOf(s) ?? "none"} · ${Date.now() - t0} ms`);
                pending.delete(slot);
                await sleep(LINE_MS);
            } catch (e) {
                await setters[slot]("wait", `slot ${slot}: ${e.message}`);
            }
        }
        if (!pending.size) break;
        if (Date.now() - started > SLOT_WAIT_MS) {
            for (const slot of pending) {
                report.slots[slot] = false;
                report.missing.push(slot);
                await setters[slot]("fail", `slot ${slot}: not connected (${TIER[slot]})`);
            }
            break;
        }
        await sleep(POLL_MS);
        try {
            names = await listSlots();
        } catch {
            names = [];
        }
    }

    // The files the loop needs, and the two files every number comes from.
    for (const [label, url] of [
        ["studio", "./studio/node-editor-v2/index.html"],
        ["agent bundle", "./agent/tier3.js"],
        ["agent graph", "./graphs/tier3-agent.spikypanda"],
    ]) {
        const set = await line("wait", `${label}: ${url}`);
        try {
            const r = await fetch(url, { cache: "no-store" });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const size = (await r.text()).length;
            await set("ok", `${label}: ${url} (${size} bytes)`);
        } catch (e) {
            await set("fail", `${label}: ${url} (${e.message})`);
        }
    }
    for (const [key, label, url] of [
        ["parameters", "cabin parameters", "./specs/cabin-parameters.json"],
        ["scenario", "scenario", "./specs/scenario-night-9.json"],
    ]) {
        const set = await line("wait", `${label}: ${url}`);
        try {
            const r = await fetch(url, { cache: "no-store" });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const text = await r.text();
            const hash = await sha256(text);
            const json = JSON.parse(text);
            report[key] = { url, sha256: hash, events: Array.isArray(json.events) ? json.events.length : undefined, night: json.night ?? json.name ?? undefined, factory: json.factory ?? null };
            await set("ok", `${label}: ${url} · sha256 ${hash.slice(0, 12)}${json.events ? ` · ${json.events.length} events` : ""}`);
        } catch (e) {
            await set("fail", `${label}: ${url} (${e.message})`);
        }
    }

    // The model and the voice.
    if (report.slots.reasoner) {
        const set = await line("wait", "reasoner: asking which model answers");
        const r = await call("reasoner", "describe");
        report.reasoner = r.ok ? r.output : { ready: false, reason: r.error };
        const d = report.reasoner;
        await set(d.ready ? "ok" : "fail", `reasoner: ${d.model ?? "?"} (${d.family ?? "?"}, ${d.wire ?? "?"})${d.ready ? "" : ` · not ready: ${d.reason ?? "?"}`}`);
    }
    if (report.slots.speech) {
        const set = await line("wait", "voice: asking which engine speaks");
        const r = await call("speech", "describe");
        report.voice = r.ok ? r.output : { ready: false, reason: r.error };
        const d = report.voice;
        await set(d.ready ? "ok" : "fail", `voice: ${d.provider ?? "?"} ${d.model ?? ""} · speaker ${d.defaultVoice ?? "?"}${d.ready ? "" : ` · not ready: ${d.reason ?? "?"}`}`);
    }

    const up = EXPECTED.filter((s) => report.slots[s]).length;
    await typed(`BOOT COMPLETE · ${up}/${EXPECTED.length} slots${report.missing.length ? ` · not connected: ${report.missing.join(", ")}` : ""}`);
    $("boot-prompt").hidden = false;
    await new Promise((resolve) => {
        const go = () => {
            removeEventListener("keydown", go);
            removeEventListener("pointerdown", go);
            resolve();
        };
        addEventListener("keydown", go);
        addEventListener("pointerdown", go);
    });
}

// ── Control Board ─────────────────────────────────────────────────────────

const voiceLog = $("voice-log");

/**
 * The voice as a running trace.
 *
 * `AudioOutput.wave()` answers the shape of the utterance and where the audio
 * is in it; this reads the amplitude at that point, once per frame, and pushes
 * it into a window that scrolls. The newest sample enters at the right and the
 * older ones travel left, so the signal unrolls in time the way a scope does,
 * instead of a fixed picture being uncovered.
 *
 * Silence is drawn, not skipped: when nothing is being said the zeros scroll in
 * and the trace flattens out on its own, then the loop stops. What moves here
 * is a voice in the room, never an animation.
 */
function meter(read) {
    const canvas = $("voice-meter");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const SAMPLES = 180;
    const history = new Array(SAMPLES).fill(0);
    let running = false;

    const draw = () => {
        const dpr = devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const box = canvas.clientHeight;
        const h = box - 9;   // the canvas carries the card's bottom rule
        if (!w || h <= 0) return;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(box * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(box * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, box);

        const mid = Math.round(h / 2) + 0.5;
        const half = h / 2 - 1;
        // A display curve, not a change to the measurement: a voice spends most
        // of its time low on a linear scale, and drawn as it is the detail is
        // flattened against the axis. The same reason a meter is marked in
        // decibels. Nothing is added, the small values are given room.
        const curve = (v) => Math.pow(v, 0.62);
        /**
         * How white a spike goes, from the loudness around it rather than its
         * own.
         *
         * Taken sample by sample, one value crossing the line turned white on
         * its own and the trace grew isolated needles among the blue. A voice
         * does not do that: a loud passage is loud for a while. So the colour
         * follows a short neighbourhood, and drifts from cyan to white over
         * half the range instead of switching near the top of it.
         */
        const warmth = (i) => {
            let sum = 0;
            let n = 0;
            for (let k = i - 3; k <= i + 3; k++) {
                const u = history[k];
                if (u === undefined) continue;
                sum += curve(u);
                n++;
            }
            const t = Math.min(1, Math.max(0, (n ? sum / n : 0) - 0.42) / 0.5);
            return t * t * (3 - 2 * t);
        };
        // The trace dissolves towards both ends rather than being cut off, so
        // the beam reads as light and not as a bar chart in a box. The fade is
        // long on purpose: only the middle of the card is at full strength and
        // the energy is gone well before the edge. A short taper left the trace
        // looking clipped at both ends, which is the one thing light never does.
        const edge = (x) => {
            const t = Math.min(1, Math.min(x, w - x) / (w * 0.38));
            return t * t * (3 - 2 * t);   // smooth at both ends of the ramp
        };

        // Added rather than painted over: where the passes overlap the colour
        // climbs to white, which is what makes the loud parts burn.
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";

        // The beam itself: always there, brightest in the middle of the card,
        // and blue. It is the colour of the whole picture; white is not a
        // colour here, it is what the loudest peaks turn into.
        for (let x = 0; x < w; x++) {
            const a = edge(x);
            if (a <= 0) continue;
            ctx.fillStyle = `rgba(40, 190, 215, ${(0.20 * a).toFixed(3)})`;
            ctx.fillRect(x, mid - 1, 1, 2);
        }
        ctx.shadowColor = "rgba(40, 190, 230, 0.9)";
        ctx.shadowBlur = 6;
        for (let x = 0; x < w; x++) {
            const a = edge(x);
            if (a <= 0) continue;
            ctx.fillStyle = `rgba(90, 220, 240, ${(0.34 * a).toFixed(3)})`;
            ctx.fillRect(x, mid - 0.5, 1, 1);
        }

        // The excursions. A wide blue halo under everything, then a core whose
        // colour follows the amplitude: cyan almost all the way up, and only
        // the top of the range burning out to white. Painting every spike white
        // was what flattened the picture: the blue has to carry it.
        ctx.shadowBlur = 11;
        ctx.shadowColor = "rgba(40, 190, 230, 0.8)";
        for (let i = 0; i < SAMPLES; i++) {
            const v = curve(history[i]);
            if (v <= 0.02) continue;
            const x = Math.round((i / (SAMPLES - 1)) * (w - 1));
            const a = edge(x);
            if (a <= 0) continue;
            const len = Math.max(1, v * half * a);
            ctx.fillStyle = `rgba(40, 180, 225, ${(0.26 * a).toFixed(3)})`;
            ctx.fillRect(x - 0.5, mid - len, 2, len * 2);
        }

        ctx.shadowBlur = 4;
        for (let i = 0; i < SAMPLES; i++) {
            const v = curve(history[i]);
            if (v <= 0.02) continue;
            const x = Math.round((i / (SAMPLES - 1)) * (w - 1));
            const a = edge(x);
            if (a <= 0) continue;
            const white = warmth(i);
            const r = Math.round(70 + 175 * white);
            const g = Math.round(215 + 40 * white);
            const b = Math.round(235 + 20 * white);
            const len = Math.max(1, v * half * 0.94 * a);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(a * (0.42 + 0.5 * white)).toFixed(3)})`;
            ctx.fillRect(x, mid - len, 1, len * 2);
        }

        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = "source-over";
    };

    const tick = () => {
        const shape = read();
        // The amplitude where the audio actually is, or silence when it is not
        // speaking: either way one sample enters and one leaves.
        let v = 0;
        if (shape) {
            const n = shape.envelope.length;
            v = shape.envelope[Math.min(n - 1, Math.floor(shape.progress * n))] ?? 0;
        }
        history.push(v);
        history.shift();
        draw();
        if (shape || history.some((x) => x > 0.01)) requestAnimationFrame(tick);
        else running = false;
    };

    draw();
    return () => {
        if (running) return;
        running = true;
        requestAnimationFrame(tick);
    };
}

const startMeter = meter(() => audio.wave());

/**
 * Writes a sentence as it is being said, not once it has been.
 *
 * How much is shown is where the audio actually is in the utterance, so the
 * words arrive at the speed the voice says them. It is not a typing effect on
 * a timer: pause the sound and the text stops with it. When the shape of the
 * utterance could not be read, the whole sentence appears at once rather than
 * crawling at an invented pace.
 */
function reveal(line, text) {
    const body = line.lastChild;
    if (!body) return;
    const tick = () => {
        const shape = audio.wave();
        if (!shape) {
            body.nodeValue = text;   // said, or nothing to follow: show it whole
            return;
        }
        body.nodeValue = text.slice(0, Math.max(1, Math.round(text.length * shape.progress)));
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}
function voiceLine(text, cls = "") {
    const el = document.createElement("div");
    el.className = `line ${cls}`;
    el.innerHTML = cls === "info" ? "" : `<span class="who">station</span>`;
    el.appendChild(document.createTextNode(text));
    voiceLog.prepend(el);
    while (voiceLog.children.length > 40) voiceLog.lastChild.remove();
    return el;
}

/** One output for this board; `take` in the slot keeps a second page from saying everything twice. */
const audio = new AudioOutput(
    { session, call: (slot, tool, args) => call(slot, tool, args) },
    `board-${Math.random().toString(36).slice(2, 8)}`,
    {
        onPlay: (u) => {
            reveal(voiceLine("", "now"), u.text ?? "");
            startMeter?.();
        },
        onError: (m) => voiceLine(`audio: ${m}`, "info"),
        onTakenElsewhere: (u) => voiceLine(`said by another page (a second board is open?): ${u.text.slice(0, 60)}...`, "info"),
    },
);

/**
 * The factory's own window, opened when the operator asks for it and never
 * before: the control room is what is filmed, and a window that opens by
 * itself lands on top of it. It sits on the right half of the screen so it
 * does not cover the board, because a fully covered window is treated as
 * hidden by the browser and its timers slow down, and the board is the audio
 * output. The window is named, so asking twice reuses it rather than opening
 * a second one.
 */
function openFactoryWindow() {
    const width = Math.floor(screen.availWidth / 2);
    const features = `popup=yes,width=${width},height=${screen.availHeight},left=${screen.availLeft + width},top=${screen.availTop}`;
    const w = window.open("./factory.html", "factory", features);
    voiceLine(w ? "factory: its page opened in its own window (right half of the screen)" : "factory: the browser did not open its window; open ./factory.html yourself", "info");
    return w;
}

async function renderSlots() {
    let names = [];
    try {
        names = await listSlots();
    } catch {
        names = [];
    }
    const list = $("slot-list");
    const all = [...EXPECTED, ...names.filter((n) => !EXPECTED.includes(n))];
    for (const slot of all) {
        let li = list.querySelector(`li[data-slot="${slot}"]`);
        if (!li) {
            li = document.createElement("li");
            li.dataset.slot = slot;
            const serves = PAGES[slot];
            li.innerHTML =
                `<span class="led"></span><span class="name">${slot}<small>${TIER[slot] ?? ""}</small>${serves ? PAGE_GLYPH : ""}</span><span class="meta"></span>`;
            if (serves) {
                li.classList.add("has-page");
                li.dataset.page = serves.page;
                li.dataset.what = serves.what;
                li.title = `${serves.what}: show the address of ${serves.page} as a code a phone can read`;
            }
            list.appendChild(li);
        }
        const led = li.querySelector(".led");
        const meta = li.querySelector(".meta");
        if (!names.includes(slot)) {
            led.className = "led";
            meta.className = "meta bad";
            meta.textContent = "not connected";
            continue;
        }
        try {
            const s = await session(slot);
            led.className = "led on";
            meta.className = "meta";
            meta.textContent = `${s.serverInfo?.version ?? ""}`;
        } catch (e) {
            led.className = "led wait";
            meta.className = "meta bad";
            meta.textContent = e.message.slice(0, 40);
        }
    }
    const up = EXPECTED.filter((s) => names.includes(s)).length;
    $("slot-note").textContent = `${up}/${EXPECTED.length} expected slots answer · polled every ${POLL_MS / 1000} s`;
}

/** What the station says first: hello, then a welcome the model phrases from the boot report (or the report itself, one fact per sentence). */
async function hello() {
    const w = (key, values = {}) => station.phrase(key, values);
    const up = EXPECTED.filter((s) => report.slots[s]);
    const facts = [
        w("hello.night"),
        w("hello.slots", { up: up.length, expected: EXPECTED.length, names: up.join(", ") }),
        report.missing.length ? w("hello.missing", { names: report.missing.join(", ") }) : w("hello.allConnected"),
        report.versions.scrubber ? w(report.versions.scrubber.includes("stub") ? "hello.scrubberStub" : "hello.scrubberReal") : "",
        report.reasoner ? w("hello.reasoner", { model: report.reasoner.model, family: report.reasoner.family, notReady: report.reasoner.ready ? "" : w("hello.reasoner.notReady") }) : "",
        report.voice ? w("hello.voice", { provider: report.voice.provider, model: report.voice.model && report.voice.model !== "none" ? w("hello.voice.model", { model: report.voice.model }) : "" }) : "",
        report.scenario?.events ? w("hello.scenario", { events: report.scenario.events }) : "",
    ].filter(Boolean);
    let welcome = null;
    if (report.reasoner?.ready) {
        voiceLine("composing the welcome from the boot report...", "info");
        const r = await call("reasoner", "compose", {
            instructions: w("hello.instructions"),
            context: facts.join("\n"),
            maxTokens: 200,
        });
        if (r.ok && r.output?.text) {
            welcome = String(r.output.text).replace(/\s+/g, " ").trim();
            voiceLine(`welcome by ${r.output.model} in ${r.output.latencyMs} ms, ${r.output.tokens?.total ?? "?"} tokens`, "info");
        } else voiceLine(`the model could not compose the welcome (${r.error ?? "no text"}); the station reads the report`, "info");
    }
    const text = `${w("hello.greeting")} ${welcome ?? facts.join(" ")}`;
    if (!report.slots.speech || !report.voice?.ready) {
        voiceLine(text);
        voiceLine("no voice engine: said in text only", "info");
        return;
    }
    const r = await call("speech", "say", { text, voice: "station", priority: "high" });
    if (!r.ok) voiceLine(`speech.say refused: ${r.error}`, "info");
}

/** The station says a sentence: the speech slot when it is ready (the line is written when it plays), the log otherwise. */
async function say(text, priority = "normal") {
    if (!report.slots.speech || !report.voice?.ready) {
        voiceLine(text);
        return;
    }
    const r = await call("speech", "say", { text, voice: "station", priority });
    if (!r.ok) voiceLine(`speech.say refused: ${r.error}`, "info");
}

// ── The factory: the night's telemetry, the request, the task followed ─────

const TASK_POLL_MS = 1000;
const boardStartedAt = Date.now();
const telemetry = [];
/** One sample of the board's state every `everySeconds` (the scenario's `factory.request.telemetry`): what the factory will be handed. */
async function sampleTelemetry() {
    const spec = report.scenario?.factory?.request?.telemetry ?? { keep: 1800 };
    const r = await call("scrubber", "motor.state", {});
    if (!r.ok || !r.output || typeof r.output !== "object") return;
    const st = r.output;
    telemetry.push({ t: Math.round((Date.now() - boardStartedAt) / 1000), co2Ppm: st.co2Ppm ?? null, co2State: st.co2State ?? null, speedPercent: st.speedPercent ?? null, currentAmps: st.currentAmps ?? null, power: st.power ?? null });
    while (telemetry.length > (spec.keep ?? 1800)) telemetry.shift();
}

let factoryTask = null;
/** Asks the factory for the monitor that is missing, with the request of the scenario and the telemetry sampled here, then follows the task. */
async function askFactory() {
    if (!words) {
        voiceLine("the factory slot gave this page no phrases (grammar://phrases): nothing to say", "info");
        return;
    }
    const w = (key, values = {}) => words.phrase(key, values);
    if (factoryTask) {
        voiceLine(w("board.busy", { taskId: factoryTask }), "info");
        return;
    }
    const req = report.scenario?.factory?.request;
    if (!req?.objective) {
        voiceLine(w("board.noRequest"), "info");
        return;
    }
    const last = telemetry.at(-1) ?? {};
    const spec = req.telemetry ?? { file: "telemetry.json" };
    await say(w("board.asking", { samples: telemetry.length }));
    const r = await call("factory", "request", {
        objective: req.objective,
        observations: { cabin: last, samples: telemetry.length, sampledEverySeconds: spec.everySeconds ?? null },
        data: [{ file: spec.file ?? "telemetry.json", columns: spec.columns ?? Object.keys(last), rows: telemetry }],
        topics: req.topics ?? "auto",
        requestedBy: "operator, control board",
    });
    if (!r.ok) {
        await say(w("board.refused", { error: r.error }));
        return;
    }
    factoryTask = r.output.taskId;
    voiceLine(w("board.opened", { taskId: factoryTask, builder: r.output.builder ?? "?", rows: telemetry.length }), "info");
    for (const b of document.querySelectorAll("#menu button")) b.classList.toggle("playing", b.dataset.intention === "factory");
    $("top-state").textContent = `FACTORY · ${factoryTask}`;
    $("top-state").classList.add("busy");
    let said = 0;
    const tick = async () => {
        const t = await call("factory", "task", { taskId: factoryTask });
        if (!t.ok) {
            voiceLine(w("board.taskError", { error: t.error }), "info");
            return false;
        }
        const status = t.output;
        const steps = Array.isArray(status.manifest?.steps) ? status.manifest.steps : [];
        for (; said < steps.length; said++) await say(stepSentence(words, steps[said]));
        $("top-state").textContent = `FACTORY · step ${steps.length}${status.run?.lastStage ? ` · ${status.run.lastStage}` : ""}`;
        if (status.state === "created" || status.state === "running") return true;
        // Normal priority: a high one would withdraw the step sentences still queued (high interrupts and goes first).
        await say(endSentence(words, status));
        return false;
    };
    while (await tick()) await sleep(TASK_POLL_MS);
    factoryTask = null;
    $("top-state").textContent = "IDLE";
    $("top-state").classList.remove("busy");
    for (const b of document.querySelectorAll("#menu button")) b.classList.remove("playing");
}

/**
 * The factory's own button, when there is a menu to put it in.
 *
 * There is not, on the control room: the SIMULATION panel it belonged to went
 * to the phone, and the night's events and the transport are the `agent`
 * slot's. So this does nothing here and the board's own factory order
 * (`askFactory`, which carries the telemetry this page sampled) is placed from
 * the factory's window instead. Kept because `panel.html` still builds a menu.
 */
function addFactoryButton() {
    const menu = $("menu");
    if (!menu || menu.querySelector("[data-intention='factory']")) return;
    const factory = document.createElement("button");
    factory.className = "btn";
    factory.dataset.intention = "factory";
    factory.innerHTML = `FACTORY<small>ask for the scrubber's monitor: the night's telemetry, the contract, the loop</small>`;
    factory.title = "the request of the scenario file (factory.request), with the telemetry sampled on this board";
    factory.addEventListener("click", () => void askFactory());
    menu.appendChild(factory);
}

/**
 * The agent's loop, in its own window, opened when the operator asks for it.
 * The control room's middle belongs to the cabin and the scrubber; the loop
 * embedded there competed with the machine for it. Until the window is opened
 * the loop is not running, so the SIMULATION menu has no events to offer and
 * says so rather than showing buttons that would do nothing.
 *
 * The window is named, so asking twice reuses it.
 */
let loopWindow = null;
let loopUrl = LOOP_URL;
function openLoopWindow(url = loopUrl) {
    const width = Math.floor(screen.availWidth / 2);
    const features = `popup=yes,width=${width},height=${Math.floor(screen.availHeight / 2)},left=${screen.availLeft + width},top=${screen.availTop + Math.floor(screen.availHeight / 2)}`;
    loopWindow = window.open(url, "agent", features);
    voiceLine(loopWindow ? "agent: its loop opened in its own window" : "agent: the browser did not open its window; the loop is not running", "info");
    return loopWindow;
}
/**
 * The studio, when it is open, is a view of the agent and no longer its
 * driver: the loop runs in the `agent` slot. What is still sent to it is the
 * world, so the graph it draws lights up on the same events; what it says back
 * is ignored here, because the state of the night is the slot's and two
 * writers on one clock is one too many.
 */
const send = (payload) => loopWindow?.postMessage({ type: "tier3", ...payload }, location.origin);

async function main() {
    try {
        await boot();
    } catch (e) {
        await line("fail", `boot: ${e.message}`);
        $("boot-prompt").hidden = false;
        await new Promise((resolve) => addEventListener("keydown", resolve, { once: true }));
    }
    // The key press is the gesture: the board plays the station from here on, and the factory's window opens.
    audio.enable();
    $("btn-sound").textContent = "SOUND ON";
    $("boot").classList.add("fade");
    $("board").hidden = false;
    setTimeout(() => $("boot").remove(), 700);

    if (report.reasoner) $("top-reasoner").textContent = `${report.reasoner.model ?? "?"}${report.reasoner.ready ? "" : " · no key"}`;
    if (report.voice) $("top-voice").textContent = `${report.voice.provider ?? "?"}${report.voice.ready ? "" : " · not ready"}`;

    await renderSlots();
    setInterval(() => void renderSlots(), POLL_MS);
    for (const [slot, keep] of [
        ["factory", (loaded) => (words = loaded.words)],
        ["station", (loaded) => (station = loaded.words)],
    ]) {
        try {
            const loaded = await loadWords(await session(slot));
            keep(loaded);
            voiceLine(`${slot} words: wording ${loaded.grammar ?? "?"}, ${loaded.words.listPhrases().length} phrases`, "info");
        } catch (e) {
            voiceLine(`${slot} words: ${e.message}`, "info");
        }
    }
    void sampleTelemetry();
    setInterval(() => void sampleTelemetry(), (report.scenario?.factory?.request?.telemetry?.everySeconds ?? 2) * 1000);

    // The loop: the model when the reasoner is ready, the scripted agent otherwise (said on the board).
    // The loop's address is settled here and the window is opened on demand.
    const scripted = !report.reasoner?.ready;
    loopUrl = `${LOOP_URL}${scripted ? "&llm=0&script=prudent" : ""}`;
    $("centre-note").textContent = scripted ? "scripted agent" : "the model decides";
    $("btn-agent")?.addEventListener("click", () => openLoopWindow());
    $("btn-factory")?.addEventListener("click", () => openFactoryWindow());

    $("btn-sound").addEventListener("click", () => {
        if (audio.enabled) {
            audio.disable();
            $("btn-sound").textContent = "SOUND OFF";
        } else {
            audio.enable();
            $("btn-sound").textContent = "SOUND ON";
        }
    });
    // `reset` is the agent's transport and lives with the rest of it in
    // app.js; this page only adds the factory's order to the panel.
    addFactoryButton();

    await hello();
}

void main();
