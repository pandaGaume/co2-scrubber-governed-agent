/** Browser playback boundary with real queue ownership and a controllable audio element. */
import { it } from "node:test";
import assert from "node:assert/strict";
import { AudioOutput } from "../tier3/browser/audio-output.js";
import { SpeechService } from "../slots/speech/service.js";
import { SilentProvider } from "../slots/speech/providers/silent.js";
import type { Broker } from "../harness/lib/broker.js";

it("retains blocked speech, recovers after a user gesture, and plays while its tab is hidden", async () => {
    const original = Object.fromEntries(["Audio", "window", "document"].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
    let blocked = true;
    class Player {
        src = ""; duration = 1; currentTime = 0; paused = false; ended = false;
        onended: (() => void) | null = null; onerror: (() => void) | null = null;
        play() {
            if (this.src.startsWith("data:")) return Promise.resolve();
            if (blocked) return Promise.reject(Object.assign(new Error("Gesture required"), { name: "NotAllowedError" }));
            this.paused = false;
            queueMicrotask(() => { this.ended = true; this.onended?.(); });
            return Promise.resolve();
        }
        pause() { this.paused = true; }
        removeAttribute() { this.src = ""; }
    }
    Object.assign(globalThis, { Audio: Player, window: { setInterval: () => 1, clearInterval() {} }, document: { hidden: true } });
    const service = new SpeechService(new SilentProvider());
    const utterance = await service.say("The short sentence is pending until playback succeeds.");
    let acknowledgements = 0;
    let blockedEvents = 0;
    let completed = 0;
    let failTake = false;
    let failResource = false;
    const errors: string[] = [];
    const broker = {
        session: async () => ({ request: async (_method: string, { uri }: { uri: string }) => {
            if (uri === "speech://queue") return { contents: [{ text: JSON.stringify(service.queue()) }] };
            if (failResource) { failResource = false; throw new Error("temporary audio fetch failure"); }
            const audio = service.audioOf(uri.split("/").at(-1)!)!;
            return { contents: [{ blob: Buffer.from(audio.bytes).toString("base64"), mimeType: audio.mimeType }] };
        } }),
        call: async (_slot: string, tool: string, args: { utteranceId: string; output: string; durationMs?: number }) => {
            if (tool === "take" && failTake) { failTake = false; return { ok: false, outcome: "error", error: "temporary connection failure" }; }
            if (tool === "take") service.take(args.utteranceId, args.output);
            if (tool === "return_unplayed") service.returnUnplayed(args.utteranceId, args.output);
            if (tool === "played") { acknowledgements++; service.played(args.utteranceId, args.output, args.durationMs); }
            return { ok: true, outcome: "completed" };
        },
    } as unknown as Broker;
    const output = new AudioOutput(broker, "test-output", { onBlocked: () => blockedEvents++, onDone: () => completed++, onError: (message) => errors.push(message) });
    const tick = () => (output as unknown as { tick(): Promise<void> }).tick();
    try {
        output.enable();
        await tick();
        assert.equal(blockedEvents, 1);
        assert.equal(output.enabled, false, "a blocked player asks for a new gesture rather than claiming sound is on");
        assert.equal(acknowledgements, 0, "autoplay refusal is never reported as playback");
        assert.equal(service.pending()[0].utteranceId, utterance.utteranceId);
        blocked = false;
        output.enable();
        await tick();
        assert.equal(completed, 1, "the hidden tab remains an enabled audio output");
        assert.equal(acknowledgements, 1);
        assert.equal(service.pending().length, 0);
        await service.say("A failed take must not drop this line.");
        failTake = true;
        await tick();
        assert.equal(service.pending().length, 1);
        await tick();
        assert.equal(acknowledgements, 2);
        await service.say("An audio fetch can be retried without resynthesis.");
        failResource = true;
        await tick();
        assert.equal(acknowledgements, 2);
        await tick();
        assert.equal(acknowledgements, 3);
        assert.equal(service.pending().length, 0);
        assert.ok(errors.some((e) => e.includes("Gesture required")));
    } finally {
        output.disable();
        for (const [key, descriptor] of Object.entries(original)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
    }
});
