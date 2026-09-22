# Design brief: the control room

*Rewritten 2026-09-22, when the 1990s pixel art was dropped for a futuristic
direction in cold tones. The pixel-art brief it replaces is gone with its page,
which is kept in [`drafts/panel-pixel-art.html`](drafts/panel-pixel-art.html).
The references and the rules drawn from them are in
[`inspiration/README.md`](inspiration/README.md). The direction was chosen from
three prototypes; the two that lost are in [`drafts/`](drafts/README.md) with
the reason each lost.*

*This brief describes a page that exists and works:
`panel.html`, `room.css`, `app.js`, `room-model.js`, with
`prototypes/control-room.html` holding the same layout with hard-coded readings
and no broker behind it. It is written so the page can be argued with, not so
it can be built from scratch again.*

## 0. What survived the change of direction

Four rules outlived the pixel art and are not up for discussion:

1. **The page explains itself.** Nobody presents it. A jury member opens the
   link, a Datacraft attendee scans a QR code, a stranger clones the
   repository: each of them must understand what they are looking at without
   a guide.
2. **Every element says where its figure comes from, in place.** Never on
   hover: hover does not exist on video.
3. **The cabin state reads from across a room in under a second**, and a trace
   line reads in two, on a compressed video.
4. **A step that is not built says so instead of being faked**, and a figure
   the page has not read is drawn as absent, never filled with a plausible
   number. A jury that catches one invented figure stops believing the rest.

To which the references added a fifth, which now governs everything:

5. **Nothing moves on the screen that is not a datum moving.** No sweep, no
   scanning ring, no drifting camera, no idle shimmer. An animation that
   encodes nothing tells an engineering jury "this is a mockup" louder than
   any sentence the narrator can say.

## 1. What the page is

The control panel of a CO2 scrubber in a crew cabin, and the audit log of an
AI agent that is allowed to talk to that scrubber only through an MCP broker.
It is filmed for a three-minute hackathon video (1280 x 720) and projected at a
conference (1920 x 1080). It is not a product UI: it is a stage, and every
element on it exists to make one of these visible:

1. the cabin is breathing or not (CO2 state);
2. the machine is doing something real (flow, current, health);
3. an agent asked for something, and one of three things happened: the policy
   denied it, the device refused it, or it was done;
4. which vendor's model is the agent right now (a badge), because the video
   swaps it live.

## 2. Art direction: the machine, in wireframe

The reference that decided it is [SIRIUS](inspiration/03-sirius-system-overview.webp):
a near-black ground, one cold hue held everywhere, a warm colour used three
times in a whole screen, dense data and no decoration. It reads like an
instrument, not like a film poster.

The reference that decided the *shape* is [CRETAX](inspiration/02-cretax-genome-map.webp)
with [InGen](inspiration/01-ingen-incubation-pod.png): one luminous object in
the middle of the screen, and the numbers hung off it on leader lines that
touch the parts they describe. The specimen in the tank, the helix with its
callouts. The figures are annotations **on** the thing, not a table beside it.

That is the whole direction. The first attempt laid the same figures out as
panels of numbers ([`drafts/control-room-a-instrument.html`](drafts/control-room-a-instrument.html)):
clean, correct, and dull, because it looks like a settings screen. The second
drew the machine flat with the callouts on it
([`drafts/control-room-b-flat-machine.html`](drafts/control-room-b-flat-machine.html)):
right idea. The one in service draws it as a **3D wireframe**.

### Tokens

The palette and the type are `biomed.html`'s, value for value, declared once in
`room.css`. The two pages are one instrument and must not drift apart; anything
added to one that the other would also want belongs in both.

| token | value | what it is for |
|---|---|---|
| `--bg`, `--bg-2` | `#04090c`, `#061218` | the ground, near black, slightly blue |
| `--panel` | `rgba(10, 28, 34, 0.66)` | the panels, translucent over the ground |
| `--line`, `--line-strong` | teal at 16 % and 34 % | every rule, border and hairline |
| `--teal`, `--teal-soft` | `#2fe0c8`, `#7ad6cc` | the one cold hue: the machine, the agent, every value that is fine |
| `--text`, `--muted`, `--muted-2` | `#d3ecea`, `#6d908e`, `#4d6f6e` | three levels of text, and nothing between them |
| `--amber` | `#ffb648` | **the device refused.** Nothing else, ever |
| `--red` | `#ff5064` | **CRITICAL, and policy deny.** Nothing else, ever |

The warm colours are the whole point of holding the cold one everywhere. A slot
that is down is **muted**, not amber; a disabled button is muted; an empty
state is muted. The moment amber decorates something, it stops meaning "the
firmware said no" at the moment it has to mean it.

