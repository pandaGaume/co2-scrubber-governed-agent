# This installation: a lunar habitat, one scrubber, two modules

The base the documents of this library apply to, as its designers describe it. The numbers that only the installation knows (the volume a scrubber serves, the air exchanged between modules) are not here: they are measured.

## Layout

- Modules connected by hatches; the air moves between modules through the hatches and the ventilation, more when a hatch is open.
- One CO2 scrubber, centralised, rather than one per module; a CO2 sensor in each module.
- Four crew members. Who is in which module at a given time is known to the medical monitor (`biomed`), not to the plan.

## Operating levels

- In normal operation, with four people asleep and the scrubber around a third of its speed, the cabin CO2 sits around 1,200 to 1,500 ppm.
- The cabin twin's thresholds: ELEVATED from 3,500 ppm, CRITICAL from 4,000 ppm. At CRITICAL the scrubber's firmware forces full speed and refuses any reduction, whoever asks; while ELEVATED it refuses any speed below its minimum flow.

## Who decides what

- The station (Mother) keeps the register of devices and the journal; she decides nothing.
- A test that changes the air of an occupied module is authorised by the commander.
- Commands to a device are sent by the agent, one at a time, and judged by the device.
