import { test } from "node:test";
import assert from "node:assert/strict";
import type { CapabilityDescriptor, JsonValue, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Broker } from "../harness/lib/broker.js";
import type { Provider } from "../harness/lib/provider.js";
import { interpretWithPhysics } from "../harness/lib/semantic-interpretation.js";
import { ReasonerProvider } from "../harness/providers/reasoner.js";
import { decisionFrom } from "../harness/lib/llm-common.js";
import { resolveUnitRef } from "../slots/physics/units.js";

test("the model chooses Physics lookups and supplies the interpretation, the host supplies no quantity mapping", async () => {
    const sent = { objective: { required_outputs: [{ name: "motorSpeed", quantity: "motor speed", unit: "%" }] }, budget: { iterations: 20 } };
    let turns = 0;
    const calls: string[] = [];
    const broker = {
        tools: async () => [{ name: "units_normalize", description: "Resolve a unit", inputSchema: { type: "object" } }, { name: "forbidden", inputSchema: {} }],
        call: async (slot: string, tool: string, args: { quantity?: string; unit: string }) => {
            calls.push(`${slot}.${tool}`);
            const r = resolveUnitRef(args);
            return r.ok ? { ok: true, outcome: "completed", output: r.unit } : { ok: false, outcome: "refused", error: r.reason };
        },
    } as unknown as Broker;
    const model = {
        model: "fixture-interpreter", exchanges: [], begin() {},
        async resolve(input: PolicyFallbackInput) {
            turns++;
            assert.equal(input.allowedCapabilities.some((c) => c.id === "physics.forbidden"), false);
            if (turns === 1) return decisionFrom("physics__units_normalize", { quantity: "motor speed", unit: "%" }, "", input.allowedCapabilities);
            if (turns === 2) {
                assert.equal(input.state.features.lastOutcome, "refused");
                return decisionFrom("physics__units_normalize", { unit: "%" }, "", input.allowedCapabilities);
            }
            const physical = JSON.parse(String(input.state.features.lastOutput));
            const value = structuredClone(sent);
            value.objective.required_outputs[0].quantity = physical.quantity;
            return decisionFrom("interpret__result", { value, reason: "The named signal remains a relative motor command; only its physical vocabulary changes." }, "", input.allowedCapabilities);
        },
    } as unknown as Provider;
    const result = await interpretWithPhysics(model, broker, { capability: "factory.request", schema: {}, sent }, { allowed: ["physics.units_normalize"], maxCalls: 6 });
    assert.equal(turns, 3);
    assert.deepEqual(calls, ["physics.units_normalize", "physics.units_normalize"]);
    const interpreted = JSON.parse(result.text);
    assert.equal(interpreted.objective.required_outputs[0].quantity, "Dimensionless");
    assert.equal(interpreted.objective.required_outputs[0].name, "motorSpeed");
    assert.deepEqual(interpreted.budget, sent.budget);
    assert.equal(sent.objective.required_outputs[0].quantity, "motor speed");
});

test("valid JSON is routed to the LLM semantic interpreter before the proposed factory request can execute", async () => {
    const cap = { id: "factory.request", description: "Delegate a functional contract", inputSchema: { type: "object", properties: { quantity: { type: "string" }, unit: { type: "string" } }, required: ["quantity", "unit"] } } as CapabilityDescriptor;
    let interpretations = 0;
    const sent = { quantity: "motor speed", unit: "%" };
    const broker = { call: async (slot: string, tool: string, args: Record<string, unknown>) => {
        assert.equal(slot, "reasoner", "the factory is never executed by the interpreter");
        if (tool === "describe") return { ok: true, output: { model: "fixture", family: "fixture", ready: true, interpretation: { beforeExecution: [cap.id] } } };
        if (tool === "interpret") { interpretations++; assert.equal(args.mode, "semantic"); return { ok: true, output: { value: { quantity: "Dimensionless", unit: "%" }, model: "fixture-interpreter" } }; }
        return { ok: true, output: { decision: decisionFrom("factory__request", sent, "", [cap]), proposedCapabilityId: cap.id, proposedInput: sent, model: "fixture", latencyMs: 0, exchange: { request: null, response: null } } };
    } } as unknown as Broker;
    const provider = await ReasonerProvider.connect(broker);
    const result = await provider.resolve({ intention: { id: "case" }, state: { id: "state", features: {} }, allowedCapabilities: [cap], candidates: [], recentFailures: [] } as PolicyFallbackInput);
    assert.equal(interpretations, 1);
    assert.deepEqual(result.invocation.input, { quantity: "Dimensionless", unit: "%" });
    assert.equal(provider.exchanges[0].reading?.how, "semantic");
    assert.deepEqual(provider.exchanges[0].proposedInput, sent, "the original model proposal stays in the audit trace");
});

test("the host does not infer a translation when the model returns null", async () => {
    const broker = { tools: async () => [], call: async () => { throw Error("No model lookup was requested"); } } as unknown as Broker;
    const model = { model: "fixture", exchanges: [], begin() {}, resolve: async (input: PolicyFallbackInput) => decisionFrom("interpret__result", { value: null, reason: "The semantic target is ambiguous" }, "", input.allowedCapabilities) } as unknown as Provider;
    const result = await interpretWithPhysics(model, broker, { capability: "factory.request", schema: {}, sent: { quantity: "unknown" } }, { allowed: [], maxCalls: 2 });
    assert.equal(result.text, "null");
    assert.equal(result.interpretationReason, "The semantic target is ambiguous");
});
