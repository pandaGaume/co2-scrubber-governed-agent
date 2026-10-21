# Commissioning dossier: reference installation, evidence and acceptance

This dossier provides engineering requirements and evidence to the reasoning agents. It does not choose their actions, grant operation authority or imply successful results.

## Current commissioning boundary: dimensioning test and report

On the operator's instruction of 2026-10-20, the default commissioning mission ends after its single authorised dimensioning test and the resulting report. Read `commissioning-dimensioning-test` for its interpretation. Use published configuration and device parameters, establish monitoring, obtain scientific officer Spock's approval of the exact checked procedure, then commander Kirk's separate launch authorisation, and execute through the governed service. The reasoner then reads the actual terminal result, reports the outcome, available telemetry reference, supported sizing assessment and uncertainty, and explicitly concludes this mission. A proposed procedure alone does not meet this objective.

The central demonstration is the reasoner's autonomous search for telemetry: discover registered measurement sources and available records, inspect actual channels, validity and provenance, identify a missing acquisition, and decide how to obtain useful evidence within authority. Do not replace this investigation with a supplied fictional table or a hard-coded search sequence. The declared capability descriptions below explain what exists; they do not assert that a stream is currently connected or that a test succeeded.

After a terminal report, an aborted, failed or nonconforming test is reported with mission.complete outcome incomplete. This closes the scoped mission without satisfying the declared execution requirements or claiming commissioning success. Before execution, unavailable prerequisites may require a pause. Do not launch a replacement test or further construction work automatically. Graph and ONNX construction, twin fitting, independent validation, admission and installation require a separate later mission. The model selects the test and concludes from evidence; no scripted success or automatic completion is added.

The model-building capabilities and model-acceptance sections below are reference material for that later mission. Their RMSE criterion is not a prerequisite for completing the dimensioning test and its report.

## Scope and available inputs

The target is the registered Lab scrubber, normally `/habitat/lab/eclss/scrubber-1`. Bind each task to its current descriptor. The present demonstration uses a real motor and observed speed with simulated cabin CO2. Current commissioning delivers the test record and its supported dimensioning assessment, not a qualified twin or certification of physical CO2 removal or of a Houston room.

| Input | Source | Status |
| --- | --- | --- |
| Lab available air volume, 30 m3 | `lab-layout-and-volumes`, `habitat.lab.availableAirVolume` | Declared reference configuration |
| Hab-B available air volume, 400 m3 | Same document, `habitat.habB.availableAirVolume` | Declared reference configuration |
| Full flow, effective flow, efficiency, lag | Current device descriptor and `scrubber-1-datasheet` | Device-declared parameters, with their units |
| Crew location, activity, monitoring | Current biomed and station evidence | Unknown activity is not evidence of rest; absent monitoring is not normal physiology |
| Metabolic production | `nasa-crew-metabolic-loads` | Documented bands, not exact measurements |
| Ventilation design flow | `station-topology` | Nominal design, not actual exchange |
| Delivered exchange and filter loading | Suitable telemetry and identification | Unknown until supported; never copy hidden simulator constants |
| Open-hatch exchange | Not established by the present closed-hatch logger | Exclude from qualified scope unless separately evidenced |
| Initial CO2 and accepted speed history | Each recorded run | Dataset-specific |

The `habitat` template retains historical volume search ranges. These do not override the later published reference volumes. For the declared configuration, documented volumes can be held in a candidate's `variables` rather than estimated again. They remain declared simulation values, not measurements of the filming site.

## Available construction capabilities

The graph factory composes physical nodes and fits adjustable candidate parameters against CO2 telemetry. `method-twin-graph`, `library.graphs` and `library.graph` describe the `habitat` reference, bounds and probes. Adapting and evaluating a reference against this device's evidence is legitimate; merely running an unchanged reference does not commission the device.

The current ONNX `model.fit` supports motor-health `affine-residual`: expected motor current versus duty and its residual. It needs current and duty observations. It cannot train arbitrary CO2 dynamics. The present procedure logger has no motor-current column. Do not rename CO2 as current or keep searching simulation nodes for a training API. ONNX is optional where its supported family and evidence fit the need, not a prerequisite for a qualified physics graph. Another learned family requires a genuinely implemented and validated capability.

