# Method card: a CO2 twin graph from the catalogue, fitted by its residual

How a twin of a ventilated volume is written with the catalogue's life-support nodes, and how its numbers are fitted against telemetry.

**Measures:** TwinGraph, Concentration
**Physics:** library `co2-mass-balance`; the scrubber: library `co2-scrubbers`

## The nodes and what they hold

- `Physics.LifeSupport:cabin-air`: one well-mixed volume. Its state is the CO2 concentration (`co2Ppm`, ppm). Inputs: `scrubberRate` (1/min) and four emissions `emissionA` to `emissionD` (ppm/min, any source or sink). Parameters: `initialPpm`; `removalFloorPpm` (the scrubber removes `scrubberRate * (co2Ppm - removalFloorPpm)`; 0 gives the plain mass balance `Qe * C`); `leakPerMinute` (a loss of `leakPerMinute * co2Ppm` per minute).
- `Physics.LifeSupport:crew`: a group of people. Output `co2Emission` (ppm/min) = `count` times the per-person rate of its `activity` (`sleep`, `rest`, `light_work`, `heavy_work`); the per-person rates are parameters in ppm/min for the volume the crew is in (`emissionLightWorkPpmPerMinute`, and so on).
- `Physics.LifeSupport:scrubber`: input `command` (0 to 1); output `effectiveRate` (1/min) that follows `rateAtFullCommandPerMinute * command` with a first-order lag (`lagTimeConstantMinutes`).
- `Logic.Time:timeline`: a piecewise-constant source in session time (`segments`); the way a measured input enters the graph.

## Folding the volume into the rates

These nodes work per volume: a rate in ppm per minute is a flow in m3 of CO2 per minute divided by the volume. With V the volume (m3), Qe the scrubber's effective flow at full speed (m3/min) and g the CO2 a person produces (L/min):

    crew per-person rate   = g * 1e3 / V          [ppm/min]   (g * 1e-3 m3/min, divided by V, in ppm)
    rateAtFullCommand      = Qe / V               [1/min]

So a graph is written once with V (and the others) as variables, and fitted.

## Measured inputs

The scrubber's command is the measured speed: a timeline whose segments are the speed column scaled to 0..1. A quantity measured outside the volume (the CO2 of a neighbouring volume, for one) enters the same way, as a timeline driven by its column.

## An exchange with a neighbouring volume

An exchange flow q (m3/min) between the volume and a neighbour of concentration Cn adds `q * (Cn - C) / V` per minute. With these nodes: a loss `leakPerMinute = q / V`, and an inflow `q / V * Cn` into a free emission input, from a timeline driven by the neighbour's measured column. Whether there is an exchange, and how large, is for the residual to say.

## Writing a candidate for `graph.evaluate`

- Parameters may be formulas: `{"$expr": "0.5 * 1e3 / V"}`; a timeline's segments may come from a telemetry column: `{"$series": {"column": "speed_percent", "scale": "0.01"}}`; an initial state from the first measurement: `{"$first": "co2_lab_ppm"}`.
- `fit` gives the bounds of each variable nobody knows (`{"V": {"min": 10, "max": 200}}`): the harness searches them with an optimiser, a few dozen runs; `variables` holds the known ones.
- **What the documentation gives is known, not fitted.** A device's constants (its flow, its efficiency, its lag: its datasheet in this library) and the station's (its topology, its metrics: library `station-topology`) are inputs. Fitting them as well lets a wrong structure hide behind a wrong constant: the residual is then small for the wrong reason.
- `compare` names the probe (`{"node": "lab", "property": "co2Ppm"}`) and the telemetry column it is judged against.

## Reading the residual

- The residual is the root mean square of the gap over the whole telemetry, per compared column; the evaluation also gives the worst gap, the minute it occurs, and the curves every five minutes.
- A best fit sitting at the edge of a range means the range is too narrow.
- A gap that no value of the variables closes, largest in one phase of the test (the rise, the decay), means the structure lacks a term: a source, a sink, an exchange, a lag. Name the hypothesis in the candidate's label.

## The station's reference graph, on the shelf

Since 25 September the library holds the station's reference graph (`library.graphs`, id `habitat`; `graphs/habitat.spikypanda`, its template `habitat.template.json`, its words in `habitat.grammars/`): two volumes in mass, four persons by name at their own activity wired into the crew of their module, the scrubber in its datasheet's units, the ventilation as a fan through a filter whose loading sets what it delivers, the loop between the two airs, the hatch closed, the two sensors. A twin of this station starts from it: `graph.evaluate` with `graph: "habitat"`, `settings` for who is on board (`labOccupants`, `habOccupants`), `variables` for what is held, `fit` for the bounds of what only the installation knows.

