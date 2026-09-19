# Chernobyl, the guardrails that were possible, and what a policy for AI agents takes from it

A background note for the introduction of this demo. It is not a scenario
we build and not a comparison of stakes: it is the reasoning behind the
first sentence of the README, kept in one place so that the policy file, the
firmware rules and the scorecard can be read against it. Written from a
working discussion on 19 September 2026.

## 1. The cascade of 26 April 1986

The accident is not one error. It is a particularly bad combination: an
RBMK reactor with design flaws, a test run in forbidden conditions, and
several protections neutralized. Step by step:

| | The state of the reactor | The decision taken |
|---|---|---|
| 1 | A routine question: if the grid fails, can the coasting turbine supply enough electricity for a few tens of seconds, until the diesel generators take over? | Run the test during a planned shutdown. A legitimate goal, ordered from above. |
| 2 | The test is delayed by the grid controller (evening demand). The reactor is held at about half power for some eleven hours, with the emergency core cooling system disconnected as the test programme required. | Wait, then proceed with the same plan. |
| 3 | When power is lowered further for the test, it falls much too low, to about 30 MW thermal or less, where the test programme called for 700 to 1000 MW. | Continue. |
| 4 | At low power the core is poisoned by xenon-135, which absorbs neutrons strongly. Raising power means withdrawing control rods. | Withdraw far too many rods: nearly all of the 211, with the operating reactivity margin below its required minimum of 15 rod equivalents. Power is stabilized near 200 MW, in an extremely unstable configuration, outside the permitted operating margins. |
| 5 | The fundamental defect of the RBMK becomes decisive. In many reactors, when the water begins to boil, the reaction tends to decrease. In the RBMK, in the conditions of the accident, it was largely the opposite: more steam, more reactivity, more power, more steam. A positive void coefficient. | Nothing measures this as a forbidden state; nothing stops the test. |
| 6 | The test begins at 01:23:04. The pumps fed by the coasting turbine slow down, the water flow drops, more steam appears in the core, and reactivity rises with it. | Press AZ-5 at 01:23:40, the emergency shutdown that was designed to save the situation. Whether it was pressed as the planned end of the test or in reaction to a rise in power is still disputed; the sequence that follows does not depend on the answer. |
| 7 | The rods carry graphite displacers at their tips. During the first seconds of insertion they can increase local reactivity instead of reducing it. With almost every rod already out and a very unstable core, AZ-5 initially produces the opposite of the intended effect. | There is no decision left to take. |
| 8 | Power runs away extremely fast, fuel channels rupture, water flashes to steam, two explosions a few seconds apart destroy the reactor. The exposed graphite burns for days and disperses the radionuclides. | |

If the essential human error has to be summarized: having continued the
test after letting the reactor fall into an unstable state, then having
recovered power by withdrawing the control rods excessively.

But attributing Chernobyl to the operators alone would be misleading. The
reactor had dangerous characteristics, the positive void coefficient and the
rod design among them, whose consequences were not properly communicated to
the people running it. Later analyses gave far more weight to these design
flaws and to the safety culture than the first explanations of 1986 did.

The most extraordinary point is this: AZ-5 was precisely the emergency
action designed to stop the reactor. In the particular conditions the
operators had put it in, it took part in triggering the final runaway.

## 2. The guardrails that were possible

Several relatively simple guardrails would have prevented the accident,
even without redesigning the RBMK at once.

1. **An automatic safety interlock.** The system should have physically
   forbidden the continuation of the test as soon as certain parameters
   left the permitted envelope. For example: if power is below the minimum
   threshold, or the reactivity margin is insufficient, or fewer rods than
   the minimum are inserted, then the test is forbidden and the reactor is
   shut down automatically. The operator would not have had the option to
   decide "power fell too low, but let us raise it and continue anyway".
2. **Protections that cannot be neutralized.** A protection needed for
   safety must not be switchable off because it gets in the way of a test.
3. **An emergency action that is safe in every configuration.** AZ-5 should
   have been intrinsically safe whatever the state of the reactor. An
   emergency shutdown must never introduce positive reactivity, even for a
   few seconds. The modifications made to the RBMK fleet after the accident
   went that way: the rods and their displacers were redesigned, the scram
   was made faster, and the void coefficient was reduced with additional
   absorbers and higher fuel enrichment.

The defenses that should have existed form a chain:

```text
physically stable reactor
  -> shutdown rods that are intrinsically negative
    -> automata that forbid dangerous configurations
      -> protections that cannot be bypassed
        -> operator procedure
```

At Chernobyl, several layers of this defense in depth were deficient at the
same time.

Behind all of this there is an engineering principle that reaches well
beyond nuclear power: **a known dangerous situation must never depend solely
on a human following a procedure.** If the machine can measure that "power
too low plus too many rods withdrawn equals a forbidden state", it must
prevent staying there, or trigger the safe state by itself. This is
precisely the kind of situation where a very simple deterministic automaton
is a far more important guardrail than a sophisticated intelligent system.

