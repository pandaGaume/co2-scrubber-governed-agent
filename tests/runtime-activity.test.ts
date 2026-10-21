import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { fromRoot } from "../lib/paths.js";

test("a stalled refresh cannot overlap with later polls and a failed refresh releases its slot", async () => {
    const { singleFlight } = await import(pathToFileURL(fromRoot("dashboard", "runtime-activity.js")).href);
    let calls = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const refresh = singleFlight(async () => { calls++; await pending; });
    const first = refresh();
    await Promise.all(Array.from({ length: 30 }, () => refresh()));
    assert.equal(calls, 1, "polling does not accumulate HTTP batches while an earlier one is stalled");
    release(); await first;
    await refresh();
    assert.equal(calls, 2);
    let fail = true;
    const retry = singleFlight(async () => { if (fail) throw new Error("connection unavailable"); calls++; });
    await assert.rejects(retry(), /connection unavailable/);
    fail = false;
    await retry();
    assert.equal(calls, 3);
});

test("the UI distinguishes an actual pending model request, a returned call and a paused mission", async () => {
    const { pendingModelActivity, missionActivity } = await import(pathToFileURL(fromRoot("dashboard", "runtime-activity.js")).href);
    const asked = { kind: "model.asked", decisionId: "d1", conversationId: "mission:R001#session", model: "Nemotron", at: "2026-10-20T20:00:00Z" };
    const now = Date.parse("2026-10-20T20:00:37Z");
    assert.deepEqual(pendingModelActivity([asked], now), ["Mission supervisor: waiting for Nemotron response (0:37)"]);
    assert.deepEqual(pendingModelActivity([asked, { ...asked, kind: "model.answered" }], now), []);
    assert.deepEqual(pendingModelActivity([asked, { ...asked, kind: "model.failed" }], now), []);
    const other = { ...asked, conversationId: "build#other" };
    assert.equal(pendingModelActivity([asked, other, { ...asked, kind: "model.answered" }], now).length, 1, "one conversation's answer cannot clear another's request");
    assert.match(missionActivity({ status: "completed", outcome: "incomplete", note: "40% plateau missing" }), /Mission closed: incomplete result.*40%/);
    assert.equal(missionActivity({ status: "suspended", note: "Decision timeout" }), "Mission paused: Decision timeout");
    assert.equal(missionActivity({ status: "waiting", waitingFor: "human" }), "Mission waiting for your reply");
    assert.equal(missionActivity({ status: "waiting", waitingFor: "event", note: "task t1" }), "Mission waiting for a result: task t1");
});
