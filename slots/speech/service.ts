/**
 * The speech service, independent of the engine: who may speak with which
 * voice, the queue the audio outputs read, the utterances kept for them, and
 * what a caller gets back (never the audio itself: an identifier and a URI,
 * so a language model's tool result stays a few lines).
 *
 * Synthesis and output are two things. `say` and `synthesize` produce an
 * utterance (bytes in memory, `speech://utterances/<id>`); `say` also puts
 * it on the queue (`speech://queue`), and whatever plays audio (the page's
 * `<audio>` today; a speaker, a headset, a file, a call tomorrow) reads the
 * queue, plays what it has not played, and says so with `played`. `stop`
 * moves the stop mark past everything queued: outputs cut what is playing
 * and skip the rest.
 *
 * Voices belong to speakers, not to the service: the profile maps a speaker
 * (`agent`, `twin`, `factory`, `station`) to an engine voice, so each tier
 * can have its own, and `say { voice: "twin" }` picks it. A raw engine voice
 * identifier is accepted too.
 */
import { createHash } from "node:crypto";
import type { VoiceProvider } from "./voice-provider.js";
import { collect } from "./voice-provider.js";

export type Priority = "low" | "normal" | "high";

export interface Utterance {
    utteranceId: string;
    seq: number;
    text: string;
    /** The speaker asked for (`agent`, `twin`, ...) or the raw voice identifier. */
    voice: string;
    voiceId: string;
    provider: string;
    model: string;
    priority: Priority;
    mimeType: string;
    bytes: number;
    sha256: string;
    synthesisMs: number;
    at: string;
    /** Set by `say`; `synthesize` leaves it false and the outputs ignore the utterance. */
    queued: boolean;
    /** The output that took it: an utterance is delivered once (two pages on one machine would say everything twice). */
    takenBy?: string;
    playedBy?: Array<{ output: string; at: string; durationMs?: number }>;
}

export interface SpeechServiceOptions {
    /** speaker name -> engine voice identifier */
    voices?: Record<string, string>;
    defaultVoice?: string;
    /** How many utterances stay readable; older ones are dropped. */
    keep?: number;
}

const MAX_TEXT = 1500;
const PRIORITIES: Priority[] = ["low", "normal", "high"];

export class SpeechService {
    private readonly audio = new Map<string, Uint8Array>();
    private readonly utterances: Utterance[] = [];
    private seq = 0;
    /** Outputs skip every utterance whose `seq` is at or below this mark. */
    private stopMark = 0;
    readonly voices: Record<string, string>;
    readonly defaultVoice: string;
    private readonly keep: number;

    constructor(
        readonly provider: VoiceProvider,
        options: SpeechServiceOptions = {},
    ) {
        this.voices = { ...(options.voices ?? {}) };
        this.defaultVoice = options.defaultVoice ?? Object.keys(this.voices)[0] ?? provider.defaultVoiceId;
        if (!this.voices[this.defaultVoice] && Object.keys(this.voices).length === 0) this.voices[this.defaultVoice] = provider.defaultVoiceId;
        this.keep = options.keep ?? 32;
    }

    /** The engine voice for a speaker name or a raw identifier. */
    resolveVoice(voice: string | undefined): { voice: string; voiceId: string } {
        const name = voice ?? this.defaultVoice;
        const mapped = this.voices[name];
        if (mapped) return { voice: name, voiceId: mapped };
        // A raw engine identifier: letters, digits, a few separators, nothing that looks like prose.
        if (/^[A-Za-z0-9_-]{2,64}$/.test(name)) return { voice: name, voiceId: name };
        throw new Error(`unknown voice "${name}"; speakers: ${Object.keys(this.voices).join(", ")}`);
    }

