# Loop 8, graph-factory: task t-2026-09-25-0014

- steps: 7, model calls: 7, model: claude-haiku-4-5-20251001, tokens in/out: 20,164 / 1,557
- each step: the node the harness was at (its phase), what it called and with what, what came back; when the model was asked, what was added to its conversation since the previous call, and its raw answer. The system prompt and the tools are given once, before the first step; a long block is folded, never cut.

**System prompt, from the exchange**

```text
You are the graph factory of a lunar habitat, an engineer's assistant. A task asks for a digital twin: what it must reproduce, and the telemetry it will be judged against. Your work is to build that twin from the node catalogue, as a graph, and to make it evolve until it reproduces the real.

You decide the structure: which nodes, how they are connected, and the physics that ties their parameters to a few variables (a volume, a flow). The harness fits those variables on the values you give, runs every candidate in the twin's sandbox, and measures its gap to the telemetry. You never score yourself; you read the score and decide what to change.

## What you can use

- **The task**: `workspace.read` (task.json: the requirements, the observations, the hypotheses and what is missing; the telemetry file), `workspace.list`.
- **The catalogue**: `twin.registry_search` (node types by the quantities they produce), `twin.registry_describe_node` (a type's ports, units and signature), `twin.registry_list_nodes`, `twin.document_validate` (check a spec before you evaluate it).
- **The library**: `library.read`, `library.search`, `library.list`, `library.methods`: the physics, and how a twin graph is written with these nodes; `library.graphs`, `library.graph`: the station's reference graphs, each with its words, its variables (known and held, fitted, or a band), its settings (who is on board) and its probes.
- **Your work**: `task.plan` (the node types you will use), `graph.evaluate` (a candidate, judged), `task.done` (hand over the candidate that holds), `task.fail` (give up, with the reason).

## How you work

- One tool call per step. Every step reads the harness's brief (`brief`, first in the observation): where the work stands and what the last candidate showed.
- Start from the library's reference graph of the station when there is one (`graph.evaluate` with `graph`): instantiate it and adapt its numbers, do not rebuild it. Its known constants are held at their defaults; fit only what the installation alone knows, within the bounds the graph gives; place a band's variable within its band.
- Otherwise write the physics once, as formulas over variables. What the documentation gives (a device's datasheet, the station's topology and metrics, in the library) is known: put it in `variables`. Only what nobody knows is estimated: give its bounds in `fit`, wide enough to contain the answer.
- When a candidate misses the threshold, look at where its curve parts from the measurement. A gap that a wider range of the same variables cannot close means the structure is missing something: change the topology, guided by the task's hypotheses, rather than forcing the parameters.
- Hand over only a candidate the harness found under the threshold.

Answer with a tool call, not with text.

```

<details><summary><strong>Tools offered to the model (name: description)</strong> (3,877 characters, folded)</summary>

```text
twin__registry_list_nodes: List every node type the activated plugins registered, with ports, declared interop standards, signature and resolved documentation. This is the catalogue to consult before wiring anything.

twin__registry_search: Search the catalogue by what a plan must produce: node types whose signature outputs the required quantities (and units), carries the capabilities, or whose purpose mentions the words; best first, with the signature of each. The question a planner asks before choosing nodes.

twin__registry_describe_node: Describe one node type: its ports with their declared units and stream/signal kind, its signature, and its documentation. Use before adding a node to check what it expects.

twin__document_validate: Check a document spec against the catalogue without building it: unknown type ids, unknown ports, two wires into one input, two connected ports whose declared units disagree. Empty problems means document_build will accept it.

workspace__list: The files of a task's directory (or one of its folders): path, bytes, sha256, last modification. Empty for a task with no file yet.

workspace__read: The content of one file of the task, as text (or base64 for a binary), with its size and sha256. 256 KB at most per read; a bigger file is refused with its size.

library__list: Every document of the library: id, title, a summary, the quantities a method card measures, sha256 and size.

library__methods: The method cards of the library that measure the given quantity (Volume, AirChange, VolumetricFlow...): id, title, summary, what each measures. A card holds the method's principle and its rules of application; read it with read.

library__search: The documents the query's words appear in, the most matched first, with the lines they appear on. Read a document whole with read.

library__graphs: The reference graphs a harness may instantiate on the twin, each with its words: what it is and how to use it, its variables (default, bounds, status: known and held, fitted, or a band) and its settings (who is on board), its probes and the telemetry columns they are judged against, the document and the template with their sha256. Instantiate one with graph.evaluate {graph: id, variables, fit, settings}.

library__graph: One reference graph whole: its words, its variables, settings and probes, and its template (the parametric spec the harness resolves: node parameters as formulas over the variables, the measured inputs as telemetry columns, the persons of the roster by module).

library__read: One document whole, as markdown, with its sha256.

task__plan: Submit the plan before building anything: the node types selected from the catalogue, and the required outputs no node produces (each with a reason and the topic that can make it). A plan the guard refuses comes back with its problems.

task__done: Say the contract is held: a summary with the numbers, and the artifacts (a model, a graph, a twin) by their paths in the workshop. The validator of the topic judges it; when it is not held, the problems come back and the work goes on.

task__fail: Give up, with the reason the tools gave: the task ends as failed at once, nothing is proposed. Use it when a step cannot succeed with what the task holds, instead of trying the same call again.

graph__evaluate: Build a candidate twin from a parametric graph, or instantiate a graph of the library on the twin (graph: its id), estimate its unknown variables within their bounds (fit, with the estimator chosen), run every trial in the twin's sandbox over the telemetry, and measure the residual against the columns named. The best is kept as candidate-<n>.spikypanda in the workshop. Answers whether the task's residual threshold is held, the residual per column and where the gap is worst, the prediction against the measurement every five minutes, and the best trials.
```

</details>

## Step 1: task.plan (refused) -> failed

- node: ?; last capability before: none; 3285 ms
- failed: plan refused: selected node "Physics.Crew:person" is not in the catalogue; selected node "Physics.Device:scrubber" is not in the catalogue; selected node "Measure.Sensor:co2" is not in the catalogue

**Proposed by the model: task.plan**

```json
{
  "selected_nodes": [
    "Physics.Scene:atmosphere",
    "Physics.Crew:person",
    "Physics.Device:scrubber",
    "Logic.Time:timeline",
    "Measure.Sensor:co2"
  ],
  "missing_capabilities": []
}
```

### Model call: claude-haiku-4-5-20251001, 2,014 in / 247 out, 3263 ms

<details><summary><strong>Prompt: added to the conversation since the previous call (1 message(s); the conversation holds 1)</strong> (6,403 characters, folded)</summary>

```text
[user]
Situation "build" (story minute ?): Build the twin graph that produces CO2 concentration in Lab (Concentration, ppm) and reproduces the task's telemetry within its residual threshold, from the node catalogue; evaluate each candidate (graph.evaluate) and revise it by its gap until it holds.

Observation at this step (state workshop:plan:start:). The harness's brief: Plan. The state holds the task's invariants (objective, outputs, threshold, the known constants with their status), the telemetry's shape and the library's shelf (the reference graph "habitat" with its variables and their status): nothing needs reading first. Submit task.plan with the node types you will use: the reference graph's (its types are in the state's shelf, or in library.graphs), or a structure of your own from the catalogue (twin.registry_search); declare missing only what no node can express. The twin must produce CO2 concentration in Lab (Concentration, ppm) within a residual of 10 ppm. Known, from the documentation, held in variables under these names and never fitted: Qe_full = 1 m3/min (Effective scrubber flow at full speed, scrubber-1-datasheet); tau_scrubber = 3.33 min (Scrubber response time constant, scrubber-1-datasheet); eta = 0.3 Dimensionless (Single-pass removal efficiency, scrubber-1-datasheet); Q_full = 3.3 m3/min (Air flow at full speed, scrubber-1-datasheet); C_CRITICAL = 4000 ppm (Critical CO2 threshold, this-installation); C_ELEVATED = 3500 ppm (Elevated CO2 threshold, this-installation); speed_min = 40 percent (Minimum scrubber speed when ELEVATED, scrubber-1-datasheet). Watch their units against the nodes' (a flow in m3/min enters a node as flow / V).
Reasoning state (the harness's, rebuilt every step; the conversation is not replayed):
{"phase":"plan","iteration":0,"budget":{"iterationsLeft":30,"runsLeft":600},"invariants":{"objective":{"outputs":["CO2 concentration in Lab (Concentration, ppm)"],"threshold":10,"constraints":{"validation":{"criteria":["The twin's predicted CO2 concentration in the Lab must match the measured co2_lab_ppm within ±50 ppm over the 60-minute test period","The twin must correctly predict the direction and magnitude of CO2 changes following each speed change","The time constant of the exponential response to the speed change at minute 20 (from 40% to 100%) must be consistent with the measured decay curve","The equilibrium CO2 level reached during the 40% speed phase must be consistent with the crew production rate and scrubber effective flow"],"compare":[{"output":"CO2 concentration in Lab","against":"co2_lab_ppm"}]},"residualPpmMax":10}},"known":[{"symbol":"Qe_full","value":1,"unit":"m3/min","status":"documented","source":"scrubber-1-datasheet"},{"symbol":"tau_scrubber","value":3.33,"unit":"min","status":"documented","source":"scrubber-1-datasheet"},{"symbol":"eta","value":0.3,"unit":"Dimensionless","status":"documented","source":"scrubber-1-datasheet"},{"symbol":"Q_full","value":3.3,"unit":"m3/min","status":"documented","source":"scrubber-1-datasheet"},{"symbol":"C_CRITICAL","value":4000,"unit":"ppm","status":"documented","source":"this-installation"},{"symbol":"C_ELEVATED","value":3500,"unit":"ppm","status":"documented","source":"this-installation"},{"symbol":"speed_min","value":40,"unit":"percent","status":"documented","source":"scrubber-1-datasheet"}],"missingInformation":["The actual crew CO2 production rate during the test is not provided; only the range from NASA analysis is available (0.26 to 0.45 L/min per awake operator)","The exact activity level of the two operators during the test (nominal awake, exercise, etc.) is not specified","The actual volume of the Lab module is not given; only the apparent volume from decay measurement (12.6 m³) is available","The air exchange flow rate q between Lab and Hab-B with the hatch closed is not specified; it is assumed negligible but could be measured from the Hab-B CO2 response","The initial CO2 concentration at the start of the test is not explicitly stated","Temperature and pressure conditions are assumed to be 101.3 kPa and 22°C but are not confirmed"],"hypotheses":[],"observed":{"persons":["CDR in hab-b at rest","FE-3 in hab-b at rest","FE-1 in lab at light_work","FE-2 in lab at light_work"],"devices":["/habitat/hab-b/eclss/co2-2 (Co2Sensor)","/habitat/lab/eclss/co2-1 (Co2Sensor)","/habitat/lab/eclss/scrubber-1 (Scrubber)","/habitat/lab/hatch-1 (Hatch)","/habitat/power/battery-1 (Battery)"],"other":{"entities":["Lab module","Scrubber","Crew in Lab","Hab-B module"],"observables":["CO2 concentration in Lab","CO2 concentration in Hab-B","Scrubber speed command"],"controls":["Scrubber speed"]}},"telemetry":{"file":"telemetry.json","rows":61,"columns":["minute","co2_lab_ppm","co2_habb_ppm","speed_percent"],"minutes":60},"shelf":[{"id":"habitat","description":"The physical reference of the two-module lunar habitat: the Lab and Hab-B as two volumes of air in mass (the substrate's atmosphere, ideal gas), four persons by name at their own activity wired into the crew of their module, the centralised CO2 scrubber in the Lab in its datasheet's units (a flow, an efficiency, a lag) drawing the Lab's air at the measured command, the inter-module ventilation as ","variables":{"V":"fitted, default 30, 10 to 200 m3","Vh":"fitted, default 400, 50 to 1000 m3","L":"fitted, default 0.127, 0 to 0.2 kg","g":"band, default 0.38, 0.26 to 0.45 L/min","gRest":"known, default 0.3 L/min","Qe":"device, default 1 m3/min","eta":"device, default 0.30303","lag":"device, default 3.33 min"},"settings":["labOccupants: default 2 (lab)","habOccupants: default 2 (habB)"],"probes":["co2-1.lastMeasured against co2_lab_ppm","co2-2.lastMeasured against co2_habb_ppm"]}]},"evidence":{},"hypothesis":null,"lastAction":null,"lastRefusal":null,"evaluation":null,"requirements":{"telemetryAvailable":true,"knownConstantsResolved":true,"referenceGraphsKnown":true,"planAccepted":false,"candidateEvaluated":false,"candidateHeld":false},"openQuestions":[],"nextActions":["twin.registry_list_nodes","twin.registry_search","twin.registry_describe_node","twin.document_validate","workspace.list","workspace.read","library.list","library.methods","library.search","library.graphs","library.graph","library.read","task.plan","task.done","task.fail","graph.evaluate"]}
Choose exactly one tool call now. To speak to the crew, call crew__report; to hand back, call crew__ask.
```

