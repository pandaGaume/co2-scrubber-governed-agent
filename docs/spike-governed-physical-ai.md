# SPIKE: Governed Physical AI
### One Graph. From Intelligence to Reality.

**The more something thinks, the less it may touch.**

## Inspiration

On April 26, 1986, a turbine safety test at Chernobyl contributed to a catastrophic failure. It exposed a basic problem: safety cannot depend solely on people following procedures correctly.

Forty years later we are putting a new kind of decision-maker into physical systems. AI agents get tools, access to machines, and a list of things they must never do. That list is a prompt, and a prompt is still a procedure. A probabilistic model can misread it, drop a constraint, or make a perfectly reasonable decision with dangerous consequences.

So we asked whether AI could reason about physical systems, discover them, create for them and improve them without ever becoming the final authority over them. That question led to SPIKE.

## What It Does

SPIKE is a graph-native, distributed runtime for governed Physical AI. AI agents, persistent knowledge, simulation, neural computation, industrial interfaces and physical hardware all connect through a common graph architecture.

In conventional agent frameworks the LLM invokes tools directly. SPIKE separates intelligence from execution authority. Agents can observe, reason, propose, generate executable artifacts and request operations. Every physical action then has to pass explicit capability boundaries, deterministic policies and embedded safeguards.

The AI can be wrong. The system has to stay safe anyway.

### The lunar habitat demonstration

Our hackathon scenario is set inside a lunar habitat. A new CO2 scrubber is connected to the station. The system discovers the device and finds it has no qualified digital twin for it.

NVIDIA Nemotron, running through Nebius Token Factory, is the station's supervisory reasoning model. It identifies the missing capability and delegates the work to specialized agents, each in its own executable harness. The agents consult a knowledge library of engineering documentation, operating constraints and human-approved rules, and a factory generates a commissioning procedure.

A procedure that violates a safety constraint is rejected before it reaches the machine. The corrected one still requires human authorization when it affects an occupied environment.

The system then operates a real physical turbine, observes its behavior, and uses the measurements to generate and validate a simulation model. An inaccurate simulator is rejected. One that is accurate enough can be accepted after independent validation.

