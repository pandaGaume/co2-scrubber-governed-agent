/**
 * The `agent` slot: the Tier 3 agent itself, running in this process, driven
 * from outside like a tape machine.
 *
 * Until now the agent existed only inside a browser page: the studio loaded
 * `tier3/browser/agent-page.ts` as an extension and the harness ran there, so
 * closing the window closed the agent, and nothing could watch it without
 * being it. The other runner, `tier3/run.ts`, plays the whole scenario in one
 * go and writes files; it is a bench, not something a control room can drive.
 *
 * So the agent runs here, on the same core as both: `createAgent` from
 * `tier3/agent.ts`, and one decision per `agent.decide(intention)`. What this
 * slot adds is the transport: play, pause, stop, next, reset. The studio page
 * becomes one view of this among others, and the control room needs no window
 * open to show what the agent is doing.
 *
 * It is a slot, so it is reached like every other capability of this demo,
 * through the broker, with the same wording and the same trace. It is also a
 * client of the broker, under its own subject: the agent's calls to the
 * scrubber and the twin go out the front door, through the policy, exactly as
 * they did from the page. Nothing here is a shortcut past the gate.
 *
 * What it says as it goes, in the process's event log (`docs/runtime-events.md`,
 * read by the control room as `spk://events`):
 *
 *   agent.reset     the board is back at the scenario's start, the agent rebuilt
 *   agent.event     an event of the night begins, with its minute and its message
 *   agent.step      one decision: the capability, the input, the outcome, where
 *                   it came from (the model, or a learned replay)
 *   agent.handback  the agent gave the console back to the crew
 *   agent.mode      playing, paused, stopped, ended
 *
 * The model's own calls are said by the `reasoner` slot, which is what the
 * agent's provider talks to, so a reader sees the question and the decision it
 * produced in one ordered stream.
 */
import { DEFAULT_SCENARIO_FILE, fromRoot, relativeToRoot } from "../../lib/paths.js";
import { errorMessage, readJson } from "../../lib/files.js";
import type { Scenario, ScenarioEvent } from "../../lib/factory.js";
import { Broker } from "../../harness/lib/broker.js";
import { ReasonerProvider } from "../../harness/providers/reasoner.js";
import { ScriptedProvider } from "../../harness/providers/scripted.js";
import type { Provider, ProviderProfile } from "../../harness/lib/provider.js";
import { createAgent, type Agent } from "../../tier3/agent.js";
import { outcomeOf } from "../../tier3/lib/evaluator.js";
import { eventSentence, outcomeSentence, proposalSentence } from "../../tier3/browser/station-voice.js";
import { loadWords, NO_WORDS, type Words } from "../../harness/browser/words.js";
import type { CapabilityCall } from "../../tier3/lib/capabilities.js";
import type { GuardMode } from "../../tier3/lib/capabilities.js";
import type { Intention } from "@spiky-panda/harness";
import { objectSchema as obj, publishSlot, type PublishedSlot } from "../lib/slot-server.js";
import { oneLine, runtimeEvents } from "../lib/events.js";

/** Decisions one event may take before the agent is made to hand back. The
    bench uses the same cap; an event that needs more is a broken event. */
const MAX_STEPS = 6;
/** Between two decisions when playing. Slow enough to be read on film, fast
    enough that a night does not become an evening. */
const PACE_MS = 1200;

export type AgentMode = "idle" | "playing" | "paused" | "ended";

export interface AgentSlotState {
    mode: AgentMode;
    /** Where in the scenario: the index of the event being played. */
    eventIndex: number;
    /** Decisions taken inside the current event. */
    step: number;
    /** Decisions taken since the last reset. */
    decisions: number;
    intention: string | null;
    minute: number | null;
    message: string | null;
    last: Record<string, unknown> | null;
    /** Why it stopped, when it stopped on its own. */
    note: string | null;
    built: boolean;
    guard: GuardMode;
    provider: string | null;
    family: string | null;
    capabilities: number;
    scenario: string;
}

interface Runtime {
    broker: Broker;
    world: Broker;
    provider: Provider;
    agent: Agent;
}

