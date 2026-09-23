/**
 * The constructor's guard (node 8 of docs/harness-stages.fr.md): what the
 * loop refuses itself before any tool runs. Three rules, in this order:
 *
 *   1. the capability is one of the topic's tools;
 *   2. every path-like input (`path`, `file`, `name`, `contractPath`) stays in
 *      the workshop: no `..` segment, no absolute path (the workspace slot
 *      refuses them too; refusing here keeps the attempt out of the broker's
 *      log and gives the model the reason at once);
 *   3. a `task.plan` is conformant: every selected node exists in the
 *      catalogue (`registry_describe_node` on the runtime's slot), every
 *      required output of the task is produced by a selected node (its
 *      signature: same quantity, same unit when the task gives one) or is
 *      declared in `missing_capabilities`, every missing capability has a
 *      reason and a known topic.
 *
 * Then the topic's own rules, when it has some (`TopicDefinition.guard`:
 * the procedure topic checks a submitted procedure against its envelope
 * there, before the procedure is written anywhere).
 *
 * A refusal stops the step with its reason; the runner records it and the
 * observer shows it to the model at the next step (`lastRefusal`). Budgets
 * are not here: the runner counts.
 */
import type { DecisionContext, JsonValue, PolicyDecision, SafetyDecision, SafetyGuard } from "@spiky-panda/harness";
import type { Broker } from "../lib/broker.js";
import { TOPICS, type TaskFile } from "./task.js";
import type { TopicDefinition } from "./topic.js";
import type { Plan, Progress } from "./workspace-observer.js";

const PATH_KEYS = new Set(["path", "file", "name", "contractPath"]);

/** The first path-like value that leaves the workshop, or null. */
export function pathProblem(input: JsonValue, key = ""): string | null {
    if (typeof input === "string") {
        if (!PATH_KEYS.has(key)) return null;
        if (/^([a-zA-Z]:)?[\\/]/.test(input)) return `${key} "${input}" is an absolute path; every path is relative to the task`;
        if (input.split(/[\\/]/).includes("..")) return `${key} "${input}" leaves the task`;
        return null;
    }
    if (Array.isArray(input)) {
        for (const item of input) {
            const p = pathProblem(item, key);
            if (p) return p;
        }
        return null;
    }
    if (input && typeof input === "object") {
        for (const [k, v] of Object.entries(input)) {
            const p = pathProblem(v, k);
            if (p) return p;
        }
    }
    return null;
}

interface DescribedNode {
    type: string;
    signature: { outputs?: Record<string, { quantity?: string; unit?: string }> } | null;
}

export interface BuilderGuardOptions {
    broker: Broker;
    task: TaskFile["task"];
    topic: TopicDefinition;
    /** The slot that publishes the runtime's catalogue (`twin` in the habitat, the container's own slot remotely). */
    runtimeSlot?: string;
    /** The task's id and progress, for a topic's own rules; without them the topic's guard is not asked. */
    taskId?: string;
    progress?: Progress;
}

/** The problems of a plan against the catalogue and the task's required outputs; empty when conformant. */
export async function planProblems(plan: Plan, { broker, task, runtimeSlot = "twin" }: BuilderGuardOptions): Promise<string[]> {
    const problems: string[] = [];
    if (!plan.selected_nodes.length && !plan.missing_capabilities.length) problems.push("a plan names at least one node or one missing capability");
    const described: DescribedNode[] = [];
    for (const type of plan.selected_nodes) {
        const r = await broker.call(runtimeSlot, "registry_describe_node", { type });
        if (!r.ok) problems.push(`selected node "${type}" is not in the catalogue`);
        else described.push(r.output as DescribedNode);
    }
    for (const m of plan.missing_capabilities) {
        if (!m.reason?.trim()) problems.push(`missing capability "${m.required_output}" has no reason`);
        if (!(TOPICS as ReadonlyArray<string>).includes(m.topic)) problems.push(`missing capability "${m.required_output}" names an unknown topic "${m.topic}" (${TOPICS.join(", ")})`);
    }
    for (const required of task.objective.required_outputs) {
        const produced = described.some((n) => Object.values(n.signature?.outputs ?? {}).some((o) => o.quantity === required.quantity && (!required.unit || o.unit === required.unit)));
        const declared = plan.missing_capabilities.some((m) => m.required_output === required.name);
        if (!produced && !declared) problems.push(`required output "${required.name}" (${required.quantity}${required.unit ? `, ${required.unit}` : ""}) is neither produced by a selected node nor declared missing`);
    }
    return problems;
}

export function createBuilderGuard(options: BuilderGuardOptions): SafetyGuard {
    return {
        async validate(decision: PolicyDecision, _context: DecisionContext): Promise<SafetyDecision> {
            const id = decision.invocation.capabilityId;
            if (!options.topic.tools.some((r) => r.test(id))) return { allowed: false, reason: `${id} is not a tool of topic ${options.topic.name}` };
            const p = pathProblem(decision.invocation.input);
            if (p) return { allowed: false, reason: p };
            if (id === "task.plan") {
                const problems = await planProblems(decision.invocation.input as unknown as Plan, options);
                if (problems.length) return { allowed: false, reason: `plan refused: ${problems.join("; ")}` };
            }
            const { topic, progress, taskId } = options;
            if (topic.guard && progress && taskId) {
                const problems = await topic.guard(id, decision.invocation.input, { broker: options.broker, taskId, task: options.task, progress });
                if (problems.length) return { allowed: false, reason: problems.join("; ") };
            }
            return { allowed: true };
        },
    };
}
