# The hand-off on the model, 2026-09-26T08-13-09

- seconds: 100
- the contract written by the graph factory's model: {
  "inputs": {
    "pressure_pa": {
      "quantity": "Pressure",
      "unit": "Pa",
      "range": [
        0,
        200000
      ],
      "unwired": 101325
    },
    "opening_fraction": {
      "quantity": "Dimensionless",
      "unit": "1",
      "range": [
        0,
        1
      ],
      "unwired": 0
    }
  },
  "outputs": {
    "leak_co2": {
      "quantity": "MassFlow",
      "unit": "kg/s"
    }
  },
  "parameters": {
    "leak_rate_at_full_opening": {
      "quantity": "MassFlow",
      "unit": "kg/s",
      "editable": true,
      "value": 0.0001
    }
  },
  "behaviors": [
    "leak_co2(opening_fraction=0) == 0",
    "leak_co2(opening_fraction=1, pressure_pa=101325) == leak_rate_at_full_opening",
    "leak_co2(opening_fraction=0.5, pressure_pa=101325) == 0.5 * leak_rate_at_full_opening"
  ]
}

| task | id | state | steps | refusals | tokens in/out | trace |
|---|---|---|---|---|---|---|
| graph factory | t-2026-09-26-0010 | failed | 3 | 1 | 6068/1409 | docs/exemples/2026-09-26-forge-9-haiku-handoff/trace/01-graph-factory.md |
| code factory | t-2026-09-26-0011 | proposed | 13 | 0 | 73498/4921 | docs/exemples/2026-09-26-forge-9-haiku-handoff/trace/02-code-factory.md |
| graph factory, replayed on the forge | t-2026-09-26-0012 | failed | 4 | 2 | 9836/1989 | docs/exemples/2026-09-26-forge-9-haiku-handoff/trace/03-graph-factory-replayed.md |

## Steps

