// ui/studio-loop.ts
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
function findMonitor(viewer) {
  for (const n of viewer.nodes) {
    const d = n.item.data;
    if (d && d.renderableType === MONITOR_TYPE && typeof d.push === "function") return d;
  }
  return null;
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

// ui/room-skin.ts
var ROOM_SKIN_NAME = "control_room";
var TEAL = "#2fe0c8";
var TEAL_SOFT = "#7ad6cc";
var AMBER = "#ffb648";
var RED = "#ff5064";
var MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';
var SANS = 'ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif';
var ROOM_SKIN = {
  "--ne-color-primary": TEAL,
  "--ne-color-primary-bg": "rgba(47, 224, 200, 0.10)",
  "--ne-color-primary-bg-strong": "rgba(47, 224, 200, 0.22)",
  "--ne-color-bg": "#04090c",
  "--ne-color-surface": "#0a1c22",
  "--ne-color-surface-faint": "rgba(10, 28, 34, 0.5)",
  "--ne-color-surface-strong": "rgba(10, 28, 34, 0.92)",
  "--ne-color-surface-popover": "rgba(8, 22, 27, 0.98)",
  "--ne-color-node-header": "#0f2c32",
  "--ne-color-recessed-1": "rgba(0, 0, 0, 0.25)",
  "--ne-color-recessed-2": "rgba(0, 0, 0, 0.45)",
  "--ne-color-recessed-3": "rgba(0, 0, 0, 0.70)",
  "--ne-color-border": "rgba(64, 214, 200, 0.28)",
  "--ne-color-border-soft": "rgba(64, 214, 200, 0.16)",
  "--ne-color-border-strong": "rgba(64, 214, 200, 0.5)",
  "--ne-color-text": "#d3ecea",
  "--ne-color-text-strong": "#effffd",
  "--ne-color-text-muted": "#6d908e",
  "--ne-color-text-subtle": "#a6cbc7",
  "--ne-color-text-faint": "#4d6f6e",
  "--ne-color-success": TEAL,
  "--ne-color-success-bg": "rgba(47, 224, 200, 0.09)",
  "--ne-color-warning": AMBER,
  "--ne-color-danger": RED,
  "--ne-color-danger-bg": "rgba(255, 80, 100, 0.10)",
  "--ne-color-info": TEAL_SOFT,
  "--ne-color-connection": "rgba(122, 214, 204, 0.55)",
  // Every category a shade of the room's cold tones, so the teal accent stays the one thing that shines.
  "--ne-color-category-source": "#16414a",
  "--ne-color-category-sink": "#3a2a34",
  "--ne-color-category-compute": "#123238",
  "--ne-color-category-sensor": "#15394a",
  "--ne-color-category-fault": "#4a1e28",
  "--ne-color-category-environment": "#173d36",
  "--ne-color-category-composition": "#1b2e3a",
  "--ne-color-category-dsp": "#10383c",
  "--ne-color-category-geometry": "#2a2e44",
  "--ne-status-idle": "rgba(211, 236, 234, 0.22)",
  "--ne-status-transition": AMBER,
  "--ne-status-started": TEAL,
  "--ne-status-failed": RED,
  "--ne-status-disabled": "#4d6f6e",
  "--ne-shadow-sm": "0 2px 8px rgba(0, 0, 0, 0.5)",
  "--ne-shadow-md": "0 4px 18px rgba(0, 0, 0, 0.7)",
  "--ne-font-family": MONO,
  "--ne-font-mono": MONO,
  "--ne-font-sans": SANS
};
var S = `.ne-skin-${ROOM_SKIN_NAME}`;
var STYLE_ID = "room-skin-style";
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
function drawRoomSeries() {
  const c = this._canvas;
  if (!c) return;
  const dpr = devicePixelRatio || 1;
  const w = Math.max(50, c.clientWidth || 200);
  const h = c.clientHeight || 56;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const n = this._observations.length;
  if (n < 2) {
    g.fillStyle = "rgba(109, 144, 142, 0.8)";
    g.font = `9px ${MONO}`;
    g.fillText(n ? "one value so far" : "no value yet", 1, h / 2);
    return;
  }
  const x = (i) => i / (n - 1) * (w - 6) + 3;
  this.series.forEach((s, k) => {
    const values = this._observations.map((o) => typeof o[s.key] === "number" ? o[s.key] : NaN);
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return;
    const lo = s.min ?? Math.min(...finite);
    const hi = s.max ?? Math.max(...finite);
    const span = hi - lo || 1;
    const y = (v) => h - 4 - (v - lo) / span * (h - 10);
    const points = values.flatMap((v, i) => Number.isFinite(v) ? [[x(i), y(v)]] : []);
    if (k === 0) {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, `${s.color}40`);
      grad.addColorStop(1, `${s.color}00`);
      g.beginPath();
      g.moveTo(points[0][0], h);
      for (const [px, py] of points) g.lineTo(px, py);
      g.lineTo(points[points.length - 1][0], h);
      g.closePath();
      g.fillStyle = grad;
      g.fill();
    }
    g.lineWidth = k === 0 ? 1.8 : 1.2;
    g.lineJoin = "round";
    g.strokeStyle = s.color;
    g.beginPath();
    points.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py));
    g.stroke();
    const [lx, ly] = points[points.length - 1];
    g.beginPath();
    g.arc(lx, ly, 2.6, 0, Math.PI * 2);
    g.fillStyle = s.color;
    g.fill();
  });
}
function applyRoomSkin(viewer) {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = ROOM_STYLE;
    document.head.appendChild(style);
  }
  if (viewer.skins && viewer.setSkin) {
    viewer.skins.register(ROOM_SKIN_NAME, ROOM_SKIN);
    viewer.setSkin(ROOM_SKIN_NAME);
    const skinSel = document.querySelector(".nev2-skin-select");
    if (skinSel && ![...skinSel.options].some((o) => o.value === ROOM_SKIN_NAME)) {
      skinSel.appendChild(Object.assign(document.createElement("option"), { value: ROOM_SKIN_NAME, textContent: "Control room" }));
    }
    if (skinSel) skinSel.value = ROOM_SKIN_NAME;
  }
}
function roomMonitor(viewer) {
  const m = findMonitor(viewer);
  if (m && typeof m._drawSeries === "function") m._drawSeries = drawRoomSeries;
}
var ROOM_COLORS = { teal: TEAL, tealSoft: TEAL_SOFT, amber: AMBER, red: RED };

