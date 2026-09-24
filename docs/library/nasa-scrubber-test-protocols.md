# Method card: how NASA and analog habitats test a CO2 scrubber in a closed volume

How a scrubber and the volume it serves are tested in public programs, and the rules of application for a commissioning. Sources: Lin et al., *Further Testing of an Amine-Based Pressure-Swing System for Carbon Dioxide and Humidity Control* (ICES, JSC chamber tests 2006-2007); Knox, Cmarik and Peters, *Optimization of the 4-Bed CO2 Scrubber Performance Based on Ground Tests* (ICES-2021-71, MSFC); Pütz, Olthoff, Ewert and Anderson, *Assessment of the Impacts of ACLS on the ISS Life Support System using Dynamic Simulations in V-HAB* (ICES-2016-170); SAM, Space Analog for the Moon and Mars, *First run of the 4-bed CO2 scrubber at SAM* (March 2026).

**Measures:** Volume, AirChange, CO2Generation, RemovalRate

## 1. The crew is simulated, not recruited (JSC closed chamber)

The scrubber was tested in a closed chamber with a **Human Metabolic Simulator**: CO2 injected into the chamber air from a pressurized, **flow-controlled** source, and water vapour from metered steam, at the rates of NASA's human-systems requirements for 82 kg males. It simulated four or six people (eight at most), at sleep, nominal and exercise levels. The chamber volume and the metabolic rates were set to the program's standards, and the baseline cases were run again whenever the rig changed.

Why it matters: an injected flow is known to the flow controller's accuracy; a person's CO2 is known only within a band (library `nasa-crew-metabolic-loads`). With a known source, the volume and the scrubber are identified without the uncertainty of the crew, and without anyone breathing the test.

## 2. Controlled inlet, repeated cycles, efficiency from inlet and outlet (MSFC 4-bed scrubber)

- Test conditions held: process air flow 26 SCFM, half-cycle 80 minutes, inlet ppCO2 2 torr, inlet temperature 56 °F, dew point 53 °F.
- **Three full cycles per test case**; six cases at the same conditions gave a standard deviation of about 0.5 % of the mean: repeatability is measured before any change is judged.
- Efficiency is computed from the CO2 at the scrubber's inlet and outlet; removal at 2 torr was 4.71 kg/day.
- **Removal depends on the inlet CO2** and on the regeneration (13 % more heater power gave up to 12 % more removal at high loads). A single-pass efficiency is a value at a condition, not a constant.
- A correlation found late in the test sequence was coincidental: every change was tested against the repeatability before being attributed.

## 3. Unknowns separated one at a time (SAM, 2026)

A sealed test room, four parts of 30 minutes each:

1. **the room's leak rate**, with nobody inside and the scrubber off;
2. **the CO2 one occupant generates**, sealed inside, scrubber off;
3. **adsorption**: the scrubber capturing CO2 (the level first raised to about 5,000 ppm by injection);
4. **desorption**: the beds heated to release it.

Each part isolates one term of the mass balance before the next adds one: the exchange, then the source, then the sink.

## 4. Several volumes, joined by ventilation flows (ISS in V-HAB)

The ISS atmosphere was modeled as ten ideally stirred volumes joined by inter-module ventilation flows of 140 cfm each (about 4 m3/min), taken as constant. The authors note that diffusion and pressure differences, which were neglected, underestimate mixing between modules, and that mixing within each module is overestimated. That flow is the one with the **hatch open and the ventilation running**; through a closed hatch the exchange is a leak, much smaller, and is measured, not assumed.

## Rules of application for a commissioning

- **Separate the unknowns.** A test that changes the source, the sink and the exchange together leaves them confounded: a volume can hide an exchange, a crew rate can hide a volume. Measure the exchange with no source and no removal, then the source, then the removal.
- **Prefer a known source to a crew.** With nobody inside, CO2 injected at a controlled flow (a metabolic simulator) replaces the crew's uncertain rate, and nobody breathes the test. With people inside, their rate is a band, not a constant, and the monitoring of the occupants applies (library `co2-and-people`).
- **Hold the scrubber's condition.** Its efficiency depends on the inlet CO2 and on the regeneration: say at which level it was measured.
- **Repeat before concluding.** Run a step more than once and state the repeatability; a difference smaller than it is not a result.
- **Say what the model neglects.** An ideally stirred volume overestimates mixing within a module; a fixed sensor does not see a pocket.
