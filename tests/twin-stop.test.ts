/**
 * A stop as the twin plays it (2026-10-11): powered off, the scrubber draws nothing; restarted, it removes nothing during its restart
 * latency (specs/cabin-parameters.json, scrubber.restartLatencyMinutes) while its motor runs at the resume speed. In the Test A takes
 * a stop "saved" 316 Wh that were in fact the motor's idle draw at a command of 0.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runCabin, summarize } from "../slots/twin/cabin-twin.js";
import { stopPlanOf } from "../slots/twin/provider.js";

const crew = [{ count: 4, activity: "sleep" as const }];
const run = (stop: number, flow: number) => {
    const { command, motor, restartLatencyMinutes } = stopPlanOf(stop, flow, 0.33, 120);
    const rows = runCabin({ co2Ppm: 1500, crew, command, motor, minutes: 120 });
    return { rows, summary: summarize(rows), restartLatencyMinutes };
};

describe("a stop in the twin", () => {
    it("draws nothing while stopped, and saves what the motor would have drawn", () => {
        const running = run(0, 0.33);
        const stopped = run(30, 0.33);
        assert.equal(stopped.rows[9].powerW, 0);
        assert.ok(running.rows[9].powerW > 0);
        const saved = running.summary.scrubberEnergyWh - stopped.summary.scrubberEnergyWh;
        assert.ok(Math.abs(saved - (running.rows[9].powerW * 30) / 60) < 1, `saved ${saved} Wh`);
        assert.ok(stopped.summary.stateOfChargePercent > running.summary.stateOfChargePercent);
    });

    it("removes nothing during the restart latency, while the motor runs", () => {
        const { rows, restartLatencyMinutes } = run(30, 0.33);
        assert.equal(restartLatencyMinutes, 10);
        assert.equal(rows[34].rate, 0);
        assert.ok(rows[34].powerW > 0);
        assert.ok(rows[44].rate > 0);
    });

    it("a motor at 0 % draws nothing", () => {
        assert.equal(run(0, 0).summary.scrubberEnergyWh, 0);
    });
});
