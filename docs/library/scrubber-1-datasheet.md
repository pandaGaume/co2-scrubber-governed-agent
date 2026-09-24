# Datasheet: CO2 scrubber /habitat/lab/eclss/scrubber-1

The device documentation of the Lab's scrubber, as its maker and its bench measured it. What the bench can measure is here; what depends on the room it is installed in (the volume it serves, the air exchanged with the next module) is not, and is measured in place.

**Device:** /habitat/lab/eclss/scrubber-1

## Construction

A regenerable scrubber: a variable-speed fan draws the cabin air through absorbent beds (library `co2-scrubbers`). The speed command is a percent of full speed, 0 to 100, taken by the board.

## Constants measured on the bench (September 2026)

| constant | value | how it was measured |
|---|---|---|
| air flow at full speed | 0.055 m3/s (3.3 m3/min) | anemometer at the outlet, full command |
| single-pass removal efficiency | 0.30 | inlet and outlet CO2 at nominal bed temperature |
| effective flow at full speed (Qe = flow x efficiency) | 1.0 m3/min | the two above |
| effective flow at a command c (0 to 1) | c x 1.0 m3/min | proportional over 20 to 100 %, the fan's law in that range |
| response to a change of command | first order, time constant 3.33 min | step of the command, removal recorded until settled |
| current | 0.0879 + 0.1611 x c A at 6 V | the bench's fit, 20 stable points |

These are properties of the machine, the same wherever it is installed: a model of an installation takes them as known inputs and does not fit them.

## Rules the board enforces (firmware, not configurable by the agent)

- A speed outside 0 to 100 % is refused, not clamped.
- While the cabin CO2 is ELEVATED, no speed below the minimum flow (40 % by default, never set below 40 %).
- While it is CRITICAL, full speed is forced and any reduction refused.

## What it publishes

Its speed command (percent) and its current (A), and in its descriptor the air flow at full speed. The logger of the station records the command as `speed_percent` (library `station-topology`).
