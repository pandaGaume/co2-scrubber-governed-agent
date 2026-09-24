# Physics.Habitat:fan

A ventilation fan on a duct: from a command to the flow it delivers against the duct's and the filter's resistance.

## What it computes

    fan      dp = k * s^2 * (1 - (Q / (Qfree * s))^2)    k = capacityFactor * shutoffPressure, s the speed ratio
    system   dp = R * Q^2                                 R = ductResistance + resistance (the filter's, wired)
    Q        = s * sqrt(k / (R + k / Qfree^2))            [m3/s], where the two meet
    d(s)/dt  = (command - s) / spinUpSeconds              the integrated state
    power    = standbyPowerW + R * Q^2 * Q / fanEfficiency

The fan laws are built in: pressure with s^2, flow with s. With a clean filter Q is the design flow; as the filter loads, R grows and Q falls at the same command.

## Ports

| port | direction | unit | what |
|---|---|---|---|
| command | in | 0 to 1 | the commanded fraction of rated speed |
| resistance | in | Pa/(m3/s)^2 | the filter's resistance |
| flow | out | m3/s | delivered at the operating point |
| pressureRise | out | Pa | |
| power | out | W | |
| speedRatio | out | 0 to 1 | after the spin-up |

## Parameters

| parameter | unit | default | source |
|---|---|---|---|
| shutoffPressurePa | Pa | 250 | the curve's left end (zero flow, full speed) |
| freeDeliveryM3ps | m3/s | 0.09 | the curve's right end (zero pressure) |
| ductResistance | Pa/(m3/s)^2 | 20000 | the duct without the filter |
| spinUpSeconds | s | 5 | |
| fanEfficiency | | 0.5 | air power over electrical power |
| standbyPowerW | W | 2 | |
| capacityFactor | | 1 | below 1: a degraded fan, the whole curve lower (fault) |
| initialSpeedRatio | | 0 | the speed at reset |

## Notes

- Later a motor node drives the speed ratio from its shaft speed; the operating point is the same computation.
- The design flow of this station: 3 m3/min with a clean filter (library `station-topology`); what is delivered is measured.
