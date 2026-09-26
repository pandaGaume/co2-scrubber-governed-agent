# CO2 Leak (generated)

Models a CO2 leak from a volume at a constant mass flow scaled by a command fraction. This represents a leak through a seal or a vent held open.

## Inputs

- **command** (Dimensionless, ratio): The opening fraction from 0 to 1. Defaults to 1 (fully open) when unwired.

## Outputs

- **co2Delta** (MassFlow, kg/s): The CO2 leaving the volume. Always nonpositive (negative when leaking, zero when closed).

## Parameters

- **rateAtFullOpening** (MassFlow, kg/s): The leak rate when the command is 1 (fully open). Default: 0.002 kg/s.

## Behavior

The output is computed as:
```
co2Delta = -command × rateAtFullOpening
```

When command is 0, no CO2 leaks. When command is 1, CO2 leaks at the full rate. The output is always nonpositive, representing mass leaving the volume.

Generated in the forge; not a hand-written node.
