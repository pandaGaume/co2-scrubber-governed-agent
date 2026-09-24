/**
 * The scripted builder of the `graph` topic, for the tests and nothing
 * else: the demo's graph is built by the model behind the `reasoner` slot
 * with the topic's prompt; the factory asks for this script only when told
 * to (`builder: "scripted"`), and the manifest names it.
 *
 * It plays the two candidates of the commissioning (mise-en-service.fr.md,
 * section 11), so the loop can be watched without a key: the catalogue, the
 * plan, a first candidate with the Lab and the inter-module ventilation at
 * its design flow (the volume fitted), refused by its residual; a second
 * with the same structure and the ventilation's flow fitted, accepted; the
 * claim. The structure is the design's from the start: the scrubber is
 * centralised and serves Hab-B through the ventilation, so a Lab without
 * exchange is not a candidate; what the test finds is how much the
 * ventilation delivers. It decides from what it
 * observes (the phase, the last capability, the last evaluation), like the
 * other scripts.
 */
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Provider, ProviderExchange } from "../lib/provider.js";
import type { CapabilityCall } from "../core/capabilities.js";
import type { TaskFile } from "../core/task.js";

export interface ScriptedGraphOptions {
    task: TaskFile["task"];
    lastCall: () => CapabilityCall | null;
}

const decide = (capabilityId: string, input: JsonValue, rationale: string): PolicyDecision => ({ action: { id: capabilityId, description: capabilityId }, invocation: { actionId: capabilityId, capabilityId, input }, rationale });

/** The Lab: its crew, the scrubber on the measured speed, the air; with the exchange when asked. */
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

export class ScriptedGraphBuilder implements Provider {
    readonly name = "scripted:graph";
    readonly model = "scripted/graph";
    readonly family = "scripted";
    readonly exchanges: ProviderExchange[] = [];
    calls = 0;

    constructor(private readonly options: ScriptedGraphOptions) {}

    private next(state: PolicyFallbackInput["state"]): PolicyDecision {
        const { task } = this.options;
        const last = this.options.lastCall();
        const after = `${String(state.features.phase)}:${String(state.features.lastCapability)}`;
        const occupants = Number((task.observations as { labOccupants?: unknown })?.labOccupants ?? 2);
        // What the documentation gives: the scrubber's effective flow and lag (its datasheet), the crew and their rate (the station's page).
        const fixed = { N: occupants, g: 0.42, Qe: 1.0, lag: 3.33 };
        // The ventilation's design flow, hatch closed (the station's topology).
        const qNominal = 3.0;
        const compare = [{ node: "lab", property: "co2Ppm", column: "co2_lab_ppm" }];
        if (last && !last.result.ok) return decide("task.fail", { reason: (last.result.error ?? last.result.outcome).replace(/^(device refused|error):\s*/i, "") }, `${last.id} failed: nothing else to try`);
        switch (after) {
            case "plan:":
                return decide("twin.registry_search", { requiredOutputs: task.objective.required_outputs.map((o) => ({ quantity: o.quantity, ...(o.unit ? { unit: o.unit } : {}) })) }, "which node types produce the outputs");
            case "plan:twin.registry_search":
                return decide("task.plan", { selected_nodes: ["Physics.LifeSupport:cabin-air", "Physics.LifeSupport:crew", "Physics.LifeSupport:scrubber", "Logic.Time:timeline"], missing_capabilities: [] }, "a cabin, its crew, its scrubber, the measured command");
            case "build:task.plan":
                return decide("graph.evaluate", { label: "the Lab and the inter-module ventilation at its design flow", spec: labCandidate(true), compare, variables: { ...fixed, q: qNominal }, fit: { V: { min: 10, max: 100 } } } as unknown as JsonValue, "first candidate: the installation as designed");
            default: {
                const value = (last?.result.output ?? {}) as { value?: { pass?: boolean; candidate?: number; path?: string } };
                const v = value.value ?? {};
                if (last?.id === "graph.evaluate" && v.pass) return decide("task.done", { summary: `candidate ${v.candidate} holds the residual threshold`, artifacts: [{ kind: "graph", path: v.path ?? "" }] }, "the candidate holds");
                return decide("graph.evaluate", { label: "the Lab and the inter-module ventilation, its delivered flow measured", spec: labCandidate(true), compare, variables: fixed, fit: { V: { min: 10, max: 100 }, q: { min: 0, max: 6 } } } as unknown as JsonValue, "the gap the design flow cannot close: fit what the ventilation actually delivers");
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
