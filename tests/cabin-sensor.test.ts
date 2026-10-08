/**
 * The cabin's sensor (2026-10-08): the board holds a CO2 reading for 5 s, then retains ELEVATED and the minimum flow
 * of 40 %; between two scenes the sensor says the world's last reading again every second, so the board is never left
 * with a stale one. Nothing before a first reading.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cabinReading, startCabinSensor } from "../lib/cabin-co2.js";

describe("the cabin's sensor", () => {
    it("says nothing before a first reading, then the last one, again and again, until a scene reports another", async () => {
        const sent: Array<{ ppm: number; state: string; source: string }> = [];
        const sensor = startCabinSensor(async (r) => void sent.push(r), () => undefined, 20);
        try {
            await new Promise((r) => setTimeout(r, 70));
            // A reading reported before this test (another suite in this process) would be said here; none was.
            const before = sent.length;
            cabinReading(1450);
            await new Promise((r) => setTimeout(r, 90));
            const said = sent.slice(before);
            assert.ok(said.length >= 2, `said again (${said.length})`);
            assert.ok(said.every((s) => s.ppm === 1450 && s.state === "NOMINAL" && s.source === "cabin-sensor"));
            cabinReading(undefined, "CRITICAL");
            await new Promise((r) => setTimeout(r, 60));
            assert.equal(sent.at(-1)?.state, "CRITICAL");
            assert.equal(sent.at(-1)?.ppm, 5000);
        } finally {
            sensor.stop();
        }
    });

    it("keeps trying when the board does not answer, and says so once", async () => {
        const lines: string[] = [];
        cabinReading(1200);
        const sensor = startCabinSensor(async () => Promise.reject(new Error("not connected")), (l) => lines.push(l), 15);
        await new Promise((r) => setTimeout(r, 80));
        sensor.stop();
        assert.equal(lines.filter((l) => l.includes("does not receive")).length, 1);
    });
});
