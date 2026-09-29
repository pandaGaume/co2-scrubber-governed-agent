/**
 * The procedure factory sees, before its first submission, each safety constant and the signed fact it is justified by
 * (2026-09-29, the witness C of the replays: the factory cited a fact of the card that does not bound the constant at the
 * first try of every task, and learned which one only from the refusal). Read from the signed rules as the guard reads them.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safetyBoundsOf, stateOfTopic, WORDS } from "../harness/topics/procedure/index.js";
import { FORMAT } from "../harness/topics/procedure/check.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import type { TaskFile } from "../harness/core/task.js";

describe("the safety constants and the facts they are justified by, in the procedure factory's state", () => {
    it("each safety constant of the signed rules with the fact its rules bound it by, and its side", () => {
        const bounds = Object.fromEntries(safetyBoundsOf().map((b) => [b.constant, b.cite.map((c) => `${c.fact} ${c.side}`)]));
        assert.deepEqual(bounds["steps.*.speedPercent"], ["test.speedFloorPercent at or above it"], "a step's speed: the floor, not a property of the device");
        assert.deepEqual(bounds["limits.co2MaxPpm"], ["test.co2AbortCeilingPpm at or below it"], "through the abort it sits below");
        assert.deepEqual(bounds["limits.maxMinutes"], ["test.maxMinutesCeiling at or below it"]);
        assert.deepEqual(bounds["monitoring.band.maxBpm"], ["test.heartRateMaxBpm at or below it"]);
    });

    it("in the state and said by the brief when the spec shows it", () => {
        assert.equal(FORMAT.safetyBounds, true);
        const task = { objective: { required_outputs: [{ name: "V_lab", quantity: "Volume", unit: "m3" }], constraints: {} }, observations: {}, data: [] } as unknown as TaskFile["task"];
        const state = stateOfTopic(newProgress(), task);
        assert.ok(Array.isArray((state.hypothesis as { safetyBounds?: unknown[] }).safetyBounds));
        // The procedure's brief holds the hole the spec's flag fills, and its words say where the facts are.
        assert.match(WORDS.templates["brief.procedure"], /and respect it\{bounds\};/);
        assert.match(WORDS.templates["brief.safetyBounds"], /the fact its signed rules bound it by and on which side \(field "safetyBounds"\), and that is the fact to cite/);
    });
});
