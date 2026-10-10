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
import type { Justified } from "./justify.js";

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
    /** The runtime slot the task builds and runs on (`twin`, or `forge` for the generated plugins). */
    runtimeSlot?: string;
}

export interface TopicDefinition {
    name: Topic;
    /**
     * The marching order the model reads first in its state (2026-10-09): the stages of the work in order, each with its goal and its
     * tools, where the task stands on each (passed, current, next), and what is closed now and why; read off the conduct graph that
     * judges. A small model given only the current stage fails on the order of the work.
     */
    marchingOrder?: (progress: Progress, task: TaskFile["task"]) => JsonValue;
    /** The capabilities the loop may call on this topic; anything else is refused by the guard. */
    tools: ReadonlyArray<RegExp>;
    /**
     * The capabilities the topic's conduct closes at this step (its playbook's gates refusing them now): not shown to the model,
     * so a step's tools are its stage's (2026-10-09: the procedure factory showed 26 tools and the procedure's whole schemas,
     * 13 000 prompt tokens, to a model that had to read the inventory first). The guard still refuses them if proposed.
     */
    closed?: (progress: Progress, task: TaskFile["task"]) => string[];
    /**
     * The current stage's tools, for a topic with a conduct (2026-10-10): a step offers these and the support every stage has
     * (`STAGE_SUPPORT`), minus what a gate closes; a way out offers its own alone. A topic without it offers its whole list.
     */
    stageTools?: (progress: Progress, task: TaskFile["task"]) => { tools: string[]; passed?: string[]; exit: boolean };
    /**
     * The capabilities the builder decides every time, never replayed from the recipes (2026-09-28): those whose
     * input is made of this task's readings (the procedure submitted, the plugin written for this contract). The
     * rules every topic shares (no call repeated in a task, no question nor failure) are in `replay.ts`.
     */
    neverReplayed?: ReadonlyArray<RegExp>;
    /**
     * The actions the topic lets the recipes replay (2026-09-28): what is judged again when it runs (a candidate
     * evaluated against this task's data, a plan the guard checks) or deterministic (the onnx fit). With
     * `neverReplayed`, every capability the topic allows that is not a read is classed, once, on purpose.
     */
    replayedActions?: ReadonlyArray<RegExp>;
    /** Where the topic's constants are, and which are safety constants: every one is justified (`justify.ts`). */
    justified?: Justified;
    /**
     * The capabilities whose input the topic's guard judges: the builder's submissions (2026-09-29, the learning experiment). The
     * manifest says of each whether the guard accepted or refused it; one the harness stopped before the guard (outside the step's
     * allowlist, a schema, a call repeated) is judged by nobody, and is not the submission's first try.
     */
    judges?: ReadonlyArray<RegExp>;
    /** The arguments of a submission that matter, by field path (`episodes.ts`): what an episode keeps of each attempt, and what a contrast compares. */
    digest?(capabilityId: string, input: JsonValue): Record<string, JsonValue>;
    /** Is the contract held: the artifacts claimed, the files of the workshop, what the steps recorded. */
    validate(claim: DoneClaim, files: WorkshopFile[], progress: Progress, task: TaskFile["task"]): Validation;
    /** Capabilities in process the topic adds to the task's three. */
    local?(context: TopicContext): LocalCapability[];
    /** The topic's own refusals, after the constructor's: problems in plain words, none when allowed. */
    guard?(capabilityId: string, input: JsonValue, context: TopicContext): string[] | Promise<string[]>;
    /** The intention the loop is stepped with, when the generic "build what produces" does not say the work. */
    intention?(task: TaskFile["task"], generic: Intention): Intention;
    /** The prompt file of the topic, relative to the repository (`specs/<topic>/prompt.md`), for a builder that is a language model; the reasoner adds the socle's (`base.ts`, `kernel.md, policy.md`). */
    prompt?: string;
    /**
     * The field of the task's observations the topic's own state shows already (its format's `observation`): left out of the
     * invariants, which would show it a second time (2026-10-01, E5.4: 48 000 characters of a diagnosis's lead, twice at every call).
     */
    observation?: string;
    /** What the topic says to its model, as templates of its spec (`specs/<topic>/words.json`, `words.ts`), and the keys it asks for: the conformance test checks the file holds them. */
    words?: { words: import("./words.js").Words; keys: string[] };
    /** The builder when the request names none: the model when the topic has a prompt, unless the topic says the script (the onnx fit the board asks for without a key). */
    defaultBuilder?: "reasoner" | "scripted";
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
    /** Are the required outputs quantities of the units service; true by default. A topic that writes a document (a playbook, 2026-09-29) names its outputs and measures none. */
    quantities?: boolean;
    /** Does the state carry the library's shelf (the reference graphs, their variables); true by default. A topic that builds no graph (code) leaves it out: fewer tokens, no domain read for nothing (2026-09-26). */
    shelf?: boolean;
    /**
     * What of the topic's state tells two steps apart for the recipes (2026-09-25): the
     * observation's id carries it, so a learned step replays only after the same
     * evidence. The graph topic gives the last candidate's diagnosis: "evaluate
     * again" learned after a failed candidate must not replay after one that held.
     */
    key?(progress: Progress): string;
    /**
     * What the topic hands over with the proposal (2026-09-25), built by code
     * from what it measured (the graph topic: the accepted candidate's
     * parameters with value, unit, name and status, its residuals and bounds),
     * never from the model's sentence, which stays a note beside it.
     */
    claims?(progress: Progress, task: TaskFile["task"]): Record<string, JsonValue>;
    /**
     * What the topic keeps of a task once it has ended, however it ended (2026-10-01, E5.3): the diagnosis topic records what its
     * model sent and what the harness observed, so a calibration is computed again without paying a model again. Given the task's
     * directory in the workshop; what it throws is logged, never the task's failure.
     */
    record?(taskDir: string): void;
}
