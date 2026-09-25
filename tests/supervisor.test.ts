/**
 * The Contract Supervisor (2026-09-25, night): a typed verdict over the
 * facts layer, checked by code before it counts; the deterministic conflicts
 * carried, never dropped; the Observer sent back into its loop by the
 * findings that name it; the graph factory's requirement reading the
 * verdict applied to the report; the slot through the broker.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import type { Provider, ProviderExchange } from "../harness/lib/provider.js";
import { applyVerdict, checkVerdict, findingsFor, supervise, supervisionOfRequest, supervisorBrief, type Verdict } from "../harness/supervisor/supervisor.js";
import { reviewContracts, type LibraryFact } from "../harness/core/contracts.js";
import { loadFacts, LIBRARY_DIR } from "../slots/tools/library/provider.js";
import { observe } from "../harness/observer/observer.js";
import type { TwinFactoryRequest } from "../harness/observer/request.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import { requirementsOf } from "../harness/topics/graph/index.js";
import type { TaskFile } from "../harness/core/task.js";
import { fromRoot } from "../lib/paths.js";

const PORT = 3129;
const DEVICES = (JSON.parse(readFileSync(fromRoot("specs", "commissioning-devices.json"), "utf8")) as { devices: unknown[] }).devices;
const library = (): Array<LibraryFact & { source: string }> => ["scrubber-1-datasheet", "station-topology", "nasa-crew-metabolic-loads"].flatMap((id) => loadFacts(LIBRARY_DIR, id).map((f) => ({ ...f, source: id })));

/** A request with one known constant wrong (the speed floor taken for the efficiency) and one assumption of isolated modules. */
const REQUEST = {
    objective: "reproduce the Lab CO2",
    entities: [{ name: "Lab" }],
    observables: [{ name: "co2", quantity: "Concentration", unit: "ppm", column: "co2_lab_ppm" }],
    inputs: [{ name: "speed", quantity: "Dimensionless", unit: "percent" }],
    outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm" }],
    required_behaviors: ["the CO2 decays at full speed"],
    validation: { criteria: ["predicted_co2 against co2_lab_ppm"] },
    known: [{ symbol: "eta", name: "efficiency", value: 40, unit: "percent", source: "scrubber-1-datasheet", factId: "scrubber.singlePassEfficiency" }],
    assumptions: ["the ventilation delivers an unknown flow", "the Lab and Hab-B do not mix at all while the hatch is closed"],
} as unknown as TwinFactoryRequest;

/** A stand-in for the model: its first verdict drops the computed conflict, its second carries it and adds the assumption. */
class TwoVerdicts implements Provider {
    readonly name = "stand-in:supervisor";
    readonly model = "stand-in";
    readonly family = "stand-in";
    readonly exchanges: ProviderExchange[] = [];
    readonly contextMode = "state" as const;
    calls = 0;
    seen: Array<Record<string, JsonValue>> = [];
    constructor(private readonly verdicts: Verdict[]) {}
    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.seen.push(input.state.features as Record<string, JsonValue>);
        const verdict = this.verdicts[Math.min(this.calls, this.verdicts.length - 1)];
        this.calls++;
        const capabilityId = input.allowedCapabilities[0].id;
        return { action: { id: capabilityId, description: capabilityId }, invocation: { actionId: capabilityId, capabilityId, input: verdict as unknown as JsonValue }, rationale: "stand-in" };
    }
}

