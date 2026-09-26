# CO2 Leak (generated)

Models CO2 mass flow out of the atmosphere through a leak in a seal. The leak is controlled by an opening fraction (0 = closed, 1 = fully open) and scales linearly with this fraction. The maximum leak rate at full opening is an editable parameter.

## Inputs

- **pressure** (Pa): The atmospheric pressure. Defaults to 101325 Pa (standard atmosphere) when unwired. The leak model uses opening fraction as the primary control; pressure is available for future refinements.
- **opening** (dimensionless, 0–1): The fraction of the leak opening. Defaults to 0 (fully closed) when unwired. Clamped to [0, 1].

## Outputs

- **leak_co2** (kg/s): The CO2 mass flow out of the atmosphere. Computed as `opening × rate`.

## Parameters

- **rate** (kg/s, editable): The maximum CO2 leak rate at full opening (opening = 1). Default is 0.0001 kg/s. This is the rate parameter of the node and can be adjusted to match observed leak behavior.

## Behavior

The leak mass flow is proportional to the opening fraction:
- When opening = 0, leak_co2 = 0 (sealed)
- When opening = 1, leak_co2 = rate (fully open)
- When opening = 0.5, leak_co2 = 0.5 × rate (half open)

This model represents a constant-rate leak controlled by a valve or seal opening, typical of a small breach in a spacecraft seal that leaks at a fixed rate when open.

Generated in the forge; not a hand-written node.
