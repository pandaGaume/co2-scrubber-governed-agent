/**
 * The provider with no engine behind it: silence, as long as the text would
 * take to say (about 2.7 words per second, 0.6 s at least), as a small WAV
 * (8 kHz, 8-bit, mono). It costs nothing and needs no key, so the queue,
 * the outputs and the trace can be rehearsed and tested without spending a
 * character of anyone's quota. It says what it is: `provider: silent` in
 * every answer, and the page shows the utterance as text.
 */
import type { AudioStream, SpeakOptions, Voice, VoiceProvider } from "../voice-provider.js";

const SAMPLE_RATE = 8000;
const WORDS_PER_SECOND = 2.7;
const MIN_SECONDS = 0.6;

export function estimateSeconds(text: string): number {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(MIN_SECONDS, words / WORDS_PER_SECOND);
}

/** A PCM WAV of silence: 44-byte header, then samples at the unsigned 8-bit midpoint. */
export function silentWav(seconds: number): Uint8Array {
    const samples = Math.round(seconds * SAMPLE_RATE);
    const out = new Uint8Array(44 + samples);
    const view = new DataView(out.buffer);
    const ascii = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
    };
    ascii(0, "RIFF");
    view.setUint32(4, 36 + samples, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE, true); // byte rate: 1 byte per sample
    view.setUint16(32, 1, true); // block align
    view.setUint16(34, 8, true); // bits per sample
    ascii(36, "data");
    view.setUint32(40, samples, true);
    out.fill(128, 44);
    return out;
}

export class SilentProvider implements VoiceProvider {
    readonly id = "silent";
    readonly model = "none";
    readonly defaultVoiceId = "silence";

    async speak(text: string, _options: SpeakOptions = {}): Promise<AudioStream> {
        const bytes = silentWav(estimateSeconds(text));
        return { mimeType: "audio/wav", stream: new ReadableStream<Uint8Array>({ start: (c) => (c.enqueue(bytes), c.close()) }) };
    }

    async listVoices(): Promise<Voice[]> {
        return [{ voiceId: "silence", name: "silence", labels: { note: "no engine: silence sized to the text" } }];
    }
}
