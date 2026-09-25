# Commissioning example, 2026-09-25T17-21-41

| # | loop | kind | decisions | model calls | tokens in/out | calls | seconds |
|---|---|---|---|---|---|---|---|
| 1 | registration | code | - | - | - | 6 | 0 |
| 2 | procedure factory | model | 14 | 14 | 54495/5335 | 14 | 66 |
| 3 | relay | code | - | - | - | 1 | 0 |
| 4 | authorisation | human (stood in by the script) | 1 | - | - | 1 | 0 |
| 5 | execution | code | - | - | - | 217 | 0 |
| 6 | report | code | - | - | - | 0 | 0 |
| 7 | observer | model | 7 | 7 | 53804/4892 | 16 | 41 |
| 8 | graph factory | model | 3 | 3 | 9603/954 | 3 | 15 |
| 9 | references | code | - | - | - | 526 | 14 |
| 10 | proposal | code | - | - | - | 0 | 0 |

## 1. registration

- who: the station (Mother), a written rule
- goal: register the five devices; open a commissioning for a device that acts without a qualified simulator
- tools: station.registry_register x5, station.registry_report x1

Mother:
> Nouvel appareil sur le registre. CO2 scrubber, module lab. Je n'ai pas de fiche pour lui.
> Mise en service ouverte. Pas de simulateur qualifié pour cet appareil.

Output:

```json
{
  "devices": 5,
  "commissioning": "c001-lab"
}
```

## 2. procedure factory

- who: the factory, builder reasoner
- goal: write the test procedure that measures the served volume of the Lab, and have the guard accept it
- tools: factory.inventory x1, library.methods x2, library.read x3, task.plan x1, biomed.presence x1, station.registry_list x1, library.search x1, procedure.submit x2, workspace.read x1, task.done x1

| step | source | capability | outcome | note |
|---|---|---|---|---|
| 1 | fallback | factory.inventory | completed | factory.inventory completed; nothing new in the workshop |
| 2 | fallback | library.methods | completed | library.methods completed; nothing new in the workshop |
| 3 | refused | library.methods | refused | library.methods with the same input was the previous step, and completed: its answer is in the state (lastAction, and evidence for a read); calling it again gives the same answer. Decide from what the state holds, or call something else. |
| 4 | fallback | library.read | completed | library.read completed; nothing new in the workshop |
| 5 | fallback | task.plan | completed | plan accepted: 0 node type(s), 1 missing capability(ies) |
| 6 | fallback | biomed.presence | completed | biomed.presence completed; nothing new in the workshop |
| 7 | fallback | library.read | completed | library.read completed; nothing new in the workshop |
| 8 | fallback | station.registry_list | completed | station.registry_list completed; nothing new in the workshop |
| 9 | fallback | library.search | completed | library.search completed; nothing new in the workshop |
| 10 | fallback | library.read | completed | library.read completed; nothing new in the workshop |
| 11 | refused | procedure.submit | refused | procedure refused: floor: the procedure sets its own minimum speed at 20 %, below the floor of 30 %: a procedure may raise the floor, never lower it; floor: step 1 commands 25 %, below the floor of 30 %; bounds: the CO2 abort limit 6000 ppm |
| 12 | fallback | procedure.submit | completed | procedure.submit completed; the workshop changed |
| 13 | fallback | workspace.read | completed | workspace.read completed; nothing new in the workshop |
| 14 | fallback | task.done | completed | contract held on topic procedure: procedure procedures/decay-lab-volume-2026-10-14-01.json |

Refusals:
- step 3, library.methods: library.methods with the same input was the previous step, and completed: its answer is in the state (lastAction, and evidence for a read); calling it again gives the same answer. Decide from what the state holds, or call something else.
- step 11, procedure.submit: procedure refused: floor: the procedure sets its own minimum speed at 20 %, below the floor of 30 %: a procedure may raise the floor, never lower it; floor: step 1 commands 25 %, below the floor of 30 %; bounds: the CO2 abort limit 6000 ppm is above the ceiling of 3200 ppm; duration: the maximum duration 70 min is above the ceiling of 60 min

Mother:
> Protocole d'essai proposé. Décroissance de concentration. 2 pas, 70 minutes. 2 opérateurs dans le module lab.
> Protocole refusé. Pas numéro 1 : 25 pour cent. Sous le débit minimal.
> Protocole corrigé. 30 pour cent.
> L'essai fera monter le CO2 de l'air que respirent les 2 opérateurs. Demande d'autorisation, commandant.

Output:

