# CO2 Leak (generated)

Models a passive leak from a sealed volume. The leak is a mass flow driven by the pressure difference across a seal, proportional to the seal's conductance and the gas density.

## Inputs

- **pressure_source** (Pa): Pressure on the source side of the seal. Defaults to 101325 Pa when unwired.
- **pressure_sink** (Pa): Pressure on the sink side of the seal. Defaults to 101000 Pa when unwired.
- **density** (kg/m³): Gas density at the leak point. Defaults to 1.2 kg/m³ when unwired.

## Output

- **leak_co2** (kg/s): Mass flow rate through the leak.

## Parameters

- **conductance** (m³/s): The seal's conductance, editable. Default 1e-11 m³/s. Controls the leak rate at a given pressure difference.
- **pressure_reference** (Pa): Reference pressure for normalization. Fixed at 101325 Pa, not editable.

## Physics

The leak mass flow is computed as:

```
leak_co2 = conductance × (pressure_source - pressure_sink) / pressure_reference × density
```

This models a passive leak where the flow is proportional to:
- The pressure difference across the seal (driving force)
- The seal's conductance (geometric and material properties)
- The gas density (mass per unit volume)

Generated in the forge; not a hand-written node.
