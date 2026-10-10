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
import { decide, ScriptedBuilderBase, valueOf, type ScriptContext } from "../../harness/core/scripted-base.js";
import type { Procedure } from "../../lib/procedure/format.js";

export interface ScriptedProcedureOptions extends ScriptContext {
    /** The speed of the rise in the first submission: 0 is the story's first protocol (default). */
    firstSpeedPercent?: number;
    /** false: submits without reading who is in the volume (default true). */
    readPresence?: boolean;
    /** false: the first submission asks no monitoring (default true). */
    askMonitoring?: boolean;
    /** The device the procedure is for, by path; the first scrubber of the inventory by default. */
    device?: string;
}

type Presence = Array<{ module: string; occupants: number; subjects: Array<{ id: string }> }>;

interface Inventory {
    volumes?: Array<{ name: string; path: string }>;
    devices?: Array<{ path: string; type: string; area: string }>;
}

export class ScriptedProcedureBuilder extends ScriptedBuilderBase<ScriptedProcedureOptions> {
    private inventory: Inventory = {};
    private presence: Presence = [];
    /** The last procedure sent whole: a correction sends only what differs from it (procedure.revise), as a model does. */
    private lastSent: Procedure | null = null;
    /** The analysis of the aborted test this task follows, once sent (2026-09-29): the script then tightens the band it watches. */
    private analysed = false;

    /** What stopped the last test, when the task follows one. */
    private get previous(): { aborted: { condition?: string | null; reason?: string | null } } | null {
        const p = (this.options.task.observations as { previous?: { aborted?: { condition?: string | null; reason?: string | null } } } | undefined)?.previous;
        return p?.aborted ? { aborted: p.aborted } : null;
    }

    constructor(options: ScriptedProcedureOptions) {
        super("procedure", options);
    }

    override begin(): void {
        this.inventory = {};
        this.presence = [];
        this.lastSent = null;
    }

