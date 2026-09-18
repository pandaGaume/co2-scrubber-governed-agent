# slots

The four providers of the architecture, published on the broker's multiplex
tunnel (`ws://<broker>/providers`, one shared WebSocket, envelopes keyed by
slot name) by `run-all.mjs`, which also starts the broker.

Today they are stubs (`lib/stub-provider.mjs`): each answers the MCP
handshake, lists its real tools with their JSON schemas, and echoes what it
receives, marked `stub: true`. Three behaviours are real even in the stubs,
because the demo rehearses them: the scrubber's speed envelope and MIN-FLOW
refusals, the twin's budget, and the station's registration rule (no
positive evaluate report id, no registration; no registration, no push).

Replacing a stub by the real thing changes nothing for the page, the policy
or the trace: same slot name, same tools, same broker.
