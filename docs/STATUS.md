# Status

Updated 2026-09-16.

| Piece | State |
|---|---|
| Factory chain on the twin (`npm run chain`: sweep, fit, evaluate) | runs; 100 simulated seconds in 5.4 s; verdict pass, alarm 30 s after the injection |
| Substrate packages importable from Node (`@spiky-panda/*`) | verified from packed tarballs on 2026-09-16; not yet published on npm |
| Container image (`docker/Dockerfile`) | written; not yet built (Docker daemon) |
| Broker policy | example written; to align with the broker's schema |
| Slots scrubber, twin, station, factory | to build (see each `slots/*/README.md`) |
| Tier 3 harness and provider adapters | to build |
| Dashboard | to build |
| Cabin + scrubber graph, Babylon scene, parity with the on-board CO2 | to build |
| Firmware: `libmcpb` wiring, MIN-FLOW, `operating_point` | to build (CyanMycelium repository) |
| Gateway host of the NVIDIA profile: Jetson TX1 (JetPack 4.6, Node 22 in Docker) | on hand, still boxed; bring-up (flash if needed, Docker, network with the board) before 13 October |
| Video | to shoot (13 to 22 October 2026) |
