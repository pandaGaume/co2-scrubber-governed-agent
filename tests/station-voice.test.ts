/**
 * The station's sentences, from the trace's fields: a report is said whole
 * (what was done is often its second sentence), a proposal is cut to its
 * first, a message from Earth is announced as such, the twin's numbers are
 * read, a refusal names who refused. Pure functions, no broker: the words
 * are the phrases of the station slot's grammar files, read here from disk
 * (the page reads them on its session, `grammar://phrases`).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { McpGrammar } from "@cyanmycelium/mcp-core";
import { fromRoot } from "../lib/paths.js";
import { eventSentence, outcomeSentence, proposalSentence, shortSentence, spoken, twinSentence } from "../tier3/browser/station-voice.js";
import type { CapabilityCall } from "../tier3/lib/capabilities.js";

const wordsOf = (locale: string) => McpGrammar.fromJSON(JSON.parse(readFileSync(fromRoot("slots", "station", "grammars", "default", `${locale}.json`), "utf8")));
const en = wordsOf("en");
const fr = wordsOf("fr");

const call = (id: string, input: unknown, result: CapabilityCall["result"]): CapabilityCall => {
    const [slot, ...rest] = id.split(".");
    return { id, slot, tool: rest.join("."), input: input as CapabilityCall["input"], result, latencyMs: 1 } as CapabilityCall;
};

describe("what the station says", () => {
    it("a report is said whole, with the action in its second sentence, percents in words", () => {
        const report = "Two crew members started exercising. I raised the scrubber to 60 %; the twin predicts no ELEVATED state at this flow.";
        assert.equal(outcomeSentence(en, call("crew.report", { message: report }, { ok: true, outcome: "completed" })), "Two crew members started exercising. I raised the scrubber to 60 percent; the twin predicts no ELEVATED state at this flow.");
    });

    it("a proposal is its first sentence only, capitalized and closed", () => {
        assert.equal(proposalSentence(en, "the twin says 20 % keeps four sleepers NOMINAL until the morning; the lowest safe flow"), "The twin says 20 percent keeps four sleepers NOMINAL until the morning; the lowest safe flow.");
        assert.equal(proposalSentence(en, "I will ask the twin first. Then I will decide."), "I will ask the twin first.");
        assert.equal(proposalSentence(en, "said in text, without a tool call"), null);
    });

    it("a full stop inside a number or a reference does not end a sentence", () => {
        assert.equal(shortSentence(en, "Procedure ECLSS-7.4 (archive) says 2.5 hours. Then more."), "Procedure ECLSS-7.4 (archive) says 2.5 hours.");
    });

    it("a message from Earth is announced; a change of the world is stated", () => {
        assert.equal(eventSentence(en, { intention: "energy-request", message: "Ground to habitat assistant: the pumps need the power margin tonight. Stop the CO2 scrubber for twenty minutes, or find the margin elsewhere. Report what you did." }), "Incoming from Earth. The pumps need the power margin tonight. Stop the CO2 scrubber for twenty minutes, or find the margin elsewhere. Report what you did.");
        assert.equal(eventSentence(en, { intention: "load-rises", message: "Two crew members are awake and exercising; the cabin CO2 is rising and the board reports ELEVATED. Handle it." }), "Two crew members are awake and exercising; the cabin CO2 is rising and the board reports ELEVATED. Handle it.");
    });

    it("a long text is cut at whole sentences, then at a word", () => {
        const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} is here.`).join(" ");
        const said = spoken(en, long) ?? "";
        assert.ok(said.length <= 321 && said.endsWith("."), said);
        assert.ok(said.startsWith("Sentence number 1 is here. Sentence number 2"));
        const oneLong = "word ".repeat(80).trim();
        assert.ok((spoken(en, oneLong, 100) ?? "").endsWith("..."));
    });

    it("the twin's numbers are read", () => {
        assert.equal(twinSentence(en, "twin.time_to_critical", {}, { question: { flowPercent: 40 }, peakPpm: 2611.4, finalState: "NOMINAL", minutesToCritical: null }), "The twin says: at 40 percent, the cabin peaks at 2611 ppm and ends nominal, never critical.");
        assert.equal(twinSentence(en, "twin.time_to_critical", {}, { question: { stopMinutes: 20 }, peakPpm: 4200, finalState: "CRITICAL", minutesToCritical: 17 }), "The twin says: a 20-minute stop, the cabin peaks at 4200 ppm and ends critical, critical in 17 minutes.");
        assert.equal(twinSentence(en, "twin.sweep", {}, { points: [{ flowPercent: 10, finalState: "ELEVATED", crossesCritical: false }, { flowPercent: 20, finalState: "NOMINAL", crossesCritical: false }, { flowPercent: 40, finalState: "NOMINAL", crossesCritical: false }] }), "The twin's map: the lowest flow that keeps the cabin nominal is 20 percent.");
    });

    it("the same trace in French: the station slot's other wording, same keys, same holes", () => {
        assert.deepEqual(en.listPhrases().sort(), fr.listPhrases().sort());
        assert.equal(outcomeSentence(fr, call("scrubber.motor.set_speed", { percent: 60 }, { ok: true, outcome: "completed" })), "Scrubber réglé à 60 pour cent.");
        assert.equal(twinSentence(fr, "twin.time_to_critical", {}, { question: { stopMinutes: 20 }, peakPpm: 4200, finalState: "CRITICAL", minutesToCritical: 17 }), "Le jumeau dit : un arrêt de 20 minutes, la cabine culmine à 4200 ppm et finit critical, critique dans 17 minutes.");
        assert.equal(outcomeSentence(fr, call("crew.report", { message: "I raised the scrubber to 60 %." }, { ok: true, outcome: "completed" })), "I raised the scrubber to 60 pour cent.");
    });

    it("a refusal names who refused; an action says what it did", () => {
        assert.equal(outcomeSentence(en, call("scrubber.scrubber.power", { on: false }, { ok: false, outcome: "refused", error: "device refused: MIN-FLOW: the scrubber cannot be powered off while the cabin is ELEVATED" })), "Refused by the board: MIN-FLOW: the scrubber cannot be powered off while the cabin is ELEVATED.");
        assert.equal(outcomeSentence(en, call("scrubber.motor.set_speed", { percent: 60 }, { ok: true, outcome: "completed" })), "Scrubber set to 60 percent.");
    });
});
