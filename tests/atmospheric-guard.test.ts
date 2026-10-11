/**
 * The scrubber board's atmospheric guard, simulated (2026-10-11, SCRUBBER_SAFETY_SCENARIO.md, specs/scrubber/guard.json): the
 * board estimates the emission from its own readings, forecasts a stop with its restart, refuses what would cross the warning line
 * minus the recovery margin or rests on a stale reading or an unavailable restart, and restarts on its own during a stop.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cabinModel, emissionOf, estimateEmission, forecastPeak, guardParameters, ppCo2Mmhg, rateAt, stepMinute, stopPlan, stopRefusal, type Atmosphere, type Cabin, type Reading } from "../slots/scrubber/atmosphere.js";
import { atmosphereTick, boardView, type AtmosphereState, type ScrubberState } from "../slots/scrubber/provider.js";

/** A cabin run for some minutes at a speed, with its readings as the board keeps them. */
function run(ppm: number, crew: AtmosphereState["crew"], percent: number, minutes: number): { cabin: Cabin; readings: Reading[] } {
    let cabin: Cabin = { ppm, rate: rateAt(percent) };
    const readings: Reading[] = [{ ...cabin }];
    for (let i = 0; i < minutes; i++) {
        cabin = stepMinute(cabin, emissionOf(crew), rateAt(percent));
        readings.push({ ...cabin });
    }
    return { cabin, readings };
}

function atmosphere(ppm: number, crew: AtmosphereState["crew"], percent: number, over: Partial<Atmosphere> = {}): Atmosphere {
    const { cabin, readings } = run(ppm, crew, percent, 10);
    return { ppm: cabin.ppm, pressureKpa: 101.3, sensor: "ok", sensorAgeSeconds: 0.5, emission: estimateEmission(readings, guardParameters().emissionWindowMinutes), cabin, ...over };
}

const restartOk = { available: true, energyReserved: true, latencyMinutes: 10 };
const asleep = [{ count: 4, activity: "sleep" as const }];
const exercising = [{ count: 4, activity: "heavy_work" as const }];

describe("the board's atmospheric guard", () => {
    it("estimates the emission from its own readings, without the crew", () => {
        const { readings } = run(1500, asleep, 33, 10);
        assert.ok(Math.abs((estimateEmission(readings, 5) as number) - emissionOf(asleep)) < 1e-9);
        assert.equal(estimateEmission(readings.slice(0, 3), 5), null);
    });

    it("reads the CO2 as a partial pressure: 3500 ppm at 101.3 kPa is about 2.7 mmHg", () => {
        assert.ok(Math.abs(ppCo2Mmhg(3500, 101.3) - 2.66) < 0.01);
    });

    it("four asleep can afford the longest stop: 8 ppm/min, the warning line far", () => {
        assert.equal(stopRefusal(atmosphere(1500, asleep, 33), 60, 33, restartOk), null);
    });

    it("four exercising: a short stop holds, a long one crosses the line", () => {
        const a = atmosphere(2000, exercising, 33);
        assert.equal(stopRefusal(a, 10, 33, restartOk), null);
        assert.match(String(stopRefusal(a, 60, 33, restartOk)), /FORECAST: a 60-minute stop, 10 minutes of restart/);
    });

    it("no stop at or above the warning line", () => {
        const a = atmosphere(1500, asleep, 33);
        assert.match(String(stopRefusal({ ...a, ppm: 3600, cabin: { ...a.cabin, ppm: 3600 } }, 5, 33, restartOk)), /ENVELOPE: CO2 partial pressure 2\.7\d mmHg/);
    });

    it("refuses a stop on a stale or invalid reading, an unavailable restart, an unreserved restart energy, an unbounded stop, a pressure out of bounds", () => {
        const a = atmosphere(1500, asleep, 33);
        assert.match(String(stopRefusal({ ...a, sensorAgeSeconds: 30 }, 15, 33, restartOk)), /SENSOR: the CO2 reading is 30.0 s old/);
        assert.match(String(stopRefusal({ ...a, sensor: "invalid" }, 15, 33, restartOk)), /SENSOR: the CO2 reading is invalid/);
        assert.match(String(stopRefusal(a, 15, 33, { ...restartOk, available: false })), /RESTART: the restart is not available/);
        assert.match(String(stopRefusal(a, 15, 33, { ...restartOk, energyReserved: false })), /RESTART: the energy of the restart is not reserved/);
        assert.match(String(stopRefusal(a, 0, 33, restartOk)), /STOP: a stop names its bound/);
        assert.match(String(stopRefusal({ ...a, pressureKpa: 80 }, 15, 33, restartOk)), /ATMOSPHERE: cabin pressure 80\.0 kPa/);
    });

    it("forecasts a stop with the restart's latency: no removal during it", () => {
        const a = atmosphere(1500, asleep, 33);
        const short = forecastPeak(a.cabin, a.emission as number, stopPlan(10, 0, 33), 240).peakPpm;
        const withLatency = forecastPeak(a.cabin, a.emission as number, stopPlan(10, 10, 33), 240).peakPpm;
        assert.ok(withLatency > short);
    });
});