- graph task t-2026-09-26-0010 started
-   graph step 1: workspace.read -> completed (workspace.read completed; nothing new in the workshop)
-   graph step 2: task.plan -> refused (plan refused: missing capability "leak_co2 (MassFlow, kg/s)", contract: type "Physics.Habitat:leak" is not named under "Generated." (as in "Generated.Habitat:leak"): a generated node is; leave type ou)
-   graph step 3: task.plan -> completed (plan accepted: 12 node type(s), 1 missing capability(ies))
- graph task t-2026-09-26-0010: failed (MISSING_CAPABILITY: "leak_co2" for the code factory; this task ends here, the hand-off opens that factory's task on the contract and replays this request once the node exists); missing: leak_co2 with a contract
- code task t-2026-09-26-0011 opened on the contract
-   code step 1: forge.registry_search -> completed (forge.registry_search completed; nothing new in the workshop)
-   code step 2: task.plan -> completed (plan accepted: 0 node type(s), 1 missing capability(ies))
-   code step 3: forge.plugin_template -> completed (forge.plugin_template completed; nothing new in the workshop)
-   code step 4: forge.plugin_write -> completed (forge.plugin_write completed; the workshop changed)
-   code step 5: forge.plugin_build -> completed (forge.plugin_build completed; the workshop changed)
-   code step 6: forge.plugin_test -> completed (forge.plugin_test completed; nothing new in the workshop)
-   code step 7: code.accept -> completed (code.accept completed; nothing new in the workshop)
-   code step 8: forge.plugin_load -> completed (forge.plugin_load completed; nothing new in the workshop)
-   code step 9: forge.registry_describe_node -> completed (forge.registry_describe_node completed; nothing new in the workshop)
-   code step 10: forge.document_build -> completed (forge.document_build completed; the workshop changed)
-   code step 11: forge.session_run -> completed (forge.session_run completed; nothing new in the workshop)
-   code step 12: forge.plugin_promote -> completed (forge.plugin_promote completed; the workshop changed)
-   code step 13: task.done -> completed (contract held on topic code: plugin forge/leak-co2/artifact.json)
- code task t-2026-09-26-0011: proposed (contract held after 13 step(s))
- graph task t-2026-09-26-0012 replayed on the forge
-   replay step 1: workspace.read -> completed (workspace.read completed; nothing new in the workshop)
-   replay step 2: task.plan -> refused (plan refused: missing capability "leak_co2 (MassFlow, kg/s)", contract: type "leak-co2" is not named under "Generated." (as in "Generated.Habitat:leak"): a generated node is; leave type out to let the)
-   replay step 3: task.plan -> refused (plan refused: missing capability "leak_co2", contract: "output(leak_rate_percent=100) == leak_rate_at_full_opening * (co2_ppm / 1000000) * (volume_m3 / 30)": "leak_rate_at_full_opening * (co2_ppm / 10)
-   replay step 4: task.plan -> completed (plan accepted: 12 node type(s), 1 missing capability(ies))
- replay t-2026-09-26-0012: failed (MISSING_CAPABILITY: "leak_co2" for the code factory; this task ends here, the hand-off opens that factory's task on the contract and replays this request once the node exists)

## Request

```json
{
  "objective": {
    "required_outputs": [
      {
        "name": "predicted_co2",
        "quantity": "Concentration",
        "unit": "ppm"
      },
      {
        "name": "leak_co2",
        "quantity": "MassFlow",
        "unit": "kg/s"
      }
    ],
    "constraints": {
      "residualPpmMax": 10
    }
  },
  "observations": {
    "persons": [
      {
        "id": "fe-1",
        "callsign": "FE-1",
        "name": "A. Pelletier",
        "module": "lab",
        "activity": "light_work"
      },
      {
        "id": "fe-2",
        "callsign": "FE-2",
        "name": "M. Chen",
        "module": "lab",
        "activity": "light_work"
      },
      {
        "id": "cdr",
        "callsign": "CDR",
        "name": "J. Picard",
        "module": "hab-b",
        "activity": "rest"
      },
      {
        "id": "fe-3",
        "callsign": "FE-3",
        "name": "G. La Forge",
        "module": "hab-b",
        "activity": "rest"
      }
    ],
    "devices": [
      {
        "path": "/habitat/lab/eclss/scrubber-1",
        "descriptor": {
          "@type": "Scrubber",
          "title": "CO2 scrubber",
          "properties": {
            "speed": {
              "quantity": "Ratio",
              "unit": "percent",
              "commandable": {
                "action": "set_speed",
                "min": 0,
                "max": 100
              }
            },
            "current": {
              "quantity": "Current",
              "unit": "A",
              "readOnly": true
            },
            "flowAtFull": {
              "quantity": "VolumetricFlow",
              "unit": "m3ps",
              "readOnly": true,
              "value": 0.055
            },
            "effectiveFlowAtFull": {
              "quantity": "VolumetricFlow",
              "unit": "m3ps",
              "readOnly": true,
              "value": 0.016667
            },
            "singlePassEfficiency": {
              "quantity": "Ratio",
              "unit": "ratio",
              "readOnly": true,
              "value": 0.30303
            },
            "lagTimeConstant": {
              "quantity": "Time",
              "unit": "min",
              "readOnly": true,
              "value": 3.33
            }
          },
          "actions": [
            "set_speed",
            "power",
            "set_min_flow"
          ]
        }
      },
      {
        "path": "/habitat/lab/eclss/co2-1",
        "descriptor": {
          "@type": "Co2Sensor",
          "title": "CO2 sensor",
          "properties": {
            "co2": {
              "quantity": "Concentration",
              "unit": "ppm",
              "readOnly": true
            }
          }
        }
      },
      {
        "path": "/habitat/lab/hatch-1",
        "descriptor": {
          "@type": "Hatch",
          "title": "Hatch",
          "properties": {
            "state": {
              "quantity": "State",
              "unit": "open|closed",
              "readOnly": true
            }
          },
          "links": [
            {
              "rel": "connects",
              "href": "/habitat/lab"
            },
            {
              "rel": "connects",
              "href": "/habitat/hab-b"
            }
          ]
        }
      },
      {
        "path": "/habitat/hab-b/eclss/co2-2",
        "descriptor": {
          "@type": "Co2Sensor",
          "title": "CO2 sensor",
          "properties": {
            "co2": {
              "quantity": "Concentration",
              "unit": "ppm",
              "readOnly": true
            }
          }
        }
      },
      {
        "path": "/habitat/power/battery-1",
        "descriptor": {
          "@type": "Battery",
          "title": "Battery",
          "properties": {
            "stateOfCharge": {
              "quantity": "Ratio",
              "unit": "percent",
              "readOnly": true
            }
          }
        }
      }
    ]
  },
  "data": [
    {
      "file": "telemetry.json",
      "rows": "51 rows"
    }
  ],
  "requirements": {
    "objective": "reproduce the Lab CO2 during the decay test, and expose the CO2 that leaves the Lab through a leak in a seal: a mass flow out of the volume at a constant rate at full opening, scaled by a command between 0 and 1 (the leak fully open when nothing commands it), the rate an editable of the node",
    "missing_information": [
      "the flow the inter-module ventilation delivers, hatch closed",
      "the leak's rate at full opening: not measured, to be set as an editable"
    ],
    "hypotheses": [
      "a seal of the Lab leaks; no node of the catalogue expresses a leak (every CO2 sink of the catalogue is a scrubber)"
    ]
  },
  "budget": {
    "iterations": 16,
    "twinPoints": 200
  },
  "builder": "reasoner",
  "requestedBy": "the hand-off example"
}
```
