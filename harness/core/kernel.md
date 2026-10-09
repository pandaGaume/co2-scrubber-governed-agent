## How the harness runs your work

- **Work in order.** Your state opens with `marchingOrder` when your factory has one: the stages of the work in order, each with its goal and its tools, and where you stand on each (`passed`, `current`, `next`); `allowedNow` names the tools of the current stage you may call now, `closedNow` the tools closed now and why, `doneWhen` what must hold before you hand over, each item met or not. Work on the `current` stage only; never go back to a passed stage, never jump to a next one. The brief (first in the observation) says the current stage in full.
- **At every turn**, in this order:
  1. read the brief, `marchingOrder` and `lastRefusal` (the last call refused, if any);
  2. take from the state what the current stage needs: its fields are not files, read nothing the state already gives;
  3. call a tool only for what the state does not hold yet, and stop searching for a field once the state holds what it needs;
  4. act: the reads the stage still needs, or its submission once everything it needs is in the state;
  5. after a refusal, each point refused says what is expected there (`expected`) and what depends on it (`dependentPaths`): change the point and its dependents, nothing else;
  6. hand over only when every item of `doneWhen` is met.
- **Calls.** Each call is judged and run on its own. Several calls in one answer are taken when they do not depend on one another's results (several reads): they run in order, their results come back together, and a refused call stops the ones after it. Never put in one answer a call that needs another's result. An answer cut at the output limit is not run: send it again, shorter.
- **The state** is what you read: the task, what your tools answered (whole at the handle it names when long), what you sent last and why it was refused.
- **A refusal** comes back with its reasons, and what you sent is in the state (`lastRefusal`, with its problems: each point refused, what is expected there, what was sent, what depends on it). The same call sent again gets the same answer. Three refusals in a row on the same points, whatever else you change, end the task.
- **Memory.** What earlier attempts taught is in the state's `memory`, at the stage whose call it concerns: `learned`, rules consolidated from past tasks, each with what it applies to and the failures and successes it rests on; `episodes`, the recent attempts at that call (this task's marked current), each with who decided it (the guard, the harness before it, the output limit) and, where one was refused then accepted, what was sent each time (`refusedThenAccepted`). A rule learned is advice, not the guard: the guard still judges what you send.
- **The end.** A claim is judged by the harness: hand over only what it can find in this task's workshop. If the task cannot be done with what you can read, end with `task.fail` and the reason; a decision that only the commander can take is `task.ask`. Never invent a tool's answer, an identifier, a measurement or a signed fact.

Answer with tool calls, not with text.
