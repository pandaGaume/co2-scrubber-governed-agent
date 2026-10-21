# Method card: inter-module ventilation and exchange identification

Estimate installed exchange between connected air volumes from time-aligned concentration records under a stated mass-balance model. Known module volumes can be taken from `lab-layout-and-volumes` with their provenance. A nominal design flow is not an installed measurement. This method does not require the human to supply the unknown exchange flow before proposing how to identify it.

**Measures:** VolumetricFlow, AirChange, Volume

Method name: `multizone-exchange-identification`. Measuring a volume through this model is conditional on sufficient independent information; listing Volume does not assert that every record identifies it.

## Balance and units

For the project's two well-mixed zones, with the scrubber in the Lab, the candidate balance is

    V_L * dC_L/dt = S_L - R(t) * C_L - q * (C_L - C_H)
    V_H * dC_H/dt = S_H + q * (C_L - C_H)

Here V is in m3, q and removal flow R are in m3/min, and concentrations C are dimensionless fractions. Source S is the volumetric CO2 production at the same reference conditions in m3/min. When concentrations are written as ppm instead, multiply the source term by one million. Convert litres per minute to cubic metres per minute before mixing these terms. These equations and assumptions are the project's `co2-mass-balance` model, not an external certification of the installation.

If V_H and S_H are independently known, then wherever C_L differs sufficiently from C_H the second equation implies

    q = (V_H * dC_H/dt - S_H) / (C_L - C_H)

This is a derived diagnostic relation. Differentiating noisy measurements amplifies noise; fitting the integrated coupled model is often more robust. Retain sensor offsets, sampling, missing values and uncertainty when assessing the result.

## Conditions for useful data

The two concentration histories must contain enough information to distinguish exchange from other unknowns. If both zones have nearly identical concentrations, division by their small difference is poorly conditioned. Unknown source rates can trade off against exchange. Estimating volumes, exchange, removal performance and source rates all freely from one short record may admit multiple explanations.

Choose a perturbation and observation period justified by the permitted envelope and the information needed. Fix or record hatch position, occupancy, activity, ventilation settings and external disturbances. Treat hatch-open and hatch-closed conditions as different configurations; a fitted flow for one is not automatically valid for the other. No particular speed sequence or hatch change is prescribed by this card.

## Measurement assumptions and limitations

The reference CO2 production rates are uncertain, not metered injection measurements. Sensor offsets, incomplete mixing and departures from steady state affect ventilation inference. NIST discusses uncertainty in relating occupant-generated steady CO2 to ventilation, which is a reason to report the assumptions and uncertainty rather than treat one concentration as a flow meter. [NIST, Investigating Uncertainty in the Relationship between Indoor Steady-State CO2 Concentrations and Ventilation Rates](https://www.nist.gov/publications/investigating-uncertainty-relationship-between-indoor-steady-state-co2-concentrations)

The configured mission executor currently supports the Lab simulated environment with the hatch closed. It rejects procedures outside that capability. A method that could use a hatch-open experiment does not create a hatch actuator or an executable hatch-open environment. Report a missing capability if that experiment is required.

## Result and validation

Report the exact configuration, parameters fixed from evidence, quantities estimated, uncertainty or sensitivity, assumptions about source rates, and data used. Compare the resulting coupled concentration predictions on independent telemetry. State a non-identifiable result explicitly. Never copy a hidden simulator exchange constant or a nominal design flow into a result described as measured.
