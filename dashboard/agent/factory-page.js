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
    const list2 = Array.isArray(providers) ? providers : providers?.providers ?? [];
    return list2.map((p) => typeof p === "string" ? p : p.name).filter((n) => n && !n.startsWith("_"));
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
var MONITOR_TYPE = "Harness.Monitor:trace";
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
function stageNodes(viewer) {
  const byStage = /* @__PURE__ */ new Map();
  for (const n of viewer.nodes) {
    const stage = n.item.data?.stage;
    if (typeof stage === "string") byStage.set(stage, n);
  }
  return byStage;
}
function findMonitor(viewer) {
  for (const n of viewer.nodes) {
    const d = n.item.data;
    if (d && d.renderableType === MONITOR_TYPE && typeof d.push === "function") return d;
  }
  return null;
}
function hideMonitorNode(viewer) {
  for (const n of viewer.nodes) if (n.item.data?.renderableType === MONITOR_TYPE) n.el.style.display = "none";
}
function createStageLights({ studio, viewer, byStage, view, dwellMs = 350, sentenceFor, stopped, narrate }) {
  const cues = [];
  let lit = null;
  let playing = false;
  const clear = () => {
    for (const n of byStage().values()) n.el.classList.remove("hx-lit", "hx-done", "hx-failed");
    for (const c of viewer.connections) c.path.classList.remove("hx-link-done");
    lit = null;
  };
  const markDone = (n) => {
    n.el.classList.remove("hx-lit");
    n.el.classList.add("hx-done");
    for (const c of viewer.connections) if (n.inputs.includes(c.to)) c.path.classList.add("hx-link-done");
  };
  const play = async () => {
    if (playing) return;
    playing = true;
    while (cues.length) {
      const cue = cues.shift();
      const nodes = byStage();
      const n = nodes.get(cue.stage);
      if (!n) continue;
      if (cue.status === "start") {
        if (cue.stage === "observe") clear();
        if (lit && lit !== n) markDone(lit);
        n.el.classList.add("hx-lit");
        lit = n;
        const v = view();
        if (v.mode === "follow") studio.centerOnNode(n, { threshold: v.threshold, scale: v.zoom, animateMs: 220 });
        const [text, now] = sentenceFor(cue.stage, cues[0]?.stage);
        narrate(cue.stage, text, now);
        await new Promise((r) => setTimeout(r, dwellMs));
      } else {
        n.el.classList.remove("hx-lit");
        n.el.classList.add("hx-failed");
        lit = null;
        const message = cue.message ?? "refused";
        const [text, now] = stopped ? stopped(cue.stage, message) : [`Stopped at ${cue.stage}: ${message}`, `Stopped by the harness: ${message}`];
        narrate(cue.stage, text, now, "error");
      }
    }
    if (lit && lit === byStage().get("record")) {
      markDone(lit);
      lit = null;
    }
    playing = false;
  };
  return {
    cue: (cue) => {
      cues.push(cue);
      void play();
    },
    settled: async () => {
      while (playing || cues.length) await new Promise((r) => setTimeout(r, 50));
    },
    lit: () => lit,
    clear
  };
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
function viewControls(bar, initial, studio, lit, first) {
  const settings = { ...initial };
  const frame = () => studio.fitToContent(28);
  const viewSel = bar.select("View: the whole loop framed, or the viewer following the lit node", [["fit", "fit all"], ["follow", "follow"]], settings.mode);
  const thresholdInput = bar.numberInput("follow threshold, px: the view moves only when the lit node is farther than this from the centre", settings.threshold, 20);
  viewSel.addEventListener("change", () => {
    settings.mode = viewSel.value;
    if (settings.mode === "fit") frame();
    else {
      const target = lit() ?? first();
      if (target) studio.centerOnNode(target, { threshold: 0, scale: settings.zoom, animateMs: 250 });
    }
  });
  thresholdInput.addEventListener("change", () => {
    settings.threshold = Math.max(0, Number(thresholdInput.value) || 0);
  });
  window.addEventListener("resize", () => {
    if (settings.mode === "fit") frame();
  });
  return { view: () => settings, frame };
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

// node_modules/@cyanmycelium/mcp-core/dist/index.js
var JsonRpcMimeType = "application/json";
var GRAMMAR_PHRASES_URI = "grammar://phrases";
var HOLE = /\{([a-zA-Z0-9_.-]+)\}/g;
function phraseHoles(template) {
  return [...new Set([...template.matchAll(HOLE)].map((m) => m[1]))].sort();
}
function fillPhrase(template, values = {}) {
  return template.replace(HOLE, (_, name) => name in values && values[name] !== void 0 ? String(values[name]) : "?");
}
var McpGrammar = class _McpGrammar {
  // ── Construction ─────────────────────────────────────────────────────────
  constructor(data) {
    this._server = {};
    this._tools = /* @__PURE__ */ new Map();
    this._resources = /* @__PURE__ */ new Map();
    this._templates = /* @__PURE__ */ new Map();
    this._phrases = /* @__PURE__ */ new Map();
    if (!data) return;
    if (_McpGrammar._isModernShape(data)) {
      const m = data;
      if (m.server) this._server = { ...m.server };
      if (m.tools) {
        for (const [k, v] of Object.entries(m.tools)) this._tools.set(k, _McpGrammar._cloneToolEntry(v));
      }
      if (m.resources) {
        for (const [k, v] of Object.entries(m.resources)) this._resources.set(k, _McpGrammar._cloneResourceEntry(v));
      }
      if (m.templates) {
        for (const [k, v] of Object.entries(m.templates)) this._templates.set(k, _McpGrammar._cloneTemplateEntry(v));
      }
      if (m.phrases) {
        for (const [k, v] of Object.entries(m.phrases)) if (typeof v === "string") this._phrases.set(k, v);
      }
    } else {
      for (const [k, v] of Object.entries(data)) {
        this._tools.set(k, _McpGrammar._cloneToolEntry(v));
      }
    }
  }
  static _isModernShape(data) {
    const d = data;
    return typeof d.server === "object" && d.server !== null || typeof d.tools === "object" && d.tools !== null || typeof d.resources === "object" && d.resources !== null || typeof d.templates === "object" && d.templates !== null || typeof d.phrases === "object" && d.phrases !== null;
  }
  // ── Phrases ──────────────────────────────────────────────────────────────
  /** The phrase under a key, its holes unfilled; `undefined` when the grammar has none. */
  getPhrase(key) {
    return this._phrases.get(key);
  }
  setPhrase(key, template) {
    this._phrases.set(key, template);
  }
  /** The keys of every phrase this grammar carries, in insertion order. */
  listPhrases() {
    return [...this._phrases.keys()];
  }
  /** True when the grammar carries at least one phrase. */
  hasPhrases() {
    return this._phrases.size > 0;
  }
  /** The phrases as plain data, for a resource or a file. */
  getPhrases() {
    return Object.fromEntries(this._phrases);
  }
  /**
   * A phrase filled with `values`. A key the grammar lacks comes back as
   * the key itself, so a missing sentence is seen where it should have
   * been read; a hole with no value reads `?`, never an invented value.
   */
  phrase(key, values = {}) {
    const template = this._phrases.get(key);
    return template === void 0 ? key : fillPhrase(template, values);
  }
  /**
   * How `other`'s phrases differ from this grammar's, taken as the
   * reference wording: a key this grammar has that `other` lacks, a key
   * `other` has that this grammar lacks, a phrase whose holes differ. Two
   * locale files of one server should differ in nothing here.
   */
  comparePhrases(other, options = {}) {
    const problems = [];
    for (const [key, template] of this._phrases) {
      const theirs = other._phrases.get(key);
      if (theirs === void 0) {
        if (!options.subset) problems.push({ kind: "phrase", name: key, message: `phrase "${key}" is missing` });
        continue;
      }
      const mine = phraseHoles(template).join(",");
      const holes = phraseHoles(theirs).join(",");
      if (mine !== holes) problems.push({ kind: "phrase", name: key, message: `phrase "${key}" names the holes {${holes}} where the reference names {${mine}}` });
    }
    for (const key of other._phrases.keys())
      if (!this._phrases.has(key)) problems.push({ kind: "phrase", name: key, message: `phrase "${key}" is not in the reference wording` });
    return problems;
  }
  // ── Server words ─────────────────────────────────────────────────────────
  /** The one-line description of the server in this wording, if the grammar carries one. */
  getServerDescription() {
    return this._server.description;
  }
  setServerDescription(description) {
    this._server.description = description;
  }
  /** The usage note a session receives in `initialize.instructions`, in this wording, if the grammar carries one. */
  getServerInstructions() {
    return this._server.instructions;
  }
  setServerInstructions(instructions) {
    this._server.instructions = instructions;
  }
  // ── Check against a surface ──────────────────────────────────────────────
  /**
   * What this grammar names that the given surface does not have: a tool,
   * a property (dotted for nested objects and array items, as
   * `properties` keys are written), a resource URI, a template. A grammar
   * with no problem describes only things that exist; the server applies
   * it without surprise.
   */
  check(surface) {
    const problems = [];
    if (surface.phrases) {
      const keys = new Set(surface.phrases);
      for (const key of this._phrases.keys()) if (!keys.has(key)) problems.push({ kind: "phrase", name: key, message: `phrase "${key}" is not one the host reads` });
    }
    const tools = new Map((surface.tools ?? []).map((t) => [t.name, t]));
    for (const [name, entry] of this._tools) {
      const tool = tools.get(name);
      if (!tool) {
        problems.push({ kind: "tool", name, message: `tool "${name}" does not exist on this surface` });
        continue;
      }
      const paths = new Set(_McpGrammar._schemaPaths(tool.inputSchema));
      for (const prop of Object.keys(entry.properties ?? {})) {
        if (!paths.has(prop))
          problems.push({
            kind: "property",
            name: `${name}.${prop}`,
            message: `tool "${name}" has no property "${prop}" (properties: ${[...paths].join(", ") || "none"})`
          });
      }
    }
    if (surface.resources) {
      const uris = new Set(surface.resources.map((r) => r.uri));
      for (const uri of this._resources.keys())
        if (!uris.has(uri)) problems.push({ kind: "resource", name: uri, message: `resource "${uri}" does not exist on this surface` });
    }
    if (surface.templates) {
      const uris = new Set(surface.templates.map((t) => t.uriTemplate));
      for (const uri of this._templates.keys())
        if (!uris.has(uri)) problems.push({ kind: "template", name: uri, message: `template "${uri}" does not exist on this surface` });
    }
    return problems;
  }
  /** The property names a schema declares, dotted for nested objects and array items. */
  static _schemaPaths(schema, prefix = "") {
    const props = schema?.properties;
    if (!props) return [];
    const out = [];
    for (const [name, sub] of Object.entries(props)) {
      out.push(`${prefix}${name}`);
      out.push(..._McpGrammar._schemaPaths(sub, `${prefix}${name}.`));
      const items = sub?.items;
      if (items) out.push(..._McpGrammar._schemaPaths(items, `${prefix}${name}.`));
    }
    return out;
  }
  // ── Tool title / description ─────────────────────────────────────────────
  getToolTitle(toolName) {
    return this._tools.get(toolName)?.title;
  }
  setToolTitle(toolName, title) {
    const entry = this._ensureToolEntry(toolName);
    entry.title = title;
  }
  getToolDescription(toolName) {
    return this._tools.get(toolName)?.description;
  }
  setToolDescription(toolName, description) {
    const entry = this._ensureToolEntry(toolName);
    entry.description = description;
  }
  // ── Tool property description ────────────────────────────────────────────
  getPropertyDescription(toolName, propertyName) {
    return this._tools.get(toolName)?.properties?.[propertyName];
  }
  setPropertyDescription(toolName, propertyName, description) {
    const entry = this._ensureToolEntry(toolName);
    if (!entry.properties) entry.properties = {};
    entry.properties[propertyName] = description;
  }
  // ── Resource name / title / description ──────────────────────────────────
  getResourceName(uri) {
    return this._resources.get(uri)?.name;
  }
  setResourceName(uri, name) {
    const entry = this._ensureResourceEntry(uri);
    entry.name = name;
  }
  getResourceTitle(uri) {
    return this._resources.get(uri)?.title;
  }
  setResourceTitle(uri, title) {
    const entry = this._ensureResourceEntry(uri);
    entry.title = title;
  }
  getResourceDescription(uri) {
    return this._resources.get(uri)?.description;
  }
  setResourceDescription(uri, description) {
    const entry = this._ensureResourceEntry(uri);
    entry.description = description;
  }
  // ── Resource template name / title / description ─────────────────────────
  getResourceTemplateName(uriTemplate) {
    return this._templates.get(uriTemplate)?.name;
  }
  setResourceTemplateName(uriTemplate, name) {
    const entry = this._ensureTemplateEntry(uriTemplate);
    entry.name = name;
  }
  getResourceTemplateTitle(uriTemplate) {
    return this._templates.get(uriTemplate)?.title;
  }
  setResourceTemplateTitle(uriTemplate, title) {
    const entry = this._ensureTemplateEntry(uriTemplate);
    entry.title = title;
  }
  getResourceTemplateDescription(uriTemplate) {
    return this._templates.get(uriTemplate)?.description;
  }
  setResourceTemplateDescription(uriTemplate, description) {
    const entry = this._ensureTemplateEntry(uriTemplate);
    entry.description = description;
  }
  // ── Serialisation ────────────────────────────────────────────────────────
  /** Returns a plain JSON-safe snapshot of this grammar in the modern shape. */
  toJSON() {
    const out = {};
    if (this._server.description !== void 0 || this._server.instructions !== void 0) out.server = { ...this._server };
    if (this._tools.size > 0) {
      out.tools = {};
      for (const [k, v] of this._tools) out.tools[k] = _McpGrammar._cloneToolEntry(v);
    }
    if (this._resources.size > 0) {
      out.resources = {};
      for (const [k, v] of this._resources) out.resources[k] = _McpGrammar._cloneResourceEntry(v);
    }
    if (this._templates.size > 0) {
      out.templates = {};
      for (const [k, v] of this._templates) out.templates[k] = _McpGrammar._cloneTemplateEntry(v);
    }
    if (this._phrases.size > 0) out.phrases = Object.fromEntries(this._phrases);
    return out;
  }
  /**
   * Constructs a grammar from a plain JSON object. Accepts both the modern
   * shape (`{ tools, resources, templates }`) and the legacy tools-only flat
   * shape (`{ "<toolName>": { description, properties } }`).
   */
  static fromJSON(data) {
    return new _McpGrammar(data);
  }
  // ── Merge ────────────────────────────────────────────────────────────────
  /**
   * Creates a new grammar by overlaying entries from left to right.
   * Later grammars win. `undefined` entries in a later grammar do NOT erase
   * entries from earlier grammars, only explicit strings override.
   */
  static merge(...grammars) {
    const result = new _McpGrammar();
    for (const g of grammars) {
      if (!g) continue;
      if (g._server.description !== void 0) result._server.description = g._server.description;
      if (g._server.instructions !== void 0) result._server.instructions = g._server.instructions;
      for (const [toolName, src] of g._tools) {
        const dest = result._ensureToolEntry(toolName);
        if (src.title !== void 0) dest.title = src.title;
        if (src.description !== void 0) dest.description = src.description;
        if (src.properties) {
          if (!dest.properties) dest.properties = {};
          for (const [prop, desc] of Object.entries(src.properties)) {
            dest.properties[prop] = desc;
          }
        }
      }
      for (const [uri, src] of g._resources) {
        const dest = result._ensureResourceEntry(uri);
        if (src.name !== void 0) dest.name = src.name;
        if (src.title !== void 0) dest.title = src.title;
        if (src.description !== void 0) dest.description = src.description;
      }
      for (const [tpl, src] of g._templates) {
        const dest = result._ensureTemplateEntry(tpl);
        if (src.name !== void 0) dest.name = src.name;
        if (src.title !== void 0) dest.title = src.title;
        if (src.description !== void 0) dest.description = src.description;
      }
      for (const [key, template] of g._phrases) result._phrases.set(key, template);
    }
    return result;
  }
  // ── Clone ────────────────────────────────────────────────────────────────
  clone() {
    return new _McpGrammar(this.toJSON());
  }
  // ── Internals ────────────────────────────────────────────────────────────
  _ensureToolEntry(toolName) {
    let entry = this._tools.get(toolName);
    if (!entry) {
      entry = {};
      this._tools.set(toolName, entry);
    }
    return entry;
  }
  _ensureResourceEntry(uri) {
    let entry = this._resources.get(uri);
    if (!entry) {
      entry = {};
      this._resources.set(uri, entry);
    }
    return entry;
  }
  _ensureTemplateEntry(uriTemplate) {
    let entry = this._templates.get(uriTemplate);
    if (!entry) {
      entry = {};
      this._templates.set(uriTemplate, entry);
    }
    return entry;
  }
  static _cloneToolEntry(entry) {
    const clone = {};
    if (entry.title !== void 0) clone.title = entry.title;
    if (entry.description !== void 0) clone.description = entry.description;
    if (entry.properties) clone.properties = { ...entry.properties };
    return clone;
  }
  static _cloneResourceEntry(entry) {
    const clone = {};
    if (entry.name !== void 0) clone.name = entry.name;
    if (entry.title !== void 0) clone.title = entry.title;
    if (entry.description !== void 0) clone.description = entry.description;
    return clone;
  }
  static _cloneTemplateEntry(entry) {
    const clone = {};
    if (entry.name !== void 0) clone.name = entry.name;
    if (entry.title !== void 0) clone.title = entry.title;
    if (entry.description !== void 0) clone.description = entry.description;
    return clone;
  }
};
var McpToolResults = {
  /** Plain text confirmation or message. */
  text: (text) => ({ content: [{ type: "text", text }] }),
  /**
   * Serialized JSON, convenience over `text(JSON.stringify(...))`.
   *
   * Emits the payload as a JSON `text` block (backward-compatible) and, when
   * `data` is a plain object, also as `structuredContent` (MCP 2025-06-18) so
   * modern clients receive it structured without re-parsing the text block.
   * Arrays and primitives are not valid `structuredContent`, so they are
   * emitted as the `text` block only.
   */
  json: (data) => {
    const result = { content: [{ type: "text", text: JSON.stringify(data) }] };
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      result.structuredContent = data;
    }
    return result;
  },
  /** Embeds an updated resource inline, avoids a round-trip `resources/read`. */
  resource: (resource) => ({ content: [{ type: "resource", resource }] }),
  /**
   * Points at a resource instead of inlining it.
   *
   * Prefer this over {@link resource} when the payload is large or changes on
   * its own: the client reads or subscribes to the URI when it needs the data.
   */
  link: (uri, name, options) => ({
    content: [{ type: "resource_link", uri, name, ...options }]
  }),
  /** Base64 image. */
  image: (data, mimeType) => ({ content: [{ type: "image", data, mimeType }] }),
  /** Base64 audio. */
  audio: (data, mimeType) => ({ content: [{ type: "audio", data, mimeType }] }),
  /**
   * Tool-level error, `isError: true` signals failure to the client without throwing.
   *
   * This is the form the spec wants for execution and input-validation
   * failures: unlike a JSON-RPC error, it reaches the model, which can read
   * the message and retry with corrected arguments.
   */
  error: (message) => ({ content: [{ type: "text", text: message }], isError: true })
};
var McpBehaviorBase = class {
  constructor(options) {
    this._domain = options.domain;
    this._namespace = options.namespace;
    this._name = options.name;
    this._description = options.description;
    this._mimeType = options.mimeType;
  }
  get baseUri() {
    if (!this._baseUri) {
      this._baseUri = this._buildBaseUri();
    }
    return this._baseUri;
  }
  get domain() {
    return this._domain || "mcp";
  }
  get namespace() {
    return this._namespace || "";
  }
  get name() {
    return this._name;
  }
  get description() {
    return this._description;
  }
  get mimeType() {
    return this._mimeType;
  }
  readResourceAsync(_uri) {
    return Promise.resolve(void 0);
  }
  executeToolAsync(_uri, _toolName, _args) {
    return Promise.resolve(McpToolResults.error(`Tool not implemented: ${_toolName}`));
  }
  getResources() {
    throw new Error("Method not implemented.");
  }
  getResourceTemplates() {
    throw new Error("Method not implemented.");
  }
  getTools() {
    throw new Error("Method not implemented.");
  }
  _buildBaseUri() {
    return `${this.domain}://${this.namespace}`;
  }
};
var McpGrammarBehavior = class _McpGrammarBehavior extends McpBehaviorBase {
  static {
    this.GrammarListFn = "grammar_list";
  }
  static {
    this.GrammarReadFn = "grammar_read";
  }
  static {
    this.GrammarSetFn = "grammar_set";
  }
  static {
    this.GrammarDeleteFn = "grammar_delete";
  }
  static {
    this.GrammarImportFn = "grammar_import";
  }
  static {
    this.GrammarExportFn = "grammar_export";
  }
  constructor(store, options = {}) {
    super({
      ...options,
      domain: options.domain ?? "mcp",
      namespace: options.namespace ?? "grammar"
    });
    this._store = store;
  }
  // ── Design-time (schema) ────────────────────────────────────────────────
  getTools() {
    return [
      {
        name: _McpGrammarBehavior.GrammarListFn,
        description: "Lists every grammar profile currently registered in the store. Each profile tailors how tools and their parameters are described for a specific device, process, or audience, enabling an LLM to reason about the same capability in domain-specific terms.",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Grammar namespace URI (mcp://grammar)."
            }
          },
          required: ["uri"],
          additionalProperties: false
        }
      },
      {
        name: _McpGrammarBehavior.GrammarReadFn,
        description: "Returns the full grammar profile for a given profile ID: every tool-level and property-level description override that shapes how an LLM perceives the device's capabilities.",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Grammar namespace URI (mcp://grammar)."
            },
            profileId: {
              type: "string",
              description: "Profile identifier to read (e.g. 'welding-robot-3A')."
            }
          },
          required: ["uri", "profileId"],
          additionalProperties: false
        }
      },
      {
        name: _McpGrammarBehavior.GrammarSetFn,
        description: "Creates or replaces a grammar profile. The data object maps tool names to description overrides: { toolName: { description?, properties?: { propName: description } } }. Supports dot-notation for nested properties (e.g. 'patch.position'). After saving, every connected session bound to this profile receives a tools/list_changed notification and sees updated tool descriptions on the next tools/list call.",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Grammar namespace URI (mcp://grammar)."
            },
            profileId: {
              type: "string",
              description: "Profile identifier to create or replace."
            },
            data: {
              type: "object",
              description: "Grammar data keyed by tool name. Each value is { description?: string, properties?: Record<string, string> }.",
              additionalProperties: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description: "Override for the tool-level description."
                  },
                  properties: {
                    type: "object",
                    description: "Map of property names to description overrides. Supports dot-notation for nested properties.",
                    additionalProperties: { type: "string" }
                  }
                },
                additionalProperties: false
              }
            }
          },
          required: ["uri", "profileId", "data"],
          additionalProperties: false
        }
      },
      {
        name: _McpGrammarBehavior.GrammarDeleteFn,
        description: "Removes a grammar profile by ID. Sessions bound to this profile revert to baseline tool descriptions and receive a tools/list_changed notification.",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Grammar namespace URI (mcp://grammar)."
            },
            profileId: {
              type: "string",
              description: "Profile identifier to delete."
            }
          },
          required: ["uri", "profileId"],
          additionalProperties: false
        }
      },
      {
        name: _McpGrammarBehavior.GrammarImportFn,
        description: "Bulk-imports grammar profiles from a single JSON object. Each key is a profile ID and each value is grammar data. Existing profiles with the same ID are replaced. Useful for restoring a previously exported configuration or deploying a fleet of device grammars.",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Grammar namespace URI (mcp://grammar)."
            },
            profiles: {
              type: "object",
              description: "Map of profile IDs to grammar data objects.",
              additionalProperties: {
                type: "object",
                additionalProperties: {
                  type: "object",
                  properties: {
                    description: { type: "string" },
                    properties: {
                      type: "object",
                      additionalProperties: { type: "string" }
                    }
                  },
                  additionalProperties: false
                }
              }
            }
          },
          required: ["uri", "profiles"],
          additionalProperties: false
        }
      },
      {
        name: _McpGrammarBehavior.GrammarExportFn,
        description: "Exports every grammar profile as a single JSON snapshot. The result can be saved to a file and later re-imported with grammar_import to restore the full grammar configuration.",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Grammar namespace URI (mcp://grammar)."
            }
          },
          required: ["uri"],
          additionalProperties: false
        }
      }
    ];
  }
  getResources() {
    return [
      {
        uri: this.baseUri,
        name: "Grammar profiles",
        description: "All grammar profiles currently registered in the store.",
        mimeType: JsonRpcMimeType
      }
    ];
  }
  getResourceTemplates() {
    return [
      {
        uriTemplate: `${this.baseUri}/{profileId}`,
        name: "Grammar profile",
        description: "A single grammar profile identified by its profile ID.",
        mimeType: JsonRpcMimeType
      }
    ];
  }
  // ── Runtime ─────���───────────────────────────────────────────────────────
  async readResourceAsync(uri) {
    if (uri === this.baseUri) {
      return {
        uri,
        mimeType: JsonRpcMimeType,
        text: JSON.stringify({ profiles: this._store.list() })
      };
    }
    const prefix = `${this.baseUri}/`;
    if (uri.startsWith(prefix)) {
      const profileId = uri.substring(prefix.length);
      const grammar = this._store.get(profileId);
      if (!grammar) return void 0;
      return {
        uri,
        mimeType: JsonRpcMimeType,
        text: JSON.stringify(grammar.toJSON())
      };
    }
    return void 0;
  }
  async executeToolAsync(_uri, toolName, args) {
    switch (toolName) {
      case _McpGrammarBehavior.GrammarListFn:
        return McpToolResults.json({ profiles: this._store.list() });
      case _McpGrammarBehavior.GrammarReadFn: {
        const profileId = args["profileId"];
        if (!profileId) return McpToolResults.error("Missing required argument: profileId");
        const grammar = this._store.get(profileId);
        if (!grammar) return McpToolResults.error(`Grammar profile not found: "${profileId}"`);
        return McpToolResults.json(grammar.toJSON());
      }
      case _McpGrammarBehavior.GrammarSetFn: {
        const profileId = args["profileId"];
        const data = args["data"];
        if (!profileId) return McpToolResults.error("Missing required argument: profileId");
        if (!data) return McpToolResults.error("Missing required argument: data");
        this._store.set(profileId, McpGrammar.fromJSON(data));
        return McpToolResults.text(`Grammar profile "${profileId}" saved.`);
      }
      case _McpGrammarBehavior.GrammarDeleteFn: {
        const profileId = args["profileId"];
        if (!profileId) return McpToolResults.error("Missing required argument: profileId");
        if (!this._store.delete(profileId)) return McpToolResults.error(`Grammar profile not found: "${profileId}"`);
        return McpToolResults.text(`Grammar profile "${profileId}" deleted.`);
      }
      case _McpGrammarBehavior.GrammarImportFn: {
        const profiles = args["profiles"];
        if (!profiles) return McpToolResults.error("Missing required argument: profiles");
        this._store.importAll(profiles);
        return McpToolResults.text(`Imported ${Object.keys(profiles).length} grammar profile(s).`);
      }
      case _McpGrammarBehavior.GrammarExportFn:
        return McpToolResults.json(this._store.exportAll());
      default:
        return McpToolResults.error(`Unknown tool: "${toolName}"`);
    }
  }
};

