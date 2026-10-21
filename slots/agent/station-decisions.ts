import type { JsonValue } from "@spiky-panda/harness";
import type { Question } from "../station/questions.js";
import type { Broker } from "../../harness/lib/broker.js";

/** Current authoritative evidence, without choosing an action for the reasoner. */
export async function stationDecisions(broker: Broker, commissioningId: string, missionId: string, tasks: ReadonlySet<string>): Promise<JsonValue> {
    const session = await broker.session("station");
    const results = await Promise.allSettled([
        broker.call("station", "commissioning_state", { commissioningId }),
        session.request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://questions" }),
    ]);
    const state = results[0].status === "fulfilled" && results[0].value.ok ? (results[0].value.output as { commissioning: Record<string, unknown> }).commissioning : null;
    const questions = results[1].status === "fulfilled" ? JSON.parse(results[1].value.contents[0].text) as Question[] : null;
    const related = questions?.filter((q) => (q.context as { commissioningId?: string } | null)?.commissioningId === commissioningId || (q.context as { missionId?: string } | null)?.missionId === missionId || (q.taskId !== null && tasks.has(q.taskId)));
    const p = state?.procedure as { procedureId: string; sha256: string } | null;
    return JSON.parse(JSON.stringify({ commissioningId, status: state?.status ?? "unavailable", procedure: p ? { id: p.procedureId, sha256: p.sha256 } : null, executionReport: state?.report ?? null, scientificApproval: state?.scientificApproval ?? null, launchAuthorisation: state?.authorisation ?? null, questions: related?.slice(-12).map((q) => ({ id: q.id, kind: q.kind, role: q.role, status: q.status, taskId: q.taskId, question: q.question, answer: q.answer })) ?? null }));
}
