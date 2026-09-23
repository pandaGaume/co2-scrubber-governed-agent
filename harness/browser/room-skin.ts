/**
 * The control room's skin for a loop page in the studio: the tokens of
 * `dashboard/room.css` (cold teal on near-black, amber for a refusal, red for
 * a stop, one monospace face) written as a studio skin, so the canvas, the
 * panels and the dashboard tiles read as the same instrument as the Control
 * Board.
 *
 * Three layers, because the studio themes only what reads its `--ne-*` tokens:
 * - the skin itself, registered in the viewer's `SkinRegistry` and applied
 *   (the canvas, the nodes, the toolbar, the dashboard's chrome);
 * - `ROOM_STYLE`, scoped to `.ne-skin-control_room` (the class the viewer puts
 *   on the app shell with the skin): the stage highlight and the run monitor
 *   tile, whose colours are written in the harness plugin and not in tokens;
 * - the monitor's strip drawn the way `app.js` draws the CO2 curve: a filled
 *   gradient under the first series, a 1.8 px line, a dot on the last value,
 *   sharp on a HiDPI screen.
 *
 * When `room.css` changes its tokens, these follow: the two pages are one
 * instrument and must not drift apart.
 */
import { findMonitor, type MonitorSeries, type MonitorTile, type StudioViewer } from "./studio-loop.js";

export const ROOM_SKIN_NAME = "control_room";

const TEAL = "#2fe0c8";
const TEAL_SOFT = "#7ad6cc";
const AMBER = "#ffb648";
const RED = "#ff5064";
const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';
const SANS = 'ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif';

/** `room.css`'s `:root`, in the studio's token contract. The surfaces are the room's panel colour made opaque: a node over the grid must not let the links show through. */
export const ROOM_SKIN: Readonly<Record<string, string>> = {
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
    "--ne-font-sans": SANS,
};

const S = `.ne-skin-${ROOM_SKIN_NAME}`;
const STYLE_ID = "room-skin-style";

/** The room's glow and grid behind the canvas, the stage highlight in teal, and the monitor tile in the room's panels, cards and pills. */
export const ROOM_STYLE = `
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

/** The monitor's fields the room's strip reads. They are the plugin's, not a contract: a monitor without them keeps its own drawing. */
interface MonitorInternals {
    series: MonitorSeries[];
    _canvas: HTMLCanvasElement | null;
    _observations: Array<Record<string, unknown>>;
    _drawSeries(): void;
}

/** The strip drawn as the control room draws the CO2 curve (`dashboard/app.js`, `drawCurve`). */
function drawRoomSeries(this: MonitorInternals): void {
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
    const x = (i: number) => (i / (n - 1)) * (w - 6) + 3;
    this.series.forEach((s, k) => {
        const values = this._observations.map((o) => (typeof o[s.key] === "number" ? (o[s.key] as number) : NaN));
        const finite = values.filter(Number.isFinite);
        if (!finite.length) return;
        const lo = s.min ?? Math.min(...finite);
        const hi = s.max ?? Math.max(...finite);
        const span = hi - lo || 1;
        const y = (v: number) => h - 4 - ((v - lo) / span) * (h - 10);
        const points = values.flatMap((v, i) => (Number.isFinite(v) ? [[x(i), y(v)] as const] : []));
        // The fill under the first series only: two gradients over each other read as mud.
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
        points.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
        g.stroke();
        const [lx, ly] = points[points.length - 1];
        g.beginPath();
        g.arc(lx, ly, 2.6, 0, Math.PI * 2);
        g.fillStyle = s.color;
        g.fill();
    });
}

/**
 * Puts the studio in the control room's skin: registers it with the viewer and
 * applies it (the studio's skin menu gets it as a choice, so it can be left
 * and come back to), installs the scoped style, and gives the monitor's strip
 * the room's drawing. Which series the strip draws stays the page's
 * (`MonitorTile.series`): the agent's cabin, the factory's rewards.
 */
export function applyRoomSkin(viewer: StudioViewer): void {
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = ROOM_STYLE;
        document.head.appendChild(style);
    }

    if (viewer.skins && viewer.setSkin) {
        viewer.skins.register(ROOM_SKIN_NAME, ROOM_SKIN);
        viewer.setSkin(ROOM_SKIN_NAME);
        const skinSel = document.querySelector<HTMLSelectElement>(".nev2-skin-select");
        if (skinSel && ![...skinSel.options].some((o) => o.value === ROOM_SKIN_NAME)) {
            skinSel.appendChild(Object.assign(document.createElement("option"), { value: ROOM_SKIN_NAME, textContent: "Control room" }));
        }
        if (skinSel) skinSel.value = ROOM_SKIN_NAME;
    }

    const m = findMonitor(viewer) as (MonitorTile & Partial<MonitorInternals>) | null;
    if (m && typeof m._drawSeries === "function") m._drawSeries = drawRoomSeries;
}

export const ROOM_COLORS = { teal: TEAL, tealSoft: TEAL_SOFT, amber: AMBER, red: RED } as const;
