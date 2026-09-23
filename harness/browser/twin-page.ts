/**
 * The twin in the studio: an extension of SpikyPanda's node editor v2
 * (`?ext=/agent/twin.js`) on the cabin's document (`graphs/cabin.spikypanda`),
 * the physics graph the `twin` slot runs headless to answer its questions.
 *
 * The graph does not run here. The twin computes; this page replays what it
 * computed, on the graph that computed it: every answer the slot gives
 * (`time_to_critical`, `sweep`) is kept with its whole trajectory, one row per
 * story minute, and pushed to its readers (`notifications/resources/updated`
 * on `twin://runs`, the run in `_meta`, `pushes.ts`). The page walks it minute
 * by minute: each node shows its value at that minute (the crew, the command,
 * the scrubber's rate and power, the cabin's CO2 and state, the reserve), the
 * cabin's header takes the colour of its state, and the studio's own tiles
 * (the Viz plugin, added to the document by `twin-plots.ts`) animate with it:
 * one time-series plot per quantity, wired on the canvas to the output it
 * shows, and a notes cell with the question, the minute and what it came to.
 * A sweep replays its flows one after another. Nothing is computed in the
 * browser: every number is the twin's.
 *
 * When it opens, the page shows the last question at its last minute without
 * replaying it (`replay` does); a question asked after that is replayed as it
 * arrives, unless a run is chosen in the list.
 *
 * URL: `?mcp=0&ext=/agent/twin.js` (the loader, `twin-loader.ts`)
 *      `&broker=<origin>` (default: the page's)
 *      `&seconds=6` how long one trajectory takes to replay
 *      `&slow=15000` ms between two looks at the runs while the push stream is down
 */
import { Broker } from "../lib/broker.js";
import { createBar, disableStudioPlayer, installLoopStyle, type Studio, type StudioNode } from "./studio-loop.js";
import { ROOM_COLORS } from "./room-skin.js";
import { watchSlot } from "./pushes.js";
import { NOTES_LABEL, PLOTS } from "./twin-plots.js";

const SOURCE = "twin";
/** What the twin slot pushes and publishes (`slots/twin/provider.ts`). */
const RUNS_URI = "twin://runs";
const META_RUN = "spikypanda/run";
/** `RUN_COLUMNS`, as indices into a row. */
const MINUTE = 0;
const CO2 = 1;
const RATE = 3;
const POWER = 4;
const SOC = 5;

interface Trajectory {
    label: string;
    flowPercent: number | null;
    command: Array<{ from: number; to: number; value: number }>;
    rows: number[][];
    summary: { peakPpm: number; peakAtMinute: number; finalPpm: number; finalState: string; minutesToElevated: number | null; minutesToCritical: number | null; scrubberEnergyWh: number; stateOfChargePercent: number };
}
interface Run {
    runId: string;
    tool: string;
    at: string;
    question: Record<string, unknown>;
    crew: Array<{ count: number; activity: string }>;
    startPpm: number;
    thresholds: { elevatedPpm: number; criticalPpm: number };
    trajectories: Trajectory[];
}

/** The parts of the Viz tiles this page writes. They are the plugin's internals, not a contract: a tile without them is left alone. */
interface LinePlot {
    _xs?: number[];
    _ys?: number[];
    _buildOptions?: () => { series?: Array<Record<string, unknown>>; axes?: Array<Record<string, unknown>> };
    _rebuildOnNextFrame?: boolean;
}
interface NotesCell {
    _content?: string;
    _renderView?: () => void;
}

