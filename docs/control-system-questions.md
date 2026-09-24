# Questions for a control engineer: the CO2 twin, its identification, its use in control

*Written on 24 September 2026 for Dr Grigoriadis, from the commissioning work
on branch `commissioning-core`. The French documents it summarises are
`usine-de-graphes.fr.md` (the identification) and
`exemple-mise-en-service.fr.md` (a full run on the real model). This page is
self-contained: section 1 gives the system and what we do today, sections 2
to 10 are the questions, grouped by topic, each with why we ask it.*

---

## 1. The system and what we do today

**The plant.** Two air volumes of a lunar habitat, the Lab and Hab-B, joined
by a hatch. The only CO2 scrubber is in the Lab. Four people: two in the Lab
at light work, two in Hab-B at rest. Measured once a minute: CO2 in each
volume (ppm) and the scrubber's speed command (percent). Sensors: 1 ppm
resolution, accuracy about 30 ppm + 3 % of reading, noise a few ppm.

**The model structure we identify (grey box).**

```
V_L dC_L/dt = G_L - Qe * u_f(t) * C_L - q * (C_L - C_H)
tau du_f/dt = u(t) - u_f(t)                     (scrubber lag, tau = 3.33 min)
```

- `C_L`, `C_H`: CO2 in the Lab and in Hab-B (ppm); `C_H` enters as a
  measured input, not as a state.
- `u(t)`: speed command, 0 to 1; `Qe`: effective flow at full speed,
  1.0 m3/min (flow 3.3 m3/min times single-pass efficiency 0.30, from the
  bench datasheet).
- `G_L`: CO2 produced by the Lab's crew (from occupancy and activity).
- **Unknown:** `V_L`, the as-built volume (m3), and `q`, the exchange flow
  through the closed hatch (m3/min). The hatch seals are not rated for
  tightness, so q is a hypothesis, not a fact.

The system is **bilinear**: the command multiplies the state.

**The experiment.** A two-step test, hatch closed: 30 % for 30 minutes (the
CO2 rises), then 100 % for 30 minutes (it decays towards an equilibrium).
Safety envelope, enforced by code: never below 30 % (the minimum flow),
abort above 3200 ppm, at most 60 minutes, medical monitoring of the
occupants.

**How the model is built.** A language model (the "builder") writes the
structure, as a graph of catalogue nodes with parameters written as
formulas over a few variables. Code does everything numeric:
- it estimates the unknown variables within bounds the builder gives, with
  an interchangeable estimator (bounded Nelder-Mead by default, or a grid);
- it simulates each trial over the whole record (output-error, open loop);
- it computes the RMSE per compared column and accepts a candidate only
  under a threshold (25 ppm today, set by the operator).