</details>

**Response, raw**

```text
I'll start by submitting the plan with the node types from the reference graph "habitat" that's already in the library's shelf.

Based on the reasoning state, I can see:
1. The reference graph "habitat" is available in the library with specific node types
2. The known constants are documented and should be held in variables
3. The task requires CO2 concentration in Lab (ppm) within ±10 ppm residual
4. The graph needs to model the Lab and Hab-B modules with the scrubber system

The reference graph "habitat" already has the structure needed. I'll submit the plan using its node types.

[tool_use task__plan]
{
  "selected_nodes": [
    "Physics.Scene:atmosphere",
    "Physics.Crew:person",
    "Physics.Device:scrubber",
    "Logic.Time:timeline",
    "Measure.Sensor:co2"
  ],
  "missing_capabilities": []
}

[stop_reason tool_use]
```

## Step 2: twin.registry_list_nodes (fallback) -> completed

- node: phase plan; last capability before: ; 1388 ms
- rationale: I need to understand the available node types in the catalogue before submitting a plan. Let me list all available nodes first.
- evaluation: success, reward 0.5: twin.registry_list_nodes completed; nothing new in the workshop

**Input of twin.registry_list_nodes**

```json
{}
```

<details><summary><strong>Output of twin.registry_list_nodes (ok)</strong> (216,895 characters, folded)</summary>

