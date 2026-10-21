import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceKey, rememberEvidence } from "../harness/core/evidence.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import { reasoningStateOf } from "../harness/core/reasoning-state.js";

test("the next reasoning state retains distinct rows, failed lookups and differently filtered searches", () => {
    const progress = newProgress();
    rememberEvidence(progress, "workspace.read", { path: "telemetry.json", pointer: "/columns" }, { error: "array has no item columns", outcome: "refused" });
    rememberEvidence(progress, "workspace.read", { path: "telemetry.json", pointer: "/0" }, { minute: 0, co2: 500 });
    rememberEvidence(progress, "workspace.read", { path: "telemetry.json", pointer: "/50" }, { minute: 50, co2: 700 });
    rememberEvidence(progress, "twin.registry_search", { requiredOutputs: [{ quantity: "Current" }] }, { matches: [] });
    rememberEvidence(progress, "twin.registry_search", { requiredOutputs: [{ quantity: "Concentration" }] }, { matches: ["sensor"] });
    const state = reasoningStateOf({ task: { objective: { required_outputs: [], constraints: {} }, observations: {}, data: [] } as never, progress, budget: { iterations: 20, minutes: 30 }, nextActions: [], shelf: [], telemetry: null });
    assert.equal(Object.keys(state.evidence).length, 5);
    assert.match(JSON.stringify(state.evidence), /array has no item columns/);
    assert.deepEqual(state.evidence[evidenceKey("workspace.read", { path: "telemetry.json", pointer: "/0" })], { minute: 0, co2: 500 });
    assert.equal(evidenceKey("workspace.read", { path: "x", pointer: "/0" }), evidenceKey("workspace.read", { pointer: "/0", path: "x" }));
    assert.equal(evidenceKey("library.read", { id: "card" }), "library.read card");
    for (let i = 0; i < 20; i++) rememberEvidence(progress, "workspace.read", { path: `file-${i}` }, { i });
    assert.equal(Object.keys(progress.evidence).length, 10);
});
