/**
 * The speech slot through the broker, on the silent engine (no key, no
 * network): say, the queue an output reads, the audio resource, stop, a high
 * priority that interrupts, played, the voices per speaker, and what the
 * agent's catalogue is offered. The last test speaks through ElevenLabs and
 * runs only when ELEVENLABS_API_KEY is set (it costs characters of the
 * operator's quota); it writes nothing.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import { startAllOrFail } from "./lib/start.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { connectMcp, toolText, type McpSession } from "../harness/lib/mcp-http.js";
import { Broker } from "../harness/lib/broker.js";
import { buildCapabilities } from "../tier3/lib/capabilities.js";
import { ElevenLabsProvider } from "../slots/speech/providers/elevenlabs.js";
import { collect } from "../slots/speech/voice-provider.js";

const PORT = 3109;
const quiet = () => undefined;

interface Spoken {
    utteranceId: string;
    seq: number;
    voice: string;
    voiceId: string;
    provider: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    queued: boolean;
    uri: string;
    playedBy?: Array<{ output: string }>;
}
interface Queue {
    seq: number;
    stopMark: number;
    pending: Spoken[];
}

describe("speech slot on the silent engine", () => {
    let broker: LocalBroker;
    let slots: PublishedSlot<object>[];
    let session: McpSession;
    const result = async <T>(tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const r = await session.callTool(tool, args);
        const body = JSON.parse(toolText(r)) as { result?: T; refused?: string };
        if (r?.isError) throw new Error(body.refused ?? "refused");
        return body.result as T;
    };
    const queue = async (): Promise<Queue> => {
        const r = await session.request<{ contents: Array<{ text?: string }> }>("resources/read", { uri: "speech://queue" });
        return JSON.parse(r.contents[0].text ?? "{}") as Queue;
    };

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        ({ broker, slots } = await startAllOrFail(PORT));
        session = await connectMcp(broker.httpBase, "speech", { name: "test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        await session?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await broker?.stop();
    });

    it("describes itself: silent engine, the profile's speakers, ready", async () => {
        const d = await result<{ ready: boolean; provider: string; speakers: Record<string, string>; defaultVoice: string; profile: { file: string; sha256: string } }>("describe");
        assert.equal(d.ready, true);
        assert.equal(d.provider, "silent");
        assert.equal(d.defaultVoice, "station"); // the on-board AI: the voice of the demo
        assert.ok(d.speakers.station && d.speakers.twin, "speakers from profiles/voice.json");
        assert.equal(d.profile.file, "profiles/voice.json");
        assert.match(d.profile.sha256, /^[0-9a-f]{64}$/);
    });

    it("say synthesizes, queues, and returns an identifier without the audio", async () => {
        const u = await result<Spoken>("say", { text: "The CO2 level just passed 1200 ppm. I am raising the scrubber to 60 percent." });
        assert.match(u.utteranceId, /^u\d{4}-[0-9a-f]{8}$/);
        assert.equal(u.provider, "silent");
        assert.equal(u.voice, "station");
        assert.equal(u.mimeType, "audio/wav");
        assert.ok(u.bytes > 44, "a WAV with samples");
        assert.equal(u.queued, true);
        assert.equal(u.uri, `speech://utterances/${u.utteranceId}`);
        assert.equal((u as unknown as Record<string, unknown>).base64, undefined);
        const q = await queue();
        assert.deepEqual(q.pending.map((p) => p.utteranceId), [u.utteranceId]);
    });

    it("the audio is a resource: base64 of a RIFF/WAVE file, the announced size", async () => {
        const q = await queue();
        const id = q.pending[0].utteranceId;
        const r = await session.request<{ contents: Array<{ uri: string; mimeType?: string; blob?: string }> }>("resources/read", { uri: `speech://utterances/${id}` });
        const c = r.contents[0];
        assert.equal(c.mimeType, "audio/wav");
        const bytes = Buffer.from(c.blob ?? "", "base64");
        assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
        assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
        assert.equal(bytes.length, q.pending[0].bytes);
    });

    it("an output reports it played; the utterance leaves the queue", async () => {
        const id = (await queue()).pending[0].utteranceId;
        // Delivered once: the first output takes it, a second one is refused, and it is no longer pending for anyone.
        await result<Spoken>("take", { utteranceId: id, output: "test" });
        await assert.rejects(result("take", { utteranceId: id, output: "another page" }), /already taken by test/);
        assert.equal((await queue()).pending.length, 0);
        const u = await result<Spoken>("played", { utteranceId: id, output: "test", durationMs: 1234 });
        assert.equal(u.playedBy?.[0].output, "test");
        assert.equal((await queue()).pending.length, 0);
    });

    it("speakers have their own voice; an unknown one is refused", async () => {
        const twin = await result<Spoken>("say", { text: "Two people exercising: the cabin stays nominal at forty percent.", voice: "twin" });
        assert.equal(twin.voice, "twin");
        assert.notEqual(twin.voiceId, (await result<Spoken>("synthesize", { text: "agent voice" })).voiceId);
        await assert.rejects(result("say", { text: "hello", voice: "not a speaker at all" }), /unknown voice/);
        await assert.rejects(result("say", { text: "   " }), /text is required/);
    });

    it("high priority goes first and stops what was queued; stop clears the rest", async () => {
        const normal = await result<Spoken>("say", { text: "A normal message that waits its turn." });
        const high = await result<Spoken>("say", { text: "Critical. Full speed imposed by the board.", priority: "high" });
        const q = await queue();
        assert.equal(q.pending[0].utteranceId, high.utteranceId, "the high one plays next");
        assert.ok(!q.pending.some((p) => p.utteranceId === normal.utteranceId), "what was queued before is stopped");
        const stopped = await result<{ stopped: string[] }>("stop");
        assert.deepEqual(stopped.stopped, [high.utteranceId]);
        assert.equal((await queue()).pending.length, 0);
    });

    it("lists the speakers and the engine's voices", async () => {
        const v = await result<{ speakers: Record<string, string>; engine: Array<{ voiceId: string }> }>("listVoices");
        assert.ok(Object.keys(v.speakers).length >= 2);
        assert.equal(v.engine[0].voiceId, "silence");
    });

    it("the agent's catalogue offers say and stop, not the output tools", async () => {
        const agent = new Broker(broker.httpBase, { name: "test-agent", version: "0", locale: "en" });
        const { catalogue } = await buildCapabilities(agent);
        const ids = catalogue.filter((c) => c.slot === "speech").map((c) => c.id).sort();
        assert.deepEqual(ids, ["speech.say", "speech.stop"]);
        await agent.close();
    });
});

describe("ElevenLabs (only with ELEVENLABS_API_KEY)", { skip: !process.env.ELEVENLABS_API_KEY }, () => {
    it("speaks one sentence and streams MP3 back", async () => {
        const provider = new ElevenLabsProvider(process.env.ELEVENLABS_API_KEY ?? "", "eWc2pftlLqhJtXnPQknh", { model: "eleven_flash_v2_5" });
        const started = Date.now();
        const audio = await provider.speak("The CO2 level just passed 1200 ppm.");
        const bytes = await collect(audio.stream);
        assert.equal(audio.mimeType, "audio/mpeg");
        assert.ok(bytes.byteLength > 1000, `got ${bytes.byteLength} bytes in ${Date.now() - started} ms`);
    });
});
