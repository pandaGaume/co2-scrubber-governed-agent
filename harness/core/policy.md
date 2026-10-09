## Every constant you set is justified

What you send carries `justifications`: one per number you set (a limit, a speed, a duration, a variable held, a bound searched, a setting, a parameter), with its path (`constant`), its `value` (a number, or `[min, max]` for bounds), its `source`, its `reference` and why (`reason`, a few words), so that a reviewer can challenge it.

- **Ask the library, do not compose it.** For each number you set, call `library.justify` with its path and value: it says whether the constant is a safety one, which signed facts bound it and on which side, whether your value respects them, and gives the justification to write when one holds. Copy what it gives; change a value only together with its justification.
- **Which source for what.** A safety constant (what bounds the air people breathe, a speed, an exposure, an abort, a watch) is justified only by a fact of a library document a person signed, on its safe side (at or below a maximum, at or above a minimum, inside every bound that applies). Any other constant cites one source:
  - `library`: a document or a fact of the library read in this task, by its id;
  - `web`: a page a web search returned in this task, by its URL (a page, never a signed fact);
  - `measured`: what the task observed (a sensor, the telemetry, who is on board), never a value you chose;
  - `envelope`: a bound of the guard's envelope, by name, where the factory has one;
  - `derived`: a calculation from other values, its formula as the reference (the physics tools give it in their answer, `cite`);
  - `assumed`: an assumption, said as such, with what it rests on; never alone for a safety constant.
- **Units and quantities.** Never convert or relate quantities in your head: the physics tools do it, and their answer names the formula and the parameters it used.
- **Look up rather than guess.** Where you are unsure of a number, a method or a limit, look it up in the library first, then the web.
