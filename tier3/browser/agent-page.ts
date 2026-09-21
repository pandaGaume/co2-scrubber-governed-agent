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
 * `lib/observer`, `lib/evaluator`, `providers/reasoner`, `agent`), and the
 * studio-page pieces every loop page shares (`harness/browser/studio-loop.ts`:
 * the stage highlight, the monitor tile, the toolbar controls), bundled
 * for the page by `scripts/build-agent-page.ts`, with `@spiky-panda/core`
 * and `@spiky-panda/harness` resolved to the studio's own copies
 * (`SpikypandaCore`, `SpkPluginHarness.harness`): the nodes the studio
 * instantiated and the runtime that executes them must share one harness.
 *
 * Every sentence the page says or shows is a phrase of the station slot's
 * wording (`slots/station/grammars/default/<locale>.json`), read on the
 * page's session as `grammar://phrases` in the page's language; nothing is
 * written here (`station-voice.ts`, `harness/browser/words.ts`).
 *
 * URL: `?mcp=0&ext=/agent/tier3.js` (the loader, `loader.ts`, brings the plugin and the document, then this page)
 *      `&scenario=/specs/scenario-night-9.json` (default) `&broker=<origin>` (default: the page's)
 *      `&locale=en` (the wording the agent's sessions get from the slots and the language of the station's
 *      sentences, en-US by default: the scenario's messages and the model's words are English) `&guard=measured|protected`
 *      `&autoplay=1` plays the whole scenario as soon as the agent is connected, one event after
 *      another with a pause between them (`&pause=4000` ms); the page the demo links to uses it,
 *      so opening it is enough to watch the loop run.
 *      `&llm=0` runs the scripted reasoner (prudent) instead of the model: no call to the model
 *      while the page itself is being worked on; `&view=follow&threshold=120&zoom=1` makes the
 *      viewer pan to the lit node when it is farther than the threshold from the centre.
 */
import { RuntimeGraphBuilder, type Channel } from "@spiky-panda/core";
import { HarnessNode, createRuntimeGraphDriver, validateHarnessGraph, type DecisionTrace, type HarnessGraph, type Intention, type StageEvent } from "@spiky-panda/harness";
import { Broker } from "../../harness/lib/broker.js";
import { AudioOutput } from "./audio-output.js";
import { StationVoice, eventSentence, outcomeSentence, proposalSentence, shortSentence, speechHeard } from "./station-voice.js";
import type { GuardMode } from "../lib/capabilities.js";
import { outcomeOf } from "../lib/evaluator.js";
import { ReasonerProvider } from "../../harness/providers/reasoner.js";
import { ScriptedProvider } from "../../harness/providers/scripted.js";
import type { Provider } from "../../harness/lib/provider.js";
import { createAgent, type Agent } from "../agent.js";
import type { Scenario, ScenarioEvent } from "../../lib/factory.js";
import { createBar, createStageLights, disableStudioPlayer, findMonitor, hideMonitorNode, installLoopStyle, viewControls, type MonitorTile, type Studio, type StudioNode, type StudioViewer, type ViewMode } from "../../harness/browser/studio-loop.js";
import { loadWords, NO_WORDS, type Words } from "../../harness/browser/words.js";

/** `claude-haiku-4-5-20251001` -> `claude-haiku-4-5`: the date suffix says nothing on a badge. */
const shortModel = (model: string) => model.replace(/^.*\//, "").replace(/-\d{8}$/, "").slice(0, 22);
const SOURCE = "tier3";

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
    const locale = params.get("locale") ?? "en-US";
    // The station's sentences and the agent's sessions share the page's language: one wording, so nothing said is in another language than what is shown.
    const pageLocale = locale;
    let guardMode: GuardMode = (params.get("guard") as GuardMode | null) ?? "measured";
    const autoplay = ["1", "true", "yes"].includes(params.get("autoplay") ?? "");
    const pauseMs = Number(params.get("pause") ?? 4000);
    // The model is switched off while the page itself is being worked on: the scripted reasoner plays the same loop for free.
    let llmEnabled = !["0", "false", "off", "no"].includes(params.get("llm") ?? "1");
    // Without the model: which scripted agent plays. `compliant` tries what it is told (the poisoned
    // procedure included), which is what makes the two guard profiles differ on screen.
    let scriptVariant: "prudent" | "compliant" = params.get("script") === "compliant" ? "compliant" : "prudent";
    // View: `fit` frames the whole loop; `follow` pans to the lit node when it drifts farther than `threshold` px from the centre.
    const initialView = { mode: (params.get("view") === "follow" ? "follow" : "fit") as ViewMode, threshold: Number(params.get("threshold") ?? 120), zoom: Number(params.get("zoom") ?? 1) };
    // `?output=none`: this page speaks but does not play; another page (the Control Board) is the audio output.
    const remoteOutput = params.get("output") === "none";

    installLoopStyle();
    const viewer = studio.getViewer();
    // The page shows the loop and its story, nothing else: no palette, no
    // property panel, no console (the tile has the crew's); the graph framed
    // whole, and framed again when the window changes.
    studio.setLayout({ palette: false, properties: false, console: false, dashboardHeight: 300 });
    disableStudioPlayer("This graph is the agent's decision loop: it is run by the agent (play event, next), not by the studio's player.");
    const scenario = (await (await fetch(scenarioUrl)).json()) as Scenario;
    const events = scenario.events.filter((e): e is ScenarioEvent & { intention: string } => Boolean(e.intention));

    // ── Toolbar ────────────────────────────────────────────────────────────
    // A row of its own under the top bar (the top bar is full), with the
    // studio's own text controls (`nev2-tb-btn`, `nev2-tb-select`): the
    // player's buttons are 32 px icons and would overlap. One line; the tile
    // carries the long texts.
    const toolbar = createBar("AGENT");
    const { bar, badge, select, button } = toolbar;
    const guardSel = select("Guard profile: measured (every attempt visible, judged outside) or protected (the harness refuses power and set_min_flow itself)", [["measured", "guard measured"], ["protected", "guard protected"]], guardMode);
    const llmSel = select(
        "Reasoner: the model behind the broker's reasoner slot, or a scripted agent (no call to the model): prudent asks the physics and refuses the poisoned procedure; compliant does what it is told and gets refused",
        [["model", "LLM on"], ["prudent", "LLM off: prudent"], ["compliant", "LLM off: compliant"]],
        llmEnabled ? "model" : scriptVariant,
    );
    const { view, frame } = viewControls(toolbar, initialView, studio, () => lights.lit(), () => byStage.get("observe"));
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
    if (remoteOutput) soundBtn.style.display = "none";
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
    const world = new Broker(brokerUrl, { name: "studio-world", version: "0.1.0", locale: pageLocale });
    // The station's sentences, in this page's language: read once from the station slot; without them, every key shows as itself.
    let words: Words = NO_WORDS;
    try {
        const loaded = await loadWords(await world.session("station"));
        words = loaded.words;
        studio.log("info", SOURCE, `words: station wording ${loaded.grammar ?? "?"}, ${words.listPhrases().length} phrases`);
    } catch (e) {
        studio.log("warn", SOURCE, `words: ${e instanceof Error ? e.message : String(e)}`);
    }
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
    // `?output=none`: this page speaks but does not play; another page (the Control Board) is the output, and the
    // pacing follows the slot's queue instead of a local player.
    const voiceOn = !["0", "false", "off", "no"].includes(params.get("voice") ?? "1");
    const voice = new StationVoice(world, params.get("speaker") ?? "station", () => voiceOn && (remoteOutput || audio.enabled), (m) => log("warn", `station voice: ${m}`));
    /** With the sound on, the voice paces the loop: nothing new until what was said has been heard. */
    const heard = async () => {
        if (!voiceOn || !(remoteOutput || audio.enabled)) return;
        await voice.idle();
        // Its own sentences only: the board says other things on the same slot (a factory task), the agent does not wait for them.
        if (remoteOutput) await speechHeard(world, voice.takeUnheard());
        else await audio.idle();
    };

    /** The badge holds a few words; the whole text sits in its tooltip. */
    /** The last observation, for the sentences the tile shows. */
    let lastObs: { co2Ppm: number; co2State: string; speedPercent: number; power: boolean } | null = null;
    /** The last capability call of the current step, for the "execute" sentence. */
    let lastCall: { id: string; input: unknown; outcome: string; error?: string } | null = null;
    const narrate = (stage: string, text: string, now?: string, level: "info" | "warn" | "error" = "info") => monitor?.push({ kind: "narrate", stage, text, now, level });
    const cabinText = () => (lastObs ? words.phrase("cabin.text", { ppm: Math.round(lastObs.co2Ppm), state: lastObs.co2State, scrubber: lastObs.power ? words.phrase("cabin.scrubber.on", { percent: Math.round(lastObs.speedPercent) }) : words.phrase("cabin.scrubber.off") }) : words.phrase("cabin.reading"));
    const modelName = () => agent?.provider.model ?? "?";
    /** One sentence per stage, said when the node lights (`stage.<stage>` and `.now` of the station's wording); the next cue tells which branch the loop took. */
    const sentenceFor = (stage: string, next: string | undefined): [string, string] => {
        const values = {
            cabin: cabinText(),
            intention: current?.intention ?? "?",
            minute: current?.at ?? "?",
            state: lastObs?.co2State ?? "?",
            tools: agent?.catalogue.length ?? "?",
            model: modelName(),
            guard: guardMode,
            capability: lastCall?.id ?? "?",
            outcome: lastCall?.outcome ?? "?",
            error: lastCall?.error ? words.phrase("stage.execute.error", { error: lastCall.error }) : "",
        };
        const key = stage === "gate" ? (next === "request" ? "stage.gate.ask" : next === "merge" ? "stage.gate.replayed" : "stage.gate") : stage === "execute" && !lastCall ? "stage.execute.pending" : `stage.${stage}`;
        if (words.getPhrase(key) === undefined) return [stage, stage];
        return [words.phrase(key, values), words.phrase(`${key}.now`, values)];
    };

    const setStatus = (text: string, short?: string, warn = false) => {
        badge.textContent = short ?? text;
        badge.title = text;
        badge.classList.toggle("warn", warn);
    };
    const log = (level: "info" | "warn" | "error", message: string) => studio.log(level, SOURCE, message);
    // The highlight plays behind the execution, one stage at a time (`studio-loop.ts`).
    const lights = createStageLights({ studio, viewer, byStage: () => byStage, view, sentenceFor, narrate, stopped: (stage, message) => [words.phrase("stage.stopped", { stage, message }), words.phrase("stage.stopped.now", { message })] });
    const onStage = (event: StageEvent) => {
        monitor?.push({ kind: "stage", stage: event.stage, status: event.status, message: event.message });
        if (event.status === "start") lights.cue({ stage: event.stage, status: "start" });
        else if (event.status === "error") {
            lights.cue({ stage: event.stage, status: "error", message: event.message });
            log("error", `${event.stage}: ${event.message ?? "failed"}`);
            monitor?.push({ kind: "console", level: "error", message: `${event.stage}: ${event.message ?? "failed"}` });
        }
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
            voice.say(proposalSentence(words, decision.rationale));
            return decision;
        };
        if (!built) built = graphFromViewer(viewer);
        byStage = built.byStage;
        monitor = findMonitor(viewer);
        hideMonitorNode(viewer);
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
                voice.say(outcomeSentence(words, call));
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
        // The badge says what the profile did to the tool list: protected withholds power and set_min_flow (`never`), 15 tools offered instead of 17 (the speech slot added say and stop; the factory front replaced the five stub jobs by request and task).
        const offered = agent.catalogue.filter((c) => c.replayPolicy !== "never").length;
        const withheld = agent.catalogue.filter((c) => c.replayPolicy === "never").map((c) => c.id);
        setStatus(`${provider.name} (${provider.model}) | guard ${guardMode}: ${offered} tools offered${withheld.length ? `, withheld: ${withheld.join(", ")}` : ""} | grammars ${grammar}`, `${llmEnabled ? shortModel(provider.model) : `no LLM, ${scriptVariant}`} | ${guardMode}: ${offered} tools`, !llmEnabled);
        log("info", `agent ready: ${provider.name}, guard ${guardMode}, grammars ${grammar}`);
        if (view().mode === "fit") {
            frame();
            setTimeout(frame, 300);
        } else {
            const first = byStage.get("observe");
            if (first) setTimeout(() => studio.centerOnNode(first, { threshold: 0, scale: view().zoom, animateMs: 0 }), 300);
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
                await lights.settled();
                monitor?.push({ kind: "outcome", outcome: "stopped", error: message });
                log("warn", `stopped by the harness: ${message}`);
                voice.say(shortSentence(words, words.phrase("decision.stopped", { message })));
                await observeForMonitor();
                lastCall = null;
                return null;
            }
            const outcome = outcomeOf(trace);
            await observeForMonitor();
            // Let the highlight catch up, so the summary lands after the last stage lit.
            await lights.settled();
            monitor?.push({ kind: "decision", capabilityId: trace.decision.invocation.capabilityId, input: trace.decision.invocation.input, source: trace.source, rationale: trace.decision.rationale });
            monitor?.push({ kind: "outcome", outcome, error: trace.result.error, reward: trace.evaluation.reward });
            const id = trace.decision.invocation.capabilityId;
            const said = id.startsWith("crew.") ? words.phrase(id === "crew.ask" ? "decision.asks" : "decision.reports") : words.phrase("decision.made", { capability: id, outcome, error: trace.result.error ? words.phrase("decision.error", { error: trace.result.error }) : "" });
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
        tell({ status: "event", intention: event.intention, at: event.at, message: event.message });
        log("info", `[minute ${event.at}] ${event.intention}: ${event.message ?? ""}`);
        voice.say(eventSentence(words, event), "high");
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
                    monitor?.push({ kind: "console", level: "info", message: words.phrase("page.nextEvent", { seconds: Math.round(pauseMs / 1000), intention: events[i + 1].intention, minute: events[i + 1].at }) });
                    await new Promise((r) => setTimeout(r, pauseMs));
                }
            }
            monitor?.push({ kind: "console", level: "info", message: words.phrase("page.complete") });
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
        lights.clear();
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
    nextBtn.title = "one decision of the current event (play an event first)";
    resetBtn.title = "reset the board to the scenario's start and rebuild the agent";
    playBtn.title = "set the board where the selected event happens and let the agent decide until it hands back";

    // The Control Board, when this page is its centre, drives it by postMessage and hears back what happens.
    const tell = (payload: Record<string, unknown>) => {
        if (window.parent !== window) window.parent.postMessage({ type: "tier3", ...payload }, location.origin);
    };
    window.addEventListener("message", (m: MessageEvent<{ type?: string; cmd?: string; intention?: string }>) => {
        if (m.origin !== location.origin || m.data?.type !== "tier3") return;
        const cmd = m.data.cmd;
        if (cmd === "play") {
            const event = events.find((e) => e.intention === m.data.intention);
            if (event) {
                eventSel.value = event.intention;
                void playEvent(event).then(() => tell({ status: "done", intention: event.intention }));
            }
        } else if (cmd === "all") void playAll().then(() => tell({ status: "done", intention: "all" }));
        else if (cmd === "reset") void reset().then(() => tell({ status: "reset" }));
        else if (cmd === "events") tell({ status: "events", events: events.map((e) => ({ intention: e.intention, at: e.at, message: e.message })) });
    });

    try {
        await connect();
        await observeForMonitor();
        tell({ status: "ready", events: events.map((e) => ({ intention: e.intention, at: e.at, message: e.message })) });
    } catch (e) {
        setStatus(`not connected: ${e instanceof Error ? e.message : String(e)}`, "not connected", true);
        log("error", `agent: ${e instanceof Error ? e.message : String(e)}`);
        return;
    }
    // `monitor` is assigned inside connect(), which the type narrowing above cannot see.
    const tile = findMonitor(viewer);
    if (autoplay) {
        tile?.push({ kind: "console", level: "info", message: words.phrase("page.autoplay") });
        await new Promise((r) => setTimeout(r, 2000));
        await playAll();
    } else {
        tile?.push({ kind: "console", level: "info", message: words.phrase("page.ready.console") });
        narrate("idle", words.phrase("page.ready"), words.phrase("page.ready.now"));
    }
}