```json
{
  "count": 166,
  "types": [
    {
      "type": "Physics.Transform:transform",
      "label": "Transform",
      "category": "Physics.Transform",
      "inputPorts": [
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/transform/transform.md",
      "docLocales": []
    },
    {
      "type": "Physics.Scene:scene",
      "label": "Scene",
      "category": "Physics.Scene",
      "inputPorts": [
        {
          "slot": "atmosphere_in",
          "optional": true,
          "type": "atmosphere",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "solver_in_0",
          "optional": true,
          "type": "solver",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "shared_in_0",
          "optional": true,
          "type": "shared",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "gravity_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "temperature_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "pressure_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "density_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "time_scale_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_position_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_rotation_in",
          "optional": true,
          "type": "vec4",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_scale_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "scene_out",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/scene/scene.md",
      "docLocales": []
    },
    {
      "type": "Physics.Scene:earth",
      "label": "Earth",
      "category": "Physics.Scene",
      "inputPorts": [
        {
          "slot": "atmosphere_in",
          "optional": true,
          "type": "atmosphere",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "solver_in_0",
          "optional": true,
          "type": "solver",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "shared_in_0",
          "optional": true,
          "type": "shared",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "gravity_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "temperature_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "pressure_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "density_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "time_scale_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_position_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_rotation_in",
          "optional": true,
          "type": "vec4",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_scale_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "scene_out",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/scene/scene.md",
      "docLocales": []
    },
    {
      "type": "Physics.Scene:moon",
      "label": "Moon",
      "category": "Physics.Scene",
      "inputPorts": [
        {
          "slot": "atmosphere_in",
          "optional": true,
          "type": "atmosphere",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "solver_in_0",
          "optional": true,
          "type": "solver",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "shared_in_0",
          "optional": true,
          "type": "shared",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "gravity_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "temperature_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "pressure_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "density_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "time_scale_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_position_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_rotation_in",
          "optional": true,
          "type": "vec4",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_scale_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "scene_out",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/scene/scene.md",
      "docLocales": []
    },
    {
      "type": "Physics.Scene:mars",
      "label": "Mars",
      "category": "Physics.Scene",
      "inputPorts": [
        {
          "slot": "atmosphere_in",
          "optional": true,
          "type": "atmosphere",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "solver_in_0",
          "optional": true,
          "type": "solver",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "shared_in_0",
          "optional": true,
          "type": "shared",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "gravity_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "temperature_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "pressure_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "density_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "time_scale_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_position_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_rotation_in",
          "optional": true,
          "type": "vec4",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_scale_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "scene_out",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/scene/scene.md",
      "docLocales": []
    },
    {
      "type": "Physics.Scene:orbital",
      "label": "Orbital",
      "category": "Physics.Scene",
      "inputPorts": [
        {
          "slot": "atmosphere_in",
          "optional": true,
          "type": "atmosphere",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "solver_in_0",
          "optional": true,
          "type": "solver",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "shared_in_0",
          "optional": true,
          "type": "shared",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "gravity_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "temperature_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "pressure_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "density_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "time_scale_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_position_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_rotation_in",
          "optional": true,
          "type": "vec4",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_scale_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "scene_out",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/scene/scene.md",
      "docLocales": []
    },
    {
      "type": "Physics.Scene:iss-cabin",
      "label": "ISS Cabin",
      "category": "Physics.Scene",
      "inputPorts": [
        {
          "slot": "atmosphere_in",
          "optional": true,
          "type": "atmosphere",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "solver_in_0",
          "optional": true,
          "type": "solver",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "shared_in_0",
          "optional": true,
          "type": "shared",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "gravity_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "temperature_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "pressure_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "density_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "time_scale_in",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_position_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_rotation_in",
          "optional": true,
          "type": "vec4",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local_scale_in",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "scene_out",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/scene/scene.md",
      "docLocales": []
    },
    {
      "type": "Physics.Scene:atmosphere-layer",
      "label": "Atmosphere Layer",
      "category": "Physics.Scene",
      "inputPorts": [
        {
          "slot": "composition_in",
          "optional": true,
          "type": "composition",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "delta_N2_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "delta_O2_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "delta_CO2_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "delta_H2O_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "delta_Ar_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "pressure",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "temperature",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "density",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "layer_out",
          "optional": true,
          "type": "layer",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "mass_N2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mole_fraction_N2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "partial_pressure_N2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "ppm_N2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mass_O2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mole_fraction_O2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "partial_pressure_O2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "ppm_O2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mass_CO2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mole_fraction_CO2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "partial_pressure_CO2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "ppm_CO2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mass_H2O",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mole_fraction_H2O",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "partial_pressure_H2O",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "ppm_H2O",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mass_Ar",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mole_fraction_Ar",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "partial_pressure_Ar",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "ppm_Ar",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/scene/atmosphere-layer.md",
      "docLocales": []
    },
    {
      "type": "Physics.Scene:atmosphere",
      "label": "Atmosphere",
      "category": "Physics.Scene",
      "inputPorts": [
        {
          "slot": "layer_in_0",
          "optional": true,
          "type": "layer",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "delta_N2_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "delta_O2_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "delta_CO2_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "delta_H2O_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "delta_Ar_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "pressure",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "temperature",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "density",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "atmosphere_out",
          "optional": true,
          "type": "atmosphere",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "mass_N2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mole_fraction_N2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "partial_pressure_N2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "ppm_N2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mass_O2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mole_fraction_O2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "partial_pressure_O2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "ppm_O2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mass_CO2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mole_fraction_CO2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "partial_pressure_CO2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "ppm_CO2",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mass_H2O",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mole_fraction_H2O",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "partial_pressure_H2O",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "ppm_H2O",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mass_Ar",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "mole_fraction_Ar",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "partial_pressure_Ar",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "ppm_Ar",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": {
        "purpose": "hold one well-mixed volume of gas (one or more layers): its pressure, temperature, density and composition, which gates and scrubbers act on; per species, the sources and sinks summed into its mass, and the mass, mole fraction, partial pressure and ppm it publishes",
        "inputs": {
          "delta_N2_0": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "a source (positive) or a sink (negative) of N2; the pool grows by index"
          },
          "delta_O2_0": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "a source (positive) or a sink (negative) of O2; the pool grows by index"
          },
          "delta_CO2_0": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "a source (positive) or a sink (negative) of CO2; the pool grows by index"
          },
          "delta_H2O_0": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "a source (positive) or a sink (negative) of H2O; the pool grows by index"
          },
          "delta_Ar_0": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "a source (positive) or a sink (negative) of Ar; the pool grows by index"
          }
        },
        "outputs": {
          "pressure": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "volume-weighted total pressure"
          },
          "temperature": {
            "quantity": "Temperature",
            "unit": "k",
            "description": "volume-weighted temperature"
          },
          "density": {
            "quantity": "Density",
            "unit": "kgpm3",
            "description": "total mass over total volume"
          },
          "mass_N2": {
            "quantity": "Mass",
            "unit": "kg",
            "description": "the N2 in the volume"
          },
          "ppm_N2": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the N2 mole fraction, in parts per million"
          },
          "partial_pressure_N2": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the N2 partial pressure"
          },
          "mass_O2": {
            "quantity": "Mass",
            "unit": "kg",
            "description": "the O2 in the volume"
          },
          "ppm_O2": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the O2 mole fraction, in parts per million"
          },
          "partial_pressure_O2": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the O2 partial pressure"
          },
          "mass_CO2": {
            "quantity": "Mass",
            "unit": "kg",
            "description": "the CO2 in the volume"
          },
          "ppm_CO2": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the CO2 mole fraction, in parts per million"
          },
          "partial_pressure_CO2": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the CO2 partial pressure"
          },
          "mass_H2O": {
            "quantity": "Mass",
            "unit": "kg",
            "description": "the H2O in the volume"
          },
          "ppm_H2O": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the H2O mole fraction, in parts per million"
          },
          "partial_pressure_H2O": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the H2O partial pressure"
          },
          "mass_Ar": {
            "quantity": "Mass",
            "unit": "kg",
            "description": "the Ar in the volume"
          },
          "ppm_Ar": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the Ar mole fraction, in parts per million"
          },
          "partial_pressure_Ar": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the Ar partial pressure"
          }
        },
        "capabilities": [
          "atmosphere",
          "volume",
          "air_quality",
          "mass_balance",
          "prediction",
          "co2"
        ]
      },
      "doc": "docs/physics/scene/atmosphere.md",
      "docLocales": []
    },
    {
      "type": "Physics.Scene:atmosphere-gate",
      "label": "Atmosphere Gate",
      "category": "Physics.Scene",
      "inputPorts": [
        {
          "slot": "atmosphere_A_in",
          "optional": true,
          "type": "atmosphere",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "atmosphere_B_in",
          "optional": true,
          "type": "atmosphere",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "flow",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "flow_rate",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": {
        "purpose": "couple two atmospheres through an opening (closed, open passive, forced ventilation one way, or an exchange both ways at a flow a fan may drive): a per-species mass flow between them, mass conserved",
        "inputs": {
          "flow": {
            "quantity": "VolumetricFlow",
            "unit": "m3ps",
            "description": "the flow of the forced or exchange modes when wired (a fan's delivered flow); the forcedFlow editable otherwise"
          }
        },
        "outputs": {
          "flow_rate": {
            "quantity": "VolumetricFlow",
            "unit": "m3ps",
            "description": "the volumetric flow through the gate, positive from A to B"
          }
        },
        "capabilities": [
          "exchange",
          "door",
          "ventilation",
          "atmosphere",
          "mass_balance"
        ]
      },
      "doc": "docs/physics/scene/atmosphere-gate.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.DC:dynamic",
      "label": "DC Motor (Dynamic)",
      "category": "Physics.Electric.Motor.DC",
      "inputPorts": [
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "scene",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "fault_0",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "armatureVoltage",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "loadTorque",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "armatureCurrent",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "angularVelocity",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "electromagneticTorque",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "forceY",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "forceZ",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-dc/dynamic.en-US.md",
      "docLocales": [
        "en-US",
        "fr-FR"
      ]
    },
    {
      "type": "Physics.Electric.Motor.DC:steady",
      "label": "DC Motor (Steady)",
      "category": "Physics.Electric.Motor.DC",
      "inputPorts": [
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "scene",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "fault_0",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "armatureVoltage",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "loadTorque",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "armatureCurrent",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "angularVelocity",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "developedTorque",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "backEmf",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-dc/steady.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.DC:speedPI",
      "label": "DC Motor Speed PI",
      "category": "Physics.Electric.Motor.DC",
      "inputPorts": [
        {
          "slot": "angularVelocityReference",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "measuredAngularVelocity",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "voltageCommand",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-dc/speed-pi.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.DC:tachymeter",
      "label": "Tachymeter",
      "category": "Physics.Electric.Motor.DC",
      "inputPorts": [
        {
          "slot": "angularVelocity",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "measuredAngularVelocity",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-dc/tachymeter.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.DC:inverter",
      "label": "DC PWM Inverter",
      "category": "Physics.Electric.Motor.DC",
      "inputPorts": [
        {
          "slot": "voltageCommand",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "armatureVoltage",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dutyCycle",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "switching",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-dc/inverter.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.DC:currentPI",
      "label": "DC Motor Current PI",
      "category": "Physics.Electric.Motor.DC",
      "inputPorts": [
        {
          "slot": "currentReference",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "measuredCurrent",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "voltageCommand",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-dc/current-pi.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.DC:currentSensor",
      "label": "Current Sensor (LEM)",
      "category": "Physics.Electric.Motor.DC",
      "inputPorts": [
        {
          "slot": "armatureCurrent",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "measuredCurrent",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-dc/current-sensor.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.BLDC:dynamic",
      "label": "BLDC Motor (Dynamic)",
      "category": "Physics.Electric.Motor.BLDC",
      "inputPorts": [
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "scene",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "fault_0",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageA",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageB",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageC",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "loadTorque",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentA",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentB",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentC",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "angularVelocity",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "rotorAngle",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "electromagneticTorque",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-bldc/bldc-dynamic.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.BLDC:inverter",
      "label": "BLDC 6-step Inverter",
      "category": "Physics.Electric.Motor.BLDC",
      "inputPorts": [
        {
          "slot": "dcBusVoltage",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dutyCycle",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "electricalAngle",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "phaseVoltageA",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageB",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageC",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "sector",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-bldc/inverter.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.BLDC:speedPI",
      "label": "BLDC Speed PI",
      "category": "Physics.Electric.Motor.BLDC",
      "inputPorts": [
        {
          "slot": "angularVelocityReference",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "measuredAngularVelocity",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "dutyCycle",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-bldc/speed-pi.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.Induction:dynamic",
      "label": "Induction Motor (Squirrel Cage)",
      "category": "Physics.Electric.Motor.Induction",
      "inputPorts": [
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "scene",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "fault_0",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageA",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageB",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageC",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "loadTorque",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentA",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentB",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentC",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "angularVelocity",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "rotorAngle",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "electromagneticTorque",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "slip",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-induction/dynamic.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.PMSM:foc",
      "label": "PMSM FOC Controller",
      "category": "Physics.Electric.Motor.PMSM",
      "inputPorts": [
        {
          "slot": "directAxisCurrent",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "quadratureAxisCurrent",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "angularVelocity",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "rotorAngle",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "speedTarget",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "quadratureCurrentReference",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dcBusVoltage",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "voltageAlpha",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "voltageBeta",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageA",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageB",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageC",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-pmsm/foc.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.PMSM:machine",
      "label": "PMSM Machine (dq)",
      "category": "Physics.Electric.Motor.PMSM",
      "inputPorts": [
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "scene",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "fault_0",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageA",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageB",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageC",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "loadTorque",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "directAxisCurrent",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "quadratureAxisCurrent",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentA",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentB",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentC",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "angularVelocity",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "rotorAngle",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "electromagneticTorque",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "forceY",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "forceZ",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-pmsm/machine-dq.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.PMSM:dynamic",
      "label": "PMSM Motor (abc, sinusoidal)",
      "category": "Physics.Electric.Motor.PMSM",
      "inputPorts": [
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "scene",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "fault_0",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageA",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageB",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageC",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "loadTorque",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentA",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentB",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentC",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "angularVelocity",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "rotorAngle",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "electromagneticTorque",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-bldc/pmsm-dynamic.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.PMSM:svpwm",
      "label": "SVPWM Modulator",
      "category": "Physics.Electric.Motor.PMSM",
      "inputPorts": [
        {
          "slot": "voltageAlpha",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "voltageBeta",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dcBusVoltage",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "dutyCycleA",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dutyCycleB",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dutyCycleC",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-pmsm/svpwm.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.PMSM:inverter",
      "label": "3-Phase Inverter (averaged)",
      "category": "Physics.Electric.Motor.PMSM",
      "inputPorts": [
        {
          "slot": "dutyCycleA",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dutyCycleB",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dutyCycleC",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dcBusVoltage",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "phaseVoltageA",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageB",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageC",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-pmsm/inverter.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.PMSM:clarke",
      "label": "Clarke (abc to alpha-beta)",
      "category": "Physics.Electric.Motor.PMSM",
      "inputPorts": [
        {
          "slot": "phaseA",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseB",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseC",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "alpha",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "beta",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-pmsm/clarke-park.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.PMSM:park",
      "label": "Park (alpha-beta to dq)",
      "category": "Physics.Electric.Motor.PMSM",
      "inputPorts": [
        {
          "slot": "alpha",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "beta",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "rotorAngle",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "directAxis",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "quadratureAxis",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-pmsm/clarke-park.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Motor.PMSM:gravity-coupled",
      "label": "PMSM (gravity-coupled)",
      "category": "Physics.Electric.Motor.PMSM",
      "inputPorts": [
        {
          "slot": "scene_in",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "speedTarget",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "quadratureAxisCurrent",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "angularVelocity",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "forceY",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "forceZ",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "accelerationY",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "accelerationZ",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/motor-pmsm/gravity-coupled.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Sensor:current",
      "label": "Current Sensor",
      "category": "Physics.Electric.Sensor",
      "inputPorts": [
        {
          "slot": "armatureCurrent",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "measuredCurrent",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/sensor/current-sensor.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric.Sensor:power",
      "label": "Power / Energy Meter",
      "category": "Physics.Electric.Sensor",
      "inputPorts": [
        {
          "slot": "phaseVoltageA",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageB",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseVoltageC",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentA",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentB",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phaseCurrentC",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "directAxisVoltage",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "quadratureAxisVoltage",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "directAxisCurrent",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "quadratureAxisCurrent",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "activePower",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "reactivePower",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "apparentPower",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "powerFactor",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "activeEnergy",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "reactiveEnergy",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "activePowerDq",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "reactivePowerDq",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/sensor/power-meter.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Bearing:fault",
      "label": "Bearing Fault Generator",
      "category": "Physics.Mechanical.Bearing",
      "inputPorts": [
        {
          "slot": "inputSignal",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "angularVelocity",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "outputSignal",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "outerRaceDefectFrequencyHz",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "innerRaceDefectFrequencyHz",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "ballSpinFrequencyHz",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "cageFrequencyHz",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/bearing/fault.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Shaft:unbalance",
      "label": "Shaft Unbalance (1× rotation)",
      "category": "Physics.Mechanical.Shaft",
      "inputPorts": [
        {
          "slot": "inputSignal",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "angularVelocity",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "outputSignal",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "shaftAngle",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/shaft/unbalance.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Gear:mesh",
      "label": "Gear Mesh + Tooth Fault",
      "category": "Physics.Mechanical.Gear",
      "inputPorts": [
        {
          "slot": "inputSignal",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "angularVelocity",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "outputSignal",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "meshFrequencyHz",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/gear/mesh.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Friction:coulomb",
      "label": "Coulomb + Stribeck Friction",
      "category": "Physics.Mechanical.Friction",
      "inputPorts": [
        {
          "slot": "angularVelocity",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "coulombTorque",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "stribeckTorque",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "frictionTorque",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/friction/coulomb.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Load:torque",
      "label": "Load Torque",
      "category": "Physics.Mechanical.Load",
      "inputPorts": [
        {
          "slot": "angularVelocity",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "loadTorque",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/load/torque.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Load:gravity-payload",
      "label": "Gravity Payload Load",
      "category": "Physics.Mechanical.Load",
      "inputPorts": [
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "scene",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "rotorAngle",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "loadTorque",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "axialForce",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "radialForce",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/load/gravity-payload.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Load:turbine",
      "label": "Turbine Payload",
      "category": "Physics.Mechanical.Load",
      "inputPorts": [
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "scene",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "fault_0",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "fault_1",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "angularVelocity",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "applyTo",
          "optional": false,
          "type": "fault",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "loadTorque",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/load/turbine.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Vibration:accelerometer",
      "label": "Accelerometer",
      "category": "Physics.Mechanical.Vibration",
      "inputPorts": [
        {
          "slot": "vibration",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "measuredVibration",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/vibration/accelerometer.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Vibration:imu",
      "label": "IMU (3-axis)",
      "category": "Physics.Mechanical.Vibration",
      "inputPorts": [
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "acceleration",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "measuredAcceleration",
          "optional": false,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/vibration/imu.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Fault:modulator",
      "label": "Fault Modulator",
      "category": "Physics.Mechanical.Fault",
      "inputPorts": [
        {
          "slot": "inputSignal",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "freq",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "amplitude",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "outputSignal",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/fault/modulator.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Fault:eccentricity",
      "label": "Eccentricity Fault (D4)",
      "category": "Physics.Mechanical.Fault",
      "inputPorts": [
        {
          "slot": "rotorAngle",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "flux",
          "optional": false,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/fault/eccentricity.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Fault:imbalance",
      "label": "Imbalance Fault (D1)",
      "category": "Physics.Mechanical.Fault",
      "inputPorts": [
        {
          "slot": "angularVelocity",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "rotorAngle",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "forceY",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "forceZ",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/fault/imbalance.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Fault:rotor-sag",
      "label": "Rotor Sag (gravity cause)",
      "category": "Physics.Mechanical.Fault",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "applyTo",
          "optional": false,
          "type": "fault",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/fault/rotor-sag.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Fault:rotor-eccentricity",
      "label": "Rotor Eccentricity (static cause)",
      "category": "Physics.Mechanical.Fault",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "applyTo",
          "optional": false,
          "type": "fault",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/fault/rotor-eccentricity.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Fault:rotor-imbalance",
      "label": "Rotor Imbalance (mechanical cause)",
      "category": "Physics.Mechanical.Fault",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "applyTo",
          "optional": false,
          "type": "fault",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/fault/rotor-imbalance.md",
      "docLocales": []
    },
    {
      "type": "Physics.Mechanical.Housing:mechanics",
      "label": "Housing Mechanics",
      "category": "Physics.Mechanical.Housing",
      "inputPorts": [
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "parentWorld",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "forceX",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "forceY",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "forceZ",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "dt",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "accelerationX",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "accelerationY",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "accelerationZ",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "acceleration",
          "optional": false,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/housing/mechanics.md",
      "docLocales": []
    },
    {
      "type": "Physics.Particulate:particulate",
      "label": "Particulate",
      "category": "Physics.Particulate",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "particulate_out",
          "optional": true,
          "type": "particulate",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/particulate/particulate.md",
      "docLocales": []
    },
    {
      "type": "Physics.Particulate:pm2_5",
      "label": "PM2.5",
      "category": "Physics.Particulate",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "particulate_out",
          "optional": true,
          "type": "particulate",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/particulate/particulate.md",
      "docLocales": []
    },
    {
      "type": "Physics.Particulate:pm10",
      "label": "PM10",
      "category": "Physics.Particulate",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "particulate_out",
          "optional": true,
          "type": "particulate",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/particulate/particulate.md",
      "docLocales": []
    },
    {
      "type": "Physics.Particulate:lunar_dust",
      "label": "Lunar dust",
      "category": "Physics.Particulate",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "particulate_out",
          "optional": true,
          "type": "particulate",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/physics/particulate/particulate.md",
      "docLocales": []
    },
    {
      "type": "Physics.Electric:battery",
      "label": "Battery",
      "category": "Physics.Electric.Battery",
      "inputPorts": [
        {
          "slot": "powerA",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "powerB",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "powerC",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "powerD",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "stateOfChargePercent",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "energyUsedWh",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "remainingWh",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": {
        "purpose": "an energy store drained by up to four power loads: state of charge, energy used, energy remaining",
        "inputs": {
          "powerA": {
            "quantity": "Power",
            "unit": "watt",
            "description": "a load"
          },
          "powerB": {
            "quantity": "Power",
            "unit": "watt"
          },
          "powerC": {
            "quantity": "Power",
            "unit": "watt"
          },
          "powerD": {
            "quantity": "Power",
            "unit": "watt"
          }
        },
        "outputs": {
          "stateOfChargePercent": {
            "quantity": "Dimensionless",
            "unit": "percent",
            "description": "state of charge"
          },
          "energyUsedWh": {
            "quantity": "Energy",
            "unit": "Wh"
          },
          "remainingWh": {
            "quantity": "Energy",
            "unit": "Wh"
          }
        },
        "capabilities": [
          "energy",
          "battery",
          "budget",
          "integration"
        ]
      },
      "doc": "docs/physics/battery/battery.md",
      "docLocales": []
    },
    {
      "type": "Physics.LifeSupport:crew",
      "label": "Crew",
      "category": "Physics.LifeSupport",
      "inputPorts": [
        {
          "slot": "count",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "activity",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "co2Emission",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": {
        "purpose": "the CO2 source of a cabin: a group of people at one activity level, emitting in ppm per minute of that cabin",
        "inputs": {
          "count": {
            "quantity": "Count",
            "unit": "person",
            "description": "head count of the group"
          },
          "activity": {
            "quantity": "Category",
            "description": "sleep, rest, light_work or heavy_work"
          }
        },
        "outputs": {
          "co2Emission": {
            "quantity": "ConcentrationRate",
            "unit": "ppm/min",
            "description": "count times the per-person rate of the activity"
          }
        },
        "capabilities": [
          "source",
          "co2",
          "crew",
          "air_quality"
        ]
      },
      "doc": "docs/physics/lifesupport/crew.md",
      "docLocales": []
    },
    {
      "type": "Physics.LifeSupport:scrubber",
      "label": "CO2 Scrubber",
      "category": "Physics.LifeSupport",
      "inputPorts": [
        {
          "slot": "command",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "power",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "effectiveRate",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "effectiveFraction",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": {
        "purpose": "a CO2 scrubber at a command fraction: its removal rate (a fraction of the excess per minute, lagged) and its electrical power, from a nominal efficiency preset",
        "inputs": {
          "command": {
            "quantity": "Dimensionless",
            "unit": "ratio",
            "description": "0 to 1, the commanded fraction of full speed"
          }
        },
        "outputs": {
          "power": {
            "quantity": "Power",
            "unit": "watt",
            "description": "electrical power drawn"
          },
          "effectiveRate": {
            "quantity": "Frequency",
            "unit": "1/min",
            "description": "fraction of the CO2 excess removed per minute, after the lag"
          },
          "effectiveFraction": {
            "quantity": "Dimensionless",
            "unit": "ratio",
            "description": "the lagged command actually applied"
          }
        },
        "capabilities": [
          "sink",
          "co2",
          "scrubber",
          "air_quality",
          "power_load"
        ]
      },
      "doc": "docs/physics/lifesupport/scrubber.md",
      "docLocales": []
    },
    {
      "type": "Physics.LifeSupport:cabin-air",
      "label": "Cabin Air (CO2)",
      "category": "Physics.LifeSupport",
      "inputPorts": [
        {
          "slot": "scrubberRate",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "emissionA",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "emissionB",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "emissionC",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "emissionD",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "co2Ppm",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "state",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "removal",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": {
        "purpose": "the CO2 balance of one sealed, well-mixed cabin: sources in, scrubbing out, the concentration in ppm and the life-support state it implies",
        "inputs": {
          "scrubberRate": {
            "quantity": "Frequency",
            "unit": "1/min",
            "description": "the scrubber's effective removal rate"
          },
          "emissionA": {
            "quantity": "ConcentrationRate",
            "unit": "ppm/min",
            "description": "a crew group's emission"
          },
          "emissionB": {
            "quantity": "ConcentrationRate",
            "unit": "ppm/min"
          },
          "emissionC": {
            "quantity": "ConcentrationRate",
            "unit": "ppm/min"
          },
          "emissionD": {
            "quantity": "ConcentrationRate",
            "unit": "ppm/min"
          }
        },
        "outputs": {
          "co2Ppm": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the cabin's CO2 concentration"
          },
          "state": {
            "quantity": "Category",
            "description": "NOMINAL, ELEVATED or CRITICAL against the thresholds"
          },
          "removal": {
            "quantity": "ConcentrationRate",
            "unit": "ppm/min",
            "description": "what the scrubber removes at the latest state"
          }
        },
        "capabilities": [
          "prediction",
          "co2",
          "air_quality",
          "cabin",
          "mass_balance"
        ]
      },
      "doc": "docs/physics/lifesupport/cabin-air.md",
      "docLocales": []
    },
    {
      "type": "DSP.Generator:oscillator",
      "label": "Oscillator",
      "category": "DSP.Generator",
      "inputPorts": [
        {
          "slot": "t",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "frequency",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "amplitude",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "phase",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "value",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/dsp/generator/oscillator.md",
      "docLocales": []
    },
    {
      "type": "DSP.Transform:fft",
      "label": "FFT",
      "category": "DSP.Transform",
      "inputPorts": [
        {
          "slot": "signal",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "spectrum",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        },
        {
          "id": "ue5",
          "version": "5.4"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/transform/fft.md",
      "docLocales": []
    },
    {
      "type": "DSP.Transform:ifft",
      "label": "IFFT",
      "category": "DSP.Transform",
      "inputPorts": [
        {
          "slot": "spectrum",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "signal",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        },
        {
          "id": "ue5",
          "version": "5.4"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/transform/ifft.md",
      "docLocales": []
    },
    {
      "type": "DSP.Transform:magnitude",
      "label": "Magnitude",
      "category": "DSP.Transform",
      "inputPorts": [
        {
          "slot": "complex",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "magnitude",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/transform/complex.md",
      "docLocales": []
    },
    {
      "type": "DSP.Transform:phase",
      "label": "Phase",
      "category": "DSP.Transform",
      "inputPorts": [
        {
          "slot": "complex",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "phase",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/transform/complex.md",
      "docLocales": []
    },
    {
      "type": "DSP.Transform:dct",
      "label": "DCT",
      "category": "DSP.Transform",
      "inputPorts": [
        {
          "slot": "x",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "dct",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/transform/dct.md",
      "docLocales": []
    },
    {
      "type": "DSP.Window:window",
      "label": "Window",
      "category": "DSP.Window",
      "inputPorts": [
        {
          "slot": "signal",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "windowed",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        },
        {
          "id": "ue5",
          "version": "5.4"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/window/window.md",
      "docLocales": []
    },
    {
      "type": "DSP.Frame:frame",
      "label": "Frame",
      "category": "DSP.Frame",
      "inputPorts": [
        {
          "slot": "signal",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "frames",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/frame/frame.md",
      "docLocales": []
    },
    {
      "type": "DSP.Feature:mel",
      "label": "Mel Filterbank",
      "category": "DSP.Feature",
      "inputPorts": [
        {
          "slot": "spectrum",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "mel",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/feature/mel.md",
      "docLocales": []
    },
    {
      "type": "DSP.Feature:logscale",
      "label": "Log Scale",
      "category": "DSP.Feature",
      "inputPorts": [
        {
          "slot": "x",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "log_x",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/feature/logscale.md",
      "docLocales": []
    },
    {
      "type": "DSP.Feature:mfcc",
      "label": "MFCC",
      "category": "DSP.Feature",
      "inputPorts": [
        {
          "slot": "audio",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "mfcc",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/feature/mfcc.md",
      "docLocales": []
    },
    {
      "type": "DSP.Feature:dtw",
      "label": "DTW",
      "category": "DSP.Feature",
      "inputPorts": [
        {
          "slot": "live",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "template",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "distance",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/feature/dtw.md",
      "docLocales": []
    },
    {
      "type": "DSP.Filter:biquad",
      "label": "Biquad Filter",
      "category": "DSP.Filter",
      "inputPorts": [
        {
          "slot": "signal",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "filtered",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        },
        {
          "id": "ue5",
          "version": "5.4"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/filter/biquad.md",
      "docLocales": []
    },
    {
      "type": "DSP.Filter:kalman1d",
      "label": "Kalman 1D",
      "category": "DSP.Filter",
      "inputPorts": [
        {
          "slot": "signal",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "estimate",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/filter/kalman1d.md",
      "docLocales": []
    },
    {
      "type": "DSP.Stats:rms",
      "label": "RMS",
      "category": "DSP.Stats",
      "inputPorts": [
        {
          "slot": "signal",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "rms",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        },
        {
          "id": "ue5",
          "version": "5.4"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/stats/stats.md",
      "docLocales": []
    },
    {
      "type": "DSP.Stats:zcr",
      "label": "Zero Crossing Rate",
      "category": "DSP.Stats",
      "inputPorts": [
        {
          "slot": "signal",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "zcr",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/stats/stats.md",
      "docLocales": []
    },
    {
      "type": "DSP.Stats:movavg",
      "label": "Moving Average",
      "category": "DSP.Stats",
      "inputPorts": [
        {
          "slot": "signal",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "smoothed",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/stats/stats.md",
      "docLocales": []
    },
    {
      "type": "DSP.Stats:detrend",
      "label": "Detrend",
      "category": "DSP.Stats",
      "inputPorts": [
        {
          "slot": "signal",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "detrended",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        {
          "id": "onnx",
          "version": "1.18"
        }
      ],
      "signature": null,
      "doc": "docs/dsp/stats/stats.md",
      "docLocales": []
    },
    {
      "type": "DSP.Stream:buffer",
      "label": "Scalar Buffer",
      "category": "DSP.Stream",
      "inputPorts": [
        {
          "slot": "value",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "frame",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/dsp/stream/buffer.md",
      "docLocales": []
    },
    {
      "type": "DSP.Stream:mux",
      "label": "Channel Mux",
      "category": "DSP.Stream",
      "inputPorts": [
        {
          "slot": "in_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "frame",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/dsp/stream/mux.md",
      "docLocales": []
    },
    {
      "type": "DSP.Detect:steadystate",
      "label": "Steady-State Gate",
      "category": "DSP.Detect",
      "inputPorts": [
        {
          "slot": "value",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "value_gated",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "steady",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "transition",
          "optional": true,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/dsp/detect/steadystate.md",
      "docLocales": []
    },
    {
      "type": "DSP.Tensor:transpose",
      "label": "Transpose",
      "category": "DSP.Tensor",
      "inputPorts": [
        {
          "slot": "tensor",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "transposed",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/dsp/tensor/transpose.md",
      "docLocales": []
    },
    {
      "type": "DSP.Sensor:transducer",
      "label": "Transducer",
      "category": "DSP.Sensor",
      "inputPorts": [
        {
          "slot": "value",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "t",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "measured",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/dsp/sensor/transducer.md",
      "docLocales": []
    },
    {
      "type": "DSP.Acquire:daq",
      "label": "DAQ (block acquisition)",
      "category": "DSP.Acquire",
      "inputPorts": [
        {
          "slot": "value",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "block",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "rms",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/dsp/acquire/daq.en-US.md",
      "docLocales": [
        "en-US",
        "fr-FR"
      ]
    },
    {
      "type": "ML.Cluster:online",
      "label": "Online Clusterer (open-set)",
      "category": "ML.Cluster",
      "inputPorts": [
        {
          "slot": "embedding",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "label",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "is_new",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "distance",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "k",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "alarm",
          "optional": false,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/ml/cluster/online.md",
      "docLocales": []
    },
    {
      "type": "ML.Detect:motion",
      "label": "Motion Watch (freeze/jump)",
      "category": "ML.Detect",
      "inputPorts": [
        {
          "slot": "vector",
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "alarm",
          "optional": false,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "moving",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/ml/detect/motion.md",
      "docLocales": []
    },
    {
      "type": "Logic.Comparison:equal",
      "label": "Equal",
      "category": "Logic.Comparison",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/comparison/comparison.md",
      "docLocales": []
    },
    {
      "type": "Logic.Comparison:notEqual",
      "label": "Not Equal",
      "category": "Logic.Comparison",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/comparison/comparison.md",
      "docLocales": []
    },
    {
      "type": "Logic.Comparison:greater",
      "label": "Greater",
      "category": "Logic.Comparison",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/comparison/comparison.md",
      "docLocales": []
    },
    {
      "type": "Logic.Comparison:less",
      "label": "Less",
      "category": "Logic.Comparison",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/comparison/comparison.md",
      "docLocales": []
    },
    {
      "type": "Logic.Comparison:greaterOrEqual",
      "label": "Greater or Equal",
      "category": "Logic.Comparison",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/comparison/comparison.md",
      "docLocales": []
    },
    {
      "type": "Logic.Comparison:lessOrEqual",
      "label": "Less or Equal",
      "category": "Logic.Comparison",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/comparison/comparison.md",
      "docLocales": []
    },
    {
      "type": "Logic.Flow:branch",
      "label": "Branch",
      "category": "Logic.Flow",
      "inputPorts": [
        {
          "slot": "in",
          "optional": true,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "condition",
          "optional": true,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "true",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "false",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/flow/branch.md",
      "docLocales": []
    },
    {
      "type": "Logic.Flow:sequence",
      "label": "Sequence",
      "category": "Logic.Flow",
      "inputPorts": [
        {
          "slot": "in",
          "optional": true,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "then_0",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/flow/sequence.md",
      "docLocales": []
    },
    {
      "type": "Logic.Flow:doOnce",
      "label": "Do Once",
      "category": "Logic.Flow",
      "inputPorts": [
        {
          "slot": "in",
          "optional": true,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "then",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/flow/doonce.md",
      "docLocales": []
    },
    {
      "type": "Logic.Flow:gate",
      "label": "Gate",
      "category": "Logic.Flow",
      "inputPorts": [
        {
          "slot": "in",
          "optional": true,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "then",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/flow/gate.md",
      "docLocales": []
    },
    {
      "type": "Logic.Flow:select",
      "label": "Select",
      "category": "Logic.Flow",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "condition",
          "optional": true,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/flow/select.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:makeArray",
      "label": "Make Array",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "item_0",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "array",
          "optional": false,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:length",
      "label": "Length",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "length",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:clear",
      "label": "Clear",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "array",
          "optional": false,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:shuffle",
      "label": "Shuffle",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "array",
          "optional": false,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:reverse",
      "label": "Reverse",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "array",
          "optional": false,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:sort",
      "label": "Sort",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "array",
          "optional": false,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:add",
      "label": "Add",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "item",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "array",
          "optional": false,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:insert",
      "label": "Insert",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "index",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "item",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "array",
          "optional": false,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:set",
      "label": "Set Elem",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "index",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "item",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "array",
          "optional": false,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:get",
      "label": "Get",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "index",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "item",
          "optional": false,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:remove",
      "label": "Remove",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "item",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "array",
          "optional": false,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:removeIndex",
      "label": "Remove Index",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "index",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "array",
          "optional": false,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:contains",
      "label": "Contains",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "item",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Array:find",
      "label": "Find",
      "category": "Logic.Array",
      "inputPorts": [
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "item",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "index",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/array/array.md",
      "docLocales": []
    },
    {
      "type": "Logic.Loop:forLoop",
      "label": "For Loop",
      "category": "Logic.Loop",
      "inputPorts": [
        {
          "slot": "in",
          "optional": true,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "firstIndex",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "lastIndex",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "body",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "index",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "completed",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/loop/loops.md",
      "docLocales": []
    },
    {
      "type": "Logic.Loop:forEachLoop",
      "label": "For Each Loop",
      "category": "Logic.Loop",
      "inputPorts": [
        {
          "slot": "in",
          "optional": true,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "body",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "element",
          "optional": false,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "index",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "completed",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/loop/loops.md",
      "docLocales": []
    },
    {
      "type": "Logic.Loop:whileLoop",
      "label": "While Loop",
      "category": "Logic.Loop",
      "inputPorts": [
        {
          "slot": "in",
          "optional": true,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "condition",
          "optional": true,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "body",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "completed",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/loop/loops.md",
      "docLocales": []
    },
    {
      "type": "Logic.Loop:forLoopWithBreak",
      "label": "For Loop with Break",
      "category": "Logic.Loop",
      "inputPorts": [
        {
          "slot": "in",
          "optional": true,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "firstIndex",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "lastIndex",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "body",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "index",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "completed",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/loop/loops.md",
      "docLocales": []
    },
    {
      "type": "Logic.Loop:forEachLoopWithBreak",
      "label": "For Each Loop with Break",
      "category": "Logic.Loop",
      "inputPorts": [
        {
          "slot": "in",
          "optional": true,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "array",
          "optional": true,
          "type": "array",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "body",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "element",
          "optional": false,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "index",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "completed",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/loop/loops.md",
      "docLocales": []
    },
    {
      "type": "Logic.Debug:print",
      "label": "Print String",
      "category": "Logic.Debug",
      "inputPorts": [
        {
          "slot": "in",
          "optional": true,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "text",
          "optional": true,
          "type": "string",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "then",
          "optional": false,
          "type": "trigger",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/debug/print.md",
      "docLocales": []
    },
    {
      "type": "Logic.Debug:watch",
      "label": "Watch Value",
      "category": "Logic.Debug",
      "inputPorts": [
        {
          "slot": "value",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/debug/watch.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:add",
      "label": "Add",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:subtract",
      "label": "Subtract",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:multiply",
      "label": "Multiply",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:divide",
      "label": "Divide",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:mod",
      "label": "Mod",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:min",
      "label": "Min",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:max",
      "label": "Max",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:pow",
      "label": "Pow",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:negate",
      "label": "Negate",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:abs",
      "label": "Abs",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:floor",
      "label": "Floor",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:ceil",
      "label": "Ceil",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:round",
      "label": "Round",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:sqrt",
      "label": "Sqrt",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:sin",
      "label": "Sin",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:cos",
      "label": "Cos",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:clamp",
      "label": "Clamp",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "value",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "min",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "max",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:lerp",
      "label": "Lerp",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "a",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "b",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "t",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Math:sum",
      "label": "Sum",
      "category": "Logic.Math",
      "inputPorts": [
        {
          "slot": "in_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "result",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/logic/math/math.md",
      "docLocales": []
    },
    {
      "type": "Logic.Time:clock",
      "label": "Clock",
      "category": "Logic.Time",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "t",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/time/clock.md",
      "docLocales": []
    },
    {
      "type": "Logic.Time:deltaTime",
      "label": "Delta Time",
      "category": "Logic.Time",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "dt",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/time/deltatime.md",
      "docLocales": []
    },
    {
      "type": "Logic.Time:timer",
      "label": "Timer",
      "category": "Logic.Time",
      "inputPorts": [
        {
          "slot": "duration",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "from",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "to",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "progress",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "value",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/time/timer.md",
      "docLocales": []
    },
    {
      "type": "Logic.Time:timeline",
      "label": "Timeline",
      "category": "Logic.Time",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "value",
          "optional": false,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": {
        "purpose": "a piecewise-constant source in session time: the schedule of a scenario (segments from, to, value), for any quantity",
        "inputs": {},
        "outputs": {
          "value": {
            "quantity": "Any",
            "description": "the segment's value at the current session time"
          }
        },
        "capabilities": [
          "source",
          "schedule",
          "scenario",
          "time"
        ]
      },
      "doc": "docs/logic/time/timeline.md",
      "docLocales": []
    },
    {
      "type": "Logic.Input:slider",
      "label": "Number Slider",
      "category": "Logic.Input",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "value",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/input/slider.md",
      "docLocales": []
    },
    {
      "type": "Logic.Input:constant",
      "label": "Number Constant",
      "category": "Logic.Input",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "value",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "ue5"
      ],
      "signature": null,
      "doc": "docs/logic/input/constant.md",
      "docLocales": []
    },
    {
      "type": "Logic.Sim:rng-seed",
      "label": "RNG Seed",
      "category": "Logic.Sim",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "value",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/logic/sim/rng-seed.md",
      "docLocales": []
    },
    {
      "type": "Logic.Sim:snapshot",
      "label": "Snapshot",
      "category": "Logic.Sim",
      "inputPorts": [
        {
          "slot": "trigger",
          "optional": true,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "payload",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "stored",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/logic/sim/snapshot.md",
      "docLocales": []
    },
    {
      "type": "Logic.Sim:restore",
      "label": "Restore",
      "category": "Logic.Sim",
      "inputPorts": [
        {
          "slot": "trigger",
          "optional": true,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "payload",
          "optional": false,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/logic/sim/restore.md",
      "docLocales": []
    },
    {
      "type": "Logic.Sim:rate-divider",
      "label": "Rate Divider",
      "category": "Logic.Sim",
      "inputPorts": [
        {
          "slot": "value",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "value",
          "optional": false,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "tick",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/logic/sim/rate-divider.md",
      "docLocales": []
    },
    {
      "type": "Logic.Sim:conservation-monitor",
      "label": "Conservation Monitor",
      "category": "Logic.Sim",
      "inputPorts": [
        {
          "slot": "in_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "drift",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "alert",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/logic/sim/conservation-monitor.md",
      "docLocales": []
    },
    {
      "type": "Logic.Event:alert-bus",
      "label": "Alert Bus",
      "category": "Logic.Event",
      "inputPorts": [
        {
          "slot": "publish",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "subscribe",
          "optional": false,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/logic/event/alert-bus.md",
      "docLocales": []
    },
    {
      "type": "Logic.Event:arbitrator",
      "label": "Arbitrator",
      "category": "Logic.Event",
      "inputPorts": [
        {
          "slot": "req_0",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "applied",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "sourceIdx",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/logic/event/arbitrator.md",
      "docLocales": []
    },
    {
      "type": "Control.Actuator:setpoint",
      "label": "Setpoint",
      "category": "Control.Actuator",
      "inputPorts": [
        {
          "slot": "request",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "t",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "applied",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "clamped",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "rateLimited",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/control/actuator/setpoint.md",
      "docLocales": []
    },
    {
      "type": "Control.Feedback:channel",
      "label": "Feedback Channel",
      "category": "Control.Feedback",
      "inputPorts": [
        {
          "slot": "input",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "output",
          "optional": false,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/control/feedback/channel.md",
      "docLocales": []
    },
    {
      "type": "Control.Safety:emergency-shutdown",
      "label": "Emergency Shutdown",
      "category": "Control.Safety",
      "inputPorts": [
        {
          "slot": "trigger",
          "optional": true,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "reset",
          "optional": true,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "shutdown",
          "optional": false,
          "type": "boolean",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/control/safety/emergency-shutdown.md",
      "docLocales": []
    },
    {
      "type": "Control.Sim:rk4-solver",
      "label": "RK4 Solver",
      "category": "Control.Sim",
      "inputPorts": [],
      "outputPorts": [
        {
          "slot": "solver_out",
          "optional": true,
          "type": "solver",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/control/sim/rk4-solver.md",
      "docLocales": []
    },
    {
      "type": "Sim.Graph:graph",
      "label": "Sub-graph",
      "category": "Sim.Graph",
      "inputPorts": [
        {
          "slot": "scene_in",
          "optional": true,
          "type": "scene",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "local",
          "optional": true,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "world",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": "docs/control/sim-graph/sim-graph.md",
      "docLocales": []
    },
    {
      "type": "spk.onnx:model",
      "label": "ONNX Model",
      "category": "model",
      "inputPorts": [],
      "outputPorts": [],
      "standards": [
        "onnx"
      ],
      "signature": {
        "purpose": "run a learned model (an ONNX file, loaded with its contract: sha256, shapes, thresholds) as a node whose ports are the model's tensors",
        "inputs": {},
        "outputs": {},
        "capabilities": [
          "inference",
          "learned",
          "onnx",
          "contract"
        ]
      },
      "doc": "docs/onnx/model/model.md",
      "docLocales": []
    },
    {
      "type": "spk.onnx:conv",
      "label": "Conv",
      "category": "conv",
      "inputPorts": [
        {
          "slot": 0,
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": 1,
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": 2,
          "optional": true,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": 0,
          "optional": false,
          "type": "tensor",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": [
        "onnx"
      ],
      "signature": null,
      "doc": "docs/onnx/conv/conv.md",
      "docLocales": []
    },
    {
      "type": "Core.Lifecycle:start",
      "label": "Start",
      "category": "Core.Lifecycle",
      "inputPorts": [],
      "outputPorts": [],
      "standards": null,
      "signature": null,
      "doc": "../bundle/docs/core/lifecycle/start.md",
      "docLocales": []
    },
    {
      "type": "Core.Lifecycle:stop",
      "label": "Stop",
      "category": "Core.Lifecycle",
      "inputPorts": [],
      "outputPorts": [],
      "standards": null,
      "signature": null,
      "doc": "../bundle/docs/core/lifecycle/stop.md",
      "docLocales": []
    },
    {
      "type": "spk.geometry:cartesian3",
      "label": "Cartesian3",
      "category": "geometry",
      "inputPorts": [
        {
          "slot": "x",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "y",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "z",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "vec3",
          "optional": false,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": null,
      "docLocales": []
    },
    {
      "type": "spk.geometry:cartesian3-split",
      "label": "Cartesian3 Split",
      "category": "geometry",
      "inputPorts": [
        {
          "slot": "vec3",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "x",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "y",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "z",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": null,
      "docLocales": []
    },
    {
      "type": "spk.geometry:transform",
      "label": "Transform",
      "category": "geometry",
      "inputPorts": [
        {
          "slot": "translation",
          "optional": true,
          "type": "vec3",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "rotation",
          "optional": true,
          "type": "vec4",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "matrix",
          "optional": false,
          "type": "matrix44",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": null,
      "docLocales": []
    },
    {
      "type": "spk.geometry:attitude",
      "label": "Attitude",
      "category": "geometry",
      "inputPorts": [
        {
          "slot": "yaw",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "pitch",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        },
        {
          "slot": "roll",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "rotation",
          "optional": false,
          "type": "vec4",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": null,
      "doc": null,
      "docLocales": []
    },
    {
      "type": "Viz.Plot:line",
      "label": "Viz.Plot:line (headless stub)",
      "category": "Viz.Plot",
      "inputPorts": [
        {
          "slot": "value",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [],
      "standards": null,
      "signature": null,
      "doc": null,
      "docLocales": []
    },
    {
      "type": "Viz.Plot:spectrum",
      "label": "Viz.Plot:spectrum (headless stub)",
      "category": "Viz.Plot",
      "inputPorts": [
        {
          "slot": "magnitudes",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [],
      "standards": null,
      "signature": null,
      "doc": null,
      "docLocales": []
    },
    {
      "type": "Viz.Plot:waterfall",
      "label": "Viz.Plot:waterfall (headless stub)",
      "category": "Viz.Plot",
      "inputPorts": [
        {
          "slot": "magnitudes",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [],
      "standards": null,
      "signature": null,
      "doc": null,
      "docLocales": []
    },
    {
      "type": "Physics.Habitat:person",
      "label": "Person (CO2 source)",
      "category": "Physics.Habitat",
      "inputPorts": [
        {
          "slot": "activity",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "co2Delta",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "litresPerMinute",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "activityLevel",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": {
        "purpose": "one person by name as a CO2 source in kg/s, at an activity of their own (sleep, rest, light_work, heavy_work) at NASA's rate per activity in litres per minute, their own rates editable; wired into a crew's person pool or straight into an atmosphere",
        "inputs": {
          "activity": {
            "quantity": "Category",
            "description": "what they do: a word (sleep, rest, light_work, heavy_work) or a rung of that ladder as a number (0 to 3), so a timeline can schedule their day; the editable when unwired"
          }
        },
        "outputs": {
          "co2Delta": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "their CO2, for a crew's person_<k> input or an atmosphere's delta_CO2 input"
          },
          "litresPerMinute": {
            "quantity": "VolumetricFlow",
            "unit": "L/min",
            "description": "the same, as a volume of CO2 per minute"
          },
          "activityLevel": {
            "quantity": "Dimensionless",
            "unit": "ratio",
            "description": "what they are doing, as the rung of the ladder (0 asleep to 3 at heavy work)"
          }
        },
        "capabilities": [
          "source",
          "co2",
          "crew",
          "person",
          "air_quality"
        ]
      },
      "doc": "C:\\Users\\GuillaumePelletier\\Documents\\GitHub\\Gaume\\co2-scrubber-governed-agent\\plugins\\habitat\\docs\\person.md",
      "docLocales": []
    },
    {
      "type": "Physics.Habitat:crew",
      "label": "Crew (CO2 source)",
      "category": "Physics.Habitat",
      "inputPorts": [
        {
          "slot": "count",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "activity",
          "optional": true,
          "type": "any",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "person_0",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "co2Delta",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "litresPerMinute",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "headcount",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": {
        "purpose": "people as a CO2 source in kg/s: the persons wired into its pool (one person_<k> input each, the pool growing as persons are added), plus a head count at one activity for the people nobody names, each at the activity's rate in litres per minute (NASA's bands), no volume folded in",
        "inputs": {
          "person_0": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "a person's co2Delta (Physics.Habitat:person); the pool grows (person_1, person_2, ...) as persons are wired"
          },
          "count": {
            "quantity": "Count",
            "unit": "person",
            "description": "head count of the unnamed people, on top of the persons wired; the editable when unwired"
          },
          "activity": {
            "quantity": "Category",
            "description": "the unnamed people's activity: sleep, rest, light_work or heavy_work; the editable when unwired"
          }
        },
        "outputs": {
          "co2Delta": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "the crew's CO2, persons and count together, for an atmosphere's delta_CO2 input"
          },
          "litresPerMinute": {
            "quantity": "VolumetricFlow",
            "unit": "L/min",
            "description": "the same, as a volume of CO2 per minute"
          },
          "headcount": {
            "quantity": "Count",
            "unit": "person",
            "description": "the persons wired plus the count"
          }
        },
        "capabilities": [
          "source",
          "co2",
          "crew",
          "air_quality"
        ]
      },
      "doc": "C:\\Users\\GuillaumePelletier\\Documents\\GitHub\\Gaume\\co2-scrubber-governed-agent\\plugins\\habitat\\docs\\crew.md",
      "docLocales": []
    },
    {
      "type": "Physics.Habitat:scrubber",
      "label": "CO2 scrubber (mass)",
      "category": "Physics.Habitat",
      "inputPorts": [
        {
          "slot": "command",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "ppm",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "pressure",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "temperature",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "co2Delta",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "flow",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "effectiveFlow",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "power",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": {
        "purpose": "a CO2 scrubber at a command fraction, in its datasheet's units: a flow in m3/s that follows the command with a lag, a single-pass efficiency, the CO2 removed in kg/s from the concentration it draws, and its electrical power",
        "inputs": {
          "command": {
            "quantity": "Dimensionless",
            "unit": "ratio",
            "description": "0 to 1, the commanded fraction of full speed"
          },
          "ppm": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the CO2 concentration of the air it draws (the volume's ppm_CO2)"
          },
          "pressure": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the air pressure, the editable default when unwired"
          },
          "temperature": {
            "quantity": "Temperature",
            "unit": "k",
            "description": "the air temperature, the editable default when unwired"
          }
        },
        "outputs": {
          "co2Delta": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "minus the CO2 removed, for an atmosphere's delta_CO2 input"
          },
          "flow": {
            "quantity": "VolumetricFlow",
            "unit": "m3ps",
            "description": "the air flow through the beds, after the lag"
          },
          "effectiveFlow": {
            "quantity": "VolumetricFlow",
            "unit": "m3ps",
            "description": "efficiency times the flow: the air cleaned per second"
          },
          "power": {
            "quantity": "Power",
            "unit": "watt",
            "description": "electrical power drawn"
          }
        },
        "capabilities": [
          "sink",
          "co2",
          "scrubber",
          "air_quality",
          "power_load"
        ]
      },
      "doc": "C:\\Users\\GuillaumePelletier\\Documents\\GitHub\\Gaume\\co2-scrubber-governed-agent\\plugins\\habitat\\docs\\scrubber.md",
      "docLocales": []
    },
    {
      "type": "Physics.Habitat:fan",
      "label": "HVAC fan",
      "category": "Physics.Habitat",
      "inputPorts": [
        {
          "slot": "command",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "resistance",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "flow",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "pressureRise",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "power",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "speedRatio",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": {
        "purpose": "a ventilation fan: from a command to the flow it delivers against the duct's and the filter's resistance, through its fan curve (shutoff pressure, free delivery, fan laws), with a spin-up lag and its power",
        "inputs": {
          "command": {
            "quantity": "Dimensionless",
            "unit": "ratio",
            "description": "0 to 1, the commanded fraction of rated speed"
          },
          "resistance": {
            "quantity": "FlowResistance",
            "unit": "Pa/(m3/s)^2",
            "description": "the resistance of what the fan blows through besides its own duct (a filter's)"
          }
        },
        "outputs": {
          "flow": {
            "quantity": "VolumetricFlow",
            "unit": "m3ps",
            "description": "the flow delivered at the operating point"
          },
          "pressureRise": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the pressure the fan develops at that flow"
          },
          "power": {
            "quantity": "Power",
            "unit": "watt",
            "description": "electrical power drawn"
          },
          "speedRatio": {
            "quantity": "Dimensionless",
            "unit": "ratio",
            "description": "the speed reached, 0 to 1, after the spin-up"
          }
        },
        "capabilities": [
          "ventilation",
          "hvac",
          "fan",
          "flow",
          "power_load"
        ]
      },
      "doc": "C:\\Users\\GuillaumePelletier\\Documents\\GitHub\\Gaume\\co2-scrubber-governed-agent\\plugins\\habitat\\docs\\fan.md",
      "docLocales": []
    },
    {
      "type": "Physics.Habitat:filter",
      "label": "HVAC filter",
      "category": "Physics.Habitat",
      "inputPorts": [
        {
          "slot": "flow",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "dustConcentration",
          "optional": true,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "particulate_in",
          "optional": true,
          "type": "particulate",
          "unit": null,
          "kind": "stream",
          "multiplicity": "single"
        }
      ],
      "outputPorts": [
        {
          "slot": "resistance",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "pressureDrop",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "loading",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        },
        {
          "slot": "clogging",
          "optional": false,
          "type": "float",
          "unit": null,
          "kind": "signal",
          "multiplicity": "single"
        }
      ],
      "standards": null,
      "signature": {
        "purpose": "an air filter on a duct: a resistance to the flow that grows with the dust it captures (its loading, the fault of a fouled filter), the pressure drop, and how far it stands from its end of life",
        "inputs": {
          "flow": {
            "quantity": "VolumetricFlow",
            "unit": "m3ps",
            "description": "the air flow through the filter (a fan's)"
          },
          "dustConcentration": {
            "quantity": "Density",
            "unit": "kg/m3",
            "description": "the dust the air carries; the editable ambient value when unwired"
          },
          "particulate_in": {
            "quantity": "Particulate",
            "description": "the dust it captures: a Physics.Particulate node (declarative in V1)"
          }
        },
        "outputs": {
          "resistance": {
            "quantity": "FlowResistance",
            "unit": "Pa/(m3/s)^2",
            "description": "the resistance at the current loading, for a fan's resistance input"
          },
          "pressureDrop": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the pressure drop at the current flow"
          },
          "loading": {
            "quantity": "Mass",
            "unit": "kg",
            "description": "dust captured so far"
          },
          "clogging": {
            "quantity": "Dimensionless",
            "unit": "ratio",
            "description": "loading over end-of-life loading: 0 clean, 1 to be replaced"
          }
        },
        "capabilities": [
          "ventilation",
          "hvac",
          "filter",
          "fault",
          "fouling",
          "degradation"
        ]
      },
      "doc": "C:\\Users\\GuillaumePelletier\\Documents\\GitHub\\Gaume\\co2-scrubber-governed-agent\\plugins\\habitat\\docs\\filter.md",
      "docLocales": []
    }
  ]
}
```

