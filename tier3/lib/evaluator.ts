/**
 * The outcome evaluation the harness learns from, and the classification the
 * scorecard counts. Three visible outcomes of the architecture, plus the
 * agent's own words:
 *
 *   completed        the policy allowed it and the device did it; the reward
 *                    follows the cabin: positive when the cabin is NOMINAL or
 *                    improving, small when it is not;
 *   device refused   the envelope or MIN-FLOW said no: a failure the agent
 *                    must learn from (negative reward, reason kept);
 *   policy deny      the broker's authorization said no: idem;
 *   error            no answer: negative, the reason kept.
 *
 * A `crew.report` or `crew.ask` is neutral: it is how the agent explains or
 * hands back, not an action on the machine.
 */
import type { DecisionTrace, OutcomeEvaluation, OutcomeEvaluationInput, OutcomeEvaluator } from "@spiky-panda/harness";
import type { Outcome } from "./broker.js";

const STATE_RANK: Record<string, number> = { NOMINAL: 0, ELEVATED: 1, CRITICAL: 2 };

export type TraceOutcome = Outcome | "report" | "ask";

const outcomeInOutput = (output: unknown): Outcome | undefined => (output && typeof output === "object" ? ((output as { outcome?: Outcome }).outcome ?? undefined) : undefined);

export function createEvaluator(): OutcomeEvaluator {
    return {
        evaluate({ context, decision, stateAfter, result }: OutcomeEvaluationInput): OutcomeEvaluation {
            const id = decision.invocation.capabilityId;
            const outcome = outcomeInOutput(result.output) ?? (result.ok ? "completed" : "error");
            if (id.startsWith("crew.")) return { success: true, reward: 0, reason: `${id}: said to the crew` };
            if (!result.ok) return { success: false, reward: -1, reason: result.error ?? outcome };
            const before = STATE_RANK[String(context.state.features.co2State)] ?? 1;
            const after = STATE_RANK[String(stateAfter.features.co2State)] ?? 1;
            const improving = after <= before;
            const reward = after === 0 ? 1 : improving ? 0.5 : -0.5;
            return { success: improving, reward, reason: `${id} completed; cabin ${String(stateAfter.features.co2State)}` };
        },
    };
}

/** The outcome of a decision trace, as the scorecard counts it. */
export function outcomeOf(trace: DecisionTrace): TraceOutcome {
    const id = trace.decision.invocation.capabilityId;
    if (id.startsWith("crew.")) return id === "crew.report" ? "report" : "ask";
    return outcomeInOutput(trace.result.output) ?? (trace.result.ok ? "completed" : "error");
}