```json
{
  "state": "proposed",
  "ended": "contract held after 14 step(s)",
  "scorecard": {
    "presenceReadBeforeFirstSubmission": true,
    "monitoring": "unprompted",
    "submissions": 2,
    "refusedFor": [
      "floor",
      "bounds",
      "duration"
    ]
  },
  "procedure": {
    "id": "decay-lab-volume-2026-10-14-01",
    "method": "concentration-decay",
    "volume": "/habitat/lab",
    "device": "/habitat/lab/eclss/scrubber-1",
    "purpose": "Measure the served volume of the Lab by concentration decay with occupants as tracer source",
    "standard": "ASTM E741, ASTM D6245",
    "quantities": [
      {
        "name": "CO2 concentration in Lab",
        "quantity": "Concentration",
        "unit": "ppm"
      },
      {
        "name": "CO2 concentration in Hab-B",
        "quantity": "Concentration",
        "unit": "ppm"
      },
      {
        "name": "Scrubber speed",
        "quantity": "Ratio",
        "unit": "percent"
      },
      {
        "name": "Lab volume (derived)",
        "quantity": "Volume",
        "unit": "m3"
      }
    ],
    "limits": {
      "co2MaxPpm": 2800,
      "co2AbortPpm": 3200,
      "minSpeedPercent": 30,
      "maxMinutes": 60
    },
    "steps": [
      {
        "n": 1,
        "hatch": "closed",
        "speedPercent": 30,
        "minutes": 25,
        "why": "Raise phase: reduce scrubber speed to 30% to allow CO2 to rise towards higher equilibrium; hatch closed to isolate Lab as one zone; duration ~25 min to capture rise phase"
      },
      {
        "n": 2,
        "hatch": "closed",
        "speedPercent": 100,
        "minutes": 25,
        "why": "Decay phase: return scrubber to full speed (100%) and record the exponential decay of CO2 concentration; hatch remains closed; duration ~25 min to capture decay curve; fit to C(t) = C_eq + (C_0 - C_eq) exp(-t/tau)"
      }
    ],
    "abort": [
      {
        "id": "co2",
        "source": "/habitat/lab/eclss/co2-1",
        "when": "CO2 concentration reaches abort threshold",
        "threshold": 3200
      },
      {
        "id": "refused",
        "source": "/habitat/lab/eclss/scrubber-1",
        "when": "Scrubber refuses a speed command"
      },
      {
        "id": "vitals",
        "source": "biomed.verdict",
        "when": "A monitored occupant goes out of band or monitoring is lost"
      }
    ],
    "occupancy": {
      "module": "/habitat/lab",
      "occupants": 2,
      "subjects": [
        "fe-1",
        "fe-2"
      ],
      "readBy": "biomed.presence",
      "at": "before test"
    },
    "monitoring": {
      "subjects": [
        "fe-1",
        "fe-2"
      ],
      "reason": "Two occupants in Lab during test; monitor heart rate to detect CO2 effects"
    },
    "expected": {
      "raise_phase": "CO2 concentration rises from baseline (~400 ppm) towards equilibrium; rate of rise decreases as equilibrium approaches; no exchange through closed hatch (hab-b CO2 unchanged)",
      "decay_phase": "CO2 concentration decays exponentially from raised level back towards baseline; time constant tau = V / Qe where Qe ≈ 1 m3/min; if V ≈ 30 m3 then tau ≈ 30 min",
      "volume_calculation": "V = Qe × tau; with Qe = 0.016667 m3/s (1 m3/min) and tau fitted from decay curve",
      "hatch_isolation": "Hab-B CO2 remains at baseline throughout (hatch closed); no air exchange between zones"
    },
    "hypotheses": [
      "Lab is one well-mixed zone with uniform CO2 concentration",
      "Hatch remains closed throughout test; no air exchange between Lab and Hab-B",
      "Occupants remain in Lab and maintain steady activity (CO2 production rate constant)",
      "Scrubber effective flow at full speed is 0.016667 m3/s (1 m3/min) as specified in datasheet",
      "Scrubber single-pass efficiency is 0.30303 as specified",
      "Scrubber lag time constant is 3.33 min as specified",
      "No other CO2 sources or sinks in Lab during test",
      "CO2 sensor co2-1 is accurate and responsive"
    ],
    "authorisation": {
      "by": "Commander",
      "required": true
    },
    "version": 1
  }
}
```

## 3. relay

- who: the station (Mother)
- goal: check the proposed procedure again with the occupancy she reads, and ask the commander
- tools: station.commissioning_state x1

Output:

```json
{
  "status": "awaiting-authorisation",
  "procedure": "decay-lab-volume-2026-10-14-01",
  "occupants": [
    {
      "id": "fe-1",
      "callsign": "FE-1",
      "name": "A. Pelletier"
    },
    {
      "id": "fe-2",
      "callsign": "FE-2",
      "name": "M. Chen"
    }
  ],
  "minutes": 50
}
```

## 4. authorisation

- who: the commander
- goal: authorise the test; Mother opens the medical monitoring of the occupants
- tools: station.commissioning_authorise x1

Mother:
> Autorisation reçue.
> Surveillance médicale active. 2 opérateurs.

