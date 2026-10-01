/**
 * The scripted constructor of the `diagnosis` topic (2026-10-01, E5.2): plays the model's lines without a language model, so a lead
 * is diagnosed, its predictions run by the guard, and the diagnosis handed to the station without a key.
 *
 * A script does not diagnose: it says what the lead's own nodes say, and its expectations are what the harness observes (it reads the
 * predicates' answers before it predicts, which no model can). It is a stand-in for the wiring, never a measure of the diagnosis.
 *
 *   a guard's form of a rule of the register   cause: the refusal falls under the rule; current: the rule stated today or not;
 *                                              rules out the other of "a gap of the contract" and "the model's own mistake",
 *                                              by whether the task's texts stated it
 *   a harness's form (a cut, a schema)         cause: the step ended so; rules out a refusal of the guard; current: the form's
 *                                              rate under the latest fingerprint, when the lead does not compare it
 *   anything else                              task.fail: nothing a script can diagnose.
 *
 * The task's observations may give it the whole diagnosis instead (`script.diagnosis`), as the other scripts' hook.
 *
 *   plan, nothing done     task.plan: the diagnosis is made here, the output missing, to the topic "diagnosis";
 *   build, after the plan  diagnosis.submit;
 *   after a refusal        the same diagnosis again: a script does not revise, and the harness ends the task stuck after three
 *                          refusals on the same points;
 *   after the acceptance   task.done with the accepted file.
 */
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import { decide, ScriptedBuilderBase, valueOf, type ScriptContext } from "../../harness/core/scripted-base.js";
import { TOPIC_DEFINITIONS } from "../../harness/core/runner.js";
import { H, HarnessGraph, type HarnessNode } from "../../lib/harness-graph.js";
import { evaluatePrediction, type Prediction } from "../../lib/predicates.js";
import { loadRegister, type Register } from "../../lib/rules-register.js";
import { diagnosisAskedOf, readingsOf, workshopsOf, type Diagnosis, type DiagnosisAsked, type DiagnosisPrediction } from "../../harness/topics/diagnosis/index.js";

const OUTCOME: Record<string, string> = { TRUNCATED: "cut", PRE_GUARD_REJECTED: "harness-refused", GUARD_REJECTED: "guard-refused", ACCEPTED: "accepted", CAPABILITY_FAILED: "failed" };

