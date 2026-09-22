# Runtime events, over MCP, without touching MCP

*Written 2026-09-22, for the graph runtime in the substrate repository
(`@spiky-panda/mcp`, vendored here as `vendor/spiky-panda-mcp-0.1.1.tgz`). The
control room already reads what this describes; until the runtime publishes it,
the panel says so rather than drawing a call it has not seen.*

## Why

The control room must make one thing unmissable: **when the model is called.**
It is a fundamental of the hackathon, and today the page cannot show it.

It cannot because the call is not the page's. The station's harness calls the
model through `reasoner.decide` (`harness/providers/reasoner.ts`), and a call
made by one client of the broker is invisible to another:

- the broker keeps no trace. Its whole surface is `broker_info`,
  `providers_list`, `provider_status`, `broker_guide`, `broker_diagnose`, plus
  `broker://info`, `broker://providers` and five guide pages;
- the reasoner slot publishes only `reasoner://profile`. It computes the model,
  the family, the wire, the latency, the tokens, the raw exchange and what the
  model proposed before substitution, and it hands all of it to the one caller
  that asked. Nothing is kept and nothing is published.

So the runtime that runs the agent's graph has to say what happened, and every
client that cares reads it.

## The rule this must not break

**The protocol stays untouched.** No new JSON-RPC method, no new notification
kind, no bespoke frame, no field added to an envelope MCP defines. A client
that knows nothing of this document must be able to talk to the runtime, and a
client that knows about it must use nothing but what the MCP specification
already provides.

That is satisfiable, because MCP already has the two things needed: a resource
is an arbitrary document identified by a URI, and a resource template is an
RFC 6570 URI template. An event log is a document. A cursor is a query
parameter of a template. Nothing else is required.

What is used, and all of it is standard:

| need | MCP primitive | already in use here |
|---|---|---|
| read the log | `resources/read` | everywhere |
| read it from a cursor | a resource template, RFC 6570 | `speech://utterances/{id}` in the speech slot |
| learn the log exists | `resources/list` | everywhere |
| be told it changed | `notifications/resources/updated`, after `resources/subscribe` | **not** implemented by mcp-core 1.2.1 today |

The last row is the only gap, and it needs no invention either: subscription is
in the MCP specification. Until mcp-core implements it, a client polls the
resource with its cursor, which costs one small read every two seconds. The
control room is written that way and will switch to the notification the day it
exists, with no change to the payload and no change to this contract.

The payload below is the *content* of a resource. Content is free-form by
design: putting a JSON document in a resource is what resources are for, and it
adds nothing to the wire.

## The surface

Two entries in the runtime's existing `spk` namespace, beside `spk://registry`,
`spk://graph` and `spk://graph/state`.

### `spk://events`

The last events the runtime kept, oldest first.

```json
{
  "seq": 1841,
  "kept": 200,
  "dropped": 0,
  "events": [ { "seq": 1840, "at": "2026-09-22T19:41:02.317Z", "kind": "...", "...": "..." } ]
}
```

- `seq` is the sequence number of the most recent event the runtime has
  produced, whether or not it is still in `events`.
- `kept` is how many are held. A ring buffer; 200 is a sensible size.
- `dropped` is how many were evicted before a reader with an old cursor could
  read them. **A reader that sees `dropped` grow knows it missed something**, and
  can say so rather than showing a gap as if it were quiet. This field is the
  whole reason the envelope exists instead of a bare array.

### `spk://events{?since}`

The same document, with `events` limited to those whose `seq` is greater than
`since`. A plain RFC 6570 template, declared through `resources/templates/list`
like any other, read through `resources/read` with the expanded URI
(`spk://events?since=1830`).

`since` beyond `seq` returns an empty `events` and the current `seq`, which is
how a reader catches up after the runtime restarts.

## The event

One envelope, three required fields, and whatever the kind carries:

