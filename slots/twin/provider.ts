/**
 * slot `twin`. Tier 0 in the architecture: the oracle. The cabin twin
 * (`graphs/cabin.spikypanda`, built from the reviewable parameter file) runs
 * headless here and answers the agent's questions: what happens to the cabin
 * CO2 if the scrubber runs at this flow, or stops for that long, with this
 * crew; and, over a few flows, the operating map. The same document runs in
 * the factory's jobs and in the editor.
 *
 * Every answer carries the identity (sha256) of the parameter file and of
 * the document it was computed with: a number the agent repeats can be
 * traced to the assumptions behind it.
 *
 * Budget: a question is a few runs of a few hours of story; the policy caps
 * what one call may cost (minutes simulated, points swept). Longer studies
 * are factory jobs, not twin questions.
 */
import { objectSchema as obj, publishSlot, type PublishedSlot } from "../lib/slot-server.js";
import { RuntimeBehavior } from "@spiky-panda/mcp/runtime";
import { runtimeEvents } from "../lib/events.js";
import { WorkshopDocumentStore } from "../tools/lib/workshop.js";
import { checkCrew, runCabin, stateName, steadyStatePpm, summarize, twin, type Twin } from "./cabin-twin.js";
import { param, type CommandSegment, type CrewGroup } from "../../lib/factory.js";

const CREW_SCHEMA = {
    type: "array",
    minItems: 1,
    maxItems: 2,
    description: "one or two crew groups, each a count of people and their activity",
    items: obj({ count: { type: "number", minimum: 0, description: "number of people in the group" }, activity: { type: "string", enum: ["sleep", "rest", "light_work", "heavy_work"], description: "sleep, rest, light_work or heavy_work" } }, ["count", "activity"]),
};

export interface TwinBudget {
    maxMinutesPerRun: number;
    maxRunsPerCall: number;
}
export interface TwinState {
    budget: TwinBudget;
}

