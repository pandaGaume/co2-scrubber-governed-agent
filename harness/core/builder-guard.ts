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
import { contractProblems } from "../../slots/forge/contract.js";
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
    const names = task.objective.required_outputs.map((o) => o.name);
    // The generated types a replayed request carries (the hand-off named them in its observations): what was made for a missing output is selected, not declared missing again (the ninth passage declared it missing twice, with a new contract each time).
    const generated = (Array.isArray((task.observations as { generated?: unknown } | undefined)?.generated) ? ((task.observations as { generated: Array<{ type?: unknown }> }).generated ?? []) : []).map((g) => String(g?.type ?? "")).filter(Boolean);
    for (const m of plan.missing_capabilities) {
        for (const type of generated) {
            if (plan.selected_nodes.includes(type)) continue;
            const r = await broker.call(runtimeSlot, "registry_describe_node", { type });
            const outputs = r.ok ? Object.entries(((r.output as DescribedNode).signature?.outputs ?? {}) as Record<string, { quantity?: string; unit?: string }>) : [];
            const port = outputs.find(([, o]) => o.quantity === m.quantity && (!m.unit || !o.unit || o.unit === m.unit));
            if (port) problems.push(`missing capability "${m.required_output}" is what the generated type "${type}" was made for (its output "${port[0]}" is a ${port[1].quantity}${port[1].unit ? ` in ${port[1].unit}` : ""}): select "${type}" in selected_nodes and wire it into the candidate; it is not missing`);
        }
        if (!m.reason?.trim()) problems.push(`missing capability "${m.required_output}" has no reason`);
        if (!(TOPICS as ReadonlyArray<string>).includes(m.topic)) problems.push(`missing capability "${m.required_output}" names an unknown topic "${m.topic}" (${TOPICS.join(", ")})`);
        // The code factory takes a capability only with its contract: what the node must satisfy, written here by the factory that found the gap, judged by code, run by the forge on whatever the code factory writes.
        // A code task's own plan declares the capability it is making without repeating the contract: the task carries it (requirements.capability).
        const ownContract = Boolean((task.requirements as { capability?: unknown } | undefined)?.capability);
        if (m.topic === "code" && !ownContract) {
            if (!m.contract || typeof m.contract !== "object") problems.push(`missing capability "${m.required_output}" is for the code factory and carries no contract: write contract {inputs, outputs, parameters, behaviors} (the schema of task.plan says its shape); the forge runs it on the generated node`);
            else for (const p of contractProblems(m.contract)) problems.push(`missing capability "${m.required_output}", contract: ${p}`);
            const outputs = Object.values((m.contract as { outputs?: Record<string, { quantity?: string; unit?: string }> } | undefined)?.outputs ?? {});
            if (outputs.length && !outputs.some((o) => o.quantity === m.quantity)) problems.push(`missing capability "${m.required_output}", contract: no output carries the required quantity ${m.quantity}`);
        }
        // A required output is named by its name alone, exactly: "V_lab", never "V_lab (Volume, m3)".
        if (!names.includes(m.required_output)) problems.push(`missing capability "${m.required_output}" is not the name of a required output: write required_output exactly as the objective names it, ${names.map((n) => `"${n}"`).join(" or ")}, nothing added`);
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
            // The same call as the step before, with the same input, which completed: its answer is already in the state; asking again gives the same answer.
            const last = options.progress?.lastCall;
            // The executed call carries what the profile bound (the task's id, the sandbox's name): compared without them.
            const unbound = (v: unknown): unknown => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => k !== "taskId")) : v);
            // Compared as canonical JSON, the keys sorted at every level: the same call with its keys in another order is the same call (the third passage of the code topic built the same document four times, {spec, name} then {name, spec}).
            const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : x));
            if (last && last.id === id && !/^task\./.test(id) && canonical(unbound(last.input ?? null)) === canonical(unbound(decision.invocation.input ?? null))) {
                if (last.result.ok) return { allowed: false, reason: `${id} with the same input was the previous step, and completed: its answer is in the state (lastAction, and evidence for a read); calling it again gives the same answer. Decide from what the state holds, or call something else.` };
                // A failed call repeated as it was fails as it did (2026-09-26, the first passage of the code topic: the same plugin_build refused seventeen times): its error is in the state; what it names is what changes.
                return { allowed: false, reason: `${id} with the same input was the previous step, and failed: ${String(last.result.error ?? last.result.outcome).slice(0, 300)}. The same call fails the same way: change what the error names, or call something else.` };
            }
            if (id === "task.plan") {
                const problems = await planProblems(decision.invocation.input as unknown as Plan, options);
                if (problems.length) return { allowed: false, reason: `plan refused: ${problems.join("; ")}` };
            }
            const { topic, progress, taskId } = options;
            if (topic.guard && progress && taskId) {
                const problems = await topic.guard(id, decision.invocation.input, { broker: options.broker, taskId, task: options.task, progress, runtimeSlot: options.runtimeSlot ?? "twin" });
                if (problems.length) return { allowed: false, reason: problems.join("; ") };
            }
            return { allowed: true };
        },
    };
}
