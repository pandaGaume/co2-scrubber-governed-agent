/**
 * The three capabilities of the constructor that run in process
 * (docs/harness-stages.fr.md, section 3): `task.plan`, the first thing the
 * model produces, checked by the guard before anything is built, written as
 * `plan.json` in the workshop, after which the phase is `build`;
 * `task.done`, the model's claim that the contract is held, written as
 * `done.json` and judged by the evaluator (the topic's validator); and
 * `task.fail`, the model giving up with its reason (a fit that cannot be
 * made, data that is not there), written as `failed.json`, which ends the
 * task at once instead of spending the budget on the same failure. All
 * write through the workspace slot, like every other file of the task.
 */
import type { CapabilityResult, JsonValue } from "@spiky-panda/harness";
import type { Broker } from "../lib/broker.js";
import type { LocalCapability } from "./capabilities.js";
import type { DoneClaim, Plan, Progress } from "./workspace-observer.js";

const MISSING_SCHEMA = {
    type: "object",
    properties: {
        required_output: { type: "string" },
        quantity: { type: "string" },
        unit: { type: "string" },
        reason: { type: "string" },
        topic: { type: "string" },
        contract: {
            type: "object",
            description: 'For topic "code": the capability contract the generated node must satisfy, judged by code and run by the forge on whatever is written. inputs and outputs by port name ({quantity, unit, range: [min, max], unwired: the value the node takes when nothing is wired, sign}), parameters by name ({quantity, unit, editable: true, value: the value the acceptance runs set}), behaviors: lines "output(<input>=<number>, ...) == <formula over the parameters>" or "output(unwired) == <formula>" (a named output: "<output>(...)"; comparisons ==, ~=, <, >, <=, >=).',
            properties: {
                type: { type: "string" },
                inputs: { type: "object", additionalProperties: { type: "object", properties: { quantity: { type: "string" }, unit: { type: "string" }, range: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }, unwired: { type: "number" }, sign: { type: "string", enum: ["negative", "positive", "nonnegative", "nonpositive"] } }, required: ["quantity"] } },
                outputs: { type: "object", additionalProperties: { type: "object", properties: { quantity: { type: "string" }, unit: { type: "string" }, range: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }, sign: { type: "string", enum: ["negative", "positive", "nonnegative", "nonpositive"] } }, required: ["quantity"] } },
                parameters: { type: "object", additionalProperties: { type: "object", properties: { quantity: { type: "string" }, unit: { type: "string" }, editable: { type: "boolean" }, value: { type: "number" } } } },
                behaviors: { type: "array", items: { type: "string" }, minItems: 1 },
            },
            required: ["inputs", "outputs", "parameters", "behaviors"],
        },
    },
    required: ["required_output", "quantity", "reason", "topic"],
    additionalProperties: false,
};

export const PLAN_SCHEMA: JsonValue = {
    type: "object",
    properties: {
        selected_nodes: { type: "array", items: { type: "string" }, description: "Node types of the catalogue the build will use (registry_search, registry_describe_node)." },
        missing_capabilities: { type: "array", items: MISSING_SCHEMA, description: "Required outputs no node of the catalogue produces, each with the reason and the topic that can make it." },
    },
    required: ["selected_nodes", "missing_capabilities"],
    additionalProperties: false,
};

export const FAIL_SCHEMA: JsonValue = {
    type: "object",
    properties: { reason: { type: "string", minLength: 1, description: "Why the work cannot be done with what the task holds, as the tools said it." } },
    required: ["reason"],
    additionalProperties: false,
};

export const DONE_SCHEMA: JsonValue = {
    type: "object",
    properties: {
        summary: { type: "string", minLength: 1, description: "What was built and what shows the contract is held, with the numbers read from the tools' answers." },
        artifacts: { type: "array", minItems: 1, items: { type: "object", properties: { kind: { type: "string", enum: ["graph", "model", "twin", "procedure", "plugin"] }, path: { type: "string" } }, required: ["kind", "path"], additionalProperties: false } },
    },
    required: ["summary", "artifacts"],
    additionalProperties: false,
};

async function writeJson(broker: Broker, taskId: string, path: string, value: unknown): Promise<CapabilityResult> {
    const r = await broker.call("workspace", "write", { taskId, path, text: JSON.stringify(value, null, 2) + "\n" });
    if (!r.ok) return { ok: false, error: r.error ?? `could not write ${path}`, output: { outcome: r.outcome } };
    return { ok: true, output: { outcome: "completed", value: r.output as JsonValue } };
}