// harness/browser/words.ts
async function loadWords(session) {
  const r = await session.request("resources/read", { uri: GRAMMAR_PHRASES_URI });
  const text = r?.contents?.[0]?.text;
  if (!text) throw new Error(`${GRAMMAR_PHRASES_URI}: the slot gave this session no phrases`);
  const body = JSON.parse(text);
  return { words: McpGrammar.fromJSON({ phrases: body.phrases ?? {} }), grammar: body.grammar ?? null };
}
var NO_WORDS = McpGrammar.fromJSON({ phrases: {} });

// harness/browser/factory-voice.ts
var num = (v, digits = 4) => typeof v === "number" && Number.isFinite(v) ? Number.isInteger(v) ? String(v) : v.toFixed(digits).replace(/\.?0+$/, "") : "?";
var count = (v) => {
  if (Array.isArray(v)) return String(v.length);
  const m = typeof v === "string" ? /^\[(\d+) items\]$/.exec(v) : null;
  return m ? m[1] : "?";
};
var list = (v) => Array.isArray(v) ? v : [];
var record = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var valueOf = (step) => record(record(step.summary).value);
var plainReason = (reason, fallback) => typeof reason === "string" && reason ? reason.replace(/^(device refused|policy deny|error):\s*/i, "") : fallback;
function stepSentence(words, step) {
  if (!step) return "";
  const p = (key, values = {}) => words.phrase(key, values);
  const noReason = p("noReason");
  const capability = step.capability ?? p("aCall");
  const replayed = step.source === "policy" ? p("replayed") : "";
  if (step.source === "refused") return p("step.refused", { capability, reason: plainReason(step.reason, noReason) });
  if (step.source === "failed") return p("step.failed", { reason: plainReason(step.reason, noReason) });
  if (step.outcome !== "completed") return p("step.notCompleted", { capability, outcome: step.outcome ?? "?", reason: plainReason(step.reason, noReason) });
  const v = valueOf(step);
  const input = record(step.input);
  switch (step.capability) {
    case "twin.registry_search":
      return p("step.twin.registry_search", { matches: count(v.matches), signed: num(v.signed), total: num(v.total), replayed });
    case "task.plan": {
      const selected = list(input.selected_nodes).map(String);
      const missing = list(input.missing_capabilities).map((m) => String(record(m).required_output ?? "?"));
      return p("step.task.plan", {
        selectedCount: selected.length,
        selectedList: selected.length ? p("step.task.plan.selectedList", { selected: selected.join(", ") }) : "",
        missing: missing.length ? p("step.task.plan.missing", { missing: missing.join(", ") }) : p("step.task.plan.nothingMissing"),
        recipe: replayed ? p("step.task.plan.recipe") : ""
      });
    }
    case "workspace.list":
      return p("step.workspace.list", { files: count(v.files), replayed });
    case "workspace.read":
      return p("step.workspace.read", { path: input.path ?? p("aFile"), replayed });
    case "workspace.write":
      return p("step.workspace.write", { path: input.path ?? p("aFile"), replayed });
    case "model.fit": {
      const q = record(v.quality);
      return p("step.model.fit", { rows: num(q.rows), kept: num(q.kept), rmse: num(q.rmse), worst: num(q.worstCaseError), parity: record(v.parity).ok ? p("parity.ok") : p("parity.notOk"), replayed });
    }
    case "model.inspect":
      return p("step.model.inspect", { inputs: count(v.inputs), outputs: count(v.outputs), bytes: num(v.bytes), replayed });
    case "model.contract":
      return v.ok ? p("step.model.contract.ok", { replayed }) : p("step.model.contract.refused", { error: v.error ?? noReason });
    case "task.fail":
      return p("step.task.fail");
    case "task.done":
      if (step.reward === -1) return p("step.task.done.disputed", { problems: String(step.reason ?? "").replace(/^contract not held:\s*/, "") || noReason });
      return p("step.task.done", { replayed, summary: input.summary ?? "" });
    default:
      return p("step.default", { capability, replayed });
  }
}
function endSentence(words, status) {
  const m = status?.manifest ?? {};
  const p = (key, values = {}) => words.phrase(key, values);
  switch (status?.state) {
    case "proposed":
      return p("end.proposed", { proposalId: m.proposal?.proposalId ?? "?", artifacts: count(m.artifacts), steps: count(m.steps) });
    case "done":
      return p("end.done", { steps: count(m.steps) });
    case "failed": {
      const steps = Array.isArray(m.steps) ? m.steps : [];
      if (steps.at(-1)?.capability === "task.fail") return p("end.failed.gaveUp");
      return p("end.failed", { ended: m.ended ?? p("noReason") });
    }
    default:
      return p("end.other", { state: status?.state ?? "?" });
  }
}
function stageSentence(words, stage, values, next) {
  const key = stage === "gate" ? next === "merge" ? "stage.gate.replayed" : "stage.gate.ask" : `stage.${stage}`;
  if (words.getPhrase(key) === void 0) return [stage, stage];
  return [words.phrase(key, values), words.phrase(`${key}.now`, values)];
}

