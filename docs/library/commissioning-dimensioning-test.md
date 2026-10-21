# Method card: commissioning dimensioning test and report

**Measures:** Concentration, VolumetricFlow, Volume
**Method:** commissioning-dimensioning-test
**Scope:** the operator's commissioning mission ends at the test report, before graph or twin construction.

## Purpose and prerequisites

Assess the scrubber's documented sizing and observed response within a checked, commander-authorised test. Use `lab-layout-and-volumes`, the current device descriptor, `scrubber-1-datasheet`, `commissioning-test-safety` and `biometric-monitoring-readiness`. Applicable documented volumes, flow and lag need not be rediscovered merely because they appear as model parameters.

The procedure's physical target must match the evidence it can obtain. The logger supplies time, Lab and Hab-B CO2 concentrations, and observed motor speed. It has no inlet/outlet CO2 pair or motor-current channel. Therefore it cannot directly measure single-pass efficiency or electrical efficiency. A documented flow remains documented; an effective rate inferred from cabin response remains an estimate under stated assumptions.

The factory writes the proposed test, never runs it. Scientific officer Commander Spock approves the exact checked procedure, identified by its hash. Only then does the station ask commander James T. Kirk to authorise launch of that same procedure. There is one active question per human role; neither decision supplies the other. The reasoner requests execution only through the governed executor. A successful proposal is preparation, not an executed experiment.

## Telemetry discovery is the central part of the demonstration

The reasoner investigates which evidence exists, where it comes from and whether it meets the test's need. This is not a request for the commander to type a table. A reading, a stream, a recorded time series and a model prediction are different kinds of evidence.

Available discovery surfaces include:

- `station.registry_list` and `factory.inventory`: registered devices, measurement properties, units, bindings and declared capabilities. A registered sensor is not proof that its live stream is healthy or recorded.
- The available device read tools, including `scrubber.motor.state`: actual current speed, current and device state when supplied by the connected device. A single state read is not a history file, and a motor-current read does not imply the procedure logger records current.
- Biomed's description, presence and monitoring state: subjects, modules, available sensors and whether a monitoring session exists. A missing stream is an actual prerequisite to address with the commander and medical responsibility.
- Prior run identifiers in mission observations and `agent.procedure_result`: existing recorded tests, their terminal status, provenance and rows. Reuse applicable existing evidence instead of assuming another experiment is necessary.
- A known factory task's `task.data` and workspace files: the actual hashed telemetry table and its columns. Neither a profile nor a task description is hidden telemetry.

Inspect time basis, units, freshness, coverage, accepted commands, sampling and provenance. Explain the useful discoveries briefly through Mother's model-authored summary. If no suitable record exists, identify the missing channels or acquisition and propose a feasible authorised dimensioning test using the actual logger. The reasoning agent chooses its searches and acquisition approach; this card is a capability reference, not a mandatory tool sequence.

The discovery must lead to usable evidence or an explicit limitation. Do not loop on equivalent searches, ask the human to invent unavailable telemetry, or launch a twin factory to obtain a sensor record. The current mission ends with its test result and report, not with model construction.

## Choosing the test

The current operator request starts with a 0-to-100 percent envelope submitted for an actual safety check, without executing forbidden points. Retain the real refusal and let the reasoner revise the proposal from it. The requested executable profile is 30, 40, 50, 60, 70, 80, 90, then 100 percent, with each observed motor-speed plateau lasting at least 10 wall-clock seconds. These are explicit filming and acquisition requirements, not predetermined model decisions or successful results. At the current accelerated clock of two wall-clock seconds per simulated minute, six simulated minutes per plateau allows acquisition overhead and totals 48 simulated minutes, below the 60-minute ceiling. The reasoning agent chooses and justifies the proposal and its scientific assessment from the actual constraints. A different clock requires reconsidering dwell durations; do not fake timestamps or weaken guards. All selected points must respect the signed minimum-flow floor, current device restrictions, duration ceiling, monitoring and abort conditions. Open-hatch identification is outside the current logger's supported configuration.

Use the method's assumptions in predictions and interpretation. A two-module habitat exchanges air through ventilation even with the hatch closed. A single-room decay estimate cannot establish a uniquely identified physical room volume in that installation. If the report includes an apparent volume or rate, retain that label and explain the assumptions and uncertainty. An insufficient response yields an inconclusive dimensioning result rather than invented parameters.

## Terminal evidence and report

After execution terminates, read `agent.procedure_result` for the actual run. Report:

- Device identity, procedure identity and run identifier.
- Actual status: done, aborted or failed, including the reason when present.
- Accepted operating points, durations, observed speed and recorded sample count.
- Telemetry provenance: real motor observation and simulated cabin CO2 in this demonstration.
- The execution report's actual sizing assessment, if available, and what the data supports beyond the already documented values.
- Assumptions, uncertainty, incomplete measurements and the available telemetry reference.

The executor's report is the available analysis. Do not open a graph, ONNX, code or Observer construction task merely to make the report longer or to complete this commissioning. A telemetry run identifier supplies a reference to recorded evidence; it does not prove that a twin was built.

The reasoner gives a concise spoken conclusion after reading the report. Successful mission completion requires the actual completed run, report and recorded ordered speed plateaus. This does not automatically establish a successful scientific identification: report inconclusive sizing explicitly. After a terminal test report, the reasoner closes this scoped mission. For an aborted or failed test, or missing required execution evidence, report the limitation and choose mission.complete with outcome incomplete. This closes the mission without certifying commissioning success. Before execution, unavailable prerequisites may still require a pause. This commissioning attempt does not automatically repeat the experiment. A human may request another attempt as separate work.

## Later work

Retain the recorded data for a separate model-development mission if requested. Graph construction, ONNX learning, independent validation and installation are neither actions nor success conditions of this dimensioning-test mission. Do not wait for their results.

Source contracts: `specs/scenario-commissioning.json`, `slots/agent/procedure-execution.ts`, `tier3/procedure.ts`, `lib/procedure/report.ts`, and the library documents named above.
