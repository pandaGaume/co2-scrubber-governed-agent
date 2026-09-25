# Physics.Habitat:filter

An air filter on a duct, and its fouling: a resistance to the flow that grows with the dust it captures.

## What it computes

    resistance    = cleanResistance * (1 + loading / loadingDoublingKg)      [Pa/(m3/s)^2]
    pressureDrop  = resistance * flow^2                                         [Pa]
    d(loading)/dt = captureEfficiency * dustConcentration * flow                [kg/s], the integrated state
    clogging      = loading / endOfLifeLoadingKg                                0 clean, 1 to be replaced

## Ports

| port | direction | unit | what |
|---|---|---|---|
| flow | in | m3/s | the fan's flow |
| dustConcentration | in | kg/m3 | the editable ambient value when unwired |
| particulate_in | in | particulate | the dust the filter captures, a `Physics.Particulate:*` descriptor of the substrate (`lunar_dust` in the reference); a configuration link, the descriptor names the particle |
| resistance | out | Pa/(m3/s)^2 | for the fan's resistance input |
| pressureDrop | out | Pa | |
| loading | out | kg | |
| clogging | out | ratio | |

## Parameters

| parameter | unit | default | source |
|---|---|---|---|
| cleanResistance | Pa/(m3/s)^2 | 49000 | the clean filter at the design flow |
| loadingDoublingKg | kg | 0.05 | 50 g doubles the resistance |
| captureEfficiency | | 0.9 | |
| ambientDustKgPerM3 | kg/m3 | 1e-6 | 1 mg/m3; NASA limits total dust to 3 mg/m3 |
| initialLoadingKg | kg | 0 | the fault: a filter already fouled at reset |
| endOfLifeLoadingKg | kg | 0.2 | |

## The fault

A fouled filter is a filter with a loading. In the habitat reference, 0.127 kg makes the fan deliver 2.0 m3/min where the design says 3: the gap the commissioning finds and the twin has to carry. At 1 mg/m3 and 3 m3/min the loading grows by about 4 g a day, so a clean filter reaches that state in a month.
