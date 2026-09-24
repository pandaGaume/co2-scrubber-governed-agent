# Physics.Habitat:scrubber

A CO2 scrubber in its datasheet's units: a flow through absorbent beds, a single-pass efficiency, a lag, its power. It removes mass from the volume it draws from.

## What it computes

    d(flow)/dt = (flowAtFull * command - flow) / lag                      [m3/s], the integrated state
    removal    = efficiency * flow * co2MassPerM3(ppm, pressure, temperature)   [kg/s]
    co2Delta   = -removal
    power      = supplyVolts * (interceptAmps + slopeAmps * command) * habitatScale   [W]

`co2MassPerM3` is the CO2 in a cubic metre of the air drawn: ppm * 1e-6 * P * M / (R T). Effective flow = efficiency * flow (library `co2-scrubbers`).

## Ports

| port | direction | unit | what |
|---|---|---|---|
| command | in | 0 to 1 | the commanded fraction of full speed |
| ppm | in | ppm | the volume's ppm_CO2 |
| pressure, temperature | in | Pa, K | the editable defaults when unwired |
| co2Delta | out | kg/s | minus the removal, for an atmosphere's delta_CO2 input |
| flow, effectiveFlow | out | m3/s | after the lag; efficiency times it |
| power | out | W | |

## Parameters

| parameter | unit | default | source |
|---|---|---|---|
| flowAtFullM3ps | m3/s | 0.055 | datasheet (3.3 m3/min) |
| efficiency | | 0.30 | datasheet, bench at nominal bed temperature |
| lagTimeConstantMinutes | min | 3.33 | datasheet, step of the command |
| initialFlowM3ps | m3/s | 0 | the flow at reset |
| supplyVolts, interceptAmps, slopeAmps, habitatScale | | 6, 0.0879, 0.1611, 300 | the bench's motor, scaled |
| defaultPressurePa, defaultTemperatureK | Pa, K | 101325, 295.15 | when nothing is wired |

## Notes

- These are properties of the machine, the same wherever it is installed: a commissioning holds them and fits the room (library `scrubber-1-datasheet`).
- NASA's ground tests show the efficiency depends on the inlet concentration and on the regeneration; this node holds it constant (library `nasa-scrubber-test-protocols`).