Type is the system monospace for everything with a number in it and the system
sans for prose. No web fonts: nothing is fetched from a third party at runtime.
Labels are small capitals with wide letter-spacing; values are 600 weight with
tabular numerals so a figure does not jitter as it changes.

There is no fixed artboard any more. The bitmap faces were the only reason for
the 1280 x 720 stage scaled by quarter steps; without them the page is fluid
and fills 1280 x 720 and 1920 x 1080 alike.

## 3. Layout

Three columns under a header, a strip of slots along the bottom. At 16:9 the
columns are about 0.72 : 1.86 : 1.12.

```
+------------------------------------------------------------------------------+
| CO2 SCRUBBER   control room, night 9 of 14, crew 4    [tier3][gateway][broker] |
+-------------+--------------------------------------+-------------------------+
| STORY       | CABIN AND SCRUBBER                   | MCP TRACE               |
|  6 steps    |   2 600 ppm   ELEVATED               |  calls / ok / refused /  |
|  one button |   +1 400 ppm in 4 min, from 1 210    |   denied, counted off it |
|  each       |                                      |  legend                  |
|             |   [ the machine, 3D wireframe ]--o   |  12:23:37 regulator      |
+-------------+   cabin | column | bed          |    |   scrubber.motor...      |
| MOTHER      |                              [flow]  |   {"percent":60}   [ok]  |
|  the voice  |                           [current]  |  12:23:36 operator       |
|  as a queue |                          [residual]  |   scrubber.power         |
|             |                             [curve]  |   {"on":false} [refused] |
+-------------+--------------------------------------+-------------------------+
| SLOTS   scrubber | twin | station | factory                                   |
+------------------------------------------------------------------------------+
```

Below 1180 px wide the columns stack. That case is not filmed.

### Header

Product name linking to the story, the mission line, then three badges that are
always visible and never truncated at 1280 px: `tier3: <model> via <host>`,
`gateway: <host>`, `broker: <name> <version>`. The tier3 badge is the one the
video swaps live, so it is the only filled badge on the page: filled survives
video compression, an outline does not. The broker badge turns red and says
`unreachable` when it is.

### The cabin panel: the machine

The hero, and the only place on the page allowed to be big.

- **The reading**, largest thing on the screen: the ppm figure, its unit, the
  state word (NOMINAL, ELEVATED, CRITICAL) with the semantic colour, and one
  line under it of the InGen pattern: the value against a reference the page
  owns, plus what the firmware does in this state. The reference is the page's
  own oldest kept reading, never a threshold. See §5.
- **The machine**, drawn once as a 3D wireframe on a canvas: the cabin module
  with the four crew in it and a CO2 field whose density is the measured ppm,
  the duct out, the scrubber column holding the impeller, the motor under it
  and the sorbent bed under that, and the return duct back into the cabin
  floor. What is modelled is what the tools act on, and nothing else. The
  dimensions are proportions of a machine, not measurements of one: no
  dimension of the real scrubber is published, so none is claimed.
- **Three callouts** in a column on the right, each on a leader line that ends
  in a dot on its own part: flow, motor current, health residual. Each carries
  the value, its scale, and one sentence saying what it means here.
- **The curve**, under them: the readings this page has taken, coloured by the
  state word the board sent with each one, ticked where that word changed.
- **The power pill**, top left of the scene.
- Behind it all, **the view out of the window**: the lunar surface in
  wireframe, the Earth over the horizon, cleared where the machine stands in
  front of it. See §6.

### MOTHER

The station speaking, under the story. It is the `speech` slot's own queue
(`speech://queue`), rendered; the words are the `station` slot's phrases
(`grammar://phrases`). **The page chooses when something is said and never
chooses the words.** When the station has no phrase for what happened, nothing
is said: the page does not write a sentence to fill a silence. When the voice
is not ready it says so and prints nothing else.

The caret is the one blinking thing on the page. It blinks while the link is
up and goes dark and still when it is down, so it is the link indicator, not
decoration.

### Story, trace, slots

- **Story**: the six steps of the scenario, numbered, each with one sentence,
  one button that plays it through the broker, and the outcome it should
  produce. The pill turns to what actually happened, which is the worst outcome
  among that step's calls. A step that depends on a piece not yet built shows
  why and is disabled.
- **Trace**: four figures counted off the list itself (calls, completed,
  refused, denied), so they cannot drift from what is under them; then the
  legend; then the entries, newest first, each with time, caller, `slot.tool`,
  arguments, the outcome pill and the result. A refusal or a deny gets a left
  border in its colour.
- **Slots**: one card per provider behind the broker, its tools as buttons. The
  six `grammar_*` tools mcp-core puts on every slot sit behind one small
  `wording (n)` button, out of the story's way. A slot that is down is dimmed
  and says why.

