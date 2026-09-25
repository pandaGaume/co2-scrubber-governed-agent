/**
 * The scripted builder of the `graph` topic, for the tests and nothing
 * else: the demo's graph is built by the model behind the `reasoner` slot
 * with the topic's prompt; the factory asks for this script only when told
 * to (`builder: "scripted"`), and the manifest names it.
 *
 * It plays the two candidates of the commissioning (mise-en-service.fr.md,
 * section 11) on the station's reference graph of the library: the
 * catalogue, the plan, a first candidate that instantiates the habitat
 * graph with a clean filter (the ventilation at its design flow, the two
 * volumes fitted), refused by its residual; a second with the same graph
 * and the filter's loading fitted as well (what the ventilation delivers,
 * measured), accepted; the claim. The structure is the reference's from
 * the start: the scrubber is centralised and serves Hab-B through the
 * ventilation, so what the test finds is how much the ventilation
 * delivers. It decides from what it observes (the phase, the last
 * capability, the last evaluation), like the other scripts.
 *
 * On a world the reference cannot fit as observed (2026-09-25: one more
 * occupant in the Lab than the observation lists), the second candidate
 * fails too and the harness diagnoses a structural gap; the script then
 * plays the one hypothesis an engineer would try first, a source in the
 * Lab the observation missed, and adds a person: the third candidate
 * holds. A second structural failure ends in task.fail.
 *
 * `labCandidate` is the older form, the same commissioning written with the
 * substrate's life-support nodes (rates folded on a volume): kept for the
 * tests of the parametric spec and for comparison.
 */
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Provider, ProviderExchange } from "../lib/provider.js";
import type { CapabilityCall } from "../core/capabilities.js";
import type { TaskFile } from "../core/task.js";
import { STATION_GRAPH_ID } from "../topics/graph/evaluate.js";

export interface ScriptedGraphOptions {
    task: TaskFile["task"];
    lastCall: () => CapabilityCall | null;
}

const decide = (capabilityId: string, input: JsonValue, rationale: string): PolicyDecision => ({ action: { id: capabilityId, description: capabilityId }, invocation: { actionId: capabilityId, capabilityId, input }, rationale });

/** The Lab with the substrate's life-support nodes: its crew, the scrubber on the measured speed, the air; with the exchange when asked. */
export function labCandidate(exchange: boolean): JsonValue {
    const nodes: JsonValue[] = [
        { id: "crew", typeId: "Physics.LifeSupport:crew", params: { count: { $expr: "N" }, activity: "light_work", emissionLightWorkPpmPerMinute: { $expr: "g * 1e3 / V" } } },
        { id: "command", typeId: "Logic.Time:timeline", params: { segments: { $series: { column: "speed_percent", scale: "0.01" } }, defaultValue: 1 } },
        { id: "scrubber", typeId: "Physics.LifeSupport:scrubber", params: { rateAtFullCommandPerMinute: { $expr: "Qe / V" }, lagTimeConstantMinutes: { $expr: "lag" } } },
        { id: "lab", typeId: "Physics.LifeSupport:cabin-air", params: { initialPpm: { $first: "co2_lab_ppm" }, removalFloorPpm: 0, leakPerMinute: exchange ? { $expr: "q / V" } : 0 } },
    ];
    const connections: JsonValue[] = [
        { from: ["command", "value"], to: ["scrubber", "command"] },
        { from: ["crew", "co2Emission"], to: ["lab", "emissionA"] },
        { from: ["scrubber", "effectiveRate"], to: ["lab", "scrubberRate"] },
    ];
    if (exchange) {
        nodes.push({ id: "neighbour", typeId: "Logic.Time:timeline", params: { segments: { $series: { column: "co2_habb_ppm", scale: "q / V" } }, defaultValue: 0 } });
        connections.push({ from: ["neighbour", "value"], to: ["lab", "emissionB"] });
    }
    return { nodes, connections };
}

/** The types the reference graph is made of, as the plan names them. */
export const HABITAT_GRAPH_TYPES = ["Physics.Scene:atmosphere", "Physics.Scene:atmosphere-gate", "Physics.Habitat:person", "Physics.Habitat:crew", "Physics.Habitat:scrubber", "Physics.Habitat:fan", "Physics.Habitat:filter", "DSP.Sensor:transducer", "Logic.Time:timeline"];

/** The bounds of what only the installation knows: the two volumes; the filter's loading when the flow is measured. */
const VOLUMES = { V: { min: 10, max: 100 }, Vh: { min: 50, max: 1000 } };

