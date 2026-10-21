# Installation knowledge register: known parameters, unknowns and evidence

An index of the reference habitat's available knowledge. Use `library.read` on the named documents and `library.facts` on their fact ids to obtain provenance and current signature status. A request to identify a parameter does not establish that it is unknown. Search existing device and installation records before designing an experiment.

## Available installation and device records

| Quantity | Available information | Authoritative library record |
|---|---|---|
| Lab available air volume | 30 m3, declared reference installation | `lab-layout-and-volumes`, `habitat.lab.availableAirVolume` |
| Hab-B available air volume | 400 m3, declared reference installation | `lab-layout-and-volumes`, `habitat.habB.availableAirVolume` |
| Air flow at full speed | 3.3 m3/min, device datasheet | `scrubber-1-datasheet`, `scrubber.flowAtFull` |
| Single-pass removal efficiency | 0.30, dimensionless ratio, bench record | `scrubber-1-datasheet`, `scrubber.singlePassEfficiency` |
| Effective removal flow at full speed | 1.0 m3/min, rounded datasheet value | `scrubber-1-datasheet`, `scrubber.effectiveFlowAtFull` |
| Response time constant | 3.33 min, bench step response | `scrubber-1-datasheet`, `scrubber.lagTimeConstant` |
| Restart latency | documented device property, different from a response time constant | `scrubber-1-datasheet`, `scrubber.restartLatency` |
| Ventilation design flow, hatch closed | 3 m3/min, design intent | `station-topology`, `habitat.interModuleVentilation.designFlow.hatchClosed` |
| Subjects and current occupancy | live register, not a permanent population of the plan | `biomed.presence` |
| CO2 production | activity-dependent reference rates and uncertainty | `nasa-crew-metabolic-loads`, `co2-mass-balance` |
| Actual control restrictions | active board profile and current atmosphere | `scrubber.motor.state`, `scrubber.scrubber.check`; interpretation in `scrubber-1-datasheet` |

The declared reference volumes do not establish the geometry of the physical filming site. Device bench constants may be used with their stated scope; a reasoner may question their applicability to a changed or degraded device, but must distinguish requalification from absence of documentation. Repeating a test is not necessary merely because a parameter appears among a twin's coefficients.

## Information that remains uncertain

- Installed inter-module exchange flow is not the nominal design flow. Hatch-open exchange is not supplied by the volume plan. See `method-multizone-exchange-identification`.
- Crew production varies with activity and people. A reference metabolic rate is not a measured injection rate for the current test.
- Mixing, bypasses, sensor offsets, delay and noise can affect interpretation. A good fit alone does not identify all of them separately.
- A physical motor and a simulated atmosphere can participate in the same demonstration. State which channels are real, simulated, commanded, observed or calculated. No result on the simulated cabin constitutes a physical CO2 measurement.
- Available monitoring hardware must cover the exposed subjects. A single real belt does not prove multiple-person monitoring. See `biometric-monitoring-readiness`.

## Quantities and units

Canonical quantities in the device's typed records include `Dimensionless` for efficiency or a speed fraction, `Timespan` for a duration, `VolumetricFlow` for flow and `Volume` for air volume. `Ratio` and `Time` are common search words, not a guarantee that those are accepted quantity identifiers. Verify the register and `physics.units_normalize`; do not infer a quantity from a property's name.

Use a consistent time base when combining flow and volume. A command of 50 percent is the fraction 0.5 in an equation, not a single-pass efficiency of 0.5. A method card's search vocabulary does not amend the unit registry or a signed safety rule.

## Navigation

- `method-scrubber-dynamic-identification`: gain, single-pass efficiency, response time constant and observability.
- `method-multizone-exchange-identification`: inter-module exchange from coupled concentration histories.
- `telemetry-acquisition-and-validation`: recording, source labels and independent evaluation.
- `agent-services-and-task-lifecycle`: tools, returned artifacts, asynchronous results and failure diagnosis.

This register supplies knowledge. It does not schedule experiments, select an action for the reasoner, authorise hardware or certify a twin.