## 4. What moves

Four things, and the page is otherwise still:

| what | driven by | stops when |
|---|---|---|
| the impeller turns | the measured flow; one turn of the blades is one turn of the real thing | the power is off, or there is no reading |
| the dashes in the ducts travel | the same measured flow | the same |
| the state word blinks at 2 Hz | CRITICAL only | the cabin leaves CRITICAL |
| the MOTHER caret blinks | the link being up | the link drops |

A new trace entry fades in over 0.45 s. That is a transition, not an animation:
it marks an arrival that really happened.

The camera never moves. There is no ring, no reticle, no scan line. This is the
rule that costs the most and buys the most.

## 5. Two figures that must never be put side by side

The board sets its CO2 state directly (`debug.set_co2`) and picks a stub ppm per
state: 1200, 2600, 5000. `specs/cabin-parameters.json` puts the thresholds at
3500 and 4000 and says NOMINAL is below the first. So the board reports
`co2State: ELEVATED` with `co2Ppm: 2600`, which by the spec is nominal, and the
twin reads the spec while the board does not.

A page that draws the spec's thresholds against the board's ppm therefore
writes "900 ppm below the elevated threshold" directly beside the word
ELEVATED, and argues with itself in front of the jury.

Until the two agree, the rule here is: **the state word the device reported
wins, and the ppm is a reading printed beside it.** The curve is coloured by
that word. No threshold line is drawn. The delta compares the reading to the
page's own oldest kept reading, which is a number the page can defend. This is
a workaround, and the underlying disagreement is a separate piece of work.

## 6. The one thing that measures nothing

The lunar surface behind the machine carries no value. It is allowed because it
is the view out of the window, because it never moves, and because it is held
at about a tenth of the contrast of anything that does carry a value, and
cleared where the machine stands in front of it. Night 9 of 14 means the sun is
down and the Earth is up, which is why the Earth is drawn and the sun is not.

If it ever competes with a figure for attention, it is wrong and it goes.

## 7. Where the page gets everything

| element | source |
|---|---|
| tier3 and gateway badges | `config.json` |
| broker badge | the broker's `initialize` |
| slots and tools | `_broker.providers_list`, then each slot's `tools/list` |
| the cabin, the machine, the curve | `scrubber.motor.state` every 2 s: `co2Ppm`, `co2State`, `speedPercent`, `currentAmps`, `healthResidual`, `power`. The page keeps the last 120 readings, which is four minutes |
| the flow floor, 40 % | compiled into the firmware, `slots/scrubber/provider.ts` |
| the residual alarm, 0.04 | the monitor's contract, `specs/scrubber-health-twin.json` |
| trace entries and the four figures | every call this page makes |
| MOTHER's words | the `station` slot's `grammar://phrases` |
| MOTHER's list | the `speech` slot's `speech://queue` |

Nothing else is invented, and the page shows nothing it has not read.

## 8. States the page must be seen in

1. **Nominal**: 1200 ppm, NOMINAL, 33 %, power on, an empty trace, MOTHER with
   the boot lines.
2. **Elevated with a refusal**: 2600 ppm, ELEVATED, 60 %, a
   `scrubber.power {"on": false}` refused with "MIN-FLOW: CO2 is ELEVATED, the
   scrubber cannot be powered off".
3. **Critical**: 5000 ppm, CRITICAL blinking, full flow forced, a `set_speed 40`
   refused and a `policy deny` from `tier3`.
4. **Broker unreachable**: the badge says so, the machine keeps its shape and
   loses its values, every figure is dashes, the caret is dark, the slots are
   dimmed and say why. No error styling beyond muted text.

`prototypes/control-room.html` switches between the four with no broker
running, which is how the design is reviewed and how the video is rehearsed.

## 9. Files

| file | what |
|---|---|
| `panel.html` | the frame, and nothing with a value in it |
| `room.css` | the tokens and every class. `style.css` is the old pixel-art sheet and still serves `index.html` and `story.html` |
| `app.js` | the broker, the badges, the slots, the trace, the story, the curve, MOTHER |
| `room-model.js` | the machine and the window, given a reading, knowing nothing about MCP |
| `prototypes/control-room.html` | the same layout, hard-coded, for review |
| `drafts/` | what was tried and kept: the pixel-art page and the two prototypes that lost |

## 10. What not to do

- No text under 9 px rendered, and nothing under 16 px that carries a value.
- No second cold hue. One teal, three levels of text, and the two warm colours
  reserved.
- No amber or red on anything that is not a refusal, a deny, or CRITICAL.
- No animation that does not encode a value.
- No hover-only information.
- No figure the page has not read.