</details>

### Model call: claude-haiku-4-5-20251001, 2,070 in / 57 out, 1338 ms

**Response, raw**

```text
I need to understand the available node types in the catalogue before submitting a plan. Let me list all available nodes first.

[tool_use twin__registry_list_nodes]
{}

[stop_reason tool_use]
```

## Step 3: task.plan (refused) -> failed

- node: ?; last capability before: none; 2523 ms
- failed: plan refused: selected node "Physics.Atmosphere:atmosphere" is not in the catalogue; selected node "Crew.Respiration:respiration" is not in the catalogue; selected node "Device.Scrubber:scrubber" is not in the catalogue; selected node "Device.Sensor:sensor" is not in the catalogue; required output "CO2 concentration in Lab" (Concentration, ppm) is neither produced by a selected node nor declared missing

**Proposed by the model: task.plan**

```json
{
  "selected_nodes": [
    "Physics.Scene:scene",
    "Physics.Atmosphere:atmosphere",
    "Logic.Time:timeline",
    "Crew.Respiration:respiration",
    "Device.Scrubber:scrubber",
    "Device.Sensor:sensor"
  ],
  "missing_capabilities": []
}
```

### Model call: claude-haiku-4-5-20251001, 3,018 in / 170 out, 2502 ms

**Response, raw**

