# slots

The providers of the architecture (scrubber, twin, station, factory, the
`reasoner` that holds the model, `speech`, text to speech as a capability, see
`speech/README.md`, and under `tools/` the workshop's slots the factory builds
with, `workspace` and `model`, see `docs/factory-harness.fr.md`), published on the broker's multiplex
tunnel (`ws://<broker>/providers`, one shared WebSocket, envelopes keyed by
slot name) by `run-all.ts`, which also starts the broker. Everything here is
TypeScript, compiled to `dist/` by `npm run build`.

Each slot is a server of `@cyanmycelium/mcp-core` (`lib/slot-server.ts`):
one `McpBehaviorBase` for the slot's tools and resources, `McpServerBuilder`
with `MultiplexTransport`, an initializer, and the grammar resolver. The
broker relays every client's `initialize` to the slot as is, so the slot
resolves a grammar per session (below). `stub: true` marks a slot with no
body behind it; `twin` is real since 19 September 2026.

Three behaviours are real even in the stubs, because the demo rehearses
them: the scrubber's speed envelope and MIN-FLOW refusals, the twin's budget,
and the station's registration rule (no positive evaluate report id, no
registration; no registration, no push).

Replacing a stub by the real thing changes nothing for the page, the policy
or the trace: same slot name, same tools, same broker.

## Grammars: the same tools, described per audience and per language

The wording a model reads for a tool is not the same for every model, and
not the same in every language. mcp-core's grammar layer patches `title`,
`description` and the field descriptions of `tools/list` per session, from
the client's family (`clientInfo.name`) and locale (`capabilities.locale`).
The wordings are files, so a reviewer can change one without touching code:

```
slots/<slot>/grammars/<agent>/<locale>.json      key <agent>:<locale>
```

| Family | Matched on `clientInfo.name` | Wording hypothesis (measured by the scorecard, not a fact) |
|---|---|---|
| `nemotron` | nemotron, nvidia | short and imperative; units and bounds inside the field descriptions |
| `gpt` | gpt, openai | one more sentence of context per tool |
| `claude` | claude, anthropic | longer descriptions, titles carried |
| `gemini` | gemini, google | enumerations and defaults repeated in the text |
| `default` | anything else | the English written in the behavior next to the schema; `default/fr.json` is the French baseline |

The resolver's chain narrows from the most specific key (`claude:fr-ca`,
`claude:fr`, `default:fr-ca`, `default:fr`, `claude:en`, `default:en`); the
first key some layer holds wins. A file declares only what it changes: the
loader composes `<agent>:<locale>` as `default:<locale>` overlaid with the
agent's file, and refuses a file naming a tool or a field the slot does not
have. The locale comes from `capabilities.locale`, then `SLOT_LOCALE`, then
`en`.

A session's `initialize` answer ends its `instructions` with `grammar: <key>`
(or `none`), so a client can record which wording it was given; the Tier 3
runner puts it in the trace and the scorecard. Each slot also serves
`<slot>://grammars`, the list of grammar files it loaded with their sha256.

At runtime, `McpGrammarBehavior` is on every slot: `grammar_set` with the
key a session resolved rewrites a wording live, and mcp-core notifies the
session (`tools/list_changed`). These tools are the operator's; the policy
example denies them to `tier3`, and the harness never registers them as
capabilities.

Two limits, stated: the client's family is self-declared, so a grammar is
a formulation tool, not a security one (the policy and the firmware
authorize); and mcp-core keeps one session grammar per server instance,
while the broker funnels every client of a slot into that instance, so two
clients of different families on one slot share the grammar of the last
`initialize`. In the demo the scenario runner is the only client of the
slots during a run and reads the catalogue right after its own
`initialize`. Field descriptions inside an array of objects (`crew.count`)
need mcp-core 1.0.1.

`tests/grammars.test.ts` starts a broker and the four slots on a port of
their own and checks every family and locale against the files, then the
live rewrite.

## Where a slot's words live (since 2026-09-21)

A slot's code declares its structure: the tool names and their input
schemas, the resource URIs and how to read them, the state. Its words (the
slot's one-line description, the usage note a session receives, each tool's
title, description and property wording, each resource's name and
description) live in `grammars/default/en.json` (the `server`, `tools` and
`resources` sections of an mcp-core grammar), and their translations in
`grammars/default/<locale>.json`; the model families overlay theirs. The
mechanism is mcp-core's (1.0.2: `loadGrammarDirectory`, `withWordingRule`,
the `server` section, `_meta.grammar`); the server refuses a text written
both inline and in the file, and a tool or a resource with no text anywhere,
and a slot that fails to start says which one and why. The older slots (scrubber, twin, station,
reasoner, speech) still carry their English inline; the workshop's slots and
the factory's front carry none.
