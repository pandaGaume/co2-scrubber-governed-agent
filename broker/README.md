# Broker

`@cyanmycelium/mcp-broker` is the only way in. `policy.example.json` says
who may call what, where: the operator may do everything, the regulator may
read and actuate inside the ECLSS path, the tier3 role may read, actuate and
call the factory, and is explicitly denied `power`, `protect` (the
minimum-flow setting), `register` and `admin` (the `_broker` slot): no call
from the agent can weaken or switch off the protection that stops it. The
firmware adds its own refusals below this (the speed envelope, MIN-FLOW),
and the operator's physical cut-off sits above.

Budgets for the agent's questions to the twin (points, simulated seconds per
point) are measured on the RS-385 montage (35 nodes) and must be remeasured
on the cabin twin.
