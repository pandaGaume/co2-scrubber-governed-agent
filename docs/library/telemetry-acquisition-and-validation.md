# Telemetry acquisition, provenance and validation

A usable telemetry record is a time series tied to an actual execution, device and source. Changing a speed, authorising a conversation or describing expected measurements does not create that record. This card documents the current demonstration services; the reasoner chooses which capabilities meet its objective.

## Sources and channels

| Channel or record | Meaning | Important limitation |
|---|---|---|
| `scrubber.motor.state` | current state reported by the connected scrubber slot | inspect whether the slot is physical or a stand-in and whether atmospheric readings are valid |
| `speed_percent` in a procedure log | observed device speed used by the configured logger | not a separate measurement of airflow or CO2 removal |
| `co2_lab_ppm`, `co2_habb_ppm` in the current mission log | simulated two-zone cabin concentrations driven by observed motor speed | not physical room CO2 measurements |
| `biomed.state` / session | monitored subjects, source and readiness | a simulated subject does not establish physical belt coverage |
| A reference simulator run | predictions under its encoded model | not evidence that a newly requested twin was built, independently validated or installed |

The executor announces the mixed source explicitly. A real motor can be part of a demonstration with simulated atmospheric dynamics, provided that provenance is retained. Never rename simulated concentration data as measured cabin air.

## What the current procedure logger does

`agent.procedure_execute` accepts a commissioning identifier, reads the station's authorised procedure, verifies the configured environment and current commander authority, and runs that procedure under device guards. It returns a run identifier. Its result is read with `agent.procedure_result`.

The configured environment is the Lab simulated cabin with the hatch closed. The host clock is configured by `SCENARIO_SECONDS_PER_MINUTE`; its default is two real seconds per simulated minute. This acceleration does not accelerate a real physical room or turn its simulated one-minute samples into higher-rate physical measurements. The executor reads device speed, advances the simulated cabin, records the channels and reports progress. A command refusal or an abort is an execution result to inspect, not a successful calibration sample.

The stored record identifies the mission, commissioning, devices, subjects, source, status, rows and report. Its persisted JSON has an integrity hash. `done`, `aborted` and `failed` are different outcomes. A run identifier alone says nothing about which outcome occurred.

## Data quality before fitting

Check time units and ordering, sampling intervals, missing or non-finite entries, channel definitions, source changes, actual accepted operating points, occupancy and activity changes, sensor validity and the procedure's abort report. The present graph preflight checks for a hashed JSON table with at least three finite numeric `minute` entries and a numeric residual bound. That minimum is an input-shape prerequisite, not a scientific sufficiency criterion. Three samples do not automatically identify several coupled parameters.

Keep timestamps and command changes aligned. When a speed changes, determine which interval the logger associates it with. The current executor records at the boundary the speed that drove the following simulated interval. Do not treat a refused request as if it drove that interval.

## Passing evidence to a factory

A new `factory.request` may name `telemetryRunId` to copy the completed authorised run's rows and device context. It cannot combine that reference with separately supplied data. The service refuses incomplete executions or a completed record without enough rows. Alternatively, genuinely available external telemetry can be supplied as hashed files with their origin. Text saying that telemetry exists is not a table.

The functional contract identifies required outputs, units, operating scope and numerical acceptance criteria with their source. A prose statement such as "accurate enough" is not a numeric RMSE threshold. A reasoner must justify any new criterion; this card supplies no default pass value.

## Calibration versus independent validation

Calibration chooses adjustable parameters using one record. Validation asks whether the exact resulting artifact predicts a separate held-out record within its stated contract. Retain the actual device descriptor, artifact hash, data hashes and configuration. The twin validation service rejects reuse of the calibration task as its independent held-out task; it replays the candidate without fitting it again.

Inspect per-channel residuals, the time window, large excursions and sensitivity to assumptions. A low average error can conceal a bad interval or a parameter that is not uniquely determined. A failed validation stays failed. Approval and installation are separate station operations; only `station.twin_state` establishes which exact artifact is active.

## Source records

Implementation contracts: `slots/agent/procedure-execution.ts`, `tier3/procedure.ts`, `slots/factory/inputs.ts`, `slots/factory/provider.ts`, `slots/twin/deployments.ts` and `slots/station/twins.ts`. Physical and monitoring interpretation: `station-topology`, `scrubber-1-datasheet`, `biometric-monitoring-readiness`, `method-scrubber-dynamic-identification` and `method-multizone-exchange-identification`.
