/**
 * The scripted builder of the `code` topic, for the tests and nothing
 * else: the demo's plugin is written by the language model behind the
 * `reasoner` slot, reading the topic's prompt; the factory asks for this
 * script only when told to (`builder: "scripted"`), and the manifest names
 * it.
 *
 * It plays the chain so the whole deterministic path can be watched
 * without a key: the catalogue searched, the plan, the leak plugin
 * written (with a wrong type name first, when asked, so the guard's
 * refusal and the correction are seen), compiled, tested, loaded, run in a
 * document, proposed, handed over. Like the other scripts it decides from
 * what it observes (the phase, the last capability, the last refusal) and
 * keeps no counter.
 */
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Provider, ProviderExchange } from "../lib/provider.js";
import type { CapabilityCall } from "../core/capabilities.js";
import type { TaskFile } from "../core/task.js";
import { leakFixture, leakSpec, LEAK_TYPE } from "./code-fixture.js";

export interface ScriptedCodeOptions {
    task: TaskFile["task"];
    lastCall: () => CapabilityCall | null;
    /** The type name of the first write; the story's is under Generated. (default); another shows the guard's refusal and the correction. */
    firstType?: string;
    /** The plugin's name in the forge (default "leak"). */
    plugin?: string;
}

const decide = (capabilityId: string, input: JsonValue, rationale: string): PolicyDecision => ({ action: { id: capabilityId, description: capabilityId }, invocation: { actionId: capabilityId, capabilityId, input }, rationale });

const valueOf = (call: CapabilityCall | null): Record<string, JsonValue> => (call?.result.ok && call.result.output && typeof call.result.output === "object" ? (call.result.output as Record<string, JsonValue>) : {});

export class ScriptedCodeBuilder implements Provider {
    readonly name = "scripted:code";
    readonly model = "scripted/code";
    readonly family = "scripted";
    readonly exchanges: ProviderExchange[] = [];
    readonly contextMode = "state" as const;
    calls = 0;

    constructor(private readonly options: ScriptedCodeOptions) {}

    begin(): void {
        // Nothing kept: the script reads the state.
    }

    private next(state: PolicyFallbackInput["state"]): PolicyDecision {
        const { task, firstType = LEAK_TYPE, plugin = "leak" } = this.options;
        const last = this.options.lastCall();
        const refusal = String(state.features.lastRefusal ?? "");
        const after = `${String(state.features.phase)}:${String(state.features.lastCapability)}`;
        if (last && !last.result.ok) return decide("task.fail", { reason: (last.result.error ?? last.result.outcome).replace(/^(device refused|error):\s*/i, "") }, `${last.id} failed: nothing else to try`);
        // A refused write: the guard named the naming rule; the script corrects the type.
        if (/is not named under "Generated\."/.test(refusal)) return decide("forge.plugin_write", { plugin, files: leakFixture(LEAK_TYPE) as unknown as JsonValue }, "corrected: the type named under Generated.");
        switch (after) {
            case "plan:":
                return decide("forge.registry_search", { requiredOutputs: task.objective.required_outputs.map((o) => ({ quantity: o.quantity, ...(o.unit ? { unit: o.unit } : {}) })) }, "what the forge's catalogue produces for the required outputs");
            case "plan:forge.registry_search":
                return decide("task.plan", { selected_nodes: [], missing_capabilities: task.objective.required_outputs.map((o) => ({ required_output: o.name, quantity: o.quantity, ...(o.unit ? { unit: o.unit } : {}), reason: "no node of the catalogue produces it: a leak out of a volume", topic: "code" })) }, "nothing produces it: the node is written");
            case "build:task.plan":
                return decide("forge.plugin_template", {}, "the shape of a plugin the substrate accepts");
            case "build:forge.plugin_template":
                return decide("forge.plugin_write", { plugin, files: leakFixture(firstType) as unknown as JsonValue }, "the leak plugin: its entry, its node, its test, its card");
            case "build:forge.plugin_write": {
                const written = valueOf(last) as { ok?: boolean };
                if (written.ok === false) return decide("forge.plugin_write", { plugin, files: leakFixture(LEAK_TYPE) as unknown as JsonValue, replace: true }, "the forge refused the files: written again, whole");
                return decide("forge.plugin_build", { plugin }, "compile it");
            }
            case "build:forge.plugin_build":
                return decide("forge.plugin_test", { plugin }, "its tests, then the forge's checks");
            case "build:forge.plugin_test":
                return decide("code.accept", {}, "the task's contract, run by the forge");
            case "build:code.accept":
                return decide("forge.plugin_load", { plugin }, "into the forge's catalogue");
            case "build:forge.plugin_load":
                return decide("forge.document_build", { spec: leakSpec() as unknown as JsonValue, name: "leak-run" }, "a document that wires the node");
            case "build:forge.document_build":
                return decide("forge.session_run", { name: "leak-run", dt: 60, duration: 180, probes: [{ node: "leak", property: "co2DeltaKgps" }] }, "run it three minutes");
            case "build:forge.session_run":
                return decide("forge.plugin_promote", { plugin }, "propose the signed artifact to the station");
            default: {
                const promoted = valueOf(last) as { path?: string };
                return decide("task.done", { summary: "the leak node, generated: compiled, tested, checked, loaded and run in the forge; proposed to the station", artifacts: [{ kind: "plugin", path: promoted.path ?? `forge/${plugin}/artifact.json` }] }, "the artifact the forge signed");
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
