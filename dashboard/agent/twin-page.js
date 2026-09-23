// harness/lib/mcp-http.ts
var PROTOCOL_VERSION = "2025-06-18";
var McpRpcError = class extends Error {
  constructor(message, rpc) {
    super(message);
    this.rpc = rpc;
    this.name = "McpRpcError";
  }
};
async function readFrame(response) {
  const text = await response.text();
  if (!text.trim()) return void 0;
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/event-stream")) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`expected JSON from ${response.url} but got ${type || "no content-type"}: ${text.slice(0, 300)}`);
    }
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    const frame = JSON.parse(payload);
    if (frame.id !== void 0) return frame;
  }
  return void 0;
}
async function connectMcp(baseUrl, slot, identity, extraHeaders = {}) {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/${slot}/mcp`;
  const post = async (body, sessionId2) => {
    const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...extraHeaders };
    if (sessionId2) headers["Mcp-Session-Id"] = sessionId2;
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`${endpoint} answered HTTP ${response.status} ${response.statusText}. ${text.slice(0, 400)}`);
    }
    return response;
  };
  const capabilities = identity.locale ? { locale: identity.locale } : {};
  const initResponse = await post(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities, clientInfo: { name: identity.name, version: identity.version } } },
    null
  );
  const sessionId = initResponse.headers.get("mcp-session-id");
  const init = await readFrame(initResponse);
  if (init?.error) throw new McpRpcError(`initialize on slot "${slot}" was refused: ${init.error.message} (code ${init.error.code})`, init.error);
  const initResult = init?.result ?? {};
  await post({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId).catch(() => void 0);
  let nextId = 2;
  const request = async (method, params = {}) => {
    const response = await post({ jsonrpc: "2.0", id: nextId++, method, params }, sessionId);
    const frame = await readFrame(response);
    if (frame?.error) throw new McpRpcError(`${method} on slot "${slot}" failed: ${frame.error.message} (code ${frame.error.code})`, frame.error);
    return frame?.result;
  };
  return {
    endpoint,
    slot,
    sessionId,
    serverInfo: initResult.serverInfo,
    instructions: initResult.instructions,
    grammar: typeof initResult._meta?.grammar === "string" ? initResult._meta.grammar : null,
    request,
    listTools: async () => (await request("tools/list", {})).tools ?? [],
    callTool: (name, args = {}) => request("tools/call", { name, arguments: args }),
    /** Ends the session. The broker frees it; skipping this only leaks a session. */
    close: async () => {
      await fetch(endpoint, { method: "DELETE", headers: sessionId ? { "Mcp-Session-Id": sessionId, ...extraHeaders } : extraHeaders }).catch(() => void 0);
    }
  };
}
function toolText(result) {
  return (result?.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
}
function grammarOf(session) {
  if (!session || typeof session === "string") return null;
  return session.grammar ?? null;
}

// harness/lib/broker.ts
var Broker = class {
  /**
   * @param base      http://host:port of the broker
   * @param identity  the agent as the slots see it: `clientInfo.name` (its family) and locale
   * @param headers   e.g. { Authorization: "Bearer <tier3 token>" } when the policy is on
   */
  constructor(base, identity, headers = {}) {
    this.base = base;
    this.identity = identity;
    this.headers = headers;
  }
  sessions = /* @__PURE__ */ new Map();
  session(slot) {
    let s = this.sessions.get(slot);
    if (!s) {
      s = connectMcp(this.base, slot, this.identity, this.headers);
      this.sessions.set(slot, s);
    }
    return s;
  }
  /** What each opened slot answered at `initialize`. */
  async describeSessions() {
    const out = [];
    for (const [slot, p] of this.sessions) {
      const s = await p;
      out.push({ slot, serverInfo: s.serverInfo, instructions: s.instructions, grammar: grammarOf(s) });
    }
    return out;
  }
  /** Provider slots the broker lists (the reserved `_all` and `_broker` excluded). */
  async slots() {
    const broker = await this.session("_broker");
    const listed = await broker.callTool("providers_list", {});
    let providers;
    try {
      providers = JSON.parse(toolText(listed));
    } catch {
      providers = [];
    }
    const list = Array.isArray(providers) ? providers : providers?.providers ?? [];
    return list.map((p) => typeof p === "string" ? p : p.name).filter((n) => n && !n.startsWith("_"));
  }
  /** The tools of one slot, as `tools/list` reports them to this identity. */
  async tools(slot) {
    return (await this.session(slot)).listTools();
  }
  /** Calls a tool and classifies the answer. Never throws for a refusal or a deny: those are results the agent must see and the trace must keep. */
  async call(slot, tool, args = {}) {
    try {
      const s = await this.session(slot);
      const result = await s.callTool(tool, args);
      const text = toolText(result);
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { text };
      }
      if (result?.isError) {
        const reason = payload?.refused ?? payload?.error ?? text;
        return { ok: false, outcome: "refused", error: `device refused: ${String(reason)}`, output: payload };
      }
      return { ok: true, outcome: "completed", output: payload && "result" in payload ? payload.result : payload };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof McpRpcError ? error.rpc.code : void 0;
      if (code === -32001 || /forbidden|not allowed|unauthori[sz]ed/i.test(message)) return { ok: false, outcome: "deny", error: `policy deny: ${message}` };
      return { ok: false, outcome: "error", error: `error: ${message}` };
    }
  }
  async close() {
    for (const p of this.sessions.values()) {
      try {
        await (await p).close();
      } catch {
      }
    }
    this.sessions.clear();
  }
};

// harness/browser/studio-loop.ts
var LOOP_STYLE = `
.hx-bar { display: flex; align-items: center; gap: 8px; }
.hx-title { font: 11px/1 var(--ne-font-mono, ui-monospace, Consolas, monospace); letter-spacing: 0.14em; color: var(--ne-color-text-muted, #8a8a9a); margin-right: 4px; }
.hx-badge { font: 11px/1 var(--ne-font-mono, ui-monospace, Consolas, monospace); letter-spacing: 0.06em; color: #75e2ba; white-space: nowrap; padding: 0 6px; }
.hx-badge.warn { color: #f0b06a; }
.hx-threshold { width: 58px; padding-left: 4px; padding-right: 0; }
.ne-node.hx-lit { box-shadow: 0 0 0 3px #75e2ba, 0 0 28px 8px rgba(117, 226, 186, 0.6) !important; transition: box-shadow 120ms; }
.ne-node.hx-lit .ne-node-header { background: #1f8a62 !important; color: #ffffff !important; }
.ne-node.hx-done { box-shadow: 0 0 0 2px #3fb08a !important; }
.ne-node.hx-done .ne-node-header { background: #234a3c !important; }
.ne-node.hx-failed { box-shadow: 0 0 0 3px #e0574a, 0 0 28px 8px rgba(224, 87, 74, 0.6) !important; }
.ne-node.hx-failed .ne-node-header { background: #8a2f27 !important; color: #ffffff !important; }
.hx-link-done { stroke: #75e2ba !important; stroke-width: 3px !important; }
`;
function installLoopStyle(extra = "") {
  const style = document.createElement("style");
  style.textContent = LOOP_STYLE + extra;
  document.head.appendChild(style);
}
function disableStudioPlayer(reason) {
  for (const player of document.querySelectorAll(".nev2-player")) {
    player.classList.add("is-disabled");
    player.title = reason;
  }
}
function createBar(title) {
  const bar = document.createElement("div");
  bar.className = "hx-bar";
  const titleEl = document.createElement("span");
  titleEl.className = "hx-title";
  titleEl.textContent = title;
  bar.appendChild(titleEl);
  const badge = document.createElement("span");
  badge.className = "hx-badge";
  const select = (title2, options, selected) => {
    const sel = document.createElement("select");
    sel.className = "nev2-tb-select";
    sel.title = title2;
    for (const [value, label] of options) {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      if (value === selected) o.selected = true;
      sel.appendChild(o);
    }
    bar.appendChild(sel);
    return sel;
  };
  const button = (label, title2, onClick) => {
    const b = document.createElement("button");
    b.className = "nev2-tb-btn";
    b.textContent = label;
    b.title = title2;
    b.addEventListener("click", () => void onClick());
    bar.appendChild(b);
    return b;
  };
  const numberInput = (title2, value, step) => {
    const input = document.createElement("input");
    input.type = "number";
    input.className = "nev2-tb-select hx-threshold";
    input.min = "0";
    input.step = String(step);
    input.value = String(value);
    input.title = title2;
    bar.appendChild(input);
    return input;
  };
  return { bar, badge, select, button, numberInput };
}

// harness/browser/room-skin.ts
var ROOM_SKIN_NAME = "control_room";
var TEAL = "#2fe0c8";
var TEAL_SOFT = "#7ad6cc";
var AMBER = "#ffb648";
var RED = "#ff5064";
var MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';
var SANS = 'ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif';
var S = `.ne-skin-${ROOM_SKIN_NAME}`;
var ROOM_STYLE = `
${S} #viewer {
    background:
        radial-gradient(1200px 700px at 55% 16%, rgba(47, 224, 200, 0.10), transparent 60%),
        linear-gradient(180deg, #061218, #04090c 62%) !important;
}
${S} * { scrollbar-width: thin; scrollbar-color: rgba(47, 224, 200, 0.28) transparent; }
${S} .hx-title { color: ${TEAL_SOFT}; letter-spacing: 0.18em; }
${S} .hx-badge { color: ${TEAL}; }
${S} .hx-badge.warn { color: ${AMBER}; }
${S} .ne-node { border-radius: 10px; }
${S} .ne-node.hx-lit { box-shadow: 0 0 0 2px ${TEAL}, 0 0 30px 6px rgba(47, 224, 200, 0.45) !important; }
${S} .ne-node.hx-lit .ne-node-header { background: ${TEAL} !important; color: #03181a !important; }
${S} .ne-node.hx-done { box-shadow: 0 0 0 1px rgba(64, 214, 200, 0.55) !important; }
${S} .ne-node.hx-done .ne-node-header { background: rgba(47, 224, 200, 0.16) !important; color: ${TEAL_SOFT} !important; }
${S} .ne-node.hx-failed { box-shadow: 0 0 0 2px ${RED}, 0 0 30px 6px rgba(255, 80, 100, 0.45) !important; }
${S} .ne-node.hx-failed .ne-node-header { background: ${RED} !important; color: #1a0306 !important; }
${S} .hx-link-done { stroke: ${TEAL} !important; stroke-width: 2.5px !important; filter: drop-shadow(0 0 4px rgba(47, 224, 200, 0.6)); }

${S} .hm { font-family: ${MONO}; color: #d3ecea; background: linear-gradient(180deg, #061218, #04090c); gap: 12px; }
${S} .hm-side { border-left: 1px solid rgba(64, 214, 200, 0.16); }
${S} .hm-intention { color: #d3ecea; font-weight: 600; letter-spacing: 0.2em; }
${S} .hm-meta, ${S} .hm-card-head .src, ${S} .hm-step .s { color: #6d908e; }
${S} .hm-desc, ${S} .hm-card-desc, ${S} .hm-card .input, ${S} .hm-card .why { color: #9dbcb9; font-family: ${SANS}; }
${S} .hm-card { border: 1px solid rgba(64, 214, 200, 0.16); background: rgba(10, 28, 34, 0.66); border-radius: 10px; }
${S} .hm-card.event { background: rgba(255, 182, 72, 0.04); }
${S} .hm-card-head { background: rgba(47, 224, 200, 0.05); border-left: 3px solid rgba(64, 214, 200, 0.34); }
${S} .hm-card.live .hm-card-head { background: rgba(47, 224, 200, 0.12); border-left-color: ${TEAL}; box-shadow: inset 0 0 0 1px rgba(64, 214, 200, 0.34); }
${S} .hm-card.event .hm-card-head { background: rgba(255, 182, 72, 0.08); border-left-color: ${AMBER}; }
${S} .hm-card-head.failed { background: rgba(255, 80, 100, 0.10); border-left-color: ${RED}; }
${S} .hm-card-head.idle { background: transparent; border-left-color: #4d6f6e; }
${S} .hm-card-head .title { color: #d3ecea; font-weight: 600; }
${S} .hm-card-head .title.warn, ${S} .hm-step.warn { color: ${AMBER}; }
${S} .hm-card-head .title.error, ${S} .hm-step.error { color: #ff8a98; }
${S} .hm-card-head.idle .title { color: #6d908e; }
${S} .hm-card.event .hm-card-head .title, ${S} .hm-card.event .hm-card-head .idx, ${S} .hm-card-head .src.policy { color: ${AMBER}; }
${S} .hm-card-head .idx, ${S} .hm-step .n { color: ${TEAL}; }
${S} .hm-card-head .cap { color: #effffd; }
${S} .hm-card-head .when, ${S} .hm-card-head .fold { color: #4d6f6e; }
${S} .hm-step { color: #b9d6d3; }
${S} .hm-step.current { background: rgba(47, 224, 200, 0.08); }
${S} .hm-card .call { background: rgba(0, 0, 0, 0.28); border-left: 2px solid rgba(64, 214, 200, 0.34); border-radius: 0 6px 6px 0; color: #b9d6d3; }
${S} .hm-card .call .tag { color: ${TEAL_SOFT}; }
${S} .hm-card .call.refused { border-left-color: ${AMBER}; }
${S} .hm-card .call.refused .tag { color: ${AMBER}; }
${S} .hm-card .call.deny, ${S} .hm-card .call.error { border-left-color: ${RED}; }
${S} .hm-card .call.deny .tag, ${S} .hm-card .call.error .tag { color: #ff8a98; }
${S} .hm-outcome { border-radius: 999px; padding: 3px 10px; font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; border: 1px solid rgba(64, 214, 200, 0.16); background: rgba(120, 170, 168, 0.07); color: #6d908e; }
${S} .hm-outcome.completed { color: ${TEAL}; border-color: rgba(64, 214, 200, 0.34); background: rgba(47, 224, 200, 0.09); }
${S} .hm-outcome.refused { color: ${AMBER}; border-color: rgba(255, 182, 72, 0.42); background: rgba(255, 182, 72, 0.09); }
${S} .hm-outcome.deny, ${S} .hm-outcome.error { color: ${RED}; border-color: rgba(255, 80, 100, 0.45); background: rgba(255, 80, 100, 0.10); }
${S} .hm-outcome.stopped { color: #c9a6ff; border-color: rgba(201, 166, 255, 0.4); background: rgba(201, 166, 255, 0.08); }
${S} .hm-outcome.report, ${S} .hm-outcome.ask { color: ${TEAL_SOFT}; border-color: rgba(122, 214, 204, 0.4); background: rgba(122, 214, 204, 0.07); }
${S} .hm-side-title { font-size: 10.5px; font-weight: 600; letter-spacing: 0.18em; color: ${TEAL_SOFT}; }
${S} .hm-values { font-weight: 600; }
${S} .hm-values small { font-size: 8.5px; letter-spacing: 0.14em; text-transform: uppercase; color: #4d6f6e; }
${S} .hm-canvas { background: transparent; border: none; border-bottom: 1px solid rgba(64, 214, 200, 0.16); }
${S} .hm-line { border-bottom: 1px solid rgba(64, 214, 200, 0.08); color: #b9d6d3; }
${S} .hm-line .tag { color: #4d6f6e; }
${S} .hm-line.crew .tag { color: ${TEAL_SOFT}; }
${S} .hm-line.ask .tag, ${S} .hm-line.refusal .tag { color: ${AMBER}; }
${S} .hm-line.error .tag { color: #ff8a98; }
`;
var ROOM_COLORS = { teal: TEAL, tealSoft: TEAL_SOFT, amber: AMBER, red: RED };

// harness/browser/pushes.ts
function watchSlot(base, slot, onUpdate, onState = () => void 0) {
  const source = new EventSource(`${base.replace(/\/+$/u, "")}/${encodeURIComponent(slot)}/sse`);
  let open = false;
  const setOpen = (value) => {
    if (value === open) return;
    open = value;
    onState(value);
  };
  source.onopen = () => setOpen(true);
  source.onerror = () => setOpen(false);
  source.onmessage = (m) => {
    let frame;
    try {
      frame = JSON.parse(m.data);
    } catch {
      return;
    }
    if (frame.method !== "notifications/resources/updated" || typeof frame.params?.uri !== "string") return;
    const meta = frame.params._meta && typeof frame.params._meta === "object" ? frame.params._meta : {};
    onUpdate({ uri: frame.params.uri, meta });
  };
  return {
    close: () => {
      source.close();
      setOpen(false);
    },
    get open() {
      return open;
    }
  };
}

// harness/browser/twin-plots.ts
var NOTES_LABEL = "Twin: the question";
var PLOTS = [
  { id: "plot-co2", label: "Plot: cabin CO2", title: "cabin CO2 (ppm)", from: { node: "cabin", port: "co2Ppm" }, column: 1, color: ROOM_COLORS.teal, at: { x: 1240, y: 340 }, tile: { x: 3, w: 3 } },
  { id: "plot-rate", label: "Plot: removal rate", title: "removal rate (/min)", from: { node: "scrubber", port: "effectiveRate" }, column: 3, color: ROOM_COLORS.tealSoft, at: { x: 1240, y: 200 }, tile: { x: 6, w: 2 } },
  { id: "plot-power", label: "Plot: scrubber power", title: "scrubber power (W)", from: { node: "scrubber", port: "power" }, column: 4, color: ROOM_COLORS.amber, at: { x: 1240, y: 60 }, tile: { x: 8, w: 2 } },
  { id: "plot-reserve", label: "Plot: night reserve", title: "night reserve (%)", from: { node: "battery", port: "stateOfChargePercent" }, column: 5, color: ROOM_COLORS.tealSoft, at: { x: 1240, y: -100 }, tile: { x: 10, w: 2 } }
];

// harness/browser/twin-page.ts
var SOURCE = "twin";
var RUNS_URI = "twin://runs";
var META_RUN = "spikypanda/run";
var MINUTE = 0;
var CO2 = 1;
var RATE = 3;
var POWER = 4;
var SOC = 5;
var STYLE = `
.tw-val { margin: 2px 10px 8px; padding: 3px 8px; border-radius: 6px; font: 600 11px/1.3 ui-monospace, "Cascadia Mono", Consolas, monospace; color: ${ROOM_COLORS.teal};
    background: rgba(47, 224, 200, 0.08); border: 1px solid rgba(64, 214, 200, 0.22); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tw-val:empty { display: none; }
.ne-node.tw-nominal .ne-node-header { background: rgba(47, 224, 200, 0.22) !important; color: #effffd !important; }
.ne-node.tw-elevated { box-shadow: 0 0 0 2px ${ROOM_COLORS.amber}, 0 0 26px 4px rgba(255, 182, 72, 0.4) !important; }
.ne-node.tw-elevated .ne-node-header { background: ${ROOM_COLORS.amber} !important; color: #1a1003 !important; }
.ne-node.tw-critical { box-shadow: 0 0 0 2px ${ROOM_COLORS.red}, 0 0 30px 6px rgba(255, 80, 100, 0.45) !important; }
.ne-node.tw-critical .ne-node-header { background: ${ROOM_COLORS.red} !important; color: #1a0306 !important; }
.ne-md-cell-view { font-size: 12px; line-height: 1.45; }
.ne-md-cell-view h3 { margin: 0 0 4px; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: ${ROOM_COLORS.tealSoft}; }
.ne-md-cell-view p { margin: 0 0 6px; }
`;
var fmt = (v, digits = 0) => Number.isFinite(v) ? v.toFixed(digits) : "?";
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function activate(studio) {
  const params = new URLSearchParams(location.search);
  const brokerUrl = params.get("broker") ?? location.origin;
  const seconds = Math.max(1, Number(params.get("seconds") ?? 6));
  const slowMs = Math.max(2e3, Number(params.get("slow") ?? 15e3));
  const broker = new Broker(brokerUrl, { name: "studio-twin", version: "0.1.0" });
  const log = (level, message) => studio.log(level, SOURCE, message);
  installLoopStyle(STYLE);
  const viewer = studio.getViewer();
  studio.setLayout({ palette: false, properties: false, console: false, dashboardHeight: 300 });
  disableStudioPlayer("This graph is the cabin twin: the twin slot runs it to answer its questions; this page replays the answers.");
  const graphUrl = params.get("graph") ?? "/graphs/cabin.spikypanda";
  const doc = await (await fetch(graphUrl)).json();
  const byLabel = (label) => viewer.nodes.find((v) => v.label === label);
  const byId = /* @__PURE__ */ new Map();
  for (const n of doc.model?.nodes ?? []) {
    const shown = byLabel(n.label);
    if (shown) byId.set(n.id, shown);
  }
  const badges = /* @__PURE__ */ new Map();
  for (const [id, node] of byId) {
    const badge2 = document.createElement("div");
    badge2.className = "tw-val";
    node.el.appendChild(badge2);
    badges.set(id, badge2);
  }
  const setBadge = (id, text) => {
    const b = badges.get(id);
    if (b) b.textContent = text;
  };
  const plots = PLOTS.map((p) => ({ ...p, node: byLabel(p.label)?.item.data })).filter((p) => Array.isArray(p.node?._xs) && Array.isArray(p.node?._ys));
  const notes = byLabel(NOTES_LABEL)?.item.data;
  if (plots.length < PLOTS.length) log("warn", `plots: ${plots.length} of ${PLOTS.length} tiles found; the others stay empty`);
  for (const p of plots) {
    const node = p.node;
    if (typeof node._buildOptions !== "function") continue;
    const build = node._buildOptions.bind(node);
    node._buildOptions = () => {
      const options = build();
      const line = options.series?.[1];
      if (line) Object.assign(line, { stroke: p.color, fill: `${p.color}22`, width: 1.8 });
      for (const axis of options.axes ?? []) Object.assign(axis, { stroke: "#6d908e", grid: { stroke: "rgba(64, 214, 200, 0.10)", width: 0.5 } });
      return options;
    };
    node._rebuildOnNextFrame = true;
  }
  const clearPlots = () => {
    for (const p of plots) {
      p.node._xs.length = 0;
      p.node._ys.length = 0;
    }
  };
  const plotRow = (row) => {
    for (const p of plots) {
      p.node._xs.push(row[MINUTE]);
      p.node._ys.push(row[p.column]);
    }
  };
  let lastNotes = "";
  const setNotes = (markdown) => {
    if (!notes || typeof notes._renderView !== "function" || markdown === lastNotes) return;
    lastNotes = markdown;
    notes._content = markdown;
    notes._renderView();
  };
  const stateOf = (run, ppm) => ppm >= run.thresholds.criticalPpm ? "critical" : ppm >= run.thresholds.elevatedPpm ? "elevated" : "nominal";
  const commandAt = (t, minute) => {
    const seg = t.command.find((s) => minute >= s.from && minute < s.to) ?? t.command.at(-1);
    return (seg?.value ?? 0) * 100;
  };
  const describe = (run) => {
    const q = run.question;
    const crew = run.crew.map((c) => `${c.count} ${c.activity.replace("_", " ")}`).join(" + ");
    if (run.tool === "sweep") return `sweep of ${run.trajectories.length} flows (${run.trajectories.map((t) => t.label).join(", ")}) from ${fmt(run.startPpm)} ppm, crew ${crew}, ${q.minutes} min`;
    return `time to critical from ${fmt(run.startPpm)} ppm, crew ${crew}, scrubber ${run.trajectories[0]?.label ?? "?"}, ${q.horizonMinutes} min`;
  };
  const summaryOf = (t) => {
    const s = t.summary;
    const when = (m) => m === null ? "never" : `minute ${m}`;
    return `**${t.label}**: peak ${fmt(s.peakPpm)} ppm at minute ${s.peakAtMinute}, final ${fmt(s.finalPpm)} ppm ${s.finalState}. ELEVATED ${when(s.minutesToElevated)}, CRITICAL ${when(s.minutesToCritical)}. Scrubber ${fmt(s.scrubberEnergyWh, 1)} Wh, reserve ${fmt(s.stateOfChargePercent, 2)} %.`;
  };
  function showMinute(run, index, row, done) {
    const t = run.trajectories[index];
    const state = stateOf(run, row[CO2]);
    const horizon = t.rows.at(-1)?.[MINUTE] ?? row[MINUTE];
    const command = commandAt(t, row[MINUTE]);
    const [a, b] = [run.crew[0], run.crew[1] ?? { count: 0, activity: "sleep" }];
    setBadge("crew-a-count", String(a.count));
    setBadge("crew-a-activity", a.activity);
    setBadge("crew-b-count", String(b.count));
    setBadge("crew-b-activity", b.activity);
    setBadge("crew-a", `${a.count} \xD7 ${a.activity}`);
    setBadge("crew-b", `${b.count} \xD7 ${b.activity}`);
    setBadge("command", `${fmt(command)} %`);
    setBadge("scrubber", `${fmt(row[RATE], 3)} / min \xB7 ${fmt(row[POWER], 1)} W`);
    setBadge("cabin", `${fmt(row[CO2])} ppm \xB7 ${state.toUpperCase()}`);
    setBadge("battery", `${fmt(row[SOC], 2)} %`);
    setBadge("solver", `minute ${row[MINUTE]} / ${horizon}`);
    const cabin = byId.get("cabin");
    cabin?.el.classList.remove("tw-nominal", "tw-elevated", "tw-critical");
    cabin?.el.classList.add(`tw-${state}`);
    setNotes(
      [
        `### ${run.tool === "sweep" ? "Operating map" : "Time to critical"}`,
        describe(run),
        `${run.trajectories.length > 1 ? `Flow **${t.label}** (${index + 1} of ${run.trajectories.length}), cabin ` : "Cabin "}**${state.toUpperCase()}**, scrubber at ${fmt(command)} %.`,
        ...done.map(summaryOf)
      ].join("\n\n")
    );
  }
  const links = (on) => {
    for (const c of viewer.connections) c.path.classList.toggle("hx-link-done", on);
  };
  let playing = 0;
  async function replay(run) {
    const token = ++playing;
    log("info", `replaying ${run.runId}: ${describe(run)}`);
    setStatus(`replaying: ${describe(run)}`);
    links(true);
    const each = run.trajectories.length > 1 ? Math.max(1.2, seconds / run.trajectories.length) : seconds;
    const done = [];
    for (const [index, t] of run.trajectories.entries()) {
      clearPlots();
      const delay = each * 1e3 / Math.max(1, t.rows.length);
      for (const row of t.rows) {
        if (token !== playing) return;
        plotRow(row);
        showMinute(run, index, row, done);
        await sleep(delay);
      }
      done.push(t);
      const last = t.rows.at(-1);
      if (last) showMinute(run, index, last, done);
    }
    if (token === playing) {
      links(false);
      setStatus(`${runs.size} question(s) kept by the twin \xB7 shown: ${run.tool}`);
    }
  }
  function still(run) {
    playing++;
    links(false);
    const index = run.trajectories.length - 1;
    const t = run.trajectories[index];
    const last = t?.rows.at(-1);
    if (!t || !last) return;
    clearPlots();
    for (const row of t.rows) plotRow(row);
    showMinute(run, index, last, run.trajectories);
  }
  const toolbar = createBar("TWIN");
  const { bar, badge, select, button } = toolbar;
  const runSel = select("The questions asked to the twin, newest first; the page replays each new one unless one is chosen here", [["latest", "latest question"]], "latest");
  button("replay", "replay the question shown, minute by minute", () => {
    const run = chosen();
    if (run) void replay(run);
  });
  button("control board", "the Control Board, in this window", () => {
    location.href = "/";
  });
  bar.appendChild(badge);
  studio.addBar(bar);
  const setStatus = (text, warn = false) => {
    badge.textContent = text;
    badge.title = text;
    badge.classList.toggle("warn", warn);
  };
  const runs = /* @__PURE__ */ new Map();
  const chosen = () => runSel.value === "latest" ? [...runs.values()].at(-1) ?? null : runs.get(runSel.value) ?? null;
  const listRuns = () => {
    const value = runSel.value;
    const options = [["latest", "latest question"], ...[...runs.values()].reverse().map((r) => [r.runId, `${r.at.slice(11, 19)} \xB7 ${r.tool} \xB7 ${r.trajectories.map((t) => t.label).join(", ")}`])];
    runSel.replaceChildren(...options.map(([v, label]) => Object.assign(document.createElement("option"), { value: v, textContent: label })));
    runSel.value = options.some(([v]) => v === value) ? value : "latest";
  };
  runSel.addEventListener("change", () => {
    const run = chosen();
    if (run) void replay(run);
  });
  const add = (run) => {
    runs.set(run.runId, run);
    while (runs.size > 12) runs.delete(runs.keys().next().value);
    listRuns();
  };
  const readRuns = async () => {
    const s = await broker.session("twin");
    const r = await s.request("resources/read", { uri: RUNS_URI });
    return JSON.parse(r.contents[0]?.text ?? "[]");
  };
  const catchUp = async (first = false) => {
    try {
      const kept = await readRuns();
      const fresh = kept.filter((r) => !runs.has(r.runId));
      for (const r of kept) add(r);
      const newest = kept.at(-1);
      if (!newest) return;
      if (first) still(newest);
      else if (fresh.length && runSel.value === "latest") void replay(newest);
    } catch (e) {
      setStatus(`twin not reachable: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  };
  studio.fitToContent(28);
  setTimeout(() => studio.fitToContent(28), 300);
  await catchUp(true);
  setStatus(runs.size ? `${runs.size} question(s) kept by the twin` : "no question asked to the twin yet");
  const stream = watchSlot(
    brokerUrl,
    "twin",
    (update) => {
      if (update.uri !== RUNS_URI) return;
      const run = update.meta[META_RUN];
      if (!run?.runId) return void catchUp();
      add(run);
      if (runSel.value === "latest") void replay(run);
    },
    (open) => {
      log(open ? "info" : "warn", open ? "runs: following the twin's answers as it pushes them" : `runs: the push stream dropped; looking every ${slowMs / 1e3} s until it is back`);
      if (open) void catchUp();
    }
  );
  setInterval(() => {
    if (!stream.open) void catchUp();
  }, slowMs);
}
export {
  activate as default
};
//# sourceMappingURL=twin-page.js.map
