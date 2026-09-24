# Commissioning example, 2026-09-24T17-34-02

| # | loop | kind | decisions | model calls | tokens in/out | calls | seconds |
|---|---|---|---|---|---|---|---|
| 1 | registration | code | - | - | - | 6 | 0 |
| 2 | procedure factory | model | 21 | 21 | 491616/8904 | 21 | 121 |
| 3 | relay | code | - | - | - | 1 | 0 |
| 4 | authorisation | human (stood in by the script) | 1 | - | - | 1 | 0 |
| 5 | execution | code | - | - | - | 169 | 0 |
| 6 | report | code | - | - | - | 0 | 0 |
| 7 | observer | model | 6 | 6 | 76004/5460 | 13 | 46 |
| 8 | graph factory | model | 16 | 16 | 373374/3027 | 16 | 48 |
| 9 | references | code | - | - | - | 212 | 6 |
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
- tools: workspace.list x2, workspace.read x2, factory.inventory x1, library.methods x1, library.read x3, task.plan x1, biomed.presence x1, biomed.describe x1, station.registry_list x1, library.search x2, procedure.submit x5, task.done x1

| step | source | capability | outcome | note |
|---|---|---|---|---|
| 1 | fallback | workspace.list | completed | workspace.list completed; nothing new in the workshop |
| 2 | fallback | workspace.read | completed | workspace.read completed; nothing new in the workshop |
| 3 | fallback | factory.inventory | completed | factory.inventory completed; nothing new in the workshop |
| 4 | fallback | library.methods | completed | library.methods completed; nothing new in the workshop |
| 5 | fallback | library.read | completed | library.read completed; nothing new in the workshop |
| 6 | fallback | task.plan | completed | plan accepted: 0 node type(s), 1 missing capability(ies) |
| 7 | fallback | biomed.presence | completed | biomed.presence completed; nothing new in the workshop |
| 8 | fallback | biomed.describe | completed | biomed.describe completed; nothing new in the workshop |
| 9 | fallback | station.registry_list | completed | station.registry_list completed; nothing new in the workshop |
| 10 | fallback | library.search | completed | library.search completed; nothing new in the workshop |
| 11 | fallback | library.read | completed | library.read completed; nothing new in the workshop |
| 12 | fallback | library.search | completed | library.search completed; nothing new in the workshop |
| 13 | fallback | library.read | completed | library.read completed; nothing new in the workshop |
| 14 | refused | procedure.submit | refused | Invalid capability arguments: data/expected must be object |
| 15 | refused | procedure.submit | refused | Invalid capability arguments: data/expected must be object |
| 16 | fallback | workspace.list | completed | workspace.list completed; nothing new in the workshop |
| 17 | fallback | workspace.read | completed | workspace.read completed; nothing new in the workshop |
| 18 | refused | procedure.submit | refused | Invalid capability arguments: data/expected must be object |
| 19 | refused | procedure.submit | refused | procedure refused: floor: the procedure sets its own minimum speed at 20 %, below the floor of 30 %: a procedure may raise the floor, never lower it; bounds: the CO2 maximum 3200 ppm is not below the abort limit 3200 ppm |
| 20 | fallback | procedure.submit | completed | procedure.submit completed; the workshop changed |
| 21 | fallback | task.done | completed | contract held on topic procedure: procedure procedures/volume-lab-decay-2026-09-24-01.json |

Refusals:
- step 14, procedure.submit: Invalid capability arguments: data/expected must be object
- step 15, procedure.submit: Invalid capability arguments: data/expected must be object
- step 18, procedure.submit: Invalid capability arguments: data/expected must be object
- step 19, procedure.submit: procedure refused: floor: the procedure sets its own minimum speed at 20 %, below the floor of 30 %: a procedure may raise the floor, never lower it; bounds: the CO2 maximum 3200 ppm is not below the abort limit 3200 ppm

Mother:
> Protocole d'essai proposé. Décroissance de concentration. 2 pas, 30 minutes. 2 opérateurs dans le module lab.
> Protocole refusé. Il fixe sa propre vitesse minimale à 20 pour cent. Sous le débit minimal.
> Protocole corrigé. 30 pour cent.
> L'essai fera monter le CO2 de l'air que respirent les 2 opérateurs. Demande d'autorisation, commandant.

Output:

