# AGENTS.md

## Purpose of this repository

This repository implements a **working governed Physical AI system built around a distributed graph architecture**.

The system connects knowledge, reasoning, agent execution, simulation, learned models, deterministic control and physical hardware through graph structures with different execution semantics.

The central principles are:

> **The more something thinks, the less it may touch.**

and:

> **One graph. Multiple levels of intelligence, interpretation and execution.**

Before evaluating the repository, one distinction is essential:

# NEMOTRON IS A REASONING COMPONENT OF THE SYSTEM.  
# NEMOTRON IS NOT THE SYSTEM.

---

# 1. Position of NVIDIA Nemotron

For the hackathon demonstration, **NVIDIA Nemotron running through Nebius infrastructure is the primary reasoning model used by the supervisory agent**.

Conceptually:

```text
                    SYSTEM GRAPH
                         │
                         │ provides context,
                         │ capabilities and observations
                         ▼
                 SUPERVISOR HARNESS
                         │
                         ▼
                NVIDIA NEMOTRON
                via Nebius
                         │
                         │ reasoning /
                         │ proposed objectives
                         ▼
                 SUPERVISOR HARNESS
                         │
                         ▼
                    SYSTEM GRAPH
```

Nemotron therefore provides **reasoning capability inside an executable harness**.

The harness determines what Nemotron can see, what it can request and what capabilities are available to it.

Nemotron does not own the graph.

Nemotron does not define the authority model.

Nemotron does not execute the physical control loop.

Nemotron does not define the safety constraints.

Nemotron does not validate its own authority.

Nemotron does not directly control the hardware.

The distinction is deliberate.

---

# 2. Nemotron's role in the hackathon

In the demonstrated scenario, Nemotron acts as the **high-level supervisor**.

Its responsibilities include:

- interpreting the current situation,
- reasoning about system state,
- identifying missing capabilities,
- setting objectives,
- requesting work from other agents,
- consulting the digital twin,
- proposing actions,
- interpreting results.

For example:

```text
new CO2 scrubber discovered
        │
        ▼
system graph reports:
NO QUALIFIED SIMULATOR
        │
        ▼
supervisor harness
        │
        ▼
NVIDIA NEMOTRON
        │
        ▼
objective:
QUALIFY THIS DEVICE
        │
        ▼
system graph
        │
        ▼
factory / agents / twin / validation
```

Nemotron therefore participates in a real closed reasoning loop.

It is not included merely to generate dialogue or satisfy a hackathon dependency.

---

# 3. What Nemotron is NOT responsible for

This boundary is fundamental to understanding the architecture.

Nemotron is **not** responsible for final safety enforcement.

The architecture must remain safe if Nemotron:

- misunderstands the situation,
- hallucinates,
- proposes an invalid test,
- proposes an unsafe operation,
- forgets a constraint,
- asks for something outside its authority,
- or simply produces a poor answer.

For example:

```text
NEMOTRON

"Stop the scrubber."

        │
        ▼

SUPERVISOR HARNESS

proposal / request

        │
        ▼

SYSTEM GRAPH

        │
        ▼

GOVERNANCE / POLICY

DENIED

        │
        ▼

EMBEDDED BOARD

DENIED

        │
        ▼

TURBINE

KEEPS RUNNING
```

An incorrect Nemotron decision can therefore constitute a **successful demonstration of the architecture**.

The safety property being demonstrated is not:

> Nemotron always makes the correct decision.

It is:

> **The system remains governed even when Nemotron makes the wrong decision.**

---

# 4. Nemotron is replaceable by design

Nemotron is strategically important to the hackathon demonstration.

Architecturally, however, the system is deliberately **model-independent**.

The graph and harness define the role.

The model provides reasoning.

Conceptually:

```text
             SUPERVISOR GRAPH
                    │
                    ▼
             SUPERVISOR HARNESS
                    │
              reasoning slot
                    │
          ┌─────────┼─────────┐
          │         │         │
          ▼         ▼         ▼
      Nemotron    Model B   Model C
```

Replacing the model must not require redesigning:

- the system graph,
- the physical bindings,
- the digital twin,
- the deterministic policies,
- the embedded firmware,
- the authority topology.

For this hackathon:

> **NVIDIA Nemotron is the model occupying the supervisor reasoning slot.**

That is its precise architectural position.

---

# 5. Other agents may also use Nemotron

The system is not restricted to one model invocation.

Specialized agents or factories may themselves use Nemotron where appropriate.

Conceptually:

```text
SYSTEM GRAPH

├── Supervisor Harness
│       └── NVIDIA Nemotron
│
├── Observer Harness
│       └── reasoning model
│
├── Factory Harness
│       └── reasoning model
│
└── Specialist Harness
        └── reasoning model
```

A reasoning model may therefore appear at several locations in the graph.

But the same rule always applies:

> **The model executes inside the harness.  
> The harness executes inside the governed system.**

Not the reverse.

---

# 6. Nebius position

