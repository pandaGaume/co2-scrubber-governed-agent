# CO2 scrubbers: how they remove CO2, and how they behave

A CO2 scrubber draws air through a sorbent that holds CO2 and returns the air with less of it. Its removal rate depends on the air flow through it, the CO2 concentration of the air it draws, and the efficiency of one pass through the sorbent.

## Families

- **Non-regenerable sorbents** (lithium hydroxide canisters): the sorbent is consumed; used for short missions and as a backup.
- **Regenerable beds** (solid amines, zeolite molecular sieves): the sorbent adsorbs CO2, then is regenerated (heat, vacuum or both) to release it. Beds work in cycles, often two or more beds alternating so one adsorbs while another regenerates. The International Space Station's Carbon Dioxide Removal Assembly uses zeolite beds on this principle.

## Removal rate

For a well-mixed volume, the CO2 removed per unit of time is approximately

    removal = eta * Q * C

with Q the volumetric flow through the scrubber, C the concentration of the air it draws, and eta the single-pass efficiency (the fraction of the CO2 in the incoming air that the bed holds). The fan speed sets Q; a scrubber at a fraction of full speed moves roughly that fraction of its full-speed flow. The product eta * Q is the effective flow: the volume of air per unit of time that the scrubber cleans completely.

## Stopping and restarting

A regenerable scrubber does not return to its full removal rate the instant it is restarted. The bed's temperature, its loading and the phase of its cycle have to come back to their working values; depending on the design this takes minutes to tens of minutes. While it recovers, the cabin has less removal than its crew needs, and no other removal unless there is a backup.

Operators of crewed volumes therefore distinguish reducing a scrubber's speed (the removal continues, lower) from stopping it (the removal ends, and its return is delayed).

## What a scrubber publishes

A scrubber on this base publishes its speed command (percent of full speed), its motor current, and in its descriptor its flow at full speed (`flowAtFull`, m3/s). It knows how much air it moves; it does not know the volume of the room it moves it in.
