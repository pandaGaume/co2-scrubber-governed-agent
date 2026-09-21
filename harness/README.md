# harness: the generic loop, augmented by its tools

*Started on 2026-09-21 (`docs/factory-harness-plan.fr.md`, `docs/factory-harness.fr.md`). The one harness of the demo, the twelve-stage loop of `@spiky-panda/harness`, with what every agent of the demo needs to reach a broker and a model. The factory is this loop with the workshop's tools; Tier 3 is this loop with the habitat's tools.*

## What lives here, and the rule

| folder | content | who imports it |
|---|---|---|
| `lib/` | what every agent shares: the broker client (`broker.ts`, `mcp-http.ts`: one MCP session per slot, the three outcomes completed, refused, denied), the `Provider` and profile types (`provider.ts`), what the model adapters have in common (`llm-common.ts`: tool names, families, keys, the decision from an answer), one text with no tools (`compose.ts`) | `tier3/`, `slots/reasoner`, `providers/`, the factory, the tests |
| `providers/` | the provider implementations only: the model adapters (`anthropic.ts`, `openai-compatible.ts`), the `reasoner` slot client (`reasoner.ts`), the scripted agents (`scripted.ts`) | `tier3/`, `slots/reasoner`, the factory |
| `core/` (F4) | the constructor's own pieces: the workspace observer, the builder guard, the task evaluator, the recipes, the manifest, the runner | the factory slot, the container's `build` job |
| `topics/<topic>/` (F5) | a tool set, a prompt, a validator per topic (`graph`, `onnx`; `code`, `3d` later) | `core/` |
| `prompts/`, `scripted/` (F4, F5) | `FACTORY_PROMPT`, one prompt per topic; one scripted builder per topic, so the loop runs without a model | `core/`, the tests |

**No duplication with `tier3/`.** What is generic moves up here and `tier3/` imports it (decision of 2026-09-21: the providers and the broker client were moved, not copied). What stays under `tier3/` is the habitat's own: its observer (the cabin state), its evaluator, its capability lists (`EXCLUDED`, `APPROVAL_REQUIRED`, `PROTECTED_NEVER`), its agent, its runner and its page. When the factory needs a general form of one of those (an agent built from any observer, evaluator and guard), that form is written here and `tier3/` switches to it; a copy is never the answer. This folder is extracted to `Gaume/spikypanda-harness` as a package once the factory has run on it.

## Where the catalogue is

The broker holds the registry of services (`providers_list`, then `tools/list` of each slot): that is what the loop turns into capabilities. The catalogue of node types (what the substrate can compose) is the studio's MCP server, `@spiky-panda/mcp`, published as the `spikypanda` slot: `registry_list_nodes`, `registry_describe_node`, and `registry_search` (since 2026-09-21: node types by the outputs a plan needs, the capabilities, the words of the purpose; `searchSignatures` of the core). There is no registry slot in the demo.
