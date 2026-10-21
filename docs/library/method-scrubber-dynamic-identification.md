# Method card: identifying scrubber gain, efficiency and response time

Methods for estimating a scrubber's removal performance and dynamic response from appropriate input-output measurements. First consult `scrubber-1-datasheet`: the reference device already documents bench efficiency and response time. Identification is useful when those values are absent, disputed or outside their documented scope, not merely because a twin contains those parameters.

**Measures:** Dimensionless, Timespan, VolumetricFlow, Ratio, Time

`Ratio` and `Time` are retrieval synonyms. The corresponding canonical quantities in this project's device records are `Dimensionless` and `Timespan`; verify them with the physics unit service before submitting a procedure. The method name is `scrubber-dynamic-identification`.

## Gain and single-pass removal

Define inlet and outlet CO2 fractions on the same pressure, temperature and humidity basis. At a steady operating condition, if inlet CO2 is nonzero and inlet/outlet air flow is the same, single-pass efficiency is

    eta = (C_in - C_out) / C_in
    effective_removal_flow = eta * air_flow

These equations are definitions and a mass-balance derivation, not a new measurement of this device. Record sensor calibration, inlet/outlet locations, flow, commanded and accepted operating point, and uncertainty. Bypass, dilution, unequal flow or unaligned samples invalidate the simple efficiency calculation. A room concentration is not the scrubber's outlet concentration.

The documented 3.3 m3/min flow and 0.30 efficiency imply approximately 0.99 m3/min effective removal, rounded to 1.0 m3/min in the datasheet. That arithmetic is not an independent calibration. A motor current measurement alone does not measure CO2 removal efficiency.

## A first-order dynamic hypothesis

For a measured removal-flow response y to an input fraction u, a candidate model is

    tau * dy/dt + y = K * u

With a constant initial equilibrium and an accepted input step at t0, its solution is

    y(t) = y_final + (y_initial - y_final) * exp(-(t - t0) / tau)

The endpoint change estimates gain; the transient shape estimates tau. Separate transport delay from the response time constant when the observations support both. This is a hypothesis to test, not an assertion that every actuator or cabin follows one exponential. Low-order process models commonly distinguish gain, time constant and delay. [MathWorks, Process Models](https://www.mathworks.com/help/ident/process-models.html)

The chamber or room concentration generally has its own storage dynamics. Its apparent decay time is not automatically the scrubber's internal lag. If only cabin CO2 is available, use the coupled mass balance in `co2-mass-balance`, documented volumes, observed input and declared source assumptions to predict cabin concentrations. Estimate device dynamics jointly only if the data distinguish them from exchange, source rate, mixing and sensor effects. Otherwise report effective behaviour or parameter bounds instead of claiming separately identified coefficients.

## Test-design considerations

- Choose operating points within the current permitted envelope. A full stop is not required by this method. A refused input supplies no response sample at that requested input.
- Choose enough time and samples to observe the response being estimated. If a time constant is shorter than, or comparable to, the sampling interval, explain the resulting uncertainty or obtain a suitable measurement capability.
- Hold or record relevant disturbances and source conditions. Repeated plateaus can reveal drift or a difference between increasing and decreasing commands.
- Record the actual transition time, accepted command and observed response. Do not relabel an unexecuted command as a successful step.
- Use the applicable signed safety bounds, occupancy, monitoring and abort rules. This method supplies no new exposure limit or permission to exceed one.

## Available measurement capability

The current mission logger records `minute`, `co2_lab_ppm`, `co2_habb_ppm` and `speed_percent` for its configured simulated cabin. It does not provide an inlet/outlet CO2 pair or directly measured removal flow. The direct efficiency calculation above therefore needs additional measurements if a physical efficiency claim is required. A successful fit to the simulated room is not an inlet/outlet bench test.

## Adequacy and reporting

State which parameters were fixed from documentation and which were estimated; provide units, fitted interval, operating scope, uncertainty or sensitivity, residuals and competing explanations. Evaluate predictions on separate data and retain any mismatch. System identification includes acquiring input-output observations, selecting a structure, estimating its adjustable parameters and assessing the resulting model. [MathWorks, System Identification Overview](https://www.mathworks.com/help/ident/gs/about-system-identification.html)
