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
        onPlay: (u) => voiceLine(u.text, "now"),
        onError: (m) => voiceLine(`audio: ${m}`, "info"),
        onTakenElsewhere: (u) => voiceLine(`said by another page (a second board is open?): ${u.text.slice(0, 60)}...`, "info"),
    },
);

/**
 * The factory's own window (decision of 2026-09-21), opened from the key
 * press that ends the boot (a browser opens a window on a gesture only), on
 * the right half of the screen so it does not cover the board: a fully
 * covered window is treated as hidden by the browser, its timers slow down,
 * and the board is the audio output. `?factory=0` keeps it closed; the
 * window is named, so a second boot reuses it.
 */
function openFactoryWindow() {
    if (new URLSearchParams(location.search).get("factory") === "0") return null;
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
            li.innerHTML = `<span class="led"></span><span class="name">${slot}<small>${TIER[slot] ?? ""}</small></span><span class="meta"></span>`;
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
    for (const b of $("menu").querySelectorAll("button")) b.classList.toggle("playing", b.dataset.intention === "factory");
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
    for (const b of $("menu").querySelectorAll("button")) b.classList.remove("playing");
}

function buildMenu(events) {
    const menu = $("menu");
    menu.innerHTML = "";
    for (const e of events) {
        const b = document.createElement("button");
        b.className = "btn";
        b.dataset.intention = e.intention;
        b.innerHTML = `${e.intention.toUpperCase()}<small>minute ${e.at} · ${(e.message ?? "").slice(0, 60)}${(e.message ?? "").length > 60 ? "..." : ""}</small>`;
        b.title = e.message ?? "";
        b.addEventListener("click", () => send({ cmd: "play", intention: e.intention }));
        menu.appendChild(b);
    }
    const all = document.createElement("button");
    all.className = "btn";
    all.dataset.intention = "all";
    all.innerHTML = `ALL<small>the whole night, event after event</small>`;
    all.addEventListener("click", () => send({ cmd: "all" }));
    menu.appendChild(all);
    const factory = document.createElement("button");
    factory.className = "btn";
    factory.dataset.intention = "factory";
    factory.innerHTML = `FACTORY<small>ask for the scrubber's monitor: the night's telemetry, the contract, the loop</small>`;
    factory.title = "the request of the scenario file (factory.request), with the telemetry sampled on this board";
    factory.addEventListener("click", () => void askFactory());
    menu.appendChild(factory);
}

const loop = $("loop");
const send = (payload) => loop.contentWindow?.postMessage({ type: "tier3", ...payload }, location.origin);
addEventListener("message", (m) => {
    if (m.origin !== location.origin || m.data?.type !== "tier3") return;
    const d = m.data;
    if (d.status === "ready") {
        buildMenu(d.events ?? []);
        $("centre-note").textContent = "ready";
    } else if (d.status === "event") {
        $("top-clock").textContent = `NIGHT 9 · MIN ${d.at}`;
        $("top-state").textContent = `EVENT · ${d.intention}`;
        $("top-state").classList.add("busy");
        for (const b of $("menu").querySelectorAll("button")) b.classList.toggle("playing", b.dataset.intention === d.intention);
    } else if (d.status === "done" || d.status === "reset") {
        $("top-state").textContent = "IDLE";
        $("top-state").classList.remove("busy");
        for (const b of $("menu").querySelectorAll("button")) b.classList.remove("playing");
    }
});

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
    openFactoryWindow();
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
    const scripted = !report.reasoner?.ready;
    loop.src = `${LOOP_URL}${scripted ? "&llm=0&script=prudent" : ""}`;
    $("centre-note").textContent = scripted ? "scripted agent (the reasoner is not ready)" : `reasoner: ${report.reasoner.model}`;

    $("btn-sound").addEventListener("click", () => {
        if (audio.enabled) {
            audio.disable();
            $("btn-sound").textContent = "SOUND OFF";
        } else {
            audio.enable();
            $("btn-sound").textContent = "SOUND ON";
        }
    });
    $("btn-reset").addEventListener("click", () => send({ cmd: "reset" }));

    await hello();
}

void main();
