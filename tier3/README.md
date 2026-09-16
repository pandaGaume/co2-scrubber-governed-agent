# Tier 3: the harness and the provider

The agent is not a chat with tools. It is a decision loop: observe, look up
a learnt decision, otherwise ask the reasoner, authorize, execute through
the broker, observe the outcome, evaluate, remember. The loop is the V1 of
`spikypanda-harness` (`PolicyFallback.resolve`, `ExecutionAuthority` with a
`replayPolicy` per capability, `Experience` and `OutcomeEvaluation`).

Two pieces are added here: a real reasoner behind the profile's provider
(`{ baseUrl, apiKey, model, capabilities }`, two wire adapters: OpenAI-compatible
for Nemotron on Nebius, GPT and local servers; the Anthropic Messages API for
Claude), and a capability registry that lists the broker's tools as the
tier3 subject sees them (already filtered by the policy) and executes through
`tools/call`. `scrubber.power` is `never` for the agent; `motor.set_speed`
inside the envelope is `automatic`; registration is `approval-required`.

Same prompt, same tools, same scenario, same evaluation: swap the provider
and compare Nemotron, Claude, GPT and a local model on diagnosis, action
inside the envelope, calls refused by the policy, calls to the reasoner,
latency and tokens. That table is the second form of `evaluate`.

Status on 2026-09-16: to build.
