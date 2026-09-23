# The CO2 of a volume of air: mass balance, equilibrium and time constant

The CO2 concentration of a well-mixed volume follows from what enters it and what leaves it. With people as the only source and a scrubber as the only sink:

    V * dC/dt = G - Qe * C

- V: the volume of air, m3;
- C: the CO2 concentration (as a volume fraction, or in ppm with G in the same units);
- G: the CO2 produced by the occupants, volume per unit of time;
- Qe: the effective flow of the scrubber (flow through it times its single-pass efficiency), m3 per unit of time.

## Equilibrium

When nothing changes, C settles where production and removal balance:

    C_eq = G / Qe

Lowering the scrubber's speed lowers Qe and raises the equilibrium; raising it lowers the equilibrium. With the same people, a slower scrubber holds the air at a higher CO2 level.

## Time constant

After a change of speed, C moves from where it was towards the new equilibrium exponentially:

    C(t) = C_eq + (C_0 - C_eq) * exp(-t / tau),   tau = V / Qe

The time constant tau is the volume divided by the effective flow. Knowing Qe (from the scrubber) and measuring tau (from the curve) gives V = Qe * tau. A step change of speed, one way or the other, produces such a curve; the measurement needs the curve to run long enough, a time constant or more, and a concentration that moves far enough above the sensor's noise.

Note that the curve decays towards C_eq, not towards zero and not towards the outside air: the occupants keep producing. A fit that forces the curve towards zero, or towards 400 ppm, gives a wrong tau.

## Occupants as a source

A resting adult produces roughly 0.3 L of CO2 per minute, more when working. Spaceflight planning uses about 1 kg of CO2 per crew member per day (about 0.35 L/min at cabin conditions). At 1 atm and 20 C, 1 ppm of CO2 is about 1.8 mg per m3.

## Two volumes

Two volumes connected by an opening exchange air at a flow q that depends on the opening (a hatch open or closed) and on the ventilation:

    V1 * dC1/dt = G1 - Qe * C1 - q * (C1 - C2)
    V2 * dC2/dt = G2          + q * (C1 - C2)

(the scrubber in volume 1). If q is zero, the second volume ignores what the scrubber does. If q is not zero, a change in C1 shows in C2, smaller and later. Whether q is zero with a closed hatch is a question a measurement of C2 during a test on volume 1 can answer.

## Conversions

At 1 atm (101.3 kPa), a CO2 partial pressure of 1 mmHg is about 1,316 ppm; 1 kPa is about 9,870 ppm.