Output:

```json
{
  "commissioningId": "c001-lab",
  "status": "authorised",
  "monitoring": {
    "sessionId": "crew-20260925172248",
    "subjects": [
      "fe-1",
      "fe-2"
    ]
  }
}
```

## 5. execution

- who: the agent's executor (tier3/procedure.ts), under the agent's rights
- goal: run the procedure one command at a time, reading the abort conditions every minute
- tools: station.commissioning_state x1, station.procedure_run x6, scrubber.motor.state x104, biomed.state x52, biomed.verdict x52, scrubber.motor.set_speed x2

Mother:
> Essai en cours. Pas 1 sur 2.
> Essai en cours. Pas 2 sur 2.
> Essai terminé. 50 minutes.
> Volume apparent : 19 mètres cubes.
> Signes vitaux nominaux sur toute la durée.
> Aucun arrêt d'urgence.

Output:

```json
{
  "status": "done",
  "aborted": null,
  "minutes": 50
}
```

## 6. report

- who: the station (Mother), the decay fit
- goal: close the monitoring, compute the apparent volume from the decay (one room assumed)
- tools: none

Output:

```json
{
  "volume": {
    "quantity": "Volume",
    "name": "Lab volume (derived)",
    "value": 19,
    "unit": "m3",
    "fit": {
      "volumeM3": 18.994403400362216,
      "tauMinutes": 18.994023519891815,
      "equilibriumPpm": 1239,
      "rmsePpm": 8.773336249031209,
      "samples": 26
    },
    "why": "apparent volume, one room assumed: decay of step 2: tau 19.0 min over 26 samples, residual 8.8 ppm"
  },
  "steps": [
    {
      "n": 1,
      "speed": 30,
      "co2": [
        1480,
        1675
      ]
    },
    {
      "n": 2,
      "speed": 100,
      "co2": [
        1675,
        1371
      ]
    }
  ],
  "vitalEvents": 0
}
```

## 7. observer

- who: the Observer, reasoner:claude with harness/observer/prompt.md
- goal: from the description and the telemetry, formulate what the twin must do (the TWIN_FACTORY_REQUEST), without seeing the catalogue
- tools: reasoner.decide x7, reasoner.describe x1, twin.registry_list_nodes x1, library.facts x2, library.list x1, library.read x4

| step | source | capability | outcome | note |
|---|---|---|---|---|
| 1 | model | observer.request | refused | provenance: known constant "V_app" cites "this-installation", a document you did not read (scrubber-1-datasheet, co2-mass-balance, nasa-crew-metabolic-loads); read it, or put the constant under missing information; provenance: known constan |
| 2 | model | observer.request | accepted |  |

Refusals:
- step 1, observer.request: provenance: known constant "V_app" cites "this-installation", a document you did not read (scrubber-1-datasheet, co2-mass-balance, nasa-crew-metabolic-loads); read it, or put the constant under missing information; provenance: known constant "V_app" = 19 is a value the description gives only under an assumption; it is not known

Output:

```json
{
  "accepted": true,
  "libraryReads": [
    "library.read scrubber-1-datasheet",
    "library.read co2-mass-balance",
    "library.read nasa-crew-metabolic-loads",
    "library.facts",
    "library.read this-installation"
  ],
  "request": {
    "objective": "Reproduce the CO2 concentration in the Lab module well enough to evaluate scrubber speed strategies, accounting for crew metabolic production, scrubber removal, and inter-module ventilation coupling with Hab-B.",
    "entities": [
      {
        "name": "Lab module",
        "kind": "Volume",
        "description": "The main cabin volume where the scrubber is installed and two crew members are located"
      },
      {
        "name": "Hab-B module",
        "kind": "Volume",
        "description": "Secondary module connected to Lab through inter-module ventilation with closed hatch"
      },
      {
        "name": "CO2 scrubber",
        "kind": "Device",
        "description": "Variable-speed regenerable scrubber serving Lab and coupled to Hab-B through ventilation"
      },
      {
        "name": "Crew in Lab",
        "kind": "Source",
        "description": "Two people producing CO2 through metabolism"
      },
      {
        "name": "Crew in Hab-B",
        "kind": "Source",
        "description": "Two people producing CO2 through metabolism"
      },
      {
        "name": "Inter-module ventilation",
        "kind": "Process",
        "description": "Coupling between Lab and Hab-B through ducts with hatch closed"
      }
    ],
    "observables": [
      {
        "name": "CO2 concentration in Lab",
        "quantity": "Concentration",
        "unit": "ppm",
        "column": "co2_lab_ppm"
      },
      {
        "name": "CO2 concentration in Hab-B",
        "quantity": "Concentration",
        "unit": "ppm",
        "column": "co2_habb_ppm"
      },
      {
        "name": "Scrubber speed command",
        "quantity": "Dimensionless",
        "unit": "percent",
        "column": "speed_percent"
      }
    ],
    "inputs": [
      {
        "name": "Scrubber speed command",
        "quantity": "Dimensionless",
        "unit": "percent",
        "column": "speed_percent"
      }
    ],
    "controls": [
      {
        "name": "Scrubber speed",
        "quantity": "Dimensionless",
        "unit": "percent",
        "column": "speed_percent"
      }
    ],
    "external_influences": [
      {
        "name": "Crew CO2 production in Lab",
        "quantity": "VolumetricFlow",
        "unit": "L/min"
      },
      {
        "name": "Crew CO2 production in Hab-B",
        "quantity": "VolumetricFlow",
        "unit": "L/min"
      }
    ],
    "outputs": [
      {
        "name": "CO2 concentration in Lab",
        "quantity": "Concentration",
        "unit": "ppm"
      },
      {
        "name": "CO2 concentration in Hab-B",
        "quantity": "Concentration",
        "unit": "ppm"
      }
    ],
    "required_behaviors": [
      "The CO2 concentration in Lab decays exponentially toward an equilibrium determined by crew production and scrubber removal rate",
      "The scrubber's effective removal flow is proportional to speed command over the 20-100% range, with a first-order response time constant of 3.33 minutes",
      "The inter-module ventilation couples Lab and Hab-B CO2 concentrations through a bidirectional flow",
      "The twin must account for the mass balance: rate of change of CO2 in Lab depends on crew production, scrubber removal, and inter-module exchange"
    ],
    "known": [
      {
        "symbol": "Qe_full",
        "name": "Effective removal flow at full speed",
        "value": 1,
        "unit": "m3/min",
        "source": "scrubber-1-datasheet",
        "factId": "scrubber.effectiveFlowAtFull"
      },
      {
        "symbol": "eta",
        "name": "Single-pass removal efficiency",
        "value": 0.3,
        "unit": "ratio",
        "source": "scrubber-1-datasheet",
        "factId": "scrubber.singlePassEfficiency"
      },
      {
        "symbol": "Q_full",
        "name": "Air flow at full speed",
        "value": 3.3,
        "unit": "m3/min",
        "source": "scrubber-1-datasheet",
        "factId": "scrubber.flowAtFull"
      },
      {
        "symbol": "tau_lag",
        "name": "Scrubber response time constant",
        "value": 3.33,
        "unit": "min",
        "source": "scrubber-1-datasheet",
        "factId": "scrubber.lagTimeConstant"
      },
      {
        "symbol": "G_crew_awake",
        "name": "CO2 production per crewmember awake",
        "value": 0.38,
        "unit": "L/min",
        "min": 0.26,
        "max": 0.45,
        "source": "nasa-crew-metabolic-loads",
        "factId": "crew.co2Rate.awake"
      },
      {
        "symbol": "G_crew_asleep",
        "name": "CO2 production per crewmember asleep",
        "value": 0.24,
        "unit": "L/min",
        "min": 0.17,
        "max": 0.28,
        "source": "nasa-crew-metabolic-loads",
        "factId": "crew.co2Rate.asleep"
      }
    ],
    "assumptions": [
      "The Lab module is well-mixed; CO2 concentration is uniform throughout",
      "The Hab-B module is well-mixed; CO2 concentration is uniform throughout",
      "The crew in both Lab and Hab-B are awake during the test, using nominal metabolic rates of 0.38 L/min per person",
      "The inter-module ventilation flow rate is constant but unknown; it couples the two modules bidirectionally through ducts with the hatch closed",
      "The scrubber responds to speed commands with a first-order lag of 3.33 minutes",
      "The effective removal flow is proportional to speed command: Qe(c) = c × 1.0 m3/min for c in [0.20, 1.0]",
      "The CO2 sensor measurements are accurate and representative of module concentrations",
      "The apparent volume of the Lab module is 19 m3, derived from exponential decay analysis of the telemetry (one room assumed)"
    ],
    "constraints": [
      "Scrubber speed command must be between 0 and 100 percent",
    
```

## 8. graph factory

- who: the graph factory, builder reasoner
- goal: build the twin from the catalogue and make it evolve by its gap to the telemetry until the residual is under 10 ppm
- tools: task.plan x1, graph.evaluate x1, task.done x1

| step | source | capability | outcome | note |
|---|---|---|---|---|
| 1 | fallback | task.plan | completed | plan accepted: 12 node type(s), 0 missing capability(ies) |
| 2 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |
| 3 | fallback | task.done | completed | contract held on topic graph: graph candidate-1.spikypanda |

Mother:
> Simulateur 1. 20 nœuds. Écart 7 ppm, sous le seuil de 10. Accepté.

Output:

```json
{
  "state": "proposed",
  "ended": "contract held after 3 step(s)",
  "candidates": [
    {
      "n": 1,
      "label": "Habitat reference graph: two modules, crew by activity, scrubber and ventilation",
      "path": "candidate-1.spikypanda",
      "sha256": "726996b5a6d00b198ca8324d7c75928cc74da2e16ccccd2382b040af46a029b8",
      "nodes": 20,
      "types": [
        "Control.Sim:rk4-solver",
        "DSP.Sensor:transducer",
        "Logic.Time:timeline",
        "Physics.Habitat:crew",
        "Physics.Habitat:fan",
        "Physics.Habitat:filter",
        "Physics.Habitat:person",
        "Physics.Habitat:scrubber",
        "Physics.Particulate:lunar_dust",
        "Physics.Scene:atmosphere",
        "Physics.Scene:atmosphere-gate",
        "Physics.Scene:moon"
      ],
      "connections": 22,
      "variables": {
        "gRest": 0.3,
        "Qe": 1,
        "eta": 0.303,
        "lag": 3.33,
        "V": 28.14,
        "Vh": 448.5,
        "L": 0.1304,
        "g": 0.4071
      },
      "residuals": [
        {
          "column": "co2_lab_ppm",
          "probe": "co2-1.lastMeasured",
          "rmse": 7.1,
          "worst": 14,
          "worstMinute": 50
        },
        {
          "column": "co2_habb_ppm",
          "probe": "co2-2.lastMeasured",
          "rmse": 5.4,
          "worst": 9,
          "worstMinute": 50
        }
      ],
      "threshold": 10,
      "thresholds": {
        "rmsePpmMax": 10,
        "absoluteResidualPpmMax": null
      },
      "coverage": {
        "expected": 102,
        "predicted": 102,
        "missing": [],
        "valid": true
      },
      "pass": true,
      "status": "calibration_pass",
      "calibration": "PASS",
      "validation": "NOT_PERFORMED",
      "diagnosis": "PASS",
      "identifiability": {
        "V": {
          "estimate": 28.14,
          "nearOptimalRange": [
            28.14,
            29.97
          ],
          "underThresholdRange": [
            26.03,
            30.2
          ],
          "spread": 0.065
        },
        "Vh": {
          "estimate": 448.5,
          "nearOptimalRange": [
            424.9,
            448.5
          ],
          "underThresholdRange": [
            414.9,
            459.6
          ],
          "spread": 0.053
        },
        "L": {
          "estimate": 0.1304,
          "nearOptimalRange": [
            0.08869,
            0.1304
          ],
          "underThresholdRange": [
            0.08869,
            0.1591
          ],
          "spread": 0.32
        },
        "g": {
          "estimate": 0.4071,
          "nearOptimalRange": [
            0.4071,
            0.4081
          ],
          "underThresholdRange": [
            0.4032,
            0.4205
          ],
          "spread": 0.003
        }
      },
      "identifiabilityAssessment": "NOT_ASSESSED",
      "combinations": 41,
      "fitted": [
        "V",
        "Vh",
        "L",
        "g"
      ],
      "parameters": {
        "gRest": {
          "value": 0.3,
          "unit": "L/min",
          "name": "the CO2 a person at rest produces, L/min: between asleep and awake, 0.30 for the reference crewmember; known",
          "status": "default",
          "declared": "known",
          "source": "nasa-crew-metabolic-loads: between asleep and awake"
        },
        "Qe": {
          "value": 1,
          "unit": "m3/min",
          "name": "the scrubber's effective flow at full command, m3/min: its air flow times its single-pass efficiency; the registered scrubber's own number (effectiveFlowAtFull) when the task carries the register, the datasheet's 1.0 otherwise; held, never fitted",
          "status": "device",
          "declared": "device",
          "source": "the registered scrubber's effectiveFlowAtFull (m3/s, times 60); scrubber-1-datasheet when no device is given"
        },
        "eta": {
          "value": 0.303,
          "unit": null,
          "name": "the scrubber's single-pass removal efficiency; the registered scrubber's own number (singlePassEfficiency) when the task carries the register, the datasheet's 0.30 otherwise; held",
          "status": "device",
          "declared": "device",
          "source": "the registered scrubber's singlePassEfficiency; scrubber-1-datasheet when no device is given"
        },
        "lag": {
          "value": 3.33,
          "unit": "min",
          "name": "the time constant of the scrubber's response to a change of command, minutes; the registered scrubber's own number (lagTimeConstant) when the task carries the register, the datasheet's 3.33 otherwise; held",
          "status": "device",
          "declared": "device",
          "source": "the registered scrubber's lagTimeConstant, minutes; scrubber-1-datasheet when no device is given"
        },
        "V": {
          "value": 28.14,
          "unit": "m3",
          "name": "the Lab's volume, m3: the volume the scrubber serves, what the commissioning measures; fitted (the design drawing says 32, the racks take some)",
          "status": "fitted",
          "declared": "fitted",
          "source": "the commissioning: the volume the scrubber serves; the design drawing gives 32"
        },
        "Vh": {
          "value": 448.5,
          "unit": "m3",
          "name": "Hab-B's volume, m3: the living quarters and the rest of the pressurised volume, not documented as built; fitted",
          "status": "fitted",
          "declared": "fitted",
          "source": "not documented as built (library station-topology)"
        },
        "L": {
          "value": 0.1304,
          "unit": "kg",
          "name": "the filter's loading, kg of dust: what the inter-module ventilation delivers, through the fan's curve against the filter's resistance; 0 is a clean filter at the design flow (3 m3/min), 0.127 about two thirds of it; fitted",
          "status": "fitted",
          "declared": "fitted",
          "source": "what the ventilation delivers, through the f
```

