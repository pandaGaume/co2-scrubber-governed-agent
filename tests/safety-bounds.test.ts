/**
 * The procedure factory sees, before its first submission, each safety constant and the signed facts its value must respect
 * (2026-09-29, the witness C of the replays: the factory cited a fact of the card that does not bound the constant at the first
 * try of every task; since 2026-10-10 the harness justifies the safety constants itself, and the model sets their values within
 * these bounds). Read from the signed rules as the guard reads them.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safetyBoundsOf, stateOfTopic, WORDS } from "../harness/topics/procedure/index.js";
import { FORMAT } from "../harness/topics/procedure/check.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import type { TaskFile } from "../harness/core/task.js";
import { readFileSync } from "node:fs";
import { fromRepository } from "../lib/paths.js";

describe("the safety constants and the signed facts that bound them, in the procedure factory's state", () => {
    it("each safety constant of the signed rules with the facts its rules bound it by, and their side", () => {
        const bounds = Object.fromEntries(safetyBoundsOf().map((b) => [b.constant, b.within.map((c) => `${c.fact} ${c.side}`)]));
        assert.deepEqual(bounds["steps.*.speedPercent"], ["test.speedFloorPercent at or above it"], "a step's speed: the floor, not a property of the device");
        assert.deepEqual(bounds["limits.co2MaxPpm"], ["test.co2AbortCeilingPpm at or below it"], "through the abort it sits below");
        assert.deepEqual(bounds["limits.maxMinutes"], ["test.maxMinutesCeiling at or below it"]);
        assert.deepEqual(bounds["monitoring.band.maxBpm"], ["test.heartRateMaxBpm at or below it"]);
    });

    it("every safety constant a procedure may carry, those no signed fact bounds too, said to be left out (2026-10-10: the abort thresholds of run trv7)", () => {
        const all = safetyBoundsOf();
        const abort = all.find((b) => b.constant === "abort.*.threshold");
        assert.ok(abort, all.map((b) => b.constant).join(", "));
        assert.deepEqual(abort.within, []);
        assert.match(abort.note ?? "", /^no signed fact bounds it: leave it out \(abort\.battery\.threshold has its own bound, above\)$/);
        // Every numeric field of the schema the safety patterns cover is in the map, by its bound or as one to leave out.
        for (const c of ["limits.co2MaxPpm", "limits.co2AbortPpm", "limits.minSpeedPercent", "limits.maxMinutes", "steps.*.speedPercent", "abort.*.threshold", "monitoring.band.minBpm", "monitoring.band.maxBpm"]) assert.ok(all.some((b) => b.constant === c), c);
    });

    it("the path convention of a list's element said where the model writes paths, as the format names them (2026-09-30: steps indexed from 0 and abort conditions by position, where the guard names them by n and by id)", () => {
        assert.deepEqual(FORMAT.keys, { steps: "n", abort: "id" });
        const schema = JSON.parse(readFileSync(fromRepository("specs", "procedure", "procedure.schema.json"), "utf8")) as { properties: Record<string, { items: { properties: Record<string, { description?: string }> } }> };
        for (const [list, key] of Object.entries(FORMAT.keys)) assert.match(String(schema.properties[list].items.properties[key].description), /A path names a (step|condition) by it, never by its position in the list/, `${list}.${key}`);
        assert.match(WORDS.templates["brief.safetyBounds"], /a path names a step by its n and an abort condition by its id, never by its position in the list/);
        const analysis = readFileSync(fromRepository("specs", "procedure", "analysis.schema.json"), "utf8");
        assert.match(analysis, /a step is named by its n and an abort condition by its id, never by its position in the list/);
    });

    it("in the state and said by the brief when the spec shows it: the bounds to keep, and that the harness justifies the safety constants (2026-10-10)", () => {
        assert.equal(FORMAT.safetyBounds, true);
        const task = { objective: { required_outputs: [{ name: "V_lab", quantity: "Volume", unit: "m3" }], constraints: {} }, observations: {}, data: [] } as unknown as TaskFile["task"];
        const state = stateOfTopic(newProgress(), task);
        assert.ok(Array.isArray((state.hypothesis as { safetyBounds?: unknown[] }).safetyBounds));
        // The procedure's brief holds the hole the spec's flag fills, and says what the model does with the safety constants and what it justifies.
        assert.match(WORDS.templates["brief.procedure"], /signed\{bounds\}: set each within its signed bounds\. The harness checks them and justifies them itself, so they take no justification from you, and a safety field that no signed fact bounds is left out/);
        assert.match(WORDS.templates["brief.procedure"], /Every other number you chose \(the steps' durations\) is justified in justifications.*its value is read at its path, never repeated/);
        assert.match(WORDS.templates["brief.safetyBounds"], /the signed facts its value must respect and on which side, or that none bounds it, field "safetyBounds"/);
    });
});
