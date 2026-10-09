/**
 * The harness map in the studio (`?mcp=0&ext=/agent/map.js`, 2026-10-09): the harness plugin, then the map
 * (`graphs/harness-map.spikypanda`, built by `scripts/build-harness-map.ts`), and no page: the document is opened to be read and
 * analysed, nothing runs on it. The graph takes the room (the palette, the console and the dashboard put away, the properties
 * kept to read a node) and is framed whole; the bar frames one zone at a time, at a size where its labels read, and the proposed
 * nodes wear their tint (the idea, what exists of it today, in part, what is missing, a question). Zones and tints come from the
 * file next to the document (`<graph>.zones.json`); `&graph=<url>` opens another document the same way, without them when it has
 * none. The mechanism is `loader.ts`.
 */
import { loadLoopExtension, type LoaderStudio } from "./loader.js";
import { createBar, disableStudioPlayer, installLoopStyle, type Studio, type StudioNode } from "./studio-loop.js";
import { ROOM_COLORS } from "./room-skin.js";

const DEFAULT_GRAPH = "/graphs/harness-map.spikypanda";

type Tint = "proposed" | "today" | "partial" | "missing" | "question";
interface MapLegend {
    zones: Array<{ id: string; label: string; members: string[] }>;
    tints: Record<string, Tint>;
}

/** The part of the viewer `fitToContent` moves: framing a zone is the same move on the box of its nodes. */
interface Camera {
    x: number;
    y: number;
    scale: number;
    apply(viewport: HTMLElement): void;
}
interface FramingViewer {
    nodes: Array<StudioNode & { x: number; y: number }>;
    camera?: Camera;
    viewport?: HTMLElement;
    host?: HTMLElement;
    updateConnections?(): void;
}

const { teal, tealSoft, amber, red } = ROOM_COLORS;
const TINT_STYLE = `
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

/** Frames the nodes named, as `fitToContent` frames them all; the whole map when the viewer does not show its camera. */
function frame(studio: Studio, labels: ReadonlySet<string>, padding = 40): void {
    const viewer = studio.getViewer() as unknown as FramingViewer;
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

export default async function load(studio: LoaderStudio): Promise<void> {
    await loadLoopExtension(studio, {
        pluginUrl: new URL("./SpkPluginHarness.js", import.meta.url).href,
        defaultGraph: DEFAULT_GRAPH,
    });
    const s = studio as unknown as Studio;
    s.setLayout({ palette: false, properties: true, console: false, dashboardHeight: 0 });
    disableStudioPlayer("Cette carte se lit : rien n'y tourne.");
    const graphUrl = new URLSearchParams(location.search).get("graph") ?? DEFAULT_GRAPH;
    const legend = await fetch(graphUrl.replace(/\.spikypanda$/, ".zones.json"))
        .then((r) => (r.ok ? (r.json() as Promise<MapLegend>) : null))
        .catch(() => null);

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
    // Framed once the panels have moved, so the whole map fits the room they left.
    requestAnimationFrame(() => s.fitToContent(40));
}