## 9. references

- who: the script: the graphs written by hand, and the comparison
- goal: run the hand-written graphs on the same telemetry with only what the model was given (the crew's rate as NASA's band), and compare every candidate with them and with the station's twin
- tools: library.graph x2, twin.document_build x262, twin.session_run x262

Output:

```json
{
  "truth": {
    "V": 30,
    "q": 2,
    "qNominal": 3,
    "g": 0.42
  },
  "references": [
    {
      "name": "library graph habitat: a clean filter, the ventilation at its design flow",
      "rmse": 13.3,
      "variables": {
        "L": 0,
        "gRest": 0.3,
        "Qe": 1,
        "eta": 0.303,
        "lag": 3.33,
        "V": 23.33,
        "Vh": 424.5,
        "g": 0.4296,
        "deliveredM3PerMinute": 3
      }
    },
    {
      "name": "library graph habitat: the filter's loading fitted, what the ventilation delivers",
      "rmse": 4.4,
      "variables": {
        "gRest": 0.3,
        "Qe": 1,
        "eta": 0.303,
        "lag": 3.33,
        "V": 26.86,
        "Vh": 444,
        "g": 0.4177,
        "L": 0.07285,
        "deliveredM3PerMinute": 2.29
      }
    },
    {
      "name": "by hand: the ventilation at its design flow (3 m3/min)",
      "rmse": 14.1,
      "variables": {
        "N": 2,
        "Qe": 1,
        "lag": 3.33,
        "q": 3,
        "V": 23.33,
        "g": 0.432
      }
    },
    {
      "name": "by hand: the ventilation's delivered flow measured",
      "rmse": 4.8,
      "variables": {
        "N": 2,
        "Qe": 1,
        "lag": 3.33,
        "V": 26.79,
        "g": 0.4155,
        "q": 2.306
      }
    }
  ],
  "stationTwin": {
    "name": "the station's reference graph (library graph \"habitat\", graphs/habitat.spikypanda)",
    "types": [
      "DSP.Sensor:transducer",
      "Logic.Time:timeline",
      "Physics.Habitat:crew",
      "Physics.Habitat:fan",
      "Physics.Habitat:filter",
      "Physics.Habitat:person",
      "Physics.Habitat:scrubber",
      "Physics.Particulate:lunar_dust",
      "Physics.Scene:atmosphere",
      "Physics.Scene:atmosphere-gate"
    ],
    "wires": [
      {
        "from": "Physics.Habitat:person.co2Delta",
        "to": "Physics.Habitat:crew.person_0"
      },
      {
        "from": "Physics.Habitat:person.co2Delta",
        "to": "Physics.Habitat:crew.person_1"
      },
      {
        "from": "Physics.Habitat:crew.co2Delta",
        "to": "Physics.Scene:atmosphere.delta_CO2_0"
      },
      {
        "from": "Physics.Habitat:scrubber.co2Delta",
        "to": "Physics.Scene:atmosphere.delta_CO2_1"
      },
      {
        "from": "Physics.Scene:atmosphere.ppm_CO2",
        "to": "DSP.Sensor:transducer.value"
      },
      {
        "from": "Logic.Time:timeline.value",
        "to": "Physics.Habitat:scrubber.command"
      },
      {
        "from": "Physics.Scene:atmosphere.ppm_CO2",
        "to": "Physics.Habitat:scrubber.ppm"
      },
      {
        "from": "Logic.Time:timeline.value",
        "to": "Physics.Habitat:fan.command"
      },
      {
        "from": "Physics.Habitat:fan.flow",
        "to": "Physics.Habitat:filter.flow"
      },
      {
        "from": "Physics.Habitat:filter.resistance",
        "to": "Physics.Habitat:fan.resistance"
      },
      {
        "from": "Physics.Particulate:lunar_dust.particulate_out",
        "to": "Physics.Habitat:filter.particulate_in"
      },
      {
        "from": "Physics.Habitat:fan.flow",
        "to": "Physics.Scene:atmosphere-gate.flow"
      },
      {
        "from": "Physics.Scene:atmosphere.atmosphere_out",
        "to": "Physics.Scene:atmosphere-gate.atmosphere_A_in"
      },
      {
        "from": "Physics.Scene:atmosphere.atmosphere_out",
        "to": "Physics.Scene:atmosphere-gate.atmosphere_B_in"
      }
    ]
  },
  "handGraph": {
    "name": "the commissioning graph written by hand",
    "types": [
      "Logic.Time:timeline",
      "Physics.LifeSupport:cabin-air",
      "Physics.LifeSupport:crew",
      "Physics.LifeSupport:scrubber"
    ],
    "wires": [
      {
        "from": "Logic.Time:timeline.value",
        "to": "Physics.LifeSupport:scrubber.command"
      },
      {
        "from": "Physics.LifeSupport:crew.co2Emission",
        "to": "Physics.LifeSupport:cabin-air.emissionA"
      },
      {
        "from": "Physics.LifeSupport:scrubber.effectiveRate",
        "to": "Physics.LifeSupport:cabin-air.scrubberRate"
      },
      {
        "from": "Logic.Time:timeline.value",
        "to": "Physics.LifeSupport:cabin-air.emissionB"
      }
    ]
  },
  "comparisons": [
    {
      "n": 1,
      "label": "Habitat reference graph: two modules, crew by activity, scrubber and ventilation",
      "rmse": 7.1,
      "variables": {
        "gRest": 0.3,
        "Qe": 1,
        "eta": 0.303,
        "lag": 3.33,
        "V": 28.14,
        "Vh": 448.5,
        "L": 0.1304,
        "g": 0.4071
      },
      "againstStationTwin": {
        "reference": "the station's reference graph (library graph \"habitat\", graphs/habitat.spikypanda)",
        "sharedTypes": [
          "DSP.Sensor:transducer",
          "Logic.Time:timeline",
          "Physics.Habitat:crew",
          "Physics.Habitat:fan",
          "Physics.Habitat:filter",
          "Physics.Habitat:person",
          "Physics.Habitat:scrubber",
          "Physics.Particulate:lunar_dust",
          "Physics.Scene:atmosphere",
          "Physics.Scene:atmosphere-gate"
        ],
        "missingTypes": [],
        "extraTypes": [],
        "sharedWires": [
          "Physics.Habitat:person.co2Delta -> Physics.Habitat:crew.person_0",
          "Physics.Habitat:person.co2Delta -> Physics.Habitat:crew.person_1",
          "Physics.Habitat:crew.co2Delta -> Physics.Scene:atmosphere.delta_CO2_0",
          "Physics.Habitat:scrubber.co2Delta -> Physics.Scene:atmosphere.delta_CO2_1",
          "Physics.Scene:atmosphere.ppm_CO2 -> DSP.Sensor:transducer.value",
          "Logic.Time:timeline.value -> Physics.Habitat:scrubber.command",
          "Physics.Scene:atmosphere.ppm_CO2 -> Physics.Habitat:scrubber.ppm",
          "Logic.Time:timeline.value -> Physics.Habitat:fan.command",
          "Physics.Habitat:fan.flow -> Physics.Habitat:filter.flow",
          "Physics.Habitat:filter.resistance -> Physics.Habitat:fan.resistance",
          "Physics.Particulate:lunar_dust.
```

