import { test } from "node:test";
import assert from "node:assert/strict";
import type { CapabilityDescriptor, PolicyFallbackInput, PolicyDecision } from "@spiky-panda/harness";
import type { Provider } from "../harness/lib/provider.js";
import { ContextPages, FOCUSED_SYSTEM_PROMPT, FocusedContextProvider } from "../harness/lib/focused-context.js";
import { OpenAiCompatibleProvider } from "../harness/providers/openai-compatible.js";
import { decisionFrom, toApiName } from "../harness/lib/llm-common.js";

test("paged context preserves exact source text and its last page without mutating inputs", () => {
    const pages = new ContextPages();
    const text = "Signed source: 30 percent minimum.\n".repeat(300) + "FINAL CONDITION";
    const source = { phase: "method", document: text };
    const view = pages.project(source) as typeof source & { document: { contextRef: string } };
    assert.ok(JSON.stringify(view).length < 1000);
    let result = "";
    let offset: number | null = 0;
    while (offset !== null) {
        const page = pages.read(view.document.contextRef, offset) as { text: string; nextOffset: number | null };
        result += page.text; offset = page.nextOffset;
    }
    assert.equal(result, text);
    assert.equal(source.document, text);
    assert.match(JSON.stringify(pages.read("missing")), /Unknown context reference/);
});

test("large nested observations keep the decision envelope visible instead of hiding the entire state", () => {
    const pages = new ContextPages();
    const source = { state: { phase: "procedure", lastRefusal: { reason: "Human approval missing" }, readDocuments: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`doc${i}`, { title: `Source ${i}`, text: "Source text ".repeat(1000) }])) } };
    const view = pages.project(source) as any;
    assert.equal(view.state.phase, "procedure");
    assert.equal(view.state.lastRefusal.reason, "Human approval missing");
    assert.equal(view.state.contextRef, undefined);
    assert.equal(view.state.readDocuments.contextRef, undefined);
    assert.equal(view.state.readDocuments.doc0.title, "Source 0");
    assert.equal(view.state.readDocuments.doc0.text.contextRef, "input/state/readDocuments/doc0/text");
});

test("model chooses source reads and tool schemas before its business action, with small independent inputs", async () => {
    const allowed = Array.from({ length: 20 }, (_, i) => ({ id: `service.tool${i}`, description: `Capability ${i}`, inputSchema: { type: "object", properties: { payload: { type: "string", description: "schema detail ".repeat(1000) } } } })) as CapabilityDescriptor[];
    const input = { intention: { id: "mission", description: "Read the source and choose an action" }, state: { id: "s1", features: { document: "Authoritative material ".repeat(6000), authority: "Human approval required" } }, allowedCapabilities: allowed, candidates: [], recentFailures: [] } as unknown as PolicyFallbackInput;
    const before = JSON.stringify(input);
    const received: PolicyFallbackInput[] = [];
    const inner = {
        name: "fixture", model: "nemotron-fixture", family: "nemotron", exchanges: [], calls: 0,
        async resolve(step: PolicyFallbackInput): Promise<PolicyDecision> {
            received.push(step);
            const state = step.state.features.state as Record<string, any>;
            if (received.length === 1) return decisionFrom("context__read", { ref: state.current.document.contextRef, notes: "Need source evidence" }, "", step.allowedCapabilities);
            if (received.length === 2) {
                assert.match(state.contextAnswer.text, /Authoritative material/);
                return decisionFrom("context__tools", { ids: [toApiName(allowed[7].id)], notes: "Source page read; human approval still required" }, "", step.allowedCapabilities);
            }
            assert.equal(step.allowedCapabilities.filter((c) => c.id.startsWith("service.")).length, 1);
            assert.match(state.workingNotes, /human approval/);
            assert.equal(state.readHistory.length, 1);
            return decisionFrom(toApiName(allowed[7].id), { payload: "chosen by model fixture" }, "", step.allowedCapabilities);
        },
    } as unknown as Provider;
    const result = await new FocusedContextProvider(inner, "Original role instructions ".repeat(500)).resolve(input);
    assert.equal(result.invocation.capabilityId, allowed[7].id);
    assert.equal(received.length, 3);
    assert.ok(received.every((r) => JSON.stringify(r.state.features).length < 10000));
    assert.ok(JSON.stringify(received[0]).length < before.length / 10);
    assert.equal(JSON.stringify(input), before);
});

