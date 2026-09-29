/**
 * The scripted constructor of the `reflection` topic (2026-09-29): plays the model's lines without a language model,
 * so an adaptation is proposed, checked by the guard and adopted in a fork without a key.
 *
 * The pattern it knows how to answer is the same cause stopping a commissioning's tests again (`abort-repeat`): the
 * bound of the playbook that ends the commissioning after so many aborts comes down to the number of aborts seen on
 * that cause, when it is higher. A factory that makes the same mistake at its first try of several tasks, and whose
 * retries were then accepted (`first-try-shape` with its successes): what the accepted retries did is proposed for the
 * factory's memory (`reflection.remember`), never written into its words. Any other pattern is left to a model.
 *
 *   plan, nothing done     task.plan: the adaptation is written here, the output missing, to the topic "reflection";
 *   build, after the plan  reflection.propose: the bound, justified by what the pattern measured;
 *   after the acceptance   task.done with the accepted file.
 */
import { readFileSync } from "node:fs";
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import { fromRoot } from "../../lib/paths.js";
import { decide, ScriptedBuilderBase, valueOf, type ScriptContext } from "../../harness/core/scripted-base.js";
import { episodesOfTask, patternsOf } from "../../harness/topics/reflection/index.js";
import type { PlaybookFile } from "../../harness/core/conduct.js";

export class ScriptedReflectionBuilder extends ScriptedBuilderBase {
    constructor(options: ScriptContext) {
        super("reflection", options);
    }

    protected next(state: PolicyFallbackInput["state"]): PolicyDecision {
        const { task } = this.options;
        const after = `${String(state.features.phase)}:${String(state.features.lastCapability)}`;
        switch (after) {
            case "plan:":
                return decide(
                    "task.plan",
                    { selected_nodes: [], missing_capabilities: task.objective.required_outputs.map((o) => ({ required_output: o.name, quantity: o.quantity, ...(o.unit ? { unit: o.unit } : {}), reason: "an adaptation is written, not taken from the catalogue", topic: "reflection" })) },
                    "the adaptation is written here",
                );
            case "build:task.plan": {
                for (const p of patternsOf(task)) {
                    if (p.kind !== "abort-repeat" || !p.target) continue;
                    const doc = JSON.parse(readFileSync(fromRoot(...p.target.split("/")), "utf8")) as PlaybookFile;
                    const bound = doc.nodes.find((n) => n.type === "conduct.bound" && n.bag?.count === "aborts");
                    const atLeast = bound?.bag?.atLeast;
                    if (!bound || typeof atLeast !== "number" || p.count >= atLeast) continue;
                    const condition = String(p.detail.condition ?? "?");
                    return decide(
                        "reflection.propose",
                        {
                            target: p.target,
                            ops: [
                                { op: "replace", pointer: `/nodes/[id=${bound.id}]/bag/atLeast`, value: p.count },
                                { op: "replace", pointer: `/nodes/[id=${bound.id}]/bag/why`, value: `the same cause (${condition}) stopped ${p.count} tests: after ${p.count} aborts the commissioning ends, and a person looks at the cause before another test` },
                            ],
                            reason: `the condition ${condition} stopped ${p.count} tests of one commissioning: a third test on the same cause exposes the crew again for what the analysis did not remove`,
                            evidence: [p.id],
                            justifications: [{ constant: "ops.0.value", value: p.count, source: "measured", reference: `pattern ${p.id}: ${p.count} aborts on ${condition}`, reason: "the aborts seen on one cause" }],
                        } as unknown as JsonValue,
                        `the bound ${bound.id} from ${atLeast} to ${p.count}`,
                    );
                }
                // A factory that keeps making the same mistake at its first try, and whose retries were then accepted (2026-09-29, the memory
                // audit): what was accepted is remembered for its memory, never written into its words. The script says it by the field and
                // the reference the accepted attempt cited, never a value; it reads the contrast, it does not know the rule.
                for (const p of patternsOf(task)) {
                    if (p.kind !== "first-try-shape") continue;
                    const successes = (p.detail.successes ?? []) as Array<{ episode: string; field: string; refused: { reference?: unknown } | null; accepted: { reference?: unknown } | null }>;
                    if (!successes.length) continue;
                    const topic = String(p.detail.topic ?? "");
                    const field = successes[0].field.replace(/\.\d+\./g, ".*.");
                    const cited = typeof successes[0].accepted?.reference === "string" ? `, as the accepted attempts did (${successes[0].accepted.reference})` : ", as the accepted attempts did";
                    const failures = ((p.detail.examples ?? []) as Array<{ task: string }>).map((e) => `${e.task}#${topic}`);
                    const attempted = [...new Set(episodesOfTask(task).filter((e) => failures.includes(e.id)).flatMap((e) => e.attempts.map((a) => a.capability)))];
                    return decide(
                        "reflection.remember",
                        {
                            memory: {
                                kind: "constraint",
                                rule: `For ${field}, send from the first attempt what the guard then accepted${cited}, not what it refused: ${String(p.detail.shape ?? "").slice(0, 160)}.`,
                                appliesTo: attempted.length ? attempted : [String(p.detail.capability ?? "")],
                                evidence: { failures, successes: [...new Set(successes.map((x) => x.episode))] },
                            },
                            reason: `the same form of mistake at the first try of ${p.count} tasks, then accepted after a retry ${successes.length} time(s): what the retries changed is remembered`,
                            evidence: [p.id],
                        } as unknown as JsonValue,
                        `remember what the accepted retries of ${field} did`,
                    );
                }
                return decide("task.fail", { reason: "no pattern the script knows how to answer (it answers a cause of abort repeated, when the playbook's bound is higher): a model reads the others" }, "nothing the script answers");
            }
            default: {
                const accepted = valueOf(this.last) as { path?: string; value?: { path?: string } };
                const path = accepted.value?.path ?? accepted.path;
                if (!path) return decide("task.fail", { reason: `the adaptation was not accepted: ${String(this.last?.result.error ?? "no acceptance")}` }, "the guard refused the adaptation");
                return decide("task.done", { summary: "an adaptation of the conduct, accepted by the guard", artifacts: [{ kind: "adaptation", path }] }, "the adaptation is accepted");
            }
        }
    }
}