/** What the script submits for a lead, without its id; null when it has nothing to say. */
export function scriptedDiagnosis(asked: DiagnosisAsked, g: HarnessGraph): Omit<Diagnosis, "id"> | null {
    const lead = asked.lead;
    const form = lead.form ? g.get(lead.form.id) : undefined;
    if (!form) return null;
    // The first refusal of the lead's own tasks for its form: a task, a step, how it ended.
    const refusal = g
        .in(form, H.refusedFor)
        .map((l) => l.oini as HarnessNode)
        .map((n) => ({ n, match: /^(?:attempt|step):(.+):(\d+)$/.exec(n.id) }))
        .find((x) => x.match && lead.tasks.includes(`task:${x.match[1]}`));
    if (!refusal?.match) return null;
    const task = refusal.match[1];
    const step = Number(refusal.match[2]);
    const registers = Object.fromEntries(Object.keys(TOPIC_DEFINITIONS).map((t) => [t, loadRegister(t)])) as Record<string, Register | null>;
    const observe = (p: Prediction) => evaluatePrediction(g, p, { registers });
    // What the harness observes is what the script expects: unknown is expected true (it refutes nothing).
    const predict = (role: DiagnosisPrediction["role"], p: Prediction, alternative?: string): DiagnosisPrediction => ({ role, ...p, expect: observe(p).truth !== "false", ...(alternative ? { alternative } : {}) });
    const evidence = [form.id, `task:${task}`, refusal.n.id];
    const rule = asked.rules[0];
    if (lead.form?.by === "guard" && rule) {
        const statedThen = observe({ predicate: "stated-at", args: { rule: rule.code, at: task } }).truth;
        const statedNow = observe({ predicate: "stated-at", args: { rule: rule.code, at: "today" } }).truth === "true";
        const gap = statedThen !== "true";
        return {
            verdict: statedNow && lead.recommend ? "stale" : "right",
            cause: `The guard refused the form ${lead.form.shape} under the rule ${rule.code}; ${gap ? "the texts the task read did not state it" : "the texts the task read stated it, and the model did not follow"}${statedNow ? ", and the texts state it today" : ", and no text states it today"}.`,
            class: gap ? "contract-gap" : "model-error",
            current: statedNow ? "closed" : "still",
            evidence: [...evidence, `rule:${String(form.bag?.topic)}:${rule.code}`].filter((id) => g.get(id)),
            predictions: [
                predict("cause", { predicate: "refused-with", args: { task, step, rule: rule.code } }),
                predict("current", { predicate: "stated-at", args: { rule: rule.code, at: "today" } }),
                predict("rules-out", { predicate: "stated-at", args: { rule: rule.code, at: task } }, gap ? "the model's own mistake: the rule was stated in what it read" : "a gap of the contract: the rule was stated in no text it read"),
            ],
            justifications: [],
        };
    }
    if (lead.form?.by === "harness") {
        const outcome = OUTCOME[String(refusal.n.bag?.outcome)] ?? "harness-refused";
        // Today: the form's rate under the latest fingerprint, if the lead does not compare it.
        const compared = JSON.stringify(lead.evidence ?? null);
        const latest = g
            .nodesOf(H.fingerprint)
            .filter((f) => !g.in(f, H.after).length && !compared.includes(f.id))
            .find(Boolean);
        if (!latest) return null;
        const rate = observe({ predicate: "rate", args: { form: form.id, fingerprint: latest.id, compare: "=", value: 0 } });
        if (rate.truth === "unknown") return null;
        return {
            verdict: rate.truth === "true" && lead.recommend ? "stale" : "right",
            cause: `The harness ended the step ${step} of ${task} as ${outcome}, before any guard judged it (${lead.form.shape}).`,
            class: "harness-artefact",
            current: rate.truth === "true" ? "closed" : "still",
            evidence,
            predictions: [
                predict("cause", { predicate: "outcome-at", args: { task, step, outcome } }),
                predict("current", { predicate: "rate", args: { form: form.id, fingerprint: latest.id, compare: "=", value: 0 } }),
                predict("rules-out", { predicate: "outcome-at", args: { task, step, outcome: "guard-refused" } }, "a refusal of the guard, a rule of the contract"),
            ],
            justifications: [],
        };
    }
    return null;
}

export class ScriptedDiagnosisBuilder extends ScriptedBuilderBase {
    constructor(options: ScriptContext) {
        super("diagnosis", options);
    }

    protected next(state: PolicyFallbackInput["state"]): PolicyDecision {
        const { task } = this.options;
        const asked = diagnosisAskedOf(task);
        const after = `${String(state.features.phase)}:${String(state.features.lastCapability)}`;
        switch (after) {
            case "plan:":
                return decide(
                    "task.plan",
                    { selected_nodes: [], missing_capabilities: task.objective.required_outputs.map((o) => ({ required_output: o.name, quantity: o.quantity, ...(o.unit ? { unit: o.unit } : {}), reason: "a diagnosis is made, not taken from the catalogue", topic: "diagnosis" })) },
                    "the diagnosis is made here",
                );
            case "build:task.plan": {
                const hook = ((task.observations ?? {}) as { script?: { diagnosis?: Partial<Diagnosis> } }).script?.diagnosis;
                // Built once: the script submits once, and a task never diagnoses twice.
                const drafted = hook ? null : scriptedDiagnosis(asked, new HarnessGraph(workshopsOf(asked.forks), readingsOf(TOPIC_DEFINITIONS)));
                if (!drafted && !hook) return decide("task.fail", { reason: `nothing a script can diagnose for the lead ${asked.lead.id} (${asked.lead.class})` }, "no diagnosis a script makes");
                const diagnosis = { id: asked.id, ...drafted, ...hook };
                return decide("diagnosis.submit", diagnosis as unknown as JsonValue, `a diagnosis of class ${String(diagnosis.class)}`);
            }
            default: {
                const accepted = valueOf(this.last) as { path?: string; value?: { path?: string } };
                const path = accepted.value?.path ?? accepted.path;
                if (!path) return decide("task.fail", { reason: `the diagnosis was not accepted: ${String(this.last?.result.error ?? "no acceptance")}` }, "the guard refused the diagnosis");
                return decide("task.done", { summary: `the diagnosis ${asked.id}, accepted by the guard`, artifacts: [{ kind: "diagnosis", path }] }, "the diagnosis is accepted");
            }
        }
    }
}