    async synthesize(text: string, voice?: string, priority: Priority = "normal", queued = false): Promise<Utterance> {
        if (typeof text !== "string" || !text.trim()) throw new Error("text is required");
        if (text.length > MAX_TEXT) throw new Error(`text is ${text.length} characters; ${MAX_TEXT} at most (one message to a person, not a document)`);
        if (!PRIORITIES.includes(priority)) throw new Error(`priority must be one of ${PRIORITIES.join(", ")}`);
        const resolved = this.resolveVoice(voice);
        const started = Date.now();
        const audio = await this.provider.speak(text, { voiceId: resolved.voiceId });
        const bytes = await collect(audio.stream);
        const synthesisMs = Date.now() - started;
        if (bytes.byteLength === 0) throw new Error(`${this.provider.id} returned no audio`);
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const seq = ++this.seq;
        const utterance: Utterance = {
            utteranceId: `u${seq.toString().padStart(4, "0")}-${sha256.slice(0, 8)}`,
            seq,
            text,
            voice: resolved.voice,
            voiceId: resolved.voiceId,
            provider: this.provider.id,
            model: this.provider.model,
            priority,
            mimeType: audio.mimeType,
            bytes: bytes.byteLength,
            sha256,
            synthesisMs,
            at: new Date().toISOString(),
            queued,
        };
        // A high priority interrupts: everything before it is stopped, it plays next.
        if (queued && priority === "high") this.stopMark = seq - 1;
        this.utterances.push(utterance);
        this.audio.set(utterance.utteranceId, bytes);
        while (this.utterances.length > this.keep) {
            const dropped = this.utterances.shift();
            if (dropped) this.audio.delete(dropped.utteranceId);
        }
        return utterance;
    }

    say(text: string, voice?: string, priority: Priority = "normal"): Promise<Utterance> {
        return this.synthesize(text, voice, priority, true);
    }

    /** Stops one utterance (removes it from what outputs will play) or everything queued so far. */
    stop(utteranceId?: string): { stopMark: number; stopped: string[] } {
        if (utteranceId) {
            const u = this.utterances.find((x) => x.utteranceId === utteranceId);
            if (!u) throw new Error(`unknown utterance ${utteranceId}`);
            u.queued = false;
            return { stopMark: this.stopMark, stopped: [utteranceId] };
        }
        const stopped = this.pending().map((u) => u.utteranceId);
        this.stopMark = this.seq;
        return { stopMark: this.stopMark, stopped };
    }

    /** An output claims an utterance before playing it; the first wins, the others are refused and skip it. */
    take(utteranceId: string, output: string): Utterance {
        const u = this.utterances.find((x) => x.utteranceId === utteranceId);
        if (!u) throw new Error(`unknown utterance ${utteranceId}`);
        if (u.takenBy && u.takenBy !== output) throw new Error(`${utteranceId} is already taken by ${u.takenBy}`);
        u.takenBy = output;
        return u;
    }

    played(utteranceId: string, output: string, durationMs?: number): Utterance {
        const u = this.utterances.find((x) => x.utteranceId === utteranceId);
        if (!u) throw new Error(`unknown utterance ${utteranceId}`);
        (u.playedBy ??= []).push({ output, at: new Date().toISOString(), ...(durationMs !== undefined ? { durationMs } : {}) });
        return u;
    }

    /** What outputs still have to play, in order (priority first, then arrival). */
    pending(): Utterance[] {
        const rank = (p: Priority) => PRIORITIES.indexOf(p);
        return this.utterances.filter((u) => u.queued && u.seq > this.stopMark && !u.takenBy && !u.playedBy?.length).sort((a, b) => rank(b.priority) - rank(a.priority) || a.seq - b.seq);
    }

    queue(): { seq: number; stopMark: number; pending: Utterance[]; recent: Utterance[] } {
        return { seq: this.seq, stopMark: this.stopMark, pending: this.pending(), recent: this.utterances.slice(-8) };
    }

    audioOf(utteranceId: string): { mimeType: string; bytes: Uint8Array } | undefined {
        const u = this.utterances.find((x) => x.utteranceId === utteranceId);
        const bytes = this.audio.get(utteranceId);
        return u && bytes ? { mimeType: u.mimeType, bytes } : undefined;
    }

    utterance(utteranceId: string): Utterance | undefined {
        return this.utterances.find((x) => x.utteranceId === utteranceId);
    }
}
