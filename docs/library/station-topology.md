# The station: its topology and its metrics

How the base is laid out and what its logger records, as the station documents it. The layout is the register's (ISA-95 paths, library `this-installation`); the metrics are the columns of the telemetry the station hands over.

## Topology

| path | what | in |
|---|---|---|
| /habitat/lab | the Lab module, a volume of air | |
| /habitat/hab-b | the Hab-B module, a volume of air (living quarters and the rest of the base's pressurised volume) | |
| /habitat/lab/eclss/scrubber-1 | the habitat's CO2 scrubber, centralised: it serves every module through the ventilation (library `scrubber-1-datasheet`) | Lab |
| /habitat/lab/eclss/co2-1 | CO2 sensor | Lab |
| /habitat/hab-b/eclss/co2-2 | CO2 sensor | Hab-B |
| /habitat/lab/hatch-1 | hatch between the Lab and Hab-B | both |
| (ducting) | the inter-module ventilation between the Lab and Hab-B: fans and ducts, not a connected device, so not on the register | both |
| /habitat/power/battery-1 | battery | power |

The scrubber is centralised, as on the International Space Station: one scrubber in the Lab, and an inter-module ventilation that carries Hab-B's air to it and back. Hab-B's CO2 is removed by the scrubber through that ventilation; without it, Hab-B's CO2 would rise without bound. The ventilation's flow depends on the hatch: with the hatch open it passes through the ducts and the hatchway, with the hatch closed through the ducts alone, a smaller flow. The design gives a nominal flow; what the ventilation delivers as installed (filters, dampers, the losses of the ducts) is not documented, and is measured in place.

The as-built volumes are not documented: the drawings give the design, not what the installed racks and stores leave free.

## Metrics: the logger's columns

One row a minute.

| column | unit | source |
|---|---|---|
| minute | min | the logger's clock, from the start of the record |
| co2_lab_ppm | ppm | /habitat/lab/eclss/co2-1 |
| co2_habb_ppm | ppm | /habitat/hab-b/eclss/co2-2 |
| speed_percent | % of full speed | the command of /habitat/lab/eclss/scrubber-1 |

The CO2 sensors read to plus or minus 1 ppm of resolution; their accuracy is about 30 ppm plus 3 % of the reading, their noise a few ppm.

## Levels

ELEVATED from 3,500 ppm, CRITICAL from 4,000 ppm (library `co2-and-people`).

## Crew

Four people on the base. Who is in which module is the medical monitor's (`biomed.presence`); during the commissioning test two operators work in the Lab at light work, the two others are in Hab-B at rest. The CO2 a person produces is in library `co2-mass-balance`.