Functional outputs name physical concentrations, for example supplied columns `co2_lab_ppm` and `co2_habb_ppm`, quantity `Concentration`, unit `ppm`. `graph`, `twin` and `artifact` are products, not physical quantities. RMSE is an acceptance constraint, not a required physical output.

## Model acceptance requirement for a separate later qualification mission

The simulated reference commissioning adopts **10 ppm maximum RMSE per required CO2 channel**, across all valid samples of the declared evaluation window, for calibration and independent validation. Cite fact `commissioning.referenceRmseMaxPpm`. This is a project benchmark requirement prepared for the demonstration, not sensor accuracy, a NASA standard or a safety limit. A stricter bound is permissible; relaxing it requires an explicit revised requirement and cannot silently make a failed model pass.

Require finite values and complete coverage for each required channel. Inspect worst errors and temporal structure too. Low residual does not establish parameter identifiability, arbitrary operating support or physical certification.

## Acquisition and test preparation

`commissioning-test-safety` supplies signed bounds: minimum command 30 percent, no shutdown, at most 60 simulated minutes per authorised test, and CO2, battery, monitoring and abort requirements. The current device can impose stricter limits. Select distinct accepted operating points and enough dwell time for the documented dynamics. Do not spend a test identifying a parameter already applicable and documented.

The procedure factory proposes a checked test; the station first asks scientific officer Spock to approve that exact proposal, then commander Kirk to authorise its launch. The revised operator profile and observed dwell requirements are documented in `commissioning-dimensioning-test`; successful completion requires their actual recorded execution. If monitoring is absent, apply `biometric-monitoring-readiness`: coordinate commander and medical responsibility, establish subjects and sensors, then obtain authorisation. One real belt does not monitor two real people. Simulated subjects remain explicitly simulated. Missing coverage requires supported reduced scope or deferral, never weakened guards.

`agent.procedure_execute` runs only an authorised procedure. `agent.procedure_result` returns actual status, sample count, source and run identifier. A completed successful record can be supplied through `telemetryRunId`; the factory copies its rows and device context. A speed command is not a recorded test. The accelerated logger defaults to two wall-clock seconds per simulated minute, a simulation setting rather than permission to accelerate a physical experiment.

Factory contracts name physical outputs and numerical criteria under `objective.constraints.rmsePpmMax`. `task.data` identifies actual hashed files. Prose mentioning telemetry is not data. `factory.task.inputStatus.ready` establishes shape, not scientific sufficiency. A created task with no run is not computing. Inspect failed results before revising a request; a new id does not repair an unchanged failed contract.

## Independent validation and installation

Use separate completed calibration and validation records for the same device and descriptor. The station requires a distinct hashed validation task and rejects duplicated calibration rows, even with different JSON formatting. Plan acquisition accordingly: a second authorised record must really differ while remaining compatible with the candidate's encoded scope. An embedded input schedule does not provide arbitrary what-if support.

`station.twin_validate` independently replays the exact proposed graph, without refitting on the held-out record. Its report binds device, descriptor, artifact, manifest, data, thresholds and residuals. A passing report supports admission, not installation. `station.twin_admit` asks the commander to approve installation of that exact artifact. Read `station.twin_state` for the active matching artifact and use `station.twin_run` to exercise it. A proposal or conversational yes is not installation. Report unmet requirements explicitly.

No library text supplies human approval or successful validation. If a capability is missing or residuals fail, use `reasoning-recovery-procedure`: seek missing evidence, retain failed attempts, assess feasible alternatives or explicitly reduced scope, and report precise limitations. Mother gives the current short summary; written history remains available.

Implementation sources: `slots/agent/procedure-execution.ts`, `slots/factory/inputs.ts`, `harness/topics/graph/index.ts`, `slots/tools/model/provider.ts`, `slots/twin/deployments.ts`, `slots/station/twins.ts`, `graphs/habitat.template.json`, and the library documents above.
