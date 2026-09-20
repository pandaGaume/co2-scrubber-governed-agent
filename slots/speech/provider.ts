/**
 * The `speech` slot: text to speech as a capability of the broker. A tier
 * that may call `speech.say` can talk to the people in the room; which
 * engine says it, with which key and which voice, is the operator's profile
 * (`profiles/voice.json`), not the caller's business.
 *
 * Tools: `say` (synthesize and queue for the outputs), `stop`, `listVoices`,
 * `synthesize` (audio without queueing, for a consumer that plays or files it
 * itself), `take` (an output claims an utterance: delivered once), `played`
 * (an output reports it played it), `describe`.
 * Resources: `speech://queue`, `speech://utterances/{id}` (the audio bytes),
 * and the grammars the slot server adds.
 *
 * The profile's `voice` section: `provider` (`elevenlabs`, `openai`,
 * `silent`), `apiKey` (`${ENV_NAME}`: the key is read from the environment
 * when the slot starts, and the profile file carries the name only),
 * `voiceId` (the engine's default voice), `model`, and `voices`, one engine
 * voice per speaker (`agent`, `twin`, `factory`, `station`). `SPEECH_PROFILE`
 * names another file; `SPEECH_PROVIDER` overrides the provider (the tests
 * run on `silent`). Without a key the slot publishes, `describe` says it is
 * not ready, and `say` refuses; nothing is faked.
 */
import { existsSync } from "node:fs";
import { fromRoot, relativeToRoot } from "../../lib/paths.js";
import { errorMessage, readJson, sha256File } from "../../lib/files.js";
import { objectSchema, publishSlot, type PublishedSlot, type SlotBlob, type SlotTool } from "../lib/slot-server.js";
import { SpeechService, type Priority } from "./service.js";
import type { VoiceProvider } from "./voice-provider.js";
import { ElevenLabsProvider } from "./providers/elevenlabs.js";
import { OpenAiProvider } from "./providers/openai.js";
import { SilentProvider } from "./providers/silent.js";

export interface VoiceProfile {
    provider?: string;
    /** `${ENV_NAME}` or a literal (discouraged: the file is committed). */
    apiKey?: string;
    voiceId?: string;
    model?: string;
    outputFormat?: string;
    baseUrl?: string;
    /** speaker -> engine voice identifier */
    voices?: Record<string, string>;
    defaultVoice?: string;
}

export interface SpeechState {
    service: SpeechService | null;
    /** Why the engine could not be built (a missing key, an unknown provider); null when ready. */
    notReady: string | null;
    profile: { file: string; sha256: string } | null;
    requested: string;
}

const DEFAULT_PROFILE = "profiles/voice.json";
const UTTERANCE_TEMPLATE = "speech://utterances/{id}";

/** `${NAME}` becomes the environment variable's value; a missing one is an error naming the variable, never an empty key. */
function fromEnv(value: string | undefined, what: string): string | undefined {
    if (value === undefined) return undefined;
    const m = /^\$\{([A-Z0-9_]+)\}$/.exec(value.trim());
    if (!m) return value;
    const v = process.env[m[1]];
    if (!v) throw new Error(`${what}: the environment variable ${m[1]} is not set (put it in .env)`);
    return v;
}

export function buildProvider(voice: VoiceProfile, requested: string): VoiceProvider {
    switch (requested) {
        case "silent":
            return new SilentProvider();
        case "elevenlabs": {
            const apiKey = fromEnv(voice.apiKey, "elevenlabs");
            if (!apiKey) throw new Error("elevenlabs: no apiKey in the profile (expected \"${ELEVENLABS_API_KEY}\")");
            if (!voice.voiceId) throw new Error("elevenlabs: no voiceId in the profile");
            return new ElevenLabsProvider(apiKey, voice.voiceId, { model: voice.model, outputFormat: voice.outputFormat, baseUrl: voice.baseUrl });
        }
        case "openai": {
            const apiKey = fromEnv(voice.apiKey, "openai");
            if (!apiKey) throw new Error("openai: no apiKey in the profile (expected \"${OPENAI_API_KEY}\")");
            return new OpenAiProvider(apiKey, voice.voiceId, { model: voice.model, baseUrl: voice.baseUrl });
        }
        default:
            throw new Error(`unknown speech provider "${requested}" (elevenlabs, openai, silent)`);
    }
}