```text
I'll submit the plan using the reference graph "habitat" from the library, which is designed for this exact scenario. The state shows it's already known and contains the appropriate nodes for modeling the Lab's CO2 concentration with the scrubber system.

[tool_use task__plan]
{
  "selected_nodes": [
    "Physics.Scene:scene",
    "Physics.Atmosphere:atmosphere",
    "Logic.Time:timeline",
    "Crew.Respiration:respiration",
    "Device.Scrubber:scrubber",
    "Device.Sensor:sensor"
  ],
  "missing_capabilities": []
}

[stop_reason tool_use]
```

## Step 4: twin.registry_search (fallback) -> completed

- node: phase plan; last capability before: twin.registry_list_nodes; 1989 ms
- rationale: I need to search the catalogue for the correct node types that can produce CO2 concentration and handle the physics of the habitat. Let me search for nodes that produce Concentration in ppm.
- evaluation: success, reward 0.5: twin.registry_search completed; nothing new in the workshop

**Input of twin.registry_search**

```json
{
  "requiredOutputs": [
    {
      "quantity": "Concentration",
      "unit": "ppm"
    }
  ],
  "limit": 20
}
```

<details><summary><strong>Output of twin.registry_search (ok)</strong> (7,052 characters, folded)</summary>

```json
{
  "signed": 13,
  "total": 166,
  "matches": [
    {
      "type": "Physics.LifeSupport:cabin-air",
      "label": "Cabin Air (CO2)",
      "signature": {
        "purpose": "the CO2 balance of one sealed, well-mixed cabin: sources in, scrubbing out, the concentration in ppm and the life-support state it implies",
        "inputs": {
          "scrubberRate": {
            "quantity": "Frequency",
            "unit": "1/min",
            "description": "the scrubber's effective removal rate"
          },
          "emissionA": {
            "quantity": "ConcentrationRate",
            "unit": "ppm/min",
            "description": "a crew group's emission"
          },
          "emissionB": {
            "quantity": "ConcentrationRate",
            "unit": "ppm/min"
          },
          "emissionC": {
            "quantity": "ConcentrationRate",
            "unit": "ppm/min"
          },
          "emissionD": {
            "quantity": "ConcentrationRate",
            "unit": "ppm/min"
          }
        },
        "outputs": {
          "co2Ppm": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the cabin's CO2 concentration"
          },
          "state": {
            "quantity": "Category",
            "description": "NOMINAL, ELEVATED or CRITICAL against the thresholds"
          },
          "removal": {
            "quantity": "ConcentrationRate",
            "unit": "ppm/min",
            "description": "what the scrubber removes at the latest state"
          }
        },
        "capabilities": [
          "prediction",
          "co2",
          "air_quality",
          "cabin",
          "mass_balance"
        ]
      },
      "score": 100,
      "produces": [
        {
          "port": "co2Ppm",
          "quantity": "Concentration",
          "unit": "ppm"
        }
      ]
    },
    {
      "type": "Physics.Scene:atmosphere",
      "label": "Atmosphere",
      "signature": {
        "purpose": "hold one well-mixed volume of gas (one or more layers): its pressure, temperature, density and composition, which gates and scrubbers act on; per species, the sources and sinks summed into its mass, and the mass, mole fraction, partial pressure and ppm it publishes",
        "inputs": {
          "delta_N2_0": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "a source (positive) or a sink (negative) of N2; the pool grows by index"
          },
          "delta_O2_0": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "a source (positive) or a sink (negative) of O2; the pool grows by index"
          },
          "delta_CO2_0": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "a source (positive) or a sink (negative) of CO2; the pool grows by index"
          },
          "delta_H2O_0": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "a source (positive) or a sink (negative) of H2O; the pool grows by index"
          },
          "delta_Ar_0": {
            "quantity": "MassFlow",
            "unit": "kg/s",
            "description": "a source (positive) or a sink (negative) of Ar; the pool grows by index"
          }
        },
        "outputs": {
          "pressure": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "volume-weighted total pressure"
          },
          "temperature": {
            "quantity": "Temperature",
            "unit": "k",
            "description": "volume-weighted temperature"
          },
          "density": {
            "quantity": "Density",
            "unit": "kgpm3",
            "description": "total mass over total volume"
          },
          "mass_N2": {
            "quantity": "Mass",
            "unit": "kg",
            "description": "the N2 in the volume"
          },
          "ppm_N2": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the N2 mole fraction, in parts per million"
          },
          "partial_pressure_N2": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the N2 partial pressure"
          },
          "mass_O2": {
            "quantity": "Mass",
            "unit": "kg",
            "description": "the O2 in the volume"
          },
          "ppm_O2": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the O2 mole fraction, in parts per million"
          },
          "partial_pressure_O2": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the O2 partial pressure"
          },
          "mass_CO2": {
            "quantity": "Mass",
            "unit": "kg",
            "description": "the CO2 in the volume"
          },
          "ppm_CO2": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the CO2 mole fraction, in parts per million"
          },
          "partial_pressure_CO2": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the CO2 partial pressure"
          },
          "mass_H2O": {
            "quantity": "Mass",
            "unit": "kg",
            "description": "the H2O in the volume"
          },
          "ppm_H2O": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the H2O mole fraction, in parts per million"
          },
          "partial_pressure_H2O": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the H2O partial pressure"
          },
          "mass_Ar": {
            "quantity": "Mass",
            "unit": "kg",
            "description": "the Ar in the volume"
          },
          "ppm_Ar": {
            "quantity": "Concentration",
            "unit": "ppm",
            "description": "the Ar mole fraction, in parts per million"
          },
          "partial_pressure_Ar": {
            "quantity": "Pressure",
            "unit": "Pa",
            "description": "the Ar partial pressure"
          }
        },
        "capabilities": [
          "atmosphere",
          "volume",
          "air_quality",
          "mass_balance",
          "prediction",
          "co2"
        ]
      },
      "score": 100,
      "produces": [
        {
          "port": "ppm_N2",
          "quantity": "Concentration",
          "unit": "ppm"
        },
        {
          "port": "ppm_O2",
          "quantity": "Concentration",
          "unit": "ppm"
        },
        {
          "port": "ppm_CO2",
          "quantity": "Concentration",
          "unit": "ppm"
        },
        {
          "port": "ppm_H2O",
          "quantity": "Concentration",
          "unit": "ppm"
        },
        {
          "port": "ppm_Ar",
          "quantity": "Concentration",
          "unit": "ppm"
        }
      ]
    }
  ]
}
```