const STYLE = `
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

const fmt = (v: number, digits = 0) => (Number.isFinite(v) ? v.toFixed(digits) : "?");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function activate(studio: Studio): Promise<void> {
    const params = new URLSearchParams(location.search);
    const brokerUrl = params.get("broker") ?? location.origin;
    const seconds = Math.max(1, Number(params.get("seconds") ?? 6));
    const slowMs = Math.max(2000, Number(params.get("slow") ?? 15000));
    const broker = new Broker(brokerUrl, { name: "studio-twin", version: "0.1.0" });
    const log = (level: "info" | "warn" | "error", message: string) => studio.log(level, SOURCE, message);

    installLoopStyle(STYLE);
    const viewer = studio.getViewer();
    studio.setLayout({ palette: false, properties: false, console: false, dashboardHeight: 300 });
    disableStudioPlayer("This graph is the cabin twin: the twin slot runs it to answer its questions; this page replays the answers.");

    // The document's ids (`cabin`, `scrubber`...) are stable; the viewer's are not. The labels join the two.
    const graphUrl = params.get("graph") ?? "/graphs/cabin.spikypanda";
    const doc = (await (await fetch(graphUrl)).json()) as { model?: { nodes?: Array<{ id: string; label?: string }> } };
    const byLabel = (label: string | undefined) => viewer.nodes.find((v) => v.label === label);
    const byId = new Map<string, StudioNode>();
    for (const n of doc.model?.nodes ?? []) {
        const shown = byLabel(n.label);
        if (shown) byId.set(n.id, shown);
    }
    const badges = new Map<string, HTMLElement>();
    for (const [id, node] of byId) {
        const badge = document.createElement("div");
        badge.className = "tw-val";
        node.el.appendChild(badge);
        badges.set(id, badge);
    }
    const setBadge = (id: string, text: string) => {
        const b = badges.get(id);
        if (b) b.textContent = text;
    };

    // The studio's tiles, found by their labels (`twin-plots.ts`).
    const plots = PLOTS.map((p) => ({ ...p, node: byLabel(p.label)?.item.data as LinePlot | undefined })).filter((p) => Array.isArray(p.node?._xs) && Array.isArray(p.node?._ys));
    const notes = byLabel(NOTES_LABEL)?.item.data as NotesCell | undefined;
    if (plots.length < PLOTS.length) log("warn", `plots: ${plots.length} of ${PLOTS.length} tiles found; the others stay empty`);
    // The plot's colours are written in the plugin (its own orange on a grey grid) and drawn on a canvas, out of the skin's
    // reach: each plot takes the room's, for its quantity, and is rebuilt once with them.
    for (const p of plots) {
        const node = p.node!;
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
            p.node!._xs!.length = 0;
            p.node!._ys!.length = 0;
        }
    };
    const plotRow = (row: number[]) => {
        for (const p of plots) {
            p.node!._xs!.push(row[MINUTE]);
            p.node!._ys!.push(row[p.column]);
        }
    };
    let lastNotes = "";
    const setNotes = (markdown: string) => {
        if (!notes || typeof notes._renderView !== "function" || markdown === lastNotes) return;
        lastNotes = markdown;
        notes._content = markdown;
        notes._renderView();
    };

    // ── One minute of one trajectory, on the graph and in the notes ─────────
    const stateOf = (run: Run, ppm: number) => (ppm >= run.thresholds.criticalPpm ? "critical" : ppm >= run.thresholds.elevatedPpm ? "elevated" : "nominal");
    const commandAt = (t: Trajectory, minute: number) => {
        const seg = t.command.find((s) => minute >= s.from && minute < s.to) ?? t.command.at(-1);
        return (seg?.value ?? 0) * 100;
    };
    const describe = (run: Run) => {
        const q = run.question;
        const crew = run.crew.map((c) => `${c.count} ${c.activity.replace("_", " ")}`).join(" + ");
        if (run.tool === "sweep") return `sweep of ${run.trajectories.length} flows (${run.trajectories.map((t) => t.label).join(", ")}) from ${fmt(run.startPpm)} ppm, crew ${crew}, ${q.minutes} min`;
        return `time to critical from ${fmt(run.startPpm)} ppm, crew ${crew}, scrubber ${run.trajectories[0]?.label ?? "?"}, ${q.horizonMinutes} min`;
    };
    const summaryOf = (t: Trajectory) => {
        const s = t.summary;
        const when = (m: number | null) => (m === null ? "never" : `minute ${m}`);
        return `**${t.label}**: peak ${fmt(s.peakPpm)} ppm at minute ${s.peakAtMinute}, final ${fmt(s.finalPpm)} ppm ${s.finalState}. ELEVATED ${when(s.minutesToElevated)}, CRITICAL ${when(s.minutesToCritical)}. Scrubber ${fmt(s.scrubberEnergyWh, 1)} Wh, reserve ${fmt(s.stateOfChargePercent, 2)} %.`;
    };

    function showMinute(run: Run, index: number, row: number[], done: Trajectory[]): void {
        const t = run.trajectories[index];
        const state = stateOf(run, row[CO2]);
        const horizon = t.rows.at(-1)?.[MINUTE] ?? row[MINUTE];
        const command = commandAt(t, row[MINUTE]);
        const [a, b] = [run.crew[0], run.crew[1] ?? { count: 0, activity: "sleep" }];
        setBadge("crew-a-count", String(a.count));
        setBadge("crew-a-activity", a.activity);
        setBadge("crew-b-count", String(b.count));
        setBadge("crew-b-activity", b.activity);
        setBadge("crew-a", `${a.count} × ${a.activity}`);
        setBadge("crew-b", `${b.count} × ${b.activity}`);
        setBadge("command", `${fmt(command)} %`);
        setBadge("scrubber", `${fmt(row[RATE], 3)} / min · ${fmt(row[POWER], 1)} W`);
        setBadge("cabin", `${fmt(row[CO2])} ppm · ${state.toUpperCase()}`);
        setBadge("battery", `${fmt(row[SOC], 2)} %`);
        setBadge("solver", `minute ${row[MINUTE]} / ${horizon}`);
        const cabin = byId.get("cabin");
        cabin?.el.classList.remove("tw-nominal", "tw-elevated", "tw-critical");
        cabin?.el.classList.add(`tw-${state}`);
        // The notes change with the state and the flow, not with every minute: the cell parses its markdown on each change.
        setNotes(
            [
                `### ${run.tool === "sweep" ? "Operating map" : "Time to critical"}`,
                describe(run),
                `${run.trajectories.length > 1 ? `Flow **${t.label}** (${index + 1} of ${run.trajectories.length}), cabin ` : "Cabin "}**${state.toUpperCase()}**, scrubber at ${fmt(command)} %.`,
                ...done.map(summaryOf),
            ].join("\n\n"),
        );
    }
    const links = (on: boolean) => {
        for (const c of viewer.connections) c.path.classList.toggle("hx-link-done", on);
    };

    /** Replays a run, minute by minute, into the nodes and the tiles; a newer replay cancels this one. */
    let playing = 0;
    async function replay(run: Run): Promise<void> {
        const token = ++playing;
        log("info", `replaying ${run.runId}: ${describe(run)}`);
        setStatus(`replaying: ${describe(run)}`);
        links(true);
        const each = run.trajectories.length > 1 ? Math.max(1.2, seconds / run.trajectories.length) : seconds;
        const done: Trajectory[] = [];
        for (const [index, t] of run.trajectories.entries()) {
            clearPlots();
            const delay = (each * 1000) / Math.max(1, t.rows.length);
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
            setStatus(`${runs.size} question(s) kept by the twin · shown: ${run.tool}`);
        }
    }
    /** A run shown where it ended, without replaying it: the last trajectory whole in the plots. */
    function still(run: Run): void {
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

    // ── Toolbar: the runs, replay, the board ───────────────────────────────
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
    const setStatus = (text: string, warn = false) => {
        badge.textContent = text;
        badge.title = text;
        badge.classList.toggle("warn", warn);
    };

    const runs = new Map<string, Run>();
    const chosen = (): Run | null => (runSel.value === "latest" ? [...runs.values()].at(-1) ?? null : runs.get(runSel.value) ?? null);
    const listRuns = () => {
        const value = runSel.value;
        const options: Array<[string, string]> = [["latest", "latest question"], ...[...runs.values()].reverse().map((r) => [r.runId, `${r.at.slice(11, 19)} · ${r.tool} · ${r.trajectories.map((t) => t.label).join(", ")}`] as [string, string])];
        runSel.replaceChildren(...options.map(([v, label]) => Object.assign(document.createElement("option"), { value: v, textContent: label })));
        runSel.value = options.some(([v]) => v === value) ? value : "latest";
    };
    runSel.addEventListener("change", () => {
        const run = chosen();
        if (run) void replay(run);
    });
    const add = (run: Run) => {
        runs.set(run.runId, run);
        while (runs.size > 12) runs.delete(runs.keys().next().value as string);
        listRuns();
    };
    const readRuns = async (): Promise<Run[]> => {
        const s = await broker.session("twin");
        const r = await s.request<{ contents: Array<{ text?: string }> }>("resources/read", { uri: RUNS_URI });
        return JSON.parse(r.contents[0]?.text ?? "[]") as Run[];
    };
    /** The runs as the twin keeps them: when the page opens, when the stream comes back, while it is down. */
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
            const run = update.meta[META_RUN] as Run | undefined;
            if (!run?.runId) return void catchUp();
            add(run);
            if (runSel.value === "latest") void replay(run);
        },
        (open) => {
            log(open ? "info" : "warn", open ? "runs: following the twin's answers as it pushes them" : `runs: the push stream dropped; looking every ${slowMs / 1000} s until it is back`);
            if (open) void catchUp();
        },
    );
    setInterval(() => {
        if (!stream.open) void catchUp();
    }, slowMs);
}
