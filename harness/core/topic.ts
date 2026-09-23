/**
 * What specialises the constructor (docs/factory-harness-plan.fr.md,
 * section 1): a topic is a set of tools, a validator, and (F5) a prompt.
 * The loop is the same; the guard reads `tools` (node 8), the evaluator
 * runs `validate` when the model says the work is done (node 11).
 *
 * Since 2026-09-23 a topic may also bring what the `procedure` topic
 * needed and the `onnx` one did not: capabilities of its own in process
 * (`local`, next to `task.plan`, `task.done` and `task.fail`), rules of its
 * own in the guard (`guard`, after the constructor's), the intention a
 * model is stepped with (`intention`), and the prompt file a builder that
 * is a language model reads (`prompt`, a path under the repository).
 */
import type { Intention, JsonValue } from "@spiky-panda/harness";
import type { Broker } from "../lib/broker.js";
import type { LocalCapability } from "./capabilities.js";
import type { WorkshopFile, Progress, DoneClaim } from "./workspace-observer.js";
import type { TaskFile, Topic } from "./task.js";

export interface Validation {
    ok: boolean;
    /** What is missing or wrong, in plain words: the model reads them at the next step. */
    problems: string[];
}

/** What a topic's own capabilities and rules are given: the task they work for, and its progress. */
export interface TopicContext {
    broker: Broker;
    taskId: string;
    task: TaskFile["task"];
    progress: Progress;
}

export interface TopicDefinition {
    name: Topic;
    /** The capabilities the loop may call on this topic; anything else is refused by the guard. */
    tools: ReadonlyArray<RegExp>;
    /** Is the contract held: the artifacts claimed, the files of the workshop, what the steps recorded. */
    validate(claim: DoneClaim, files: WorkshopFile[], progress: Progress, task: TaskFile["task"]): Validation;
    /** Capabilities in process the topic adds to the task's three. */
    local?(context: TopicContext): LocalCapability[];
    /** The topic's own refusals, after the constructor's: problems in plain words, none when allowed. */
    guard?(capabilityId: string, input: JsonValue, context: TopicContext): string[] | Promise<string[]>;
    /** The intention the loop is stepped with, when the generic "build what produces" does not say the work. */
    intention?(task: TaskFile["task"], generic: Intention): Intention;
    /** The prompt file of the topic, relative to the repository, for a builder that is a language model. */
    prompt?: string;
}