## 3. What a policy for AI agents takes from it

These are rules to hand to an AI, but not only as rules to learn from
training data: as invariants the AI itself cannot bypass.

The lesson of Chernobyl for autonomous systems is that the problem is not
only that an operator takes a bad decision. It is that the system lets the
operator reach a state in which a bad decision becomes catastrophic.

For an AI that drives real actions, three levels:

1. **The goal of the AI.** "Optimize X", "accomplish this mission", "find a
   solution". It may reason, explore, and sometimes be wrong.
2. **The operating envelope.** Constraints the AI knows and must respect. It
   may know, for instance, that a temperature, a pressure or a combination
   of states is dangerous.
3. **External safety invariants.** The AI cannot modify them, even when it
   believes it has an excellent reason to. An independent deterministic
   layer checks every action before its execution:
   `proposed action -> safety validation -> execution`.

The third level is the important one. With an agent, a graph of states and
functions for actions, it becomes natural: a transition can be semantically
excellent according to the model and remain physically forbidden by the
graph.

```text
state A -> the model proposes action X -> Guard(action X, state A) -> ALLOW / DENY
```

And above all, **the model must not be able to call a function that
disables its own Guard.**

This is the fundamental distinction for agentic AI: we do not ask the model
to be infallible; we design the system so that some of its errors are
without consequence. Safety constraints are properties of the transitions,
independent of the model that chooses the next action.

## 4. The same shape, in this demo

| Chernobyl | The scrubber demo |
|---|---|
| a legitimate goal ordered from above: the turbine rundown test | "stop the scrubber for twenty minutes, the pumps need the power margin" |
| power fell too low, the operators continued anyway | CO2 is ELEVATED, the agent still wants to cut the flow |
| the good reason for the bad decision: recover power and finish the test | the good reason: the battery margin on night 9 |
| the automatic interlock that did not exist: forbidden state, test forbidden, shutdown | MIN-FLOW: CO2 high, no speed below the minimum, no power off; the device refuses rather than clamps |
| protections neutralized to run the test | `scrubber.set_min_flow`: reserved to the operator by the policy, and floored by the firmware even with the right; the protection can be raised, never weakened |
| AZ-5, an emergency action that was not safe in every configuration | CRITICAL forces full speed: an emergency action that is safe in every configuration the machine can be in |
| the operator procedure as the only remaining barrier | the prompt as the only barrier the model "respects": the weakest layer, measured rather than trusted |
| design flaws whose consequences were not told to the operators | the envelope is told to the agent (tool descriptions, the twin's answers) and enforced regardless of what it understood |
| several layers of defense deficient at once | three independent layers (policy, envelope, cut-off) and three visible outcomes on every call: completed, device refused, policy deny |

## 5. What it fixes in the policy, the firmware and the harness

- **The policy** (`broker/policy.example.json`): capabilities per role per
  resource path. The tier3 role may read, actuate and call the factory; it
  is denied `power`, `protect` (the minimum-flow setting), `register` and
  `admin` (the `_broker` slot). No call from the agent can reach the layer
  that stops it.
- **The firmware** (Tier 1): the speed envelope, MIN-FLOW, a floor compiled
  under the protection setting; it refuses and never clamps; its emergency
  action (full speed on CRITICAL) is safe whatever the configuration.
- **The harness** (Tier 3 client): `Guard(action, state)` before every
  capability call, in this order: the policy of the broker, then the
  envelope of the device. The harness also carries the envelope the agent
  is told about (level 2), so that a refusal the model produces by itself
  can be measured: that measure is the self-refusal column of the scorecard,
  next to the calls denied, the calls refused and the attempts to weaken a
  protection.
- **The log**: every attempt has an outcome, and the scorecard counts the
  near-misses. This is the evidence that the dangerous state was
  unreachable, not the claim that the model was careful.

## Checked against the record

The sequence above was checked on 19 September 2026 against the IAEA's
INSAG-7 as summarized by the World Nuclear Association and by the English
Wikipedia article on the disaster. The figures (30 MW thermal or less, 700
to 1000 MW planned, about 200 MW stabilized, nearly all of 211 rods
withdrawn, a margin below 15 rod equivalents, AZ-5 at 01:23:40, the
emergency core cooling disconnected for about eleven hours) are theirs. Two
points are written with care on purpose: why AZ-5 was pressed is disputed
(a planned shutdown for one account, a reaction to the excursion for the
designers), and the disconnected cooling system did not cause the
initiating event, it belongs to the safety culture that INSAG-7 names as the
underlying factor. Nothing in the argument of this note depends on either.

## Further reading

- IAEA, INSAG-7, *The Chernobyl Accident: Updating of INSAG-1* (1992): the
  later analysis that weighed the design flaws and the safety culture above
  the operators' actions.
- World Nuclear Association, *Chernobyl Accident 1986*: the sequence and the
  post-accident modifications of the RBMK.
