import { it } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { fromRoot } from "../lib/paths.js";

it("dictation edits a draft, Enter only stops, and a new session ignores stale recognition", async () => {
    const { createDictation, dictationKey } = await import(pathToFileURL(fromRoot("dashboard", "mother-dictation.js")).href);
    const recognizers: Array<{ start(): void; stop(): void; onresult?: (event: unknown) => void }> = [];
    const drafts: Array<[string, string]> = [];
    let stops = 0;
    const dictation = createDictation({
        recognition: () => {
            const rec = { start() {}, stop() { stops++; } };
            recognizers.push(rec);
            return rec;
        },
        language: () => "en-US",
        onText: (id: string, text: string) => drafts.push([id, text]),
        onState() {},
        onError(error: string) { assert.fail(error); },
    });
    let prevented = 0;
    const key = (value: string, ctrlKey = false) => ({ key: value, ctrlKey, preventDefault() { prevented++; }, stopPropagation() {} });
    const start = () => dictation.start("q1", "Existing note.");
    dictationKey(key("m", true), dictation, start);
    assert.equal(dictation.active, true);
    recognizers[0].onresult!({ results: [[{ transcript: "Do not install" }]] });
    recognizers[0].onresult!({ results: [[{ transcript: "Do not install yet." }]] });
    assert.deepEqual(drafts.at(-1), ["q1", "Existing note. Do not install yet."]);
    let startsFromEnter = 0;
    dictationKey(key("Enter"), dictation, () => startsFromEnter++);
    assert.equal(dictation.active, false);
    assert.equal(stops, 1);
    assert.equal(startsFromEnter, 0);
    assert.equal(prevented, 2);
    // A final transcript may arrive after stop. It still updates the draft, never sends it.
    recognizers[0].onresult!({ results: [[{ transcript: "Do not install yet, explain first." }]] });
    assert.equal(drafts.at(-1)![1], "Existing note. Do not install yet, explain first.");
    dictation.start("q2", "");
    const count = drafts.length;
    recognizers[0].onresult!({ results: [[{ transcript: "stale" }]] });
    assert.equal(drafts.length, count);
    dictationKey(key("M", true), dictation, start);
    assert.equal(dictation.active, false);
});
