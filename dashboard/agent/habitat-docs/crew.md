# Physics.Habitat:crew

People as a CO2 source, in kg/s: the persons wired into it, and a head count for the people nobody names.

## What it computes

    co2Delta = sum_k person_k + count * litresPerMinute(activity) * 1e-3 / 60 * co2DensityKgPerM3    [kg/s]

Each `person_k` input is a `Physics.Habitat:person`'s `co2Delta`, at that person's own activity and rates. The count is the older form: a group at one activity, each at the per-person rate NASA gives as a band by body size (library `nasa-crew-metabolic-loads`: awake in the cabin 0.26 to 0.45 L/min, reference 0.38; asleep 0.17 to 0.28). The density turns litres of CO2 at cabin conditions into a mass (1.82 kg/m3 at 22 C and 101.3 kPa).

## Ports

| port | direction | unit | what |
|---|---|---|---|
| person_0, person_1, ... | in | kg/s | one per person wired in (a `Physics.Habitat:person`'s co2Delta); the pool grows as persons are added: the studio shows the next empty input, a document names it |
| count | in | person | the unnamed people, on top of the persons wired; the editable when unwired; a timeline drives a schedule |
| activity | in | sleep, rest, light_work, heavy_work | the unnamed people's activity; the editable when unwired |
| co2Delta | out | kg/s | persons and count together, for an atmosphere's delta_CO2 input |
| litresPerMinute | out | L/min | the same as a volume |
| headcount | out | person | the persons wired plus the count |

## Parameters

| parameter | unit | default | source |
|---|---|---|---|
| count | person | 2 | 0 in the habitat reference, where everyone is a person node |
| activity | | light_work | |
| sleepLitresPerMinute | L/min | 0.24 | NASA BVAD Rev2, reference crewmember asleep |
| restLitresPerMinute | L/min | 0.30 | between asleep and awake |
| lightWorkLitresPerMinute | L/min | 0.38 | the reference crewmember awake; a twin takes the band |
| heavyWorkLitresPerMinute | L/min | 1.0 | well below exercise (2.7 at 75 % VO2max) |
| co2DensityKgPerM3 | kg/m3 | 1.8176 | ideal gas at 101325 Pa, 295.15 K |

## Notes

A twin never holds a person's rate as exact: it is a band, and the telemetry places the value within it (library `co2-mass-balance`). A crew of persons lets each one keep their own day: one asleep while another works, and the sum is what the atmosphere sees.
