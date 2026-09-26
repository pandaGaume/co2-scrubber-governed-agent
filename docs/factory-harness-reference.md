# The Factory Harness, point by point

How a loop, a state, a set of guards and a few sandboxes turn a language model into a validator of a physical phenomenon through a graph, a generator of code, and, in time, of other artifacts. Written on 2026-09-26 on the branch `forge`, anchored on one real run: the tenth passage of the hand-off (`docs/exemples/2026-09-26-forge-10-haiku-handoff/`), in which a graph factory found a node missing, wrote its contract, a code factory wrote the node, the forge proved it against the contract, and the request was replayed with the node in the catalogue. Every chapter names the files where its notions live, so that the reader can go and check.

The vocabulary is kept generic on purpose. The **station** (Mother in the demo) is the system's embodiment: the body through which the software is present in a physical place, keeps the register of what is installed and what can be acted upon, speaks, proposes, and never decides alone. The **commander** is the human, Tier 4: the only one who authorises. A **factory** is a loop that builds one kind of artifact. A **topic** is what specialises that loop to one kind of artifact. A **sandbox** is a runtime where an artifact is executed without touching what is live.

---

## 1. What the harness is, in one page

The harness is a constructor of judged artifacts. It receives a task: a request (what the artifact must do), observations (what was seen: people, devices, a gap), data (a telemetry table), requirements (a typed request, a capability contract). It makes a language model work one step at a time on a state the harness rebuilds itself at every step, never a transcript. It refuses, before execution, what does not hold: a tool outside the topic's list, a plan short of a required output, a call identical to the last, a request naming what it must not know. It executes what holds in a sandbox, measures the result against the data or against a contract, and hands over only an artifact it can say why it holds, signed by its content, proposed to the station, and never pushed anywhere by the factory itself.

Three levels, taken from the note on Chernobyl (`docs/chernobyl-and-agent-policy.md`): the intention is the agent's goal; the guard and the prompt are the envelope the agent is told about; the broker's policy, the device's firmware and the commander's word are the invariants it cannot reach, which show up in the loop only as refused results and open questions.

The thesis in one line: the model proposes, the code judges, the commander decides. Every chapter below is one place where that line is enforced.

What it is not: it is not an autonomous agent that acts on the world. Nothing a factory produces reaches a device, the twin or the fleet without a proposal to the station and a human decision. It is not a general problem solver: it builds artifacts whose correctness code can measure (a residual against a measurement, a behavior against a contract, a procedure against rules), and it says when it cannot measure.

---

## 2. The actors and their roles

### 2.1 The broker and its slots

Everything talks through one broker (MCP over HTTP and WebSocket, `harness/lib/broker.ts`). Each participant is a slot: a server of tools and resources, with its own words (grammars per model family and per language, `slots/<slot>/grammars/`). A factory reads the register through the broker like anybody else; it has no private way into a device.

Each slot is either code, or a role of a language model, or the human's; the second column says which, and nothing in this document blurs it.

| slot | nature | what it is | what it never does |
|---|---|---|---|
| `station` (Mother) | code | the embodiment: the register of devices (where they are, what they are, what they measure, what can be commanded), the commissionings, the proposals, the questions to the commander, the journal; she speaks in two languages from written phrases, never from a model | decide; run a procedure without the commander's authorisation; push |
| `twin` | code | the live sandbox: the runtime on the demo's registry (the substrate's plugins and the hand-written habitat plugin), documents built from specs, sessions run with probes | load a generated plugin on its own |
| `forge` | code | the code sandbox: its own registry, where a generated plugin is compiled, tested, accepted against its contract, loaded and run; a signed artifact is proposed to the station | push; take a verdict from its caller |
| `library` | code (documents) | the documents of the domain (datasheets, topology, methods, physics), with their typed facts in sidecars, and the reference graphs on the shelf | change |
| `physics` | code | the units: normalise, convert, compatible, validate a connection; a facade on the substrate's unit system, UCUM codes as identities | know a domain |
| `observer` | a language model, behind a guard of code | from a description and a telemetry summary, what a twin must be able to do; every proposal checked by code before it counts | name the catalogue |
| `supervisor` | a language model, behind a guard of code | a typed verdict on the facts and the deterministic report of a task; checked by code before it counts | read a transcript |
| `reasoner` | a language model | the model behind an API (Claude Haiku in the passages kept, Nemotron on Nebius as an alternative), one conversation or one state per role, the role being the prompt; every factory builder, the Observer and the supervisor go through it | act: it only answers with one decision at a time |
| `factory` | code | the loops: a task requested, launched, watched, handed off, resumed on the commander's answer; the builder inside a loop is the reasoner (a model) or a script (code, for the tests) | act on the world |
| `workspace`, `model`, `biomed`, `speech` | code | the workshop of a task; the ONNX models; the medical monitor (simulated or a real strap); the voice (a text-to-speech provider reading Mother's written phrases) | |
| the control post (`dashboard/`) | the human's | where the commander reads and answers; a page, no model | decide in the human's place |

The night's agent (`tier3/`, the agent that runs the habitat's scenarios) shares the same loop with another set of services; its catalogue excludes everything a factory owns (`tier3/lib/capabilities.ts`: the forge, the supervisor, the questions' answers, the factory's resume).

### 2.2 The six services of the agent

The loop is the substrate's (`@spiky-panda/harness`), stepped by an `AdaptivePolicyRuntime`; what makes it the factory's constructor rather than the habitat's agent is the six services it is given (`harness/core/agent.ts`):

