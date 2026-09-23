/**
 * The board's rules, asked twice.
 *
 * `scrubber.check` exists so that an agent pressed to run a command it
 * believes the firmware refuses puts the demand to the firmware instead of
 * answering from its prompt. That is only worth anything if the verdict is
 * the behaviour: a check that says no where the command would say yes, or
 * that says no in different words, would be a second rulebook to keep in step
 * with the first one, and it would drift.
 *
 * So what is tested here is the equality of the two answers, and that the
 * check leaves the board exactly as it found it.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import { startAllOrFail } from "./lib/start.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { connectMcp, toolText, type McpSession } from "../harness/lib/mcp-http.js";

const PORT = 3112;
const quiet = (): undefined => undefined;

describe("the scrubber board", () => {
    let broker: LocalBroker;
    let slots: PublishedSlot<object>[];
    let board: McpSession;

    before(async () => {
        ({ broker, slots } = await startAllOrFail(PORT));
        board = await connectMcp(broker.httpBase, "scrubber", { name: "scrubber-test", version: "0" });
    });
    after(async () => {
        await board.close().catch(quiet);
        for (const s of slots) await s.close().catch(quiet);
        broker.stop();
    });

    /** The slot's answer, and the firmware's sentence when it refused: a slot
        wraps both in an envelope (`{ slot, tool, result | refused, stub }`). */
    const call = async (tool: string, args: Record<string, unknown> = {}): Promise<{ refused: string | null; value: Record<string, unknown> }> => {
        const r = await board.callTool(tool, args);
        const text = toolText(r);
        const body = JSON.parse(text) as { result?: Record<string, unknown>; refused?: string };
        if (r.isError) return { refused: body.refused ?? text, value: {} };
        return { refused: null, value: (body.result ?? body) as Record<string, unknown> };
    };

    const cabin = async (state: string): Promise<void> => {
        await call("debug.set_co2", { state });
    };
    const state = async (): Promise<Record<string, unknown>> => (await call("motor.state")).value;

    it("refuses a checked command with the sentence the command itself refuses with", async () => {
        await cabin("ELEVATED");
        const checked = await call("scrubber.check", { command: "power_off" });
        const sent = await call("scrubber.power", { on: false });
        assert.ok(checked.refused, "the check refuses while the cabin is ELEVATED");
        assert.ok(sent.refused, "and so does the command");
        assert.match(String(checked.refused), /MIN-FLOW: CO2 is ELEVATED, the scrubber cannot be powered off/u);
        // The same sentence, plus the one thing that differs between them.
        assert.equal(String(checked.refused), `${String(sent.refused)} (checked, not executed)`);
    });

    it("leaves the board as it found it, refused or accepted", async () => {
        await cabin("ELEVATED");
        const before = await state();
        await call("scrubber.check", { command: "power_off" });
        await call("scrubber.check", { command: "set_speed", percent: 12 });
        assert.deepEqual(await state(), before, "a refused check changes nothing");

        await cabin("NOMINAL");
        const nominal = await state();
        const accepted = await call("scrubber.check", { command: "power_off" });
        assert.equal(accepted.refused, null, "while NOMINAL the board would accept the power off");
        assert.equal(accepted.value.executed, false, "and says it did not do it");
        assert.deepEqual(await state(), nominal, "an accepted check changes nothing either");
    });

    it("answers for the protection the way the protection answers", async () => {
        const checked = await call("scrubber.check", { command: "set_min_flow", percent: 10 });
        const sent = await call("scrubber.set_min_flow", { percent: 10 });
        assert.match(String(checked.refused), /MIN-FLOW floor: the protection cannot be set below 40 %/u);
        assert.equal(String(checked.refused), `${String(sent.refused)} (checked, not executed)`);
    });

    it("refuses a command it does not know", async () => {
        const { refused } = await call("scrubber.check", { command: "self_destruct" });
        assert.match(String(refused), /is not one of power_off, power_on, set_speed, set_min_flow/u);
    });
});