    /** A correction as a revision: the fields that differ from the procedure refused (null for one removed), the justifications of the constants that changed. */
    private revision(next: Procedure): JsonValue {
        const before = (this.lastSent ?? {}) as unknown as Record<string, unknown>;
        const after = next as unknown as Record<string, unknown>;
        const update: Record<string, unknown> = {};
        for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
            if (k === "justifications") continue;
            if (!(k in after)) update[k] = null;
            else if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) update[k] = after[k];
        }
        const had = new Set((this.lastSent?.justifications ?? []).map((j) => JSON.stringify(j)));
        const justifications = (next.justifications ?? []).filter((j) => !had.has(JSON.stringify(j)));
        return { update, justifications } as unknown as JsonValue;
    }

    /** The procedure the script writes: two steps, hatch closed, the rise at `speed`. */
    private procedure(speed: number, monitoring: boolean): Procedure {
        // After an aborted test the band is tighter: a person leaving it stops the test sooner (the change the analysis names).
        const maxBpm = this.analysed ? 110 : 120;
        // The device the task is about (its observations name it, as the station's request does), the option, or the first scrubber of the inventory.
        const wanted = this.options.device ?? (typeof (this.options.task.observations as { device?: unknown } | undefined)?.device === "string" ? String((this.options.task.observations as { device: string }).device) : undefined);
        const scrubber = this.inventory.devices?.find((d) => (wanted ? d.path === wanted : d.type === "Scrubber")) ?? this.inventory.devices?.find((d) => d.type === "Scrubber");
        const volume = this.inventory.volumes?.find((v) => v.name === scrubber?.area) ?? { name: "lab", path: "/habitat/lab" };
        const read = this.presence.find((m) => m.module === volume.name);
        const subjects = read?.subjects.map((s) => s.id) ?? [];
        const occupied = (read?.occupants ?? 0) > 0;
        // The speed measured when the task opened: the signed card's end.restore says the last step hands the scrubber back at it.
        const found = Number((this.options.task.observations as { measured?: { speedPercent?: unknown } } | undefined)?.measured?.speedPercent);
        const back = Number.isFinite(found) ? Math.round(found) : null;
        const minutes = back === null ? 24 : 25;
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
            limits: { co2MaxPpm: 2800, co2AbortPpm: 3200, minSpeedPercent: speed === 0 ? 0 : 30, maxMinutes: minutes },
            ...(read ? { occupancy: { module: volume.name, occupants: read.occupants, subjects, readBy: "biomed.presence" } } : {}),
            ...(monitoring && occupied ? { monitoring: { subjects, band: { minBpm: 45, maxBpm }, reason: `the test raises the CO2 of the air ${subjects.length} people breathe` } } : {}),
            authorisation: { by: "commander", required: true },
            steps: [
                { n: 1, hatch: "closed", speedPercent: speed, minutes: 12, why: "let the CO2 rise" },
                { n: 2, hatch: "closed", speedPercent: 100, minutes: 12, why: "time the decay: the served volume" },
                ...(back === null ? [] : [{ n: 3, hatch: "closed" as const, speedPercent: back, minutes: 1, why: "hand the scrubber back at the speed it found" }]),
            ],
            abort: [
                { id: "co2", source: "scrubber.motor.state", when: "CO2 of the volume at or above co2AbortPpm" },
                { id: "refused", source: "scrubber.motor.set_speed", when: "a step refused by the device" },
                { id: "battery", source: "station.registry_list", when: "battery below the threshold", threshold: 35 },
                ...(monitoring && occupied ? [{ id: "vitals", source: "biomed.verdict", when: "an occupant out of band, the monitoring lost, or one more person in the volume" }] : []),
            ],
            // The numbers the script chose: the steps' durations. The safety constants (limits, speeds, the battery abort, the band) are
            // checked and justified by the harness from the signed rules, never here (2026-10-10); a justification carries no value.
            justifications: [
                { constant: "steps.1.minutes", source: "assumed", reference: "", reason: "long enough for the CO2 to rise well above the sensor's noise" },
                { constant: "steps.2.minutes", source: "assumed", reference: "", reason: "long enough to see the decay's time constant" },
                ...(back === null ? [] : [{ constant: "steps.3.minutes", source: "assumed" as const, reference: "", reason: "one minute back at the speed found, the test then ends" }]),
            ],
            expected: {
                step1: "the CO2 of the volume rises and stays below co2MaxPpm",
                step2: "the CO2 decays towards an equilibrium; its time constant gives the served volume",
                ifSeparate: "the sensor of the next volume does not move",
                ifCoupled: "the sensor of the next volume follows, smaller and later",
            },
        };
    }

    protected next(state: PolicyFallbackInput["state"]): PolicyDecision {
        const { task, firstSpeedPercent = 0, readPresence = true, askMonitoring = true } = this.options;
        const last = this.last;
        // The installation and the presence as the task read them, replays included (the base's read).
        const inventory = this.read("factory.inventory");
        if (inventory) this.inventory = inventory as unknown as Inventory;
        const presence = this.read("biomed.presence");
        if (presence) this.presence = (presence.modules ?? []) as unknown as Presence;
        const refusal = String(state.features.lastRefusal ?? "");
        const after = `${String(state.features.phase)}:${String(state.features.lastCapability)}`;
        // A safety limit that cites an unsigned document: no procedure passes until a person signs it, so the script ends, naming it, as the refusal asks.
        const unsigned = /(?:the fact \S+ is|the guard's rules are) in "([^"]+)", which no person has signed/.exec(refusal);
        if (unsigned) return decide("task.fail", { reason: `the safety card "${unsigned[1]}" is not signed: no procedure's safety limits can be justified until a person signs it` }, "the refusal names an unsigned document");
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
            case "build:biomed.presence":
            case "build:procedure.analyse": {
                // A task that follows an aborted test analyses it first, from what stopped it; then writes the test with the band tightened.
                const previous = this.previous;
                if (previous && !this.analysed && after !== "build:procedure.analyse") {
                    const why = [previous.aborted.condition, previous.aborted.reason].filter(Boolean).join(": ");
                    return decide(
                        "procedure.analyse",
                        {
                            cause: `the test stopped on ${why}`,
                            evidence: [`the abort recorded by the station: ${why}`],
                            whyNotPrevented: "the band watched was the card's widest, so the test ran until the verdict tripped rather than stopping at the first sign",
                            changes: [{ path: "monitoring.band.maxBpm", change: "120 becomes 110 bpm", prevents: "a person whose rate climbs stops the test sooner" }],
                        } as unknown as JsonValue,
                        "the last test was aborted: its cause first",
                    );
                }
                if (after === "build:procedure.analyse") this.analysed = true;
                // After a refusal, the script does what the reasons say; before one, it writes its first procedure.
                if (/diligence/.test(refusal)) return decide("biomed.presence", {}, "the refusal says the occupancy was not read");
                // A builder that does not understand its refusals (observations.script.ignoresRefusals, the learning scenario, 2026-09-29) but follows
                // what its memory holds, as a model reads it (2026-09-29, the memory audit): it holds the speed only once an entry learned about
                // a step's speed is in its state (memory.learned); any builder does, from its first submission.
                const stubborn = (task.observations as { script?: { ignoresRefusals?: boolean } } | undefined)?.script?.ignoresRefusals === true;
                const learned = ((state.features.state as { memory?: { learned?: Array<{ rule?: string }> } | null } | null)?.memory?.learned ?? []).some((e) => /speedpercent/i.test(String(e.rule ?? "")));
                const corrected = stubborn ? learned : learned || Boolean(refusal) || after === "build:biomed.presence" || this.analysed;
                const speed = corrected ? Math.max(firstSpeedPercent, 30) : firstSpeedPercent;
                const monitoring = askMonitoring || /monitoring/.test(refusal);
                const next = this.procedure(speed, monitoring);
                // Refused by the topic's guard, the whole procedure is kept: the correction sends only what changes.
                if (this.lastSent && /procedure refused:/.test(refusal)) return decide("procedure.revise", this.revision(next), `revised after: ${refusal.slice(0, 200)}`);
                this.lastSent = next;
                return decide("procedure.submit", next as unknown as JsonValue, corrected ? `corrected after: ${refusal.slice(0, 200) || "the occupancy read"}` : "the rise is fastest with the scrubber stopped");
            }
            default: {
                const accepted = valueOf(last) as { path?: string; value?: { path?: string } };
                const path = accepted.value?.path ?? accepted.path ?? "procedures/decay-draft-02.json";
                return decide("task.done", { summary: "decay procedure, two steps with the hatch closed, accepted by the guard", artifacts: [{ kind: "procedure", path }] }, "the procedure is accepted");
            }
        }
    }
}
