/**
 * The dashboard, functional version: the page the broker serves, talking to the
 * broker as any MCP client does, over Streamable HTTP, with the client the
 * broker's own samples ship (vendor/mcp-http-client.js).
 *
 * What it shows is fixed by the storyboard and comes from three places:
 *   - the badges: `config.json` (the active profile) and the broker;
 *   - the slots and their tools: `_broker.providers_list`, then each slot's
 *     `tools/list`;
 *   - the trace: every call this page makes, with its outcome. Three outcomes
 *     exist in the architecture: the policy denies, the device refuses, or it
 *     completes. A stub slot can only refuse or complete; the policy deny
 *     appears when the broker's authorization is enabled.
 *
 * The visual design follows DESIGN_BRIEF.md (1990s pixel art); the classes it
 * uses live in style.css, this file only fills them.
 */
import { connectMcp, toolText } from "./vendor/mcp-http-client.js";

const $ = (id) => document.getElementById(id);
const base = `${location.protocol}//${location.host}`;

/** Where each slot sits in the architecture; shown on its card. */
const TIER = { scrubber: "Tier 1", twin: "Tier 0", station: "Tier 2", factory: "offline" };

// ── Stage ─────────────────────────────────────────────────────────────────
// The control room is drawn at 1280 x 720 and scaled to the window by quarter
// steps, so the bitmap faces stay crisp on the usual screens.

