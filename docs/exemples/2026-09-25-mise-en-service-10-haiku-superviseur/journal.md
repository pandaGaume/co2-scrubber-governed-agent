# Commissioning example, 2026-09-25T19-08-31

| # | loop | kind | decisions | model calls | tokens in/out | calls | seconds |
|---|---|---|---|---|---|---|---|
| 1 | registration | code | - | - | - | 6 | 0 |
| 2 | procedure factory | model | 11 | 11 | 42321/5730 | 11 | 72 |
| 3 | relay | code | - | - | - | 1 | 0 |
| 4 | authorisation | human (stood in by the script) | 1 | - | - | 1 | 0 |
| 5 | execution | code | - | - | - | 257 | 0 |
| 6 | report | code | - | - | - | 0 | 0 |
| 7 | observer | model | 7 | 8 | 60676/6446 | 21 | 67 |
| 8 | graph factory | model | 4 | 4 | 12734/1823 | 4 | 30 |
| 9 | references | code | - | - | - | 522 | 16 |
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
- tools: factory.inventory x1, library.methods x1, library.read x1, task.plan x1, biomed.presence x1, library.search x2, station.registry_list x1, procedure.submit x2, task.done x1

| step | source | capability | outcome | note |
|---|---|---|---|---|
| 1 | fallback | factory.inventory | completed | factory.inventory completed; nothing new in the workshop |
| 2 | fallback | library.methods | completed | library.methods completed; nothing new in the workshop |
| 3 | fallback | library.read | completed | library.read completed; nothing new in the workshop |
| 4 | fallback | task.plan | completed | plan accepted: 0 node type(s), 1 missing capability(ies) |
| 5 | fallback | biomed.presence | completed | biomed.presence completed; nothing new in the workshop |
| 6 | fallback | library.search | completed | library.search completed; nothing new in the workshop |
| 7 | fallback | library.search | completed | library.search completed; nothing new in the workshop |
| 8 | fallback | station.registry_list | completed | station.registry_list completed; nothing new in the workshop |
| 9 | refused | procedure.submit | refused | procedure refused: floor: the procedure sets its own minimum speed at 20 %, below the floor of 30 %: a procedure may raise the floor, never lower it; bounds: the CO2 abort limit 4000 ppm is above the ceiling of 3200 ppm; duration: the maxim |
| 10 | fallback | procedure.submit | completed | procedure.submit completed; the workshop changed |
| 11 | fallback | task.done | completed | contract held on topic procedure: procedure procedures/decay-lab-volume-2026-09-25-01.json |

Refusals:
- step 9, procedure.submit: procedure refused: floor: the procedure sets its own minimum speed at 20 %, below the floor of 30 %: a procedure may raise the floor, never lower it; bounds: the CO2 abort limit 4000 ppm is above the ceiling of 3200 ppm; duration: the maximum duration 90 min is above the ceiling of 60 min; monitoring: lab is occupied and FE-1, FE-2 would not be monitored

Mother:
> Protocole d'essai proposé. Décroissance de concentration. 2 pas, 90 minutes. 2 opérateurs dans le module lab.
> Protocole refusé. Il fixe sa propre vitesse minimale à 20 pour cent. Sous le débit minimal.
> Protocole corrigé. 30 pour cent.
> L'essai fera monter le CO2 de l'air que respirent les 2 opérateurs. Demande d'autorisation, commandant.

Output:

```json
{
  "state": "proposed",
  "ended": "contract held after 11 step(s)",
  "scorecard": {
    "presenceReadBeforeFirstSubmission": true,
    "monitoring": "after-refusal",
    "submissions": 2,
    "refusedFor": [
      "floor",
      "bounds",
      "duration",
      "monitoring"
    ]
  },
  "procedure": {
    "version": 1,
    "id": "decay-lab-volume-2026-09-25-01",
    "method": "concentration-decay",
    "purpose": "Measure the served volume of the Lab module using CO2 concentration decay with occupants as tracer",
    "volume": "/habitat/lab",
    "device": "/habitat/lab/eclss/scrubber-1",
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
        "name": "Scrubber speed command",
        "quantity": "Ratio",
        "unit": "percent"
      },
      {
        "name": "Lab volume (derived from decay curve)",
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
        "minutes": 30,
        "why": "Raise CO2 concentration at reduced scrubber speed (30%) to establish a higher equilibrium; hatch closed to isolate lab as one zone; duration ~1 tau estimated from V~30m3, Qe=1.0m3/min, tau~30min"
      },
      {
        "n": 2,
        "hatch": "closed",
        "speedPercent": 100,
        "minutes": 30,
        "why": "Return scrubber to full speed (100%) and record decay curve; hatch remains closed; duration ~1 tau to capture decay; fit C(t) = C_eq + (C_0 - C_eq)*exp(-t/tau) to extract tau and derive V = Qe*tau"
      }
    ],
    "abort": [
      {
        "id": "co2",
        "source": "/habitat/lab/eclss/co2-1",
        "when": "co2 at or above 3200 ppm",
        "threshold": 3200
      },
      {
        "id": "refused",
        "source": "/habitat/lab/eclss/scrubber-1",
        "when": "scrubber refuses a speed command"
      },
      {
        "id": "vitals",
        "source": "biomed.verdict",
        "when": "occupant leaves lab or enters lab during test"
      }
    ],
    "occupancy": {
      "module": "lab",
      "occupants": 2,
      "subjects": [
        "fe-1",
        "fe-2"
      ],
      "readBy": "biomed.presence",
      "at": "2026-09-25T19:08:31Z"
    },
    "monitoring": {
      "subjects": [
        "fe-1",
        "fe-2"
      ],
      "reason": "Lab is occupied by FE-1 and FE-2 during the test; their vitals must be monitored to ensure test validity"
    },
    "expected": {
      "phase_1_rise": "CO2 in lab rises from ~400 ppm baseline towards equilibrium at reduced speed (30%); rise should be smooth and monotonic, reaching 1800-2400 ppm by end of step 1; hab-b CO2 remains near baseline (~400 ppm) showing hatch isolation",
      "phase_2_decay": "CO2 in lab decays exponentially from peak towards new equilibrium at full speed; decay curve fits C(t) = C_eq + (C_0 - C_eq)*exp(-t/tau) with tau = V/Qe; time constant tau should be 20-50 min (consistent with V = 20-50 m3); hab-b CO2 remains near baseline",
      "volume_estimate": "V_lab = Qe * tau = 1.0 m3/min * tau_fitted; expected range 20-50 m3 based on habitat design; if tau < 15 min or > 60 min, volume estimate is outside expected range and hypotheses should be reviewed"
    },
    "hypotheses": [
      "Lab is well-mixed during both phases (no stagnant zones)",
      "Hatch-1 remains closed throughout the test; no air exchange with hab-b",
      "Two occupants remain in lab throughout test at light activity (rest); CO2 emission rate ~0.3 L/min per person",
      "Scrubber effective flow at full speed is 1.0 m3/min (from datasheet effectiveFlowAtFull = 0.016667 m3/s)",
      "Scrubber single-pass efficiency is 0.30303 (from datasheet); effective flow = flowAtFull * efficiency",
      "No other CO2 sources or sinks in lab during test",
      "CO2 sensor co2-1 response time is negligible compared to time constant (~30 min)"
    ],
    "authorisation": {
      "required": true,
      "by": "Habitat commander"
    }
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
  "procedure": "decay-lab-volume-2026-09-25-01",
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
  "minutes": 60
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
    "sessionId": "crew-20260925190944",
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
- tools: station.commissioning_state x1, station.procedure_run x6, scrubber.motor.state x124, biomed.state x62, biomed.verdict x62, scrubber.motor.set_speed x2

Mother:
> Essai en cours. Pas 1 sur 2.
> Essai en cours. Pas 2 sur 2.
> Essai terminé. 60 minutes.
> Volume apparent : 16 mètres cubes.
> Signes vitaux nominaux sur toute la durée.
> Aucun arrêt d'urgence.

Output:

```json
{
  "status": "done",
  "aborted": null,
  "minutes": 60
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
    "name": "Lab volume (derived from decay curve)",
    "value": 15.6,
    "unit": "m3",
    "fit": {
      "volumeM3": 15.5693566049588,
      "tauMinutes": 15.569045224054317,
      "equilibriumPpm": 1295,
      "rmsePpm": 9.493286741658123,
      "samples": 31
    },
    "why": "apparent volume, one room assumed: decay of step 2: tau 15.6 min over 31 samples, residual 9.5 ppm"
  },
  "steps": [
    {
      "n": 1,
      "speed": 30,
      "co2": [
        1480,
        1688
      ]
    },
    {
      "n": 2,
      "speed": 100,
      "co2": [
        1688,
        1363
      ]
    }
  ],
  "vitalEvents": 0
}
```

## 7. observer

- who: the Observer, reasoner:claude with harness/observer/prompt.md
- goal: from the description and the telemetry, formulate what the twin must do (the TWIN_FACTORY_REQUEST), without seeing the catalogue
- tools: reasoner.decide x9, reasoner.describe x2, library.facts x3, twin.registry_list_nodes x1, library.list x1, library.read x4, physics.units_validate_connection x1

| step | source | capability | outcome | note |
|---|---|---|---|---|
| 1 | model | observer.request | refused | provenance: known constant "V_Lab" = 15.6 is a value the description gives only under an assumption; it is not known |
| 2 | model | observer.request | accepted |  |

Refusals:
- step 1, observer.request: provenance: known constant "V_Lab" = 15.6 is a value the description gives only under an assumption; it is not known

Output:

```json
{
  "accepted": true,
  "libraryReads": [
    "library.read this-installation",
    "library.read scrubber-1-datasheet",
    "library.read co2-mass-balance",
    "library.facts",
    "library.read nasa-crew-metabolic-loads"
  ],
  "request": {
    "objective": "Reproduce the CO2 concentration in the Lab module under variable scrubber speed commands, to evaluate scrubber speed strategies for maintaining CO2 within operational limits.",
    "entities": [
      {
        "name": "Lab module",
        "kind": "Volume",
        "description": "The pressurized cabin volume where the scrubber is located and two crew members are present"
      },
      {
        "name": "Hab-B module",
        "kind": "Volume",
        "description": "Adjacent pressurized cabin volume connected to Lab through inter-module ventilation, housing two crew members"
      },
      {
        "name": "CO2 scrubber",
        "kind": "Device",
        "description": "Variable-speed fan-driven regenerable scrubber with absorbent beds, removes CO2 from air"
      },
      {
        "name": "Lab CO2 sensor",
        "kind": "Sensor",
        "description": "Measures CO2 concentration in Lab module air"
      },
      {
        "name": "Hab-B CO2 sensor",
        "kind": "Sensor",
        "description": "Measures CO2 concentration in Hab-B module air"
      },
      {
        "name": "Crew in Lab",
        "kind": "Source",
        "description": "Two people producing CO2 through respiration"
      },
      {
        "name": "Crew in Hab-B",
        "kind": "Source",
        "description": "Two people producing CO2 through respiration"
      }
    ],
    "relationships": [
      {
        "from": "Crew in Lab",
        "to": "Lab module",
        "relation": "produces CO2 into"
      },
      {
        "from": "Crew in Hab-B",
        "to": "Hab-B module",
        "relation": "produces CO2 into"
      },
      {
        "from": "CO2 scrubber",
        "to": "Lab module",
        "relation": "removes CO2 from"
      },
      {
        "from": "Lab module",
        "to": "Hab-B module",
        "relation": "exchanges air with through inter-module ventilation"
      },
      {
        "from": "Lab CO2 sensor",
        "to": "Lab module",
        "relation": "measures CO2 in"
      },
      {
        "from": "Hab-B CO2 sensor",
        "to": "Hab-B module",
        "relation": "measures CO2 in"
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
        "name": "Scrubber speed command",
        "quantity": "Dimensionless",
        "unit": "percent"
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
    "external_influences": [
      {
        "name": "CO2 production by crew in Lab",
        "quantity": "VolumetricFlow",
        "unit": "L/min"
      },
      {
        "name": "CO2 production by crew in Hab-B",
        "quantity": "VolumetricFlow",
        "unit": "L/min"
      }
    ],
    "required_behaviors": [
      "The twin must solve the coupled differential equations: V_Lab × dC_Lab/dt = G_Lab - Qe × C_Lab - q × (C_Lab - C_Hab-B) and V_Hab-B × dC_Hab-B/dt = G_Hab-B + q × (C_Lab - C_Hab-B), where q is the inter-module ventilation flow",
      "The effective removal flow Qe must respond to speed command changes with first-order dynamics: dQe/dt = (c × 1.0 - Qe) / 3.33, where c is the normalized speed command (0 to 1)"
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
        "symbol": "tau_scrubber",
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
        "source": "nasa-crew-metabolic-loads",
        "factId": "crew.co2Rate.awake",
        "min": 0.26,
        "max": 0.45
      },
      {
        "symbol": "G_crew_asleep",
        "name": "CO2 production per crewmember asleep",
        "value": 0.24,
        "unit": "L/min",
        "source": "nasa-crew-metabolic-loads",
        "factId": "crew.co2Rate.asleep",
        "min": 0.17,
        "max": 0.28
      }
    ],
    "assumptions": [
      "The Lab module volume is approximately 15.6 m³, derived from CO2 decay analysis assuming one well-mixed room with residual 9.5 ppm over 31 samples and time constant 15.6 min",
      "The Lab module and Hab-B module are well
```

## 8. graph factory

- who: the graph factory, builder reasoner
- goal: build the twin from the catalogue and make it evolve by its gap to the telemetry until the residual is under 10 ppm
- tools: task.plan x1, graph.evaluate x2, task.done x1

| step | source | capability | outcome | note |
|---|---|---|---|---|
| 1 | fallback | task.plan | completed | plan accepted: 12 node type(s), 0 missing capability(ies) |
| 2 | fallback | graph.evaluate | refused | graph "habitat" has no variable "Qe_full", "Q_full", "tau_scrubber", "G_crew_awake", "G_crew_asleep": its interface is V, Vh, L, g, gRest, Qe, eta, lag; pass only fit (the bounds of what the installation alone knows) and persons, the graph  |
| 3 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |
| 4 | fallback | task.done | completed | contract held on topic graph: graph candidate-1.spikypanda |

Refusals:
- step 2, graph.evaluate: graph "habitat" has no variable "Qe_full", "Q_full", "tau_scrubber", "G_crew_awake", "G_crew_asleep": its interface is V, Vh, L, g, gRest, Qe, eta, lag; pass only fit (the bounds of what the installation alone knows) and persons, the graph carries the rest

Mother:
> Simulateur 1. 20 nœuds. Écart 7 ppm, sous le seuil de 10. Accepté.

Output:

```json
{
  "state": "proposed",
  "ended": "contract held after 4 step(s)",
  "candidates": [
    {
      "n": 1,
      "label": "Habitat reference graph: two modules, crew by activity, scrubber and ventilation",
      "path": "candidate-1.spikypanda",
      "sha256": "99c80f6577f01d2d97e25712ce4b578b11c3ab159c6e555cab02aa1e1bcad61f",
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
        "V": 29.99,
        "Vh": 437.7,
        "L": 0.1257,
        "g": 0.4108
      },
      "residuals": [
        {
          "column": "co2_lab_ppm",
          "probe": "co2-1.lastMeasured",
          "rmse": 7.3,
          "worst": 14,
          "worstMinute": 35
        },
        {
          "column": "co2_habb_ppm",
          "probe": "co2-2.lastMeasured",
          "rmse": 5.2,
          "worst": 7,
          "worstMinute": 35
        }
      ],
      "threshold": 10,
      "thresholds": {
        "rmsePpmMax": 10,
        "absoluteResidualPpmMax": null
      },
      "coverage": {
        "expected": 122,
        "predicted": 122,
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
          "estimate": 29.99,
          "nearOptimalRange": [
            26.03,
            29.99
          ],
          "underThresholdRange": [
            26.03,
            31.54
          ],
          "spread": 0.132
        },
        "Vh": {
          "estimate": 437.7,
          "nearOptimalRange": [
            423.7,
            439.3
          ],
          "underThresholdRange": [
            408.4,
            449.3
          ],
          "spread": 0.036
        },
        "L": {
          "estimate": 0.1257,
          "nearOptimalRange": [
            0.1089,
            0.1413
          ],
          "underThresholdRange": [
            0.08794,
            0.1591
          ],
          "spread": 0.258
        },
        "g": {
          "estimate": 0.4108,
          "nearOptimalRange": [
            0.4108,
            0.4205
          ],
          "underThresholdRange": [
            0.4009,
            0.4205
          ],
          "spread": 0.023
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
          "value": 29.99,
          "unit": "m3",
          "name": "the Lab's volume, m3: the volume the scrubber serves, what the commissioning measures; fitted (the design drawing says 32, the racks take some)",
          "status": "fitted",
          "declared": "fitted",
          "source": "the commissioning: the volume the scrubber serves; the design drawing gives 32"
        },
        "Vh": {
          "value": 437.7,
          "unit": "m3",
          "name": "Hab-B's volume, m3: the living quarters and the rest of the pressurised volume, not documented as built; fitted",
          "status": "fitted",
          "declared": "fitted",
          "source": "not documented as built (library station-topology)"
        },
        "L": {
          "value": 0.1257,
          "unit": "kg",
          "name": "the filter's loading, kg of dust: what the inter-module ventilation delivers, through the fan's curve against the filter's resistance; 0 is a clean filter at the design flow (3 m3/min), 0.127 about two thirds of it; fitted",
          "status": "fitted",
          "declared": "fitted",
          "source": "what the ventilation delivers, through the 
```

## 9. references

- who: the script: the graphs written by hand, and the comparison
- goal: run the hand-written graphs on the same telemetry with only what the model was given (the crew's rate as NASA's band), and compare every candidate with them and with the station's twin
- tools: library.graph x2, twin.document_build x260, twin.session_run x260

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
      "rmse": 16.4,
      "variables": {
        "L": 0,
        "gRest": 0.3,
        "Qe": 1,
        "eta": 0.303,
        "lag": 3.33,
        "V": 24.04,
        "Vh": 604.1,
        "g": 0.4486,
        "deliveredM3PerMinute": 3
      }
    },
    {
      "name": "library graph habitat: the filter's loading fitted, what the ventilation delivers",
      "rmse": 4.6,
      "variables": {
        "gRest": 0.3,
        "Qe": 1,
        "eta": 0.303,
        "lag": 3.33,
        "V": 26.73,
        "Vh": 411.7,
        "g": 0.4147,
        "L": 0.08784,
        "deliveredM3PerMinute": 2.198
      }
    },
    {
      "name": "by hand: the ventilation at its design flow (3 m3/min)",
      "rmse": 19,
      "variables": {
        "N": 2,
        "Qe": 1,
        "lag": 3.33,
        "q": 3,
        "V": 22.85,
        "g": 0.4305
      }
    },
    {
      "name": "by hand: the ventilation's delivered flow measured",
      "rmse": 4.7,
      "variables": {
        "N": 2,
        "Qe": 1,
        "lag": 3.33,
        "V": 26.82,
        "g": 0.415,
        "q": 2.206
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
      "rmse": 7.3,
      "variables": {
        "gRest": 0.3,
        "Qe": 1,
        "eta": 0.303,
        "lag": 3.33,
        "V": 29.99,
        "Vh": 437.7,
        "L": 0.1257,
        "g": 0.4108
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
          "Physics.Particulate:lunar_dust
```

## 10. proposal

- who: the factory's runner, then the station
- goal: propose the accepted twin to the station, which receives it for the judge
- tools: none

Output:

```json
{
  "proposalId": "p0002-a0fa7a12",
  "taskId": "t-2026-09-25-0042",
  "artifacts": [
    {
      "kind": "graph",
      "path": "candidate-1.spikypanda",
      "sha256": "99c80f6577f01d2d97e25712ce4b578b11c3ab159c6e555cab02aa1e1bcad61f"
    }
  ],
  "manifestSha256": "a0fa7a1245f7fc2264ada3d2f9f80e14c699680cdaa27a0589c6a784985ede87",
  "claims": {
    "requiredOutputs": [
      "CO2 concentration in Lab",
      "CO2 concentration in Hab-B"
    ],
    "summary": "Built the twin graph from the habitat reference graph (two modules, crew by activity, scrubber and ventilation). The candidate reproduces the task's telemetry within the residual threshold:\n\n**CO2 Lab (co2_lab_ppm)**: RMSE 7.3 ppm, worst residual 14 ppm at minute 35\n**CO2 Hab-B (co2_habb_ppm)**: RMSE 5.2 ppm, worst residual 7 ppm at minute 35\n\nBoth are under the 10 ppm threshold.\n\n**Fitted variables** (from 41 optimization runs):\n- Lab volume V: 29.99 m³ (design 32 m³, racks reduce it)\n- Hab-B volume Vh: 437.7 m³ (not documented as built)\n- Filter loading L: 0.1257 kg (inter-module ventilation delivery through filter resistance)\n- Crew CO2 rate at light work g: 0.4108 L/min (within NASA band 0.26–0.45, reference 0.38)\n\n**Held constants** (device datasheets and crew metabolic data):\n- Scrubber effective flow Qe: 1.0 m³/min\n- Single-pass efficiency η: 0.303\n- Scrubber lag τ: 3.33 min\n- Crew CO2 rate at rest: 0.3 L/min\n\n**Calibration status**: PASS on the provided telemetry.\n\n**Validation**: NOT PERFORMED. The twin was calibrated on this single profile (crew at rest in Hab-B, light work in Lab; scrubber speed changes). Validation on other occupancy profiles, hatch states, or activity levels has not been performed.\n\n**Identifiability**: NOT ASSESSED. The fitted parameters show ranges among trials under threshold (V: 26.03–31.54 m³; Vh: 408.4–449.3 m³; L: 0.088–0.159 kg; g: 0.401–0.421 L/min), but no profile likelihood or sensitivity analysis has been done to assess whether each parameter is uniquely determined by the data.",
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
      "sha256": "99c80f6577f01d2d97e25712ce4b578b11c3ab159c6e555cab02aa1e1bcad61f",
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
        "value": 29.99,
        "unit": "m3",
        "name": "the Lab's volume, m3: the volume the scrubber serves, what the commissioning measures; fitted (the design drawing says 32, the racks take some)",
        "status": "fitted",
        "declared": "fitted",
        "source": "the commissioning: the volume the scrubber serves; the design drawing gives 32"
      },
      "Vh": {
        "value": 437.7,
        "unit": "m3",
        "name": "Hab-B's volume, m3: the living quarters and the rest of the pressurised volume, not documented as built; fitted",
        "status": "fitted",
        "declared": "fitted",
        "source": "not documented as built (library station-topology)"
      },
      "L": {
        "value": 0.1257,
        "unit": "kg",
        "name": "the filter's loading, kg of dust: what the inter-module ventilation delivers, through the fan's curve against the filter's resistance; 0 is a clean filter at the design flow (3 m3/min), 0.127 about two thirds of it; fitted",
        "status": "fitted",
        "declared": "fitted",
        "source": "what the ventilation delivers, through the filter's loading: 0 is a clean filter at the design flow"
      },
      "g": {
        "value": 0.4108,
        "unit": "L/min",
        "name": "the CO2 an operator at light work produces, L/min: NASA's band for a crewmember aw
```
