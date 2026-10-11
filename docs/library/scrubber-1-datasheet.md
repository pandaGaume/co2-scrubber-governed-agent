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
| restart latency | 10 min without removal after a stop, then the response above | bed temperature and loading back to their working values (library `co2-scrubbers`: minutes to tens of minutes); to measure on the scrubber |

These are properties of the machine, the same wherever it is installed: a model of an installation takes them as known inputs and does not fit them.

## Power in the habitat

The bench motor stands for the habitat's scrubber at a scale of 300 (1 W on the bench is 300 W in the habitat; `specs/cabin-parameters.json`, habitatScale, an assumption to review). In the habitat, at a command c above 0:

    power = 6 V x (0.0879 + 0.1611 x c) A x 300 = 158 W + 290 W x c

that is about 254 W at 33 % and 448 W at full speed. Stopped, it draws nothing. During a restart the motor runs at the speed it restarts at while the beds remove nothing yet. The station's twin computes the energy of a run the same way (`twin.time_to_critical`, scrubberEnergyWh).

## The board's guard (firmware, not configurable by the agent)

The board guards the cabin's CO2, not the motor's speed (2026-10-11; `specs/scrubber/guard.json`, every number with its source). The speed is a command; what is protected is the CO2 partial pressure and the ability to recover.

- A speed outside 0 to 100 % is refused, not clamped. A speed of 0 is a stop.
- A software stop is bounded: it names its minutes, 60 at most (`scrubber.stop`). An unbounded power off is refused.
- A lower speed or a stop is accepted only when the CO2 reading is fresh (under 5 s) and valid, the cabin pressure is within its bounds, and the board's own forecast keeps the CO2 partial pressure under the warning line (2.7 mmHg, about 3550 ppm at 101.3 kPa) minus a recovery margin (0.1 mmHg). The forecast counts the CO2 the crew emits as the board estimates it from its own readings, the stop, the restart latency and the recovery; a stop also needs the restart available, with its energy reserved.
- During a stop the board restarts the scrubber on its own: at the end of the stop, back to the speed before it; at once at full speed when the restart margin is lost, or the CO2 reading goes stale or invalid, or the pressure leaves its bounds. A restart that fails raises the alarm RESTART FAILED.
- At or above the limit (3.0 mmHg, about 3950 ppm), full speed is forced and any reduction refused.
- What the board reads, its lines and its last actions are in its state (`motor.state`: guard, atmosphere, guardLines, restart, stop, guardActions). `scrubber.check` answers what it would do with a command, with its forecast, without doing it.

The board can still run its earlier speed guard, a local setting (`guard: speed` in its state): there, software never stops the scrubber (no power off, no speed below the run floor of 30 %), while the cabin CO2 is ELEVATED no speed below the minimum flow (40 % by default, never set below 40 %), and while it is CRITICAL full speed is forced.

## What it publishes

Its speed command (percent) and its current (A), and in its descriptor the air flow at full speed. The logger of the station records the command as `speed_percent` (library `station-topology`).
