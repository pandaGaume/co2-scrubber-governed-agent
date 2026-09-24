# NASA crew metabolic loads: the CO2 a crewmember produces

What NASA uses as the CO2 a person produces aboard a spacecraft, by activity and by body size, and how these values are meant to be applied. Sources: NASA/TP-2015-218570/REV2, *Life Support Baseline Values and Assumptions Document* (BVAD, February 2022), Tables 3-21, 3-26 and 3-27; NASA-STD-3001 Technical Brief OCHMO-TB-004 Rev B, *Carbon Dioxide* (November 2022), after the NASA *Human Integration Design Handbook* (HIDH, 2014).

## Steady-state output per crewmember (BVAD Rev2, Table 3-26)

From NASA's 41-node metabolic model, at steady state. CO2 in grams per minute; the litres per minute are computed here at 22 °C and 101.3 kPa (1.82 g of CO2 per litre).

| crewmember | asleep | awake (nominal activity in the cabin) |
|---|---|---|
| 5th percentile (1.54 m, 50 kg) | 0.30 g/min (about 0.17 L/min) | 0.48 g/min (about 0.26 L/min) |
| reference (1.75 m, 82 kg) | 0.44 g/min (about 0.24 L/min) | 0.69 g/min (about 0.38 L/min) |
| 95th percentile (1.84 m, 100 kg, high fitness) | 0.51 g/min (about 0.28 L/min) | 0.81 g/min (about 0.45 L/min) |

Daily totals (Table 3-27, 8 hours of sleep, exercise, the rest awake): 0.74 kg/day (5th percentile), 1.08 kg/day (reference), 1.31 kg/day (95th percentile).

## A mission day by activity (HIDH 2014, in OCHMO-TB-004)

Reference crewmember, respiratory quotient 0.92:

| activity | CO2 output |
|---|---|
| sleep | 4.55 x 10^-4 kg/min (about 0.25 L/min) |
| nominal (awake) | 7.2 x 10^-4 kg/min (about 0.40 L/min) |
| exercise at 75 % of VO2max | 49.85 x 10^-4 kg/min (about 2.7 L/min) |
| recovery, first hour after exercise | back to nominal |
| total per day, with exercise | 1.04 kg |
| total per day, without exercise | 0.91 kg |

## How NASA says to apply them

- **They are analysis values, with a band, not a measurement of a crew.** The BVAD gives the range from the 5th percentile female to the 95th percentile male, "a variation of approximately +/- 25 %", and notes that "since the values listed in this section all come from analysis, there is some uncertainty in the numbers".
- **A daily total is not an hourly rate.** About 1 kg per day is an average over sleep, work and exercise: it sizes a scrubber for a mission. Over an hour, take the rate of the activity.
- **The respiratory quotient moves the CO2 for the same oxygen**: 0.86 for nominal and sleep, 0.95 for aerobic exercise in the BVAD; diet changes it (carbohydrates near 1.0, fats near 0.7).
- **Exercise leaves a tail**: the crew keeps releasing stored heat for an hour or more after exercise; the BVAD models CO2 back at nominal once exercise stops.

## For a twin of this station

Per person, in a volume V (m3), a rate g in L/min adds g x 1e3 / V ppm per minute. The documented value of a person's rate is a band: for two operators awake in the Lab, 0.26 to 0.45 L/min each, the reference 0.38. A twin that holds the reference value as exact holds an analysis value as if it were a measurement of this crew: give the band, and let the telemetry place the value within it. Who is where, and at what activity, is the medical monitor's (`biomed.presence`).
