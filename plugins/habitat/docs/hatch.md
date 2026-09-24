# Physics.Habitat:hatch

The CO2 exchanged between two volumes through a hatch: an exchange flow when open, the seals' leak when closed. The same balance as the duct, with the flow chosen by the hatch's state.

## What it computes

    flow      = open ? openExchangeM3ps : closedLeakM3ps
    flux      = flow * (co2MassPerM3(ppmA) - co2MassPerM3(ppmB))     [kg/s]
    co2DeltaA = -flux,  co2DeltaB = +flux

## Ports

| port | direction | unit | what |
|---|---|---|---|
| open | in | 0 or 1 | the editable when unwired; a timeline drives the hatch |
| ppmA, ppmB | in | ppm | the two volumes' ppm_CO2 |
| pressure, temperature | in | Pa, K | the editable defaults when unwired |
| co2DeltaA, co2DeltaB | out | kg/s | for the two atmospheres' delta_CO2 inputs |
| exchangeFlow | out | m3/s | |

## Parameters

| parameter | unit | default | source |
|---|---|---|---|
| openExchangeM3ps | m3/s | 0.066 | an inter-module ventilation's order with the hatch open (140 cfm on the ISS) |
| closedLeakM3ps | m3/s | 0 | nothing documented for the seals |
| open | | false | |

## Notes

With the hatch closed and no leak, the modules exchange only through the ventilation duct: the design of this station (library `station-topology`).