</details>

### Model call: claude-haiku-4-5-20251001, 3,122 in / 121 out, 1959 ms

**Response, raw**

```text
I need to search the catalogue for the correct node types that can produce CO2 concentration and handle the physics of the habitat. Let me search for nodes that produce Concentration in ppm.

[tool_use twin__registry_search]
{
  "requiredOutputs": [
    {
      "quantity": "Concentration",
      "unit": "ppm"
    }
  ],
  "limit": 20
}

[stop_reason tool_use]
```

## Step 5: task.plan (fallback) -> completed

- node: phase plan -> phase build; last capability before: twin.registry_search; 2267 ms
- rationale: I'll submit the plan with the node types from the reference graph "habitat" that the harness has already identified as suitable for this task.
- evaluation: success, reward 1: plan accepted: 5 node type(s), 0 missing capability(ies)

**Input of task.plan**

```json
{
  "selected_nodes": [
    "Physics.Scene:atmosphere",
    "Physics.LifeSupport:cabin-air",
    "Logic.Time:timeline",
    "Physics.LifeSupport:scrubber",
    "Physics.LifeSupport:crew"
  ],
  "missing_capabilities": []
}
```

**Output of task.plan (ok)**

```json
{
  "outcome": "completed",
  "value": {
    "accepted": true,
    "selected": 5,
    "missing": 0
  }
}
```

