# Lab and Hab-B: reference layout and documented air volumes

The demonstration habitat has a documented Lab air volume of **30 m3** and a documented Hab-B air volume of **400 m3**. Published at the operator's request on 2026-10-20 so agents can retrieve these values through the library instead of repeatedly asking for them. These are declared values of the simulated reference installation, not measurements of a Houston laboratory.

## Layout

```text
/habitat/lab                                  /habitat/hab-b
Lab, 30 m3                                   Hab-B, 400 m3
scrubber-1 and CO2 sensor co2-1                CO2 sensor co2-2
        |                                           |
        +--------- hatch-1 and ventilation -----------+
```

This is a topology plan, not a scaled architectural drawing. No room lengths, widths, heights or physical site dimensions are supplied by this record. The central scrubber is installed in the Lab and serves the connected habitat through ventilation. Equipment locations and device paths are listed in `station-topology`.

## Volumetric schedule

| Module | Path | Available air volume | Evidence |
|---|---|---|---|
| Lab | `/habitat/lab` | 30 m3 | `specs/habitat-parameters.json`, `parameters.lab.volumeM3.value`; also `LAB_WORLD.VLab` in `stand-ins/worlds/two-zone-world.ts` |
| Hab-B | `/habitat/hab-b` | 400 m3 | `specs/habitat-parameters.json`, `parameters.habB.volumeM3.value`; also `LAB_WORLD.VHab` in `stand-ins/worlds/two-zone-world.ts` |

The parameter record distinguishes a Lab design volume of 32 m3 before racks from its 30 m3 available air volume. Use the quantity appropriate to the question; the gross design volume and available air volume are different facts. The parameter file is a draft reference model. This signed publication establishes the declared context for the demonstration, not independent experimental verification of that model or qualification of the scrubber twin.

## Scope of the information

The volume facts are now available knowledge for this reference installation. Older library statements that the volumes were not documented describe the earlier information state. Read this record and its typed facts for the current volumetric schedule. A reasoner may use documented volumes with their provenance and decide whether additional validation is needed; this document does not prescribe its next action.

This publication does not supply an installed ventilation flow or a hatch-open flow. A nominal duct design flow is documented separately in `station-topology`; design and measured flow remain distinct. Do not derive a ventilation measurement, a time-series data set or a successful test from these volume values.
