/**
 * What every loop page in the studio shares (the agent's page, `tier3/browser/agent-page.ts`,
 * and the factory's, `factory-page.ts`): the part of the studio an extension
 * uses, the run monitor tile, the twelve stages found on the canvas, the
 * highlight that walks them one at a time, and the toolbar controls.
 *
 * The harness runs most stages in a millisecond; only the reasoner and the
 * execution take time. Shown as they happen, eleven nodes would light at
 * once. The highlight therefore plays behind the execution, one stage at a
 * time, each kept lit at least `dwellMs`, so the eye can follow the loop; a
 * page that replays steps read from a manifest paces them the same way.
 */

/** What the studio hands an extension (`window.Studio`), the part these pages use. */
export interface Studio {
    getViewer(): StudioViewer;
    addToolbarGroup(el: HTMLElement): HTMLElement;
    /** A full-width row under the top bar (the top bar is one line and already full). */
    addBar(el: HTMLElement): HTMLElement;
    log(level: "info" | "warn" | "error" | "watch", source: string, message: string): void;
    /** Frame the whole graph in the viewer. */
    fitToContent(padding?: number): void;
    /** Show or hide the studio's panels; the dashboard height in px. */
    setLayout(layout: { palette?: boolean; properties?: boolean; console?: boolean; dashboardHeight?: number }): void;
    /** Pan (and zoom) to a node when it is farther than `threshold` px from the centre; true when the view moved. */
    centerOnNode(node: StudioNode, options?: { threshold?: number; scale?: number; animateMs?: number }): boolean;
    /** Shows the studio, which starts hidden on an extension's page until the page is laid out (absent from a studio older than that). */
    reveal?(): void;
}
export interface StudioNode {
    id: string;
    label: string;
    el: HTMLElement;
    item: { data: unknown };
    inputs: Array<{ name: string }>;
    outputs: Array<{ name: string }>;
}
export interface StudioConnection {
    from: { name: string };
    to: { name: string };
    path: SVGPathElement;
    linkKind?: string;
}
export interface StudioViewer {
    nodes: StudioNode[];
    connections: StudioConnection[];
    /** The viewer's named skins (`--ne-*` token maps); `setSkin` applies one to the whole app shell. */
    skins?: { register(name: string, skin: Readonly<Record<string, string>>): void };
    setSkin?(name: string): void;
}
export interface MonitorTile {
    renderableType: string;
    push(event: Record<string, unknown>): void;
    /** What the strip draws: the keys of the observation values the page pushes. */
    series?: MonitorSeries[];
}
/** A series of the monitor's strip: the key of the observation values it reads, its label, its colour, its scale (none: the values seen). */
export interface MonitorSeries {
    key: string;
    label: string;
    color: string;
    min?: number;
    max?: number;
}

export const MONITOR_TYPE = "Harness.Monitor:trace";

