# Capability contract: what a generated node must satisfy, written by whoever finds the node missing

A capability contract is the sheet a factory writes when no node of the catalogue produces a required output: what the node takes, what it gives, what it exposes, and what it does for given inputs. Another factory writes the node from it; the forge runs the contract on the node and says what fails. The one who writes the contract never writes the code, and the one who writes the code never writes the acceptance: that is what makes a generated node trustworthy.

**Read by:** the graph factory, before declaring a capability missing (`task.plan`, `missing_capabilities[].contract`); the code factory, to read the contract it works against.
**Judged by:** code (`slots/forge/contract.ts`, `contractProblems`): the shape, the units, the formulas; then the forge, which runs every behavior on the node.

## Shape

```json
{
  "inputs":     { "<port>": { "quantity": "Dimensionless", "unit": "ratio", "range": [0, 1], "unwired": 1 } },
  "outputs":    { "<port>": { "quantity": "MassFlow", "unit": "kg/s", "sign": "nonpositive" } },
  "parameters": { "<name>": { "quantity": "MassFlow", "unit": "kg/s", "editable": true, "value": 0.002 } },
  "behaviors":  [ "output(<input>=<number>, ...) == <formula>", "output(unwired) == <formula>" ]
}
```

- **inputs**, by port name: the quantity and the unit as the catalogue names them (the vocabulary of quantities of the twin's signatures), the range the node accepts, and `unwired`, the value the node takes for that input when nothing is wired into it. Every input the request names is an input here, with its unwired value.
- **outputs**, by port name: the quantity, the unit, and the sign when it is fixed (`negative`, `positive`, `nonnegative`, `nonpositive`). A contract with one output names it `output` in its behaviors; with several, each behavior names its output.
- **parameters**, by name: the editables the node must expose under these exact names (a getter and a setter on the node), with the quantity and the unit when the unit system knows them, and `value`, the value the acceptance runs set before measuring. A constant of a quantity the unit system does not know (a gas constant, a discharge coefficient, a molar mass) is a parameter without quantity and unit.
- **behaviors**, one line each: the output for given inputs, or with nothing wired. `output(command=0.5) == -0.5 * rate`; `output(unwired) == -rate`; `co2Delta(opening=1, pressure=101325) == rate`. The comparison is `==` (within a relative tolerance of 1e-6), `~=`, `<`, `>`, `<=` or `>=`. The formula is over the parameters (at their `value`) and the inputs (the wired ones at the value the behavior gives, the others at their `unwired` value), with `+ - * / ^`, parentheses, and the functions `sqrt`, `abs`, `exp`, `log`, `ln`, `log10`, `min`, `max`, `pow`.
- **type**, optional: the type the plugin must register, under `Generated.`; left out, the code factory names it. A type outside `Generated.` is refused.

## Rules

1. Say exactly what the node does, not what it is for: every behavior is a measurement the forge can make (a document with the node, a timeline per wired input, a transducer on the output, a few ticks, the last measurement against the formula).
2. Every input the request names is an input of the contract, with its value when unwired. The forge reads what the node takes unwired by wiring nothing; a contract that forgets the unwired value cannot be checked there.
3. At least two behaviors, and one of them the unwired case when the request says what the node does with nothing wired. A behavior that repeats another with the same inputs teaches nothing.
4. Units are the unit system's (UCUM codes, or the names the catalogue's signatures use: `ppm`, `kg/s`, `m3ps`, `m3/min`, `L/min`, `percent`, `ratio`, `Pa`, `K`). A unit the system does not know for the quantity is refused with the units it knows. Two units of one quantity convert: `m3/min` for a port the catalogue writes in `m3ps` is accepted.
5. A parameter's `value` is what the acceptance sets; the behaviors are written for those values (`-0.5 * rate` with `rate` at 0.002 is measured as -0.001).
6. Nothing in the contract names a node of the catalogue or a file: it describes a capability, not an implementation.

## Examples

### A leak out of a volume, at a constant rate scaled by a command

The request said: a mass flow out of the volume at a constant rate at full opening, scaled by a command between 0 and 1, the leak fully open when nothing commands it, the rate an editable.

```json
{
  "inputs": { "command": { "quantity": "Dimensionless", "unit": "ratio", "range": [0, 1], "unwired": 1 } },
  "outputs": { "co2Delta": { "quantity": "MassFlow", "unit": "kg/s", "sign": "nonpositive" } },
  "parameters": { "rateKgps": { "quantity": "MassFlow", "unit": "kg/s", "editable": true, "value": 0.002 } },
  "behaviors": [
    "output(command=0) == 0",
    "output(command=0.5) == -0.5 * rateKgps",
    "output(command=1) == -rateKgps",
    "output(unwired) == -rateKgps"
  ]
}
```

### A first-order lag on a command

The request said: a flow that follows a command with a time constant; at steady state the flow is the command times the full flow.

```json
{
  "inputs": { "command": { "quantity": "Dimensionless", "unit": "ratio", "range": [0, 1], "unwired": 0 } },
  "outputs": { "flow": { "quantity": "VolumetricFlow", "unit": "m3ps", "sign": "nonnegative" } },
  "parameters": { "fullFlow": { "quantity": "VolumetricFlow", "unit": "m3ps", "editable": true, "value": 0.05 }, "tauSeconds": { "quantity": "Time", "unit": "s", "editable": true, "value": 1 } },
  "behaviors": [
    "output(command=0) == 0",
    "output(command=1) ~= fullFlow",
    "output(unwired) == 0"
  ]
}
```

The acceptance runs a few ticks of one second: a time constant of one second and `~=` leave the settling to the node's own physics; a contract that must measure the transient says so in the behavior it writes (a value after so many ticks is not in this grammar yet; write the steady state).

### A threshold on a concentration

The request said: an alarm level, 1 above a threshold and 0 below, the threshold an editable.

```json
{
  "inputs": { "ppm": { "quantity": "Concentration", "unit": "ppm", "unwired": 0 } },
  "outputs": { "alarm": { "quantity": "Dimensionless", "unit": "ratio", "range": [0, 1] } },
  "parameters": { "thresholdPpm": { "quantity": "Concentration", "unit": "ppm", "editable": true, "value": 3500 } },
  "behaviors": [
    "output(ppm=1000) == 0",
    "output(ppm=4000) == 1",
    "output(unwired) == 0"
  ]
}
```

## What the forge does with it

The forge reads the contract, instantiates the node on a registry of its own, checks the signature's ports against the contract's (the quantity the same, the unit convertible), finds each parameter as a setter of the node, then for each behavior builds a document (the node, a timeline per wired input at its value, a transducer on the judged output), runs it eight ticks and compares the last measurement with the formula. What fails is named with the value measured and the value the contract says. A node that passes its own tests and the forge's checks and fails one behavior is not loaded.
