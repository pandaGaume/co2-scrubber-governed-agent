/**
 * The agent in the studio: an extension of SpikyPanda's node editor v2
 * (`?ext=/agent/tier3.js`) that runs the Tier 3 harness on the graph the
 * studio drew from `graphs/tier3-agent.spikypanda`, so every decision is
 * visible: the twelve stages light up in order, the run monitor tile shows
 * the intention, the proposal, the source (learned or reasoned), the
 * outcome and the rationale, the studio's console receives what the agent
 * says to the crew, and every call (the reasoner included) goes through the
 * broker and sits in its trace.
 *
 * Same pieces as the Node runner (`lib/broker`, `lib/capabilities`,
 * `lib/observer`, `lib/evaluator`, `providers/reasoner`, `agent`), bundled
 * for the page by `scripts/build-agent-page.mjs`, with `@spiky-panda/core`
 * and `@spiky-panda/harness` resolved to the studio's own copies
 * (`SpikypandaCore`, `SpkPluginHarness.harness`): the nodes the studio
 * instantiated and the runtime that executes them must share one harness.
 *
 * URL: `?mcp=0&ext=/agent/tier3.js` (the loader, `loader.ts`, brings the plugin and the document, then this page)
 *      `&scenario=/specs/scenario-night-9.json` (default) `&broker=<origin>` (default: the page's)
 *      `&locale=en` `&guard=measured|protected`
 *      `&autoplay=1` plays the whole scenario as soon as the agent is connected, one event after
 *      another with a pause between them (`&pause=4000` ms); the page the demo links to uses it,
 *      so opening it is enough to watch the loop run.
 *      `&llm=0` runs the scripted reasoner (prudent) instead of the model: no call to the model
 *      while the page itself is being worked on; `&view=follow&threshold=120&zoom=1` makes the
 *      viewer pan to the lit node when it is farther than the threshold from the centre.
 */
import { RuntimeGraphBuilder, type Channel } from "@spiky-panda/core";
import { HarnessNode, createRuntimeGraphDriver, validateHarnessGraph, type DecisionTrace, type HarnessGraph, type Intention, type StageEvent } from "@spiky-panda/harness";
import { Broker } from "../lib/broker.js";
import { AudioOutput } from "./audio-output.js";
import { StationVoice, eventSentence, outcomeSentence, proposalSentence, shortSentence } from "./station-voice.js";
import type { GuardMode } from "../lib/capabilities.js";
import { outcomeOf } from "../lib/evaluator.js";
import { ReasonerProvider } from "../providers/reasoner.js";
import { ScriptedProvider } from "../providers/scripted.js";
import type { Provider } from "../providers/provider.js";
import { createAgent, type Agent } from "../agent.js";
import type { Scenario, ScenarioEvent } from "../../lib/factory.js";

/** What the studio hands an extension (`window.Studio`), the part this page uses. */
interface Studio {
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
}
interface StudioNode {
    id: string;
    label: string;
    el: HTMLElement;
    item: { data: unknown };
    inputs: Array<{ name: string }>;
    outputs: Array<{ name: string }>;
}
interface StudioConnection {
    from: { name: string };
    to: { name: string };
    path: SVGPathElement;
    linkKind?: string;
}
interface StudioViewer {
    nodes: StudioNode[];
    connections: StudioConnection[];
}
interface MonitorTile {
    renderableType: string;
    push(event: Record<string, unknown>): void;
}

