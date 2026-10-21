import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Intention, PolicyDecision } from "@spiky-panda/harness";
import { Mission, type MissionDecision } from "../tier3/mission.js";
import { createAgent, type Agent } from "../tier3/agent.js";
import type { Broker } from "../harness/lib/broker.js";
import type { Provider } from "../harness/lib/provider.js";
import { DecisionInvalidatedError } from "../harness/lib/execution-errors.js";

const decision = (capability: string, reasoned = true, ok = true): MissionDecision => ({ capability, input: { reason: "reasoner's conclusion" }, ok, reasoned });
async function until(test: () => boolean): Promise<void> {
    const end = Date.now() + 2000;
    while (!test()) { if (Date.now() >= end) throw new Error("mission did not reach expected state"); await new Promise((r) => setTimeout(r, 5)); }
}

describe("scenario completion and mission completion", () => {
    it("lets a configured model answer beyond the shorter outer timeout while retaining cancellation", async () => {
        let executed = 0;
        const broker = { slots: async () => [], tools: async () => [], call: async () => ({ ok: true, outcome: "completed", output: { co2Ppm: 1500, co2State: "NOMINAL", power: true, speedPercent: 33 } }) } as unknown as Broker;
        const provider: Provider = {
            name: "slow-fixture", model: "fixture", family: "test", exchanges: [], calls: 0, settings: { timeoutMs: 100 },
            async resolve(): Promise<PolicyDecision> {
                await new Promise((resolve) => setTimeout(resolve, 25));
                return { action: { id: "fixture.review", description: "review" }, invocation: { actionId: "fixture.review", capabilityId: "fixture.review", input: {} } };
            },
        };
        const agent = await createAgent({ broker, provider, timeoutMs: 5, local: [{ id: "fixture.review", description: "review", inputSchema: { type: "object" }, execute: () => { executed++; return { ok: true, output: { outcome: "completed" } }; } }] });
        const trace = await agent.decide({ id: "slow-model", description: "review" });
        assert.equal(trace.result.ok, true);
        assert.equal(executed, 1);
        const controller = new AbortController();
        controller.abort(new Error("operator cancelled"));
        await assert.rejects(agent.decide({ id: "cancelled", description: "review" }, controller.signal), /operator cancelled/);
        assert.equal(executed, 1, "cancellation still prevents dispatch");
    });
    it("an event does not replenish the decision budget; only an explicit operator resume does", async () => {
        let calls = 0;
        const mission = new Mission("budget-events", "goal", {}, async () => {
            calls++;
            return decision(calls <= 2 ? "mission.wait" : "mission.complete");
        }, () => undefined, 2, 0);
        mission.run();
        await until(() => mission.state.status === "waiting");
        mission.observe({ task: "first result" });
        await until(() => mission.state.status === "waiting" && mission.state.decisions === 2);
        mission.observe({ task: "another result" });
        await until(() => mission.state.status === "suspended");
        assert.equal(calls, 2);
        assert.match(mission.state.note!, /budget/);
        mission.resume();
        await until(() => mission.state.status === "completed");
        assert.equal(calls, 3);
    });

    it("a supervisory model retains every delegation decision even after experience could have promoted it", async () => {
        let modelCalls = 0;
        let delegated = 0;
        const broker = { slots: async () => [], tools: async () => [], call: async () => ({ ok: true, outcome: "completed", output: { co2Ppm: 1500, co2State: "NOMINAL", power: true, speedPercent: 33 } }) } as unknown as Broker;
        const provider: Provider = {
            name: "test-reasoner", model: "fixture", family: "test", exchanges: [], get calls() { return modelCalls; },
            async resolve(): Promise<PolicyDecision> {
                modelCalls++;
                const id = modelCalls <= 6 ? "fixture.delegate" : "fixture.review";
                return { action: { id, description: id }, invocation: { actionId: id, capabilityId: id, input: {} } };
            },
        };
        const local = ["delegate", "review"].map((action) => ({ id: `fixture.${action}`, description: action, inputSchema: { type: "object" as const }, execute: () => { if (action === "delegate") delegated++; return { ok: true, output: { outcome: "completed" } }; } }));
        const agent = await createAgent({ broker, provider, local, reasonEveryDecision: true });
        const traces = [];
        for (let i = 0; i < 7; i++) traces.push(await agent.decide({ id: "unchanged-mission", description: "same intention" }));
        assert.equal(modelCalls, 7);
        assert.equal(delegated, 6, "the seventh step obeyed the model's changed decision, never replayed delegation");
        assert.ok(traces.every((t) => t.source === "fallback"));
        assert.ok(agent.policy.snapshot().experiences.length >= 7, "experience remains inspectable");
    });
    it("rejects a stale proposal in the real graph and asks the reasoner again on the changed state", async () => {
        let speed = 33;
        let requests = 0;
        let invalidated = 0;
        let completionsExecuted = 0;
        const broker = { slots: async () => [], tools: async () => [], call: async () => ({ ok: true, outcome: "completed", output: { co2Ppm: 1500, co2State: "NOMINAL", power: true, speedPercent: speed } }) } as unknown as Broker;
        const provider: Provider = {
            name: "test-reasoner", model: "fixture", family: "test", exchanges: [], get calls() { return requests; },
            async resolve(input) {
                requests++;
                const id = requests === 1 ? "mission.complete" : "mission.wait";
                if (requests === 1) speed = 50; // An external change while the model reasons.
                else {
                    assert.equal(input.state.features.speedPercent, 50);
                    assert.match(JSON.stringify(input.state.features.mission), /decision.invalidated/);
                }
                return { action: { id, description: id }, invocation: { actionId: id, capabilityId: id, input: { reason: "model fixture" } } };
            },
        };
        let agent: Agent;
        const mission = new Mission("fresh", "same mission", {}, async (intention) => {
            const trace = await agent.decide(intention);
            return { capability: trace.decision.invocation.capabilityId, input: trace.decision.invocation.input, ok: trace.result.ok, reasoned: trace.source === "fallback" };
        }, () => undefined, 4, 0, () => { invalidated++; });
        const local = mission.capabilities().map((cap) => cap.id !== "mission.complete" ? cap : { ...cap, execute: (...args: Parameters<typeof cap.execute>) => { completionsExecuted++; return cap.execute(...args); } });
        agent = await createAgent({ broker, provider, local, observation: () => ({ mission: JSON.parse(JSON.stringify(mission.state)) }) });
        mission.run();
        await until(() => mission.state.status === "waiting" || mission.state.status === "suspended");
        assert.equal(mission.state.status, "waiting", mission.state.note ?? "");
        assert.equal(requests, 2);
        assert.equal(invalidated, 1);
        assert.equal(completionsExecuted, 0, "the stale completion was never executed or replayed");
        assert.equal(mission.state.objective, "same mission");
    });

    it("bounds repeated invalidations with the existing budget rather than looping indefinitely", async () => {
        let requests = 0;
        const mission = new Mission("unstable", "goal", {}, async () => { requests++; throw new DecisionInvalidatedError(); }, () => undefined, 3, 0);
        mission.run();
        await until(() => mission.state.status === "suspended");
        assert.equal(requests, 3);
        assert.equal(mission.state.decisions, 3);
        assert.match(mission.state.note!, /budget/);
    });
    it("keeps one objective and returns delegated results to the same mission; a report never completes it", async () => {
        const seen: Intention[] = [];
        const actions = ["crew.report", "mission.wait", "mission.complete"];
        const mission = new Mission("m1", "qualify the device", { initial: true }, async (intention) => { seen.push(intention); return decision(actions.shift()!); }, () => undefined, 8, 0);
        mission.run();
        await until(() => mission.state.status === "waiting");
        assert.equal(mission.state.decisions, 2);
        mission.observe({ scenario: "done", task: "proposed" });
        await until(() => mission.state.status === "completed");
        assert.equal(seen.length, 3);
        assert.ok(seen.every((i) => i.id === "mission:m1" && i.description === "qualify the device"));
        assert.equal(mission.state.observations.length, 2);
        assert.throws(() => mission.observe({ another: true }), /completed/);
    });

    it("a result received while deciding to wait is not lost", async () => {
        let count = 0;
        const mission = new Mission("m2", "goal", {}, async () => {
            if (count++ === 0) { mission.observe({ result: "already returned" }); return decision("mission.wait"); }
            return decision("mission.complete");
        }, () => undefined, 4, 0);
        mission.run();
        await until(() => mission.state.status === "completed");
        assert.equal(count, 2);
    });

    it("does not mistake a failed request or replayed completion for the reasoner's completion", async () => {
        const actions = [decision("mission.complete", true, false), decision("mission.complete", false)];
        const mission = new Mission("m3", "goal", {}, async () => actions.shift()!, () => undefined, 4, 0);
        mission.run();
        await until(() => mission.state.status === "suspended");
        assert.match(mission.state.note!, /explicit reasoner/);
        assert.equal(mission.state.decisions, 2);
    });

    it("a budget or an execution failure suspends the mission and retains its objective", async () => {
        const mission = new Mission("m4", "still needed", {}, async () => decision("crew.report"), () => undefined, 2, 0);
        mission.run();
        await until(() => mission.state.status === "suspended");
        assert.match(mission.state.note!, /budget.*remains open/);
        assert.equal(mission.state.objective, "still needed");
        const broken = new Mission("m5", "goal", {}, async () => { throw new Error("provider unavailable"); }, () => undefined, 2, 0);
        broken.run();
        await until(() => broken.state.status === "suspended");
        assert.match(broken.state.note!, /provider unavailable/);
    });

    it("a task result cannot answer the human's question", async () => {
        const actions = ["crew.ask", "mission.complete"];
        const mission = new Mission("m6", "goal", {}, async () => decision(actions.shift()!), () => undefined, 4, 0);
        mission.run();
        await until(() => mission.state.waitingFor === "human");
        mission.observe({ task: "done" });
        assert.equal(mission.state.status, "waiting");
        mission.observe({ answer: "no" }, true);
        await until(() => mission.state.status === "completed");
    });

    it("a delegated result arriving during a human question does not bypass the answer", async () => {
        let count = 0;
        const mission = new Mission("human-race", "goal", {}, async () => {
            if (count++ === 0) { mission.observe({ task: "returned during the question" }); return decision("crew.ask"); }
            return decision("mission.complete");
        }, () => undefined, 4, 0);
        mission.run();
        await until(() => mission.state.waitingFor === "human");
        assert.equal(count, 1);
        mission.observe({ answer: "no" }, true);
        await until(() => mission.state.status === "completed");
    });

    it("runs report and completion through the existing twelve-stage decision graph", async () => {
        const broker = {
            slots: async () => [], tools: async () => [],
            call: async () => ({ ok: true, outcome: "completed", output: { co2Ppm: 1500, co2State: "NOMINAL", power: true, speedPercent: 33 } }),
        } as unknown as Broker;
        const actions = ["crew.report", "mission.complete"];
        let requests = 0;
        const provider: Provider = {
            name: "test-reasoner", model: "fixture", family: "test", exchanges: [], get calls() { return requests; },
            async resolve(): Promise<PolicyDecision> {
                requests++;
                const id = actions.shift()!;
                return { action: { id, description: id }, invocation: { actionId: id, capabilityId: id, input: id === "crew.report" ? { message: "The delegated scenario is done; I am reviewing its result." } : { reason: "Review finished; required capability is unavailable, reported as unfulfilled." } } };
            },
        };
        let agent: Agent;
        const stages = new Set<string>();
        const mission = new Mission("graph", "review returned work", { scenario: "done" }, async (intention) => {
            const trace = await agent.decide(intention);
            return { capability: trace.decision.invocation.capabilityId, input: trace.decision.invocation.input, ok: trace.result.ok, reasoned: trace.source === "fallback" };
        }, () => undefined, 4, 0);
        agent = await createAgent({ broker, provider, local: mission.capabilities(), observation: () => ({ mission: JSON.parse(JSON.stringify(mission.state)) }), onStage: (event) => { stages.add(event.stage); } });
        mission.run();
        await until(() => mission.state.status === "completed" || mission.state.status === "suspended");
        assert.equal(mission.state.status, "completed", mission.state.note ?? "");
        assert.equal(requests, 2);
        assert.deepEqual(agent.calls.map((c) => c.id), ["crew.report", "mission.complete"]);
        assert.equal(agent.console.length, 1);
        assert.ok(stages.size > 0, "the graph's stages executed");
    });
});
