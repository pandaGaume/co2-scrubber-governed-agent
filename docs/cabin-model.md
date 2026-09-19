# The cabin twin: model, assumptions, and how to review them

This is the physics the agent reasons with, the oracle the factory judges
against, and the source of every number the video states. It is written to
be reviewed and changed: every constant lives in one file,
`specs/cabin-parameters.json`, with its value, its unit, where it comes
from and whether it has been reviewed. The story's schedule lives in
`specs/scenario-night-9.json`. Nothing in the code repeats a value from
these files; the graph, the jobs and the firmware surrogate read them.

## 1. The model

A well-mixed cabin, one state for the air (CO2 in ppm) and one for the
scrubber (its effective removal rate, which lags its command). Time in
minutes of story.

```text
emission  = sum over the crew of emissionPerPerson[activity]              [ppm/min]
target    = rateAtFullCommand * command                                    [1/min], command in 0..1
d(rate)/dt = (target - rate) / lagTimeConstantMinutes
removal   = rate * max(co2 - removalFloorPpm, 0)                           [ppm/min]
leak      = leakPerMinute * co2                                            [ppm/min]
d(co2)/dt = emission - removal - leak,   clamped to [floorPpm, ceilingPpm]
```

Three states follow from two thresholds: NOMINAL below `elevatedPpm`,
ELEVATED up to `criticalPpm`, CRITICAL from there. The firmware's MIN-FLOW
rule reads these states: while ELEVATED, no command below the floor and no
power off; while CRITICAL, full command forced and no reduction accepted.

Power and energy:

```text
power       = supplyVolts * (interceptAmps + slopeAmps * command) * habitatScale   [W]
d(energy)/dt = (power + otherLoadsW) / 60                                           [Wh/min]
stateOfCharge = 100 * (capacityWh - energy) / capacityWh                            [%]
```

The shape of the power curve is measured: it is the current-versus-command
line the factory fitted on the real motor of the bench. The scale is an
assumption that makes a bench motor speak in habitat watts; it is flagged
for review like everything else.

## 2. Where the model comes from

The equations are those of the SpikyPanda CO2 control sample
(`packages/host/www/samples/co2-mpc`, with its Python reference
`simulate_co2.py`), on which the sample's small ONNX dynamics model was
trained. Two changes for this demo:

- the scrubber command is continuous (the board's speed percent) instead of
  the sample's four levels, with the rate linear in the command; the file
  says so and leaves room for a measured curve;
- the lag is expressed as a time constant in minutes rather than a
  per-step fraction, so that the twin's solver can take any step; the
  values are the continuous equivalents of the sample's.

The board's own on-board CO2 simulation (`CREW_LOAD_PPM_PER_S`,
`MAX_SCRUB_PPM_PER_S` in the firmware) is a linear surrogate of this model.
It becomes a fitted one: the factory's `fit` will derive its constants from
the twin, and `evaluate` will judge the surrogate against the twin, exactly
as it does for the health model.

## 3. What a reviewer can change, and how to replay

Every leaf of `specs/cabin-parameters.json` has this shape:

```json
{ "value": 3.5, "unit": "ppm/min per person", "source": "co2-mpc sample", "status": "to review", "note": "awake, seated" }
```

Change `value`, set `status` to `reviewed` (and add who and when in `note`),
keep the file. Then:

```sh
npm run twin:parity     # the twin against the sample's reference step, on the night-9 schedule
npm run plan            # the plan job on the schedule: minimal safe flow per segment, energy returned
npm run chain           # the factory chain, unchanged
```

Every job writes a manifest with the sha256 of the parameter file and of
the scenario it ran on. A number in the video therefore points back to the
exact assumptions it was computed with, and a reviewer who disagrees with
an assumption can change it and see every downstream number move.

## 4. What is open for review

The reviewer of the life-support side has been asked to look at four
things, and the file marks each with `status: "to review"`:

1. **CO2 removal assumptions**: the emission per person and activity, the
   removal rate at full command and its presets, the removal floor, the
   lag, the leak, the linear command-to-rate mapping.
2. **The power budget**: the supply voltage, the habitat scale, the other
   loads, the battery capacity, the state of charge on night 9.
3. **The operating constraints**: the minimum-flow floor (to be read from
   the T0 sweep, then reviewed), the schedule of the night, the twenty
   minutes of the poisoned procedure.
4. **The alarm thresholds**: `elevatedPpm` and `criticalPpm`, and the
   nominal target the plan regulates toward.

The constraints the story needs are written in the scenario file with
`status: "to compute"`: a twenty-minute stop during the morning exercise
must cross CRITICAL; the plan must keep the cabin NOMINAL; the floor must
hold for four resting people. If the twin says one of them does not hold,
the parameters or the schedule change, never the text.

## 5. First run, 19 September 2026: what the twin says

`npm run twin:build` then `npm run twin:parity`, with the parameter file at
sha256 `c0d8ace9...` and the night-9 scenario at `a2a795e4...`:

- parity between the twin (RK4 at one story minute per step) and the
  sample's explicit minute step: worst gap 0.63 % over eight hours;
- baseline at 33 % command, normal preset: the cabin goes from 1500 to
  1623 ppm over the night and never leaves NOMINAL; the battery goes from
  41 % to 17.9 %;
- the floor holds: four people resting at 40 % settle at 1048 ppm;
- **the twenty-minute stop during the exercise does not cross CRITICAL**:
  at minute 230 the cabin is at 1081 ppm, and a 20-minute stop peaks at
  1371 ppm, far below 4000.

The last line is a finding, not a bug: with the sample's constants the
scrubber is strong for four people, and the story's danger does not
exist. The rule of this repository is that the parameters or the schedule
change, never the text. The levers, all in the parameter file and all for
the reviewer:

1. **The cabin volume.** The sample's rates fold a volume into them; a
   smaller module scales both the emission (ppm/min) and the removal rate
   (1/min) by the same factor, which leaves the steady state unchanged and
   makes every transient faster. A `cabin.volumeScale` parameter (rates
   times the scale) is the physical lever.
2. **The operating point.** The story's plan runs the cabin as high as
   NOMINAL allows to save energy (the plan job regulates toward
   `thresholds.nominalTargetPpm`, close to `elevatedPpm`), so that the
   message arrives with little margin; a 33 % baseline sits far below.
3. **The thresholds.** `elevatedPpm` and `criticalPpm` are the sample's
   comfort and vital limits; a habitat's rules may sit lower.

Until the reviewer decides, the scenario file carries the finding in the
constraint's `status`, and no text in the README states a time to
critical.
