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
    /** When the floor was taken, so a holder that went away frees it. */
    takenAt?: number;
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
/**
 * Longest a single utterance may hold the floor before it is treated as
 * abandoned.
 *
 * A page closed mid-sentence never reports it played, and the room must not
 * stay silent for its sake: this is the whole cost of the rule, so it is kept
 * short. Twenty seconds is longer than any line this demo speaks and short
 * enough that a lost holder is a hiccup rather than a silence.
 */
const FLOOR_MS = 20_000;
/** Prefix of the refusal that means "come back", not "skip it". An output
    that sees it leaves the utterance pending and tries again. */
export const FLOOR_BUSY = "speech:floor-busy";

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

    /**
     * An output claims an utterance before playing it; the first wins, the
     * others are refused and skip it.
     *
     * It also claims **the floor**. Claiming one utterance only stopped the
     * same line being said twice; it did nothing about two outputs each
     * taking a different line and playing them over each other, which is what
     * two boards open at once actually sounded like. So a take is refused
     * while another output holds an utterance it has taken and not yet
     * reported played: there is one room and one voice in it.
     *
     * A floor is released when the holder says `played`, and on its own after
     * `FLOOR_MS`, because a page that is closed mid-sentence never says
     * anything again and must not silence the room for ever.
     */
    take(utteranceId: string, output: string): Utterance {
        const u = this.utterances.find((x) => x.utteranceId === utteranceId);
        if (!u) throw new Error(`unknown utterance ${utteranceId}`);
        if (u.takenBy && u.takenBy !== output) throw new Error(`${utteranceId} is already taken by ${u.takenBy}`);
        // An output that asks for a new line has finished the one before it,
        // whether or not it managed to say so: a holder that moved on is not a
        // holder. This is what keeps a missed `played` from costing the full
        // timeout every time.
        this.release(output);
        const holder = this.speaking(output);
        // Two refusals, and an output must tell them apart: this line is
        // already someone else's (skip it, they are saying it) or the room is
        // busy with another line (come back, nobody has said this one yet).
        // Conflating them dropped the second kind on the floor for ever.
        if (holder) throw new Error(`${FLOOR_BUSY}: ${holder.output} is speaking (${holder.utteranceId}); one voice in the room at a time`);
        u.takenBy = output;
        u.takenAt = Date.now();
        return u;
    }

    /** Frees whatever floor this output still held. */
    private release(output: string): void {
        for (const u of this.utterances) if (u.takenBy === output && u.takenAt) u.takenAt = undefined;
    }

    /** The output that holds the floor, if it is not `output` itself. */
    private speaking(output: string): { output: string; utteranceId: string } | null {
        const now = Date.now();
        for (const u of this.utterances) {
            if (!u.takenBy || u.takenBy === output) continue;
            if (u.playedBy?.length) continue;
            if (u.takenAt && now - u.takenAt > FLOOR_MS) continue;   // the holder went away
            return { output: u.takenBy, utteranceId: u.utteranceId };
        }
        return null;
    }

    played(utteranceId: string, output: string, durationMs?: number): Utterance {
        const u = this.utterances.find((x) => x.utteranceId === utteranceId);
        if (!u) throw new Error(`unknown utterance ${utteranceId}`);
        (u.playedBy ??= []).push({ output, at: new Date().toISOString(), ...(durationMs !== undefined ? { durationMs } : {}) });
        u.takenAt = undefined;   // the floor is free
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
