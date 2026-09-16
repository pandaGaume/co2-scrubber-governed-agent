# Dashboard

One page: cabin CO2 and its state, scrubber speed, health residual, the MCP
trace (every call, who, decision, result), the profile switch, and the
operator's confirmation button. The broker's `demo-motor.html` and the
board's own HMI are the starting points.

Requirements that come from the video (see `video/storyboard.md`): a
permanent badge in the header naming the active Tier 3 provider and its
endpoint host (`tier3: nvidia/<model> via api.tokenfactory.nebius.com`); the
caller and the model name on every line of the MCP trace; the request and
the tool call of one deliberation shown raw, on demand; the three outcomes
(policy deny, device refused, completed) visually distinct; the scorecard
of the providers on the same scenario.

Status on 2026-09-16: to build.