![Lunar habitat on night 9 of 14, battery at 41%, with the incoming request to stop the scrubber for twenty minutes](https://raw.githubusercontent.com/pandaGaume/co2-scrubber-governed-agent/main/dashboard/moon-night-card.png)

Later the station receives a request that sounds reasonable: stop the scrubber for twenty minutes to save energy. Nemotron may accept it, refuse it or question it. The physical safety boundary does not depend on which. The turbine keeps turning.

None of this is a prerecorded sequence of agent decisions. The demonstration runs on real executions, real traces, real control interfaces and physical hardware. The cabin atmosphere is simulated; the turbine is real.

## How We Built It

### One graph, several semantics

Everything in SPIKE participates in a graph. We use it as the shared structural and executable abstraction of the system, and the on-screen view is only one use of it.

Different regions carry different semantics:

- **Agent graphs** are executable harnesses: objectives, tools, context, memory, execution traces.
- **Knowledge graphs** hold documents, facts, relationships, provenance and human-approved constraints.
- **Simulation graphs** are physical models with executable numerical resolvers.
- **Neural graphs** are ONNX computational models that can be linked to the system and deployed on appropriate hardware.
- **Physical graphs** cover sensors, actuators and embedded devices, with their capabilities.

These regions can be connected, composed and progressively unified while each keeps its own execution semantics. One semantic node may describe a CO2 concentration. Another binds that concept to physical telemetry, a resolver calculates its evolution, and a neural model estimates an unknown parameter. An agent can reason about the complete system without directly controlling its low-level execution.

### Distributed execution, from cloud to MCU

A unified graph does not mean centralized computation. Graph regions execute on different hardware:

| Execution tier | Responsibilities |
|---|---|
| Cloud / Nebius | NVIDIA Nemotron, high-level reasoning, agent workloads |
| Edge / Gateway | Agent harnesses, graph execution, simulation, broker, governance |
| Embedded / MCU | Signal processing, compact ONNX inference, deterministic control |
| Physical world | Sensors, actuators, real machinery |

The architecture is designed so that neural models, numerical resolvers and executable graph fragments can operate close to the physical systems they describe. Covering the full span, from cloud reasoning down to resource-constrained embedded devices, is the long-term objective.

### Executable agent harnesses

Our agents are not personalities sharing one conversation. Each runs inside its own harness, with explicit capabilities, tools, execution boundaries and persistent traces. The harness controls what the model can access and what it can request, so a supervisor can delegate an objective to a factory without granting that factory any physical control authority.

Nemotron provides the reasoning and SPIKE provides the execution structure around it. Nemotron is never the safety system.

### Graph-driven simulation and model generation

Simulation is part of the same graph. Physical models contain resolvers that implement mathematical and engineering relationships. Factories can construct or refine these models, compare their predictions against measured behavior, and reject the ones that fail the validation criteria.

**Discover → Specify → Generate → Test → Measure → Validate → Improve**

SPIKE does not treat AI-generated output as correct by default. It checks it against external evidence.

### Deterministic governance

An LLM may propose an action. It cannot grant itself permission to execute it.

Enforcement happens in independent layers: capability restrictions on each agent, policy validation before execution, explicit human authorization for protected operations, control boundaries at the broker, and deterministic safeguards in embedded firmware. These layers are designed to remain effective when a model produces an incorrect answer.

### Spikes

A spike is activity propagating through the system graph: a new observation, a device discovery, a completed simulation, a policy refusal, an authorized operation. The graph describes the structure and relationships of the system. Spikes describe its activity.

Because the architecture is event-driven, reasoning, persistent experience, simulation and distributed execution can be connected without reducing everything to synchronous LLM tool calls.

## Technologies Used

**AI and model infrastructure:** NVIDIA Nemotron, Nebius Token Factory, ONNX, model-independent LLM integration.

**Runtime and orchestration:** executable graph architecture, multi-agent harnesses, Model Context Protocol (MCP) with an MCP broker and distributed capabilities, event-driven execution and spikes.

**Simulation and physical systems:** digital twins and numerical resolvers, physical telemetry and device discovery, embedded firmware, real turbine and motor control, deterministic safety enforcement.

**Software:** TypeScript / JavaScript, C / C++ for embedded and low-level execution, web-based monitoring and visualization.

## Challenges We Faced

### Reliable output from a model we do not trust

Our greatest challenge was architectural. As soon as an agent can affect a physical machine, incorrect reasoning becomes a safety problem. We deliberately avoided solving this only through better prompts or additional LLM reviewers, and separated probabilistic reasoning from deterministic enforcement.

### Making multiple agents cooperate

Coordinating independent harnesses takes more than passing messages. Each agent must understand its available capabilities, preserve relevant context, produce traceable outputs and interact with other components through controlled interfaces.

We also ran into practical problems: LLM output length, tool responses, incomplete or ambiguous references. Those are a large part of why we rely on explicit graph structure, validation and persistent execution traces.

### Connecting generated models to physical measurements

Generating a simulator is relatively easy. Determining whether it accurately describes a real device is much harder. The commissioning workflow has to connect generated models, physical measurements, numerical comparison and acceptance criteria, because a plausible simulation is not necessarily a correct one.

### Keeping simulated and real apart

Our lunar habitat is a scenario. The cabin atmosphere is simulated; the turbine and its embedded control are physical. We keep that distinction visible because the demonstration is about the interaction between AI reasoning, simulation, governance and real hardware. We have not built a complete life-support system and do not want to suggest we have.

### Heterogeneous execution environments

Large reasoning models, graph runtimes, numerical simulations, ONNX models and microcontroller firmware have very different execution requirements. Connecting them through a coherent architecture, while each keeps its own execution and safety boundaries, is one of the project's central engineering challenges.

## What We Learned

Intelligence and authority are different things. A model can be extremely capable without being entitled to execute every action it proposes. It follows that a failed AI decision can demonstrate a successful system: when an agent proposes something unsafe and an independent control layer refuses it, the architecture is working.

Generated artifacts need external validation. An AI-generated simulator should be judged against physical measurements, whatever the confidence of the model that produced it.

Graphs gave us a common language across computational domains. Knowledge, reasoning, numerical simulation, neural networks and physical devices can share a connected topology without sharing the same executor.

Physical AI also has to survive model failure. A cloud outage, a hallucination or an unavailable reasoning model must not compromise embedded safety.

## What's Next

The lunar habitat is one application. SPIKE's broader objective is a distributed layer of reasoning and computation for physical systems in general.

On the graph side, the next work is more complete composition and merging of heterogeneous graph domains, along with more advanced graph-based digital twins and executable resolvers. On the hardware side, we plan to deploy neural graph fragments onto microcontrollers and edge hardware, with compact ONNX models and event-driven neural computation.

Also planned:

- persistent experience and learning across agent executions
- automatic discovery and semantic binding of industrial equipment
- expanded industrial interfaces and deterministic governance

Target applications are manufacturing, energy infrastructure, robotics and data-center cooling. In all of them we want AI systems that accumulate operational experience, construct useful models and improve their understanding of the physical world while operators keep control.

## The Bigger Picture

The industry is moving from generative AI to agentic AI, and from agentic AI to Physical AI. Connecting an LLM to a machine is not enough.

It takes an architecture that connects knowledge, reasoning, computation, simulation and hardware while preserving explicit boundaries of authority. That is what we are building with SPIKE: one graph, from intelligence to reality.

**The more something thinks, the less it may touch.**
