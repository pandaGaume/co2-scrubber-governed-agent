# Leak (generated)

A CO2 leak from a seal as a constant mass flow source. The node outputs a mass flow rate (kg/s) equal to the editable `leak_rate_full_opening` parameter scaled by a command input between 0 and 1.

## Inputs

- **command** (dimensionless, ratio): The leak opening fraction from 0 (fully closed) to 1 (fully open). Defaults to 1 (fully open) when unwired. Values outside [0, 1] are clamped.

## Outputs

- **leak_rate** (mass flow, kg/s): The CO2 mass flow out of the volume through the leak, equal to `leak_rate_full_opening × command`.

## Parameters

- **leak_rate_full_opening** (mass flow, kg/s, editable): The leak rate when the seal is fully open. Default: 0.001 kg/s.

## Behavior

The leak is a constant source: when the command is 1, the leak outputs its full opening rate; when the command is 0, the leak is closed and outputs 0. The leak rate scales linearly with the command fraction.

Generated in the forge; not a hand-written node.
