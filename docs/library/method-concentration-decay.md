# Method card: concentration decay, with the occupants as the source and the scrubber as the pump

Measures the volume of air a scrubber serves (and the air change it gives), in place, with no tracer bottle: the occupants' CO2 is the tracer and the scrubber's known flow is the pump.

**Measures:** Volume, AirChange
**Standards:** ASTM E741 (tracer gas dilution, concentration decay technique, single zone); ASTM D6245 (occupant CO2 as the tracer)
**Physics:** library `co2-mass-balance`; the scrubber: library `co2-scrubbers`

## Principle

In a well-mixed volume V cleaned by a scrubber of effective flow Qe, with occupants producing CO2 at a steady rate, the concentration moves towards its equilibrium with the time constant tau = V / Qe. Changing the scrubber's speed moves the equilibrium; the curve that follows gives tau; the scrubber's flow gives Qe; hence V = Qe * tau.

## Rules of application

1. **One zone.** The volume under test is one well-mixed zone. Openings to other volumes are held in one position during the whole test and stated. What the test does not measure (the exchange through a closed opening, for one) is written as a hypothesis, not assumed to be zero.
2. **The source is the occupants.** Their number and activity are part of the test's conditions: they are read before the test and held during it; a person entering or leaving the zone changes the source and invalidates the curve. The test raises the CO2 of the air they breathe.
3. **Raise, then decay.** First reduce the scrubber's effective flow so the concentration rises towards a higher equilibrium, until it has risen well above the sensor's noise (several hundred ppm). Then return the scrubber to full speed and record the decay.
4. **Duration.** Each phase lasts about one time constant or more. Estimate tau from the expected volume and the scrubber's flow before the test (a first guess of the volume, stated as such), and bound the whole duration.
5. **Records.** The concentration of the zone at a regular interval (one minute is enough for time constants of ten minutes or more); the scrubber's speed commands and whether the device accepted them; the concentration of any connected zone, which shows whether the opening exchanges air.
6. **Limits.** An upper concentration the test stays under, and an abort concentration above it, both below the installation's own thresholds (library `co2-and-people`, `this-installation`).
7. **Written before.** The limits, the conditions that stop the test, and the predictions (what the curve should do if the hypotheses hold, what would show they do not) are written before the test runs, and compared after.
8. **Fit.** The decay is fitted towards its equilibrium, C(t) = C_eq + (C_0 - C_eq) exp(-t / tau), not towards zero and not towards outdoor air.

## Shape of a procedure from this card

Two steps with every opening held in one position: a reduced speed for the rise, full speed for the decay. The steps, speeds, durations, limits, stop conditions and predictions are the procedure writer's, for the installation at hand.
