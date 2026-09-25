# CO2 Leak

## Purpose

Models a CO2 leak or controlled vent in the habitat: a mass flow of CO2 leaving the atmosphere, scaled by a command signal (0 to 1) and an editable maximum rate.

## Inputs

- **command** (Dimensionless, ratio): Control signal from 0 (closed/no leak) to 1 (fully open/maximum leak). Defaults to 0 when unwired.

## Outputs

- **co2Delta** (MassFlow, kg/s): The CO2 mass flow leaving the atmosphere. Negative values indicate outflow (CO2 leaving the system). This output is intended to be wired to an atmosphere's `delta_CO2` input.
- **lastLeakRate** (MassFlow, kg/s): The CO2 leak rate on the last tick, for monitoring and debugging.

## Parameters

- **maxRateKgPerS** (editable, default 0.001 kg/s): The maximum CO2 leak rate when the command is fully open (1.0). This represents the leak rate through a fully open seal or vent. Typical values range from 0.0001 to 0.01 kg/s depending on the seal or vent size.

## Physics

The leak rate is calculated as:

```
leak_rate = -command × maxRateKgPerS
```

The negative sign indicates that CO2 is leaving the atmosphere (outflow). The command signal linearly scales the leak rate from 0 (no leak) to the maximum rate (fully open).

## Use Cases

- **Seal leaks**: Model slow leaks through habitat seals or hatches.
- **Controlled vents**: Model intentional CO2 venting to regulate cabin pressure or composition.
- **Emergency depressurization**: Model rapid venting scenarios by setting a high command value.

## Assumptions

- The leak rate is proportional to the command signal (linear relationship).
- The command signal is clamped to the range [0, 1].
- The leak is purely CO2; other atmospheric constituents are not affected.
- The leak rate is independent of pressure differential (constant flow model).
