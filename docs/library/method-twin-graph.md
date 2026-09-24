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
