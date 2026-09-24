# Commissioning example, 2026-09-24T16-14-01

| # | loop | kind | decisions | model calls | tokens in/out | calls | seconds |
|---|---|---|---|---|---|---|---|
| 1 | registration | code | - | - | - | 6 | 0 |
| 2 | procedure factory | model | 12 | 12 | 155397/4067 | 12 | 57 |
| 3 | relay | code | - | - | - | 1 | 0 |
| 4 | authorisation | human (stood in by the script) | 1 | - | - | 1 | 0 |
| 5 | execution | code | - | - | - | 319 | 0 |
| 6 | report | code | - | - | - | 0 | 0 |
| 7 | observer | model | 2 | 2 | 10737/2059 | 5 | 22 |
| 8 | graph factory | model | 30 | 30 | 1001868/10842 | 30 | 152 |
| 9 | proposal | code | - | - | - | 0 | 0 |

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
- tools: factory.inventory x1, library.methods x1, library.read x1, task.plan x1, biomed.presence x1, biomed.describe x1, station.registry_list x1, library.search x2, procedure.submit x2, task.done x1

| step | source | capability | outcome | note |
|---|---|---|---|---|
| 1 | fallback | factory.inventory | completed | factory.inventory completed; nothing new in the workshop |
| 2 | fallback | library.methods | completed | library.methods completed; nothing new in the workshop |
| 3 | fallback | library.read | completed | library.read completed; nothing new in the workshop |
| 4 | fallback | task.plan | completed | plan accepted: 0 node type(s), 1 missing capability(ies) |
| 5 | fallback | biomed.presence | completed | biomed.presence completed; nothing new in the workshop |
| 6 | fallback | biomed.describe | completed | biomed.describe completed; nothing new in the workshop |
| 7 | fallback | station.registry_list | completed | station.registry_list completed; nothing new in the workshop |
| 8 | fallback | library.search | completed | library.search completed; nothing new in the workshop |
| 9 | fallback | library.search | completed | library.search completed; nothing new in the workshop |
| 10 | refused | procedure.submit | refused | procedure refused: floor: the procedure sets its own minimum speed at 20 %, below the floor of 30 %: a procedure may raise the floor, never lower it; bounds: the CO2 abort limit 3800 ppm is above the ceiling of 3200 ppm; duration: the maxim |
| 11 | fallback | procedure.submit | completed | procedure.submit completed; the workshop changed |
| 12 | fallback | task.done | completed | contract held on topic procedure: procedure procedures/decay-lab-volume-2026-09-24-02.json |

Refusals:
- step 10, procedure.submit: procedure refused: floor: the procedure sets its own minimum speed at 20 %, below the floor of 30 %: a procedure may raise the floor, never lower it; bounds: the CO2 abort limit 3800 ppm is above the ceiling of 3200 ppm; duration: the maximum duration 180 min is above the ceiling of 60 min

Mother:
> Protocole d'essai proposé. Décroissance de concentration. 2 pas, 180 minutes. 2 opérateurs dans le module lab.
> Protocole refusé. Il fixe sa propre vitesse minimale à 20 pour cent. Sous le débit minimal.
> Protocole corrigé. 50 pour cent.
> L'essai fera monter le CO2 de l'air que respirent les 2 opérateurs. Demande d'autorisation, commandant.

Output:

```json
{
  "state": "proposed",
  "ended": "contract held after 12 step(s)",
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
    "version": 1,
    "id": "decay-lab-volume-2026-09-24-02",
    "method": "concentration-decay",
    "volume": "/habitat/lab",
    "device": "/habitat/lab/eclss/scrubber-1",
    "purpose": "Measure the volume of /habitat/lab served by scrubber-1 using concentration decay method with occupants as CO2 source",
    "standard": "ASTM E741, ASTM D6245",
    "quantities": [
      {
        "name": "CO2 concentration in lab",
        "quantity": "Concentration",
        "unit": "ppm"
      },
      {
        "name": "CO2 concentration in hab-b",
        "quantity": "Concentration",
        "unit": "ppm"
      },
      {
        "name": "Scrubber speed",
        "quantity": "Ratio",
        "unit": "percent"
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
        "speedPercent": 50,
        "minutes": 30,
        "why": "Raise CO2 concentration towards equilibrium at reduced scrubber speed; target rise to ~800-1200 ppm above baseline"
      },
      {
        "n": 2,
        "hatch": "closed",
        "speedPercent": 100,
        "minutes": 30,
        "why": "Return scrubber to full speed and record decay curve to measure time constant tau"
      }
    ],
    "abort": [
      {
        "id": "co2",
        "source": "/habitat/lab/eclss/co2-1",
        "when": "co2 at or above limits.co2AbortPpm",
        "threshold": 3200
      },
      {
        "id": "refused",
        "source": "/habitat/lab/eclss/scrubber-1",
        "when": "scrubber.motor.set_speed command refused"
      },
      {
        "id": "battery",
        "source": "/habitat/power/battery-1",
        "when": "battery state of charge under 30 percent",
        "threshold": 30
      },
      {
        "id": "vitals",
        "source": "biomed.verdict",
        "when": "monitored person out of band or monitoring lost"
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
      "at": "2026-09-24T16:14:02Z"
    },
    "monitoring": {
      "subjects": [
        "fe-1",
        "fe-2"
      ],
      "reason": "Test raises CO2 to several hundred ppm above baseline; occupants must be monitored for effects",
      "band": {
        "minBpm": 45,
        "maxBpm": 120
      }
    },
    "expected": {
      "rise_phase": "CO2 in lab rises from baseline (~400 ppm) towards equilibrium at 50% scrubber speed. With 2 occupants producing ~0.6 L/min CO2 and scrubber at 50% speed (~0.5 m³/min effective flow), equilibrium would be ~1200 ppm for 50 m³ volume. Rise should be smooth exponential approach with time constant tau = V/0.5.",
      "decay_phase": "After returning to full speed, CO2 decays exponentially towards lower equilibrium (~400 ppm). Time constant tau = V/Qe (V/1 m³/min) determines decay rate. Fitting the decay curve gives tau; volume V = tau * 1 m³/min.",
      "hab_b_co2": "CO2 in hab-b should remain near baseline (~400 ppm) throughout, showing hatch is closed and no significant exchange.",
      "speed_commands": "Scrubber should accept both speed commands (50% and 100%) without refusal."
    },
    "hypotheses": [
      "Lab is a single well-mixed zone with no significant stratification",
      "Hatch-1 remains closed throughout the test; no air exchange with hab-b",
      "Occupants remain in lab and maintain steady activity level (rest) throughout test",
      "CO2 production rate is constant at ~0.3 L/min per occupant",
      "Scrubber effective flow scales linearly with speed command",
      "No other CO2 sources or sinks in lab during test"
    ],
    "authorisation": {
      "required": true,
      "by": "Habitat Commander"
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
  "procedure": "decay-lab-volume-2026-09-24-02",
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
    "sessionId": "crew-20260924161459",
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
- tools: station.commissioning_state x1, station.procedure_run x6, scrubber.motor.state x124, station.registry_list x62, biomed.state x62, biomed.verdict x62, scrubber.motor.set_speed x2

Mother:
> Essai en cours. Pas 1 sur 2.
> Essai en cours. Pas 2 sur 2.
> Essai terminé. 60 minutes.
> Volume apparent : 35 mètres cubes.
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
- goal: close the monitoring, compute the served volume from the decay
- tools: none

Output:

```json
{
  "volume": {
    "quantity": "Volume",
    "name": "V",
    "value": 35,
    "unit": "m3",
    "fit": {
      "volumeM3": 34.97161047129415,
      "tauMinutes": 34.97091105307308,
      "equilibriumPpm": 1039,
      "rmsePpm": 7.836473139650009,
      "samples": 31
    },
    "why": "apparent volume, one room assumed: decay of step 2: tau 35.0 min over 31 samples, residual 7.8 ppm"
  },
  "steps": [
    {
      "n": 1,
      "speed": 50,
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
        1333
      ]
    }
  ],
  "vitalEvents": 0
}
```

## 7. observer

- who: the Observer, reasoner:claude with harness/observer/prompt.md
- goal: from the description and the telemetry, formulate what the twin must do (the TWIN_FACTORY_REQUEST), without seeing the catalogue
- tools: reasoner.decide x2, reasoner.describe x1, twin.registry_list_nodes x1, library.search x1

| step | source | capability | outcome | note |
|---|---|---|---|---|
| 1 | model | observer.request | accepted |  |

Output:

```json
{
  "accepted": true,
  "libraryReads": [
    "library.search \"CO2 scrubber lunar habitat Lab module\""
  ],
  "request": {
    "objective": "Reproduce the CO2 concentration in the Lab module well enough to evaluate scrubber speed strategies, given the scrubber speed command and the crew's CO2 production.",
    "entities": [
      {
        "name": "Lab module",
        "kind": "volume of air",
        "description": "The pressurised volume in the Lab where the scrubber operates; well-mixed; volume 35 m³"
      },
      {
        "name": "CO2 scrubber",
        "kind": "device",
        "description": "Variable-speed scrubber that removes CO2 from the Lab air; regenerable bed type; effective flow rate depends on speed command"
      },
      {
        "name": "Crew in Lab",
        "kind": "occupants",
        "description": "Two people in the Lab module; their activity and CO2 production are the source term"
      },
      {
        "name": "CO2 sensor in Lab",
        "kind": "sensor",
        "description": "Measures CO2 concentration in the Lab module"
      },
      {
        "name": "Hab-B module",
        "kind": "volume of air",
        "description": "Adjacent module connected to Lab by a closed hatch; has its own CO2 sensor"
      }
    ],
    "relationships": [
      {
        "from": "CO2 scrubber",
        "to": "Lab module",
        "relation": "removes CO2 from"
      },
      {
        "from": "Crew in Lab",
        "to": "Lab module",
        "relation": "produces CO2 into"
      },
      {
        "from": "Lab module",
        "to": "Hab-B module",
        "relation": "may exchange air with through closed hatch"
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
        "name": "CO2 concentration in Hab-B",
        "quantity": "Concentration",
        "unit": "ppm",
        "column": "co2_habb_ppm"
      }
    ],
    "outputs": [
      {
        "name": "CO2 concentration in Lab",
        "quantity": "Concentration",
        "unit": "ppm"
      }
    ],
    "external_influences": [
      {
        "name": "Crew CO2 production",
        "quantity": "ConcentrationRate",
        "unit": "ppm/min"
      },
      {
        "name": "Air leakage through closed hatch",
        "quantity": "ConcentrationRate",
        "unit": "ppm/min"
      }
    ],
    "required_behaviors": [
      "The Lab CO2 concentration evolves according to a mass balance: crew CO2 production minus scrubber removal, plus any exchange with Hab-B",
      "The scrubber's effective removal rate is proportional to its speed command (0 to 100 percent), with a time constant tau = 35 min derived from the decay test",
      "The scrubber's effective removal rate follows a first-order lag response to speed changes, reflecting the bed's thermal and loading dynamics",
      "The Lab air is well-mixed; CO2 concentration is uniform throughout the volume",
      "The hatch is closed during the test; any air exchange with Hab-B is minimal and not documented"
    ],
    "constraints": [
      "Lab volume: 35 m³ (measured from decay test)",
      "Time constant tau: 35.0 min (measured from decay test with 31 samples, residual 7.8 ppm)",
      "Crew: two people in Lab during test; their activity and CO2 emission rate are constant during the test",
      "Hatch between Lab and Hab-B is closed during the test",
      "Scrubber speed command ranges from 33% to 100% in the test data",
      "Test duration: 60 minutes (30 min at 50%, then 30 min at 100%)"
    ],
    "assumptions": [
      "The crew's CO2 production rate is constant during the test (activity does not change)",
      "The Lab air is well-mixed; no spatial gradients in CO2 concentration",
      "The hatch seals are not perfectly tight, but the leakage rate is negligible compared to the scrubber's flow during the test",
      "The scrubber's effective flow rate is proportional to its speed command (linear relationship)",
      "The scrubber's removal efficiency (single-pass) is constant across the range of speeds and concentrations in the test",
      "The CO2 sensor has negligible response time and measurement error compared to the dynamics of the system",
      "No other sources or sinks of CO2 in the Lab (e.g., metabolic activity of equipment, outgassing of materials)"
    ],
    "missing_information": [
      "The crew's activity level during the test (sleep, rest, light work, heavy work) and the corresponding per-person CO2 production rate in ppm/min for the 35 m³ Lab volume",
      "The scrubber's full-speed effective flow rate (m³/min) or equivalently the full-speed removal rate (1/min)",
      "The scrubber's first-order lag time constant (minutes) for response to speed changes",
      "The single-pass efficiency (eta) of the scrubber's sorbent bed",
      "The air exchange rate between Lab and Hab-B through the closed hatch (if any)",
      "The scrubber's minimum speed threshold below which it does not operate",
      "Whether the scrubber has a recovery delay when restarted from low speed"
    ],
    "validation": {
      "criteria": [
        "The twin's CO2 concentration output matches the measured co2_lab_ppm within the residual error of 7.8 ppm over the 60-minute test",
        "The twin reproduces the rise phase (0–30 min at 50% speed) and the decay phase (30–60 min at 100% speed) with the correct time constant tau = 35 min
```

## 8. graph factory

- who: the graph factory, builder reasoner
- goal: build the twin from the catalogue and make it evolve by its gap to the telemetry until the residual is under 25 ppm
- tools: workspace.read x2, twin.registry_search x4, twin.registry_describe_node x4, twin.registry_list_nodes x1, task.plan x1, graph.evaluate x15, twin.document_validate x1, library.search x1, library.read x1

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
| 10 | fallback | twin.registry_describe_node | completed | twin.registry_describe_node completed; nothing new in the workshop |
| 11 | fallback | workspace.read | completed | workspace.read completed; nothing new in the workshop |
| 12 | fallback | task.plan | completed | plan accepted: 4 node type(s), 0 missing capability(ies) |
| 13 | fallback | graph.evaluate | refused | the candidate does not build: device refused: document: node "timeline_speed" (Logic.Time:timeline) has no parameter "$series" (a measured input is a Logic.Time:timeline whose segments are the $series, wired into the port; a port takes a co |
| 14 | fallback | twin.document_validate | completed | twin.document_validate completed; nothing new in the workshop |
| 15 | fallback | graph.evaluate | refused | the candidate does not build: device refused: document: node "timeline_speed".segments refused [{"from":0,"to":30,"value":0.5},{"from":30,"to":60,"value":1}]: timeline: segments are not JSON: Unexpected token 'o', "[object Obj"... is not va |
| 16 | fallback | library.search | completed | library.search completed; nothing new in the workshop |
| 17 | fallback | library.read | completed | library.read completed; nothing new in the workshop |
| 18 | fallback | graph.evaluate | refused | the candidate does not build: device refused: document: node "scrubber".command refused ["timeline_speed","value"]: Cannot set property command of #<ScrubberNode> which has only a getter (a measured input is a Logic.Time:timeline whose segm |
| 19 | fallback | graph.evaluate | refused | the candidate does not build: device refused: document: node "cabin" (Physics.LifeSupport:cabin-air) has no parameter "emissionA" (a measured input is a Logic.Time:timeline whose segments are the $series, wired into the port; a port takes a |
| 20 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |
| 21 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |
| 22 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |
| 23 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |
| 24 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |
| 25 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |
| 26 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |
| 27 | fallback | graph.evaluate | refused | grid: 5 levels on 3 parameter(s) is 125 runs, above the 80 allowed; fewer levels, fewer parameters, or the nelder-mead estimator |
| 28 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |
| 29 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |
| 30 | fallback | graph.evaluate | completed | graph.evaluate completed; the workshop changed |

Refusals:
- step 13, graph.evaluate: the candidate does not build: device refused: document: node "timeline_speed" (Logic.Time:timeline) has no parameter "$series" (a measured input is a Logic.Time:timeline whose segments are the $series, wired into the port; a port takes a connection, not a series)
- step 15, graph.evaluate: the candidate does not build: device refused: document: node "timeline_speed".segments refused [{"from":0,"to":30,"value":0.5},{"from":30,"to":60,"value":1}]: timeline: segments are not JSON: Unexpected token 'o', "[object Obj"... is not valid JSON (a measured input is a Logic.Time:timeline whose segments are the $series, wired into the port; a port takes a connection, not a series)
- step 18, graph.evaluate: the candidate does not build: device refused: document: node "scrubber".command refused ["timeline_speed","value"]: Cannot set property command of #<ScrubberNode> which has only a getter (a measured input is a Logic.Time:timeline whose segments are the $series, wired into the port; a port takes a connection, not a series)
- step 19, graph.evaluate: the candidate does not build: device refused: document: node "cabin" (Physics.LifeSupport:cabin-air) has no parameter "emissionA" (a measured input is a Logic.Time:timeline whose segments are the $series, wired into the port; a port takes a connection, not a series)
- step 27, graph.evaluate: grid: 5 levels on 3 parameter(s) is 125 runs, above the 80 allowed; fewer levels, fewer parameters, or the nelder-mead estimator

Mother:
> Simulateur 1. 4 nœuds. Écart 731 ppm, au-dessus du seuil de 25. Rejeté.
> Simulateur 2. 5 nœuds. Écart 1941 ppm, au-dessus du seuil de 25. Rejeté.
> Simulateur 3. 4 nœuds. Écart 84 ppm, au-dessus du seuil de 25. Rejeté.
> Simulateur 4. 4 nœuds. Écart 70 ppm, au-dessus du seuil de 25. Rejeté.
> Simulateur 5. 4 nœuds. Écart 91 ppm, au-dessus du seuil de 25. Rejeté.
> Simulateur 6. 4 nœuds. Écart 59 ppm, au-dessus du seuil de 25. Rejeté.
> Simulateur 7. 5 nœuds. Écart 613 ppm, au-dessus du seuil de 25. Rejeté.
> Simulateur 8. 4 nœuds. Écart 218 ppm, au-dessus du seuil de 25. Rejeté.
> Simulateur 9. 4 nœuds. Écart 66 ppm, au-dessus du seuil de 25. Rejeté.
> Simulateur 10. 4 nœuds. Écart 42 ppm, au-dessus du seuil de 25. Rejeté.

Output:

```json
{
  "state": "failed",
  "ended": "iteration budget spent (30)",
  "candidates": [
    {
      "n": 1,
      "label": "CO2 Lab balance: crew emission + scrubber removal with first-order lag",
      "path": "candidate-1.spikypanda",
      "sha256": "93fb6ba3ea452e0492a3c066d256f4f5cdfd2997f0961510820ecf07ed40d9f0",
      "nodes": 4,
      "types": [
        "Logic.Time:timeline",
        "Physics.LifeSupport:cabin-air",
        "Physics.LifeSupport:crew",
        "Physics.LifeSupport:scrubber"
      ],
      "connections": 3,
      "variables": {
        "V": 35,
        "Qe": 5
      },
      "residuals": [
        {
          "column": "co2_lab_ppm",
          "probe": "cabin.co2Ppm",
          "rmse": 731.3,
          "worst": 1076,
          "worstMinute": 54
        }
      ],
      "threshold": 25,
      "pass": false,
      "combinations": 7,
      "fitted": [
        "Qe"
      ],
      "estimator": "nelder-mead",
      "warnings": [
        "units: over the first 5 minutes the twin moves 3.2 ppm/min where co2_lab_ppm moves 20 ppm/min, 6.3 times slower. A gap from the first minute is not a missing term (an exchange shows late, as the volumes drift apart): check the units and scale of the rates. The catalogue's rates are per volume: a flow Qe in m3/min enters as Qe / V (1/min), a source of g L/min as g * 1e3 / V (ppm/min)."
      ],
      "at": "2026-09-24T16:16:12.605Z",
      "early": {
        "column": "co2_lab_ppm",
        "minutes": 5,
        "predicted": 3.2,
        "measured": 20
      }
    },
    {
      "n": 2,
      "label": "CO2 Lab balance: crew emission (scaled) + scrubber removal + Hab-B exchange",
      "path": "candidate-2.spikypanda",
      "sha256": "d808ffabc985cfd61c171faf148c408593e66cef53c63136434fffefc1d9e683",
      "nodes": 5,
      "types": [
        "Logic.Time:timeline",
        "Physics.LifeSupport:cabin-air",
        "Physics.LifeSupport:crew",
        "Physics.LifeSupport:scrubber"
      ],
      "connections": 4,
      "variables": {
        "V": 35,
        "Qe": 50,
        "g": 0.1,
        "q": 5
      },
      "residuals": [
        {
          "column": "co2_lab_ppm",
          "probe": "cabin.co2Ppm",
          "rmse": 1941.3,
          "worst": 4016.7,
          "worstMinute": 7
        }
      ],
      "threshold": 25,
      "pass": false,
      "combinations": 20,
      "fitted": [
        "Qe",
        "g",
        "q"
      ],
      "estimator": "nelder-mead",
      "warnings": [
        "units: over the first 5 minutes the twin moves 770.1 ppm/min where co2_lab_ppm moves 20 ppm/min, 38.5 times faster. A gap from the first minute is not a missing term (an exchange shows late, as the volumes drift apart): check the units and scale of the rates. The catalogue's rates are per volume: a flow Qe in m3/min enters as Qe / V (1/min), a source of g L/min as g * 1e3 / V (ppm/min)."
      ],
      "at": "2026-09-24T16:16:22.313Z",
      "early": {
        "column": "co2_lab_ppm",
        "minutes": 5,
        "predicted": 770.1,
        "measured": 20
      }
    },
    {
      "n": 3,
      "label": "CO2 Lab balance: crew light_work + scrubber removal, fit crew emission and scrubber flow",
      "path": "candidate-3.spikypanda",
      "sha256": "c6b73aa344da8699b683664337b8aaec7fdcf452c36487c171dd11433f252325",
      "nodes": 4,
      "types": [
        "Logic.Time:timeline",
        "Physics.LifeSupport:cabin-air",
        "Physics.LifeSupport:crew",
        "Physics.LifeSupport:scrubber"
      ],
      "connections": 3,
      "variables": {
        "V": 35,
        "Qe": 1
      },
      "residuals": [
        {
          "column": "co2_lab_ppm",
          "probe": "cabin.co2Ppm",
          "rmse": 83.5,
          "worst": 140,
          "worstMinute": 31
        }
      ],
      "threshold": 25,
      "pass": false,
      "combinations": 7,
      "fitted": [
        "Qe"
      ],
      "estimator": "nelder-mead",
      "warnings": [],
      "at": "2026-09-24T16:16:28.809Z",
      "early": {
        "column": "co2_lab_ppm",
        "minutes": 5,
        "predicted": 8.2,
        "measured": 20
      }
    },
    {
      "n": 4,
      "label": "CO2 Lab balance: crew light_work + scrubber removal, fit Qe and lag tau",
      "path": "candidate-4.spikypanda",
      "sha256": "1c4c4b8a601bb1d233472c7859c144570296a5e8f5116f9aa1f8f7650926ad93",
      "nodes": 4,
      "types": [
        "Logic.Time:timeline",
        "Physics.LifeSupport:cabin-air",
        "Physics.LifeSupport:crew",
        "Physics.LifeSupport:scrubber"
      ],
      "connections": 3,
      "variables": {
        "V": 35,
        "Qe": 0.5,
        "tau": 15.37
      },
      "residuals": [
        {
          "column": "co2_lab_ppm",
          "probe": "cabin.co2Ppm",
          "rmse": 70.3,
          "worst": 108.9,
          "worstMinute": 30
        }
      ],
      "threshold": 25,
      "pass": false,
      "combinations": 41,
      "fitted": [
        "Qe",
        "tau"
      ],
      "estimator": "nelder-mead",
      "warnings": [],
      "at": "2026-09-24T16:16:40.135Z",
      "early": {
        "column": "co2_lab_ppm",
        "minutes": 5,
        "predicted": 8.1,
        "measured": 20
      }
    },
    {
      "n": 5,
      "label": "CO2 Lab balance: crew rest activity + scrubber removal, fit Qe and lag tau",
      "path": "candidate-5.spikypanda",
      "sha256": "ea20dc1c9e21810dcf790c3129f2fa87c9781d977e8929c8e0a0f9e6c976cd62",
      "nodes": 4,
      "types": [
        "Logic.Time:timeline",
        "Physics.LifeSupport:cabin-air",
        "Physics.LifeSupport:crew",
        "Physics.LifeSupport:scrubber"
      ],
      "connections": 3,
      "variables": {
        "V": 35,
        "Qe": 0.5,
        "tau": 38.99
      },
      "residuals": [
        {
          "column": "co2_lab_ppm",
          "probe": "cabin.co2Ppm",
          "rmse": 90.5,
          "worst": 141.3,
          "worstMinute": 30
        }
      ],
      "threshold": 25,
      "pass": fals
```

## 9. proposal

- who: the factory's runner, then the station
- goal: propose the accepted twin to the station, which receives it for the judge
- tools: none

Output:

```json
{
  "proposalId": "p0001-ed6da921",
  "taskId": "t-2026-09-24-0005",
  "artifacts": [
    {
      "kind": "procedure",
      "path": "procedures/decay-lab-volume-2026-09-24-02.json",
      "sha256": "9dcaf68f0bff9f262e93ad04921b9b1b234717d567b190def8f77fc74aede274"
    }
  ],
  "manifestSha256": "ed6da92164bc431b00916e78e495ba24854eddf86ee9cac7e38e8c8dbce3fcda",
  "claims": {
    "requiredOutputs": [
      "V_lab"
    ],
    "summary": "Test procedure written and submitted for measuring V_lab (Volume, m³) of /habitat/lab using the concentration-decay method. The procedure commands scrubber-1 through two phases: (1) 30 minutes at 50% speed to raise CO2 concentration, then (2) 30 minutes at 100% speed to record the decay curve. With scrubber effective flow of 1 m³/min and 2 occupants producing ~0.6 L/min CO2, the time constant tau = V/Qe will be extracted from the decay curve, yielding V = tau × 1 m³/min. Limits set to co2MaxPpm 2800, co2AbortPpm 3200, minSpeedPercent 30, maxMinutes 60. Hatch-1 held closed throughout. Both occupants (FE-1, FE-2) monitored with heart rate band 45-120 bpm. Procedure accepted by guard with sha256 9dcaf68f0bff9f262e93ad04921b9b1b234717d567b190def8f77fc74aede274.",
    "plan": {
      "selected_nodes": [],
      "missing_capabilities": [
        {
          "required_output": "V_lab",
          "quantity": "Volume",
          "unit": "m3",
          "reason": "The volume of /habitat/lab is unknown and must be measured by running the concentration-decay procedure",
          "topic": "procedure"
        }
      ]
    },
    "sandbox": null
  },
  "status": "relayed",
  "receivedAt": "2026-09-24T16:14:57.342Z"
}
```
