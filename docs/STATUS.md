# Status

Updated 2026-09-16.

| Piece | State |
|---|---|
| Factory chain on the twin (`npm run chain`: sweep, fit, evaluate) | runs; 100 simulated seconds in 5.4 s; verdict pass, alarm 30 s after the injection |
| Substrate packages importable from Node (`@spiky-panda/*`) | verified from packed tarballs on 2026-09-16; not yet published on npm |
| Container image (`docker/Dockerfile`) | written; not yet built (Docker daemon) |
| Broker policy | example written; to align with the broker's schema |
| Local demo: broker + dashboard + four stub slots (`npm run server`) | runs on 2026-09-18; the policy moment rehearses on the page (MIN-FLOW refusal in the trace) |
| Slots scrubber, twin, station, factory | stubs published; bodies to build (see each `slots/*/README.md`) |
| Tier 3 harness and provider adapters | to build |
| Dashboard | two levels served by the broker: the home (story + architecture) and the control room (story steps as buttons, cabin, slots, trace); 1990s pixel-art design in place (brief in `dashboard/DESIGN_BRIEF.md`, boards from Claude Design turned into static HTML/CSS; fonts still fetched from Google Fonts, to self-host before the shoot) |
| Cabin + scrubber graph, Babylon scene, parity with the on-board CO2 | to build |
| Firmware: `libmcpb` wiring, MIN-FLOW, `operating_point` | to build (CyanMycelium repository) |
| Video | to shoot (13 to 22 October 2026) |
