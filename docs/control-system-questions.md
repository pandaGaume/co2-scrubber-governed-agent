# Questions for a control engineer: the CO2 twin, its identification, its use in control

*Written on 24 September 2026 for UH, from the commissioning work
on branch `commissioning-core`. The French documents it summarises are
`usine-de-graphes.fr.md` (the identification), `exemple-mise-en-service.fr.md`
and `exemple-mise-en-service-2.fr.md` (runs on the real model),
`nasa-protocoles-et-conclusions.fr.md` (NASA's public values and test
protocols) and `graphe-de-reference.fr.md` (the hand-written graph as a
reference). This page is self-contained: section 1 gives the system and what
we do today, sections 2 to 11 are the questions, grouped by topic, each with
why we ask it. Updated in the evening of 24 September after nine runs.*

---

## 1. The system and what we do today

**The plant.** Two air volumes of a lunar habitat, the Lab and Hab-B, joined
by a hatch. CO2 removal is centralised, as on the ISS: one scrubber, in the
Lab, serves the whole habitat through an inter-module ventilation (fans and
ducts) that carries Hab-B's air to it and back; the ventilation's flow is
smaller with the hatch closed than open. Four people: two in the Lab
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
- `G_L`: CO2 produced by the Lab's crew: N people times a per-person rate g.
  NASA gives g as a band, not a value (BVAD Rev2, awake in the cabin: 0.26 to
  0.45 L/min from the 5th to the 95th percentile, 0.38 for the reference
  crewmember).
- **Unknown:** `V_L`, the as-built volume (m3), and `q`, the exchange flow
  the ventilation delivers between the two modules as installed, hatch
  closed (m3/min). The design gives a nominal flow; filters, dampers and
  duct losses change what is delivered, so q is measured, not assumed. It
  is not small by design: Hab-B's CO2 is removed only through it. `g` is
  known only within its band.

The system is **bilinear**: the command multiplies the state.

**The experiment.** A two-step test, hatch closed: a low speed (the CO2
rises), then 100 % (it decays towards an equilibrium). The language model
writes the procedure; the lengths have varied from run to run, from 15 to 60
minutes in total.
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

What the documentation gives is held fixed, never fitted (Qe and the lag,
from the datasheet). A constant the documentation gives as a band (the
crew's rate) may be fitted within the band only. When a candidate fails, the
builder may change the parameters' bounds or the structure (add the exchange
term, for instance).

**What nine runs on the real model showed** (24 September; the world is a
simulation with V = 30 m3, q = 0.6 m3/min, g = 0.42 L/min):

| run | best twin | what stopped it, or what it showed |
|---|---|---|
| 1 | 679 ppm | a unit error in every candidate (Qe where the node expects Qe/V); the one-room decay gave an apparent volume of 38.6 m3 for a true 30 |
| 2 | 41.5 ppm | the known and the unknown swapped: the apparent volume held as a fact, the datasheet constants fitted (the lag at 41 to 45 min against 3.33), a constant source with no physics added |
| 3 to 5 | none to 134.6 ppm | errors in how the graph was written, caught one by one by checks (question 15); in run 5 the volume was found (29 to 30 m3) but a daily average was taken for an hourly rate |
| 6 | 16.9 ppm, accepted | accepted for the wrong reasons: a 15-minute test, V = 42.5, the crew's rate fitted freely |
| 7, 8 | 114 and 147 ppm | a matching structure with a frozen command: a text where a number was expected, a timeline that ended after 60 seconds |
| 9 | **12.6 ppm, accepted at the first candidate** | V = 29.6 m3, g held at 0.38, the Lab alone (no exchange term) |

