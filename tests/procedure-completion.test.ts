import { test } from "node:test";
import assert from "node:assert/strict";
import { observedProfileProblem, type RecordedSpeed } from "../slots/agent/procedure-completion.js";
import { Mission } from "../tier3/mission.js";
import type { ExecutionContext } from "@spiky-panda/harness";
import { requestedProcedureProblems } from "../lib/procedure/request.js";

const requirement = { requiredSpeedsPercent: [30, 40, 50, 60, 70, 80, 90, 100], minimumObservedSeconds: 10, speedTolerancePercent: 1 };
const samples = (speeds: number[], dwell = 10): RecordedSpeed[] => speeds.flatMap((speedPercent, i) => [{ at: i * 20000, speedPercent }, { at: i * 20000 + dwell * 1000, speedPercent }]);

test("the requested profile is checked before approval, including the actual nonconforming test and recording dwell", () => {
    const observations = { missionContext: { completion: { procedure: requirement }, secondsPerMinute: 2 } };
    const candidate = (speeds: number[], minutes: number) => ({ steps: speeds.map((speedPercent) => ({ speedPercent, minutes })) });
    assert.deepEqual(requestedProcedureProblems(observations, candidate(requirement.requiredSpeedsPercent, 6)), []);
    assert.match(requestedProcedureProblems(observations, candidate([30, 50, 70, 100, 30], 10)).join("; "), /40%.*60%.*80%.*90%/);
    assert.match(requestedProcedureProblems(observations, candidate(requirement.requiredSpeedsPercent, 5)).join("; "), /dwell/);
    assert.deepEqual(requestedProcedureProblems({}, candidate([30, 100], 12)), [], "a mission without that request does not acquire a coded speed profile");
});

test("an incomplete conclusion is an explicit model decision and does not waive evidence required for success", async () => {
    const checked: string[] = [];
    let reportExists = false;
    const mission = new Mission("terminal", "report the actual test", {}, async () => ({ capability: "mission.complete", input: { reason: "Report read; required plateaus were not all recorded.", outcome: "incomplete" }, ok: true, reasoned: true }), () => undefined, 4, 0, () => undefined, async (outcome) => { checked.push(outcome); return outcome === "success" ? "required plateaus missing" : reportExists ? null : "no terminal report"; });
    const complete = mission.capabilities().find((c) => c.id === "mission.complete")!;
    assert.equal((await complete.execute({ reason: "done", outcome: "incomplete" }, {} as ExecutionContext)).ok, false);
    reportExists = true;
    assert.equal((await complete.execute({ reason: "done", outcome: "success" }, {} as ExecutionContext)).ok, false);
    assert.equal((await complete.execute({ reason: "report limitations", outcome: "incomplete" }, {} as ExecutionContext)).ok, true);
    mission.run();
    const deadline = Date.now() + 1000;
    while (mission.state.status !== "completed") { assert.ok(Date.now() < deadline); await new Promise((r) => setTimeout(r, 5)); }
    assert.equal(mission.state.outcome, "incomplete");
    assert.deepEqual(checked, ["incomplete", "success", "incomplete"]);
});
test("completion requires a completed report and the actual observed ordered plateaus", () => {
    const run = { status: "done", report: {}, speedObservations: samples(requirement.requiredSpeedsPercent) };
    assert.equal(observedProfileProblem(requirement, run), null);
    assert.match(observedProfileProblem(requirement, { ...run, status: "aborted" })!, /not completed/);
    assert.match(observedProfileProblem(requirement, { ...run, report: null })!, /report/);
    assert.match(observedProfileProblem(requirement, { ...run, speedObservations: [] })!, /30%/);
    assert.match(observedProfileProblem(requirement, { ...run, speedObservations: samples([30, 50, 60, 70, 80, 90, 100]) })!, /40%/);
    assert.match(observedProfileProblem(requirement, { ...run, speedObservations: samples([40, 30, 50, 60, 70, 80, 90, 100]) })!, /40%/);
    assert.match(observedProfileProblem(requirement, { ...run, speedObservations: samples(requirement.requiredSpeedsPercent, 9) })!, /10 seconds/);
    assert.match(observedProfileProblem(requirement, { ...run, speedObservations: samples([33, 40, 50, 60, 70, 80, 90, 100]) })!, /30%/);
});
test("the completion capability returns the missing evidence to the model without choosing an alternative action", async () => {
    let problem: string | null = "human decision q1 remains open";
    const mission = new Mission("evidence", "goal", {}, async () => { throw new Error("no automatic decision expected"); }, () => undefined, 40, 0, () => undefined, async () => problem);
    const complete = mission.capabilities().find((c) => c.id === "mission.complete")!;
    assert.equal((await complete.execute({ reason: "finished" }, {} as ExecutionContext)).ok, false);
    assert.equal(mission.state.status, "running");
    problem = null;
    assert.equal((await complete.execute({ reason: "evidence read" }, {} as ExecutionContext)).ok, true);
    assert.equal(mission.state.status, "running", "only the subsequent reasoner decision ends the mission");
});
