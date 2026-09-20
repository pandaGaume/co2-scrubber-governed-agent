/**
 * ElevenLabs behind `VoiceProvider`: the streaming text-to-speech endpoint
 * (`POST /v1/text-to-speech/{voiceId}/stream`, `xi-api-key` header, one
 * JSON body with the text and the model) and the voice list
 * (`GET /v1/voices`). The audio comes back as it is produced, MP3 at
 * 44.1 kHz 128 kbps unless the profile says otherwise.
 */
import type { AudioStream, SpeakOptions, Voice, VoiceProvider } from "../voice-provider.js";
import { httpFailure } from "../voice-provider.js";

export interface ElevenLabsOptions {
    model?: string;
    /** ElevenLabs output format code; MP3 44.1 kHz 128 kbps by default. */
    outputFormat?: string;
    baseUrl?: string;
}

const DEFAULT_MODEL = "eleven_flash_v2_5";
const DEFAULT_FORMAT = "mp3_44100_128";
const DEFAULT_BASE = "https://api.elevenlabs.io";

const mimeOf = (format: string): string => (format.startsWith("mp3") ? "audio/mpeg" : format.startsWith("pcm") ? "audio/pcm" : format.startsWith("opus") ? "audio/ogg" : "application/octet-stream");

export class ElevenLabsProvider implements VoiceProvider {
    readonly id = "elevenlabs";
    readonly model: string;
    private readonly outputFormat: string;
    private readonly baseUrl: string;

    constructor(
        private readonly apiKey: string,
        readonly defaultVoiceId: string,
        options: ElevenLabsOptions = {},
    ) {
        this.model = options.model ?? DEFAULT_MODEL;
        this.outputFormat = options.outputFormat ?? DEFAULT_FORMAT;
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    }

    async speak(text: string, options: SpeakOptions = {}): Promise<AudioStream> {
        const voiceId = options.voiceId ?? this.defaultVoiceId;
        const url = `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=${encodeURIComponent(this.outputFormat)}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "xi-api-key": this.apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
            body: JSON.stringify({ text, model_id: this.model }),
        });
        if (!response.ok || !response.body) throw await httpFailure(response, `ElevenLabs text-to-speech (voice ${voiceId}, model ${this.model})`);
        return { mimeType: response.headers.get("content-type")?.split(";")[0] ?? mimeOf(this.outputFormat), stream: response.body as ReadableStream<Uint8Array> };
    }

    async listVoices(): Promise<Voice[]> {
        const response = await fetch(`${this.baseUrl}/v1/voices`, { headers: { "xi-api-key": this.apiKey } });
        if (!response.ok) throw await httpFailure(response, "ElevenLabs voices");
        const body = (await response.json()) as { voices?: Array<{ voice_id: string; name: string; category?: string; labels?: Record<string, string> }> };
        return (body.voices ?? []).map((v) => ({ voiceId: v.voice_id, name: v.name, labels: { ...(v.labels ?? {}), ...(v.category ? { category: v.category } : {}) } }));
    }
}
