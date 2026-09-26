# CO2 Leak (generated)

Models a CO2 leak from a seal in a habitat module as a mass flow source.

## Purpose

Represents a constant leak rate through a seal, scaled by a command fraction (0 to 1). When the command is 1, the leak is fully open; when 0, it is closed. The leak rate is an editable parameter in litres per minute, converted to kg/s using CO2 density at standard conditions (1.98 kg/m³).

## Inputs

- **pressure** (Pa, optional): Ambient pressure. Unused in the current implementation; provided for future extensions.
- **volume** (m³, optional): Volume of the space. Unused in the current implementation; provided for future extensions.
- **command** (ratio, optional): Leak opening fraction from 0 to 1. Defaults to 1 (fully open) when unwired.

## Outputs

- **leak_co2** (kg/s): CO2 mass flow out through the leak.

## Parameters

- **leak_rate** (L/min, editable, default 0.05): The maximum leak rate when fully open.

## Behavior

The output mass flow is computed as:

```
leak_co2 (kg/s) = leak_rate (L/min) × 1.98 (kg/m³) / 60000 × command (0 to 1)
```

The conversion factor 1.98/60000 converts from L/min to kg/s using CO2 density.

## Notes

- Generated in the forge; not a hand-written node.
- The pressure and volume inputs are optional and currently unused, but are available for future refinements (e.g., pressure-dependent leak models).
- The command input clamps to [0, 1] to ensure physical validity.