describe("the simulated board during a stop", () => {
    function board(crew: AtmosphereState["crew"], ppm: number): ScrubberState {
        const m = cabinModel();
        const s: ScrubberState = { power: true, speedPercent: 33, currentAmps: 0.15, co2Ppm: ppm, co2State: "NOMINAL", healthResidual: 0.02, profile: "adaptive", minFlowPercent: 40, runFloorPercent: 0, guard: "atmospheric", atmosphere: null };
        s.atmosphere = { worldMinute: 0, sampledAtMinute: 0, timeScale: 1, harnessThinking: false, runFloorPercent: 0, crew, cabin: { ppm, rate: m.rateAtFullCommand * 0.33 }, readings: [{ ppm, rate: m.rateAtFullCommand * 0.33 }], pressureKpa: 101.3, sensor: "ok", lastReadingAt: Date.now(), restart: { available: true, energyReserved: true, latencyMinutes: 10, readyAtMinute: null }, stop: null, alarm: null, actions: [] };
        for (let i = 0; i < 6; i++) atmosphereTick(s, 1);
        return s;
    }
    const stop = (s: ScrubberState, minutes: number) => {
        const a = s.atmosphere as AtmosphereState;
        a.stop = { startedAtMinute: a.worldMinute, untilMinute: a.worldMinute + minutes, resumePercent: s.speedPercent };
        s.power = false;
        s.speedPercent = 0;
    };

    it("restarts at the end of the bound, back to the speed before", () => {
        const s = board(asleep, 1500);
        stop(s, 5);
        for (let i = 0; i < 5; i++) atmosphereTick(s, 1);
        assert.equal(s.power, true);
        assert.equal(s.speedPercent, 33);
        assert.match(String((s.atmosphere as AtmosphereState).actions.at(-1)), /the stop's bound is reached/);
    });

    it("restarts at once at full speed when the sensor goes stale", () => {
        const s = board(asleep, 1500);
        stop(s, 30);
        const a = s.atmosphere as AtmosphereState;
        a.sensor = "stale";
        a.lastReadingAt = Date.now() - 60_000;
        atmosphereTick(s, 1);
        assert.equal(s.speedPercent, 100);
        assert.match(String(a.actions.at(-1)), /monitoring: SENSOR/);
    });

    it("restarts at full speed when the restart margin is lost (the crew starts exercising)", () => {
        const s = board(asleep, 2600);
        stop(s, 60);
        (s.atmosphere as AtmosphereState).crew = exercising;
        for (let i = 0; i < 60 && !s.power; i++) atmosphereTick(s, 1);
        assert.equal(s.speedPercent, 100);
        assert.match(String((s.atmosphere as AtmosphereState).actions.join("\n")), /restart margin lost/);
    });

    it("raises RESTART FAILED when the restart is not available", () => {
        const s = board(asleep, 1500);
        stop(s, 2);
        (s.atmosphere as AtmosphereState).restart.available = false;
        for (let i = 0; i < 2; i++) atmosphereTick(s, 1);
        assert.equal(s.power, false);
        assert.match(String((s.atmosphere as AtmosphereState).alarm), /RESTART FAILED/);
    });

    it("lives in real time at the world's one pace: a tick is a real second, the sensor fresh at each, a reading kept per world minute", () => {
        const s = board(asleep, 1500);
        const a = s.atmosphere as AtmosphereState;
        const kept = a.readings.length;
        const minute = a.worldMinute;
        for (let i = 0; i < 59; i++) atmosphereTick(s, 1 / 60);
        assert.ok(Math.abs(a.worldMinute - minute - 59 / 60) < 1e-9);
        assert.equal(a.readings.length, kept);
        atmosphereTick(s, 1 / 60);
        assert.equal(a.readings.length, kept + 1);
        assert.ok(Date.now() - a.lastReadingAt < 1000);
    });

    it("runs at the factor set while nobody thinks, and at 1 while the harness thinks", () => {
        const s = board(asleep, 1500);
        const a = s.atmosphere as AtmosphereState;
        a.timeScale = 10;
        let minute = a.worldMinute;
        atmosphereTick(s);
        assert.ok(Math.abs(a.worldMinute - minute - 10 / 60) < 1e-9);
        a.harnessThinking = true;
        minute = a.worldMinute;
        atmosphereTick(s);
        assert.ok(Math.abs(a.worldMinute - minute - 1 / 60) < 1e-9);
    });

    it("keeps a local run floor when one is set, and says it does not know who set it (Test F)", () => {
        const s = board(asleep, 1500);
        (s.atmosphere as AtmosphereState).runFloorPercent = 30;
        const view = boardView(s);
        assert.equal((view.localSettings as { runFloorPercent: number }).runFloorPercent, 30);
        assert.match(String((view.localSettings as { recorded: string }).recorded), /not recorded on the board/);
    });

    it("publishes what its sensors read and its guard's lines, never the crew", () => {
        const view = boardView(board(asleep, 1500));
        assert.equal(view.guard, "atmospheric");
        assert.ok((view.atmosphere as { ppCo2Mmhg: number }).ppCo2Mmhg > 0);
        assert.equal((view.guardLines as { source: string }).source, "specs/scrubber/guard.json");
        assert.ok(!JSON.stringify(view).includes("sleep"));
    });
});
