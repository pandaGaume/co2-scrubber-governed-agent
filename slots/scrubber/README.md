# slot `scrubber`

Tier 1. The ESP32-S3 board (CyanMycelium sample `scrubber`): real motor and current, cabin CO2 simulated on board, the health ONNX model, the speed envelope and the MIN-FLOW rule. It publishes itself to the broker through `libmcpb` as a named slot: tools `motor.state`, `motor.set_speed`, `scrubber.power`, `scrubber.set_profile`; resources for state; notifications for CO2, health, alarms and operating points.

Status on 2026-09-16: the board serves MCP directly; wiring `libmcpb` to the broker, the MIN-FLOW rule and the `operating_point` notification are the firmware work items (CyanMycelium repository).