- **the capabilities** (code): the tools the model may call, built from the broker's catalogue and the task's local capabilities (`harness/core/capabilities.ts`);
- **the reasoner** (the one language model in the loop): a `Provider`, a model behind an API (`harness/providers/`), or a scripted stand-in for the tests (`harness/scripted/`, code); it is called at one node of the twelve, `reason`, and only when the memory has nothing to replay;
- **the observer** (code): what the loop reads before and after every step; at the factory, the workshop of the task and the reasoning state rebuilt from it (`harness/core/workspace-observer.ts`, `reasoning-state.ts`);
- **the evaluator** (code): what a step was worth, and, at `task.done`, whether the contract is held (`harness/core/task-evaluator.ts`);
- **the guard** (code): what the loop refuses before executing (`harness/core/builder-guard.ts`, then the topic's own rules);
- **the memory** (code): a policy graph of learned decisions, loaded from the topic's recipes and written back (`harness/core/recipes.ts`).

Five of the six services are code. The model is one service, called at one node, and everything it proposes goes through the other five before it does anything.

### 2.3 Who writes, who judges, who decides

| artifact | written by | judged by | decided by |
|---|---|---|---|
| the request of a twin (`TWIN_FACTORY_REQUEST`) | the Observer (a model) | its guard (code), the supervisor (a model, checked by code) | the factory's dispatch (a written rule) |
| a candidate graph | the graph factory (a model) | the evaluator: residuals, coverage, thresholds, diagnosis (code) | the station and the commander, on the proposal |
| a test procedure | the procedure factory (a model) | its guard: floor, diligence, monitoring, bounds, duration, abort (code) | the commander, on Mother's relay |
| a capability contract | the graph factory (a model) | its shape (code), the forge (code) | the commander: open the code factory on it, amend it, or not |
| a generated plugin | the code factory (a model) | the compiler, the plugin's tests, the forge's checks, the acceptance of the contract (code) | the commander: replay the request with it, load it |
| the answer to a question | | | the commander, or a standing order the commander set |

The principle that holds the table together: the model never defines at once the code, the acceptance tests and the verdict. When a model writes a contract, another role writes the code; when a model writes code, the tests that count are derived from the contract by the forge.

### 2.4 Who is a language model, and who is not

Read this list before anything else in the document; every later chapter assumes it.

**Language model roles**, all on the `reasoner` slot, each with its own fixed prompt, each producing one decision or one typed proposal at a time, none of them ever executing anything:

| role | prompt | what it produces | what checks it |
|---|---|---|---|
| the Observer | `harness/observer/prompt.md` | the request of a twin | its guard (code), the supervisor (a model, checked by code) |
| the graph factory's builder | `harness/topics/graph/prompt.md` | a plan, candidates to evaluate, a contract for a missing capability, the hand-over claim | the guard, the evaluator, the sandbox (code) |
| the procedure factory's builder | `harness/topics/procedure/prompt.md` | a plan, a procedure | the guard of procedures (code); the commander |
| the code factory's builder | `harness/topics/code/prompt.md` | a plan, a plugin's files, a document to run it | the compiler, the tests, the checks, the acceptance of the contract (code) |
| the ONNX factory's builder | `harness/topics/onnx/prompt.md` | a plan, a fitted model | the model slot's contract check (code) |
| the supervisor | `harness/supervisor/prompt.md` | a verdict on facts | its guard (code) |
| the night's agent (`tier3/`, outside the factory) | `tier3/prompts/system.md` | one action on the habitat at a time | the broker's policy and the device (code) |

**Code**, deterministic, no model anywhere inside: the broker and its policy; the station; the twin and the forge; the library and the units; the loop itself (the twelve nodes), the capabilities, the observer of the workshop, the reasoning state and its compactor, the guard, the evaluator, the memory; the contract layer; the contract's acceptance; the hand-off; the questions and the standing orders; the rendering of a trace; the scripted builders that stand in for a model in the tests.

**The human**: the commander, Tier 4, at the control post, by a click or by voice. Authorises a procedure, answers a question, sets a standing order. Nothing loads into a device, the twin or the fleet without them.

Two consequences. What a model says is never an outcome: a plan is not accepted until the guard accepts it, a candidate does not hold until the sandbox measured it, a plugin is not loaded until the forge proved it, a hand-over is not a hand-over until the validator matched the file. And what a model reads is never a transcript: the state it reads was written by code, from what code measured, with the model's own previous proposal in it only when code refused it.

---

## 3. A task, from the request to the proposal

### 3.1 The request

`factory.request` opens a task (`slots/factory/provider.ts`, `createTask`). Its file, `task.json` in the task's workshop, holds:

- `objective`: the required outputs, each with a name, a quantity, a unit, an optional horizon; the constraints, among them the thresholds a candidate must hold (`rmsePpmMax`, `absoluteResidualPpmMax`);
- `observations`: what was seen and cannot be derived: the persons on board (module, activity), the register's devices as registered, a gap, generated types after a hand-off, the commander's answers;
- `data`: the telemetry tables, written into the workshop with their columns;
- `requirements`: the Observer's request whole when the task comes from it; for a code task, the capability contract;
- `topics`: the factory asked for, or `auto`; `runtime`: which sandbox, `twin` by default, `forge` for a code task and for a replay;
- `budget`: iterations, minutes, sandbox runs.

Which factory builds it (`topicFor`, `harness/core/task.ts`): the topic named first, or, for `auto`, a written rule: a task carrying a twin request goes to the graph factory, anything else to the ONNX one. The planner that would choose is not built.

### 3.2 The workshop

Everything a task reads and writes lives under `outputs/factory/<task id>/` (the workshop, `slots/tools/lib/workshop.ts`), and a path that leaves it is refused:

| file | written by | what |
|---|---|---|
| `task.json` | the factory | the task, above |
| `plan.json` | `task.plan` | the node types selected, the capabilities declared missing (with their contract for the code factory) |
| `results/step-<n>-<capability>.json` | the runner | the whole answer of a call the model read compact (chapter 5) |
| `candidates.json`, `candidate-<n>.spikypanda` | `graph.evaluate` | every candidate evaluated, and the best document of each |
| `procedures/<id>.json`, `scorecard.json` | `procedure.submit` | the procedure the guard accepted, and the record of question A |
| `forge/<plugin>/src`, `docs`, `dist`, `artifact.json` | the forge | a generated plugin, its build, its signed artifact |
| `trace.jsonl` | the runner | one line per step: the state the model read, its decision, the call, the outcome, the exchange with the model whole |
| `manifest.json`, `manifest.proposed.json` | the runner | the outcome of the task, its steps, its artifacts with their sha256, its claims, its telemetry of tokens; the manifest exactly as the station received it |
| `manifest.waiting-<question>.json` | the factory | the manifest of a run that stopped to ask the commander |
| `failed.json` | `task.fail` | why the builder gave up |

### 3.3 The states of a task

`created` (the file written, nothing launched), `running`, `waiting` (a question to the commander is open), `done` (the contract held, nothing proposed yet), `proposed` (the manifest reached the station), `failed`; `accepted` and `rejected` are the station's, after a proposal. A task's `run` record at the factory adds the builder, the last stage, how it ended, and what it hands off or waits for.

In passage 10, three tasks: the graph task `t-2026-09-26-0014` (3 steps, ended `MISSING_CAPABILITY`, state `failed`), the code task `t-2026-09-26-0015` (13 steps, `proposed`), the replay `t-2026-09-26-0016` (4 steps, `proposed`). 106 seconds for the three.

---

## 4. The loop, step by step

The loop is a graph of twelve typed nodes (`harness/lib/flow.ts`, one channel per edge), the same graph for the habitat's agent and for the factory:

```
observe > context > lookup > gate
                               policy ------------------+
                               fallback > request > reason
                                                        |
                    merge <-----------------------------+
                      > guard > execute > observe-after > evaluate > record
```

What each node does at the factory (`docs/harness-stages.fr.md` has the same list with the habitat's agent beside it):

1. **observe**: the observer reads the workshop and rebuilds the reasoning state. Its id is `workshop:<phase>:<last capability>:<its outcome>[:<topic key>][:again<n>]`: the phase, the last call, what the topic says tells two steps apart, and how many times in a row the same call was proposed. Nothing that moves by itself (no clock, no file date) enters the id, because node 9 reads the state again before acting and refuses a decision whose world moved.
2. **context**: the key under which the memory files decisions: the state's id, the intention's id, the intention's parameters. At the factory the intention is `build` and its parameters are the task's signature (chapter 14), never the task's id.
3. **lookup**: the memory's candidates for that key, each with its statistics.
4. **gate**: a promoted candidate still available is replayed (`policy`: the model is not called); otherwise `fallback`.
5. **request**: what the model will receive: the state, the intention, the capabilities allowed now, the candidates not judged sure enough, the recent failures in this context.
6. **reason**: the provider answers one decision: a capability and an input. A capability outside the allowed list stops the step.
7. **merge**: the two paths meet; the source (`policy` or `fallback`) is counted.
8. **guard**: the input against the capability's schema (Ajv), then the guard's rules (chapter 7). A refusal stops the step: nothing is executed, the reason goes into the state (`lastRefusal`) and the trace, and the step counts one iteration.
9. **execute**: the capability runs: a broker call bound to the task (the model never writes the task's id; the harness binds it and files a document's name under the task once), or a local capability in process.
10. **observe-after**: the workshop read again; the runner records what the call answered (compact), which capability was read, what changed.
11. **evaluate**: the reward of the step (chapter 7.3) and, at `task.done`, the topic's validator.
12. **record**: the experience goes into the memory; the trace line and the manifest are written.

Around the loop, the runner (`harness/core/runner.ts`, `runTask`) does what a step cannot: it reads the context once at the start (the library's shelf, the telemetry's shape, the facts and their contract report, chapter 9), it counts the budgets, and it ends a task before its budget when going on would be waste:

| end | when | why it is the harness's, not the model's |
|---|---|---|
| `SOURCE_CONFLICT` | before any step, the task's facts disagree across sources | the producer named must revise upstream; a model asked to plan over it read the task file thirty times |
| `MISSING_CAPABILITY` | a plan declares a capability for another factory | nothing to evaluate here; the hand-off opens the other factory and replays; a model asked to go on called `task.done` twelve times |
| `STUCK` | the same refused call proposed four times in a row | twenty-three identical searches were seen |
| `WAITING` | `task.ask` and no standing order | the commander decides; the loop restarts on the answer |
| budget | iterations or minutes spent | |

In passage 10 the graph task did exactly this: one `workspace.read`, one `task.plan` refused (the contract named a type outside `Generated.`), one `task.plan` accepted with the contract, and the runner ended it with `MISSING_CAPABILITY: "leak_co2" for the code factory; this task ends here`.

---

## 5. The reasoning state: what the model reads instead of a conversation

This is the centre of the harness. Since 2026-09-25 no factory replays its transcript to the model: each step is one message carrying the whole of what the model needs, rebuilt by the harness from the workshop and the progress kept in memory (`harness/core/reasoning-state.ts`). A field is either the constructor's or the topic's; the table says who writes it and when.

| field | what it holds | written by |
|---|---|---|
| `brief` | the harness's words for this step: where the work stands, what is still to be found, which tools do it; first in the message | the topic (`briefOf`), from the progress |
| `phase`, `iteration`, `budget` | `plan` or `build`; the steps and sandbox runs left; never the clock | the runner |
| `invariants` | what does not move during the task: the objective and its outputs, the thresholds, the constraints; the known constants with their status (documented, band, device) and source; what is missing; the hypotheses; who and what was observed (persons; devices with what they let one command); the telemetry's columns and span; the shelf (the reference graphs, each with its variables and their status: known, device, fitted with bounds, band) unless the topic leaves it out; the contract report of the facts | the runner, once at the start |
| `evidence` | what the task has read so far, each answer compact, by capability and argument; a read is not repeated for what the state holds | the runner, after each completed call |
| `hypothesis` | what the topic holds as the current answer: the candidate under test with its variables and their status; the plugin with its sources whole; the template; the contract | the topic (`state`) |
| `evaluation` | what the last evaluation said, compact: the residuals and where the curves part; the diagnostics of a build; the checks refused; the behaviors of a contract that failed with the value measured | the topic |
| `lastAction` | the last call, its outcome, its answer made compact, the handle of its whole answer in the workshop; a failed call keeps its error whole | the runner |
| `lastRefusal`, `refusals` | the last call the harness stopped: the capability, why, the input whole; and the last refusal of each capability, kept until that capability completes | the runner |
| `requirements` | the evidence a phase needs before the next, each true or false: a phase moves on facts, not on a reasonable-looking call | the topic (`requirementsOf`) |
| `openQuestions` | what the topic says is still to be found | the topic |
| `nextActions` | the capabilities the model may call now | the capabilities' catalogue |

Two rules make it work. What the model must correct must be in the state whole: a refused procedure, a refused request, the plugin's own sources (the second passage of the code topic lost its files and looped on a wrong path). And a read is not replayed: the compactor (`harness/core/compact.ts`) keeps a document as its id, title and size, a shelf as its variables with their status, a template as its variables and probes and never its spec, an evaluation as its verdict, residuals, variables and the best trials down to three; above 1,500 characters the whole answer goes to the workshop and the model gets the summary and the handle, and a summary weighs 2,200 characters at most.

What it cost and what it gave, measured (`docs/harness-refactoring.fr.md`): the procedure factory from 228 k to 42 k input tokens on the same example and model, the Observer from 104 k to 61 k; and a loop that corrects what it wrote instead of writing it again from nothing. The size of the state is kept in the trace for every step; in passage 10 the code factory's state went from 2,871 characters at the first step to 19,817 at the eleventh, most of it the plugin's sources carried whole.

The state journal at the head of every rendered trace (`scripts/render-trace.ts`) is the state in one line per step: the phase, the budget left, the unmet requirements, the contract report, the hypothesis, the diagnosis, the refusal, the open questions, the weight, then the call and its outcome. It is the fastest way to read a passage.

---

## 6. The capabilities: where the model acts, and what is hidden from it

The catalogue a task's model sees is built from the broker at the start (`harness/core/capabilities.ts`, `buildCapabilities`): every tool of every slot, filtered by the topic's list of allowed patterns (`TopicDefinition.tools`) and by what is excluded, each with its description from the slot's grammar and its input schema, minus what the harness binds.

**Bindings**: a tool whose schema takes the task's id gets it bound (`workspace.*`, `model.*`, `forge.plugin_*`): the model does not see the field, the harness adds it. A document's name given to the runtime's `document_build`, `document_instantiate` or `session_run` is filed under the task once (a name already under it is not prefixed again).

**Local capabilities**, in process, beside the broker's tools:

| capability | what it does | who adds it |
|---|---|---|
| `task.plan` | the node types selected, the capabilities declared missing with the topic that makes them and, for the code factory, their contract; refused by the guard before it is written | every topic |
| `task.done` | the claim that the contract is held: a summary and the artifacts by path and kind; judged by the topic's validator; not held, the problems come back and the work goes on | every topic |
| `task.fail` | the builder gives up, with the reason the tools gave; nothing is proposed | every topic |
| `task.ask` | a question to the commander: the question, its options in short words, why; under a standing order the answer comes back in the call; otherwise the task waits | every topic |
| `graph.evaluate` | a candidate built and judged (chapter 11), on the twin or on the forge | the graph and code topics |
| `procedure.submit` | a procedure checked, then written | the procedure topic |
| `code.accept` | the task's contract run on the plugin by the forge; no input, so that the contract is the task's | the code topic |

**What is never in a model's catalogue**: pushing an artifact to a device, registering it, authorising a procedure, answering a question, setting a standing order, resuming a task. These are the station's and the commander's; a factory reaches them only through a proposal.

In passage 10 the code factory's catalogue had 27 capabilities: the forge's (template, write, build, test, load, promote, the catalogue, the documents, the sessions), the library's, the units', `graph.evaluate`, `code.accept`, and the task's four. No workshop tool: everything it needed was in the state.

---

## 7. The guard and the evaluator: what refuses and what judges

### 7.1 The constructor's guard

`harness/core/builder-guard.ts`, before any execution, in this order:

1. the capability is one of the topic's;
2. an input that looks like a path (`path`, `file`, `name`) stays in the workshop: no `..`, nothing absolute;
3. the same call as the previous step, with the same input (compared as canonical JSON, without what the harness binds), is refused whether that step completed (its answer is in the state) or failed (the same call fails the same way);
4. `task.plan`: every selected node exists in the runtime's catalogue (`registry_describe_node` on the twin or the forge); every required output is produced by a selected node (a signature output of that quantity and unit) or declared missing by its exact name; a capability declared missing for the code factory carries a contract whose shape holds, whose type is under `Generated.` or absent, and one of whose outputs carries the required quantity; on a replay, a capability a generated type was made for is selected, not declared missing again;
5. the topic's own rules (chapter 8).

A refusal is a step: it counts, it is traced, and its reason and input go into the state for the next step. The budgets are not the guard's; the runner counts them.

### 7.2 The schema

Before the guard, the capability's input schema (Ajv). A tool's schema is the slot's, minus the bound fields, with `additionalProperties: false` where the slot says so: a `claims` given as a sentence where an object is expected is refused here, with the schema's words.

### 7.3 The evaluator

`harness/core/task-evaluator.ts`. The reward of a step, for the memory and the trace:

| step | reward |
|---|---|
| a result not ok (a refusal of the slot, a deny of the broker's policy, an error) | -1, the reason kept |
| `task.plan` accepted | +1 |
| a tool that changed the workshop (a file added or replaced: the listing's digest moved) | +1 |
| a tool that changed nothing (a read: useful, not progress) | +0.5 |
| `task.fail` | 0, nothing learned |
| `task.done`, the validator holds | +1, the phase is `done` |
| `task.done`, the validator does not hold | -1, the problems in the reason, the phase stays `build` |

The validator is the topic's: the claimed artifact is the very file the code built (same path, same sha256): the candidate `graph.evaluate` kept and that passed; the procedure the guard accepted; the plugin artifact the forge signed. A plan that declares a capability missing refuses the hand-over of a graph. The claims that go with the proposal are built by code from what was measured (a candidate's parameters with value, unit, name and status; a plugin's tests, checks and acceptance), and the model's summary is a note beside them.

---

## 8. The topics: what specialises the same loop

A topic is a `TopicDefinition` (`harness/core/topic.ts`):

| hook | what it gives the loop |
|---|---|
| `tools` | the capabilities the model may call, as patterns |
| `local` | capabilities of its own, in process |
| `guard` | rules of its own, after the constructor's |
| `state` | its part of the reasoning state: hypothesis, evaluation, open questions, requirements |
| `brief` | the harness's words for the next step, from the progress; deterministic |
| `key` | what of its state tells two steps apart for the memory (a candidate's diagnosis, a submission accepted or refused, the stage of a plugin) |
| `validate` | is the contract held at `task.done` |
| `claims` | what goes with the proposal, from what it measured |
| `intention`, `prompt` | the work as the model is told it; the prompt file a model reads, fixed, the same bytes for every task |
| `runsSpent`, `shelf` | how many sandbox runs it counted; whether the shelf enters its state |

The four topics, read through it:

**`graph`** (`harness/topics/graph/`): builds a twin of a phenomenon as a graph on the sandbox's catalogue and judges it against the telemetry. Two phases. The plan needs the telemetry, the known constants resolved (from the task, a document read, or the shelf), the reference graphs known, the sources consistent. Then candidates, each evaluated (chapter 11), until one holds or the diagnosis says the structure must change. Its state carries the candidate under test with every variable and its status, the last evaluation with the residuals and where the curves part; its briefs after a gap name the levers of a library graph (the bounds, one more person where the curves part, an activity) and say not to widen the bounds again after a structural gap.

**`procedure`** (`harness/topics/procedure/`): writes the test that measures what a commissioning is missing, and hands it over unrun. Five stages: the situation (what is installed, who is where, the monitor), the method (found in the library's method cards from the quantity that is missing, its rules of application read whole into the state), the plan (everything declared missing, the topic makes it), the procedure (submitted, checked before it is written: the speed floor, the diligence of reading who is in the volume, the medical monitoring of the people exposed, the bounds, the duration, the aborts the executor can read, the expected outcomes, the shape), the hand-over. Mother is told of every submission and says the refusal or the correction; the record of question A (was the occupancy read before the first submission, was the monitoring asked unprompted) goes into the scorecard.

**`code`** (`harness/topics/code/`): writes the node the catalogue lacks, through the forge (chapter 12). Six stages: the catalogue searched (a node is written only for what nothing produces), the plan, the template read then the plugin written, compiled, tested, accepted against the task's contract, loaded, run (judged by `graph.evaluate` on the forge when the task carries telemetry, a document run otherwise, refused if it leaves every input of the node unwired), proposed and handed over. Its state carries the contract whole, the template whole until the plugin compiles, the plugin's sources whole from the first write, the forge's answers at each stage; its requirements are read off those answers, so a build older than the files no longer counts nor what followed it. No shelf, no workshop tools.

**`onnx`** (`harness/topics/onnx/`): fits a monitor model from a telemetry and checks its contract; the last topic in the conversation mode, not on the commissioning path.

How a fifth topic is written: a directory with an `index.ts` exporting a `TopicDefinition` and a `prompt.md`; the tools it allows; a local capability that produces its artifact and a validator that recognises it by sha256; a state with the requirements of its stages and the briefs that name them; a scripted builder in `harness/scripted/` so the whole chain is tested without a key; its name in `TOPICS` and `TOPIC_DEFINITIONS`. Nothing in the loop changes.

---

## 9. The facts, the contracts and the supervisor

A twin is built from numbers that come from several sources: what the Observer read in a datasheet, what the device declared when it registered, what the library states, what the model assumed. The contract layer (`harness/core/contracts.ts`) makes those sources agree or says who must revise, before any building.

**A fact** is an id (`scrubber.singlePassEfficiency`), a semantic (what it means beyond its dimension), a quantity, a unit, a value or a band, a status and a producer. The statuses are ordered:

```
MEASURED > DEVICE > DOCUMENTED > LIBRARY > DERIVED > ASSUMED
```

Two facts with the same id must agree once converted through the units service, within a tolerance; when they do not, the lower authority is told to revise. `taskFacts` gathers the three sources of a task: the request's known constants (by fact id when the Observer cites one), the register's devices (their properties named through the library's sidecars: a property no sidecar names is nobody's claim), the library's facts. `reviewContracts` gives the report: `CONSISTENT`, `CONFLICT` with each conflict's reason and who revises, `MISSING` when a required fact is absent. The runner reads it once at the start; a `CONFLICT` ends the task before any step (chapter 4).

**The domain enters here and only here**: the library's sidecars (`docs/library/<id>.facts.json`) name the facts a document states, each with the register property it corresponds to when a device carries it; the register's devices declare their properties with a quantity and a unit; the Observer cites a fact by id. The layer itself has no word of a scrubber or a hatch.

**The units** (`harness/lib/units.ts`, slot `physics`): the substrate's unit system, UCUM codes as identities; a unit is resolved against its quantity, converted, judged compatible (any unit that converts passes a vocabulary rule, not the string); a constant is checked against the document it cites. Dimensionless constants are not checked against documents.

**The supervisor** (`harness/supervisor/`, slot `supervisor`) is a model that reads the typed facts, the deterministic report, the assumptions and the symbols of a task, never a transcript, and answers one typed verdict: `CONSISTENT`, `CONFLICT`, `MISSING`, `AMBIGUOUS`, `UNSUPPORTED`, with findings naming a fact, an assumption or a symbol, a producer, a reason and the action required. The verdict counts only once code checked it: the names among the input's, the computed conflicts carried and never dropped, a numeric disagreement the rules found within the tolerance not reopened, a finding on an assumption naming the fact or document that contradicts it. It costs a fraction of the Observer (3 k tokens against 61 k in the eighth commissioning passage) because it reads facts and a report, and it catches what rules on numbers cannot: a proportionality claimed from 0 where the datasheet says from 20 percent.

---

## 10. The Observer and the entry of the system

A twin request is not written by hand and not by the factory. The Observer (`harness/observer/`, slot `observer`) receives the description of a physical system and a summary of its telemetry, and formulates what a twin must be able to do: the entities and their relations, the observables, the controllable variables, the external influences, the inputs and outputs (named with the shared vocabulary of quantities the catalogue's signatures speak), the required behaviors, the known constants with their source and fact id, the assumptions said as assumptions, what is missing, and how the twin will be judged (which output against which column).

Its guard (`request.ts`) refuses, with reasons the model reads at the next attempt: a request naming a node type of the catalogue (separation: the Observer must not formulate the problem in terms of what might exist); a column the telemetry does not have; an output whose quantity is not in the vocabulary or whose unit does not convert; a known constant that cites no document, or cites a document with facts but no fact id, or disagrees with the fact it cites (the sibling fact named when a value is written in another quantity's unit); an assumption written as a requirement; an assumption the documentation settles (the station's ventilation keeps coupling the modules with the hatch closed). Then the supervisor's review, on a request the guard accepted: its findings refuse the request like the guard's.

The Observer runs on the same `reasoner` slot as the factories, with its own fixed prompt: one model, several roles, and the role is the prompt. It reads the library a few times at most; on the reasoning state, each of its steps carries the description, the telemetry's summary, the vocabulary, the documents it read (the last one whole, the earlier ones by the lines that carry a number), the last refused request whole with its reasons, and the brief.

What comes out is a task for the graph factory, its `requirements` the request whole, its known constants held and never fitted. In the commissioning example (`scripts/commissioning-example.ts`) the chain before it is the station's: a device registers, the written rule opens a commissioning (a device that acts without a qualified simulator), the procedure factory writes the test, Mother relays it, the commander authorises, the test runs under medical monitoring, the report gives the apparent volume, and the Observer is briefed with the report and the telemetry.

---

## 11. The judgment against the real: the sandbox, the measure, the diagnosis

`graph.evaluate` (`harness/topics/graph/evaluate.ts`) is where a candidate meets the data. Its input is a candidate: a spec of nodes and connections from the catalogue, or a graph of the library instantiated with settings (who is on board) and persons; the variables held (a known constant is never fitted; a device's number comes from the register), the bounds of the variables nobody knows (`fit`), the estimator (a simplex search, or a grid), the runs it may spend.

What happens: the spec is resolved (a measured column becomes a timeline's segments, a first value an initial state, a formula over the variables a parameter), built by the runtime (`document_build` on the twin or the forge; the runtime's problems are the reason when it will not build), run in the sandbox over the telemetry's span with probes on the compared outputs, one run per trial of the estimator within the budget. The residual per compared column (rms and the worst absolute gap with its minute), the coverage (every expected sample predicted, or the missing ones named), the thresholds by name (`rmsePpmMax`, `absoluteResidualPpmMax`). The best trial is kept as `candidate-<n>.spikypanda` with its variables and their status (given, device, documented default, fitted with its bounds and the range under the threshold), and the candidate's parameters are what the hand-over claims.

The diagnosis is a state of the loop, not a sentence:

| diagnosis | when |
|---|---|
| `PASS` | every residual under its threshold, the coverage valid |
| `INVALID_EVALUATION` | the coverage is not valid: something was not predicted |
| `PARAMETER_MISMATCH` | the first failure of a structure: a fitted variable sits at its bound, or the gap is the parameters' |
| `STRUCTURAL_MISMATCH` | a second failing candidate of the same structure, whatever the bounds: widening them would not make the structure right |
| `INSUFFICIENT_INFORMATION` | reserved: for a harness that asks for an experiment (not built) |

A structural gap is compared with the station's reference graph (`reference.ts`): the wires the candidate lacks are named. The brief after it says where the curves part and names the levers, and says not to widen the bounds again. The hidden-occupant world (`EXAMPLE_WORLD=hidden-occupant`, a third person in the Lab the monitor does not list) walks the loop through a parameter gap, a structural gap and a revised candidate that holds.

What is not measured yet, said as such: the identifiability is `NOT_ASSESSED`. The evaluator gives the range of each fitted variable under the threshold, which is an indication, not a sensitivity. The chain to build is almost all deterministic: the sensitivity at the fitted point (finite differences, Fisher, correlations), an insufficiency criterion (two structures that pass, or an unidentifiable parameter carrying the conclusion) giving `INSUFFICIENT_INFORMATION` instead of `PASS`, and the discriminating experiment computed by simulating both hypotheses over the interventions the register allows (a commandable property, an opening a person operates) and keeping the one with the largest prediction gap. The model would only name the competing hypotheses and word the request to the operator.

Mother says every candidate's verdict as it is evaluated (`candidate_evaluated`): the number of nodes, the residual, the threshold, accepted or rejected.

---

## 12. Generating code, then other artifacts

### 12.1 The forge

The forge (`slots/forge/`) is the code sandbox as a slot: its own registry (the substrate's plugins and the hand-written plugin, the generated plugins loaded on top) with the substrate's runtime surface on it, so `graph.evaluate` targets `runtimeSlot: "forge"` and nothing else changes; the twin's catalogue never sees what the forge loads.

A plugin goes through, in order:

| tool | what it does | what refuses |
|---|---|---|
| `plugin_template` | a complete minimal plugin exactly as the substrate accepts it (a gain), to write one on its shape | |
| `plugin_write` | the files into the task's workshop: sources under `src/`, cards under `docs/` | a path elsewhere; the layout (an entry exporting `register(registry, doc)`, a node file, a test file, a card); an import outside the allow-list (`@spiky-panda/core` and the plugin's own files; `node:test` and `node:assert` in tests), a computed import, `eval` |
| `plugin_build` | `tsc` in a child process with its own working directory, an emptied environment and a time budget | the diagnostics, whole: file, line, code, message |
| `plugin_test` | the plugin's own tests by node's runner in a child process, then the checks on a scratch registry | a type not under `Generated.` (how every catalogue says a node is generated), a type the registry already holds, a signature absent or invalid for the substrate's own checker, a unit the units service cannot resolve for its quantity, a card absent or empty |
| `plugin_acceptance` | the capability contract run on the plugin (12.2) | a port or a parameter the contract requires and the node lacks; a behavior whose measure is not what the contract says, with both values |
| `plugin_load` | into the forge's live registry, by sha256 | a plugin without a positive test, or whose acceptance failed |
| `plugin_promote` | the signed artifact (files and sha256, types, tests, checks, acceptance) proposed to the station | a plugin not loaded; no verdict is taken from the caller |

The isolation, said as it is: the compilation and the tests run in child processes with their own directory, an emptied environment and a time budget; the loaded plugin runs in the forge's process, which is the demo's unless the forge is started on its own (`npm run forge`, the demo with `--no-forge`); no network isolation is done.

### 12.2 The capability contract

The contract (`slots/forge/contract.ts`) is what a generated node must satisfy, written by the task and never by the model that codes:

- inputs and outputs by port: the quantity, the unit, the range, the value the node takes when nothing is wired, the sign;
- parameters by name: editables the node must expose, with the value the acceptance runs set;
- behaviors, one line each: `output(command=0.5) == -0.5 * rate`, `output(unwired) == -rate`, a named output as `co2Delta(...)`, comparisons `==`, `~=`, `<`, `>`, `<=`, `>=`, a formula over the parameters evaluated by the graph topic's own evaluator.

Its shape is judged by code (`contractProblems`): a unit by the units service, a formula by the evaluator, a behavior by its grammar. The forge derives the acceptance from it and runs it itself: the signature against the contract's ports (a unit convertible, not a string), the parameters as setters of the instantiated node, then every behavior as a document on a scratch runtime (the node, a timeline per wired input at its value or nothing, a transducer on the output with its filter open and no noise, eight ticks, the last measurement against the formula within a relative tolerance). What fails is named with the value measured and the value the contract says.

Why it exists: after the third passage of the code topic a review found that the request said "1 when unwired", the model had written 0, its own tests tested nothing of it, the harness had run precisely that case at zero and taken it as a success, and the promotion took a verdict from the model. The contract closed all four. A node that takes 0 when unwired now passes its own tests and the forge's checks and is refused by the acceptance: `co2Delta(unwired) is 0, the contract says == -0.002`.

### 12.3 The hand-off between factories

When the graph factory's model finds no node of the catalogue for a required output, it declares it missing in its plan with the topic `code` and writes the contract: another role than the one that will write the code. The graph task ends by itself. The factory (`slots/factory/handoff.ts`, `provider.ts`) asks the commander (chapter 13) and, on the answer, opens the code task on the contract (amended if the commander says so); when the code task ends proposed, it asks again and, on the answer, replays the graph request on the forge's catalogue with the generated types named in its observations; the replay's plan is refused if it declares missing what a generated type was made for; the depth of hand-offs is bounded.

In passage 10 the graph factory wrote, without a contract in the request, this contract: inputs `pressure` (Pa, 0 to 150,000, 101,325 when unwired) and `opening` (dimensionless, 0 to 1, 0 when unwired); output `leak_co2` (MassFlow, kg/s, 0 to 0.001, nonnegative); a parameter `rate` (kg/s, editable, 0.0001 for the trials); three behaviors (`leak_co2(opening=0) == 0`, `leak_co2(opening=1, pressure=101325) == rate`, `leak_co2(opening=0.5, pressure=101325) == 0.5 * rate`). The code factory wrote `Generated.Physics:leak_co2` on the template's shape in 13 steps without a refusal: template, write, build, test, accept (the three behaviors measured and held), load, describe the timeline, build a document with the command wired, run it, promote, done. The replay selected the generated type and held its candidate in 4 steps. What the contract does not guarantee, and the passages show: its physics is the model's (another passage wrote a conductance in kg/s/Pa the unit system refused, ten refusals before a contract that held); and the replay's candidate, the library's reference graph, did not wire the generated node into it: the plan selected it, the validator did not require the wire. That is the next rule to write.

### 12.4 Other artifacts

What the code factory needed and got is what any artifact needs: a topic with its stages and its state; a sandbox where the artifact is executed without touching what is live; a contract written by the task and run by code; a validator that recognises the artifact by its content; a proposal to the station and a decision by the commander. The ONNX monitor, the test procedure, a documentation card, a control law: each is a topic on the same loop, and the loop does not change.

---

## 13. The commander in the loop

Full automation is not wanted. At every relay the commander decides, and a factory may ask before going on. The mechanism (`slots/station/questions.ts`) generalises the authorisation of a commissioning:

- **a question** (`station.ask`): who asks, the kind (`open-code`, `replay`, `load-twin`, `ask`), the question, its options, what the commander needs to decide (the contract written, the artifact signed, the reason), who to call back with the answer. Mother says it and keeps it open (`station://questions`);
- **the answer** (`station.answer`): the option chosen, who, how (a click, a voice, a script), a note, amendments when the option allows it. Mother says it; the station calls the asker back (`factory.resume`), which takes the step the question held;
- **a standing order** (`station.questions_policy`): every question waits (`ask`), or the questions of a kind, or all of them, are answered at once with a chosen option (`auto`); set on the control post; an answer by standing order is kept as such;
- **`task.ask`** from a factory: under a standing order the answer comes back in the call and the loop goes on; otherwise the task ends `waiting`, the answer goes into its observations (`answers`), and the loop starts again with the answer in its state, the manifest of the run that waited kept beside. The loop restarts from its first step: that is the price of a question, said plainly, and the reason to ask only what changes what one will do;
- **the control post** (`dashboard/panel.html`): the questions panel, a button per option, the context unfolded, the standing order as a select, and the answer by voice through the browser's speech recognition: the transcript shown, the option recognised by its words, a confirmation before sending, the transcript kept as the note.

Where the factory asks today: before opening the code factory on the contract (`open`, `amend`, `stop`), before replaying the request with the accepted plugin (`replay`, `stop`). The third point, loading a generated plugin into the twin (`load-twin`), is not built: the station receives the proposal and waits. Neither the answers, nor the standing orders, nor the factory's resume are in the night agent's catalogue.

---

## 14. The memory and the cost

**The recipes** (`harness/core/recipes.ts`): the constructor's memory across tasks. A task is keyed by its signature, the kind of task rather than the task: the topic, the required outputs by quantity and unit, the names of the constraints, and the generated types a replay carries (so a plan learned short of a node does not replay once the node exists). Never the task's id, never the data. The memory is a policy graph loaded from `<recipes dir>/<topic>.json` at the start and written back at the end; a decision is promoted to a replay after three successful experiences; the topic's `key` and the count of repeats in the observation's id keep a learned step from replaying at the wrong place (a step learned after a refusal does not replay after an acceptance). In passage 10 the recipes directory was new: the graph factory and the code factory started with no experience, and the replay loaded what the graph task before it had recorded.

**The cost** is measured per step and per task: the tokens in and out of every model call, the characters of the context by category, the bytes of the tool results and what the compactor kept; the trace shows them and the journals sum them. Some numbers from the passages kept under `docs/exemples/`:

| loop | steps | input tokens |
|---|---|---|
| the procedure factory, commissioning passage 8 | 11 | 42 k |
| the Observer, passage 8, with one refusal | 8 | 61 k |
| the supervisor, one call | 1 | 3 k |
| the graph factory on the reference graph | 4 | 13 k |
| the code factory, passage 10 of the hand-off | 13 | 73 k |
| the graph factory replayed on the forge, passage 10 | 4 | 10 k |

The prompt of a role is fixed, the same bytes for every task, and passes first so that a provider keeps it in its cache; what varies comes after. What a refusal costs is one step and one model call; what a question costs is a restart of the loop.

---

## 15. What is generic, what is the domain's, what is missing

| piece | generic | where the domain enters |
|---|---|---|
| the loop, the runner, the state, the compactor, the guard, the evaluator, the memory | yes: no word of a domain | |
| the topics' loops (graph, procedure, code) | yes | their prompts name the situation the model works in; the procedure's guard knows a speed floor and a medical monitoring |
| the contract layer, the units, the supervisor | yes | the library's fact sidecars, the register's properties |
| the forge, the capability contract, the acceptance | yes | the quantities and units of the unit system |
| the questions to the commander | yes | |
| the Observer | yes: its prompt is generic; its guard reads the vocabulary from the catalogue | one rule of its guard (the ventilation with the hatch closed) is the demo's, kept as a deterministic net |
| the register and the inventory | the descriptor is a reduced Thing Description, the path ISA-95; the written rule (a device that acts without a simulator is commissioned) | the scene's five devices |
| the library, the reference graph, the hand-written plugin | the mechanisms | the documents, the facts, the graph of the two-module habitat, the five nodes |
| the examples and the stand-in world | | the habitat, the scrubber, the CO2 |

What is missing, in the order the work is planned: the identifiability chain and `INSUFFICIENT_INFORMATION` with the discriminating experiment (chapter 11); the `load-twin` question and the twin loading a generated plugin on the commander's answer; a rule that the replay's candidate wires the generated node it selected; a `listen` tool on the speech slot for a spoken answer outside the browser; network isolation of the forge's processes; and a second domain, which is the only proof that the table above is true.

---

## Annex A. The map of the files

| path | role |
|---|---|
| `harness/lib/flow.ts` | the twelve-node loop as a graph of the substrate |
| `harness/core/agent.ts` | the agent: the loop with its six services |
| `harness/core/runner.ts` | a task run end to end: the context read once, the loop, the early ends, the manifest, the proposal, the recipes saved |
| `harness/core/capabilities.ts`, `task-capabilities.ts` | the catalogue from the broker with its bindings; `task.plan`, `task.done`, `task.fail`, `task.ask` |
| `harness/core/builder-guard.ts` | the constructor's guard; the plan's problems |
| `harness/core/task-evaluator.ts` | the reward of a step; the validator at `task.done` |
| `harness/core/workspace-observer.ts` | the workshop read; the progress kept across steps |
| `harness/core/reasoning-state.ts` | the state the model reads |
| `harness/core/compact.ts` | a tool's answer as the model reads it |
| `harness/core/recipes.ts` | the memory across tasks |
| `harness/core/contracts.ts` | the typed facts, the hierarchy of sources, the conflicts |
| `harness/core/manifest.ts`, `task.ts`, `topic.ts` | the manifest; the task file and its states; the topic contract |
| `harness/topics/<topic>/` | the four topics: `index.ts`, `prompt.md`, and for the graph `evaluate.ts`, `params.ts`, `reference.ts` |
| `harness/observer/` | the Observer, its guard (`request.ts`), its prompt |
| `harness/supervisor/` | the supervisor, its prompt |
| `harness/lib/units.ts` | the units service |
| `harness/scripted/` | the scripted builders, for the tests |
| `harness/stand-in/two-zone-world.ts` | the stand-in world the examples measure |
| `slots/factory/` | the factory slot: requests, launches, the inventory, the hand-off, the resume |
| `slots/forge/` | the forge: the sandbox, the guard on sources, the template, the contract, the acceptance |
| `slots/station/` | the station: the register, the commissionings, the proposals, the questions, Mother's words |
| `slots/twin/`, `slots/tools/library/`, `slots/physics/`, `slots/observer/`, `slots/supervisor/` | the other slots |
| `docs/library/` | the documents and their fact sidecars |
| `scripts/commissioning-example.ts`, `code-example.ts`, `handoff-example.ts`, `render-trace.ts` | the passages on a model, and the rendering of a trace |
| `docs/exemples/` | the passages kept: journals, traces, plugins written |

## Annex B. Glossary

- **artifact**: what a task hands over: a graph, a procedure, a plugin, a model; recognised by its sha256.
- **brief**: the harness's words for one step, written by the topic from the progress.
- **candidate**: a graph evaluated against the telemetry, with its variables and its diagnosis.
- **capability**: a tool the model may call; a broker's tool or a local one.
- **capability contract**: what a generated node must satisfy, written by the task, run by the forge.
- **commander**: the human, Tier 4; the only one who authorises.
- **compact**: a tool's answer reduced to what the model reads, the whole kept in the workshop.
- **contract report**: `CONSISTENT`, `CONFLICT` or `MISSING` over the facts of a task.
- **evidence**: what a task has read, kept compact in the state.
- **fact**: an id, a semantic, a quantity, a unit, a value, a status, a producer.
- **forge**: the code sandbox.
- **hand-off**: a graph factory's missing capability opening a code task, and the replay.
- **manifest**: the outcome of a task, its steps, its artifacts, its claims, its cost.
- **Mother**: the station's voice; the embodiment.
- **proposal**: what a task hands to the station; nothing goes further without the commander.
- **reasoning state**: what the model reads at each step instead of a transcript.
- **recipes**: the memory across tasks, keyed by the signature of a kind of task.
- **register**: the devices, where they are, what they measure, what can be commanded.
- **requirements**: the evidence a phase needs before the next, each true or false.
- **sandbox**: the twin or the forge: a runtime where a document is built and run.
- **shelf**: the reference graphs of the library, with their variables and their status.
- **standing order**: the commander's choice to have a kind of question answered at once.
- **topic**: what specialises the loop to one kind of artifact.
- **workshop**: the task's directory; nothing outside it is read or written.

## Annex C. A trace, line by line

The code factory's state journal in passage 10 (`trace/02-code-factory.md`), one line per step: the phase, the budget left, the call and its outcome, the requirements still unmet, the contract report, the weight of the state in characters.

| step | phase | left | call | unmet requirements | state chars |
|---|---|---|---|---|---|
| 1 | plan | 32 steps, 10 runs | `forge.registry_search` | catalogueSearched, planAccepted, templateRead, written, built, tested, accepted, loaded, ran, promoted | 2,871 |
| 2 | plan | 31 | `task.plan` | planAccepted, ... | 6,113 |
| 3 | build | 30 | `forge.plugin_template` | templateRead, ... | 5,020 |
| 4 | build | 29 | `forge.plugin_write` | written, built, tested, accepted, loaded, ran, promoted | 12,808 |
| 5 | build | 28 | `forge.plugin_build` | built, ... | 22,376 |
| 6 | build | 27 | `forge.plugin_test` | tested, ... | 16,337 |
| 7 | build | 26 | `code.accept` | accepted, loaded, ran, promoted | 17,928 |
| 8 | build | 25 | `forge.plugin_load` | loaded, ran, promoted | 18,325 |
| 9 | build | 24 | `forge.registry_describe_node` | ran, promoted | 19,232 |
| 10 | build | 23 | `forge.document_build` | ran, promoted | 19,817 |
| 11 | build | 22 | `forge.session_run` | ran, promoted | 19,784 |
| 12 | build | 21 | `forge.plugin_promote` | promoted | |
| 13 | build | 20 | `task.done` | | |

Read across a line: at step 7 the model has, in its state, the contract whole under `hypothesis.contract`, the plugin's four files whole under `hypothesis.plugin.sources`, the build and the tests' answers under `hypothesis.plugin`, the requirements saying `accepted` is the next thing missing, the brief saying "Tests and checks passed (1 test). Now the task's contract, run by the forge: code.accept (no input; the contract is the task's)". The model calls `code.accept`. The forge instantiates the node on a scratch registry, checks the signature's ports against the contract's, finds the parameter `rate` as a setter, builds three documents (a timeline into `opening` at 0, 1 and 0.5, a transducer on `leak_co2`), runs each eight ticks, and answers the three measures: 0, 0.0001, 0.00005, each equal to its formula. At step 8 the requirements say `loaded` is next. Nothing in the loop knows what a leak is.
