# slot `twin`

Tier 0, the oracle. The cabin twin (`graphs/cabin.spikypanda`, built by
`npm run twin:build` from `specs/cabin-parameters.json` and a scenario) runs
headless in this slot, through the factory's library bundle, and answers the
agent's questions on the same document the factory's jobs and the editor run.

Tools (`slots/twin/provider.ts`, model in `slots/twin/cabin-twin.ts`; wordings per family in `grammars/`):

- `describe`: the model in one paragraph, the files it was built from with
  their sha256, the thresholds, the budget.
- `time_to_critical { co2Ppm?, crew?, flowPercent?, stopMinutes?, resumePercent?, horizonMinutes? }`:
  from a starting state, at a flow or through a stop, the minutes to ELEVATED
  and to CRITICAL, the peak, the final state, the steady state at that flow,
  a sampled trajectory. Defaults are the scenario's start.
- `sweep { flowPercents, co2Ppm?, crew?, minutes? }`: the operating map over
  a few flows: peak, final state, minutes to the thresholds, steady state,
  scrubber energy.

Every answer carries the identity (sha256) of the parameter file, the
scenario and the document: a number the agent repeats can be traced to the
assumptions behind it. Budget: 1440 story minutes per run, 20 runs per call;
beyond that the slot refuses and points to the factory.

Measured on 2026-09-19: a 120-minute question answers in about 45 ms, four
points of 240 minutes in about 25 ms.

Not yet: the Babylon.js scene of the cabin (a browser tab publishing the
same slot), and a crew schedule as an argument (the questions take a
constant crew; the schedule lives in the scenario and in the plan job).
