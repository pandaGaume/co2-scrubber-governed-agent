# CO2 Leak (generated)

Models a CO2 leak or vent from a volume: takes CO2 out at a constant mass flow scaled by a command signal.

## Purpose

Represents a leak through a seal, a vent held open, or any other mechanism that removes CO2 from an atmosphere at a rate proportional to a control command (0 to 1).

## Inputs

- **command** (Dimensionless, ratio): The opening fraction, from 0 (closed) to 1 (fully open). Defaults to 0 when unwired.

## Outputs

- **co2Delta** (MassFlow, kg/s): The CO2 mass flow leaving the atmosphere. Negative value indicates CO2 removal.

## Parameters

- **rateAtFullOpening** (kg/s): The leak rate when the command is 1 (fully open). Default: 0.001 kg/s. This is an editable parameter.

## Viewables

- **lastLeakRate** (kg/s): The CO2 leak rate computed on the last tick.

## Notes

The output is always negative or zero, representing CO2 leaving the atmosphere. The leak rate scales linearly with the command signal, clamped to [0, 1].

Generated in the forge; not a hand-written node.
