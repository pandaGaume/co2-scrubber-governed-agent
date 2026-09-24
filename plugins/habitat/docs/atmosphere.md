# Physics.Habitat:atmosphere

The air of one well-mixed volume, as the substrate's `Physics.Scene:atmosphere` models it (a mass per species, ideal gas), with the CO2 wiring declared so a document can connect to it.

## What it computes

- The mass of each species is the integrated state. Every value published into `delta_CO2_0` to `delta_CO2_3` (kg/s, positive a source, negative a sink) is summed into dm_CO2/dt.
- `ppm_CO2` is the CO2 mole fraction times a million; `partial_pressure_CO2` its partial pressure; `pressure` the total pressure nRT/V.
- `initialCo2Ppm` sets the CO2 at reset by adjusting its mass so that its mole fraction is the value, the other species (Earth air by default) untouched.

## Ports

| port | direction | unit | what |
|---|---|---|---|
| delta_CO2_0 .. delta_CO2_3 | in | kg/s | CO2 sources and sinks, summed |
| ppm_CO2 | out | ppm | the concentration |
| mass_CO2 | out | kg | the CO2 in the volume |
| partial_pressure_CO2, pressure | out | Pa | |
| temperature | out | K | |
| density | out | kg/m3 | |

## Parameters

| parameter | unit | default | source |
|---|---|---|---|
| volume | m3 | 100 | the volume of air; as built, it is measured |
| temperature_k | K | 293.15 | the module's setpoint |
| initialCo2Ppm | ppm | 1500 | the sensor at the start |
| initial_atmosphere_preset | | earthHumidAirSeaLevel | the substrate's presets for the other species |

## Notes

- One sample per six seconds (the base asks for 100 Hz, a rate for fast chemistry); the solver's `maxStep` bounds the integration step.
- A volume nobody measured is what the commissioning finds (library `method-concentration-decay`, `method-twin-graph`).
