# CO2 Leak

## Purpose

A CO2 leak source for the habitat atmosphere: models a controlled leak through a seal or vent. The mass flow leaving is scaled by a command signal (0 to 1), where 1 represents full opening.

## Inputs

- **command** (Dimensionless, ratio): Leak opening fraction from 0 (closed) to 1 (fully open). Defaults to 1 when unwired.

## Outputs

- **co2Delta** (MassFlow, kg/s): CO2 mass flow leaving the atmosphere. Negative value indicates outflow (mass leaving the system).
- **lastLeaked** (Mass, kg): CO2 mass that left during the last simulation tick. Useful for monitoring cumulative loss.

## Parameters

- **rateKgPerS** (editable, kg/s): Maximum CO2 mass flow rate when the leak is fully open (command = 1). Default: 0.001 kg/s. Must be non-negative.

## Physics

The node implements a simple proportional leak model:

```
co2Delta = -command × rateKgPerS
massLeaked = |co2Delta| × dt
```

Where:
- `command` is clamped to [0, 1]
- `dt` is the simulation time step
- The negative sign indicates mass leaving the atmosphere

## Use Cases

- Modeling slow leaks through habitat seals
- Simulating controlled vents for pressure relief
- Testing atmosphere dynamics under gradual CO2 loss

## Assumptions

- The leak rate is independent of pressure difference (constant flow model)
- The command signal is a simple proportional control (0 to 1)
- CO2 is the only gas leaving through the leak