export function speechSlot(wsBase: string, log: (line: string) => void): PublishedSlot<SpeechState> {
    const profileFile = fromRoot(process.env.SPEECH_PROFILE ?? DEFAULT_PROFILE);
    const voice: VoiceProfile = existsSync(profileFile) ? (readJson<{ voice?: VoiceProfile }>(profileFile).voice ?? {}) : {};
    const requested = process.env.SPEECH_PROVIDER ?? voice.provider ?? "silent";
    const state: SpeechState = { service: null, notReady: null, profile: existsSync(profileFile) ? { file: relativeToRoot(profileFile), sha256: sha256File(profileFile) } : null, requested };
    try {
        const provider = buildProvider(voice, requested);
        state.service = new SpeechService(provider, { voices: voice.voices, defaultVoice: voice.defaultVoice });
        log(`[speech] provider ${provider.id}, model ${provider.model}, speakers ${Object.keys(state.service.voices).join(", ") || "(engine default)"}`);
    } catch (e) {
        state.notReady = errorMessage(e);
        log(`[speech] not ready: ${state.notReady}`);
    }

    const ready = (s: SpeechState): SpeechService => {
        if (!s.service) throw new Error(`speech is not ready: ${s.notReady ?? "no engine"}`);
        return s.service;
    };
    const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
    /** What a caller gets: the utterance without its audio. */
    const spoken = (u: ReturnType<SpeechService["utterance"]>) => (u ? { ...u, uri: UTTERANCE_TEMPLATE.replace("{id}", u.utteranceId) } : undefined);

    const voiceProperty = { type: "string", description: "Who speaks: a speaker name from the profile (agent, twin, factory, station) or an engine voice identifier; the profile's default when absent" };
    const tools: SlotTool<SpeechState>[] = [
        {
            name: "say",
            title: "Speak to the people in the room",
            description: "Say a short message aloud to the crew or the operator: it is synthesized now and played by the audio outputs in order. One or two sentences, in the language of the people listening; say what happened and what you did, with the numbers you were given. Returns the utterance identifier, never the audio.",
            inputSchema: objectSchema(
                {
                    text: { type: "string", description: "What to say, 1500 characters at most" },
                    voice: voiceProperty,
                    priority: { type: "string", enum: ["low", "normal", "high"], description: "high interrupts what is playing and goes first; low waits; normal by default" },
                },
                ["text"],
            ),
            handle: async (args, s) => spoken(await ready(s).say(String(args.text ?? ""), str(args.voice), (str(args.priority) as Priority | undefined) ?? "normal")),
        },
        {
            name: "stop",
            title: "Stop speaking",
            description: "Stop the audio outputs: one utterance by its identifier, or everything queued so far.",
            inputSchema: objectSchema({ utteranceId: { type: "string", description: "One utterance to withdraw; everything queued when absent" } }),
            handle: (args, s) => ready(s).stop(str(args.utteranceId)),
        },
        {
            name: "listVoices",
            title: "List the voices",
            description: "The speakers the profile names with their engine voice, and the voices the engine offers.",
            inputSchema: objectSchema({}),
            handle: async (_args, s) => {
                const service = ready(s);
                const base = { provider: service.provider.id, model: service.provider.model, defaultVoice: service.defaultVoice, speakers: service.voices };
                // The speakers are always known; the engine's list may be refused (a key without the voices permission) and says so.
                try {
                    return { ...base, engine: await service.provider.listVoices() };
                } catch (e) {
                    return { ...base, engine: [], engineError: errorMessage(e) };
                }
            },
        },
        {
            name: "synthesize",
            title: "Synthesize without playing",
            description: "Synthesize a text to audio and keep it (speech://utterances/{id}) without queueing it for the outputs: for a consumer that plays or files the audio itself.",
            inputSchema: objectSchema({ text: { type: "string", description: "What to synthesize, 1500 characters at most" }, voice: voiceProperty }, ["text"]),
            handle: async (args, s) => spoken(await ready(s).synthesize(String(args.text ?? ""), str(args.voice))),
        },
        {
            name: "take",
            title: "An output takes an utterance",
            description: "An audio output claims an utterance before playing it. Delivered once: the first output to take it plays it, a second one is refused and skips it.",
            inputSchema: objectSchema({ utteranceId: { type: "string" }, output: { type: "string", description: "Which output: page, speaker, headset, file" } }, ["utteranceId", "output"]),
            handle: (args, s) => spoken(ready(s).take(String(args.utteranceId ?? ""), String(args.output ?? "unknown"))),
        },
        {
            name: "played",
            title: "An output played an utterance",
            description: "An audio output (the page, a speaker) reports that it played an utterance to the end, with the measured duration.",
            inputSchema: objectSchema({ utteranceId: { type: "string" }, output: { type: "string", description: "Which output: page, speaker, headset, file" }, durationMs: { type: "number" } }, ["utteranceId", "output"]),
            handle: (args, s) => spoken(ready(s).played(String(args.utteranceId ?? ""), String(args.output ?? "unknown"), typeof args.durationMs === "number" ? args.durationMs : undefined)),
        },
        {
            name: "describe",
            title: "Describe the speech service",
            description: "The engine, its model, the speakers and their voices, whether a key is present, the profile file with its sha256, and the queue.",
            inputSchema: objectSchema({}),
            handle: (_args, s) => ({
                ready: s.service !== null,
                reason: s.notReady,
                provider: s.service?.provider.id ?? s.requested,
                model: s.service?.provider.model ?? null,
                defaultVoice: s.service?.defaultVoice ?? null,
                speakers: s.service?.voices ?? {},
                profile: s.profile,
                queue: s.service ? { pending: s.service.pending().length, seq: s.service.queue().seq } : null,
            }),
        },
    ];

    return publishSlot<SpeechState>({
        slot: "speech",
        description: "Text to speech for the people in the room: say, stop, list voices; the engine and the key are the operator's profile",
        instructions: {
            en: "Speak only what a person must hear now: one or two sentences, what happened and what you did, with the numbers you were given. Written reports go to the crew tool; speech is for the moment.",
            fr: "Ne dites à voix haute que ce qu'une personne doit entendre maintenant : une ou deux phrases, ce qui s'est passé et ce que vous avez fait, avec les chiffres qu'on vous a donnés. Les rapports écrits vont à l'outil de l'équipage ; la parole est pour l'instant présent.",
        },
        tools,
        resources: [
            {
                uri: "speech://queue",
                name: "Queue",
                description: "What the audio outputs still have to play (priority first), the stop mark, and the recent utterances; no audio",
                read: (s) => (s.service ? s.service.queue() : { seq: 0, stopMark: 0, pending: [], recent: [], notReady: s.notReady }),
            },
            {
                uri: UTTERANCE_TEMPLATE,
                name: "Utterance audio",
                description: "The audio bytes of one utterance, base64, in the engine's format (audio/mpeg or audio/wav)",
                template: true,
                mimeType: "audio/*",
                read: (s, uri): SlotBlob | undefined => {
                    const id = uri.slice(UTTERANCE_TEMPLATE.indexOf("{"));
                    const a = s.service?.audioOf(id);
                    return a ? { kind: "blob", mimeType: a.mimeType, base64: Buffer.from(a.bytes).toString("base64") } : undefined;
                },
            },
        ],
        state,
        wsBase,
        log,
        stub: false,
        version: "0.1.0",
    });
}
