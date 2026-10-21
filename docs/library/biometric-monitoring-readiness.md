# Procedure card: missing biometric monitoring before a test

When a proposed test affects an occupied module and the required biometric monitoring is absent, unavailable or incomplete, keep the physical test blocked. Inform the commander and request coordination with the medical officer. Obtain the required human authorisation, start the appropriate monitoring session through the station, and verify its actual state before starting the test. This card describes operational readiness, not medical treatment or permission to bypass a device guard.

## Distinguish standby from missing monitoring

`biomed.describe` reports the available provider and whether its readings are simulated. `biomed.presence` reports who is currently in the module. `biomed.state` and `biomed://session` report the active session and the subjects it covers.

No active session between tests is normal standby. It does not mean that monitoring is impossible, and does not prevent writing a proposal. The proposal must nevertheless name the exposed occupants in `monitoring.subjects`, include the applicable signed monitoring bounds, and specify an abort condition with id `vitals` and source `biomed.verdict`. Omitting those fields is a defective proposal, not a request for permission to omit monitoring.

## Preparation and human decision

1. Read presence and monitoring state. Identify the affected module, the exposed people, the proposed procedure and its version, the required monitoring, and exactly what is missing. Keep actual observations distinct from simulated readings.
2. Inform the commander through Mother. Request the medical officer's assessment when equipment, coverage or readiness is uncertain. Explain the missing prerequisite and the intended session. An ordinary conversational answer does not authorise a physical test or change the station's authority model.
3. Have the responsible human arrange the equipment and subject assignments. For a real Polar H10 source, its connection and coverage must be real. One connected belt does not establish coverage of two exposed people. Do not fabricate subjects or move people in the register to make a guard pass.
4. Prepare or revise the test proposal with the required monitoring and abort conditions. The factory and station check the complete proposal. If accepted, the station asks its configured commander to authorise that exact test. A monitoring declaration alone does not start a session.
5. On commander authorisation, `station.commissioning_authorise` rechecks the occupants and calls `biomed.monitor_start` for the procedure's subjects. If starting the session fails, authorisation is not recorded. The reasoning agent must not call a privileged tool under a borrowed identity or declare the session started on its own.
6. Verify the returned session identifier, covered subjects, source and `biomed.verdict` before executing the test. The executor still enforces the authorised procedure and abort conditions. An alarm, missing required coverage or unavailable readings prevents or stops physical execution under the applicable guards.
7. If readiness cannot be established, state the unmet prerequisite. The commander and medical officer decide how to resolve it. The reasoner may propose another governed course of action, but no automatic fallback grants permission or turns simulated biometrics into physical monitoring.

## Medical officer and authority

The medical officer is a human responsibility, not an invented identity. The repository currently defines the commander and authorised-signatory roles. It does not yet define a medical-officer holder or an independent medical approval endpoint. Ask the commander to identify the responsible medical officer when needed; report an unavailable medical contact explicitly. This signed card does not create a medical role, assign a doctor, grant tool permissions or make a doctor's advice equivalent to the commander's protected test authorisation.

## Loss of monitoring during an active test

Stop or abort the affected test through its existing guards, inform the commander and medical officer, and record the failure and the session involved. Do not resume merely because a signal returns. Recheck readiness and obtain whatever renewed authorisation the station requires for the resulting state. Close the monitoring session when the test ends or aborts, retaining its record. Critical health alarms follow `health-alarm-procedure`.