export const ASK_SCHEMA: JsonValue = {
    type: "object",
    properties: {
        question: { type: "string", minLength: 1, description: "The question, as the commander will read it: what is at stake and what each option means." },
        options: { type: "array", items: { type: "string" }, minItems: 2, description: "The options, short words the commander picks among (two at least)." },
        why: { type: "string", description: "Why the task cannot decide alone: what the tools said, what is missing." },
    },
    required: ["question", "options"],
    additionalProperties: false,
};

export function taskCapabilities(broker: Broker, taskId: string, progress: Progress, topic = "task"): LocalCapability[] {
    return [
        {
            // A question to the commander (Tier 4, 2026-09-26): the task waits for the answer, unless a standing order answers it at once; the answer comes back into the task's observations (answers) and the loop goes on from there.
            id: "task.ask",
            description: "Ask the commander before going on, when the task holds a decision that is not yours: the question, its options (short words), why. If a standing order answers at once, the answer is returned here and the work goes on; otherwise the task waits for the commander and resumes with the answer in its observations (answers), so ask only what changes what you will do.",
            inputSchema: ASK_SCHEMA,
            async execute(input: JsonValue): Promise<CapabilityResult> {
                const q = input as { question: string; options: string[]; why?: string };
                const r = await broker.call("station", "ask", {
                    taskId,
                    from: `factory:${topic}`,
                    kind: "ask",
                    question: q.question,
                    options: q.options.map((o) => ({ id: String(o), label: String(o) })),
                    context: { why: q.why ?? null, topic },
                    resume: { slot: "factory", tool: "resume", args: { taskId, step: "answer" } },
                });
                if (!r.ok) return { ok: false, error: r.error ?? "the station did not take the question", output: { outcome: r.outcome } };
                const asked = r.output as { questionId: string; status: string; answer?: { choice: string; by: string; note: string | null } | null };
                if (asked.status === "auto" && asked.answer) return { ok: true, output: { outcome: "completed", value: { questionId: asked.questionId, answered: true, choice: asked.answer.choice, by: asked.answer.by, note: asked.answer.note } } };
                progress.failure = `WAITING: question ${asked.questionId} for the commander: ${q.question}`;
                progress.phase = "waiting";
                return { ok: true, output: { outcome: "completed", value: { questionId: asked.questionId, answered: false, waiting: true } } };
            },
        },
        {
            id: "task.plan",
            description: "Submit the plan before building anything: the node types selected from the catalogue, and the required outputs no node produces (each with a reason and the topic that can make it). A plan the guard refuses comes back with its problems.",
            inputSchema: PLAN_SCHEMA,
            async execute(input: JsonValue): Promise<CapabilityResult> {
                const plan = input as unknown as Plan;
                const r = await writeJson(broker, taskId, "plan.json", plan);
                if (!r.ok) return r;
                progress.plan = plan;
                progress.phase = "build";
                return { ok: true, output: { outcome: "completed", value: { accepted: true, selected: plan.selected_nodes.length, missing: plan.missing_capabilities.length } } };
            },
        },
        {
            id: "task.done",
            description: "Say the contract is held: a summary with the numbers, and the artifacts (a model, a graph, a twin) by their paths in the workshop. The validator of the topic judges it; when it is not held, the problems come back and the work goes on.",
            inputSchema: DONE_SCHEMA,
            async execute(input: JsonValue): Promise<CapabilityResult> {
                const claim = input as unknown as DoneClaim;
                const r = await writeJson(broker, taskId, "done.json", claim);
                if (!r.ok) return r;
                progress.done = claim;
                return { ok: true, output: { outcome: "completed", value: { claimed: claim.artifacts.length } } };
            },
        },
        {
            id: "task.fail",
            description: "Give up, with the reason the tools gave: the task ends as failed at once, nothing is proposed. Use it when a step cannot succeed with what the task holds, instead of trying the same call again.",
            inputSchema: FAIL_SCHEMA,
            async execute(input: JsonValue): Promise<CapabilityResult> {
                const reason = String((input as { reason?: unknown })?.reason ?? "");
                const r = await writeJson(broker, taskId, "failed.json", { reason });
                if (!r.ok) return r;
                progress.failure = reason;
                progress.phase = "failed";
                return { ok: true, output: { outcome: "completed", value: { failed: true, reason } } };
            },
        },
    ];
}
