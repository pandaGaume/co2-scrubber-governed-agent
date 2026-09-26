/**
 * The hand-off between the graph factory and the code factory
 * (docs/observateur-et-usines.fr.md, sections 6 and 6.5): a graph task whose
 * plan declares a required output no node of the catalogue produces, with
 * the topic `code` and a capability contract, opens a code task on that
 * contract; when the code task ends proposed (the plugin accepted by the
 * forge against the contract, loaded in the forge's catalogue), the same
 * graph request is replayed on the forge's catalogue, the generated types
 * named in its observations. The graph factory never learns the code; the
 * code factory never sees the graph.
 *
 * The contract is written by the graph factory's model when it declares
 * the capability missing: another role than the one that will write the
 * code, so the model that codes never defines its own acceptance. Its
 * shape is judged by code before the plan is accepted (`builder-guard.ts`).
 *
 * Pure functions: what to ask of the factory, from what a task holds. The
 * factory slot does the asking (`provider.ts`, `launch`).
 */
import type { CapabilityContract } from "../forge/contract.js";
import type { MissingCapability, Plan } from "../../harness/core/workspace-observer.js";
import type { TaskFile } from "../../harness/core/task.js";

/** How many hand-offs a request may go through: a replay that still misses something opens one more code task, and no more. */
export const MAX_HANDOFF_DEPTH = 2;

export type MissingForCode = Omit<MissingCapability, "contract"> & { contract: CapabilityContract };

/** The missing capabilities of a plan the code factory can take: topic `code`, a contract written. */
export function missingForCode(plan: Plan | null | undefined): MissingForCode[] {
    return (plan?.missing_capabilities ?? []).filter((m) => m.topic === "code" && Boolean(m.contract) && typeof m.contract === "object").map((m) => ({ ...m, contract: m.contract as unknown as CapabilityContract }));
}

/** The depth of hand-offs a task already went through. */
export const handoffDepthOf = (task: TaskFile["task"]): number => Number((task.observations as { handoffDepth?: unknown } | undefined)?.handoffDepth ?? 0) || 0;

export interface GeneratedType {
    type: string;
    plugin: string;
    sha256: string;
    task: string;
}

/** The request of the code task for one missing capability: the output, the contract, and where it comes from. */
export function codeTaskRequest(parentId: string, parent: TaskFile["task"], missing: MissingForCode, builder: "reasoner" | "scripted"): Record<string, unknown> {
    return {
        objective: { required_outputs: [{ name: missing.required_output, quantity: missing.quantity, ...(missing.unit ? { unit: missing.unit } : {}) }], constraints: {} },
        observations: {
            gap: missing.reason,
            parentTask: parentId,
            parentObjective: parent.objective,
            ...(typeof (parent.requirements as { objective?: unknown } | undefined)?.objective === "string" ? { parentRequest: (parent.requirements as { objective: string }).objective } : {}),
        },
        requirements: { capability: missing.contract },
        topics: ["code"],
        builder,
        requestedBy: `graph-factory:${parentId}`,
        budget: { iterations: 32, minutes: 20, twinPoints: 10 },
    };
}

/** The replay of the graph request on the forge's catalogue: the same task, the generated types named, one hand-off deeper. */
export function replayRequest(parentId: string, parent: TaskFile["task"], codeTaskId: string, generated: GeneratedType[], data: Array<{ file: string; text: string; columns?: string[] }>, builder: "reasoner" | "scripted"): Record<string, unknown> {
    const previous = ((parent.observations as { generated?: GeneratedType[] } | undefined)?.generated ?? []).filter((g) => !generated.some((n) => n.type === g.type));
    return {
        objective: parent.objective,
        observations: { ...parent.observations, generated: [...previous, ...generated], handoffDepth: handoffDepthOf(parent) + 1, replays: parentId, codeTask: codeTaskId },
        ...(parent.requirements ? { requirements: parent.requirements } : {}),
        data,
        topics: ["graph"],
        runtime: "forge",
        builder,
        requestedBy: `graph-factory:${parentId} replayed with ${generated.map((g) => g.type).join(", ")}`,
        budget: parent.budget,
    };
}
