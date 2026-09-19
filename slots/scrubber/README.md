# slot `scrubber`

Tier 1. The ESP32-S3 board (CyanMycelium sample `scrubber`): real motor and current, cabin CO2 simulated on board, the health ONNX model, the speed envelope and the MIN-FLOW rule. It publishes itself to the broker through `libmcpb` as a named slot: tools `motor.state`, `motor.set_speed`, `scrubber.power`, `scrubber.set_min_flow`, `scrubber.set_profile`; resources for state; notifications for CO2, health, alarms and operating points.

`scrubber.set_min_flow` is the visible form of the rule "no call from the agent can weaken or switch off the protection that stops it": the minimum flow MIN-FLOW enforces can be raised by the operator (the broker's policy keeps the tool away from the tier3 role), and the device refuses any value below a floor compiled into the firmware, whoever asks. The protection can be raised, never weakened. Forcing full speed on CRITICAL is the emergency action, and it is safe in every configuration the machine can be in.

Status on 2026-09-19: the board serves MCP directly; wiring `libmcpb` to the broker, the MIN-FLOW rule with its compiled floor, `set_min_flow` and the `operating_point` notification are the firmware work items (CyanMycelium repository). The stub in `provider.mjs` has the three refusals (envelope, MIN-FLOW, floor).