### Model call: claude-haiku-4-5-20251001, 2,739 in / 145 out, 2232 ms

**Response, raw**

```text
I'll submit the plan with the node types from the reference graph "habitat" that the harness has already identified as suitable for this task.

[tool_use task__plan]
{
  "selected_nodes": [
    "Physics.Scene:atmosphere",
    "Physics.LifeSupport:cabin-air",
    "Logic.Time:timeline",
    "Physics.LifeSupport:scrubber",
    "Physics.LifeSupport:crew"
  ],
  "missing_capabilities": []
}

[stop_reason tool_use]
```

## Step 6: graph.evaluate (fallback) -> completed

- node: phase build; last capability before: task.plan; 6278 ms
- rationale: I'll evaluate the first candidate using the reference graph "habitat" from the library, instantiating it with the observed persons and fitting the unknown variables within their documented bounds.
- evaluation: success, reward 1: graph.evaluate completed; the workshop changed

**Input of graph.evaluate**

```json
{
  "graph": "habitat",
  "label": "Reference habitat graph: Lab and Hab-B volumes, crew by activity, scrubber and ventilation",
  "persons": [
    {
      "module": "habB",
      "activity": "rest",
      "callsign": "CDR"
    },
    {
      "module": "habB",
      "activity": "rest",
      "callsign": "FE-3"
    },
    {
      "module": "lab",
      "activity": "light_work",
      "callsign": "FE-1"
    },
    {
      "module": "lab",
      "activity": "light_work",
      "callsign": "FE-2"
    }
  ],
  "variables": {
    "Qe_full": 1,
    "tau_scrubber": 3.33,
    "eta": 0.3,
    "Q_full": 3.3,
    "C_CRITICAL": 4000,
    "C_ELEVATED": 3500,
    "speed_min": 40,
    "gRest": 0.3
  },
  "fit": {
    "V": {
      "min": 10,
      "max": 200
    },
    "Vh": {
      "min": 50,
      "max": 1000
    },
    "L": {
      "min": 0,
      "max": 0.2
    },
    "g": {
      "min": 0.26,
      "max": 0.45
    }
  },
  "maxRuns": 40
}
```

