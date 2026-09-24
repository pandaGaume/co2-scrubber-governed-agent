# This installation: a lunar habitat, one scrubber, two modules

The base the documents of this library apply to, as its designers describe it. The numbers that only the installation knows (the volume a scrubber serves, the air exchanged between modules) are not here: they are measured.

## Layout

- Modules connected by hatches; the air moves between modules through the hatches and the ventilation, more when a hatch is open.
- One CO2 scrubber, centralised, rather than one per module; a CO2 sensor in each module.
- Four crew members. Who is in which module at a given time is known to the medical monitor (`biomed`), not to the plan.

## Operating levels

- The scrubber's effective flow at full speed is 1.0 m3/min (library `scrubber-1-datasheet`). At steady state the CO2 settles where removal matches production, C = G / (Qe x speed): with four people asleep (about 0.24 L/min each, library `nasa-crew-metabolic-loads`), about 960 ppm at full speed and about 2,900 ppm at a third of it; with four awake (about 0.38 L/min each), about 1,520 ppm at full speed and about 3,800 ppm at 40 %. These are the levels of the whole habitat once the ventilation has mixed it; Hab-B sits above the Lab by its crew's production divided by the ventilation's flow.
- For comparison, NASA sized the 4-bed CO2 scrubber of the ISS flight demonstration to remove four crew-equivalents at an inlet of 2 torr, about 2,630 ppm (library `nasa-scrubber-test-protocols`).
- The cabin twin's thresholds: ELEVATED from 3,500 ppm, CRITICAL from 4,000 ppm. At CRITICAL the scrubber's firmware forces full speed and refuses any reduction, whoever asks; while ELEVATED it refuses any speed below its minimum flow.

## Who decides what

- The station (Mother) keeps the register of devices and the journal; she decides nothing.
- A test that changes the air of an occupied module is authorised by the commander.
- Commands to a device are sent by the agent, one at a time, and judged by the device.