**The run that matters for these questions is the ninth.** On its telemetry
(30 % for about 15 minutes, then 100 % for about 15), our hand-written
graphs, fitted with only what the model had (g within NASA's band), gave:

| structure | RMSE | V (true 30) | g (true 0.42) | q (true 0.6) |
|---|---|---|---|---|
| the Lab alone | 10.1 ppm | 28.0 | 0.37 | (none) |
| the Lab and the exchange | 4.1 ppm | 27.5 | 0.42 | 1.09 |
| the model's twin (Lab alone) | 12.6 ppm | 29.6 | 0.38 (held) | (none) |

Both structures pass the 25 ppm threshold, including the one without
exchange, which the design rules out: the ventilation is how Hab-B is
served. The volume is well determined; the exchange is not (1.09 for a true
0.6). This is what questions 4, 7, 12 and 14 are about.

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
   when Qe is known; run 9 shows it does not in practice over 30 minutes (q
   off by 80 %, and a structure without q passing as well). Within the
   envelope (never below 30 %, CO2 under 3200 ppm, 60 minutes at most),
   what command sequence gives the most information on (V, q, g)? Would a
   pseudo-random binary sequence between 30 % and 100 % do better for the
   same duration, given the 3.33 min lag of the scrubber and the one-minute
   sampling? Or should the test be staged, as NASA and analog habitats do
   (question 25)?
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
   source with no physics, brought the residual down to 41.5 ppm. We now
   bound a documented parameter by its documented band (the crew's rate by
   NASA's percentiles) and hold the others. Is a hard bound the right form,
   or should the band enter as a prior (a penalty in the cost, a Bayesian
   estimate)? And should a structure that needs an unphysical term be
   rejected by rule?
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
    or in addition to, a threshold on the RMSE? In run 9 the threshold of
    25 ppm let through both a structure with the exchange (4.1 ppm) and one
    without (10.1 ppm): it is wider than what separates them.
13. **Residual analysis.** Which tests on the residuals would you run to
    decide that a structure is missing a term: whiteness (autocorrelation),
    cross-correlation with the command, or a look at the phase where the gap
    is largest (the rise, the decay)?
14. **Choosing between structures.** When the builder proposes several
    structures (one room; one room plus exchange; two states), which
    selection rule is safest: AIC, BIC, or cross-validation on a second test
    held out? And when two structures pass, one of which the design rules
    out (a Lab with no exchange, when the ventilation is how Hab-B is
    served), how should the known design enter the selection: as a
    constraint on the structure, or as a prior?
15. **Plausibility checks before the fit.** Three checks run today, all by
    code: the slope of the first five minutes, predicted against measured
    (it flags a rate in the wrong unit, and lists what enters the balance at
    the first minute); a refusal of inputs written so that the simulator
    would take them silently and wrongly; and a comparison of each candidate
    with a hand-written reference graph, structure and fitted numbers side
    by side (this is how a command frozen after 60 seconds was found in a
    candidate whose structure matched). Which other cheap checks would you
    add before trusting a candidate: the static gain (the equilibrium at
    each command level), the time constant against V/Qe, or a dimensional
    analysis of the parameters?

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

## 11. What NASA's tests and standards suggest

The public protocols we read (JSC closed-chamber tests with a human
metabolic simulator, MSFC 4-bed scrubber ground tests, SAM's first scrubber
run in 2026) separate the unknowns one at a time, and use a known CO2
source rather than people.

25. **A staged test in an empty Lab.** First the exchange through the
    ventilation, hatch closed (CO2 injected, scrubber off), then the
    scrubber against a metered CO2
    source, then the crew. Does such a sequence make (V, q, g) identifiable
    where our two steps do not, and what length would each stage need at a
    one-minute sampling? Is the loss of realism (no people, a steady source)
    a problem for a twin that will then run with the crew inside?
26. **An efficiency that depends on the state.** At MSFC, the removal rate
    depends on the inlet CO2 and on the regeneration: the single-pass
    efficiency is a value at an operating point. Should the twin's scrubber
    term be `Qe(C) * u_f * C` rather than `Qe * u_f * C`, and does that
    change the answers to questions 5 (bilinearity) and 17 (LPV)?
27. **Limits as partial pressures.** NASA-STD-3001 sets the one-hour limit
    at 3 mmHg of CO2 partial pressure. In ppm, that depends on the cabin's
    total pressure (about 3,950 ppm at 101.3 kPa, 7,080 ppm at 56.5 kPa).
    Should the constraints of the supervisory law be written in partial
    pressure, with the total pressure a measured input, rather than in ppm?

---

*If only a few questions can be discussed, we would start with 4 and 25
(the experiment: two steps or a staged test), 7 (identifiability as a
computed guard), 12 and 14 (a threshold from the sensor model, and how to
choose between two structures that both pass), and 17 (the LPV frame for
both identification and supervision).*