describe("the Contract Supervisor: a typed verdict over the facts, checked before it counts", () => {
    it("the guard: names among the input's, the computed conflicts carried, the status true to the findings", () => {
        const input = supervisionOfRequest(REQUEST, DEVICES, library());
        assert.equal(input.report.status, "CONFLICT");
        assert.deepEqual(input.report.conflicts.map((c) => [c.id, c.revise]), [["scrubber.singlePassEfficiency", "observer"]]);
        assert.deepEqual(input.symbols, { eta: "scrubber.singlePassEfficiency" });
        assert.equal(input.assumptions?.length, 2);
        // A verdict that drops the computed conflict is refused; one that says CONSISTENT over it too.
        const dropped = checkVerdict({ status: "CONSISTENT", findings: [] }, input);
        assert.match(dropped.problems.join("; "), /carried: the deterministic layer found scrubber.singlePassEfficiency in conflict \(observer to revise\)/);
        assert.match(dropped.problems.join("; "), /status: the deterministic layer found a conflict; the verdict cannot be CONSISTENT/);
        // Names: a fact of the list, assumption:<n>, symbol:<s>, a producer of the list.
        const wrong = checkVerdict({ status: "CONFLICT", findings: [{ kind: "conflict", fact: "scrubber.efficiency", producer: "nobody", reason: "x", required_action: "FIX" }, { kind: "assumption", fact: "assumption:9", producer: "observer", reason: "y", required_action: "REVISE" }] }, input);
        assert.match(wrong.problems.join("; "), /finding 1: required_action must be one of REVISE, COMPLETE, INSPECT, REJECT/);
        assert.match(wrong.problems.join("; "), /finding 1: producer "nobody" is not one of the producers \(observer, register, library\)/);
        assert.match(wrong.problems.join("; "), /finding 1: "scrubber.efficiency" is not a fact of the list/);
        assert.match(wrong.problems.join("; "), /finding 2: "assumption:9" names no assumption \(2 listed\)/);
        // The good one: the computed conflict carried, the assumption against the documented ventilation added.
        const good: Verdict = { status: "CONFLICT", findings: [{ kind: "conflict", fact: "scrubber.singlePassEfficiency", producer: "observer", reason: "40 percent is the speed floor, the fact says 0.3", required_action: "REVISE" }, { kind: "assumption", fact: "assumption:2", producer: "observer", reason: "station-topology documents the ventilation through the ducts with the hatch closed (habitat.interModuleVentilation.designFlow.hatchClosed)", required_action: "REVISE" }] };
        assert.deepEqual(checkVerdict(good, input), { ok: true, problems: [] });
        // An assumption nothing contradicts is not a finding: a reason that names no fact and no document, or an "unsupported" on an assumption, is refused.
        const notAFinding = checkVerdict({ status: "CONFLICT", findings: [{ kind: "conflict", fact: "scrubber.singlePassEfficiency", producer: "observer", reason: "the fact says 0.3", required_action: "REVISE" }, { kind: "unsupported", fact: "assumption:1", producer: "observer", reason: "no density is stated to support it", required_action: "COMPLETE" }] }, input);
        assert.match(notAFinding.problems.join("; "), /finding 2: an assumption is unsupported by nature; a finding on assumption:1 names the fact or the document that contradicts it/);
        // A numeric disagreement the rules already weighed and found within the tolerance (the device's 0.30303 against the datasheet's 0.3) is not the supervisor's to reopen.
        const consistent = supervisionOfRequest({ ...REQUEST, known: [{ symbol: "eta", name: "efficiency", value: 0.3, unit: "ratio", source: "scrubber-1-datasheet", factId: "scrubber.singlePassEfficiency" }] } as unknown as TwinFactoryRequest, DEVICES, library());
        assert.equal(consistent.report.status, "CONSISTENT");
        const reopened = checkVerdict({ status: "CONFLICT", findings: [{ kind: "conflict", fact: "scrubber.singlePassEfficiency", producer: "observer", reason: "0.3 against 0.30303", required_action: "REVISE" }] }, consistent);
        assert.match(reopened.problems.join("; "), /the deterministic layer compared scrubber.singlePassEfficiency across observer \(0.3 ratio\), register \(0.30303 ratio\), library \(0.3 ratio\) and found them consistent within the tolerance; a numeric disagreement is not yours to declare/);
        assert.match(checkVerdict({ status: "CONFLICT", findings: [{ kind: "conflict", fact: "fact:2", producer: "observer", reason: "x", required_action: "REVISE" }] }, consistent).problems.join("; "), /name a fact by its id exactly as the state's factIds writes it/);
        assert.deepEqual(checkVerdict({ status: "MISSING", findings: [] }, { ...input, report: reviewContracts([]) }).problems, ["status: MISSING with no finding: say what, and who acts"]);
        assert.equal(checkVerdict({ status: "CONSISTENT", findings: [] }, { ...input, report: reviewContracts([]) }).ok, true);
        // The findings a producer must answer, as its guard would say them; the verdict applied to the report keeps the worse status.
        assert.deepEqual(findingsFor(good, "observer").map((p) => p.split(":")[0]), ["supervisor", "supervisor"]);
        assert.deepEqual(findingsFor(good, "register"), []);
        const applied = applyVerdict(reviewContracts([]), { status: "AMBIGUOUS", findings: [{ kind: "symbol", fact: "symbol:eta", producer: "observer", reason: "z", required_action: "REVISE" }] });
        assert.equal(applied.status, "AMBIGUOUS");
        assert.equal(applyVerdict(input.report, { status: "MISSING", findings: [] }).status, "CONFLICT", "a computed conflict is never softened by the verdict");
        assert.match(supervisorBrief({ step: 1, attemptsLeft: 2, computed: input.report }), /^Step 1\. Read the facts.*The deterministic layer found 1 conflict\(s\) \(scrubber.singlePassEfficiency: observer to revise\): carry them\./);
    });

    it("the loop: a refused verdict comes back with its reasons, the corrected one is accepted; the model reads facts and a report, never a transcript", async () => {
        const input = supervisionOfRequest(REQUEST, DEVICES, library());
        const model = new TwoVerdicts([
            { status: "CONSISTENT", findings: [] },
            { status: "CONFLICT", findings: [{ kind: "conflict", fact: "scrubber.singlePassEfficiency", producer: "observer", reason: "the fact says 0.3 ratio", required_action: "REVISE" }] },
        ]);
        const r = await supervise({ provider: model, input });
        assert.equal(r.ok, true);
        assert.deepEqual(r.attempts.map((a) => a.ok), [false, true]);
        assert.match(r.attempts[0].problems.join("; "), /carried: the deterministic layer found scrubber.singlePassEfficiency/);
        const state = model.seen[1].state as { facts: string[]; report: { status: string }; assumptions: string[]; lastAttempt: { n: number } };
        assert.ok(state.facts.some((f) => /^observer \(documented, scrubber-1-datasheet\): scrubber.singlePassEfficiency = 40 percent/.test(f)), state.facts.join("\n"));
        assert.ok(state.facts.some((f) => /^register \(device, \/habitat\/lab\/eclss\/scrubber-1\): scrubber.singlePassEfficiency = 0.30303 ratio/.test(f)));
        assert.equal(state.report.status, "CONFLICT");
        assert.equal(state.assumptions[1], "assumption:2 the Lab and Hab-B do not mix at all while the hatch is closed");
        assert.equal(state.lastAttempt.n, 1);
        assert.match(String(model.seen[1].brief), /^Step 2\. Your verdict was refused: carried/);
        assert.equal(JSON.stringify(model.seen[1]).length < 6000, true, "the supervisor reads a few thousand characters, never a transcript");
        const gaveUp = await supervise({ provider: new TwoVerdicts([{ status: "CONSISTENT", findings: [] }]), input, attempts: 2 });
        assert.equal(gaveUp.ok, false);
        assert.equal(gaveUp.verdict, null);
    });

    it("the graph factory reads the verdict applied to the report: sourcesConsistent false on the supervisor's CONFLICT even when the rules found none", () => {
        const task = { objective: { required_outputs: [], constraints: { rmsePpmMax: 10 } }, observations: {}, requirements: {}, budget: { iterations: 12, minutes: 10 } } as unknown as TaskFile["task"];
        const progress = newProgress();
        const clean = reviewContracts([]);
        progress.context = { shelf: [{ id: "habitat", description: "", types: [], variables: {}, settings: [], probes: [] }], telemetry: { file: "t", rows: 1, columns: ["minute"], minutes: 1 }, contracts: clean };
        assert.equal(requirementsOf(progress, task).sourcesConsistent, true);
        progress.context.contracts = applyVerdict(clean, { status: "CONFLICT", findings: [{ kind: "assumption", fact: "assumption:1", producer: "observer", reason: "against the documented ventilation", required_action: "REVISE" }] });
        assert.equal(requirementsOf(progress, task).sourcesConsistent, false);
    });
});

describe("the Observer sent back by the supervisor, and the slot, through the broker", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let broker: Broker;

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        ({ broker: local, slots } = await startAllOrFail(PORT));
        broker = new Broker(local.httpBase, { name: "supervisor-test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        await broker?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
    });

    it("the review hook: a request the guard accepts is refused by the supervisor's findings for the Observer, and the corrected one passes", async () => {
        // A request the deterministic guard accepts (the efficiency right, cited by fact), with the isolated-modules assumption worded past the regex rule.
        const accepted = { ...REQUEST, known: [{ symbol: "eta", name: "efficiency", value: 0.3, unit: "ratio", source: "scrubber-1-datasheet", factId: "scrubber.singlePassEfficiency" }], assumptions: ["Hab-B keeps its own air during the test: nothing crosses while the hatch is shut"] } as unknown as TwinFactoryRequest;
        const corrected = { ...accepted, assumptions: ["what the inter-module ventilation delivers, hatch closed, is unknown"] } as unknown as TwinFactoryRequest;
        let calls = 0;
        class Model implements Provider {
            readonly name = "stand-in:observer";
            readonly model = "stand-in";
            readonly family = "stand-in";
            readonly exchanges: ProviderExchange[] = [];
            readonly contextMode = "state" as const;
            calls = 0;
            async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
                this.calls++;
                const first = this.calls === 1;
                if (first) {
                    // The datasheet first, so the fact cited is a document read.
                    return { action: { id: "library.read", description: "" }, invocation: { actionId: "library.read", capabilityId: "library.read", input: { id: "scrubber-1-datasheet" } }, rationale: "the datasheet" };
                }
                const capabilityId = input.allowedCapabilities[0].id;
                return { action: { id: capabilityId, description: capabilityId }, invocation: { actionId: capabilityId, capabilityId, input: (this.calls === 2 ? accepted : corrected) as unknown as JsonValue }, rationale: "stand-in" };
            }
        }
        const review = async (request: TwinFactoryRequest): Promise<string[]> => {
            calls++;
            const isolated = (request.assumptions ?? []).some((a) => /nothing crosses/.test(a));
            return isolated ? ["supervisor: assumption on assumption:1, REVISE: the topology documents the ventilation through the ducts with the hatch closed"] : [];
        };
        const result = await observe({ provider: new Model(), broker, description: "The Lab of a lunar habitat: one CO2 scrubber, a CO2 sensor, a hatch to hab-b.", review });
        assert.equal(result.ok, true, JSON.stringify(result.attempts));
        assert.deepEqual(result.attempts.map((a) => a.ok), [false, true]);
        assert.match(result.attempts[0].problems[0], /^supervisor: assumption on assumption:1, REVISE/);
        assert.equal(calls, 2, "the supervisor is asked only on a request the guard accepted");
        assert.deepEqual(result.request?.assumptions, corrected.assumptions);
    });

    it("the slot says plainly when no model is ready, and the deterministic report stands", async () => {
        if (process.env.ANTHROPIC_API_KEY) return; // a machine with a key would reach the model; the point here is the machine without one
        const r = await broker.call("supervisor", "review_request", { request: REQUEST, devices: DEVICES });
        assert.equal(r.ok, false);
        assert.match(String(r.error), /reasoner is not ready/);
    });
});
