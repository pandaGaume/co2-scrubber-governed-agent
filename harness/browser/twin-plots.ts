/**
 * The twin's dashboard, made of the studio's own tiles (the Viz plugin):
 * a `Viz.Markdown:cell` that says the question and what it came to, and one
 * `Viz.Plot:line` per quantity the twin reports, each wired on the canvas to
 * the output it shows (the cabin's CO2, the scrubber's rate and power, the
 * reserve).
 *
 * They are added to the cabin's document as the page opens it
 * (`withTwinTiles`, called by `twin-loader.ts`), in the browser only:
 * `graphs/cabin.spikypanda` is what the twin runs headless, and it stays the
 * physics and nothing else. The page (`twin-page.ts`) finds them by label and
 * pours the twin's trajectory into them as it replays; the studio's dashboard
 * repaints them.
 */
import { ROOM_COLORS } from "./room-skin.js";

/** One plot: its label on the canvas, its legend, the output it is wired to, the column of a run's row it shows, its colour, where it sits. */
export interface TwinPlot {
    id: string;
    label: string;
    title: string;
    from: { node: string; port: string };
    column: number;
    color: string;
    at: { x: number; y: number };
    tile: { x: number; w: number };
}

export const NOTES_LABEL = "Twin: the question";
/** Where the tiles' nodes sit on the canvas: as laid out in the editor on 23 September 2026 (the notes under the solver, the plots in a column right of the reserve). */
const NOTES_AT = { x: -520, y: 60 };
export const PLOTS: ReadonlyArray<TwinPlot> = [
    { id: "plot-co2", label: "Plot: cabin CO2", title: "cabin CO2 (ppm)", from: { node: "cabin", port: "co2Ppm" }, column: 1, color: ROOM_COLORS.teal, at: { x: 1240, y: 340 }, tile: { x: 3, w: 3 } },
    { id: "plot-rate", label: "Plot: removal rate", title: "removal rate (/min)", from: { node: "scrubber", port: "effectiveRate" }, column: 3, color: ROOM_COLORS.tealSoft, at: { x: 1240, y: 200 }, tile: { x: 6, w: 2 } },
    { id: "plot-power", label: "Plot: scrubber power", title: "scrubber power (W)", from: { node: "scrubber", port: "power" }, column: 4, color: ROOM_COLORS.amber, at: { x: 1240, y: 60 }, tile: { x: 8, w: 2 } },
    { id: "plot-reserve", label: "Plot: night reserve", title: "night reserve (%)", from: { node: "battery", port: "stateOfChargePercent" }, column: 5, color: ROOM_COLORS.tealSoft, at: { x: 1240, y: -100 }, tile: { x: 10, w: 2 } },
];
const TILE_H = 4;
/** Enough for a day of story at one row per minute. */
const MAX_SAMPLES = 1500;

interface LayoutPort {
    name: string;
    type: string;
    direction: string;
}
interface Doc {
    layout: { nodes: Array<{ id: string; typeId: string; x: number; y: number; inputs: LayoutPort[]; outputs: LayoutPort[] }>; connections: unknown[] };
    model: { nodes: unknown[]; connections: unknown[] };
    dashboards?: Array<{ id: string; name: string; tiles: unknown[] }>;
}

/** The cabin's document with the twin's tiles added, as the studio saves a document it would have drawn them in. */
export function withTwinTiles(json: string): string {
    const doc = JSON.parse(json) as Doc;
    const tiles: unknown[] = [];

    doc.layout.nodes.push({ id: "twin-notes", typeId: "Viz.Markdown:cell", x: NOTES_AT.x, y: NOTES_AT.y, inputs: [], outputs: [] });
    doc.model.nodes.push({ id: "twin-notes", label: NOTES_LABEL, typeId: "Viz.Markdown:cell", data: { enabled: true, _content: "Waiting for a question to the twin.", _locked: true } });
    tiles.push({ nodeId: "twin-notes", renderableType: "Viz.Markdown:cell", x: 0, y: 0, w: 3, h: TILE_H });

    for (const p of PLOTS) {
        const source = doc.layout.nodes.find((n) => n.id === p.from.node);
        const portIndex = source?.outputs.findIndex((o) => o.name === p.from.port) ?? -1;
        doc.layout.nodes.push({ id: p.id, typeId: "Viz.Plot:line", x: p.at.x, y: p.at.y, inputs: [{ name: "value", type: "float", direction: "input" }], outputs: [] });
        doc.model.nodes.push({ id: p.id, label: p.label, typeId: "Viz.Plot:line", data: { enabled: true, _maxSamples: MAX_SAMPLES, _title: p.title, _yAuto: true, _yMin: -1, _yMax: 1, _maxPushHz: 0 } });
        if (source && portIndex >= 0) {
            const id = `${p.from.node}:${p.from.port}->${p.id}:value`;
            doc.layout.connections.push({ id, fromNodeId: p.from.node, fromPortIndex: portIndex, toNodeId: p.id, toPortIndex: 0 });
            doc.model.connections.push({ id, from: { node: p.from.node, port: p.from.port }, to: { node: p.id, port: "value" } });
        }
        tiles.push({ nodeId: p.id, renderableType: "Viz.Plot:line", x: p.tile.x, y: 0, w: p.tile.w, h: TILE_H });
    }

    doc.dashboards = [{ id: "main", name: "Main", tiles }];
    return JSON.stringify(doc);
}