// harness/browser/factory-loop.ts
var BY_WORD = { OBSERVE: "observe", HYPOTHESIZE: "hypothesize", BUILD: "build", EXECUTE: "execute", EVALUATE: "evaluate", PASS: "pass", DONE: "done", DIAGNOSE: "diagnose", PARAMETER: "parameter", STRUCTURAL: "structural", INVALID: "invalid", REVISE: "revise", INSUFFICIENT: "experiment" };
function loopNodes(viewer) {
  const out = /* @__PURE__ */ new Map();
  for (const n of viewer.nodes) {
    const word = String(n.label ?? "").trim().split(/\s+/)[0];
    const state = BY_WORD[word];
    if (state && !out.has(state)) out.set(state, n);
  }
  return out;
}
var diagnosisOf = (step) => {
  const s = step.summary && typeof step.summary === "object" ? step.summary.value ?? step.summary : null;
  const d = s && typeof s === "object" ? s.diagnosis : void 0;
  return typeof d === "string" ? d : null;
};
function loopStatesOf(step) {
  const id = step.capability ?? "";
  const refused = step.source === "refused" || step.source === "failed" || step.outcome === "refused" || step.reward === -1;
  const error = refused ? String(step.outcome ?? step.source ?? "refused") : void 0;
  const last = (states) => states.map((state, i) => error && i === states.length - 1 ? { state, error } : { state });
  if (/^(workspace|library|twin\.registry|factory\.inventory|station\.registry)/.test(id)) return last(["observe"]);
  if (id === "task.plan") return last(["hypothesize"]);
  if (id === "graph.evaluate") {
    if (refused) return last(["build", "execute", "evaluate"]);
    switch (diagnosisOf(step)) {
      case "PASS":
        return last(["build", "execute", "evaluate", "pass"]);
      case "INVALID_EVALUATION":
        return last(["build", "execute", "evaluate", "diagnose", "invalid", "revise"]);
      case "PARAMETER_MISMATCH":
        return last(["build", "execute", "evaluate", "diagnose", "parameter", "revise"]);
      case "STRUCTURAL_MISMATCH":
        return last(["build", "execute", "evaluate", "diagnose", "structural", "revise"]);
      case "INSUFFICIENT_INFORMATION":
        return last(["build", "execute", "evaluate", "diagnose", "experiment"]);
      default:
        return last(["build", "execute", "evaluate"]);
    }
  }
  if (id === "task.done") return last(["done"]);
  if (id === "task.fail") return [{ state: "diagnose", error: error ?? "the builder gave up" }];
  return [];
}
function createLoopLights(byState) {
  let lit = null;
  const settle = (n) => {
    n.el.classList.remove("hx-lit");
    n.el.classList.add("hx-done");
  };
  return {
    mark(state, error) {
      const n = byState().get(state);
      if (!n) return;
      if (lit && lit !== n) settle(lit);
      n.el.classList.remove("hx-done", "hx-failed", "hx-lit");
      n.el.classList.add(error ? "hx-failed" : "hx-lit");
      lit = error ? null : n;
    },
    reset() {
      if (lit) settle(lit);
      lit = null;
    },
    clear() {
      for (const n of byState().values()) n.el.classList.remove("hx-lit", "hx-done", "hx-failed");
      lit = null;
    }
  };
}