<details><summary><strong>Output of graph.evaluate (ok)</strong> (6,512 characters, folded)</summary>

```json
{
  "outcome": "completed",
  "value": {
    "candidate": 1,
    "path": "candidate-1.spikypanda",
    "pass": true,
    "status": "calibration_pass",
    "diagnosis": "PASS",
    "calibration": "PASS",
    "validation": "NOT_PERFORMED",
    "identifiability": {
      "V": {
        "estimate": 27.37,
        "nearOptimalRange": [
          27.37,
          29.85
        ],
        "spread": 0.091
      },
      "Vh": {
        "estimate": 422.8,
        "nearOptimalRange": [
          385.9,
          422.8
        ],
        "spread": 0.087
      },
      "L": {
        "estimate": 0.09836,
        "nearOptimalRange": [
          0.09257,
          0.09836
        ],
        "spread": 0.059
      },
      "g": {
        "estimate": 0.4071,
        "nearOptimalRange": [
          0.4026,
          0.4116
        ],
        "spread": 0.022
      }
    },
    "identifiable": true,
    "threshold": 10,
    "variables": {
      "gRest": 0.3,
      "Qe": 1,
      "eta": 0.3,
      "lag": 3.33,
      "Qe_full": 1,
      "tau_scrubber": 3.33,
      "Q_full": 3.3,
      "C_CRITICAL": 4000,
      "C_ELEVATED": 3500,
      "speed_min": 40,
      "V": 27.37,
      "Vh": 422.8,
      "L": 0.09836,
      "g": 0.4071
    },
    "graph": "habitat",
    "settings": {
      "labOccupants": 2,
      "habOccupants": 2
    },
    "defaulted": [],
    "fromDevice": {
      "Qe": {
        "path": "/habitat/lab/eclss/scrubber-1",
        "property": "effectiveFlowAtFull",
        "value": 1.0000200000000001
      },
      "lag": {
        "path": "/habitat/lab/eclss/scrubber-1",
        "property": "lagTimeConstant",
        "value": 3.33
      }
    },
    "persons": [
      {
        "id": "cdr",
        "callsign": "CDR",
        "name": "",
        "module": "habB",
        "activity": "rest"
      },
      {
        "id": "fe-3",
        "callsign": "FE-3",
        "name": "",
        "module": "habB",
        "activity": "rest"
      },
      {
        "id": "fe-1",
        "callsign": "FE-1",
        "name": "",
        "module": "lab",
        "activity": "light_work"
      },
      {
        "id": "fe-2",
        "callsign": "FE-2",
        "name": "",
        "module": "lab",
        "activity": "light_work"
      }
    ],
    "residuals": [
      {
        "column": "co2_lab_ppm",
        "probe": "co2-1.lastMeasured",
        "rmse": 4.6,
        "worst": 8,
        "worstMinute": 24
      },
      {
        "column": "co2_habb_ppm",
        "probe": "co2-2.lastMeasured",
        "rmse": 2.8,
        "worst": 5,
        "worstMinute": 50
      }
    ],
    "firstSlope": {
      "column": "co2_lab_ppm",
      "minutes": 5,
      "predicted": 17.4,
      "measured": 16.4
    },
    "againstStationReference": {
      "wiringMatch": 1,
      "missingWires": [],
      "extraWires": []
    },
    "profile": [
      {
        "minute": 0,
        "predicted": 1480,
        "measured": 1480
      },
      {
        "minute": 5,
        "predicted": 1567,
        "measured": 1562
      },
      {
        "minute": 10,
        "predicted": 1588,
        "measured": 1587
      },
      {
        "minute": 15,
        "predicted": 1596,
        "measured": 1600
      },
      {
        "minute": 20,
        "predicted": 1602,
        "measured": 1609
      },
      {
        "minute": 25,
        "predicted": 1557,
        "measured": 1550
      },
      {
        "minute": 30,
        "predicted": 1469,
        "measured": 1469
      },
      {
        "minute": 35,
        "predicted": 1406,
        "measured": 1411
      },
      {
        "minute": 40,
        "predicted": 1369,
        "measured": 1375
      },
      {
        "minute": 45,
        "predicted": 1348,
        "measured": 1354
      },
      {
        "minute": 50,
        "predicted": 1337,
        "measured": 1341
      },
      {
        "minute": 55,
        "predicted": 1331,
        "measured": 1334
      },
      {
        "minute": 60,
        "predicted": 1328,
        "measured": 1330
      }
    ],
    "bestCombinations": [
      {
        "variables": {
          "gRest": 0.3,
          "Qe": 1.0000200000000001,
          "eta": 0.3,
          "lag": 3.33,
          "Qe_full": 1,
          "tau_scrubber": 3.33,
          "Q_full": 3.3,
          "C_CRITICAL": 4000,
          "C_ELEVATED": 3500,
          "speed_min": 40,
          "V": 27.370875447988517,
          "Vh": 422.8458459302782,
          "L": 0.09836260929703709,
          "g": 0.40714314194768664
        },
        "score": 4.6
      },
      {
        "variables": {
          "gRest": 0.3,
          "Qe": 1.0000200000000001,
          "eta": 0.3,
          "lag": 3.33,
          "Qe_full": 1,
          "tau_scrubber": 3.33,
          "Q_full": 3.3,
          "C_CRITICAL": 4000,
          "C_ELEVATED": 3500,
          "speed_min": 40,
          "V": 29.848677139729272,
          "Vh": 385.88046689983446,
          "L": 0.09667302640154955,
          "g": 0.40263092528562994
        },
        "score": 5
      },
      {
        "variables": {
          "gRest": 0.3,
          "Qe": 1.0000200000000001,
          "eta": 0.3,
          "lag": 3.33,
          "Qe_full": 1,
          "tau_scrubber": 3.33,
          "Q_full": 3.3,
          "C_CRITICAL": 4000,
          "C_ELEVATED": 3500,
          "speed_min": 40,
          "V": 29.620028257370002,
          "Vh": 420.60411304235447,
          "L": 0.09256630063056942,
          "g": 0.41155216997861865
        },
        "score": 5.5
      },
      {
        "variables": {
          "gRest": 0.3,
          "Qe": 1.0000200000000001,
          "eta": 0.3,
          "lag": 3.33,
          "Qe_full": 1,
          "tau_scrubber": 3.33,
          "Q_full": 3.3,
          "C_CRITICAL": 4000,
          "C_ELEVATED": 3500,
          "speed_min": 40,
          "V": 31.009704589843768,
          "Vh": 386.98356628417963,
          "L": 0.11382720947265622,
          "g": 0.4050828704833984
        },
        "score": 6.1
      },
      {
        "variables": {
          "gRest": 0.3,
          "Qe": 1.0000200000000001,
          "eta": 0.3,
          "lag": 3.33,
          "Qe_full": 1,
          "tau_scrubber": 3.33,
          "Q_full": 3.3,
          "C_CRITICAL": 4000,
          "C_ELEVATED": 3500,
          "speed_min": 40,
          "V": 25.28880882263185,
          "Vh": 362.2352099418638,
          "L": 0.09612809181213375,
          "g": 0.41339421987533564
        },
        "score": 7
      }
    ],
    "runs": 41
  }
}
```

</details>

### Model call: claude-haiku-4-5-20251001, 3,220 in / 465 out, 5564 ms

**Response, raw**

```text
I'll evaluate the first candidate using the reference graph "habitat" from the library, instantiating it with the observed persons and fitting the unknown variables within their documented bounds.

[tool_use graph__evaluate]
{
  "graph": "habitat",
  "label": "Reference habitat graph: Lab and Hab-B volumes, crew by activity, scrubber and ventilation",
  "persons": [
    {
      "module": "habB",
      "activity": "rest",
      "callsign": "CDR"
    },
    {
      "module": "habB",
      "activity": "rest",
      "callsign": "FE-3"
    },
    {
      "module": "lab",
      "activity": "light_work",
      "callsign": "FE-1"
    },
    {
      "module": "lab",
      "activity": "light_work",
      "callsign": "FE-2"
    }
  ],
  "variables": {
    "Qe_full": 1,
    "tau_scrubber": 3.33,
    "eta": 0.3,
    "Q_full": 3.3,
    "C_CRITICAL": 4000,
    "C_ELEVATED": 3500,
    "speed_min": 40,
    "gRest": 0.3
  },
  "fit": {
    "V": {
      "min": 10,
      "max": 200
    },
    "Vh": {
      "min": 50,
      "max": 1000
    },
    "L": {
      "min": 0,
      "max": 0.2
    },
    "g": {
      "min": 0.26,
      "max": 0.45
    }
  },
  "maxRuns": 40
}

[stop_reason tool_use]
```

## Step 7: task.done (fallback) -> completed

- node: phase build; last capability before: graph.evaluate; 5359 ms
- rationale: I'll hand over the candidate that holds the threshold.
- evaluation: success, reward 1: contract held on topic graph: graph candidate-1.spikypanda

**Input of task.done**

```json
{
  "summary": "Built and calibrated the twin graph for CO2 concentration in Lab. The reference habitat graph (Lab and Hab-B volumes, crew by activity, scrubber and ventilation) was instantiated from the library and fitted on the telemetry. Candidate 1 holds the residual threshold of 10 ppm: co2_lab_ppm RMSE 4.6 ppm (worst 8 ppm at minute 24), co2_habb_ppm RMSE 2.8 ppm (worst 5 ppm at minute 50). The twin's fitted variables are V=27.37 m³ (Lab), Vh=422.8 m³ (Hab-B), L=0.09836 kg (inter-module leakage), g=0.4071 L/min (crew CO2 production). Calibration passed on this telemetry profile (60 minutes, scrubber speed steps 40%→100%→40%). Validation on alternative profiles (different hatch states, occupancy levels, or activity patterns) was not performed; the twin is calibrated but not yet validated against independent data.",
  "artifacts": [
    {
      "kind": "graph",
      "path": "candidate-1.spikypanda"
    }
  ]
}
```

**Output of task.done (ok)**

```json
{
  "outcome": "completed",
  "value": {
    "claimed": 1
  }
}
```

### Model call: claude-haiku-4-5-20251001, 3,981 in / 352 out, 5318 ms

**Response, raw**

```text
I'll hand over the candidate that holds the threshold.

[tool_use task__done]
{
  "summary": "Built and calibrated the twin graph for CO2 concentration in Lab. The reference habitat graph (Lab and Hab-B volumes, crew by activity, scrubber and ventilation) was instantiated from the library and fitted on the telemetry. Candidate 1 holds the residual threshold of 10 ppm: co2_lab_ppm RMSE 4.6 ppm (worst 8 ppm at minute 24), co2_habb_ppm RMSE 2.8 ppm (worst 5 ppm at minute 50). The twin's fitted variables are V=27.37 m³ (Lab), Vh=422.8 m³ (Hab-B), L=0.09836 kg (inter-module leakage), g=0.4071 L/min (crew CO2 production). Calibration passed on this telemetry profile (60 minutes, scrubber speed steps 40%→100%→40%). Validation on alternative profiles (different hatch states, occupancy levels, or activity patterns) was not performed; the twin is calibrated but not yet validated against independent data.",
  "artifacts": [
    {
      "kind": "graph",
      "path": "candidate-1.spikypanda"
    }
  ]
}

[stop_reason tool_use]
```

