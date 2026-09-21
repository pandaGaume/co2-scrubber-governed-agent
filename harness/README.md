# harness: the generic loop, augmented by its tools

*Started on 2026-09-21 (`docs/factory-harness-plan.fr.md`, `docs/factory-harness.fr.md`). The one harness of the demo, the twelve-stage loop of `@spiky-panda/harness`, with what every agent of the demo needs to reach a broker and a model. The factory is this loop with the workshop's tools; Tier 3 is this loop with the habitat's tools.*

## What lives here, and the rule

| folder | content | who imports it |
|---|---|---|
| `lib/` | what every agent shares: the twelve-stage graph (`flow.ts`, moved from `tier3/lib` on 2026-09-21), the broker client (`broker.ts`, `mcp-http.ts`: one MCP session per slot, the three outcomes completed, refused, denied), the `Provider` and profile types (`provider.ts`), what the model adapters have in common (`llm-common.ts`: tool names, families, keys, the decision from an answer), one text with no tools (`compose.ts`) | `tier3/`, `slots/reasoner`, `providers/`, `core/`, the tests |
| `providers/` | the provider implementations only: the model adapters (`anthropic.ts`, `openai-compatible.ts`), the `reasoner` slot client (`reasoner.ts`), the scripted agents (`scripted.ts`) | `tier3/`, `slots/reasoner`, the factory |
| `core/` (F4, built 2026-09-21) | the loop for any agent (`agent.ts`: the runtime with its six services; `capabilities.ts`: a broker's tools as capabilities under a profile), and the constructor's own services: the workspace observer, the builder guard, the task evaluator, the task capabilities (`task.plan`, `task.done`), the recipes, the manifest, the runner (`runner.ts`: one task to the proposal), the task's shape (`task.ts`), what a topic is (`topic.ts`) | `tier3/` (the loop), the factory slot (F6), the container's `build` job (F7), the tests |
| `topics/<topic>/` | a tool set and a validator per topic, a prompt in F5 (`onnx` built; `graph` F5; `code`, `3d` later) | `core/` |
| `scripted/` | one scripted builder per topic, so the loop runs without a model (`onnx.ts`) | the tests, the container's CI job |
| `prompts/` (F5) | `FACTORY_PROMPT`, one prompt per topic | `core/` |
| `browser/` | the loop pages in the studio: what they share (`studio-loop.ts`: the stage highlight, the monitor tile, the toolbar; `loader.ts`: plugin, document, page), the factory's page (`factory-page.ts`, `factory-loader.ts`: it replays the steps its slot ran) the one reader of a slot's phrases (`words.ts`: `grammar://phrases` on the page's session, into an `McpGrammar`), and the words about a task (`factory-voice.ts`: the keys and values that fill the factory slot's phrases; `tier3/browser/station-voice.ts` does the same with the station's); built into `dashboard/agent/` by `scripts/build-agent-page.ts` | `tier3/browser`, the Control Board, the factory's page |

Every node of the loop, what it does in general and what it does at the station and at the factory: `docs/harness-stages.fr.md`.

**No duplication with `tier3/`.** What is generic moves up here and `tier3/` imports it (decision of 2026-09-21: the providers and the broker client were moved, not copied; then, for F4, the graph moved to `lib/flow.ts`, and `createAgent` and `buildCapabilities` took their general form in `core/`, `tier3/agent.ts` and `tier3/lib/capabilities.ts` calling them with the cabin's observer, evaluator, guard profile and capability lists). What stays under `tier3/` is the habitat's own: its observer (the cabin state), its evaluator, its capability lists (`EXCLUDED`, `APPROVAL_REQUIRED`, `PROTECTED_NEVER`) and crew capabilities, its guard profile, its scenario runner and its page. A copy is never the answer. This folder is extracted to `Gaume/spikypanda-harness` as a package once the factory has run on it.

## Where the catalogue is

The broker holds the registry of services (`providers_list`, then `tools/list` of each slot): that is what the loop turns into capabilities. The catalogue of node types (what the substrate can compose) is the studio's MCP server, `@spiky-panda/mcp`, published as the `spikypanda` slot: `registry_list_nodes`, `registry_describe_node`, and `registry_search` (since 2026-09-21: node types by the outputs a plan needs, the capabilities, the words of the purpose; `searchSignatures` of the core). There is no registry slot in the demo.
