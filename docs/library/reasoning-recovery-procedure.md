# Recovery procedure: missing information, blocked work and degraded operation

When the current approach cannot progress, diagnose the missing information or capability, search for relevant evidence, and choose another viable approach. Recovery is a responsibility of the reasoning agent. This document supplies a reasoning procedure and possible alternatives, not a coded workflow that selects a predetermined answer.

## Establish the actual blockage

Read the failed result, relevant state and any available manifest. Distinguish an unknown value from an unavailable service, an unmatched search term, a rejected proposal, exhausted resources, a missing human decision and a device refusal. State what is missing, why the current approach needs it, and what evidence could resolve it.

A simulator or actuator remaining at one operating point does not identify which of these failed. A completed lookup with no matching methods is not a successful experiment. A failed delegated task is an observation to interpret, not a command to repeat that task.

## Seek evidence before transferring the problem to the human

Use the relevant available capabilities: the authoritative library, typed facts, document contents, device descriptors, inventory, live state, earlier execution records and specialist results. Search using appropriate terminology and canonical quantities; examine the origin of a fact and the assumptions of a method. An index query is not an exhaustive reading of the library.

Carry forward what was found and what was explicitly unavailable. A human who says they do not know a quantity has not supplied a new number; asking the same thing again does not repair that gap. A documented bench parameter, a design value, a measured value and an assumption can each be useful, but their status must remain explicit.

## Pivot when further equivalent searches do not change the evidence

Recognise diminishing returns. Do not spend the remaining budget alternating equivalent method queries, rereading unchanged documents or launching copies of the same failing contract. Review whether the quantity, objective, model structure or measurement method was framed correctly. New evidence can justify revisiting an approach; repeating it without a changed premise cannot establish progress.

Identify feasible alternatives and their consequences. Possible categories include:

- Use an applicable documented parameter with its provenance instead of treating it as unknown. If its applicability is uncertain, state that uncertainty and assess sensitivity.
- Estimate fewer parameters, fixing others from justified evidence; or report ranges when the observations do not identify a unique value.
- Choose a different measurement method that uses the available sensors, authorised operations and operating envelope.
- Reduce the model's supported configuration or horizon to the domain actually covered by evidence, instead of claiming the original broad qualification.
- Perform a partial analysis, offline artifact preparation or a clearly labelled simulation when physical measurement or execution is unavailable.
- Ask for a specific missing instrument, service, responsible person, permission or acceptance of reduced scope, rather than asking the human to invent an unknown physical result.
- Stop the affected physical work safely and return an explicit incomplete result if no permissible alternative can meet even a reduced objective.

These categories are options for reasoning. None is selected automatically, and none grants authority to execute an experiment.

## Announce and justify the selected recovery

Explain the failed approach, evidence searched, unresolved dependency, alternative chosen, reduced objective and limitations. State what remains achievable, what is no longer claimed and which human decision is required, if any. Mother's short sentence should say the current pivot or concrete blockage; the detailed report retains the evidence and qualifications.

For example, a useful explanation names an unavailable measurement and the scope still supported by the remaining records. Merely saying "trying another approach" without changing a premise is not a recovery. A successful tool invocation cannot substitute for evidence that the alternative achieved its objective.

## Meaning of degraded mode

Degraded operation means reduced functionality, observability, confidence or qualified operating scope, explicitly reported and accepted where protected decisions require a human. It never means weaker guards, invented measurements, fabricated biometric coverage, unsigned safety limits, approval inferred from conversation, or installation described as complete when it is not.

Keep the original objective and the reduced result distinct. A reference simulator can support preparation while a physical sensor is absent, but it does not validate a newly built twin against real cabin data. A provisional parameter or restricted model remains provisional or restricted in every report and artifact that uses it.

## Conclude or wait honestly

Use a wait only when a named delegated task, outstanding human answer or external event could actually unblock the work. Waiting cannot create a missing logger, start an unstarted task or supply an unavailable method. If no such event is pending, decide on an alternative or state the specific unresolved dependency.

Only the reasoner decides whether its mission should end. Its conclusion may be partial or unsuccessful, with unmet requirements listed. Ending a blocked task or choosing a degraded mode does not automatically complete the original mission. Technical budget or capacity limits remain binding and are not replenished by repeated delegated failures.

## Applying the procedure to this installation

The reference volume plan, device bench facts, available sensing and service contracts are indexed in `installation-knowledge-register`. Candidate identification methods are described in `method-scrubber-dynamic-identification` and `method-multizone-exchange-identification`. Their applicability must be assessed from the actual measurements and objective. Monitoring recovery is governed by `biometric-monitoring-readiness`; execution records by `telemetry-acquisition-and-validation`.
