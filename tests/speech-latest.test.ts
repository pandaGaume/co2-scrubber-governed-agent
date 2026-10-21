import { test } from "node:test";
import assert from "node:assert/strict";
import { SpeechService } from "../slots/speech/service.js";
import { SilentProvider } from "../slots/speech/providers/silent.js";
import { similarAnnouncement } from "../lib/announcements.js";

test("consecutive similar announcements are suppressed while new values and outcomes remain audible", async () => {
    const provider = new SilentProvider();
    let calls = 0;
    const speak = provider.speak.bind(provider);
    provider.speak = async (text, options) => { calls++; return speak(text, options); };
    const service = new SpeechService(provider, { voices: { station: "silence" }, latestVoices: ["station"] });
    const [first, duplicate] = await Promise.all([service.say("I am checking the telemetry."), service.say("Checking telemetry.")]);
    assert.equal(duplicate.utteranceId, first.utteranceId);
    assert.equal(duplicate.suppressed, true);
    assert.equal(calls, 1);
    assert.equal(similarAnnouncement("Speed is 30 percent", "Speed is 40 percent"), false);
    assert.equal(similarAnnouncement("Procedure approved", "Procedure not approved"), false);
    assert.equal(similarAnnouncement("Test failed", "Test completed"), false);
    service.stop();
    assert.equal((await service.say("Checking telemetry.")).suppressed, undefined, "an explicit stop allows a fresh attempt");
});

test("a newest message equal to the spoken sentence drops the intermediate pending update without repeating speech", async () => {
    const service = new SpeechService(new SilentProvider(), { voices: { station: "silence" }, latestVoices: ["station"] });
    const current = await service.say("Checking telemetry.");
    service.take(current.utteranceId, "board");
    await service.say("Checking the library.");
    assert.equal((await service.say("I am checking telemetry.")).suppressed, true);
    assert.deepEqual(service.pending(), []);
    assert.ok(service.utterance(current.utteranceId)?.takenAt);
});

test("Mother finishes the line taken by an output and retains only the newest waiting message", async () => {
    const service = new SpeechService(new SilentProvider(), { voices: { station: "silence" }, latestVoices: ["station"] });
    const current = await service.say("The current sentence.");
    service.take(current.utteranceId, "board-a");
    const middle = await service.say("An intermediate update.");
    const newest = await service.say("The latest decision.", "station", "high");
    assert.equal(service.queue().stopMark, 0, "even a high-priority Mother update does not interrupt");
    assert.equal(service.utterance(current.utteranceId)?.takenAt !== undefined, true);
    assert.deepEqual(service.pending().map((u) => u.utteranceId), [newest.utteranceId]);
    assert.throws(() => service.take(middle.utteranceId, "board-b"), /no longer pending/);
    assert.throws(() => service.take(newest.utteranceId, "board-b"), /floor-busy/);
    service.played(current.utteranceId, "board-a", 2000);
    assert.equal(service.take(newest.utteranceId, "board-b").text, "The latest decision.");
    assert.equal(service.utterance(middle.utteranceId)?.playedBy, undefined);
});

test("a late synthesis result and a failed playback cannot resurrect an obsolete announcement", async () => {
    const provider = new SilentProvider();
    const speak = provider.speak.bind(provider);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    provider.speak = async (text, options) => { if (text === "Old") await gate; return speak(text, options); };
    const service = new SpeechService(provider, { voices: { station: "silence" }, latestVoices: ["station"] });
    const oldPending = service.say("Old");
    const latest = await service.say("New");
    release();
    const old = await oldPending;
    assert.ok(old.seq < latest.seq, "sequence reflects request order");
    assert.deepEqual(service.pending().map((u) => u.text), ["New"]);
    service.take(latest.utteranceId, "board");
    await service.say("Newest");
    service.returnUnplayed(latest.utteranceId, "board");
    assert.deepEqual(service.pending().map((u) => u.text), ["Newest"]);
});