What the documentation gives (Qe, the lag, the crew's CO2 rate) is held
fixed, never fitted. When a candidate fails, the builder may change the
parameters' bounds or the structure (add the exchange term, for instance).

**What the first real run showed.**
- The one-room decay fit (the classic concentration-decay method) gave an
  apparent volume of 38.6 m3 against a true 30 m3: the unmodelled exchange
  was absorbed by the volume.
- The graph builder made a unit error in all seven of its candidates (Qe in
  m3/min where the node expects Qe/V in 1/min), so no fit could close the
  gap.
- We now check the slope of the first five minutes, predicted against
  measured: a twin that parts from the measurement at once, or moves the
  wrong way, is told its rates are probably in the wrong unit. The check
  refuses nothing; it says so with the numbers.

**What the second run showed** (after that check, a shared vocabulary of
quantities and library access for the requirement writer):
- The best candidate came to 41.5 ppm (threshold 25), against 679 ppm in the
  first run. The first-slope check fired on four candidates; after the two where
  the rates were off by an order of magnitude, the next candidate went back
  to plausible rates.
- But the known and the unknown were swapped. The apparent volume (35 m3,
  from the one-room decay) was taken as a fact and held fixed. The datasheet
  constants were fitted: the scrubber lag came out at 41 to 45 minutes
  against 3.33 on the bench. A constant "extra emission" with no physics
  behind it was added to close the gap. The threshold held, and nothing was
  accepted, but it is equifinality in practice (question 8).

---

## 2. The identification criterion

1. **Output error or prediction error.** The twin is used to simulate 30
   minutes ahead in open loop, so we fit on simulation error. Is that the
   right criterion here? Or should we estimate on one-step prediction error
   and only validate in simulation?
2. **The noise model.** The sensor error is partly proportional to the
   reading (3 %). Should the residuals be weighted (weighted least squares),
   or is the plain RMSE acceptable at these levels (1500 to 1900 ppm)?
3. **Initial conditions.** We take the first measurement as the initial
   state. Should the initial state be estimated with the parameters, given
   the sensor accuracy of ±75 ppm at 1500 ppm?

## 3. Experiment design

4. **Is two steps enough?** In theory, 30 % then 100 % separates V and q
   when Qe is known. Within the envelope (never below 30 %, CO2 under 3200
   ppm, 60 minutes at most), what command sequence gives the most
   information on (V, q)? Would a pseudo-random binary sequence between 30 %
   and 100 % do better for the same duration, given the 3.33 min lag of the
   scrubber and the one-minute sampling?
5. **The bilinearity.** Because the command multiplies the state, does the
   choice of the operating levels (where the CO2 sits when the step comes)
   change the information? Should the experiment be designed on a
   linearisation around a trajectory, or on the bilinear model directly?
6. **Using the neighbour.** Hab-B's CO2 moves slowly and is measured. Does it
   give enough excitation to identify q, or should the test deliberately
   create a difference between the volumes first (for example by running
   longer at low speed)?

## 4. Identifiability

7. **Identifiability as a guard.** Today a rule says "what is documented is
   not fitted". Could this become a check computed before any estimation,
   such as the rank of the sensitivity matrix or the conditioning of the
   Fisher information on the nominal trajectory, that refuses a structure
   whose parameters the experiment cannot separate?
8. **Equifinality.** The one-room fit shows that a wrong structure can hide
   behind a wrong parameter (38.6 m3 instead of 30). The second run went
   further: a lag fitted at 45 minutes instead of 3.33, plus a constant
   source with no physics, brought the residual down to 41.5 ppm. Beyond
   "hold the known constants", what practical test detects that a good fit
   is good for the wrong reason? Would bounding each fitted parameter by its
   documented tolerance be enough, or should a structure that needs an
   unphysical term be rejected by rule?
9. **What to report.** Should each identified parameter come with a
   confidence interval (from the Hessian of the cost, or by bootstrap on the
   residuals) before the twin is accepted? What width would you consider
   usable for V and q?

## 5. The estimators and their limits

10. **Local versus global.** Bounded Nelder-Mead is local; the grid is global
    but costs levels^parameters runs. With 2 to 4 unknowns and a simulation
    budget of about 40 runs per candidate, what would you use: multi-start
    local search, a coarse grid then local refinement, or something else
    (Gauss-Newton with sensitivities, since the model is smooth)?
11. **Cost surface.** Is the output-error cost for this model likely to have
    several minima (for example V and q trading off), and does that change
    the answer to question 10?

## 6. Validating the structure

12. **The acceptance threshold.** How should the threshold follow from the
    sensor noise and accuracy (30 ppm + 3 %) rather than from an operator's
    choice? Should we use a statistical test on the residuals instead of,
    or in addition to, a threshold on the RMSE?
13. **Residual analysis.** Which tests on the residuals would you run to
    decide that a structure is missing a term: whiteness (autocorrelation),
    cross-correlation with the command, or a look at the phase where the gap
    is largest (the rise, the decay)?
14. **Choosing between structures.** When the builder proposes several
    structures (one room; one room plus exchange; two states), which
    selection rule is safest: AIC, BIC, or cross-validation on a second test
    held out?
15. **Plausibility checks before the fit.** Our first-slope check flags a
    unit error from the first minutes. Which other cheap checks would you add before trusting a
    candidate: the static gain (the equilibrium at each command level), the
    time constant against V/Qe, or a dimensional analysis of the parameters?

## 7. The twin in control

16. **What the twin is for.** The twin will be used by a supervisory agent
    to choose the scrubber speed: reach a CO2 target, trade energy (battery)
    against air quality, anticipate occupancy changes. Is a model identified
    on a two-step test at one occupancy good enough for that, or should it
    be re-identified per operating regime?
17. **LPV formulation.** Since the command multiplies the state, the system
    is naturally linear parameter-varying, with the speed (or the occupancy)
    as scheduling parameter. Would an LPV formulation be the right frame for
    both the identification and the supervisory law? What would it bring
    over the bilinear model used directly in a receding-horizon controller?
18. **Robust control with an uncertainty set.** If the estimation returned
    an uncertainty set on (V, q) instead of a point, how would you use it:
    a speed law guaranteed over the whole set, for instance through a linear
    matrix inequality formulation? Which guarantee matters most here:
    staying under a CO2 ceiling, or reaching the target in a given time?

## 8. The layered architecture

The control is layered, and each layer is enforced by a different party:
- the scrubber board's firmware: a speed outside 0 to 100 % is refused; no
  speed below 40 % while CO2 is ELEVATED (3500 ppm); full speed forced
  while CRITICAL (4000 ppm);
- the deterministic harness: bounds, duration, abort conditions, medical
  monitoring;
- the agent, above both, which proposes and never overrides.

19. **Safety as invariance.** Can the firmware and harness rules be written
    as an invariant set (the CO2 stays under a ceiling whatever the agent
    proposes within its bounds), and proven on the identified model with
    its uncertainty? Is that a reasonable acceptance criterion for letting
    an agent choose speeds?
20. **Hierarchy.** Does this layering (hard constraints in firmware, envelope
    in deterministic code, optimisation by the agent) match a standard
    hierarchical control scheme you would recommend, and where would you
    put the model-based parts (prediction, estimation)?

## 9. Estimation of the state in operation

21. **A state observer.** In operation the twin could run alongside the
    plant. Would you correct it with a Kalman filter (or a Luenberger
    observer) on the measured CO2, and estimate V and q online (augmented
    state, extended or unscented filter)? Note that in our code "the
    Observer" is a different thing (the language model that writes the
    twin's requirements); we would name a state observer differently.
22. **Drift.** Occupancy, activity and the scrubber beds' saturation all
    change over time. Which of these should be states, which scheduled
    parameters, and which slow drifts detected by the residual?

## 10. Closed-loop re-identification

23. **Identifying while the agent controls.** Later, the twin will be
    re-identified during operation, while the agent drives the scrubber from
    the twin and the firmware sometimes forces full speed. What precautions
    does closed-loop identification need here: adding a small excitation to
    the command, the direct method with a noise model, or a two-step
    (instrumental variable) approach?
24. **When to re-identify.** Which signal should trigger a new
    identification: a residual test crossing a threshold, a change of
    occupancy pattern, a maintenance event on the scrubber? And how do we
    keep the agent from treating a bad twin as the truth in the meantime?

---

*If only a few questions can be discussed, we would start with 7
(identifiability as a computed guard), 12 (a threshold from the sensor
model), 15 (plausibility checks) and 17 (the LPV frame for both
identification and supervision).*
