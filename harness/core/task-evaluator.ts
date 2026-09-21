/**
 * What a step of the constructor is worth (node 11 of
 * docs/harness-stages.fr.md), for the memory and for the trace:
 *
 *   not ok        -1, the reason kept (a refusal of the slot, a deny of the
 *                 broker's policy, an error);
 *   task.plan     +1: the plan passed the guard and is written;
 *   a tool        +1 when the workshop changed (a file added or replaced:
 *                 the listing's digest moved), +0.5 when nothing changed (a
 *                 read: useful, but not progress);
 *   task.fail     0, not a success: the builder gave up; the reason is kept,
 *                 nothing is learned from it;
 *   task.done     the topic's validator on the claimed artifacts, the
 *                 workshop's files and what the steps recorded: held, +1 and
 *                 the phase is `done`; not held, -1 with the problems in the
 *                 reason, the phase stays `build` and the model reads them at
 *                 the next step.
 *
 * On this scale the harness promotes a step to a replay after three tasks
 * where it succeeded at +1 (reward average 0.58 after three, threshold 0.35)
 * and after five at +0.5: the steps that build replay first, the reads keep
 * asking the model a while longer (`plasticity.ts` defaults).
 *
 * On the way, the evaluator keeps what the validator will need: the sha256 of
 * every model whose `model.contract` check passed, the summary of the last
 * sandbox run.
 */
import type { JsonValue, OutcomeEvaluation, OutcomeEvaluationInput, OutcomeEvaluator } from "@spiky-panda/harness";
import type { Broker } from "../lib/broker.js";
import type { TaskFile } from "./task.js";
import type { TopicDefinition } from "./topic.js";
import { listWorkshop, type Progress } from "./workspace-observer.js";

const valueOf = (output: unknown): Record<string, JsonValue> => {
    const v = output && typeof output === "object" ? (output as { value?: unknown }).value : undefined;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, JsonValue>) : {};
};

export interface TaskEvaluatorOptions {
    broker: Broker;
    taskId: string;
    task: TaskFile["task"];
    topic: TopicDefinition;
    progress: Progress;
}

export function createTaskEvaluator({ broker, taskId, task, topic, progress }: TaskEvaluatorOptions): OutcomeEvaluator {
    return {
        async evaluate({ context, decision, stateAfter, result }: OutcomeEvaluationInput): Promise<OutcomeEvaluation> {
            const id = decision.invocation.capabilityId;
            if (!result.ok) return { success: false, reward: -1, reason: result.error ?? `${id} failed` };
            const value = valueOf(result.output);
            if (id === "model.contract" && value.ok === true && typeof value.sha256 === "string") progress.checkedModels.push(value.sha256);
            if (id === "twin.session_run" && typeof value.summary === "object") progress.sandbox = { documentSha256: value.documentSha256 ?? null, ticks: value.ticks ?? null, wallMs: value.wallMs ?? null, summary: value.summary };
            if (id === "task.fail") return { success: false, reward: 0, reason: `the builder gave up: ${String(value.reason ?? "")}` };
            if (id === "task.plan") return { success: true, reward: 1, reason: `plan accepted: ${String(value.selected)} node type(s), ${String(value.missing)} missing capability(ies)` };
            if (id === "task.done") {
                const claim = progress.done;
                if (!claim) return { success: false, reward: -1, reason: "task.done recorded no claim" };
                const files = await listWorkshop(broker, taskId);
                const v = topic.validate(claim, files, progress, task);
                if (v.ok) {
                    progress.phase = "done";
                    return { success: true, reward: 1, reason: `contract held on topic ${topic.name}: ${claim.artifacts.map((a) => `${a.kind} ${a.path}`).join(", ")}` };
                }
                return { success: false, reward: -1, reason: `contract not held: ${v.problems.join("; ")}` };
            }
            const changed = context.state.features.digest !== stateAfter.features.digest;
            return { success: true, reward: changed ? 1 : 0.5, reason: changed ? `${id} completed; the workshop changed` : `${id} completed; nothing new in the workshop` };
        },
    };
}
