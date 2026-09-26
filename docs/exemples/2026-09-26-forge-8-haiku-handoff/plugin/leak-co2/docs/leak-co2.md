# CO2 Leak (generated)

Models CO2 mass flow leaking from a volume through a seal failure.

## Purpose

Represents a constant leak source in a sealed volume (e.g., the Lab in a spacecraft). The leak rate is proportional to an opening command (0 to 100 percent), scaled by an editable full-opening rate.

## Inputs

- **volume** (m³): The volume containing the CO2. Informational; not used in the current model.
- **co2_concentration** (ppm): The CO2 concentration in the volume. Informational; not used in the current model.
- **opening** (percent, 0–100): The seal opening command. Defaults to 0 (no leak) when unwired.

## Outputs

- **leak_rate** (kg/s): The CO2 mass flow leaking out. Proportional to the opening command and the editable full-opening rate.

## Parameters

- **leak_rate_full** (kg/s, editable): The leak rate when the seal is fully open (opening = 100%). Default: 0.0001 kg/s.

## Behavior

- When opening = 0%, leak_rate = 0.
- When opening = 100%, leak_rate = leak_rate_full.
- When opening = 50%, leak_rate = 0.5 × leak_rate_full.
- The leak rate scales linearly with the opening command.

## Notes

Generated in the forge to model seal failures in the Lab during the CO2 decay test. The volume and concentration inputs are provided for future refinement (e.g., to account for concentration-dependent leak rates) but are not used in the current linear model.