- Its known constants (`Qe`, `eta`, `lag` from the scrubber's datasheet, `gRest`) are held at their defaults and cannot be fitted.
- What is fitted: `V` (the Lab's volume), `Vh` (Hab-B's), `L` (the filter's loading: what the ventilation delivers; 0 is a clean filter at the design flow). A band's variable (`g`, the operators' rate) is placed within its band.
- Its probes are judged against the logger's columns without naming them: the two sensors (`co2-1.lastMeasured` against `co2_lab_ppm`, `co2-2.lastMeasured` against `co2_habb_ppm`).
- Its scrubber's numbers (`Qe`, `eta`, `lag`) are the registered device's own when the task carries the register's devices (`observations.devices`): the twin of a scrubber is the reference with that scrubber's numbers, held; the datasheet's defaults otherwise.
- Who is on board is given person by person (`persons`: module and activity each, id, callsign and name when known; the task's `observations.persons` when the medical monitor read them): the roster gives way, the settings follow. `settings` alone (`labOccupants`, `habOccupants`) keeps the roster's first persons and adds unnamed people beyond them.
- The evaluation answers with the graph's id, the persons on board, the variables the device gave (`fromDevice`) and those taken at their defaults, beside the residual.

## The habitat's own nodes: mass, not folded rates

Since 24 September the catalogue also holds the `Physics.Habitat:*` family (the repository's plugin, `plugins/habitat`), written for the physical reference of this station, `graphs/habitat.spikypanda`. Since 25 September the plugin holds only what the substrate lacked; the air, the gates and the dust are the substrate's own nodes. They work in mass and in the devices' own units, so no volume is folded into any rate:

- `Physics.Scene:atmosphere` (the substrate's): a volume of air as a mass per species (ideal gas), with the inputs `delta_CO2_<k>` in kg/s (a source positive, a sink negative, summed; `delta_CO2_0` declared, the higher indices a variadic pool) and the outputs `ppm_CO2`, `mass_CO2`, `partial_pressure_CO2`, `pressure`, `temperature`. Parameters: `volume` (m3), `temperature_k`, `initial_atmosphere_preset`; the CO2 a sensor read is seeded through `_initialMassKg` (the demo computes it with `initialMassesKg`).
- `Physics.Scene:atmosphere-gate` (the substrate's): the air two volumes exchange, bound to both atmospheres by configuration links (`atmosphere_out` to `atmosphere_A_in` and `atmosphere_B_in`), moving the masses itself: mode `exchange` at the `flow` wired into it (the fan's) for the ventilation loop, mode `closed` or `open_passive` for a hatch. It carries no CO2 ports.
- `Physics.Habitat:crew`: people as a source in kg/s, from a per-person rate in litres per minute by activity (NASA's bands, library `nasa-crew-metabolic-loads`): `count`, `activity`, `lightWorkLitresPerMinute` and the other three.
- `Physics.Habitat:scrubber`: the scrubber in its datasheet's units: `flowAtFullM3ps`, `efficiency`, `lagTimeConstantMinutes`; input `command` (0 to 1) and `ppm` (the volume's `ppm_CO2`); output `co2Delta` (minus the removal, kg/s) for the volume's delta input. A twin holds these numbers; the datasheet gives them.
- `Physics.Habitat:fan`, `Physics.Habitat:filter`: a fan's command to the flow it delivers against the filter's resistance (`flow` in m3/s), and the filter's fouling (`initialLoadingKg`, its `resistance` wired into the fan, the dust it captures a `Physics.Particulate:*` descriptor on `particulate_in`).
- `DSP.Sensor:transducer` (the substrate's): a CO2 sensor on a volume's `ppm_CO2`, the station's resolution as its quantisation step.

A candidate written with these nodes states the exchange as a flow in m3/s, the crew as litres per minute and the volume as cubic metres: the quantities the documentation and the commissioning speak. The rule stays the same: what the datasheet gives is held, the room's numbers (its volume, the ventilation's delivered flow) are fitted. The reference document itself is the station's, built from `specs/habitat-parameters.json`; its structure is what a twin of this habitat starts from.
