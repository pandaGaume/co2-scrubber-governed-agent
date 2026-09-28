# Safety card: the limits of a commissioning test on an occupied module

The bounds every test procedure on the Lab's scrubber stays within, whoever writes the procedure. A procedure's safety constants (its CO2 limits, its speeds, its duration, its abort thresholds, the heart-rate band it watches) are justified by these facts and respect them; a value found, computed or assumed elsewhere is not a safety limit.

**Status:** to be reviewed and signed by a person (`npm run library:sign -- commissioning-test-safety "<name>"`). Until it is signed, and as soon as it changes after being signed, the factory's guard and Mother refuse every procedure whose safety constants cite it.

## The facts, and which side of each is safe

| Fact | Value | Safe side | Where it comes from |
|---|---|---|---|
| `test.speedFloorPercent` | 30 % | at or above | The reduced speed of the concentration-decay test decided on 2026-09-22 (`docs/mise-en-service.fr.md`, section 9): a test on the only scrubber of a volume never commands it below 30 % and never stops it, because a scrubber does not restart at once and a stopped one leaves no margin. |
| `test.co2AbortCeilingPpm` | 3200 ppm | at or below | Under the cabin's ELEVATED level (3500 ppm, `station-topology`, `habitat.co2.elevatedPpm`): a test that stops at 3200 ppm never hands the board a MIN-FLOW situation it did not ask for. |
| `test.maxMinutesCeiling` | 60 min | at or below | The longest exposure of the occupants a single test may cause. |
| `test.startHeadroomPpm` | 200 ppm | at or above | The room a procedure's CO2 maximum leaves above the CO2 measured when the test starts: a maximum at or under it stops the test at its first readings. |
| `test.batteryAbortMinPercent` | 35 % | at or above | The battery's state of charge under which a test stops: the reserve the night keeps for the scrubber. |
| `test.heartRateMinBpm` | 45 bpm | at or above | The lower edge of the band the medical monitor watches during a test: a band that starts lower watches less. |
| `test.heartRateMaxBpm` | 120 bpm | at or below | The upper edge of that band: a band that ends higher watches less. |

## How a procedure uses it

- A procedure's `limits.co2AbortPpm`, and its `limits.co2MaxPpm` under it, are at or below `test.co2AbortCeilingPpm`; its maximum is also at least `test.startHeadroomPpm` above the CO2 measured at the start.
- `limits.minSpeedPercent` and every step's `speedPercent` are at or above `test.speedFloorPercent`.
- `limits.maxMinutes` is at or below `test.maxMinutesCeiling`.
- A battery abort's `threshold` is at or above `test.batteryAbortMinPercent`.
- A monitoring band's `minBpm` is at or above `test.heartRateMinBpm`, its `maxBpm` at or below `test.heartRateMaxBpm`.

Each of these is written in the procedure's `justifications` with `source: "library"` and the fact's id as its `reference`.