// ui/loader.ts
async function loadLoopExtension(studio, { pluginUrl, pluginGlobal, pluginId, defaultGraph, pageUrl, prepare }) {
  applyRoomSkin(studio.getViewer());
  if (pluginUrl) await studio.loadPlugin({ url: pluginUrl, globalName: pluginGlobal ?? "SpkPluginHarness", id: pluginId ?? "harness" });
  const graphUrl = new URLSearchParams(location.search).get("graph") ?? defaultGraph;
  const res = await fetch(graphUrl);
  if (!res.ok) throw new Error(`could not open ${graphUrl}: HTTP ${res.status}`);
  const json = await res.text();
  studio.openDocument(prepare ? prepare(json) : json);
  roomMonitor(studio.getViewer());
  if (!pageUrl) return;
  const page = await import(
    /* webpackIgnore: true */
    pageUrl
  );
  await page.default(studio);
}

// ui/map-loader.ts
var DEFAULT_GRAPH = "/graphs/harness-map.spikypanda";
var { teal, tealSoft, amber, red } = ROOM_COLORS;
var TINT_STYLE = `
.ne-node.hm-proposed { box-shadow: 0 0 0 1.5px ${amber} !important; }
.ne-node.hm-proposed .ne-node-header { background: rgba(255, 182, 72, 0.14) !important; color: #ffe0b0 !important; }
.ne-node.hm-today { box-shadow: 0 0 0 1px ${tealSoft} !important; }
.ne-node.hm-today .ne-node-header { background: rgba(47, 224, 200, 0.10) !important; color: ${teal} !important; }
.ne-node.hm-partial { box-shadow: 0 0 0 1.5px ${amber} !important; }
.ne-node.hm-partial .ne-node-header { background: rgba(255, 182, 72, 0.26) !important; color: #ffd08a !important; }
.ne-node.hm-missing { box-shadow: 0 0 0 1.5px ${red} !important; }
.ne-node.hm-missing .ne-node-header { background: rgba(255, 80, 100, 0.20) !important; color: #ffb3bd !important; }
.ne-node.hm-question { box-shadow: 0 0 0 1px #b9a7ff !important; }
.ne-node.hm-question .ne-node-header { background: rgba(185, 167, 255, 0.14) !important; color: #ddd3ff !important; }
`;
function frame(studio, labels, padding = 40) {
  const viewer = studio.getViewer();
  const { camera, viewport, host } = viewer;
  const shown = viewer.nodes.filter((n) => labels.has(n.label) && n.el.offsetParent !== null);
  if (!camera || !viewport || !host || !shown.length) return studio.fitToContent(padding);
  const boxes = shown.map((n) => ({ x: n.x, y: n.y, w: n.el.offsetWidth || 160, h: n.el.offsetHeight || 80 }));
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const width = Math.max(...boxes.map((b) => b.x + b.w)) - minX;
  const height = Math.max(...boxes.map((b) => b.y + b.h)) - minY;
  const scale = Math.min(1.2, (host.clientWidth - 2 * padding) / width, (host.clientHeight - 2 * padding) / height);
  camera.scale = scale;
  camera.x = (host.clientWidth - width * scale) / 2 - minX * scale;
  camera.y = (host.clientHeight - height * scale) / 2 - minY * scale;
  camera.apply(viewport);
  viewer.updateConnections?.();
}
async function load(studio) {
  await loadLoopExtension(studio, {
    pluginUrl: new URL("./SpkPluginHarness.js", import.meta.url).href,
    defaultGraph: DEFAULT_GRAPH
  });
  const s = studio;
  s.setLayout({ palette: false, properties: true, console: false, dashboardHeight: 0 });
  disableStudioPlayer("Cette carte se lit : rien n'y tourne.");
  const graphUrl = new URLSearchParams(location.search).get("graph") ?? DEFAULT_GRAPH;
  const legend = await fetch(graphUrl.replace(/\.spikypanda$/, ".zones.json")).then((r) => r.ok ? r.json() : null).catch(() => null);
  installLoopStyle(TINT_STYLE);
  for (const n of s.getViewer().nodes) {
    const tint = legend?.tints[n.label];
    if (tint) n.el.classList.add(`hm-${tint}`);
  }
  const toolbar = createBar("CARTE DU HARNAIS");
  toolbar.button("tout", "toute la carte", () => s.fitToContent(40));
  for (const zone of legend?.zones ?? []) {
    const members = new Set(zone.members);
    toolbar.button(zone.label, `cadrer la zone : ${zone.label}`, () => frame(s, members));
  }
  s.addBar(toolbar.bar);
  s.reveal?.();
  requestAnimationFrame(() => s.fitToContent(40));
}
export {
  load as default
};
//# sourceMappingURL=map.js.map
