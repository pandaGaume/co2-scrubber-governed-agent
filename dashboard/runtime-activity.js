/** A stalled request must not accumulate another batch on every timer tick. */
export function singleFlight(work) {
    let pending = false;
    return async (...args) => {
        if (pending) return;
        pending = true;
        try { return await work(...args); }
        finally { pending = false; }
    };
}

/** Activity comes from actual request/response events, never a simulated progress bar. */
export function pendingModelActivity(events, now = Date.now()) {
    const pending = new Map();
    for (const event of events) {
        if (!event.decisionId || !event.conversationId) continue;
        const key = `${event.conversationId}:${event.decisionId}`;
        if (event.kind === "model.asked") pending.set(key, event);
        else if (event.kind === "model.answered" || event.kind === "model.failed") pending.delete(key);
    }
    return [...pending.values()].map((event) => {
        const elapsed = Math.max(0, Math.floor((now - Date.parse(event.at)) / 1000));
        const clock = Number.isFinite(elapsed) ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : "unknown elapsed time";
        const who = event.conversationId.startsWith("mission:") ? "Mission supervisor" : "Reasoner";
        return `${who}: waiting for ${event.model ?? "the model"} response (${clock})`;
    });
}

export function missionActivity(mission) {
    if (!mission) return null;
    if (mission.status === "completed" && mission.outcome === "incomplete") return `Mission closed: incomplete result. ${mission.note ?? "See the test report."}`;
    if (mission.status === "suspended") return `Mission paused: ${mission.note ?? "reason unavailable"}`;
    if (mission.status === "waiting") return mission.waitingFor === "human" ? "Mission waiting for your reply" : `Mission waiting for a result: ${mission.note ?? "external event"}`;
    if (mission.status === "running") return `Mission active: ${mission.decisions} decisions completed`;
    return null;
}