```json
{
  "seq": 1840,
  "at": "2026-09-22T19:41:02.317Z",
  "kind": "model.answered"
}
```

- `seq` strictly increases and never repeats within one runtime process.
- `at` is ISO 8601 with milliseconds.
- `kind` is dotted, lowercase, and namespaced by what produced it.

### What the control room needs

Three kinds. A runtime that emits others is free to; a reader ignores what it
does not know, which is what keeps this additive.

**`model.asked`** — the reasoner stage has sent a request and is waiting.

| field | what |
|---|---|
| `model`, `family`, `wire` | as `reasoner.describe` reports them |
| `conversationId`, `decisionId` | the harness's own ids, so a reader can pair a question with its answer |
| `asked` | one line of what was asked, for a human: the intention's description. Not the prompt |
| `node` | the graph node that asked, when the runtime knows it |

**`model.answered`** — the model replied.

| field | what |
|---|---|
| `conversationId`, `decisionId` | the pair from `model.asked` |
| `latencyMs` | measured by the provider, already computed |
| `tokens` | `{ prompt, completion, total }`, or `null` when the endpoint reports none |
| `answered` | one line of what came back, for a human |
| `proposedCapabilityId` | what the model proposed, **before** any substitution |
| `ranCapabilityId` | what the harness actually ran |

`proposedCapabilityId` and `ranCapabilityId` are the pair that matters most.
When they differ, the harness overrode the model, and that is the single most
interesting line the panel can show: it is the governance working, visible. The
control room draws it in the deny colour.

**`model.failed`** — no answer: the endpoint, the key, the network.

| field | what |
|---|---|
| `conversationId`, `decisionId` | the pair |
| `reason` | the failure, as a sentence |
| `latencyMs` | how long it waited before giving up |

## What an event must never carry

- **No key, no token, no authorization header.** The reasoner slot's own
  description already promises the key never leaves its process; an event log is
  not a way around that promise.
- **No full prompt and no raw exchange.** `reasoner.decide` returns those to its
  caller, which is the harness, and that is the right place for them. An event
  log is read by any client that can reach the runtime; a system prompt is not
  something to hand out by default. `asked` and `answered` are one line each,
  for a human, truncated by the runtime.
- **Nothing the runtime does not know.** A field the runtime cannot fill is
  absent, never guessed. The same rule the runtime's own `state.d.ts` states:
  *"Where the runtime does not carry a fact, it is absent rather than guessed."*

## Ordering, retention, restart

- Events are appended in the order they occur. `seq` is monotonic within a
  process and restarts at zero when the process does.
- A reader compares `seq` to its cursor; a `seq` lower than its cursor means the
  runtime restarted, and the reader resets rather than assuming a gap.
- Retention is a ring buffer. A reader that falls behind sees `dropped` grow.

## What the control room does with it

`dashboard/app.js`, in the section headed *The model*: it tries
`resources/read` on `spk://events` on each slot that may host the agent's
runtime (`twin` first, where `RuntimeBehavior` is mounted today, then
`reasoner`), keeps a cursor, and reads `model.*`. On an answer it shows the
latency, the tokens, the question, the reply, and the substitution when there
was one, and the tier3 badge marks the arrival once.

When no slot carries the log, it says exactly that and points here. It does not
draw a call it has not seen.

## What has to be built, and where

In the substrate repository, not here:

1. an event log on the runtime: an append method for the runtime's own stages, a
   ring buffer, `seq`, `dropped`;
2. the reasoner stage emitting `model.asked`, `model.answered`, `model.failed`;
3. `spk://events` and the template `spk://events{?since}` declared in
   `RuntimeBehavior._buildResources()`, beside `spk://graph/state`;
4. a version bump, then `node scripts/vendor-substrate.mjs <substrate root>` to
   repack `vendor/`.

Nothing in steps 1 to 3 touches the protocol. They add one resource and one
template to a namespace that already has three resources.
