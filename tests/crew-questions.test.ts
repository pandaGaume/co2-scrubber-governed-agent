import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { fromRoot } from "../lib/paths.js";
import type { Broker } from "../harness/lib/broker.js";
import type { ExecutionContext } from "@spiky-panda/harness";
import { buildCapabilities } from "../tier3/lib/capabilities.js";
import { taskCapabilities } from "../harness/core/task-capabilities.js";
import { newProgress } from "../harness/core/workspace-observer.js";

describe("human information requests", () => {
    it("routes scientific factory questions to their declared role", async () => {
        let sent: Record<string, unknown> | undefined;
        const broker = { call: async (_slot: string, _tool: string, args: Record<string, unknown>) => { sent = args; return { ok: true, output: { questionId: "science-1", status: "open" } }; } } as unknown as Broker;
        const progress = newProgress();
        const ask = taskCapabilities(broker, "task", progress, "procedure", undefined, "scientific-officer").find((c) => c.id === "task.ask")!;
        assert.equal((await ask.execute({ question: "Which scientific assumption applies?", options: ["Review evidence", "Defer"] }, {} as ExecutionContext)).ok, true);
        assert.equal(sent?.role, "scientific-officer");
        assert.match(progress.failure!, /scientific-officer/);
        assert.doesNotMatch(progress.failure!, /commander/);
    });
    it("carries the immutable parent objective and acquisition requirements to specialist work", async () => {
        let sent: Record<string, unknown> | undefined;
        const broker = { slots: async () => ["factory"], tools: async () => [{ name: "request", inputSchema: { type: "object" } }], call: async (_slot: string, _tool: string, args: Record<string, unknown>) => { sent = args; return { ok: true, outcome: "completed", output: { taskId: "task" } }; } } as unknown as Broker;
        const parent = { objective: "Operator's request", completion: { procedure: { requiredSpeedsPercent: [30, 40, 100] } } };
        const { registry } = await buildCapabilities(broker, { delegationContext: parent });
        await registry.get("factory.request")!.execute({ observations: { device: "scrubber", missionContext: { objective: "substitute" } } }, {} as ExecutionContext);
        assert.deepEqual((sent?.observations as { missionContext: unknown }).missionContext, parent);
        assert.equal((sent?.observations as { device: string }).device, "scrubber");
    });
    it("does not open parallel conversational approvals or duplicate a pending station question", async () => {
        let sent = 0;
        const broker = { slots: async () => [], tools: async () => [], call: async () => { sent++; return { ok: true }; } } as unknown as Broker;
        const { registry, catalogue } = await buildCapabilities(broker, { stationOwnsConfirmations: true, questionResume: { slot: "agent", tool: "mission_observe", args: { missionId: "test" } } });
        const ask = registry.get("crew.ask")!;
        const context = { state: { features: { stationDecisions: { status: "authorised", questions: [] } } } } as unknown as ExecutionContext;
        const repeated = await ask.execute({ message: "Does Kirk authorise launch?", responseType: "confirmation" }, context);
        assert.equal(repeated.ok, false);
        assert.equal(sent, 0);
        const pending = { state: { features: { stationDecisions: { questions: [{ id: "q1", status: "open" }] } } } } as unknown as ExecutionContext;
        assert.equal((await ask.execute({ message: "Please confirm the existing question?", responseType: "information" }, pending)).ok, false);
        assert.equal(sent, 0);
        assert.equal((await ask.execute({ message: "x".repeat(241) }, context)).ok, false);
        assert.ok(catalogue.find((c) => c.id === "crew.ask"));
    });
    const context = { decisionId: "d", intention: { id: "mission:test", description: "qualify a device" }, state: {} } as unknown as ExecutionContext;
    async function ask(input: Record<string, string>, mission = true) {
        const sent: Array<Record<string, unknown>> = [];
        const broker = { slots: async () => [], tools: async () => [], call: async (_slot: string, _tool: string, args: Record<string, unknown>) => { sent.push(args); return { ok: true, outcome: "completed", output: { questionId: "q1" } }; } } as unknown as Broker;
        const { registry } = await buildCapabilities(broker, mission ? { questionResume: { slot: "agent", tool: "mission_observe", args: { missionId: "test" } } } : {});
        const result = await registry.get("crew.ask")!.execute(input, context);
        assert.equal(result.ok, true);
        return sent[0] as { options: Array<{ id: string }>; context?: { responseType: string }; resume?: { args: { question: { text: string; responseType: string } } } };
    }
    it("requests written information or an explicit unknown and carries the complete question back with the answer", async () => {
        const message = "What values does the library document? ".repeat(4);
        const q = await ask({ message });
        assert.deepEqual(q.options.map((o) => o.id), ["provide", "unknown", "defer"]);
        assert.equal(q.context?.responseType, "information");
        assert.equal(q.resume?.args.question.text, message, "the question is preserved without truncation");
        assert.equal(q.resume?.args.question.responseType, "information");
    });
    it("keeps explicit confirmations and the existing night profile as yes/no questions", async () => {
        const confirmation = await ask({ message: "May I conclude?", responseType: "confirmation" });
        assert.deepEqual(confirmation.options.map((o) => o.id), ["yes", "no"]);
        const night = await ask({ message: "May I conclude?" }, false);
        assert.deepEqual(night.options.map((o) => o.id), ["yes", "no"]);
        assert.equal(night.resume, undefined);
    });
    it("accepts free text for information without treating unrelated text as installation approval", async () => {
        const { answerOptionOf } = await import(pathToFileURL(fromRoot("dashboard", "mother-chat.js")).href);
        const information = { kind: "ask", context: { responseType: "information" }, options: [{ id: "provide", label: "Provide information" }, { id: "unknown", label: "Information unavailable" }, { id: "defer", label: "Defer this question" }] };
        assert.equal(answerOptionOf("The values should be in the library.", information)?.id, "text");
        assert.equal(answerOptionOf("Information unavailable", information)?.id, "text");
        assert.equal(answerOptionOf("", information), null);
        const confirmation = { kind: "ask", options: [{ id: "yes", label: "yes" }, { id: "no", label: "no" }] };
        assert.equal(answerOptionOf("yes, but first explain the validation", confirmation)?.id, "text");
        const installation = { kind: "twin-install", context: { responseType: "information" }, options: [{ id: "install", label: "Authorise installation" }, { id: "refuse", label: "Refuse installation" }] };
        assert.equal(answerOptionOf("The values should be in the library.", installation), null);
        assert.equal(answerOptionOf("do not install", installation), null);
        assert.equal(answerOptionOf("Authorise installation", installation)?.id, "install");
    });
});
