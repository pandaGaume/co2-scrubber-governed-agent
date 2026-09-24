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

The CO2 a person produces follows the metabolic rate, so it depends on the activity and on the person. NASA's values are in library `nasa-crew-metabolic-loads` (BVAD Rev2): awake in the cabin, 0.48 to 0.81 g/min from the 5th to the 95th percentile (about 0.26 to 0.45 L/min), 0.69 g/min for the reference crewmember (about 0.38 L/min); asleep, 0.30 to 0.51 g/min. About 1 kg of CO2 per crewmember per day is a day's average over sleep, work and exercise: it sizes a scrubber for a mission, it is not the rate of an hour. The values come from analysis, with a band of about 25 %: a twin takes the band, not one number, unless the source is a metered injection (library `nasa-scrubber-test-protocols`).

At 1 atm and 20 C, 1 ppm of CO2 is about 1.8 mg per m3.

## Two volumes

Two volumes connected by an opening exchange air at a flow q that depends on the opening (a hatch open or closed) and on the ventilation:

    V1 * dC1/dt = G1 - Qe * C1 - q * (C1 - C2)
    V2 * dC2/dt = G2          + q * (C1 - C2)

(the scrubber in volume 1, serving volume 2 through the exchange). A habitat with one scrubber relies on q: if q were zero, the second volume's CO2 would rise without bound, a volume nobody can live in. So q is not a question of yes or no but of how much: a change in C1 shows in C2, smaller and later, and how much and how late gives q. How large q is as installed, with the hatch closed or open, is what a measurement of C2 during a test on volume 1 answers.

## Conversions

At 1 atm (101.3 kPa), a CO2 partial pressure of 1 mmHg is about 1,316 ppm; 1 kPa is about 9,870 ppm.
