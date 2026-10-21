/** Checks the operator's declared acquisition requirements, without choosing or rewriting a procedure. */
export function requestedProcedureProblems(observations: Record<string, unknown>, candidate: unknown): string[] {
    const mission = observations.missionContext as { completion?: { procedure?: { requiredSpeedsPercent: number[]; minimumObservedSeconds: number } }; secondsPerMinute?: number } | undefined;
    const required = mission?.completion?.procedure;
    if (!required) return [];
    const steps = (candidate as { steps?: Array<{ speedPercent: number; minutes: number }> })?.steps ?? [];
    const problems: string[] = [];
    let cursor = 0;
    for (const speed of required.requiredSpeedsPercent) {
        const at = steps.findIndex((step, index) => index >= cursor && step.speedPercent === speed);
        if (at < 0) { problems.push(`operator-requested ${speed}% plateau is missing or out of order; requested profile: ${required.requiredSpeedsPercent.join(", ")}%`); continue; }
        cursor = at + 1;
        const clock = mission?.secondsPerMinute;
        if (typeof clock !== "number" || !Number.isFinite(clock) || clock <= 0 || steps[at].minutes * clock < required.minimumObservedSeconds + clock) problems.push(`${speed}% dwell does not allow ${required.minimumObservedSeconds} seconds of observed speed with the configured sampling clock; approval cannot replace missing acquisition time`);
    }
    return problems;
}
