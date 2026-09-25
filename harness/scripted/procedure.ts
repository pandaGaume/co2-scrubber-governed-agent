/**
 * The scripted builder of the `procedure` topic, for the tests and nothing
 * else: the demo's procedure is written by the language model behind the
 * `reasoner` slot (Claude today, Nemotron on Nebius tomorrow), reading the
 * topic's prompt; the factory asks for this script only when told to
 * (`builder: "scripted"`), and the manifest names it.
 *
 * It plays the story's lines so the whole deterministic chain can be
 * watched without a key: the inventory, the method card, the presence, the plan, a first
 * procedure that stops the scrubber for the rise (the good reflex for the
 * measurement, the wrong one for the people), refused by the guard as a
 * plan; the correction at 30 %; the claim. Options make it forget what a
 * model might forget (the presence, the monitoring), so the other
 * refusals can be seen too.
 *
 * Like the onnx script, it decides from what it observes (the phase, the
 * last capability, the last refusal) and keeps no counter.
 */
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Provider, ProviderExchange } from "../lib/provider.js";
import type { CapabilityCall } from "../core/capabilities.js";
import type { TaskFile } from "../core/task.js";
import type { Procedure } from "../topics/procedure/procedure.js";

export interface ScriptedProcedureOptions {
    task: TaskFile["task"];
    lastCall: () => CapabilityCall | null;
    /** The speed of the rise in the first submission: 0 is the story's first protocol (default). */
    firstSpeedPercent?: number;
    /** false: submits without reading who is in the volume (default true). */
    readPresence?: boolean;
    /** false: the first submission asks no monitoring (default true). */
    askMonitoring?: boolean;
    /** The device the procedure is for, by path; the first scrubber of the inventory by default. */
    device?: string;
}

const decide = (capabilityId: string, input: JsonValue, rationale: string): PolicyDecision => ({ action: { id: capabilityId, description: capabilityId }, invocation: { actionId: capabilityId, capabilityId, input }, rationale });

const valueOf = (call: CapabilityCall | null): Record<string, JsonValue> => (call?.result.ok && call.result.output && typeof call.result.output === "object" ? (call.result.output as Record<string, JsonValue>) : {});

type Presence = Array<{ module: string; occupants: number; subjects: Array<{ id: string }> }>;

interface Inventory {
    volumes?: Array<{ name: string; path: string }>;
    devices?: Array<{ path: string; type: string; area: string }>;
}

export class ScriptedProcedureBuilder implements Provider {
    readonly name = "scripted:procedure";
    readonly model = "scripted/procedure";
    readonly family = "scripted";
    readonly exchanges: ProviderExchange[] = [];
    /** The script runs on the reasoning state, as the model does: the runner builds the topic's state at every step and replays nothing. */
    readonly contextMode = "state" as const;
    calls = 0;
    private inventory: Inventory = {};
    private presence: Presence = [];

    constructor(private readonly options: ScriptedProcedureOptions) {}

    begin(): void {
        this.inventory = {};
        this.presence = [];
    }

    /** The procedure the script writes: two steps, hatch closed, the rise at `speed`. */
    private procedure(speed: number, monitoring: boolean): Procedure {
        const scrubber = this.inventory.devices?.find((d) => (this.options.device ? d.path === this.options.device : d.type === "Scrubber"));
        const volume = this.inventory.volumes?.find((v) => v.name === scrubber?.area) ?? { name: "lab", path: "/habitat/lab" };
        const read = this.presence.find((m) => m.module === volume.name);
        const subjects = read?.subjects.map((s) => s.id) ?? [];
        const occupied = (read?.occupants ?? 0) > 0;
        return {
            version: 1,
            id: speed === 0 ? "decay-draft-01" : "decay-draft-02",
            method: "concentration-decay",
            standard: "ASTM E741, concentration decay, one zone",
            purpose: `served volume of ${volume.name}`,
            volume: volume.path,
            device: scrubber?.path ?? "/habitat/lab/eclss/scrubber-1",
            quantities: [{ name: `V_${volume.name.replace(/-/g, "_")}`, quantity: "Volume", unit: "m3" }],
            hypotheses: ["the flow the inter-module ventilation delivers, hatch closed, is not measured by this test; the design says 3 m3/min, and the residual of the candidate simulators says whether the installation delivers it"],
            limits: { co2MaxPpm: 2800, co2AbortPpm: 3200, minSpeedPercent: speed === 0 ? 0 : 30, maxMinutes: 24 },
            ...(read ? { occupancy: { module: volume.name, occupants: read.occupants, subjects, readBy: "biomed.presence" } } : {}),
            ...(monitoring && occupied ? { monitoring: { subjects, band: { minBpm: 45, maxBpm: 120 }, reason: `the test raises the CO2 of the air ${subjects.length} people breathe` } } : {}),
            authorisation: { by: "commander", required: true },
            steps: [
                { n: 1, hatch: "closed", speedPercent: speed, minutes: 12, why: "let the CO2 rise" },
                { n: 2, hatch: "closed", speedPercent: 100, minutes: 12, why: "time the decay: the served volume" },
            ],
            abort: [
                { id: "co2", source: "scrubber.motor.state", when: "CO2 of the volume at or above co2AbortPpm" },
                { id: "refused", source: "scrubber.motor.set_speed", when: "a step refused by the device" },
                { id: "battery", source: "station.registry_list", when: "battery below the threshold", threshold: 35 },
                ...(monitoring && occupied ? [{ id: "vitals", source: "biomed.verdict", when: "an occupant out of band, the monitoring lost, or one more person in the volume" }] : []),
            ],
            expected: {
                step1: "the CO2 of the volume rises and stays below co2MaxPpm",
                step2: "the CO2 decays towards an equilibrium; its time constant gives the served volume",
                ifSeparate: "the sensor of the next volume does not move",
                ifCoupled: "the sensor of the next volume follows, smaller and later",
            },
        };
    }