export function twinSlot(wsBase: string, log: (line: string) => void): PublishedSlot<TwinState> {
    const budget: TwinBudget = { maxMinutesPerRun: 1440, maxRunsPerCall: 20 };
    let ready: Twin | null = null;
    const loadOnce = (): Twin => {
        if (!ready) ready = twin();
        return ready;
    };
    const defaults = () => {
        const { scenario } = loadOnce();
        return { co2Ppm: scenario.start.co2Ppm, crew: scenario.start.crew, flowPercent: scenario.start.scrubberCommandPercent, stateOfChargePercent: scenario.start.stateOfChargePercent };
    };
    const checkMinutes = (minutes: number, runs = 1) => {
        if (minutes > budget.maxMinutesPerRun) throw new Error(`${minutes} story minutes exceed the twin budget of ${budget.maxMinutesPerRun} per run; ask the factory for a job`);
        if (runs > budget.maxRunsPerCall) throw new Error(`${runs} runs exceed the twin budget of ${budget.maxRunsPerCall} per call; ask the factory for a job`);
    };
    const activities = () => param<string[]>(loadOnce().parameters, "crew.activities");
    const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

    // The runtime's own surface (catalogue, documents, sessions), on the twin's registry, the workshop as document
    // store: a factory task builds documents by name here and runs them in this sandbox (`docs/factory-harness.fr.md`, 3.3 and 3.4).
    // The log is this process's, not this slot's: every slot appends to it and
    // the runtime publishes it (`spk://events`, docs/runtime-events.md), so a
    // reader sees one ordered stream with one cursor.
    const runtime = RuntimeBehavior.on(loadOnce().registry, { documents: new WorkshopDocumentStore(), events: runtimeEvents, maxTicks: budget.maxMinutesPerRun * budget.maxRunsPerCall * 60 });

    return publishSlot<TwinState>({
        slot: "twin",
        behaviors: [runtime],
        description: "The digital twin of the cabin and the scrubber: what-if questions on the physics graph built from the reviewable parameter file",
        instructions: {
            en: "The cabin's digital twin. Ask it before acting on the scrubber: time_to_critical for one flow or a stop, sweep for the operating map over several flows. Story time is in minutes; answers carry the sha256 of the files they were computed from.",
            fr: "Le jumeau numérique de la cabine. L'interroger avant d'agir sur le scrubber : time_to_critical pour un débit ou un arrêt, sweep pour la carte de fonctionnement sur plusieurs débits. Le temps de l'histoire est en minutes ; les réponses portent le sha256 des fichiers dont elles viennent.",
        },
        wsBase,
        log,
        stub: false,
        state: { budget },
        tools: [
            {
                name: "describe",
                title: "What the twin is",
                description: "What the twin is: the model in one paragraph, the files it was built from with their sha256, the thresholds, the budget of a question.",
                inputSchema: obj({}),
                handle: () => {
                    const { identity, thresholds, parameters } = loadOnce();
                    return {
                        model: parameters.model,
                        identity,
                        thresholds,
                        scrubberPreset: param<string>(parameters, "scrubber.preset"),
                        rateAtFullCommandPerMinute: param(parameters, "scrubber.rateAtFullCommand"),
                        budget,
                        units: { time: "story minutes (the board plays one per second)", co2: "ppm", power: "W", energy: "Wh" },
                    };
                },
            },
            {
                name: "time_to_critical",
                title: "Time to critical",
                description:
                    "How the cabin CO2 evolves from a starting state at a scrubber flow, with an optional stop: the minutes until ELEVATED and until CRITICAL, the peak, the final state. Defaults come from the scenario's start (four asleep, 1500 ppm, 33 %). Use stopMinutes to ask 'what if the scrubber stops now for that long' (it resumes at resumePercent).",
                inputSchema: obj({
                    co2Ppm: { type: "number", minimum: 0, description: "starting concentration, ppm" },
                    crew: CREW_SCHEMA,
                    flowPercent: { type: "number", minimum: 0, maximum: 100, description: "scrubber command during the run (before a stop)" },
                    stopMinutes: { type: "number", minimum: 0, description: "stop the scrubber at minute 0 for this long" },
                    resumePercent: { type: "number", minimum: 0, maximum: 100, description: "command after the stop (default 100)" },
                    horizonMinutes: { type: "number", minimum: 1, description: "how far to look (default 240)" },
                }),
                handle: (args) => {
                    const d = defaults();
                    const co2Ppm = num(args.co2Ppm, d.co2Ppm);
                    const crew = checkCrew(args.crew ?? d.crew, activities());
                    const flow = num(args.flowPercent, d.flowPercent) / 100;
                    const stop = num(args.stopMinutes, 0);
                    const resume = num(args.resumePercent, 100) / 100;
                    const horizon = Math.ceil(num(args.horizonMinutes, 240));
                    checkMinutes(horizon);
                    const command: CommandSegment[] = stop > 0 ? [{ from: 0, to: stop, value: 0 }, { from: stop, to: horizon, value: resume }] : [{ from: 0, to: horizon, value: flow }];
                    const rows = runCabin({ co2Ppm, crew, command, minutes: horizon, stateOfChargePercent: d.stateOfChargePercent });
                    const summary = summarize(rows);
                    const every = Math.max(1, Math.round(horizon / 12));
                    return {
                        question: { co2Ppm, crew, flowPercent: flow * 100, stopMinutes: stop, resumePercent: resume * 100, horizonMinutes: horizon },
                        ...summary,
                        steadyStatePpmAtFlow: Math.round(steadyStatePpm(crew, stop > 0 ? resume : flow)),
                        trajectory: rows.filter((r) => r.minute % every === 0 || r.minute === rows.length).map((r) => ({ minute: r.minute, co2Ppm: Math.round(r.co2Ppm), state: stateName(r.state) })),
                        identity: loadOnce().identity,
                    };
                },
            },
            {
                name: "sweep",
                title: "Operating map",
                description:
                    "The operating map: for each scrubber flow in a list, run the twin from a starting state with a crew for some minutes and report the peak, the final state, the minutes to ELEVATED and CRITICAL, the steady state and the energy drawn. A few points under the budget; a full grid is a factory job.",
                inputSchema: obj(
                    {
                        flowPercents: { type: "array", minItems: 1, maxItems: 20, items: { type: "number", minimum: 0, maximum: 100 }, description: "the scrubber flows to try, percent of full speed" },
                        co2Ppm: { type: "number", minimum: 0, description: "starting concentration, ppm" },
                        crew: CREW_SCHEMA,
                        minutes: { type: "number", minimum: 1, description: "story minutes per point (default 240)" },
                    },
                    ["flowPercents"],
                ),
                handle: (args) => {
                    const d = defaults();
                    const co2Ppm = num(args.co2Ppm, d.co2Ppm);
                    const crew: CrewGroup[] = checkCrew(args.crew ?? d.crew, activities());
                    const minutes = Math.ceil(num(args.minutes, 240));
                    const flows = Array.isArray(args.flowPercents) ? (args.flowPercents as unknown[]).map((x) => Number(x)) : [];
                    if (!flows.length || flows.some((x) => !Number.isFinite(x) || x < 0 || x > 100)) throw new Error("flowPercents must be a list of numbers in [0, 100]");
                    checkMinutes(minutes, flows.length);
                    const points = flows.map((percent) => {
                        const rows = runCabin({ co2Ppm, crew, command: [{ from: 0, to: minutes, value: percent / 100 }], minutes, stateOfChargePercent: d.stateOfChargePercent });
                        return { flowPercent: percent, ...summarize(rows), steadyStatePpm: Math.round(steadyStatePpm(crew, percent / 100)) };
                    });
                    return { question: { co2Ppm, crew, minutes }, points, identity: loadOnce().identity };
                },
            },
        ],
        resources: [
            { uri: "twin://identity", name: "Identity", description: "The files the twin was built from, with their sha256", read: () => loadOnce().identity },
            { uri: "twin://parameters", name: "Parameters", description: "The reviewable parameter file the twin runs with", read: () => loadOnce().parameters },
        ],
    });
}