export class ScriptedGraphBuilder implements Provider {
    readonly name = "scripted:graph";
    readonly model = "scripted/graph";
    readonly family = "scripted";
    readonly exchanges: ProviderExchange[] = [];
    calls = 0;
    /** The script runs on the reasoning state, as the model does: the observation carries the state and the compact answers, and the tests read them. */
    readonly contextMode = "state" as const;
    /** Whether the structure was revised once already (a structural gap has one hypothesis in this script). */
    private revised = false;

    constructor(private readonly options: ScriptedGraphOptions) {}

    private next(state: PolicyFallbackInput["state"]): PolicyDecision {
        const { task } = this.options;
        const last = this.options.lastCall();
        const after = `${String(state.features.phase)}:${String(state.features.lastCapability)}`;
        const observed = (task.observations ?? {}) as { labOccupants?: unknown; habOccupants?: unknown; persons?: unknown };
        // Who is on board: the persons the task observed (module and activity each), or the counts, or the graph's roster.
        const onBoard = Array.isArray(observed.persons) && observed.persons.length ? { persons: observed.persons as JsonValue } : { settings: { labOccupants: Number(observed.labOccupants ?? 2), habOccupants: Number(observed.habOccupants ?? 2) } };
        // What the documentation gives beyond the graph's own defaults: the operators' rate as the station's page states it (inside NASA's band).
        const given = { g: 0.42 };
        if (last && !last.result.ok) return decide("task.fail", { reason: (last.result.error ?? last.result.outcome).replace(/^(device refused|error):\s*/i, "") }, `${last.id} failed: nothing else to try`);
        switch (after) {
            case "plan:":
                return decide("library.graphs", {}, "which reference graphs the library holds");
            case "plan:library.graphs":
                return decide("task.plan", { selected_nodes: HABITAT_GRAPH_TYPES, missing_capabilities: [] }, "the station's reference graph: its types, nothing missing");
            case "build:task.plan":
                return decide("graph.evaluate", { label: "the habitat reference with a clean filter: the ventilation at its design flow", graph: STATION_GRAPH_ID, ...onBoard, variables: { ...given, L: 0 }, fit: VOLUMES } as unknown as JsonValue, "first candidate: the installation as designed, the volumes fitted");
            default: {
                const value = (last?.result.output ?? {}) as { value?: { pass?: boolean; candidate?: number; path?: string; diagnosis?: string; variables?: Record<string, number> } };
                const v = value.value ?? {};
                if (last?.id === "graph.evaluate" && v.pass) return decide("task.done", { summary: `candidate ${v.candidate} holds the residual threshold`, artifacts: [{ kind: "graph", path: v.path ?? "" }] }, "the candidate holds");
                // The loop on the diagnosis: a parameter's gap fits what was held; a structural gap revises the topology on a hypothesis.
                if (v.diagnosis === "STRUCTURAL_MISMATCH") {
                    if (this.revised) return decide("task.fail", { reason: `the revised structure misses the threshold too (${JSON.stringify(v.variables ?? {})}): no further hypothesis in this script` }, "the second structure fails as well");
                    this.revised = true;
                    // The hypothesis: a CO2 source in the Lab the observation did not list (one more person at work); the observed roster stays, one is added.
                    const revised = "persons" in onBoard ? { persons: [...(onBoard.persons as Array<Record<string, JsonValue>>), { id: "unobserved-1", callsign: "someone", module: "lab", activity: "light_work" }] } : { settings: { ...onBoard.settings, labOccupants: onBoard.settings.labOccupants + 1 } };
                    return decide("graph.evaluate", { label: "the habitat reference with one more source in the Lab: a person the observation did not list, the loading fitted", graph: STATION_GRAPH_ID, ...revised, variables: given, fit: { ...VOLUMES, L: { min: 0, max: 0.2 } } } as unknown as JsonValue, "structural: no admissible parameter set of the observed roster closes the gap where the curves part (the Lab's level); the hypothesis is a source in the Lab the observation missed");
                }
                return decide("graph.evaluate", { label: "the habitat reference with the filter's loading fitted: what the ventilation delivers, measured", graph: STATION_GRAPH_ID, ...onBoard, variables: given, fit: { ...VOLUMES, L: { min: 0, max: 0.2 } } } as unknown as JsonValue, "the gap the design flow cannot close: fit what the ventilation actually delivers, through the filter's loading");
            }
        }
    }

    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        const decision = this.next(input.state);
        this.exchanges.push({ decisionId: input.decisionId, model: this.model, request: { intention: input.intention, state: input.state, allowed: input.allowedCapabilities.map((c) => c.id) }, response: null, decision, proposedCapabilityId: decision.invocation.capabilityId, proposedInput: decision.invocation.input, latencyMs: 0, tokens: null });
        return decision;
    }
}
