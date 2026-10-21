/** Operator-declared evidence requirements, never a choice of actions or test points. */
export interface ProcedureCompletionRequirement {
    requiredSpeedsPercent: number[];
    minimumObservedSeconds: number;
    speedTolerancePercent: number;
}

export interface RecordedSpeed {
    at: number;
    speedPercent: number;
}

export function observedProfileProblem(requirement: ProcedureCompletionRequirement, run: { status: string; report: unknown; speedObservations?: RecordedSpeed[] }): string | null {
    if (run.status !== "done" || !run.report) return "the authorised test has not completed with an execution report";
    const samples = run.speedObservations ?? [];
    let cursor = 0;
    for (const speed of requirement.requiredSpeedsPercent) {
        let start: number | null = null;
        let found = false;
        for (; cursor < samples.length; cursor++) {
            const sample = samples[cursor];
            if (!Number.isFinite(sample.at) || !Number.isFinite(sample.speedPercent) || Math.abs(sample.speedPercent - speed) > requirement.speedTolerancePercent) { start = null; continue; }
            start ??= sample.at;
            if (sample.at - start >= requirement.minimumObservedSeconds * 1000) { cursor++; found = true; break; }
        }
        if (!found) return `no recorded ${speed}% plateau lasting ${requirement.minimumObservedSeconds} seconds in the required order; an authorised proposal or commanded target is not observed execution`;
    }
    return null;
}