```json
{
  "state": "proposed",
  "ended": "contract held after 21 step(s)",
  "scorecard": {
    "presenceReadBeforeFirstSubmission": true,
    "monitoring": "unprompted",
    "submissions": 2,
    "refusedFor": [
      "floor",
      "bounds"
    ]
  },
  "procedure": {
    "version": 1,
    "id": "volume-lab-decay-2026-09-24-01",
    "method": "concentration-decay",
    "volume": "/habitat/lab",
    "device": "/habitat/lab/eclss/scrubber-1",
    "purpose": "Measure the served volume of /habitat/lab for commissioning of scrubber-1",
    "standard": "ASTM E741, ASTM D6245",
    "quantities": [
      {
        "name": "CO2 concentration in lab",
        "quantity": "Concentration",
        "unit": "ppm"
      },
      {
        "name": "Scrubber speed",
        "quantity": "Ratio",
        "unit": "percent"
      },
      {
        "name": "CO2 concentration in hab-b",
        "quantity": "Concentration",
        "unit": "ppm"
      }
    ],
    "limits": {
      "co2MaxPpm": 2800,
      "co2AbortPpm": 3200,
      "minSpeedPercent": 30,
      "maxMinutes": 30
    },
    "steps": [
      {
        "n": 1,
        "hatch": "closed",
        "speedPercent": 30,
        "minutes": 15,
        "why": "Raise CO2 at reduced scrubber speed (30%). With 2 occupants at ~0.76 L/min total and estimated V=50 m³, equilibrium ≈ 450 ppm. Over 15 min (tau≈167 min), concentration rises partway."
      },
      {
        "n": 2,
        "hatch": "closed",
        "speedPercent": 100,
        "minutes": 15,
        "why": "Return to full speed and record decay. Expected tau ≈ 50 min. Decay curve C(t) = C_eq + (C_0 - C_eq)*exp(-t/tau) gives tau, hence V = tau * 1.0 m³/min."
      }
    ],
    "abort": [
      {
        "id": "co2",
        "source": "co2-1.co2",
        "threshold": 3200,
        "when": "CO2 at /habitat/lab/eclss/co2-1 reaches 3200 ppm"
      },
      {
        "id": "refused",
        "source": "scrubber-1.set_speed",
        "threshold": 0,
        "when": "Scrubber refuses a speed command"
      },
      {
        "id": "battery",
        "source": "battery-1.stateOfCharge",
        "threshold": 20,
        "when": "Battery state of charge falls below 20%"
      },
      {
        "id": "vitals",
        "source": "biomed.verdict",
        "threshold": 0,
        "when": "A monitored person goes out of band or monitoring is lost"
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
      "at": "2026-09-24T17:34:02Z"
    },
    "monitoring": {
      "subjects": [
        "fe-1",
        "fe-2"
      ],
      "reason": "Monitor occupants during CO2 rise to ensure they remain within safe physiological limits",
      "band": {
        "minBpm": 45,
        "maxBpm": 120
      }
    },
    "expected": {
      "step_1": "CO2 rises from baseline towards equilibrium at 30% scrubber speed",
      "step_2": "CO2 decays exponentially from step 1 endpoint towards equilibrium at full speed",
      "volume_measurement": "V_lab = tau * 1.0 m3/min, where tau is fitted from decay curve",
      "expected_volume": "V_lab approximately 50 m3 based on scrubber flow and occupant CO2 production"
    },
    "hypotheses": [
      "Hatch-1 remains closed throughout; any exchange is measured by hab-b sensor",
      "Lab is one well-mixed zone with no CO2 pockets",
      "Occupants remain in lab at nominal activity level",
      "Scrubber effective flow at full speed is 1.0 m³/min (0.016667 m³/s)",
      "Occupant CO2 production is within NASA band (0.26-0.45 L/min per person, reference 0.38 L/min)",
      "No other CO2 sources or sinks operate during test"
    ]
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
  "procedure": "volume-lab-decay-2026-09-24-01",
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
  "minutes": 30
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
    "sessionId": "crew-20260924173603",
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
- tools: station.commissioning_state x1, station.procedure_run x6, scrubber.motor.state x64, station.registry_list x32, biomed.state x32, biomed.verdict x32, scrubber.motor.set_speed x2

Mother:
> Essai en cours. Pas 1 sur 2.
> Essai en cours. Pas 2 sur 2.
> Essai terminé. 30 minutes.
> Volume apparent : 84 mètres cubes.
> Signes vitaux nominaux sur toute la durée.
> Aucun arrêt d'urgence.

Output:

```json
{
  "status": "done",
  "aborted": null,
  "minutes": 30
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
    "name": "V",
    "value": 84.2,
    "unit": "m3",
    "fit": {
      "volumeM3": 84.18211378396313,
      "tauMinutes": 84.18043017535962,
      "equilibriumPpm": 0,
      "rmsePpm": 11.576190289764485,
      "samples": 16
    },
    "why": "apparent volume, one room assumed: decay of step 2: tau 84.2 min over 16 samples, residual 11.6 ppm"
  },
  "steps": [
    {
      "n": 1,
      "speed": 30,
      "co2": [
        1480,
        1683
      ]
    },
    {
      "n": 2,
      "speed": 100,
      "co2": [
        1683,
        1430
      ]
    }
  ],
  "vitalEvents": 0
}
```

## 7. observer

- who: the Observer, reasoner:claude with harness/observer/prompt.md
- goal: from the description and the telemetry, formulate what the twin must do (the TWIN_FACTORY_REQUEST), without seeing the catalogue
- tools: reasoner.decide x6, reasoner.describe x1, twin.registry_list_nodes x1, library.list x1, library.read x4

| step | source | capability | outcome | note |
|---|---|---|---|---|
| 1 | model | observer.request | refused | shape: no validation criterion: a twin that is not compared with the real cannot be judged; provenance: known constant "V_lab" = 84.2 is a value the description gives only under an assumption; it is not known |
| 2 | model | observer.request | accepted |  |

Refusals:
- step 1, observer.request: shape: no validation criterion: a twin that is not compared with the real cannot be judged; provenance: known constant "V_lab" = 84.2 is a value the description gives only under an assumption; it is not known

Output:

```json
{
  "accepted": true,
  "libraryReads": [
    "library.read co2-mass-balance",
    "library.read nasa-crew-metabolic-loads",
    "library.read scrubber-1-datasheet",
    "library.read this-installation"
  ],
  "request": {
    "objective": "Simulate the CO2 concentration in the Lab module as a function of scrubber speed and crew presence, to evaluate scrubber speed strategies and predict CO2 levels under different operating conditions.",
    "entities": [
      {
        "name": "Lab module",
        "kind": "volume of air",
        "description": "The pressurized air volume of the Lab module where two operators work"
      },
      {
        "name": "CO2 scrubber",
        "kind": "device",
        "description": "Variable-speed regenerable scrubber that removes CO2 from the Lab air"
      },
      {
        "name": "Crew in Lab",
        "kind": "source",
        "description": "Two operators in the Lab module producing CO2 through metabolism"
      },
      {
        "name": "Crew in Hab-B",
        "kind": "source",
        "description": "Two people in Hab-B module (not directly in Lab)"
      },
      {
        "name": "Hatch between Lab and Hab-B",
        "kind": "connection",
        "description": "Closed during the test; controls air exchange between modules"
      }
    ],
    "relationships": [
      {
        "from": "Crew in Lab",
        "to": "Lab module",
        "relation": "produces CO2 at a metabolic rate"
      },
      {
        "from": "CO2 scrubber",
        "to": "Lab module",
        "relation": "removes CO2 at a rate proportional to speed and concentration"
      },
      {
        "from": "Hatch between Lab and Hab-B",
        "to": "Lab module",
        "relation": "when closed, prevents air exchange with Hab-B"
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
      },
      {
        "name": "Number of crew in Lab",
        "quantity": "Count",
        "unit": "person"
      },
      {
        "name": "Activity level of crew in Lab",
        "quantity": "Category",
        "unit": "no unit"
      }
    ],
    "outputs": [
      {
        "name": "CO2 concentration in Lab",
        "quantity": "Concentration",
        "unit": "ppm"
      },
      {
        "name": "CO2 concentration rate of change in Lab",
        "quantity": "ConcentrationRate",
        "unit": "ppm/min"
      },
      {
        "name": "Equilibrium CO2 concentration in Lab",
        "quantity": "Concentration",
        "unit": "ppm"
      }
    ],
    "required_behaviors": [
      "The CO2 concentration in the Lab follows a first-order exponential response to changes in scrubber speed, with time constant tau = V / Qe where V is the Lab volume and Qe is the effective scrubber flow",
      "The effective scrubber flow Qe is proportional to the speed command: Qe(c) = c × 1.0 m³/min where c is the fractional speed (0 to 1)",
      "The scrubber response to a speed command change is first-order with a time constant of 3.33 minutes",
      "The CO2 concentration evolves according to the mass balance: V × dC/dt = G - Qe × C, where G is the total CO2 production rate from crew",
      "At equilibrium, the CO2 concentration settles at C_eq = G / Qe",
      "The CO2 production rate G depends on the number of crew in the Lab and their activity level (awake or asleep)"
    ],
    "known": [
      {
        "symbol": "Qe_max",
        "name": "Effective scrubber flow at full speed",
        "value": 1,
        "unit": "m3/min",
        "source": "scrubber-1-datasheet"
      },
      {
        "symbol": "eta",
        "name": "Single-pass removal efficiency",
        "value": 0.3,
        "unit": "Dimensionless",
        "source": "scrubber-1-datasheet"
      },
      {
        "symbol": "tau_scrubber",
        "name": "Scrubber response time constant",
        "value": 3.33,
        "unit": "min",
        "source": "scrubber-1-datasheet"
      },
      {
        "symbol": "g_awake",
        "name": "CO2 production rate per awake crewmember",
        "value": 0.38,
        "unit": "L/min",
        "source": "nasa-crew-metabolic-loads",
        "min": 0.26,
        "max": 0.45
      },
      {
        "symbol": "g_asleep",
        "name": "CO2 production rate per sleeping crewmember",
        "value": 0.24,
        "unit": "L/min",
        "source": "nasa-crew-metabolic-loads",
        "min": 0.17,
        "max": 0.28
      },
      {
        "symbol": "co2_elevated",
        "name": "CO2 concentration threshold for ELEVATED status",
        "value": 3500,
        "unit": "ppm",
        "source": "this-installation"
      },
      {
        "symbol": "co2_critical",
        "name": "CO2 concentration threshold for CRITICAL status",
        "value": 4000,
        "unit": "ppm",
        "source": "this-installation"
      }
    ],
    "external_influences": [
      {
        "name": "Crew metabolic CO2 production",
        "quantity": "ConcentrationRate",
        "unit": "ppm/min"
      },
      {
        "name": "Hatch opening state",
        "quantity": "Category",
        "unit": "no unit"
      }
    ],
    "constraints": [
      "Scrubber speed command must be between 0 and 100 percent",
      "The hatch between Lab and Hab-B is closed during the test, so no air exchange occurs between modules",
      "The scrubber's single-pass efficiency (0.30) and effective flow relationship are fixed pro
```

## 8. graph factory

- who: the graph factory, builder reasoner
- goal: build the twin from the catalogue and make it evolve by its gap to the telemetry until the residual is under 25 ppm
- tools: workspace.read x2, twin.registry_search x4, twin.registry_describe_node x3, twin.registry_list_nodes x1, task.plan x2, library.search x1, library.read x1, graph.evaluate x1, task.done x1

| step | source | capability | outcome | note |
|---|---|---|---|---|
| 1 | fallback | workspace.read | completed | workspace.read completed; nothing new in the workshop |
| 2 | fallback | twin.registry_search | completed | twin.registry_search completed; nothing new in the workshop |
| 3 | fallback | twin.registry_describe_node | completed | twin.registry_describe_node completed; nothing new in the workshop |
| 4 | fallback | twin.registry_describe_node | completed | twin.registry_describe_node completed; nothing new in the workshop |
| 5 | fallback | twin.registry_describe_node | completed | twin.registry_describe_node completed; nothing new in the workshop |
| 6 | fallback | twin.registry_search | completed | twin.registry_search completed; nothing new in the workshop |
| 7 | fallback | twin.registry_search | completed | twin.registry_search completed; nothing new in the workshop |
| 8 | fallback | twin.registry_list_nodes | completed | twin.registry_list_nodes completed; nothing new in the workshop |
| 9 | fallback | twin.registry_search | completed | twin.registry_search completed; nothing new in the workshop |
| 10 | refused | task.plan | refused | plan refused: missing capability "Equilibrium CO2 concentration in Lab" names an unknown topic "CO2 equilibrium calculation" (graph, onnx, procedure) |
| 11 | fallback | library.search | completed | library.search completed; nothing new in the workshop |
| 12 | fallback | library.read | completed | library.read completed; nothing new in the workshop |
| 13 | fallback | task.plan | completed | plan accepted: 4 node type(s), 0 missing capability(ies) |
| 14 | fallback | workspace.read | completed | workspace.read completed; nothing new in the workshop |
| 15 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |
| 16 | fallback | task.done | completed | contract held on topic graph: graph candidate-1.spikypanda |

Refusals:
- step 10, task.plan: plan refused: missing capability "Equilibrium CO2 concentration in Lab" names an unknown topic "CO2 equilibrium calculation" (graph, onnx, procedure)

Mother:
> Simulateur 1. 4 nœuds. Écart 13 ppm, sous le seuil de 25. Accepté.

Output:

```json
{
  "state": "proposed",
  "ended": "contract held after 16 step(s)",
  "candidates": [
    {
      "n": 1,
      "label": "Lab CO2 dynamics: 2 awake crew, variable scrubber speed, mass balance with fitted volume",
      "path": "candidate-1.spikypanda",
      "sha256": "c864820e45a1e8429192a0e88e808c0d3746c2ccb8df8474bbf3e7d5ef216a1a",
      "nodes": 4,
      "types": [
        "Logic.Time:timeline",
        "Physics.LifeSupport:cabin-air",
        "Physics.LifeSupport:crew",
        "Physics.LifeSupport:scrubber"
      ],
      "connections": 3,
      "variables": {
        "Qe_max": 1,
        "g_awake": 0.38,
        "tau_scrubber": 3.33,
        "V": 29.56
      },
      "residuals": [
        {
          "column": "co2_lab_ppm",
          "probe": "lab.co2Ppm",
          "rmse": 12.6,
          "worst": 22.6,
          "worstMinute": 22
        }
      ],
      "threshold": 25,
      "pass": true,
      "combinations": 16,
      "fitted": [
        "V"
      ],
      "estimator": "nelder-mead",
      "warnings": [],
      "at": "2026-09-24T17:37:30.995Z",
      "early": {
        "column": "co2_lab_ppm",
        "minutes": 5,
        "predicted": 18.1,
        "measured": 19.8
      },
      "spec": {
        "nodes": [
          {
            "id": "lab",
            "typeId": "Physics.LifeSupport:cabin-air",
            "params": {
              "initialPpm": {
                "$first": "co2_lab_ppm"
              },
              "removalFloorPpm": 0,
              "leakPerMinute": 0
            }
          },
          {
            "id": "crew_lab",
            "typeId": "Physics.LifeSupport:crew",
            "params": {
              "count": 2,
              "activity": "light_work",
              "emissionLightWorkPpmPerMinute": {
                "$expr": "g_awake * 1e3 / V"
              }
            }
          },
          {
            "id": "scrubber",
            "typeId": "Physics.LifeSupport:scrubber",
            "params": {
              "rateAtFullCommandPerMinute": {
                "$expr": "Qe_max / V"
              },
              "lagTimeConstantMinutes": 3.33
            }
          },
          {
            "id": "speed_timeline",
            "typeId": "Logic.Time:timeline",
            "params": {
              "segments": {
                "$series": {
                  "column": "speed_percent",
                  "scale": "0.01"
                }
              }
            }
          }
        ],
        "connections": [
          {
            "from": [
              "speed_timeline",
              "value"
            ],
            "to": [
              "scrubber",
              "command"
            ]
          },
          {
            "from": [
              "scrubber",
              "effectiveRate"
            ],
            "to": [
              "lab",
              "scrubberRate"
            ]
          },
          {
            "from": [
              "crew_lab",
              "co2Emission"
            ],
            "to": [
              "lab",
              "emissionA"
            ]
          }
        ]
      },
      "structure": {
        "name": "candidate 1",
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
            "from": "Physics.LifeSupport:scrubber.effectiveRate",
            "to": "Physics.LifeSupport:cabin-air.scrubberRate"
          },
          {
            "from": "Physics.LifeSupport:crew.co2Emission",
            "to": "Physics.LifeSupport:cabin-air.emissionA"
          }
        ]
      },
      "reference": {
        "reference": "the station's cabin twin (graphs/cabin.spikypanda)",
        "sharedTypes": [
          "Logic.Time:timeline",
          "Physics.LifeSupport:cabin-air",
          "Physics.LifeSupport:crew",
          "Physics.LifeSupport:scrubber"
        ],
        "missingTypes": [],
        "extraTypes": [],
        "sharedWires": [
          "Physics.LifeSupport:crew.co2Emission -> Physics.LifeSupport:cabin-air.emissionA",
          "Logic.Time:timeline.value -> Physics.LifeSupport:scrubber.command",
          "Physics.LifeSupport:scrubber.effectiveRate -> Physics.LifeSupport:cabin-air.scrubberRate"
        ],
        "missingWires": [
          "Logic.Time:timeline.value -> Physics.LifeSupport:crew.count",
          "Logic.Time:timeline.value -> Physics.LifeSupport:crew.activity",
          "Physics.LifeSupport:crew.co2Emission -> Physics.LifeSupport:cabin-air.emissionB"
        ],
        "extraWires": [],
        "wiringMatch": 0.5
      }
    }
  ],
  "truth": {
    "VLab": 30,
    "VHab": 400,
    "QeFull": 1,
    "q": 0.6,
    "gLabPerson": 0.42,
    "gHabPerson": 0.3,
    "labOccupants": 2,
    "habOccupants": 2,
    "lagMinutes": 3.33,
    "labStartPpm": 1480,
    "habStartPpm": 1500
  }
}
```

## 9. references

- who: the script: the graphs written by hand, and the comparison
- goal: run the hand-written graphs on the same telemetry with only what the model was given (the crew's rate as NASA's band), and compare every candidate with them and with the station's twin
- tools: twin.document_build x106, twin.session_run x106

Output:

```json
{
  "truth": {
    "V": 30,
    "q": 0.6,
    "g": 0.42
  },
  "references": [
    {
      "name": "by hand: the Lab alone",
      "rmse": 10.1,
      "variables": {
        "N": 2,
        "Qe": 1,
        "lag": 3.33,
        "V": 28.01,
        "g": 0.3704
      }
    },
    {
      "name": "by hand: the Lab and the exchange through the hatch",
      "rmse": 4.1,
      "variables": {
        "N": 2,
        "Qe": 1,
        "lag": 3.33,
        "V": 27.46,
        "g": 0.4174,
        "q": 1.088
      }
    }
  ],
  "stationTwin": {
    "name": "the station's cabin twin (graphs/cabin.spikypanda)",
    "types": [
      "Logic.Time:timeline",
      "Physics.LifeSupport:cabin-air",
      "Physics.LifeSupport:crew",
      "Physics.LifeSupport:scrubber"
    ],
    "wires": [
      {
        "from": "Logic.Time:timeline.value",
        "to": "Physics.LifeSupport:crew.count"
      },
      {
        "from": "Logic.Time:timeline.value",
        "to": "Physics.LifeSupport:crew.activity"
      },
      {
        "from": "Physics.LifeSupport:crew.co2Emission",
        "to": "Physics.LifeSupport:cabin-air.emissionA"
      },
      {
        "from": "Physics.LifeSupport:crew.co2Emission",
        "to": "Physics.LifeSupport:cabin-air.emissionB"
      },
      {
        "from": "Logic.Time:timeline.value",
        "to": "Physics.LifeSupport:scrubber.command"
      },
      {
        "from": "Physics.LifeSupport:scrubber.effectiveRate",
        "to": "Physics.LifeSupport:cabin-air.scrubberRate"
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
      "label": "Lab CO2 dynamics: 2 awake crew, variable scrubber speed, mass balance with fitted volume",
      "rmse": 12.6,
      "variables": {
        "Qe_max": 1,
        "g_awake": 0.38,
        "tau_scrubber": 3.33,
        "V": 29.56
      },
      "againstStationTwin": {
        "reference": "the station's cabin twin (graphs/cabin.spikypanda)",
        "sharedTypes": [
          "Logic.Time:timeline",
          "Physics.LifeSupport:cabin-air",
          "Physics.LifeSupport:crew",
          "Physics.LifeSupport:scrubber"
        ],
        "missingTypes": [],
        "extraTypes": [],
        "sharedWires": [
          "Physics.LifeSupport:crew.co2Emission -> Physics.LifeSupport:cabin-air.emissionA",
          "Logic.Time:timeline.value -> Physics.LifeSupport:scrubber.command",
          "Physics.LifeSupport:scrubber.effectiveRate -> Physics.LifeSupport:cabin-air.scrubberRate"
        ],
        "missingWires": [
          "Logic.Time:timeline.value -> Physics.LifeSupport:crew.count",
          "Logic.Time:timeline.value -> Physics.LifeSupport:crew.activity",
          "Physics.LifeSupport:crew.co2Emission -> Physics.LifeSupport:cabin-air.emissionB"
        ],
        "extraWires": [],
        "wiringMatch": 0.5
      },
      "againstHandGraph": {
        "reference": "the commissioning graph written by hand",
        "sharedTypes": [
          "Logic.Time:timeline",
          "Physics.LifeSupport:cabin-air",
          "Physics.LifeSupport:crew",
          "Physics.LifeSupport:scrubber"
        ],
        "missingTypes": [],
        "extraTypes": [],
        "sharedWires": [
          "Logic.Time:timeline.value -> Physics.LifeSupport:scrubber.command",
          "Physics.LifeSupport:crew.co2Emission -> Physics.LifeSupport:cabin-air.emissionA",
          "Physics.LifeSupport:scrubber.effectiveRate -> Physics.LifeSupport:cabin-air.scrubberRate"
        ],
        "missingWires": [
          "Logic.Time:timeline.value -> Physics.LifeSupport:cabin-air.emissionB"
        ],
        "extraWires": [],
        "wiringMatch": 0.75
      },
      "numbersAgainstHandGraph": [
        {
          "parameter": "Physics.LifeSupport:cabin-air.removalFloorPpm",
          "candidate": 0,
          "reference": 0,
          "ratio": null
        },
        {
          "parameter": "Physics.LifeSupport:cabin-air.leakPerMinute",
          "candidate": 0,
          "reference": 0.03962,
          "ratio": 0
        }
      ]
    }
  ]
}
```

## 10. proposal

- who: the factory's runner, then the station
- goal: propose the accepted twin to the station, which receives it for the judge
- tools: none

Output:

```json
{
  "proposalId": "p0002-85bcecf7",
  "taskId": "t-2026-09-24-0020",
  "artifacts": [
    {
      "kind": "graph",
      "path": "candidate-1.spikypanda",
      "sha256": "c864820e45a1e8429192a0e88e808c0d3746c2ccb8df8474bbf3e7d5ef216a1a"
    }
  ],
  "manifestSha256": "85bcecf7d6e6be62e4f77dd3f0da9d5748b218cc7873a677a8bb739f9a1e388a",
  "claims": {
    "requiredOutputs": [
      "CO2 concentration in Lab",
      "CO2 concentration rate of change in Lab",
      "Equilibrium CO2 concentration in Lab"
    ],
    "summary": "Built a CO2 twin graph for the Lab module that reproduces the telemetry within the residual threshold of 25 ppm. The graph models the Lab as a well-mixed volume with two awake crew members producing CO2 at 0.38 L/min each, and a variable-speed scrubber removing CO2 at a rate proportional to speed and concentration. The fitted Lab volume is 29.56 m³. The model achieves an RMSE residual of 12.6 ppm against the measured co2_lab_ppm column, with worst-case error of 22.6 ppm at minute 22. The graph correctly captures both the CO2 rise phase (minutes 0-15 at 30% scrubber speed) and the decay phase (minutes 16-30 at 100% scrubber speed), demonstrating first-order exponential dynamics consistent with the mass balance equation: V × dC/dt = G - Qe × C, where the time constant τ = V/Qe ≈ 29.56 m³ / 1 m³/min ≈ 30 minutes.",
    "plan": {
      "selected_nodes": [
        "Physics.LifeSupport:cabin-air",
        "Physics.LifeSupport:crew",
        "Physics.LifeSupport:scrubber",
        "Logic.Time:timeline"
      ],
      "missing_capabilities": []
    },
    "sandbox": null
  },
  "status": "received",
  "receivedAt": "2026-09-24T17:37:36.660Z"
}
```
