# speech: text to speech as a capability of the broker

*Built on 2026-09-20 from the design given that day: a speech service the
tiers reach through MCP, an engine behind an interface (ElevenLabs first),
the key the operator's (BYOK), one voice per speaker, and synthesis kept
apart from audio output.*

## What it is

A tier that may call `speech.say` can talk to the people in the room. Which
engine says it, with which key and which voice, is the operator's profile,
not the caller's business: the agent discovers the capability on the broker
like any other tool, binds it once, and uses it like any other action of its
graph.

```
agent / twin / factory / station
        │  MCP: speech.say { text, voice?, priority? }
        ▼
┌─────────────────────────────────┐        ┌──────────────────────┐
│ speech (SpeechService)          │  queue │ audio outputs        │
│  say  stop  listVoices          │ ─────▶ │  the page (<audio>)  │
│  synthesize  played  describe   │        │  a speaker, a file,  │
│  speech://queue                 │ ◀───── │  a headset, a call   │
│  speech://utterances/{id}       │ played └──────────────────────┘
└───────────────┬─────────────────┘
                │ VoiceProvider.speak(text) -> AudioStream
      ┌─────────┼──────────┐
      ▼         ▼          ▼
  ElevenLabs  OpenAI    silent (tests, rehearsals)
```

## Tools

| tool | who calls it | what it does |
|---|---|---|
| `say { text, voice?, priority? }` | the tiers (the agent sees it) | synthesizes now, queues the utterance for the outputs; returns `{ utteranceId, voice, voiceId, provider, model, mimeType, bytes, sha256, synthesisMs, uri }`, never the audio |
| `stop { utteranceId? }` | the tiers | withdraws one utterance, or moves the stop mark past everything queued: outputs cut what is playing and skip the rest |
| `listVoices` | the operator, the page | the speakers of the profile with their engine voice, and the engine's own voices (ElevenLabs: `GET /v1/voices`) |
| `synthesize { text, voice? }` | a consumer that plays or files audio itself | the same as `say` without queueing |
| `take { utteranceId, output }` | an audio output | claims an utterance before playing it. Delivered once: the first output to take it plays it, a second one is refused and skips it (two pages open on one machine would otherwise say everything twice, which is what happened on 2026-09-20) |
| `played { utteranceId, output, durationMs? }` | an audio output | "I played it to the end": the utterance leaves the queue, the trace has who heard it and how long it took |
| `describe` | anyone | engine, model, speakers, whether a key is present, the profile file and its sha256, the queue |

The agent's catalogue (`tier3/lib/capabilities.ts`) offers `say` and `stop`
only; the other five are for outputs and the operator (`EXCLUDED`). The
policy (`broker/policy.example.json`) names `mcp.tools.speak` for `say`,
`stop` and `synthesize`, given to `operator` and `tier3`.

`priority`: `high` stops what was queued before it and plays next (a
CRITICAL announcement); `low` waits; `normal` by default. A text is 1500
characters at most: one message to a person, not a document.

## Resources

- `speech://queue`: `{ seq, stopMark, pending[], recent[] }`, what outputs
  still have to play (priority first, then arrival), no audio;
- `speech://utterances/{id}`: the audio bytes, base64, `audio/mpeg`
  (ElevenLabs, OpenAI) or `audio/wav` (silent). The slot keeps the last 32.

The slot server (`slots/lib/slot-server.ts`) learnt two things for this:
resource templates and binary content (`SlotBlob`).

## Synthesis is not output

`say` produces an utterance; playing it is another party's job. The page is
one output (`tier3/browser/audio-output.ts`: it polls the queue, plays
through one `<audio>` element in the slot's order, honours the stop mark, and
reports `played` with the measured duration; the `sound` button of the agent
bar turns it on, because a browser plays nothing before a click). A speaker
on the base, a headset, a file, a WebRTC call would be other outputs of the
same queue, and the service would not change.

## The station's voice on the agent page

