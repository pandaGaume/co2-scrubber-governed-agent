/**
 * What specialises the constructor (docs/factory-harness-plan.fr.md,
 * section 1): a topic is a set of tools, a validator, and (F5) a prompt.
 * The loop is the same; the guard reads `tools` (node 8), the evaluator
 * runs `validate` when the model says the work is done (node 11).
 */
import type { WorkshopFile, Progress, DoneClaim } from "./workspace-observer.js";
import type { TaskFile, Topic } from "./task.js";

export interface Validation {
    ok: boolean;
    /** What is missing or wrong, in plain words: the model reads them at the next step. */
    problems: string[];
}

export interface TopicDefinition {
    name: Topic;
    /** The capabilities the loop may call on this topic; anything else is refused by the guard. */
    tools: ReadonlyArray<RegExp>;
    /** Is the contract held: the artifacts claimed, the files of the workshop, what the steps recorded. */
    validate(claim: DoneClaim, files: WorkshopFile[], progress: Progress, task: TaskFile["task"]): Validation;
}
