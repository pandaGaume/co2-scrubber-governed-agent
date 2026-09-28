/**
 * What a replay from the recipes may be, the same for every factory
 * (2026-09-28). The recipes promote a step after three successes on tasks of
 * the same kind (`recipes.ts`); the kind is the required outputs by quantity
 * and unit, never the device, the data or the contract. So a replay is kept
 * for what does not depend on this task:
 *
 *   - never a call this task already made with the same input: it answers
 *     nothing new (the same candidate evaluated three times burnt a graph
 *     task's sandbox runs; a read looped by a model was learned within its
 *     task and replayed until the iteration budget was spent);
 *   - never a question to the commander, nor a failure (`task.ask`,
 *     `task.fail`): both are about this task;
 *   - never what the topic says is made of this task's readings
 *     (`TopicDefinition.neverReplayed`): the procedure submitted and its
 *     claim, the plugin written for this contract and its claim. A procedure
 *     replayed from another task was submitted for scrubber-1 in a run
 *     commissioning scrubber-1-r002. Where the work is deterministic (the
 *     onnx fit), the plan and the claim stay a recipe.
 *
 * The step is still recorded: the builder decides it, the recipes learn it.
 */
import type { PolicyGraph } from "@spiky-panda/harness";

export const NEVER_REPLAYED: ReadonlyArray<RegExp> = [/^task\.(fail|ask)$/];

/** The key of a call in this task: the capability and its input as proposed. */
export const proposalKey = (capabilityId: string | null | undefined, input: unknown): string => `${capabilityId ?? ""}:${JSON.stringify(input ?? null)}`;

/** The policy's candidates for a replay, less those the rules above exclude; `made` is filled by the runner as the task goes. */
export function restrictReplays(policy: PolicyGraph, never: ReadonlyArray<RegExp>, made: ReadonlySet<string>): void {
    const candidates = policy.findCandidateActions.bind(policy);
    policy.findCandidateActions = (state, intention, modeId) =>
        candidates(state, intention, modeId).map((c) => {
            const id = c.invocation.capabilityId;
            return never.some((r) => r.test(id)) || made.has(proposalKey(id, c.invocation.input)) ? { ...c, eligible: false } : c;
        });
}
