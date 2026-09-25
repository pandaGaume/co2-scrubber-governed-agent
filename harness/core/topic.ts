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
import type { TopicState } from "./reasoning-state.js";

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
    /**
     * The harness's brief for the next step, written from what the task has
     * read and done so far: where the work stands and what is still to be
     * found. It rides in the observation (`features.brief`), so the builder
     * is led one stage at a time instead of by one long prompt given once.
     * Deterministic: the same progress gives the same brief.
     */
    brief?(progress: Progress, task: TaskFile["task"]): string;
    /**
     * The topic's part of the reasoning state (`reasoning-state.ts`): its
     * current hypothesis, its last evaluation made compact, its open
     * questions, and the evidence its phases need (`requirements`, each true
     * or false). The harness refuses to leave a phase whose requirements are
     * not met, and the model reads which ones. Deterministic.
     */
    state?(progress: Progress, task: TaskFile["task"]): TopicState;
    /** How many sandbox runs the topic has spent in this task, when it counts them (the graph topic's `twinPoints`). */
    runsSpent?(progress: Progress): number;
    /**
     * What of the topic's state tells two steps apart for the recipes (2026-09-25): the
     * observation's id carries it, so a learned step replays only after the same
     * evidence. The graph topic gives the last candidate's diagnosis: "evaluate
     * again" learned after a failed candidate must not replay after one that held.
     */
    key?(progress: Progress): string;
}