// harness/browser/factory-page.ts
var TASKS_URI = "factory://tasks";
var META_TASK = "spikypanda/task";
var SOURCE = "factory";
function stagesOf(step) {
  const before = ["observe", "context", "lookup", "gate"];
  const after = ["merge", "guard", "execute", "observe-after", "evaluate", "record"];
  const reason = step.reason ?? "refused";
  switch (step.source) {
    case "policy":
      return [...before, ...after].map((stage) => ({ stage }));
    case "fallback":
      return [...before, "request", "reason", ...after].map((stage) => ({ stage }));
    case "refused": {
      const atReason = /outside the allowlist|Invalid decision/i.test(reason);
      const walked = atReason ? [...before, "request"] : [...before, "request", "reason", "merge"];
      return [...walked.map((stage) => ({ stage })), { stage: atReason ? "reason" : "guard", error: reason }];
    }
    default:
      return [...before.map((stage) => ({ stage })), { stage: "request" }, { stage: "reason", error: reason }];
  }
}
var ended = (state) => state !== void 0 && state !== "created" && state !== "running";
var num2 = (v) => typeof v === "number" && Number.isFinite(v) ? String(v) : "?";
async function activate(studio) {
  const params = new URLSearchParams(location.search);
  const brokerUrl = params.get("broker") ?? location.origin;
  const slowMs = Math.max(2e3, Number(params.get("slow") ?? 15e3));
  const pinned = params.get("task");
  const locale = params.get("locale") ?? "en-US";
  const broker = new Broker(brokerUrl, { name: "studio-factory", version: "0.1.0", locale });
  const { words, grammar } = await loadWords(await broker.session("factory"));
  const p = (key, values = {}) => words.phrase(key, values);
  const initialView = { mode: params.get("view") === "fit" ? "fit" : "follow", threshold: Number(params.get("threshold") ?? 120), zoom: Number(params.get("zoom") ?? 1) };
  installLoopStyle();
  const viewer = studio.getViewer();
  studio.setLayout({ palette: false, properties: false, console: false, dashboardHeight: 300 });
  disableStudioPlayer("This graph is the factory's loop: it is run by the factory slot on its tasks, not by the studio's player.");
  const byStage = stageNodes(viewer);
  const byLoopState = loopNodes(viewer);
  const loop = createLoopLights(() => byLoopState);
  const monitor = findMonitor(viewer);
  hideMonitorNode(viewer);
  if (monitor) monitor.series = [
    { key: "reward", label: "reward", color: ROOM_COLORS.teal, min: -1, max: 1 },
    { key: "ms", label: "ms", color: ROOM_COLORS.amber }
  ];
  const log = (level, message) => studio.log(level, SOURCE, message);
  const narrate = (stage, text, now, level = "info") => monitor?.push({ kind: "narrate", stage, text, now, level });
  const toolbar = createBar("FACTORY");
  const { bar, badge, select, button } = toolbar;
  const taskSel = select("The factory's tasks, newest first; the page follows the newest unless one is chosen here", [["latest", "latest task"]], "latest");
  const { view, frame } = viewControls(toolbar, initialView, studio, () => lights.lit(), () => byStage.get("observe"));
  const boardBtn = button("control board", "the Control Board, in this window", () => {
    location.href = "/";
  });
  boardBtn.title = "open the Control Board";
  bar.appendChild(badge);
  studio.addBar(bar);
  studio.reveal?.();
  const setStatus = (text, short, warn = false) => {
    badge.textContent = short ?? text;
    badge.title = text;
    badge.classList.toggle("warn", warn);
  };
  let step = null;
  let status = null;
  const sentenceFor = (stage, next) => {
    const s = step;
    const m = status?.manifest;
    const builder = m?.provider?.name ?? "?";
    return stageSentence(
      words,
      stage,
      {
        n: num2(s?.n),
        taskId: status?.taskId ?? "?",
        files: num2(status?.files),
        kind: m?.signature?.id ?? "?",
        topic: m?.topic ?? "?",
        experiences: num2(m?.recipes?.experiencesBefore),
        tools: num2(m?.tools?.count),
        builder,
        tokens: s?.tokens?.total ? p("stage.reason.tokens", { tokens: s.tokens.total }) : "",
        capability: s?.capability ?? "?",
        outcome: s?.outcome ?? "?",
        ms: num2(s?.ms),
        reward: num2(s?.reward),
        reason: s?.reason ?? ""
      },
      next
    );
  };
  const lights = createStageLights({ studio, viewer, byStage: () => byStage, view, sentenceFor, narrate, stopped: (stage, message) => [p("stage.stopped", { stage, message }), p("stage.stopped.now", { message })] });
  async function showStep(s) {
    step = s;
    const walk = stagesOf(s);
    for (const { stage, error } of walk) {
      monitor?.push({ kind: "stage", stage, status: error ? "error" : "start", message: error });
      lights.cue(error ? { stage, status: "error", message: error } : { stage, status: "start" });
      if (stage === "execute") {
        const summary = s.summary && typeof s.summary === "object" ? s.summary.value : s.summary;
        monitor?.push({ kind: "decision", capabilityId: s.capability ?? "?", input: s.input, source: s.source === "policy" ? "policy" : "fallback" });
        monitor?.push({ kind: "call", capabilityId: s.capability ?? "?", input: s.input, output: summary, outcome: s.outcome ?? "?", latencyMs: s.ms });
      }
    }
    await lights.settled();
    for (const { state, error } of loopStatesOf(s)) {
      loop.mark(state, error);
      const text = p(`loop.${state}`, { capability: s.capability ?? "?", reason: error ?? "" });
      narrate(`loop.${state}`, text, text, error ? "warn" : "info");
      await new Promise((r) => setTimeout(r, 250));
    }
    if (s.capability === "task.done" || s.capability === "task.fail") loop.reset();
    const sentence = stepSentence(words, s);
    const refused = s.source === "refused" || s.source === "failed" || s.reward === -1;
    monitor?.push({ kind: "outcome", outcome: s.outcome ?? s.source ?? "?", error: refused ? s.reason ?? void 0 : void 0, reward: typeof s.reward === "number" ? s.reward : void 0 });
    monitor?.push({ kind: "console", level: refused ? "refusal" : "info", message: sentence });
    if (typeof s.reward === "number") monitor?.push({ kind: "observation", values: { step: s.n ?? 0, reward: s.reward, ms: s.ms ?? 0 } });
    narrate("decision", sentence, sentence, refused ? "warn" : "info");
    log(refused ? "warn" : "info", `step ${num2(s.n)}: ${sentence}`);
  }
  log("info", `words: wording ${grammar ?? "?"}, ${words.listPhrases().length} phrases`);
  const readTasks = async () => {
    const s = await broker.session("factory");
    const r = await s.request("resources/read", { uri: TASKS_URI });
    const list2 = JSON.parse(r.contents[0]?.text ?? "[]");
    return list2.filter((t) => typeof t.taskId === "string").sort((a, b) => b.taskId.localeCompare(a.taskId));
  };
  const readTask = async (taskId) => {
    const r = await broker.call("factory", "task", { taskId });
    return r.ok ? r.output : null;
  };
  let followed = null;
  let loopTask = null;
  const loopFor = (taskId) => {
    if (loopTask !== taskId) loop.clear();
    loopTask = taskId;
  };
  let shown = 0;
  let finished = false;
  let busy = false;
  const known = /* @__PURE__ */ new Map();
  const pushed = /* @__PURE__ */ new Map();
  let again = null;
  const newestTask = () => [...known.keys()].sort((a, b) => b.localeCompare(a))[0];
  let firstLook = true;
  const beginTask = (t) => {
    const quiet = firstLook && !pinned && taskSel.value === "latest" && ended(t.state);
    firstLook = false;
    followed = t.taskId;
    loopFor(t.taskId);
    shown = 0;
    finished = false;
    lights.clear();
    monitor?.push({ kind: "reset" });
    const m = t.manifest;
    if (quiet) {
      shown = (m?.steps ?? []).length;
      finished = true;
      const values2 = { taskId: t.taskId, state: t.state, steps: shown };
      monitor?.push({ kind: "console", level: "info", message: p("page.lastTask", values2) });
      narrate("idle", p("page.lastTask", values2), p("page.lastTask.now", values2));
      log("info", `last task ${t.taskId} (${t.state}, ${shown} steps): not replayed; waiting for the next one`);
      return;
    }
    const outputs = (m?.signature?.outputs ?? []).map((o) => `${o.quantity}${o.unit ? ` (${o.unit})` : ""}`).join(", ");
    const values = { taskId: t.taskId, outputs: outputs || "?", topic: m?.topic ?? "?", builder: t.run?.builder ?? m?.provider?.name ?? "?", iterations: num2(m?.budget?.iterations), minutes: num2(m?.budget?.minutes), files: num2(t.files), recipes: m?.recipes?.loaded ? p("page.recipes.loaded", { experiences: num2(m.recipes.experiencesBefore) }) : p("page.recipes.none") };
    monitor?.push({ kind: "intention", id: t.taskId, description: p("page.task.description", values), guard: p("page.builderGuard"), reasoner: values.builder });
    monitor?.push({ kind: "console", level: "info", message: p("page.task.console", values) });
    narrate("task", p("page.task", values), p("page.task.now", values));
    log("info", `following task ${t.taskId} (${t.state})`);
  };
  const tick = async (full = false) => {
    if (busy) {
      again = { full: full || (again?.full ?? false) };
      return;
    }
    busy = true;
    try {
      if (full || !known.size) {
        pushed.clear();
        known.clear();
        for (const t2 of await readTasks()) known.set(t2.taskId, t2.state);
      }
      const tasks = [...known].map(([taskId, state]) => ({ taskId, state })).sort((a, b) => b.taskId.localeCompare(a.taskId));
      const options = [["latest", "latest task"], ...tasks.map((t2) => [t2.taskId, `${t2.taskId} \xB7 ${t2.state}`])];
      if (taskSel.options.length !== options.length) {
        const chosen = taskSel.value;
        taskSel.replaceChildren(...options.map(([value, label]) => Object.assign(document.createElement("option"), { value, textContent: label })));
        taskSel.value = options.some(([v]) => v === chosen) ? chosen : "latest";
      }
      const wanted = pinned ?? (taskSel.value !== "latest" ? taskSel.value : tasks[0]?.taskId);
      if (!wanted) {
        setStatus(p("page.noTask"), p("page.noTask.now"), true);
        return;
      }
      const t = pushed.get(wanted) ?? await readTask(wanted);
      if (!t) return;
      status = t;
      if (followed !== t.taskId) beginTask(t);
      const steps = t.manifest?.steps ?? [];
      const builder = t.run?.builder ?? t.manifest?.provider?.name ?? "?";
      setStatus(`${t.taskId} | ${builder} | ${t.state} | ${steps.length} step(s)${t.manifest?.recipes?.replayedSteps ? `, ${t.manifest.recipes.replayedSteps} replayed` : ""}${t.manifest?.proposal?.proposalId ? ` | proposal ${t.manifest.proposal.proposalId}` : ""}`, `${t.taskId} | ${builder} | ${t.state} | ${steps.length} steps`, t.state === "failed");
      for (; shown < steps.length; shown++) {
        await showStep(steps[shown]);
        if (!pinned && taskSel.value === "latest" && shown + 1 < steps.length) {
          const newest = newestTask();
          if (newest && newest !== followed) return;
        }
      }
      if (ended(t.state) && !finished) {
        finished = true;
        const sentence = endSentence(words, t);
        monitor?.push({ kind: "console", level: t.state === "failed" ? "error" : "info", message: sentence });
        narrate("end", sentence, sentence, t.state === "failed" ? "error" : "info");
        log(t.state === "failed" ? "warn" : "info", sentence);
      }
    } catch (e) {
      setStatus(`${p("page.notReachable")}: ${e instanceof Error ? e.message : String(e)}`, p("page.notReachable"), true);
    } finally {
      busy = false;
      if (again) {
        const { full: full2 } = again;
        again = null;
        void tick(full2);
      }
    }
  };
  taskSel.addEventListener("change", () => void tick());
  if (view().mode === "fit") {
    frame();
    setTimeout(frame, 300);
  } else {
    const first = byStage.get("observe");
    if (first) setTimeout(() => studio.centerOnNode(first, { threshold: 0, scale: view().zoom, animateMs: 0 }), 300);
  }
  monitor?.push({ kind: "console", level: "info", message: p("page.intro") });
  narrate("idle", p("page.waiting"), p("page.waiting.now"));
  await tick(true);
  const stream = watchSlot(
    brokerUrl,
    "factory",
    (update) => {
      if (update.uri !== TASKS_URI) return;
      const t = update.meta[META_TASK];
      if (t?.taskId) {
        known.set(t.taskId, t.state);
        pushed.set(t.taskId, t);
        void tick();
      } else void tick(true);
    },
    (open) => {
      log(open ? "info" : "warn", open ? "tasks: following them as the factory pushes them" : `tasks: the push stream dropped; looking every ${slowMs / 1e3} s until it is back`);
      if (open) void tick(true);
    }
  );
  setInterval(() => {
    if (!stream.open) void tick(true);
  }, slowMs);
}
export {
  activate as default
};
//# sourceMappingURL=factory-page.js.map
