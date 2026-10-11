/**
 * The board where a scenario starts, in one place (2026-10-12, Guillaume: the behaviours varied, the same code was in several places).
 *
 * Four players started a scenario each in its own way: the tier3 runner, the agent slot, the studio page and the commissioning. Each
 * put back part of the board only, and the simulated board kept the rest of the last scenario (a stop left running, a speed forced to
 * 100 %, the atmospheric guard, a clock ten times faster): the next scenario began off or at full speed, depending on the order.
 *
 * The simulated board has one reset (`debug.reset`, a stub tool). The real board has none and answers no: the three commands after it
 * then do what they can (the reading, the power, the speed). No Node module here: the studio page uses it in the browser.
 */
import type { CallResult } from "../../harness/lib/broker.js";

export interface BoardCaller {
    call(slot: string, tool: string, args?: Record<string, unknown>): Promise<CallResult>;
}

export interface BoardStart {
    /** The speed the scenario starts at. */
    speedPercent: number;
    /** The CO2 the scenario starts at, ppm. */
    ppm: number;
    /** The reading the world reports to the board (`scrubber.co2_report`), NOMINAL at that CO2. */
    reading: Record<string, unknown>;
}

/** Puts the board back to the start; returns what could not be done, one line each (empty when all went through). */
export async function resetBoard(world: BoardCaller, start: BoardStart): Promise<string[]> {
    const failed: string[] = [];
    const reset = await world.call("scrubber", "debug.reset", { guard: "speed", speedPercent: start.speedPercent, ppm: start.ppm });
    const steps: Array<[string, Record<string, unknown>]> = [
        ["scrubber.co2_report", start.reading],
        ["scrubber.power", { on: true }],
        ["motor.set_speed", { percent: start.speedPercent }],
    ];
    // After a reset the board is already there; the reading is still reported, the world being the one that says the CO2.
    for (const [tool, args] of reset.ok ? steps.slice(0, 1) : steps) {
        const r = await world.call("scrubber", tool, args);
        if (!r.ok) failed.push(`${tool}: ${r.error ?? r.outcome}`);
    }
    if (!reset.ok) failed.unshift(`debug.reset: ${reset.error ?? reset.outcome} (not the simulated board?)`);
    return failed;
}
