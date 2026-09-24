# Physics.Habitat:duct

The CO2 a ventilation exchanges between two volumes at the flow a fan delivers: air taken from A to B and returned, so no net air moves but CO2 goes from the richer side to the poorer.

## What it computes

    flux      = flow * (co2MassPerM3(ppmA) - co2MassPerM3(ppmB))     [kg/s], positive from A to B
    co2DeltaA = -flux
    co2DeltaB = +flux

with the CO2 per cubic metre from each side's concentration at the shared pressure and temperature. What leaves one volume enters the other: the two volumes' CO2 together changes only by the crew and the scrubber (library `co2-mass-balance`, two volumes).

## Ports

| port | direction | unit | what |
|---|---|---|---|
| flow | in | m3/s | the air exchanged each way (a fan's flow) |
| ppmA, ppmB | in | ppm | the two volumes' ppm_CO2 |
| pressure, temperature | in | Pa, K | the editable defaults when unwired |
| co2DeltaA, co2DeltaB | out | kg/s | for the two atmospheres' delta_CO2 inputs |
| exchangeFlow | out | m3/s | |

## Parameters

| parameter | unit | default |
|---|---|---|
| defaultPressurePa | Pa | 101325 |
| defaultTemperatureK | K | 295.15 |

## Notes

- Only CO2 is exchanged: the other species are the same on both sides of a habitat at one pressure, and CO2 is a thousandth of the air.
- The substrate's `Physics.Scene:atmosphere-gate` moves air one way in its forced mode and takes its flow as an editable; this node takes it from a signal, so a fouled filter shows as less exchange.
