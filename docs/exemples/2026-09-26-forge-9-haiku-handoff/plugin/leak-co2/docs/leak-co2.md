# CO2 Leak (generated)

Models CO2 mass flow from a seal leak in a habitat module. The leak is proportional to the opening fraction (0 = closed, 1 = fully open) and the pressure difference across the seal.

## Inputs

- **pressure_pa**: Ambient pressure in pascals. Defaults to 101325 Pa (standard atmosphere) when unwired.
- **opening_fraction**: Leak opening fraction from 0 (closed) to 1 (fully open). Defaults to 0 when unwired.

## Parameters

- **leak_rate_at_full_opening**: The CO2 mass flow rate (kg/s) when the leak is fully open (opening_fraction = 1) at standard pressure (101325 Pa). Editable; default 0.0001 kg/s.

## Output

- **leak_co2**: CO2 mass flow out of the volume in kg/s. Computed as `leak_rate_at_full_opening × opening_fraction`.

## Behavior

The leak flow is proportional to the opening fraction. When the opening fraction is 0, no CO2 leaks. When fully open (1.0) at standard pressure, the flow equals the editable leak_rate_at_full_opening parameter.

Generated in the forge; not a hand-written node.
