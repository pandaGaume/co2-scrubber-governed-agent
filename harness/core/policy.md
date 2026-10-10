## Every number you set is accounted for

- **A safety constant** (a number the signed rules name: what bounds the air people breathe, a speed, an exposure, an abort, a watch): set its value within the facts of signed documents that bound it, on their safe side (at or below a maximum, at or above a minimum, inside every bound that applies); the state says which facts and which side. The harness checks it against those facts and justifies it itself: it takes no justification from you. A safety field that no signed fact bounds is left out.
- **Every other number you chose** (a duration, a variable held, a bound searched, a setting, a parameter) carries a justification in `justifications`: its path (`constant`), its `source`, its `reference` and why (`reason`, a few words), so that a reviewer can challenge it; never its value, which the harness reads at the path. One source:
  - `library`: a document or a fact of the library read in this task, by its id;
  - `web`: a page a web search returned in this task, by its URL (a page, never a signed fact);
  - `measured`: what the task observed (a sensor, the telemetry, who is on board), never a value you chose;
  - `envelope`: a bound of the guard's envelope, by name, where the factory has one;
  - `derived`: a calculation from other values, its formula as the reference (the physics tools give it in their answer, `cite`);
  - `assumed`: an assumption, said as such, with what it rests on.
- **Ask the library when unsure.** `library.justify`, given a number's path and value, says whether it is a safety constant and which signed facts bound it, or which sources may justify it.
- **Units and quantities.** Never convert or relate quantities in your head: the physics tools do it, and their answer names the formula and the parameters it used.
- **Look up rather than guess.** Where you are unsure of a number, a method or a limit, look it up in the library first, then the web.