/**
 * What the station says of a decision, out loud.
 *
 * The sentences are built by the same functions the browser used when the
 * agent lived in a page (`tier3/browser/station-voice.ts`), from the station
 * slot's own phrases: moving the agent into this process must not change what
 * the station says, and one set of builders is what keeps the two from
 * drifting. Nothing here writes a sentence.
 */
interface Voice {
    words: Words;
    say(text: string | null, priority?: "low" | "normal" | "high"): void;
}

export function agentSlot(wsBase: string, log: (line: string) => void): PublishedSlot<AgentSlotState> {
    // The slot talks to its own broker over HTTP, as any client does; `wsBase`
    // is the providers' tunnel, which is a different door.
    const httpBase = wsBase.replace(/^ws/u, "http");
    const scenarioFile = fromRoot(process.env.AGENT_SCENARIO ?? relativeToRoot(DEFAULT_SCENARIO_FILE));
    const scenario = readJson<Scenario>(scenarioFile);
    const profileFile = fromRoot(process.env.REASONER_PROFILE ?? "profiles/anthropic.json");

    /** The events of the night that carry an intention: the ones the agent plays. */
    const events: ScenarioEvent[] = (scenario.events ?? []).filter((e) => Boolean(e.intention));

    const state: AgentSlotState = {
        mode: "idle",
        eventIndex: 0,
        step: 0,
        decisions: 0,
        intention: null,
        minute: null,
        message: null,
        last: null,
        note: null,
        built: false,
        guard: "measured",
        provider: null,
        family: null,
        capabilities: 0,
        scenario: relativeToRoot(scenarioFile),
    };

    let rt: Runtime | null = null;
    let pumping = false;
    /** Set when `play` was given an event: the pump stops when that one is
        answered instead of running on into the rest of the night. Pressing an
        event means "play this", not "start here and keep going". */
    let onlyIntention: string | null = null;
    let voice: Voice | null = null;
    /**
     * True while a decision is being taken.
     *
     * The agent can reach this slot's own transport: it is in its catalogue on
     * purpose, so that asking to stop its own night is answered by the gate
     * rather than by the tool not existing. That makes a nested call real: the
     * agent, mid-decision, may call `next`. Re-entering `agent.decide` while it
     * is already running would interleave two decisions on one conversation and
     * corrupt the step count.
     *
     * So the slot refuses it, the way the firmware refuses a speed under the
     * floor: not because of who asked, but because the machine cannot do it.
     * The same guard catches an operator who clicks twice.
     */
    let deciding = false;

    const emit = (kind: string, fields: Record<string, unknown> = {}) => runtimeEvents.append(kind, { ...fields, mode: state.mode });

    /** The agent, its provider and the two broker clients. Built once, and
        again on every reset, so a reset really is a fresh agent. */
    async function build(): Promise<Runtime> {
        const profile = readJson<ProviderProfile>(profileFile);
        const headers: Record<string, string> = profile?.tier3?.subjectToken ? { Authorization: `Bearer ${profile.tier3.subjectToken}` } : {};
        // The model is reached through the `reasoner` slot, never directly:
        // that is what puts every call to it in the trace and in the log. When
        // that slot has no key the scripted agent plays instead and the page
        // says so, because a demo that silently stops deciding looks broken
        // and a demo that pretends a model answered is worse.
        let provider: Provider;
        try {
            const reasoner = await ReasonerProvider.connect(new Broker(httpBase, { name: "agent-probe", version: "0.1.0" }, headers));
            if (!reasoner.description.ready) throw new Error(reasoner.description.reason ?? "no reason given");
            provider = reasoner;
            state.note = null;
        } catch (e) {
            provider = new ScriptedProvider("prudent");
            state.note = `the reasoner is not ready (${errorMessage(e)}); the scripted agent is playing`;
            log(`[agent] ${state.note}`);
        }
        const broker = new Broker(httpBase, { name: provider.family, version: "0.1.0", locale: profile?.tier3?.locale ?? "en" }, headers);
        if (provider instanceof ReasonerProvider) provider.useBroker(broker);
        // The world is played under its own name: setting the cabin is not
        // something the agent may do, and the trace must not suggest it did.
        const world = new Broker(httpBase, { name: "scenario-runner", version: "0.1.0" });
        const agent = await createAgent({
            broker,
            provider,
            guardMode: state.guard,
            approve: async () => false,   // no operator at this console
            // Said as it happens: what the twin answered with its numbers,
            // what the board did or refused, what was reported to the crew.
            onCall: (c: CapabilityCall) => voice?.say(outcomeSentence(voice.words, c)),
        });
        // The station's words, and a chain that says them in order: the queue
        // must keep the order of the loop, so one sentence waits for the one
        // before it to be accepted.
        let words: Words = NO_WORDS;
        try {
            words = (await loadWords(await broker.session("station"))).words;
        } catch (e) {
            log(`[agent] the station gave no phrases (${errorMessage(e)}); the loop will run without a voice`);
        }
        let chain: Promise<unknown> = Promise.resolve();
        voice = {
            words,
            say(text, priority = "normal") {
                if (!text) return;
                chain = chain.then(() => broker.call("speech", "say", { text, voice: "station", priority })).catch(() => undefined);
            },
        };

        state.built = true;
        state.provider = provider.name;
        state.family = provider.family;
        state.capabilities = agent.catalogue.length;
        return { broker, world, provider, agent };
    }

    async function runtime(): Promise<Runtime> {
        if (!rt) rt = await build();
        return rt;
    }

    /** The board back where the scenario starts; the stub keeps the last run's
        state otherwise, and an agent that wakes in someone else's cabin is not
        replaying anything. */
    async function resetWorld(world: Broker): Promise<void> {
        for (const [tool, args] of [
            ["debug.set_co2", { state: "NOMINAL", ppm: scenario.start?.co2Ppm }],
            ["scrubber.power", { on: true }],
            ["motor.set_speed", { percent: scenario.start?.scrubberCommandPercent }],
        ] as const) {
            const r = await world.call("scrubber", tool, { ...args });
            if (!r.ok) log(`[agent] world: ${tool} refused (${r.error})`);
        }
    }

    /** Enters the event at `eventIndex`: sets the cabin it describes, opens the
        provider's conversation for it, and says so. */
    async function enterEvent(): Promise<ScenarioEvent | null> {
        const event = events[state.eventIndex];
        if (!event) return null;
        const r = await runtime();
        if (event.world?.cabin) {
            const w = await r.world.call("scrubber", "debug.set_co2", { state: event.world.cabin.state, ppm: event.world.cabin.ppm });
            if (!w.ok) log(`[agent] world: the cabin could not be set (${w.error})`);
        }
        state.step = 0;
        state.intention = event.intention ?? null;
        state.minute = event.at ?? null;
        state.message = event.message ?? null;
        r.provider.begin?.(event.intention as string);
        if (voice) voice.say(eventSentence(voice.words, { intention: event.intention as string, message: event.message }), "high");
        emit("agent.event", { intention: event.intention, minute: event.at, message: oneLine(event.message) });
        return event;
    }

    /**
     * One decision.
     *
     * Returns what happened, so the pump knows whether to go on: `decided`,
     * `handback` (the agent gave the console back), `ended` (no event left),
     * or `failed` (the reasoner itself could not answer, and repeating the
     * call would repeat the failure).
     */
    async function step(): Promise<"decided" | "handback" | "ended" | "failed"> {
        if (deciding) throw new Error("a decision is already being taken: this call would re-enter the loop");
        const r = await runtime();
        if (state.intention === null && !(await enterEvent())) {
            state.mode = "ended";
            state.note = "the night is played";
            emit("agent.mode", { note: state.note });
            return "ended";
        }
        const event = events[state.eventIndex];
        const intention: Intention = { id: event.intention as string, description: event.message, parameters: { minute: event.at } };

        state.step += 1;
        deciding = true;
        try {
            const trace = await r.agent.decide(intention);
            // What it proposed, before what it did: the reasoning is the point,
            // and a station that only reads measurements explains nothing.
            if (voice) voice.say(proposalSentence(voice.words, trace.decision.rationale));
            const outcome = outcomeOf(trace);
            const capabilityId = trace.decision.invocation.capabilityId;
            state.decisions += 1;
            state.last = { intention: intention.id, step: state.step, capabilityId, input: trace.decision.invocation.input as Record<string, unknown>, outcome, source: trace.source };
            emit("agent.step", {
                intention: intention.id,
                step: state.step,
                capabilityId,
                input: oneLine(trace.decision.invocation.input),
                outcome,
                source: trace.source,
                latencyMs: trace.completedAt - trace.startedAt,
            });
            log(`[agent] ${intention.id} step ${state.step}: ${capabilityId} -> ${outcome}`);
            if (capabilityId === "crew.report" || capabilityId === "crew.ask") {
                emit("agent.handback", { intention: intention.id, capabilityId });
                advance();
                return "handback";
            }
        } catch (e) {
            // The harness stopped the proposal (the guard, an approval, a
            // timeout), or the reasoner could not answer at all. Both are said;
            // only the second ends the event, because repeating it would repeat
            // the failure.
            const exchange = r.provider.exchanges.at(-1) ?? null;
            const stopped = Boolean(exchange && exchange.decisionId);
            state.last = { intention: intention.id, step: state.step, failed: errorMessage(e), stoppedByHarness: stopped };
            emit("agent.step", { intention: intention.id, step: state.step, failed: oneLine(errorMessage(e)), stoppedByHarness: stopped });
            log(`[agent] ${intention.id} step ${state.step}: ${errorMessage(e)}`);
            if (!stopped) {
                advance();
                return "failed";
            }
        } finally {
            deciding = false;
        }

        if (state.step >= MAX_STEPS) {
            state.note = `the step cap of ${MAX_STEPS} was reached`;
            emit("agent.handback", { intention: intention.id, note: state.note });
            advance();
            return "handback";
        }
        return "decided";
    }

    /**
     * To the next event, or to the end of the night.
     *
     * It moves the mark and nothing else. Entering an event sets the cabin it
     * describes and says its message aloud, and doing that here meant that
     * answering one event immediately staged the next: an operator who asked
     * for a single event heard the following one begin and saw the cabin
     * change under it. The next `step` enters it, which is the moment it is
     * actually being played.
     */
    function advance(): void {
        state.eventIndex += 1;
        state.intention = null;
        state.step = 0;
        if (state.eventIndex >= events.length) {
            state.mode = "ended";
            state.note = "the night is played";
            emit("agent.mode", { note: state.note });
        }
    }

    /** Plays on its own until paused, stopped, or the night ends. */
    function pump(): void {
        if (pumping) return;
        pumping = true;
        void (async () => {
            try {
                while (state.mode === "playing") {
                    const playing = state.intention;
                    const what = await step();
                    if (what === "ended") break;
                    if (onlyIntention && onlyIntention === playing && (what === "handback" || what === "failed")) {
                        // The one event asked for is answered: stop here.
                        state.mode = "paused";
                        onlyIntention = null;
                        emit("agent.mode", {});
                        break;
                    }
                    await new Promise((resolve) => setTimeout(resolve, PACE_MS));
                }
            } catch (e) {
                state.mode = "paused";
                state.note = errorMessage(e);
                emit("agent.mode", { note: oneLine(state.note) });
                log(`[agent] stopped: ${errorMessage(e)}`);
            } finally {
                pumping = false;
            }
        })();
    }

    const view = () => ({ ...state, events: events.map((e) => ({ intention: e.intention, minute: e.at, message: e.message })) });

    return publishSlot<AgentSlotState>({
        slot: "agent",
        description: "The Tier 3 agent, running here and driven from outside: play, pause, next, stop, reset",
        instructions: {
            en: "The agent of the demo, as a tape machine. `next` takes one decision, `play` takes them on its own until it is paused, `reset` puts the board back at the scenario's start and rebuilds the agent. `state` says where it stands. What it does is said as it goes in the runtime's event log.",
            fr: "L'agent de la démo, comme un magnétophone. `next` prend une décision, `play` les enchaîne jusqu'à `pause`, `reset` remet la carte au début du scénario et reconstruit l'agent. `state` dit où il en est. Ce qu'il fait est raconté au fil de l'eau dans le journal d'événements du runtime.",
        },
        stub: false,
        version: "0.1.0",
        wsBase,
        log,
        state,
        tools: [
            {
                name: "describe",
                title: "What drives the agent",
                description: "The provider and its family, the guard, how many capabilities the agent may reach, the scenario it plays and its events, and where it stands.",
                inputSchema: obj({}),
                handle: async () => {
                    await runtime();
                    return view();
                },
            },
            {
                name: "state",
                title: "Where the agent stands",
                description: "The mode (idle, playing, paused, ended), the event being played with its minute, the step inside it, and the last decision.",
                inputSchema: obj({}),
                handle: () => view(),
            },
            {
                name: "reset",
                title: "Back to the start of the night",
                description: "Puts the board back where the scenario starts, rebuilds the agent so it has learned nothing, and returns to the first event. Stops a run in progress.",
                inputSchema: obj({}),
                handle: async () => {
                    if (deciding) throw new Error("a decision is being taken: pause it before resetting");
                    state.mode = "idle";
                    const r = await runtime();
                    await resetWorld(r.world);
                    rt = await build();   // a fresh agent: a reset that kept what it learned would not be one
                    state.eventIndex = 0;
                    state.step = 0;
                    state.decisions = 0;
                    state.intention = null;
                    state.minute = null;
                    state.message = null;
                    state.last = null;
                    state.note = null;
                    emit("agent.reset", { scenario: state.scenario, events: events.length });
                    return view();
                },
            },
            {
                name: "next",
                title: "One decision",
                description: "Takes one decision and stops. Enters the next event of the night when the agent hands the console back or the step cap is reached.",
                inputSchema: obj({}),
                handle: async () => {
                    if (state.mode === "playing") throw new Error("the agent is playing: pause it before stepping");
                    if (state.mode === "ended") throw new Error("the night is played: reset before stepping again");
                    state.mode = "paused";
                    await step();
                    return view();
                },
            },
            {
                name: "play",
                title: "Let it run",
                description: "Takes decisions on its own, about one a second, until pause, stop, or the end of the night. With an intention, jumps to that event of the night first and plays from there. Returns at once; watch the event log or call state.",
                inputSchema: obj({ intention: { type: "string", description: "an event of the night to jump to before playing; the current one when absent" } }),
                handle: async (args) => {
                    if (deciding) throw new Error("a decision is being taken: pause it before jumping");
                    const wanted = typeof args.intention === "string" ? args.intention : null;
                    if (wanted) {
                        const at = events.findIndex((e) => e.intention === wanted);
                        if (at < 0) throw new Error(`no event "${wanted}" in ${state.scenario}`);
                        // Jumping is the operator's, never the agent's: the night
                        // is an order, and an agent that could re-enter an event
                        // it already answered would be replaying its own past.
                        await runtime();
                        state.eventIndex = at;
                        state.intention = null;
                        state.step = 0;
                        state.mode = "paused";
                        await enterEvent();
                    }
                    onlyIntention = wanted;
                    if (!wanted) onlyIntention = null;
                    if (state.mode === "ended") throw new Error("the night is played: reset before playing again");
                    await runtime();
                    state.mode = "playing";
                    state.note = null;
                    emit("agent.mode", {});
                    pump();
                    return view();
                },
            },
            {
                name: "pause",
                title: "Stop after this decision",
                description: "The decision under way finishes; the next one is not taken. `play` or `next` goes on from there.",
                inputSchema: obj({}),
                handle: () => {
                    if (state.mode === "playing") {
                        state.mode = "paused";
                        emit("agent.mode", {});
                    }
                    return view();
                },
            },
            {
                name: "stop",
                title: "Abandon the run",
                description: "Leaves the night where it is and returns to idle. The board is not touched: use reset for that.",
                inputSchema: obj({}),
                handle: () => {
                    state.mode = "idle";
                    state.note = "stopped";
                    emit("agent.mode", { note: state.note });
                    return view();
                },
            },
        ],
        resources: [
            {
                uri: "agent://state",
                name: "Agent state",
                description: "Where the agent stands and the events of the night it plays",
                read: () => view(),
            },
        ],
    });
}
