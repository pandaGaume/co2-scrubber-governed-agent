# Broker

`@cyanmycelium/mcp-broker` is the only way in. `security.json` says who may
call what, where, and the broker enforces it (since 2026-10-08, broker 1.8.1,
its development authorization: no authorization server, one token per role):

| role | who | may | is denied |
|---|---|---|---|
| `operator` | the commander's dashboard | everything | |
| `station` | Mother, the scenario player | everything | |
| `agent` | the night's agent, the procedure's executor | read, call, set the scrubber's speed | power off, the minimum-flow protection, a CO2 reading, the commander's answers and signatures, the register, the wording, stopping its own loop |
| `factory` | the factories, the forge, the Observer, the Supervisor | read, call | everything the agent is denied, and the speed |
| `monitor` | the medical monitoring tablet, the room's screens | read, call | everything the factories are denied |

A tool no line of `security.json` names is `mcp.tools.call`. A denied call
never reaches the slot: the client sees `policy deny` (rpc `-32001`), the
board never sees it. Below the policy the board refuses on its own (the
speed envelope, the run floor, MIN-FLOW), and the crew's physical switch sits
above everything.

## Turning it on

```bash
npm run broker:tokens
```

writes one token per role into `.env` (ignored by git) and
`MCP_BROKER_SECURITY_FILE=broker/security.json`; `npm run server` then starts
the broker with the policy. Each process reads its role's token
(`BROKER_TOKEN_<ROLE>`, `harness/lib/broker-auth.ts`); a role without its
token is refused (401), never lent another's. `npm run broker:tokens -- --off`
turns it off again and keeps the tokens.

A page holds its device's token: the server prints each page's link with it
(`#token=...`), the page keeps it in the browser and takes it out of the
address bar. Open the dashboard's link once on the commander's machine and
the monitoring link once on the tablet. A screen started with
`scripts/screen.mjs` takes it with `--token`. Clients are accepted from this
machine and from the local network (`"networks": ["lan"]`), never from a
public address.

`policy.example.json` is the earlier draft of the same rules, kept for the
documents that cite it; `security.json` is the policy in force.

Budgets for the agent's questions to the twin (points, simulated seconds per
point) are measured on the RS-385 montage (35 nodes) and must be remeasured
on the cabin twin.