const MONITOR_TYPE = "Harness.Monitor:trace";
/** `claude-haiku-4-5-20251001` -> `claude-haiku-4-5`: the date suffix says nothing on a badge. */
const shortModel = (model: string) => model.replace(/^.*\//, "").replace(/-\d{8}$/, "").slice(0, 22);
const SOURCE = "tier3";
const STYLE = `
.tier3-bar { display: flex; align-items: center; gap: 8px; }
.tier3-title { font: 11px/1 var(--ne-font-mono, ui-monospace, Consolas, monospace); letter-spacing: 0.14em; color: var(--ne-color-text-muted, #8a8a9a); margin-right: 4px; }
.tier3-badge { font: 11px/1 var(--ne-font-mono, ui-monospace, Consolas, monospace); letter-spacing: 0.06em; color: #75e2ba; white-space: nowrap; padding: 0 6px; }
.tier3-badge.warn { color: #f0b06a; }
.tier3-threshold { width: 58px; padding-left: 4px; padding-right: 0; }
.ne-node.hx-lit { box-shadow: 0 0 0 3px #75e2ba, 0 0 28px 8px rgba(117, 226, 186, 0.6) !important; transition: box-shadow 120ms; }
.ne-node.hx-lit .ne-node-header { background: #1f8a62 !important; color: #ffffff !important; }
.ne-node.hx-done { box-shadow: 0 0 0 2px #3fb08a !important; }
.ne-node.hx-done .ne-node-header { background: #234a3c !important; }
.ne-node.hx-failed { box-shadow: 0 0 0 3px #e0574a, 0 0 28px 8px rgba(224, 87, 74, 0.6) !important; }
.ne-node.hx-failed .ne-node-header { background: #8a2f27 !important; color: #ffffff !important; }
.hx-link-done { stroke: #75e2ba !important; stroke-width: 3px !important; }
`;

/** The editor's graph as the harness executes it: the very node instances the studio drew, one static channel per drawn connection. */
function graphFromViewer(viewer: StudioViewer): { graph: HarnessGraph; byStage: Map<string, StudioNode> } {
    const byStage = new Map<string, StudioNode>();
    const nodes: HarnessNode[] = [];
    for (const n of viewer.nodes) {
        const data = n.item.data;
        if (data instanceof HarnessNode) {
            // The studio does not name runtime instances; the harness validates ids and the definition names nodes by stage.
            data.id = data.stage;
            nodes.push(data);
            byStage.set(data.stage, n);
        }
    }
    if (!nodes.length) throw new Error("the document has no harness nodes: open graphs/tier3-agent.spikypanda first");
    const ownerOf = (port: { name: string }, side: "inputs" | "outputs") => viewer.nodes.find((n) => n[side].includes(port as never));
    const builder = new RuntimeGraphBuilder<HarnessNode, Channel>().withMode("static").withNodes(...nodes);
    for (const c of viewer.connections) {
        if (c.linkKind === "config") continue;
        const from = ownerOf(c.from, "outputs")?.item.data;
        const to = ownerOf(c.to, "inputs")?.item.data;
        if (!(from instanceof HarnessNode) || !(to instanceof HarnessNode)) continue;
        builder.withChannel(from, to, c.from.name, c.to.name);
    }
    const graph = builder.build();
    validateHarnessGraph(graph);
    return { graph, byStage };
}

export default async function activate(studio: Studio): Promise<void> {
    const params = new URLSearchParams(location.search);
    const brokerUrl = params.get("broker") ?? location.origin;
    const scenarioUrl = params.get("scenario") ?? "/specs/scenario-night-9.json";
    const locale = params.get("locale") ?? "en";
    let guardMode: GuardMode = (params.get("guard") as GuardMode | null) ?? "measured";
    const autoplay = ["1", "true", "yes"].includes(params.get("autoplay") ?? "");
    const pauseMs = Number(params.get("pause") ?? 4000);
    // The model is switched off while the page itself is being worked on: the scripted reasoner plays the same loop for free.
    let llmEnabled = !["0", "false", "off", "no"].includes(params.get("llm") ?? "1");
    // Without the model: which scripted agent plays. `compliant` tries what it is told (the poisoned
    // procedure included), which is what makes the two guard profiles differ on screen.
    let scriptVariant: "prudent" | "compliant" = params.get("script") === "compliant" ? "compliant" : "prudent";
    // View: `fit` frames the whole loop; `follow` pans to the lit node when it drifts farther than `threshold` px from the centre.
    let viewMode: "fit" | "follow" = params.get("view") === "follow" ? "follow" : "fit";
    let followThreshold = Number(params.get("threshold") ?? 120);
    const followZoom = Number(params.get("zoom") ?? 1);

    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    const viewer = studio.getViewer();
    // The page shows the loop and its story, nothing else: no palette, no
    // property panel, no console (the tile has the crew's); the graph framed
    // whole, and framed again when the window changes.
    studio.setLayout({ palette: false, properties: false, console: false, dashboardHeight: 300 });
    const frame = () => studio.fitToContent(28);
    window.addEventListener("resize", () => {
        if (viewMode === "fit") frame();
    });
    // The studio's transport (Run Once, Play, Step) fires nodes synchronously on its own session; a harness
    // graph is stepped by the harness runtime, one decision at a time, so the transport is switched off
    // here rather than left to throw "Harness nodes require asynchronous execution with a HarnessSession".
    for (const player of document.querySelectorAll<HTMLElement>(".nev2-player")) {
        player.classList.add("is-disabled");
        player.title = "This graph is the agent's decision loop: it is run by the agent (play event, next), not by the studio's player.";
    }
    const scenario = (await (await fetch(scenarioUrl)).json()) as Scenario;
    const events = scenario.events.filter((e): e is ScenarioEvent & { intention: string } => Boolean(e.intention));

    // ── Toolbar ────────────────────────────────────────────────────────────
    // A row of its own under the top bar (the top bar is full), with the
    // studio's own text controls (`nev2-tb-btn`, `nev2-tb-select`): the
    // player's buttons are 32 px icons and would overlap. One line; the tile
    // carries the long texts.
    const bar = document.createElement("div");
    bar.className = "tier3-bar";
    const title = document.createElement("span");
    title.className = "tier3-title";
    title.textContent = "AGENT";
    bar.appendChild(title);
    const badge = document.createElement("span");
    badge.className = "tier3-badge";
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
    const guardSel = select("Guard profile: measured (every attempt visible, judged outside) or protected (the harness refuses power and set_min_flow itself)", [["measured", "guard measured"], ["protected", "guard protected"]], guardMode);
    const llmSel = select(
        "Reasoner: the model behind the broker's reasoner slot, or a scripted agent (no call to the model): prudent asks the physics and refuses the poisoned procedure; compliant does what it is told and gets refused",
        [["model", "LLM on"], ["prudent", "LLM off: prudent"], ["compliant", "LLM off: compliant"]],
        llmEnabled ? "model" : scriptVariant,
    );
    const viewSel = select("View: the whole loop framed, or the viewer following the lit node", [["fit", "fit all"], ["follow", "follow"]], viewMode);
    const thresholdInput = document.createElement("input");
    thresholdInput.type = "number";
    thresholdInput.className = "nev2-tb-select tier3-threshold";
    thresholdInput.min = "0";
    thresholdInput.step = "20";
    thresholdInput.value = String(followThreshold);
    thresholdInput.title = "follow threshold, px: the view moves only when the lit node is farther than this from the centre";
    bar.appendChild(thresholdInput);
    const eventSel = select("The scenario's events, in story order", events.map((e) => [e.intention, `${e.at}: ${e.intention}`] as [string, string]), events[0]?.intention);
    const playBtn = button("play", "set the board where the scenario is and let the agent decide until it hands back", () => void playEvent(events.find((e) => e.intention === eventSel.value) ?? events[0]));
    const nextBtn = button("next", "one decision of the current event", () => void step());
    const resetBtn = button("reset", "reset the board to the scenario's start and rebuild the agent", () => void reset());
    const allBtn = button("all", "reset, then play the four events one after another, with a pause between them", () => void playAll());
    // The page as an audio output of the speech slot: off until a click (browsers play nothing before a gesture).
    const soundBtn = button("sound off", "play what the tiers say through the speech slot (speech.say); the page is one output, the slot keeps the queue", () => {
        if (audio.enabled) {
            audio.disable();
            soundBtn.textContent = "sound off";
        } else {
            audio.enable();
            soundBtn.textContent = "sound on";
        }
    });
    bar.appendChild(badge);
    studio.addBar(bar);
    const eventButtons = [playBtn, nextBtn, allBtn];

    // ── Wiring ─────────────────────────────────────────────────────────────
    let agent: Agent | null = null;
    let byStage = new Map<string, StudioNode>();
    /** Built once per page: `withChannel` pushes channels into the node instances' own link arrays, so a second build on the same instances would double every channel (and overflow a slot of capacity 1). */
    let built: { graph: HarnessGraph; byStage: Map<string, StudioNode> } | null = null;
    let monitor: MonitorTile | null = null;
    let current: (ScenarioEvent & { intention: string }) | null = null;
    let busy = false;
    const world = new Broker(brokerUrl, { name: "studio-world", version: "0.1.0" });
    // One output per page instance: two pages named alike would both be allowed to take (and say) everything.
    const audio = new AudioOutput(world, `page-${Math.random().toString(36).slice(2, 8)}`, {
        onPlay: (u) => {
            monitor?.push({ kind: "narrate", stage: "speech", text: `${u.voice} says: ${u.text}`, level: "info" });
            log("info", `speech: ${u.voice} says "${u.text}"`);
        },
        onDone: (u, ms) => log("info", `speech: ${u.utteranceId} played in ${ms} ms`),
        onError: (m) => log("warn", `speech output: ${m}`),
    });
    // The station's voice says, in short sentences, what the loop shows: on when the sound is on (`?voice=0` keeps it quiet).
    const voiceOn = !["0", "false", "off", "no"].includes(params.get("voice") ?? "1");
    const voice = new StationVoice(world, params.get("speaker") ?? "station", () => voiceOn && audio.enabled, (m) => log("warn", `station voice: ${m}`));
    /** With the sound on, the voice paces the loop: nothing new until what was said has been heard. */
    const heard = async () => {
        if (!audio.enabled) return;
        await voice.idle();
        await audio.idle();
    };

    /** The badge holds a few words; the whole text sits in its tooltip. */
    /** The last observation, for the sentences the tile shows. */
    let lastObs: { co2Ppm: number; co2State: string; speedPercent: number; power: boolean } | null = null;
    /** The last capability call of the current step, for the "execute" sentence. */
    let lastCall: { id: string; input: unknown; outcome: string; error?: string } | null = null;
    const narrate = (stage: string, text: string, now?: string, level: "info" | "warn" | "error" = "info") => monitor?.push({ kind: "narrate", stage, text, now, level });
    const cabinText = () => (lastObs ? `CO2 ${Math.round(lastObs.co2Ppm)} ppm, ${lastObs.co2State}, scrubber ${lastObs.power ? `${Math.round(lastObs.speedPercent)} %` : "off"}` : "reading the board");
    const modelName = () => agent?.provider.model ?? "the model";
    /** One sentence per stage, said when the node lights; the next cue tells which branch the loop took. */
    const sentenceFor = (stage: string, next: string | undefined): [string, string] => {
        switch (stage) {
            case "observe":
                return [`Reading the cabin: ${cabinText()}`, `Observing the cabin: ${cabinText()}`];
            case "context":
                return [`Situation "${current?.intention ?? "?"}" at minute ${current?.at ?? "?"}, cabin ${lastObs?.co2State ?? "?"}`, `This situation: ${current?.intention ?? "?"}, cabin ${lastObs?.co2State ?? "?"}`];
            case "lookup":
                return ["Looking for a decision already learned in this situation", "Any decision learned for this situation?"];
            case "gate":
                return next === "request" ? ["No trusted decision yet: the reasoner will be asked", "Nothing learned yet: asking the reasoner"] : next === "merge" ? ["A learned decision is trusted: no call to the reasoner", "Learned decision replayed, the reasoner is not asked"] : ["Is a learned decision confident enough?", "Confident enough?"];
            case "request":
                return [`Building the request: the state, the intention, ${agent?.catalogue.length ?? "?"} allowed tools`, `Preparing the request for ${modelName()}`];
            case "reason":
                return [`Asking ${modelName()} through the broker's reasoner slot`, `Asking ${modelName()}...`];
            case "merge":
                return ["The proposal is in: one tool call, with its rationale", "The model proposed one action"];
            case "guard":
                return [`Checking the proposal: replay policy, guard profile (${guardMode}), single-use authorization`, "Checking the proposal against the guard"];
            case "execute":
                return lastCall ? [`Calling ${lastCall.id} through the broker: ${lastCall.outcome}${lastCall.error ? ` (${lastCall.error})` : ""}`, `${lastCall.id}: ${lastCall.outcome}`] : ["Calling the tool through the broker", "Calling through the broker..."];
            case "observe-after":
                return [`Reading the cabin again: ${cabinText()}`, `The cabin now: ${cabinText()}`];
            case "evaluate":
                return ["Judging the outcome: did the cabin improve, was the call refused?", "Judging the outcome"];
            case "record":
                return ["Remembering this decision and its outcome for the next time this situation comes", "Learned for next time"];
            default:
                return [stage, stage];
        }
    };

    const setStatus = (text: string, short?: string, warn = false) => {
        badge.textContent = short ?? text;
        badge.title = text;
        badge.classList.toggle("warn", warn);
    };
    const log = (level: "info" | "warn" | "error", message: string) => studio.log(level, SOURCE, message);
    const findMonitor = (): MonitorTile | null => {
        for (const n of viewer.nodes) {
            const d = n.item.data as Partial<MonitorTile> | undefined;
            if (d && d.renderableType === MONITOR_TYPE && typeof d.push === "function") return d as MonitorTile;
        }
        return null;
    };
    const clearHighlight = () => {
        for (const n of byStage.values()) n.el.classList.remove("hx-lit", "hx-done", "hx-failed");
        for (const c of viewer.connections) c.path.classList.remove("hx-link-done");
    };
    const markDone = (n: StudioNode) => {
        n.el.classList.remove("hx-lit");
        n.el.classList.add("hx-done");
        for (const c of viewer.connections) if (n.inputs.includes(c.to as never)) c.path.classList.add("hx-link-done");
    };

    // The harness runs most stages in a millisecond; only the reasoner and the
    // execution take time. Shown as they happen, eleven nodes would light at
    // once. The highlight therefore plays behind the execution, one stage at a
    // time, each kept lit at least `DWELL` ms, so the eye can follow the loop.
    const DWELL = 350;
    type Cue = { stage: string; status: "start" | "error"; message?: string };
    const cues: Cue[] = [];
    let lit: StudioNode | null = null;
    let playing = false;
    const playCues = async () => {
        if (playing) return;
        playing = true;
        while (cues.length) {
            const cue = cues.shift() as Cue;
            const n = byStage.get(cue.stage);
            if (!n) continue;
            if (cue.status === "start") {
                if (cue.stage === "observe") {
                    clearHighlight();
                    lit = null;
                }
                if (lit && lit !== n) markDone(lit);
                n.el.classList.add("hx-lit");
                lit = n;
                if (viewMode === "follow") studio.centerOnNode(n, { threshold: followThreshold, scale: followZoom, animateMs: 220 });
                const [text, now] = sentenceFor(cue.stage, cues[0]?.stage);
                narrate(cue.stage, text, now);
                await new Promise((r) => setTimeout(r, DWELL));
            } else {
                n.el.classList.remove("hx-lit");
                n.el.classList.add("hx-failed");
                lit = null;
                narrate(cue.stage, `Stopped at ${cue.stage}: ${cue.message ?? "refused"}`, `Stopped by the harness: ${cue.message ?? "refused"}`, "error");
            }
        }
        // The last stage of a step ends lit; when nothing follows, it settles as done.
        if (lit && lit === byStage.get("record")) {
            markDone(lit);
            lit = null;
        }
        playing = false;
    };
    const onStage = (event: StageEvent) => {
        monitor?.push({ kind: "stage", stage: event.stage, status: event.status, message: event.message });
        if (event.status === "start") cues.push({ stage: event.stage, status: "start" });
        else if (event.status === "error") {
            cues.push({ stage: event.stage, status: "error", message: event.message });
            log("error", `${event.stage}: ${event.message ?? "failed"}`);
            monitor?.push({ kind: "console", level: "error", message: `${event.stage}: ${event.message ?? "failed"}` });
        }
        void playCues();
    };

    async function connect(): Promise<void> {
        setStatus("connecting to the broker...", "connecting...");
        const boot = new Broker(brokerUrl, { name: "studio-agent", version: "0.1.0" });
        let provider: Provider;
        if (llmEnabled) {
            const remote = await ReasonerProvider.connect(boot);
            if (!remote.description.ready) {
                setStatus(`reasoner not ready: ${remote.description.reason}`, "reasoner: no key", true);
                log("warn", `reasoner not ready: ${remote.description.reason}`);
            }
            provider = remote;
        } else {
            provider = new ScriptedProvider(scriptVariant);
            log("info", `reasoner: scripted ${scriptVariant} (no call to the model)`);
        }
        const broker = new Broker(brokerUrl, { name: provider.family, version: "0.1.0", locale });
        if (provider instanceof ReasonerProvider) provider.useBroker(broker);
        // What is proposed is said as soon as it is proposed, before the guard and the call: the first sentence of the answer.
        const resolve = provider.resolve.bind(provider);
        provider.resolve = async (input) => {
            const decision = await resolve(input);
            voice.say(proposalSentence(decision.rationale));
            return decision;
        };
        if (!built) built = graphFromViewer(viewer);
        byStage = built.byStage;
        monitor = findMonitor();
        // The monitor is a tile of the dashboard; its node on the canvas would only take room from the loop.
        for (const n of viewer.nodes) if ((n.item.data as Partial<MonitorTile> | undefined)?.renderableType === MONITOR_TYPE) n.el.style.display = "none";
        agent = await createAgent({
            broker,
            provider,
            guardMode,
            driver: createRuntimeGraphDriver(built.graph),
            onStage,
            approve: async (decision) => {
                log("warn", `approval requested for ${decision.invocation.capabilityId}: denied (no operator at the console)`);
                return false;
            },
            onCall: (call) => {
                lastCall = { id: call.id, input: call.input, outcome: call.result.outcome, error: call.result.error };
                voice.say(outcomeSentence(call));
                // The call and its answer, on the decision's card: the twin's numbers, the device's refusal, as they came back.
                if (call.slot !== "crew") monitor?.push({ kind: "call", capabilityId: call.id, input: call.input, output: call.result.output, outcome: call.result.outcome, error: call.result.error, latencyMs: call.latencyMs });
                if (call.slot === "crew") {
                    monitor?.push({ kind: "console", level: call.tool === "ask" ? "ask" : "crew", message: String((call.input as { message?: string })?.message ?? "") });
                    log("info", `${call.tool}: ${String((call.input as { message?: string })?.message ?? "")}`);
                } else if (!call.result.ok) {
                    monitor?.push({ kind: "console", level: call.result.outcome === "deny" ? "refusal" : "refusal", message: `${call.id}: ${call.result.error ?? call.result.outcome}` });
                    log("warn", `${call.id}: ${call.result.error ?? call.result.outcome}`);
                }
            },
        });
        const sessions = await broker.describeSessions();
        const grammar = sessions.filter((s) => !s.slot.startsWith("_") && s.slot !== "reasoner").map((s) => `${s.slot}=${s.grammar ?? "none"}`).join(" ");
        // The badge says what the profile did to the tool list: protected withholds power and set_min_flow (`never`), 18 tools offered instead of 20 (with the speech slot).
        const offered = agent.catalogue.filter((c) => c.replayPolicy !== "never").length;
        const withheld = agent.catalogue.filter((c) => c.replayPolicy === "never").map((c) => c.id);
        setStatus(`${provider.name} (${provider.model}) | guard ${guardMode}: ${offered} tools offered${withheld.length ? `, withheld: ${withheld.join(", ")}` : ""} | grammars ${grammar}`, `${llmEnabled ? shortModel(provider.model) : `no LLM, ${scriptVariant}`} | ${guardMode}: ${offered} tools`, !llmEnabled);
        log("info", `agent ready: ${provider.name}, guard ${guardMode}, grammars ${grammar}`);
        if (viewMode === "fit") {
            frame();
            setTimeout(frame, 300);
        } else {
            const first = byStage.get("observe");
            if (first) setTimeout(() => studio.centerOnNode(first, { threshold: 0, scale: followZoom, animateMs: 0 }), 300);
        }
    }

    async function observeForMonitor(): Promise<void> {
        const r = await world.call("scrubber", "motor.state", {});
        if (!r.ok || !r.output || typeof r.output !== "object") return;
        const st = r.output as Record<string, number | string | boolean>;
        lastObs = { co2Ppm: Number(st.co2Ppm), co2State: String(st.co2State), speedPercent: Number(st.speedPercent), power: st.power === true };
        monitor?.push({ kind: "observation", values: { co2Ppm: lastObs.co2Ppm, speedPercent: lastObs.speedPercent, co2State: lastObs.co2State, power: lastObs.power } });
    }

    async function step(): Promise<DecisionTrace | null> {
        if (!agent || !current || busy) return null;
        busy = true;
        try {
            const intention: Intention = { id: current.intention, description: current.message, parameters: { minute: current.at } };
            let trace: DecisionTrace;
            try {
                trace = await agent.decide(intention);
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                while (playing || cues.length) await new Promise((r) => setTimeout(r, 50));
                monitor?.push({ kind: "outcome", outcome: "stopped", error: message });
                log("warn", `stopped by the harness: ${message}`);
                voice.say(shortSentence(`Stopped by the harness: ${message}`));
                await observeForMonitor();
                lastCall = null;
                return null;
            }
            const outcome = outcomeOf(trace);
            await observeForMonitor();
            // Let the highlight catch up, so the summary lands after the last stage lit.
            while (playing || cues.length) await new Promise((r) => setTimeout(r, 50));
            monitor?.push({ kind: "decision", capabilityId: trace.decision.invocation.capabilityId, input: trace.decision.invocation.input, source: trace.source, rationale: trace.decision.rationale });
            monitor?.push({ kind: "outcome", outcome, error: trace.result.error, reward: trace.evaluation.reward });
            const id = trace.decision.invocation.capabilityId;
            const said = id.startsWith("crew.") ? `The agent ${id === "crew.ask" ? "asks the crew" : "reports to the crew"}` : `Decision: ${id}, ${outcome}${trace.result.error ? ` (${trace.result.error})` : ""}`;
            narrate("decision", said, said, outcome === "refused" || outcome === "deny" ? "warn" : "info");
            lastCall = null;
            await heard();
            return trace;
        } finally {
            busy = false;
        }
    }

    /** Sets the board where the scenario says the event happens, then lets the agent decide until it hands back (report or ask) or six decisions. */
    async function playEvent(event: ScenarioEvent & { intention: string }): Promise<void> {
        if (!agent) await connect();
        if (!agent || busy) return;
        current = event;
        if (event.world?.cabin) await world.call("scrubber", "debug.set_co2", { state: event.world.cabin.state, ppm: event.world.cabin.ppm });
        agent.provider.begin?.(event.intention);
        monitor?.push({ kind: "intention", id: event.intention, description: event.message, minute: event.at, guard: `${guardMode} (${agent.catalogue.filter((c) => c.replayPolicy !== "never").length} tools offered)`, reasoner: agent.provider.name });
        log("info", `[minute ${event.at}] ${event.intention}: ${event.message ?? ""}`);
        voice.say(eventSentence(event), "high");
        await observeForMonitor();
        await heard();
        for (const b of eventButtons) b.disabled = true;
        try {
            for (let i = 0; i < 6; i++) {
                const trace = await step();
                if (!trace) continue;
                const id = trace.decision.invocation.capabilityId;
                if (id === "crew.report" || id === "crew.ask") break;
            }
        } finally {
            for (const b of eventButtons) b.disabled = false;
        }
    }

    /** The whole scenario, event after event: what the page does on its own when opened with `autoplay`. */
    let playingAll = false;
    async function playAll(): Promise<void> {
        if (playingAll) return;
        playingAll = true;
        try {
            await reset();
            for (const [i, event] of events.entries()) {
                eventSel.value = event.intention;
                await playEvent(event);
                if (i < events.length - 1) {
                    monitor?.push({ kind: "console", level: "info", message: `next event in ${Math.round(pauseMs / 1000)} s: ${events[i + 1].intention} (minute ${events[i + 1].at})` });
                    await new Promise((r) => setTimeout(r, pauseMs));
                }
            }
            monitor?.push({ kind: "console", level: "info", message: "scenario complete: play all to replay, or pick an event" });
            log("info", "scenario complete");
        } finally {
            playingAll = false;
        }
    }

    async function reset(): Promise<void> {
        for (const [tool, args] of [
            ["debug.set_co2", { state: "NOMINAL", ppm: scenario.start.co2Ppm }],
            ["scrubber.power", { on: true }],
            ["motor.set_speed", { percent: scenario.start.scrubberCommandPercent }],
        ] as const) await world.call("scrubber", tool, { ...args });
        clearHighlight();
        monitor?.push({ kind: "reset" });
        agent = null;
        current = null;
        await connect();
        await observeForMonitor();
    }

    guardSel.addEventListener("change", () => {
        guardMode = guardSel.value as GuardMode;
        agent = null; // rebuilt with the new profile on the next event
        setStatus(`guard ${guardMode}: the agent is rebuilt on the next event`, `guard ${guardMode}: next event`);
    });
    llmSel.addEventListener("change", () => {
        llmEnabled = llmSel.value === "model";
        if (!llmEnabled) scriptVariant = llmSel.value === "compliant" ? "compliant" : "prudent";
        agent = null; // rebuilt with the chosen reasoner on the next event
        setStatus(llmEnabled ? "model: the agent is rebuilt on the next event" : "scripted reasoner: no call to the model from the next event", llmEnabled ? "model: next event" : "scripted: next event", !llmEnabled);
    });
    viewSel.addEventListener("change", () => {
        viewMode = viewSel.value as "fit" | "follow";
        if (viewMode === "fit") frame();
        else {
            const target = lit ?? byStage.get("observe");
            if (target) studio.centerOnNode(target, { threshold: 0, scale: followZoom, animateMs: 250 });
        }
    });
    thresholdInput.addEventListener("change", () => {
        followThreshold = Math.max(0, Number(thresholdInput.value) || 0);
    });
    nextBtn.title = "one decision of the current event (play an event first)";
    resetBtn.title = "reset the board to the scenario's start and rebuild the agent";
    playBtn.title = "set the board where the selected event happens and let the agent decide until it hands back";

    try {
        await connect();
        await observeForMonitor();
    } catch (e) {
        setStatus(`not connected: ${e instanceof Error ? e.message : String(e)}`, "not connected", true);
        log("error", `agent: ${e instanceof Error ? e.message : String(e)}`);
        return;
    }
    // `monitor` is assigned inside connect(), which the type narrowing above cannot see.
    const tile = findMonitor();
    if (autoplay) {
        tile?.push({ kind: "console", level: "info", message: "autoplay: the scenario starts in 2 s" });
        await new Promise((r) => setTimeout(r, 2000));
        await playAll();
    } else {
        tile?.push({ kind: "console", level: "info", message: "ready: pick an event and press play event, or play all" });
        narrate("idle", "Ready. Pick an event and press play event, or play all.", "Ready: pick an event, press play event");
    }
}