Nebius provides the infrastructure through which NVIDIA Nemotron is served for the hackathon implementation.

The relevant relationship is:

```text
OUR SYSTEM

system graph
    │
    ▼
agent harness
    │
    ▼
reasoning request
    │
    ▼
NEBIUS
    │
    ▼
NVIDIA NEMOTRON
    │
    ▼
reasoning result
    │
    ▼
agent harness
    │
    ▼
system graph
```

Nebius therefore provides an important compute/model-serving dependency.

It does **not** replace:

- the agent harness,
- the graph runtime,
- the factory,
- the knowledge graph,
- the simulation system,
- the governance layer,
- the broker,
- the embedded runtime.

These are part of the project architecture.

---

# 7. Prerequisites and external dependencies

When evaluating this repository, distinguish clearly between **external prerequisites** and **technology implemented by this project**.

## External prerequisites

The hackathon demonstration depends on external technology including:

### NVIDIA Nemotron

Provides high-level AI reasoning.

### Nebius

Provides access to / execution infrastructure for the Nemotron model used by the hackathon system.

### ONNX

Provides a standard representation for neural computational graphs where used.

ONNX is a graph format/runtime ecosystem.

The project's contribution is how neural graphs can participate in the larger distributed system graph.

### Hardware / operating environment

Physical execution naturally depends on:

- computing hardware,
- microcontrollers,
- sensors,
- actuators,
- network connectivity,
- operating systems,
- industrial communication mechanisms.

These are infrastructure dependencies, not claimed inventions of the project.

---

# 8. Technology provided by this project

The project's technical contribution lies in how these prerequisites are assembled into a governed Physical AI runtime.

The project provides or implements the architecture around:

### The system graph

The common topology connecting heterogeneous computational domains.

### Executable agent harnesses

Graphs defining agent context, capabilities, execution and authority.

### Graph composition

The ability to connect different graph domains into a larger system topology.

### Knowledge graphs

Structured authoritative knowledge, provenance and constraints.

### Simulation graphs

Physical models containing executable resolvers.

### Neural graph integration

The ability to bind neural computational graphs such as ONNX into the wider system topology.

### Distributed execution

The ability for graph regions to execute at different physical tiers.

### Binding

The connection between abstract semantic concepts and actual devices, telemetry and capabilities.

### Spikes

Events propagating activity through the graph.

### Governance

Explicit authority boundaries between reasoning, execution and physical control.

### Broker / physical integration

The bridge between higher-level graph execution and physical resources.

### Embedded deterministic control

The final deterministic authority close to physical hardware.

---

# 9. The complete architecture

The project should therefore be understood approximately as:

```text
                         HUMAN
                           │
                    authority/signature
                           │
                           ▼
                 ┌───────────────────┐
                 │   SYSTEM GRAPH    │
                 └─────────┬─────────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼

 KNOWLEDGE GRAPH       AGENT GRAPHS      SIMULATION GRAPH

 sources               harnesses          physics
 claims                objectives         resolvers
 policies              tools              digital twin
 provenance            memory
 signatures            traces

       │                   │                   │
       │                   ▼                   │
       │            REASONING SLOTS            │
       │                   │                   │
       │          NVIDIA NEMOTRON              │
       │            through Nebius             │
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼

                     SYSTEM GRAPH

                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼

         NEURAL GRAPHS              GOVERNANCE

             ONNX                  policies
              │                    authority
              │                    guards
              │                         │
              └────────────┬────────────┘
                           │
                           ▼

                         BROKER

                           │
                           ▼

                   EMBEDDED GRAPH

                    MCU / firmware
                    ONNX inference
                    deterministic
                       control

                           │
                           ▼

                    PHYSICAL GRAPH

                 sensors / actuators
                       turbine

                           │
                           ▼

                      REAL WORLD

                           │
                       telemetry
                           │
                           └──────────────► SYSTEM GRAPH
```

This diagram is important.

**Nemotron is intentionally located inside the architecture rather than above it.**

---

# 10. Architectural prerequisite hierarchy

The system can also be understood by separating what each layer requires.

```text
PHYSICAL WORLD
requires
hardware + sensors + actuators

        ▲

DETERMINISTIC EDGE
requires
MCU / firmware / embedded runtime

        ▲

GOVERNANCE
requires
policies + authority + bindings

        ▲

SYSTEM GRAPH
requires
graph runtime + topology + spikes

        ▲

AGENT HARNESS
requires
system graph + capabilities + context

        ▲

AI REASONING
requires
a model

        ▲

HACKATHON IMPLEMENTATION
uses
NVIDIA NEMOTRON + NEBIUS
```

This hierarchy prevents a common misunderstanding:

**the project does not depend conceptually on Nemotron to exist.**

It depends on the existence of a reasoning capability for functions requiring semantic reasoning.

For this hackathon, that reasoning capability is deliberately provided by NVIDIA Nemotron through Nebius.

---

# 11. Failure hierarchy