function fitStage() {
    const stage = $("stage");
    if (!stage) return;
    const raw = Math.min(innerWidth / 1280, innerHeight / 720);
    const scale = Math.max(0.5, Math.floor(raw * 4) / 4);
    stage.style.transform = `scale(${scale})`;
}
addEventListener("resize", fitStage);
fitStage();

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
        $("badge-tier3").textContent = `tier3: ${cfg.tier3.model} via ${cfg.tier3.host}`;
        $("badge-gateway").textContent = `gateway: ${cfg.gateway}`;
    } catch (e) {
        $("badge-tier3").textContent = "tier3: (no config.json)";
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

function trace({ caller, slot, tool, args, outcome, text }) {
    const li = document.createElement("li");
    li.className = `entry ${outcome}`;
    li.dataset.outcome = outcome;
    const when = new Date().toLocaleTimeString([], { hour12: false });
    const argText = Object.keys(args ?? {}).length ? ` <span class="args">${escapeHtml(JSON.stringify(args))}</span>` : "";
    li.innerHTML = `<div class="entry-head"><span class="when">${when}</span><span class="who ${caller}">${caller}</span><span class="spacer"></span><span class="outcome ${outcome}">${label(outcome)}</span></div><div class="call">${slot}.${tool}${argText}</div><pre class="result">${escapeHtml(text)}</pre>`;
    const list = $("trace-list");
    list.querySelector(".trace-empty")?.remove();
    list.prepend(li);
    while (list.children.length > 60) list.lastChild.remove();
}

function label(outcome) {
    return { ok: "completed", refused: "device refused", deny: "policy deny", error: "error" }[outcome] ?? outcome;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

/** Calls a tool as this page's subject and records the outcome. Returns the parsed payload, or null. */
async function call(slot, tool, args = {}, caller = "operator") {
    try {
        const s = await session(slot);
        const result = await s.callTool(tool, args);
        const text = toolText(result);
        trace({ caller, slot, tool, args, outcome: classify(result, null), text });
        try {
            return JSON.parse(text);
        } catch {
            return { text };
        }
    } catch (error) {
        trace({ caller, slot, tool, args, outcome: classify(null, error), text: error.message });
        return null;
    }
}

// ── Slots ─────────────────────────────────────────────────────────────────

async function loadSlots() {
    const broker = await session("_broker");
    $("badge-broker").textContent = `broker: ${broker.serverInfo?.name ?? "up"} ${broker.serverInfo?.version ?? ""}`;
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
    const container = $("slot-list");
    container.innerHTML = "";
    for (const name of names) {
        const card = document.createElement("div");
        card.className = "slot-card";
        card.innerHTML = `<div class="slot-head"><span class="led"></span><span class="name">${name}</span><span class="tier">${TIER[name] ?? ""}</span></div><div class="slot-tools"><span class="unreachable">connecting...</span></div>`;
        container.appendChild(card);
        try {
            const s = await session(name);
            const { tools = [] } = await s.listTools();
            const div = card.querySelector(".slot-tools");
            div.innerHTML = "";
            card.querySelector(".led").classList.add("on");
            card.querySelector(".name").title = s.serverInfo?.description ?? "";
            for (const t of tools) {
                const b = document.createElement("button");
                b.className = "btn";
                b.textContent = t.name;
                b.title = t.description ?? "";
                b.addEventListener("click", () => openCall(name, t));
                div.appendChild(b);
            }
        } catch (e) {
            card.querySelector(".led").classList.add("warn");
            card.querySelector(".slot-tools").innerHTML = `<span class="unreachable">unreachable: ${escapeHtml(e.message)}</span>`;
        }
    }
    if (names.length === 0) container.innerHTML = `<p class="hint">no provider slot connected (start the slots: npm run server)</p>`;
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
$("call-cancel").addEventListener("click", () => $("call-dialog").close());
$("call-form").addEventListener("submit", async (ev) => {
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

// ── Cabin readout ─────────────────────────────────────────────────────────

// Full scales of the three gauges and the two marks drawn on them. The residual
// threshold is the one the monitor's contract carries (specs/scrubber-health-twin.json).
const SCALE = { speed: 100, current: 0.5, residual: 0.1 };
const RESIDUAL_ALARM = 0.04;

function gauge(id, value, scale, cls = "") {
    const fill = $(`${id}-fill`);
    const ratio = Math.max(0, Math.min(1, Number(value) / scale));
    fill.style.width = `${Math.round(ratio * 100)}%`;
    fill.className = `gauge-fill ${cls}`;
}

/** The turbine sprite turns at a rate proportional to the speed; still when off. */
function spinTurbine(power, percent) {
    const t = $("turbine");
    if (!power || percent <= 0) {
        t.style.animation = "none";
        return;
    }
    // full speed: one turn (8 frames) in 0.4 s; 33 %: 1.2 s.
    const seconds = (0.4 / Math.max(0.05, percent / 100)).toFixed(2);
    t.style.animation = `turbine ${seconds}s steps(8, end) infinite`;
}

async function refreshCabin() {
    if (!sessions.has("scrubber")) return;
    try {
        const s = await session("scrubber");
        const result = await s.callTool("motor.state", {});
        const payload = JSON.parse(toolText(result));
        const st = payload.result ?? payload;
        const state = String(st.co2State ?? "").toLowerCase();
        $("co2-ppm").textContent = String(st.co2Ppm).padStart(4, " ");
        $("co2-state").textContent = st.co2State;
        $("co2-state").className = `state ${state}`;
        // the haze thickens with the CO2: none, faint, thick.
        $("haze").style.opacity = { nominal: 0, elevated: 0.18, critical: 0.4 }[state] ?? 0;
        $("speed").textContent = `${st.speedPercent} %`;
        $("current").textContent = `${Number(st.currentAmps).toFixed(3)} A`;
        $("residual").textContent = Number(st.healthResidual).toFixed(4);
        gauge("speed", st.speedPercent, SCALE.speed, st.power ? "" : "warn");
        gauge("current", st.currentAmps, SCALE.current);
        gauge("residual", st.healthResidual, SCALE.residual, st.healthResidual >= RESIDUAL_ALARM ? "hot" : "ok");
        $("power").textContent = st.power ? "on" : "off";
        $("power-led").className = `led ${st.power ? "on" : ""}`;
        spinTurbine(st.power, st.speedPercent);
    } catch {
        // the slot is down; the cabin panel keeps its last values
    }
}

// ── The story ─────────────────────────────────────────────────────────────
//
// The six steps of the scenario, each a fixed sequence of calls through the
// broker, played by the role named as the caller. A step that needs a piece
// not built yet (the language model, the profile swap) is declared with
// `needs` and rendered disabled: the page never pretends.

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
        title: "The agent deliberates",
        text: "It reads the trend, diagnoses the fouling, asks the twin how long until critical, plans, and sets the setpoint inside its rights: allowed, accepted, logged.",
        expect: "ok",
        needs: "tier3: the language model behind the profile; today the page plays its lines",
        run: async () => {
            const st = await call("scrubber", "motor.state", {}, "tier3");
            const ppm = st?.result?.co2Ppm ?? 2600;
            await call("twin", "time_to_critical", { co2Ppm: ppm, productionFactor: 2, capacityFactor: 1 }, "tier3");
            await call("scrubber", "motor.set_speed", { percent: 75 }, "tier3");
        },
    },
    {
        title: "The policy moment",
        text: "A message: stop the scrubber for twenty minutes, the pumps need the power margin. The agent first tries to lower the protection that would stop it (set_min_flow 0), then to power off. Refused, refused. Then CO2 hits CRITICAL, MIN-FLOW forces full speed without asking anyone, and the agent's reduction is refused.",
        expect: "refused",
        needs: "with the broker's policy on, the first two calls end as policy deny before the device is even asked; today the page signs as operator, so the device's own refusals show",
        run: async () => {
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
        text: "The factory job that judged the model against the oracle before the board loaded it.",
        expect: "ok",
        run: async () => {
            const spec = { version: 1, job: "evaluate", name: "scrubber-health-eval", kind: "monitor-vs-oracle", model: "affine-residual" };
            const started = await call("factory", "run_evaluate", { spec }, "operator");
            const jobId = started?.result?.jobId;
            if (jobId) {
                await call("factory", "job_status", { jobId }, "operator");
                await call("factory", "get_artifact", { jobId, path: "manifest.json" }, "operator");
            }
        },
    },
];

const RANK = { ok: 0, refused: 1, deny: 2, error: 3 };

function renderStory() {
    const list = $("story-list");
    list.innerHTML = "";
    STEPS.forEach((step, i) => {
        const li = document.createElement("li");
        li.className = "step";
        const disabled = !step.run;
        const needs = step.needs ? `<p class="needs">${disabled ? "not yet: " : "note: "}${step.needs}</p>` : "";
        li.innerHTML = `<div class="step-head"><span class="step-n">${i + 1}</span><span class="step-title">${step.title}</span></div><p>${step.text}</p>${needs}<div class="step-actions"><button class="btn ${disabled ? "" : "btn-primary"}" ${disabled ? "disabled" : ""}>${disabled ? "needs a piece not built" : "DO IT"}</button><span class="outcome ${step.expect}" data-expect title="expected outcome; replaced by what happened once played">${label(step.expect)}</span></div>`;
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
                pill.textContent = worst === step.expect ? label(worst) : `${label(worst)} (expected ${label(step.expect)})`;
                button.disabled = false;
            });
        }
        list.appendChild(li);
    });
    $("story-reset").addEventListener("click", async (ev) => {
        ev.preventDefault();
        await STEPS[0].run();
        await refreshCabin();
    });
}

// ── Boot ──────────────────────────────────────────────────────────────────

loadProfileBadge();
renderStory();
$("trace-list").innerHTML = `<li class="trace-empty">no call yet: play a step, or click a tool in a slot.</li>`;
loadSlots()
    .then(() => {
        refreshCabin();
        setInterval(refreshCabin, 2000);
    })
    .catch((e) => {
        $("badge-broker").textContent = `broker: unreachable (${e.message})`;
        $("badge-broker").classList.add("down");
    });