    private next(state: PolicyFallbackInput["state"]): PolicyDecision {
        const { task, firstSpeedPercent = 0, readPresence = true, askMonitoring = true } = this.options;
        const last = this.options.lastCall();
        if (last?.id === "factory.inventory") this.inventory = valueOf(last) as unknown as Inventory;
        if (last?.id === "biomed.presence") this.presence = (valueOf(last).modules ?? []) as unknown as Presence;
        const refusal = String(state.features.lastRefusal ?? "");
        const after = `${String(state.features.phase)}:${String(state.features.lastCapability)}`;
        if (last && !last.result.ok) return decide("task.fail", { reason: (last.result.error ?? last.result.outcome).replace(/^(device refused|error):\s*/i, "") }, `${last.id} failed: nothing else to try`);
        switch (after) {
            case "plan:":
                return decide("factory.inventory", {}, "what is installed, and where");
            case "plan:factory.inventory":
                // The method before the plan, as the harness's stages ask: the card that measures the missing quantity, read whole into the state.
                return decide("library.methods", { quantity: task.objective.required_outputs[0]?.quantity ?? "Volume" }, "which method measures what is missing");
            case "plan:library.methods": {
                const methods = (valueOf(last).methods ?? []) as Array<{ id: string }>;
                return decide("library.read", { id: methods[0]?.id ?? "method-concentration-decay" }, "the method's rules of application");
            }
            case "plan:library.read":
                if (readPresence) return decide("biomed.presence", {}, "who is in the volumes");
            // falls through: a builder that does not read the presence plans at once
            case "plan:biomed.presence":
                return decide(
                    "task.plan",
                    { selected_nodes: [], missing_capabilities: task.objective.required_outputs.map((o) => ({ required_output: o.name, quantity: o.quantity, ...(o.unit ? { unit: o.unit } : {}), reason: "no plan states the served volume of this installation: it is measured", topic: "procedure" })) },
                    "the volume is not known, it is measured",
                );
            case "build:task.plan":
            case "build:biomed.presence": {
                // After a refusal, the script does what the reasons say; before one, it writes its first procedure.
                if (/diligence/.test(refusal)) return decide("biomed.presence", {}, "the refusal says the occupancy was not read");
                const corrected = Boolean(refusal) || after === "build:biomed.presence";
                const speed = corrected ? Math.max(firstSpeedPercent, 30) : firstSpeedPercent;
                const monitoring = askMonitoring || /monitoring/.test(refusal);
                return decide("procedure.submit", this.procedure(speed, monitoring) as unknown as JsonValue, corrected ? `corrected after: ${refusal.slice(0, 200) || "the occupancy read"}` : "the rise is fastest with the scrubber stopped");
            }
            default: {
                const accepted = valueOf(last) as { path?: string; value?: { path?: string } };
                const path = accepted.value?.path ?? accepted.path ?? "procedures/decay-draft-02.json";
                return decide("task.done", { summary: "decay procedure, two steps with the hatch closed, accepted by the guard", artifacts: [{ kind: "procedure", path }] }, "the procedure is accepted");
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