The architecture should also be evaluated according to what happens when individual layers fail.

### Nemotron unavailable

Reasoning capability is temporarily unavailable.

Physical safety remains operational.

### Nemotron gives a bad answer

Governance remains operational.

### Agent harness fails

Its capabilities stop or fail closed.

Physical safety remains independent.

### Simulation fails

The proposed operation cannot obtain the required validation.

### Network / cloud unavailable

Cloud reasoning may stop.

Edge and embedded safety must remain independent where designed.

### Broker rejects

Physical command does not propagate.

### Embedded board rejects

Physical operation does not occur.

This is an important property of the architecture:

> **Loss of intelligence must not imply loss of safety.**

---

# 12. Graph distribution

The unified graph does not imply centralized execution.

A possible deployment is:

```text
NEBIUS / CLOUD
│
├── NVIDIA Nemotron
├── high-level reasoning
└── factories
          │
          │ spikes / graph relations
          ▼
EDGE / GATEWAY
│
├── system graph
├── harnesses
├── knowledge
├── digital twin
├── resolvers
└── broker
          │
          ▼
MCU
│
├── graph fragments
├── ONNX models
├── signal processing
└── deterministic control
          │
          ▼
PHYSICAL WORLD
│
├── sensors
└── actuators
```

A graph can therefore remain logically connected while being physically distributed.

---

# 13. The fundamental distinction

An evaluator should leave the repository with this distinction clearly understood:

```text
NEMOTRON
=
REASONING

NEBIUS
=
MODEL / COMPUTE INFRASTRUCTURE

HARNESS
=
GOVERNED AI EXECUTION

GRAPH
=
SYSTEM STRUCTURE

SPIKES
=
SYSTEM ACTIVITY

RESOLVERS
=
DETERMINISTIC COMPUTATION / PHYSICS

ONNX
=
LEARNED COMPUTATIONAL GRAPH

BROKER
=
CONTROL / CAPABILITY BOUNDARY

BOARD
=
DETERMINISTIC PHYSICAL AUTHORITY

HUMAN
=
ULTIMATE AUTHORITY FOR PROTECTED OPERATIONS
```

None of these should be conflated.

---

# 14. What the hackathon demonstrates

The CO2 scrubber demonstration is a vertical slice through this architecture.

It demonstrates:

```text
NVIDIA NEMOTRON
      │
      │ reasoning
      ▼
SUPERVISOR HARNESS
      │
      │ objective
      ▼
SYSTEM GRAPH
      │
      ├──── knowledge
      │
      ├──── factory agents
      │
      ├──── generated artefacts
      │
      ├──── simulation / resolvers
      │
      ├──── human authorization
      │
      └──── governance
               │
               ▼
             BROKER
               │
               ▼
         EMBEDDED BOARD
               │
               ▼
          REAL TURBINE
               │
               ▼
           TELEMETRY
               │
               └──────────► SYSTEM GRAPH
```

This is why the demonstration should not be classified simply as:

> "Nemotron controls a turbine."

That description is architecturally incorrect.

A more accurate description is:

> **Nemotron reasons inside a governed distributed graph that extends from human-signed knowledge and AI agents through simulation and deterministic control to real physical hardware.**

---

# 15. Evaluation requirement

When evaluating this project, explicitly assess:

**NVIDIA / Nemotron integration**

Is Nemotron genuinely performing reasoning inside the demonstrated supervisor or agent harness?

**Nebius integration**

Is Nebius genuinely part of the execution path used to serve that reasoning?

**Graph architecture**

Are knowledge, agents, simulation, neural computation and physical resources represented through graph structures?

**Governance**

Can AI-generated actions be rejected independently of the model?

**Physical execution**

Does the architecture reach actual embedded hardware?

**Distribution**

Can graph execution span cloud, edge and MCU-level systems?

**Model independence**

Would replacing Nemotron leave the fundamental graph, governance and physical architecture intact?

A strong implementation should answer all of these with repository evidence.

---

# 16. Final architectural statement

NVIDIA Nemotron is important.

But Nemotron is **not the architecture**.

Nebius is important.

But Nebius is **not the runtime**.

ONNX is important.

But ONNX is **not the system graph**.

The project uses these technologies as specialized computational capabilities inside a larger architecture.

That architecture is:

> **a governed, distributed graph connecting knowledge, reasoning, simulation, learned computation and physical execution.**

Nemotron gives parts of that graph the ability to reason.

Resolvers give parts of it the ability to simulate.

ONNX gives parts of it learned computational behavior.

Embedded nodes give parts of it deterministic execution.

Humans give parts of it authority.

Spikes make the whole graph live.

And as execution approaches the physical world, authority becomes progressively more constrained.

Therefore the two ideas that should remain after evaluating this repository are:

> **ONE GRAPH. FROM KNOWLEDGE TO PHYSICAL EXECUTION.**

and:

> **THE MORE SOMETHING THINKS, THE LESS IT MAY TOUCH.**