The on-board AI the demo embodies is the `station` speaker (the profile's
default). `tier3/browser/station-voice.ts` says, in one short sentence each,
derived from the trace and never invented: the message from Earth as it
arrives (`Incoming from Earth.` and its first sentence; a change of the
world is stated as such), what the model or the script proposes as soon as
it is proposed (the first sentence of its answer; the system prompt asks the
model to begin every answer with one sentence under twenty words for the
voice), the twin's answer with its numbers, what the board did or refused, a
stop by the harness, and the first sentence of the report to the crew. With
the sound on, the voice paces the loop: the page waits until what was said
has been heard before the next decision (`heard()`), so the lit stages and
the voice stay together. `?voice=0` keeps it quiet, `?speaker=twin` changes
the speaker. On the first event with the scripted agent: six sentences, 26 s.

## The engine is a provider

```ts
interface VoiceProvider {
    readonly id: string;           // "elevenlabs" | "openai" | "silent" | ...
    readonly model: string;
    readonly defaultVoiceId: string;
    speak(text: string, options?: { voiceId?: string }): Promise<AudioStream>;  // { mimeType, stream }
    listVoices(): Promise<Voice[]>;
}
```

- `providers/elevenlabs.ts`: `POST /v1/text-to-speech/{voiceId}/stream`
  (`xi-api-key`, `model_id`, `output_format=mp3_44100_128`), the audio
  streamed back as it is produced; `GET /v1/voices`.
- `providers/openai.ts`: `POST /v1/audio/speech` (Bearer, `gpt-4o-mini-tts`,
  MP3). Written to the published API, not run yet (no key here).
- `providers/silent.ts`: no engine, no key, no network: a WAV of silence as
  long as the text would take (2.7 words per second, 0.6 s at least). The
  tests and the rehearsals run on it; every answer says `provider: silent`.

Kokoro, a local engine, or anything else is a file in `providers/` and a
name in the profile.

## Configuration: `profiles/voice.json`

```json
{
    "voice": {
        "provider": "elevenlabs",
        "apiKey": "${ELEVENLABS_API_KEY}",
        "voiceId": "eWc2pftlLqhJtXnPQknh",
        "model": "eleven_flash_v2_5",
        "outputFormat": "mp3_44100_128",
        "defaultVoice": "agent",
        "voices": { "agent": "eWc2pftlLqhJtXnPQknh", "twin": "JBFqnCBsd6RMkjVDRZzb", "factory": "JBFqnCBsd6RMkjVDRZzb", "station": "eWc2pftlLqhJtXnPQknh" }
    }
}
```

`apiKey` is `${NAME}`: the key is read from the environment variable of that
name when the slot starts (`.env`, ignored by git; `.env.example` lists the
name) and the file never holds it. `voices` gives one engine voice per
speaker, so each tier has its own; `say { voice: "twin" }` picks it, and a
raw engine identifier is accepted too. `SPEECH_PROFILE` names another file;
`SPEECH_PROVIDER` overrides the provider (`silent` for the tests).

Without a key the slot still publishes: `describe` answers `ready: false`
with the reason, and `say` refuses with the same text. Nothing is faked.

## Verified on 2026-09-20

Through the broker, on `silent`: `tests/speech.test.ts` (8 tests: describe,
say and the queue, the audio resource as a RIFF/WAVE blob of the announced
size, played, one voice per speaker and an unknown one refused, high
priority that interrupts and stop, listVoices, the agent's catalogue with
`say` and `stop` only). On the page: two utterances from two speakers
queued by another client, played by the page in order (5.6 s and 4.6 s, the
silent lengths) and reported back as `played` by `page`.

Through ElevenLabs, the key in `.env` (same day, later): the test that speaks
through it passes (9/9 with the key); on the page, the two speakers with
their own voice, MP3 back in 349 ms and 343 ms of synthesis (89 906 and
60 649 bytes for one sentence each), played by the page in 5.7 s and 3.9 s
and reported `played`. One finding: a key restricted to text-to-speech has
no `voices_read` permission, so the engine answers 401 to `GET /v1/voices`;
`listVoices` then returns the profile's speakers with `engine: []` and the
engine's refusal in `engineError`, and everything else works. The two voice
identifiers of the profile were not checked against the account's list for
that reason; they speak, which is the check that matters.
