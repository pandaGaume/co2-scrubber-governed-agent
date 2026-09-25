# Physics.Habitat:person

One person, by name, as a CO2 source in kg/s, at an activity of their own.

## What it computes

    co2Delta = litresPerMinute(activity) * 1e-3 / 60 * co2DensityKgPerM3    [kg/s]

The rate depends on what they do; NASA gives it per activity as a band by body size (library `nasa-crew-metabolic-loads`: awake in the cabin 0.26 to 0.45 L/min, reference 0.38; asleep 0.17 to 0.28). The defaults are the reference crewmember's; a bigger or smaller person edits their own four rates. The density turns litres of CO2 at cabin conditions into a mass (1.82 kg/m3 at 22 C and 101.3 kPa).

## Ports

| port | direction | unit | what |
|---|---|---|---|
| activity | in | a word, or a rung 0 to 3 | sleep, rest, light_work, heavy_work; as a number, the rung of that ladder (a timeline schedules a day with numbers); the editable when unwired |
| co2Delta | out | kg/s | for a crew's person_k input, or an atmosphere's delta_CO2 input |
| litresPerMinute | out | L/min | the same as a volume |
| activityLevel | out | 0 to 3 | what they are doing, for a plot |

## Parameters

| parameter | unit | default | source |
|---|---|---|---|
| name | | | the medical monitor's roster (profiles/biomed.json) |
| callsign | | | CDR, FE-1, ... |
| activity | | rest | |
| sleepLitresPerMinute | L/min | 0.24 | NASA BVAD Rev2, reference crewmember asleep |
| restLitresPerMinute | L/min | 0.30 | between asleep and awake |
| lightWorkLitresPerMinute | L/min | 0.38 | the reference crewmember awake; a twin takes the band |
| heavyWorkLitresPerMinute | L/min | 1.0 | well below exercise (2.7 at 75 % VO2max) |
| co2DensityKgPerM3 | kg/m3 | 1.8176 | ideal gas at 101325 Pa, 295.15 K |

## In a graph

A person is wired into the crew of the module they are in (`Physics.Habitat:crew`, its `person_<k>` pool: one input per person, the next appearing as the last is taken), which sums its people into one source for the atmosphere. In the habitat reference the four persons of the roster are four nodes: two operators at light work in the Lab, the commander and FE-3 at rest in Hab-B.

## Notes

A twin never holds a person's rate as exact: it is a band, and the telemetry places the value within it (library `co2-mass-balance`). Who is where is the medical monitor's to say (`biomed.presence`); a person on a graph should be a person the station knows.
