/**
 * The engine behind the speech service, as the service sees it: a text goes
 * in, an audio stream comes out. ElevenLabs is one provider; a local engine,
 * OpenAI, Kokoro or anything else is another, behind the same two methods.
 * The service (queue, voices per speaker, the trace) never knows which one
 * it holds; the profile decides (BYOK: the key is the operator's, read from
 * the environment, never stored here).
 */

export interface AudioStream {
    /** `audio/mpeg`, `audio/wav`, ... */
    mimeType: string;
    stream: ReadableStream<Uint8Array>;
}

export interface SpeakOptions {
    /** The engine's voice identifier; the provider's default when absent. */
    voiceId?: string;
}

export interface Voice {
    voiceId: string;
    name: string;
    /** Free text from the engine: language, gender, use case. */
    labels?: Record<string, string>;
}

export interface VoiceProvider {
    /** `elevenlabs`, `openai`, `silent`, ... as the trace names it. */
    readonly id: string;
    readonly model: string;
    readonly defaultVoiceId: string;
    speak(text: string, options?: SpeakOptions): Promise<AudioStream>;
    listVoices(): Promise<Voice[]>;
}

/** Drains a stream into one buffer (the store keeps utterances whole; a speaker or a file could consume the stream instead). */
export async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const parts: Uint8Array[] = [];
    let total = 0;
    const reader = stream.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        total += value.byteLength;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.byteLength;
    }
    return out;
}

/** The text of an HTTP error, kept short, for a refusal the caller can read. */
export async function httpFailure(response: Response, what: string): Promise<Error> {
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
    return new Error(`${what}: HTTP ${response.status} ${response.statusText}${detail ? ` ${detail}` : ""}`);
}
