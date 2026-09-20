/**
 * OpenAI's speech endpoint behind `VoiceProvider` (`POST /v1/audio/speech`,
 * Bearer key, MP3 back). Written to the published API; not run yet, no key
 * in this repository's environment. The voices are the fixed names the API
 * documents, so `listVoices` needs no call.
 */
import type { AudioStream, SpeakOptions, Voice, VoiceProvider } from "../voice-provider.js";
import { httpFailure } from "../voice-provider.js";

const DEFAULT_MODEL = "gpt-4o-mini-tts";
const DEFAULT_BASE = "https://api.openai.com/v1";
const VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];

export class OpenAiProvider implements VoiceProvider {
    readonly id = "openai";
    readonly model: string;
    private readonly baseUrl: string;

    constructor(
        private readonly apiKey: string,
        readonly defaultVoiceId: string = "alloy",
        options: { model?: string; baseUrl?: string } = {},
    ) {
        this.model = options.model ?? DEFAULT_MODEL;
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    }

    async speak(text: string, options: SpeakOptions = {}): Promise<AudioStream> {
        const voice = options.voiceId ?? this.defaultVoiceId;
        const response = await fetch(`${this.baseUrl}/audio/speech`, {
            method: "POST",
            headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: this.model, voice, input: text, response_format: "mp3" }),
        });
        if (!response.ok || !response.body) throw await httpFailure(response, `OpenAI speech (voice ${voice}, model ${this.model})`);
        return { mimeType: "audio/mpeg", stream: response.body as ReadableStream<Uint8Array> };
    }

    async listVoices(): Promise<Voice[]> {
        return VOICES.map((name) => ({ voiceId: name, name }));
    }
}