test("actual chat adapter sends separate short requests and traces the final action with total usage", async () => {
    const originalFetch = globalThis.fetch;
    const oldKey = process.env.FOCUSED_CONTEXT_TEST_KEY;
    process.env.FOCUSED_CONTEXT_TEST_KEY = "local-fixture";
    const requests: any[] = [];
    const allowed = Array.from({ length: 8 }, (_, i) => ({ id: `service.tool${i}`, description: `Tool ${i}`, inputSchema: { type: "object", properties: {} } })) as CapabilityDescriptor[];
    const goal = "Inspect the source and retain this original objective. ".repeat(60);
    const input = { intention: { id: "m", description: goal }, state: { id: "s", features: { mission: { objective: goal }, source: "Evidence ".repeat(15000) } }, allowedCapabilities: allowed, candidates: [], recentFailures: [] } as unknown as PolicyFallbackInput;
    globalThis.fetch = async (_url, init) => {
        const request = JSON.parse(String(init?.body));
        requests.push(request);
        const observation = JSON.parse(request.messages.at(-1).content.split("\n")[2]);
        assert.match(observation.current.mission.objective, /Identical to the initial objective/, "the already visible goal must not become a distracting optional page reference");
        const name = requests.length === 1 ? "context__read" : requests.length === 2 ? "context__tools" : "service__tool3";
        const args = requests.length === 1 ? { ref: observation.current.source.contextRef, _mother: "" } : requests.length === 2 ? { ids: ["service.tool3"], notes: "Evidence read", _mother: "" } : { _mother: "" };
        return new Response(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ id: `c${requests.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } }), { status: 200 });
    };
    try {
        const inner = new OpenAiCompatibleProvider({ tier3: { model: "nvidia/nemotron-fixture", baseUrl: "http://local-fixture.invalid", apiKey: { env: "FOCUSED_CONTEXT_TEST_KEY" } } }, { systemPrompt: FOCUSED_SYSTEM_PROMPT, contextMode: "state", stateToolResults: true });
        const provider = new FocusedContextProvider(inner, "Detailed role source ".repeat(1000));
        const decision = await provider.resolve(input);
        assert.equal(decision.invocation.capabilityId, "service.tool3");
        assert.equal(requests.length, 3);
        assert.ok(requests.every((r) => JSON.stringify(r).length < 15000));
        assert.ok(requests.every((r) => r.messages.length <= 5 && r.parallel_tool_calls === false), "each HTTP request keeps at most the latest call and asks for one call");
        assert.equal(requests[1].messages[2].role, "assistant");
        assert.equal(requests[1].messages[3].role, "tool");
        assert.equal(requests[1].messages[2].tool_calls[0].id, requests[1].messages[3].tool_call_id);
        assert.ok(requests.every((r) => r.messages.some((m: any) => m.content.includes(goal))), "the current objective must never require an extra page read");
        assert.equal(provider.exchanges.length, 1);
        assert.equal(provider.exchanges[0].proposedCapabilityId, "service.tool3");
        assert.equal(provider.exchanges[0].tokens?.total, 330);
        assert.equal((provider.exchanges[0].request as any).contextReads.length, 2);
        await provider.resolve({ ...input, state: { ...input.state, features: { ...input.state.features, lastCapability: "service.tool3", lastOutcome: "refused", lastOutput: "Real guard refusal: required approval is absent" } } });
        const next = requests[3];
        const returned = next.messages.find((m: any) => m.role === "tool");
        assert.match(returned.content, /refused: Real guard refusal/);
        assert.equal(returned.tool_call_id, "c3", "the prior business call, not just internal context reads, gets its actual result");
        assert.equal(next.messages.filter((m: any) => m.role === "assistant").length, 1);
    } finally {
        globalThis.fetch = originalFetch;
        if (oldKey === undefined) delete process.env.FOCUSED_CONTEXT_TEST_KEY;
        else process.env.FOCUSED_CONTEXT_TEST_KEY = oldKey;
    }
});

test("tools the harness opens at a new stage are offered, not hidden behind the previous stage's selection", async () => {
    // t-2026-10-21-0022: the stage moved to the method and opened library.methods, but the request still offered the
    // inventory the model had loaded before; it could only repeat it, and the task ended STUCK.
    const tool = (id: string) => ({ id, description: id, inputSchema: { type: "object", properties: {} } }) as CapabilityDescriptor;
    const stage1 = ["factory.inventory", "biomed.describe", "biomed.presence", "library.justify", "library.search", "library.facts", "library.read", "physics.units_convert", "task.ask", "task.fail"].map(tool);
    const stage2 = [...stage1, tool("library.methods")];
    const offered: string[][] = [];
    const inner = {
        name: "fixture", model: "nemotron-fixture", family: "nemotron", exchanges: [], calls: 0,
        async resolve(step: PolicyFallbackInput): Promise<PolicyDecision> {
            const ids = step.allowedCapabilities.map((c) => c.id);
            offered.push(ids);
            if (offered.length === 1) return decisionFrom("context__tools", { ids: ["factory.inventory", "biomed.presence", "biomed.describe"] }, "", step.allowedCapabilities);
            if (offered.length === 2) return decisionFrom("factory__inventory", {}, "", step.allowedCapabilities);
            return decisionFrom("library__methods", { quantity: "Ratio" }, "", step.allowedCapabilities);
        },
    } as unknown as Provider;
    const provider = new FocusedContextProvider(inner);
    provider.begin("task");
    const state = (lastCapability: string) => ({ id: "s", features: { lastCapability, lastOutcome: "completed" } });
    const first = await provider.resolve({ intention: { id: "t", description: "Write the test procedure" }, state: state(""), allowedCapabilities: stage1, candidates: [], recentFailures: [] } as unknown as PolicyFallbackInput);
    assert.equal(first.invocation.capabilityId, "factory.inventory");
    const second = await provider.resolve({ intention: { id: "t", description: "Write the test procedure" }, state: state("factory.inventory"), allowedCapabilities: stage2, candidates: [], recentFailures: [] } as unknown as PolicyFallbackInput);
    assert.ok(offered[2].includes("library.methods"), `the newly opened tool is offered: ${offered[2].join(", ")}`);
    assert.ok(offered[2].filter((id) => !id.startsWith("context.")).length <= 4, "the request stays focused");
    assert.equal(second.invocation.capabilityId, "library.methods");
    assert.equal(offered.length, 3, "no context read was spent to reach the opened tool");
    // A new task starts from nothing carried over.
    provider.begin("next task");
    offered.length = 0;
    await provider.resolve({ intention: { id: "t", description: "Write the test procedure" }, state: state(""), allowedCapabilities: stage2, candidates: [], recentFailures: [] } as unknown as PolicyFallbackInput);
    assert.deepEqual(offered[0].filter((id) => !id.startsWith("context.")), []);
});

test("spent context reads end in a business decision the loop can judge, not in an error that suspends the mission", async () => {
    // t-2026-10-21-0001: the model re-read the same pages until the twelfth read, the provider threw, and the error came
    // back as "device refused" and suspended the supervisor's mission.
    const allowed = ["factory.inventory", "library.read", "task.ask", "task.fail", "library.methods", "library.facts"].map((id) => ({ id, description: id, inputSchema: { type: "object", properties: {} } })) as CapabilityDescriptor[];
    const input = { intention: { id: "t", description: "Write the test procedure" }, state: { id: "s", features: { method: "Method card text. ".repeat(500) } }, allowedCapabilities: allowed, candidates: [], recentFailures: [] } as unknown as PolicyFallbackInput;
    const received: PolicyFallbackInput[] = [];
    const inner = {
        name: "fixture", model: "nemotron-fixture", family: "nemotron", exchanges: [], calls: 0,
        async resolve(step: PolicyFallbackInput): Promise<PolicyDecision> {
            received.push(step);
            if (step.allowedCapabilities.some((c) => c.id === "context.read")) {
                const ref = ((step.state.features.state as Record<string, any>).current.method as { contextRef: string }).contextRef;
                return decisionFrom("context__read", { ref, offset: 0 }, "", step.allowedCapabilities);
            }
            return decisionFrom("task__ask", { question: "Which method card applies?" }, "", step.allowedCapabilities);
        },
    } as unknown as Provider;
    const provider = new FocusedContextProvider(inner);
    const decision = await provider.resolve(input);
    assert.equal(decision.invocation.capabilityId, "task.ask");
    assert.equal(received.length, 13, "twelve reads, then one call with business actions only");
    const last = received.at(-1)!;
    assert.ok(!last.allowedCapabilities.some((c) => c.id.startsWith("context.")));
    assert.deepEqual(last.allowedCapabilities.map((c) => c.id), allowed.map((c) => c.id), "with nothing selected, every allowed action is offered");
    assert.match(String(last.state.features.brief), /context reads of this decision are spent/);
    assert.equal(((last.state.features.state as Record<string, any>).readHistory as unknown[]).length, 12);
});