export const LOOP_STYLE = `
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

export function installLoopStyle(extra = ""): void {
    const style = document.createElement("style");
    style.textContent = LOOP_STYLE + extra;
    document.head.appendChild(style);
}

/** The studio's transport (Run Once, Play, Step) fires nodes synchronously on its own session; a harness graph is stepped one decision at a time, so the transport is switched off. */
export function disableStudioPlayer(reason: string): void {
    for (const player of document.querySelectorAll<HTMLElement>(".nev2-player")) {
        player.classList.add("is-disabled");
        player.title = reason;
    }
}

/** The stage nodes on the canvas, by stage: the instances the studio created from the document carry their `stage`. */
export function stageNodes(viewer: StudioViewer): Map<string, StudioNode> {
    const byStage = new Map<string, StudioNode>();
    for (const n of viewer.nodes) {
        const stage = (n.item.data as { stage?: unknown } | undefined)?.stage;
        if (typeof stage === "string") byStage.set(stage, n);
    }
    return byStage;
}

export function findMonitor(viewer: StudioViewer): MonitorTile | null {
    for (const n of viewer.nodes) {
        const d = n.item.data as Partial<MonitorTile> | undefined;
        if (d && d.renderableType === MONITOR_TYPE && typeof d.push === "function") return d as MonitorTile;
    }
    return null;
}

/** The monitor is a tile of the dashboard; its node on the canvas would only take room from the loop. */
export function hideMonitorNode(viewer: StudioViewer): void {
    for (const n of viewer.nodes) if ((n.item.data as Partial<MonitorTile> | undefined)?.renderableType === MONITOR_TYPE) n.el.style.display = "none";
}

export type ViewMode = "fit" | "follow";
export interface ViewSettings {
    mode: ViewMode;
    /** follow: the view moves only when the lit node is farther than this from the centre, px. */
    threshold: number;
    zoom: number;
}

export type Cue = { stage: string; status: "start" | "error"; message?: string };

export interface StageLightsOptions {
    studio: Studio;
    viewer: StudioViewer;
    /** The stage nodes; a getter, because a page may find them after it connects. */
    byStage: () => Map<string, StudioNode>;
    view: () => ViewSettings;
    dwellMs?: number;
    /** The sentence for a stage as it lights, and the short form shown large; the next cue says which branch the loop took. */
    sentenceFor: (stage: string, next: string | undefined) => [string, string];
    /** The sentence when the harness stopped a step at a stage, and its short form. */
    stopped?: (stage: string, message: string) => [string, string];
    narrate: (stage: string, text: string, now?: string, level?: "info" | "warn" | "error") => void;
}

export interface StageLights {
    /** Queue a cue; the highlight plays it after the ones before. */
    cue(cue: Cue): void;
    /** Resolves once every queued cue has been shown. */
    settled(): Promise<void>;
    /** The node lit right now, if any. */
    lit(): StudioNode | null;
    clear(): void;
}

export function createStageLights({ studio, viewer, byStage, view, dwellMs = 350, sentenceFor, stopped, narrate }: StageLightsOptions): StageLights {
    const cues: Cue[] = [];
    let lit: StudioNode | null = null;
    let playing = false;
    const clear = () => {
        for (const n of byStage().values()) n.el.classList.remove("hx-lit", "hx-done", "hx-failed");
        for (const c of viewer.connections) c.path.classList.remove("hx-link-done");
        lit = null;
    };
    const markDone = (n: StudioNode) => {
        n.el.classList.remove("hx-lit");
        n.el.classList.add("hx-done");
        for (const c of viewer.connections) if (n.inputs.includes(c.to as never)) c.path.classList.add("hx-link-done");
    };
    const play = async () => {
        if (playing) return;
        playing = true;
        while (cues.length) {
            const cue = cues.shift() as Cue;
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
        // The last stage of a step ends lit; when nothing follows, it settles as done.
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
        clear,
    };
}

/** A row of the studio's own text controls (`nev2-tb-btn`, `nev2-tb-select`): the player's buttons are 32 px icons and would overlap. */
export function createBar(title: string): { bar: HTMLElement; badge: HTMLElement; select: (title: string, options: Array<[string, string]>, selected?: string) => HTMLSelectElement; button: (label: string, title: string, onClick: () => void) => HTMLButtonElement; numberInput: (title: string, value: number, step: number) => HTMLInputElement } {
    const bar = document.createElement("div");
    bar.className = "hx-bar";
    const titleEl = document.createElement("span");
    titleEl.className = "hx-title";
    titleEl.textContent = title;
    bar.appendChild(titleEl);
    const badge = document.createElement("span");
    badge.className = "hx-badge";
    const select = (title: string, options: Array<[string, string]>, selected?: string) => {
        const sel = document.createElement("select");
        sel.className = "nev2-tb-select";
        sel.title = title;
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
    const button = (label: string, title: string, onClick: () => void) => {
        const b = document.createElement("button");
        b.className = "nev2-tb-btn";
        b.textContent = label;
        b.title = title;
        b.addEventListener("click", () => void onClick());
        bar.appendChild(b);
        return b;
    };
    const numberInput = (title: string, value: number, step: number) => {
        const input = document.createElement("input");
        input.type = "number";
        input.className = "nev2-tb-select hx-threshold";
        input.min = "0";
        input.step = String(step);
        input.value = String(value);
        input.title = title;
        bar.appendChild(input);
        return input;
    };
    return { bar, badge, select, button, numberInput };
}

/** The view controls every loop page has: fit all, or follow the lit node beyond a threshold. */
export function viewControls(bar: ReturnType<typeof createBar>, initial: ViewSettings, studio: Studio, lit: () => StudioNode | null, first: () => StudioNode | undefined): { view: () => ViewSettings; frame: () => void } {
    const settings: ViewSettings = { ...initial };
    const frame = () => studio.fitToContent(28);
    const viewSel = bar.select("View: the whole loop framed, or the viewer following the lit node", [["fit", "fit all"], ["follow", "follow"]], settings.mode);
    const thresholdInput = bar.numberInput("follow threshold, px: the view moves only when the lit node is farther than this from the centre", settings.threshold, 20);
    viewSel.addEventListener("change", () => {
        settings.mode = viewSel.value as ViewMode;
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
