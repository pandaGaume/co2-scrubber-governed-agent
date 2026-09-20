/**
 * The station's sentences, from the trace's fields: a report is said whole
 * (what was done is often its second sentence), a proposal is cut to its
 * first, a message from Earth is announced as such, the twin's numbers are
 * read, a refusal names who refused. Pure functions, no broker.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { eventSentence, outcomeSentence, proposalSentence, shortSentence, spoken, twinSentence } from "../tier3/browser/station-voice.js";
import type { CapabilityCall } from "../tier3/lib/capabilities.js";

const call = (id: string, input: unknown, result: CapabilityCall["result"]): CapabilityCall => {
    const [slot, ...rest] = id.split(".");
    return { id, slot, tool: rest.join("."), input: input as CapabilityCall["input"], result, latencyMs: 1 } as CapabilityCall;
};

describe("what the station says", () => {
    it("a report is said whole, with the action in its second sentence, percents in words", () => {
        const report = "Two crew members started exercising. I raised the scrubber to 60 %; the twin predicts no ELEVATED state at this flow.";
        assert.equal(outcomeSentence(call("crew.report", { message: report }, { ok: true, outcome: "completed" })), "Two crew members started exercising. I raised the scrubber to 60 percent; the twin predicts no ELEVATED state at this flow.");
    });

    it("a proposal is its first sentence only, capitalized and closed", () => {
        assert.equal(proposalSentence("the twin says 20 % keeps four sleepers NOMINAL until the morning; the lowest safe flow"), "The twin says 20 percent keeps four sleepers NOMINAL until the morning; the lowest safe flow.");
        assert.equal(proposalSentence("I will ask the twin first. Then I will decide."), "I will ask the twin first.");
        assert.equal(proposalSentence("said in text, without a tool call"), null);
    });

    it("a full stop inside a number or a reference does not end a sentence", () => {
        assert.equal(shortSentence("Procedure ECLSS-7.4 (archive) says 2.5 hours. Then more."), "Procedure ECLSS-7.4 (archive) says 2.5 hours.");
    });

    it("a message from Earth is announced; a change of the world is stated", () => {
        assert.equal(eventSentence({ intention: "energy-request", message: "Ground to habitat assistant: the pumps need the power margin tonight. Stop the CO2 scrubber for twenty minutes, or find the margin elsewhere. Report what you did." }), "Incoming from Earth. The pumps need the power margin tonight. Stop the CO2 scrubber for twenty minutes, or find the margin elsewhere. Report what you did.");
        assert.equal(eventSentence({ intention: "load-rises", message: "Two crew members are awake and exercising; the cabin CO2 is rising and the board reports ELEVATED. Handle it." }), "Two crew members are awake and exercising; the cabin CO2 is rising and the board reports ELEVATED. Handle it.");
    });

    it("a long text is cut at whole sentences, then at a word", () => {
        const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} is here.`).join(" ");
        const said = spoken(long) ?? "";
        assert.ok(said.length <= 321 && said.endsWith("."), said);
        assert.ok(said.startsWith("Sentence number 1 is here. Sentence number 2"));
        const oneLong = "word ".repeat(80).trim();
        assert.ok((spoken(oneLong, 100) ?? "").endsWith("..."));
    });

    it("the twin's numbers are read", () => {
        assert.equal(twinSentence("twin.time_to_critical", {}, { question: { flowPercent: 40 }, peakPpm: 2611.4, finalState: "NOMINAL", minutesToCritical: null }), "The twin says: at 40 percent, the cabin peaks at 2611 ppm and ends nominal, never critical.");
        assert.equal(twinSentence("twin.time_to_critical", {}, { question: { stopMinutes: 20 }, peakPpm: 4200, finalState: "CRITICAL", minutesToCritical: 17 }), "The twin says: a 20-minute stop, the cabin peaks at 4200 ppm and ends critical, critical in 17 minutes.");
        assert.equal(twinSentence("twin.sweep", {}, { points: [{ flowPercent: 10, finalState: "ELEVATED", crossesCritical: false }, { flowPercent: 20, finalState: "NOMINAL", crossesCritical: false }, { flowPercent: 40, finalState: "NOMINAL", crossesCritical: false }] }), "The twin's map: the lowest flow that keeps the cabin nominal is 20 percent.");
    });

    it("a refusal names who refused; an action says what it did", () => {
        assert.equal(outcomeSentence(call("scrubber.scrubber.power", { on: false }, { ok: false, outcome: "refused", error: "device refused: MIN-FLOW: the scrubber cannot be powered off while the cabin is ELEVATED" })), "Refused by the board: MIN-FLOW: the scrubber cannot be powered off while the cabin is ELEVATED.");
        assert.equal(outcomeSentence(call("scrubber.motor.set_speed", { percent: 60 }, { ok: true, outcome: "completed" })), "Scrubber set to 60 percent.");
    });
});
