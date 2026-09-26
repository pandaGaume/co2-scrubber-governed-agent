# CO2 Leak (generated)

Models CO2 mass flow leaking from a sealed volume through a passive leak in a seal.

## Purpose

The node computes the CO2 mass flow (kg/s) leaking out of a sealed volume (such as the Lab module) through a leak in a seal. The leak is passive: the flow is proportional to the CO2 concentration in the volume and a constant leak rate parameter.

## Inputs

- **co2_concentration** (Concentration, ppm): The CO2 concentration in the sealed volume. Defaults to 500 ppm when unwired.
- **lab_volume** (Volume, m³): The volume of the sealed space. Defaults to 30 m³ when unwired.

## Output

- **leak_flow** (MassFlow, kg/s): The CO2 mass flow leaking out of the volume.

## Parameters

- **leak_rate** (VolumetricFlow, L/min): The volumetric flow rate of the leak at full opening. Editable; defaults to 0.05 L/min. This parameter must be estimated from telemetry during the decay test.

## Physics

The leak flow is computed as:

```
leak_flow (kg/s) = leak_rate (L/min) × co2_concentration (ppm) / 1e6 × lab_volume (m³) / 1000 / 60
```

This formula:
1. Converts the leak rate from L/min to m³/s (divide by 1000 × 60)
2. Converts the CO2 concentration from ppm to a mass fraction (divide by 1e6)
3. Scales by the volume in liters (lab_volume × 1000)
4. Results in kg/s of CO2 leaking out

## Notes

- The leak is passive and does not depend on pressure differences; it is driven by the CO2 concentration gradient.
- The leak_rate parameter is typically estimated from telemetry during a CO2 decay test, where the Lab is sealed and CO2 is allowed to leak out.
- Generated in the forge; not a hand-written node.
