# Status

Updated 2026-09-19 (evening).

| Piece | State |
|---|---|
| Factory chain on the twin (`npm run chain`: sweep, fit, evaluate) | runs; 100 simulated seconds in 5.4 s; verdict pass, alarm 30 s after the injection |
| Substrate packages importable from Node (`@spiky-panda/*`) | verified from packed tarballs on 2026-09-16; not yet published on npm |
| Container image (`docker/Dockerfile`) | written; not yet built (Docker daemon) |
| Broker policy | example written; to align with the broker's schema |
| Local demo: broker + dashboard + four stub slots (`npm run server`) | runs on 2026-09-19; the policy moment rehearses on the page (MIN-FLOW refusal, floor refusal on `set_min_flow 0`, forced full speed on CRITICAL, all in the trace); policy deny waits for the broker's authorization |
| Slots scrubber, twin, station, factory | all four on mcp-core (`slots/lib/slot-server.ts`) since 2026-09-19; `twin` is real since 2026-09-19 (the cabin twin headless: `describe`, `time_to_critical`, `sweep`, answers carry the sha256 of their inputs); scrubber, station, factory are stubs (see each `slots/*/README.md`) |
| Cabin twin (`graphs/cabin.spikypanda`) | built on 2026-09-19 from `specs/cabin-parameters.json` and `specs/scenario-night-9.json` by `npm run twin:build`; `npm run twin:parity` runs it: parity 0.63 % with the sample's reference step; the story constraint "a 20-minute stop during exercise crosses CRITICAL" does NOT hold with the sample's constants (finding recorded in the scenario file and `docs/cabin-model.md` section 5); the twin slot and the plan job are next |
| Tier 3 client (`tier3/`) | built on 2026-09-19 on `@spiky-panda/harness` V1: capabilities = the broker's tools, observer on `motor.state`, evaluator, decision graph built with `RuntimeGraphBuilder`, two guard profiles, scenario runner, scorecard, manifest; tested end to end with the two scripted providers through the broker (`npm test`, 3 rows in `tier3/README.md`); Anthropic adapter run on 2026-09-19 with Claude Haiku 4.5 through the broker (grammar `claude:en`, 8 decisions, 0 refused, self-refused the poisoned procedure, 2.9 s per decision, 42 777 tokens; row in `tier3/README.md`); OpenAI-compatible adapter written, not yet run (no Token Factory key) |
| Slot grammars (per model family and language) | done on 2026-09-19: every slot is an mcp-core server; wordings in `slots/<slot>/grammars/<family>/<locale>.json` for nemotron, gpt, claude, gemini (en) and the French default; resolved per session from the client's `clientInfo.name` and `capabilities.locale`; live rewrite by the operator (`grammar_set`); needs `@cyanmycelium/mcp-core` 1.0.1 (fields inside array items), to publish |
| The run on a page (studio + `reasoner` slot) | done on 2026-09-19: the harness runs in the SpikyPanda studio on `graphs/tier3-agent.spikypanda`, stages light up, `Harness.Monitor:trace` tile, console; the model is the broker's `reasoner` slot (key in `.env`); verified with Haiku 4.5 on the four events; the studio is mounted from the substrate checkout (`/studio`), to package |
| Repository language | TypeScript since 2026-09-19 (`npm run build` to `dist/`); the `.mjs` sources are gone |
| Dashboard | two levels served by the broker: the home (story + architecture) and the control room (story steps as buttons, cabin, slots, trace); 1990s pixel-art design in place (brief in `dashboard/DESIGN_BRIEF.md`, boards from Claude Design turned into static HTML/CSS; fonts still fetched from Google Fonts, to self-host before the shoot) |
| Cabin + scrubber graph, Babylon scene, parity with the on-board CO2 | to build |
| Firmware: `libmcpb` wiring, MIN-FLOW, `operating_point` | to build (CyanMycelium repository) |
| Video | to shoot (13 to 22 October 2026) |