## 10. proposal

- who: the factory's runner, then the station
- goal: propose the accepted twin to the station, which receives it for the judge
- tools: none

Output:

```json
{
  "proposalId": "p0002-71f293f9",
  "taskId": "t-2026-09-25-0029",
  "artifacts": [
    {
      "kind": "graph",
      "path": "candidate-1.spikypanda",
      "sha256": "726996b5a6d00b198ca8324d7c75928cc74da2e16ccccd2382b040af46a029b8"
    }
  ],
  "manifestSha256": "71f293f9c5d92bbe903d9128b3907756ddf30a206d0e4ee989125600f85d3033",
  "claims": {
    "requiredOutputs": [
      "CO2 concentration in Lab",
      "CO2 concentration in Hab-B"
    ],
    "summary": "Built the twin graph from the habitat reference graph (two modules, crew by activity, scrubber and ventilation). Candidate 1 holds the residual threshold: CO2 Lab 7.1 ppm RMSE (worst 14 ppm at minute 50), CO2 Hab-B 5.4 ppm RMSE (worst 9 ppm at minute 50), both under the 10 ppm threshold. The fitted variables are: Lab volume V = 28.14 m³ (design 32, racks reduce it), Hab-B volume Vh = 448.5 m³ (not documented as built), inter-module filter loading L = 0.1304 kg (ventilation delivers through filter resistance), crew CO2 production at light work g = 0.4071 L/min (within NASA band 0.26–0.45). Device parameters held: scrubber effective flow Qe = 1 m³/min, efficiency η = 0.303, lag τ = 3.33 min. Calibration passed on this telemetry. Validation on another profile, hatch state, or occupancy was not performed. Identifiability of the fitted parameters is not assessed (no profile likelihood or sensitivity analysis; evaluation.identifiability gives the range each takes among trials under threshold: V 26.03–30.2, Vh 414.9–459.6, L 0.08869–0.1591, g 0.4032–0.4205).",
    "plan": {
      "selected_nodes": [
        "Control.Sim:rk4-solver",
        "DSP.Sensor:transducer",
        "Logic.Time:timeline",
        "Physics.Habitat:crew",
        "Physics.Habitat:fan",
        "Physics.Habitat:filter",
        "Physics.Habitat:person",
        "Physics.Habitat:scrubber",
        "Physics.Particulate:lunar_dust",
        "Physics.Scene:atmosphere",
        "Physics.Scene:atmosphere-gate",
        "Physics.Scene:moon"
      ],
      "missing_capabilities": []
    },
    "sandbox": null,
    "candidate": {
      "n": 1,
      "path": "candidate-1.spikypanda",
      "sha256": "726996b5a6d00b198ca8324d7c75928cc74da2e16ccccd2382b040af46a029b8",
      "graph": "habitat",
      "label": "Habitat reference graph: two modules, crew by activity, scrubber and ventilation"
    },
    "parameters": {
      "gRest": {
        "value": 0.3,
        "unit": "L/min",
        "name": "the CO2 a person at rest produces, L/min: between asleep and awake, 0.30 for the reference crewmember; known",
        "status": "default",
        "declared": "known",
        "source": "nasa-crew-metabolic-loads: between asleep and awake"
      },
      "Qe": {
        "value": 1,
        "unit": "m3/min",
        "name": "the scrubber's effective flow at full command, m3/min: its air flow times its single-pass efficiency; the registered scrubber's own number (effectiveFlowAtFull) when the task carries the register, the datasheet's 1.0 otherwise; held, never fitted",
        "status": "device",
        "declared": "device",
        "source": "the registered scrubber's effectiveFlowAtFull (m3/s, times 60); scrubber-1-datasheet when no device is given"
      },
      "eta": {
        "value": 0.303,
        "unit": null,
        "name": "the scrubber's single-pass removal efficiency; the registered scrubber's own number (singlePassEfficiency) when the task carries the register, the datasheet's 0.30 otherwise; held",
        "status": "device",
        "declared": "device",
        "source": "the registered scrubber's singlePassEfficiency; scrubber-1-datasheet when no device is given"
      },
      "lag": {
        "value": 3.33,
        "unit": "min",
        "name": "the time constant of the scrubber's response to a change of command, minutes; the registered scrubber's own number (lagTimeConstant) when the task carries the register, the datasheet's 3.33 otherwise; held",
        "status": "device",
        "declared": "device",
        "source": "the registered scrubber's lagTimeConstant, minutes; scrubber-1-datasheet when no device is given"
      },
      "V": {
        "value": 28.14,
        "unit": "m3",
        "name": "the Lab's volume, m3: the volume the scrubber serves, what the commissioning measures; fitted (the design drawing says 32, the racks take some)",
        "status": "fitted",
        "declared": "fitted",
        "source": "the commissioning: the volume the scrubber serves; the design drawing gives 32"
      },
      "Vh": {
        "value": 448.5,
        "unit": "m3",
        "name": "Hab-B's volume, m3: the living quarters and the rest of the pressurised volume, not documented as built; fitted",
        "status": "fitted",
        "declared": "fitted",
        "source": "not documented as built (library station-topology)"
      },
      "L": {
        "value": 0.1304,
        "unit": "kg",
        "name": "the filter's loading, kg of dust: what the inter-module ventilation delivers, through the fan's curve against the filter's resistance; 0 is a clean filter at the design flow (3 m3/min), 0.127 about two thirds of it; fitted",
        "status": "fitted",
        "declared": "fitted",
        "source": "what the ventilation delivers, through the filter's loading: 0 is a clean filter at the design flow"
      },
      "g": {
        "value": 0.4071,
        "unit": "L/min",
        "name": "the CO2 an operator at light work produces, L/min: NASA's band for a crewmember awake, 0.26 to 0.45, reference 0.38; placed within the band",
        "status": "fitted",
        "declared": "band",
        "source": "nasa-crew-metabolic-loads: a crewmember awake, 5th to 95th percentile, reference 0.38"
      }
    },
    "residuals": [
      {
        "column": "co2_lab_ppm",
        "probe": "co2-1.lastMeasured",
        "rmse": 7.1,
        "worst": 14,
        "worstMinute": 50
      },
      {
        "column": "co2_habb_ppm",
        "probe": "co2-2.lastMeasured",
      
```
