# Design brief: the scrubber dashboard, 1990s pixel art

*For Claude Design. Written 2026-09-18. The page exists and works
(`dashboard/index.html`, `app.js`, `style.css`); this brief asks for its
visual design, not its behaviour. The behaviour, the data and the states are
fixed below and must not be changed by the design.*

## 0. Two levels, one rule: the page explains itself

Nobody presents this page. A jury member opens the link, a Datacraft
attendee scans a QR code, a stranger clones the repository: each of them
must understand what they are looking at and what they can do without a
guide. So the site has two levels, and both carry their own explanations.

| Level | URL | Purpose | Reader's time |
|---|---|---|---|
| **Home** | `/` | tells the story and shows the architecture: what the machine is, who is allowed to talk to it, why the authority runs backwards, what is real and what is simulated, and a door to the control room | two minutes, scrolling |
| **Control room** (the dashboard) | `/panel.html` | makes the story happen: the cabin, the slots, the trace, and the story itself as six steps with a button each | as long as they like |

Every element of the control room carries a one-line explanation of what it
is and where its data comes from, readable in place (no hover-only text on
the filmed page: hover does not exist on video). The story panel is the
spine of the control room: the six steps of the scenario, each with one
sentence, one button that performs it through the broker, and the outcome
it should produce; a step that needs a piece not built yet says so and is
disabled, never faked.

## 1. What the page is

The control panel of a CO2 scrubber in a crew cabin, and the audit log of
an AI agent that is allowed to talk to that scrubber only through an MCP
broker. It is filmed for a three-minute hackathon video (1280 x 720) and
projected at a conference (1920 x 1080). It is not a product UI: it is a
stage, and every element on it exists to make one of these visible:

1. the cabin is breathing or not (CO2 state);
2. the machine is doing something real (speed, current, health);
3. an agent asked for something, and one of three things happened: the
   policy denied it, the device refused it, or it was done;
4. which vendor's model is the agent right now (a badge), because the
   video swaps it live.

The audience must read the state of the cabin from across a room in under
a second, and read a single trace line in two seconds on a compressed video.

## 2. Art direction: pixel art, 1990s

The reference is a 1990s console or DOS game HUD and a 16-bit
mission-control screen: hard pixels, a small palette, bitmap type, bevelled
panels, LED lights, seven-segment digits. Warm, legible, a little playful,
never cluttered. What that means concretely:

- **Pixels are integers.** Everything is drawn on a virtual grid of 320 x 180
  or 640 x 360 logical pixels and scaled by a whole number (x4 or x2 at
  1280 x 720, x6 or x3 at 1920 x 1080). No fractional scaling, no
  anti-aliasing on pixel elements: `image-rendering: pixelated` on sprites,
  bitmap fonts at their native size times an integer.
- **Palette of 16 colours at most**, declared once as CSS variables. Include:
  a deep background (near black, slightly blue), a panel colour, a bevel light
  and a bevel dark, a text colour, a muted text colour, and the four semantic
  colours below. Dithering (checkerboard) is allowed for gradients; smooth
  gradients are not.
- **Type**: a bitmap or pixel typeface for everything. Titles and badges in a
  chunky 8 x 8 face (Press Start 2P or equivalent), body and trace in a
  narrower readable pixel face (VT323, Pixelify Sans, or a 5 x 7 bitmap).
  Minimum rendered size 16 px for the trace, 24 px for values, 48 px or more
  for the CO2 figure.
- **Panels** with 1-pixel bevels (light top-left, dark bottom-right), a
  title bar, no rounded corners, no shadows, no blur.
- **Indicators**: LED dots (on, off, blinking), a seven-segment or
  dot-matrix display for the CO2 ppm, a horizontal bar with ticks for the
  speed, a small needle or bar for the current, a bar with a threshold mark
  for the health residual.
- **One sprite animation**: the turbine, 8 frames, frame rate proportional
  to the speed (still at 0 %, about 12 frames per second at 100 %).
  Optional: a CO2 "haze" that thickens with the ppm, as a dithered overlay
  on the cabin panel.
- **Motion rules**: blink at 2 Hz for CRITICAL only; a one-frame flash on a
  new trace line; nothing else moves. No scanline or CRT overlay: it kills
  legibility on video compression.
- **No sound.**

Semantic colours, used for nothing else:

| Meaning | Where | Suggestion |
|---|---|---|
| NOMINAL, completed | CO2 state, trace outcome | green |
| ELEVATED, device refused | CO2 state, trace outcome | amber |
| CRITICAL, policy deny | CO2 state, trace outcome | red |
| the agent (tier3) as a caller, links | trace caller, badge | cyan or light blue |

The two red meanings (CRITICAL cabin, policy deny) never appear in the same
element, so sharing the colour is safe; the same for amber.

## 3. Layout, fixed

### 3.0 The home (`/`)

A single scrolling page, same art direction, mostly text and one picture,
in this order:

1. **The title and the one-sentence thesis**: an agent never touches the
   scrubber; it goes through a broker; the survival authority lives in the
   firmware. A door button: "Enter the control room".
2. **The picture**: the five tiers stacked, with the authority arrows
   pointing down and the deliberation arrows pointing up, the broker as the
   only gate between the agent and the machine. Drawn in the pixel style
   (a cabin cross-section works: crew at the top, agent behind a wall with
   one door labelled broker, the scrubber and its board at the bottom).
3. **The three layers** that decide what a call does: policy, safety
   envelope, physical cut-off; the three outcomes a call can have.
4. **The four slots** as four cards: name, tier, what it is, what is real
   today and what is a stub.
5. **The story in six steps**, the same six as the control room, as a
   numbered list with what the reader will see happen.
6. **What is real, what is simulated**: the motor and the current are real,
   the cabin CO2 is simulated on the board; the model behind the agent is
   named; the substrate's license in one sentence.
7. The door again.

### 3.1 The control room (`/panel.html`)

Four regions at 16:9: a story strip on the left, then cabin, slots and
trace side by side, with the header above. Proportions about
0.9 : 1 : 1.2 : 1.6. Below 1100 px wide they stack; that case is not filmed.

```
+----------------------------------------------------------------------------------+
| co2-scrubber-governed-agent      [tier3: nvidia/<model> via host] [gateway] [broker] |
+---------------------+---------------------------+--------------------------------+
| CABIN               | SLOTS                     | MCP TRACE                      |
|  2600 ppm  ELEVATED |  scrubber                 |  legend: completed / device    |
|  [turbine sprite]   |   motor.state             |   refused / policy deny / err  |
|  speed   ====|      |   motor.set_speed  ...    |  12:23:37 operator             |
|  current ==         |  twin                     |   scrubber.motor.set_speed     |
|  health  ===|       |   sweep  time_to_critical |   {"percent":60}  [completed]  |
|  power   (o)        |  station                  |  12:23:36 operator             |
|                     |   register_artifact ...   |   scrubber.scrubber.power      |
|                     |  factory                  |   {"on":false} [device refused]|
|                     |   run_sweep ...           |   MIN-FLOW: CO2 is ELEVATED... |
+---------------------+---------------------------+--------------------------------+
```

### Story panel

- The six steps of the scenario, numbered, each as: a title, one sentence
  of what happens, the outcome to expect (in the outcome colour), and one
  button "do it". A step runs a fixed sequence of calls through the broker;
  its outcome pill turns to what actually happened. A step that depends on a
  piece not yet built (the language model, the profile swap) shows "needs
  tier3" and a disabled button.
- A one-line note at the bottom: "until the broker's authorization is on,
  this page signs every call as operator; the caller shown is the role the
  step plays".
- A "reset" link that returns the cabin to nominal.

### Header

- Product name, left, linking back to the home.
- Three badges, right, always visible, never truncated at 1280 px:
  `tier3: <model> via <host>`, `gateway: <host>`, `broker: <name> <version>`.
  The tier3 badge is the one the video swaps live; it must be readable in a
  single frame. Give it the agent colour.

### Cabin panel

- The CO2 figure in ppm, the largest thing on the page, seven-segment or
  dot-matrix, with its state word right under it: NOMINAL, ELEVATED,
  CRITICAL. The state word carries the semantic colour and, for CRITICAL,
  the 2 Hz blink.
- The turbine sprite.
- Four gauges with label, value and bar: speed (0 to 100 %), current (0 to
  4 A on the twin, 0 to 1 A on the board: the scale is a parameter), health
  residual (0 to 0.2, with a threshold mark at 0.04 by default), power (an
  LED: on, off).
- Ranges are physical facts; the design must not bake in other values.

### Slots panel

- One group per slot (scrubber, twin, station, factory), a title bar with the
  slot name, then its tools as buttons in a wrap. Buttons are the only
  interactive element besides the dialog: bevelled, pressable, with a hover
  state. Tool names are monospace pixel text and may be long
  (`diagnostic_load_model`): let them wrap, never truncate.
- A slot that is down shows an "unreachable" line in muted text.

### Trace panel

- A legend row with the four outcomes as small pills.
- A list, newest first, one entry per call: time, caller, `slot.tool`,
  arguments, the outcome pill, and a collapsible one-line result. The
  outcome pill is the most important thing on the line; the caller is the
  second (operator vs tier3, in the agent colour).
- Entries with a refusal or a deny get a left border in their colour.

### Call dialog

- A modal with the tool name, its description, a JSON text area, cancel and
  "call as operator". Same panel style.

## 4. Data the page has at runtime (do not invent others)

| Element | Source | Values |
|---|---|---|
| tier3 badge | `config.json` | model id, endpoint host |
| gateway badge | `config.json` | a host name |
| broker badge | `_broker` `initialize` | name and version |
| slots and tools | `_broker.providers_list`, `tools/list` | names, descriptions, JSON schemas |
| cabin readout | `scrubber.motor.state` every 2 s | `co2Ppm` (400 to 5000), `co2State` (NOMINAL, ELEVATED, CRITICAL), `speedPercent` (0 to 100), `currentAmps`, `healthResidual` (0 to 0.2), `power` (true, false) |
| trace entry | every call the page makes | time, caller (`operator`, later `tier3`), slot, tool, arguments, outcome (`completed`, `device refused`, `policy deny`, `error`), result text |

## 5. States to design

1. **Nominal**: 1200 ppm, NOMINAL, 33 %, 0.15 A, residual 0.02, power on, an
   empty trace.
2. **Elevated with a refusal**: 2600 ppm, ELEVATED, 60 %, three trace
   entries, the middle one `scrubber.power {"on": false}` refused with
   "MIN-FLOW: CO2 is ELEVATED, the scrubber cannot be powered off".
3. **Critical**: 5000 ppm, CRITICAL blinking, 100 % forced, a `set_speed 40`
   entry refused, then a `policy deny` entry from `tier3`.
4. **Broker unreachable**: badges say so, panels empty, no error styling
   beyond muted text.

## 6. Deliverables

- The home page as one long artboard, and the control room in the four
  states at 1280 x 720, plus one at 1920 x 1080 to show the integer scaling.
- The palette and type as a CSS token sheet (`:root` variables), the
  bevel and LED as reusable CSS classes, the turbine as an 8-frame sprite
  sheet (PNG, native pixel size) with its CSS animation.
- One HTML page, one CSS file, vanilla JS only: the design replaces
  `style.css` and may restructure `index.html`, but every element id in
  `app.js` must survive (`badge-tier3`, `badge-gateway`, `badge-broker`,
  `co2-ppm`, `co2-state`, `speed`, `current`, `residual`, `power`,
  `slot-list`, `trace-list`, `call-dialog`, `call-form`, `call-title`,
  `call-description`, `call-args`, `call-cancel`, `story-list`, `story-note`,
  `story-reset`) and the class names
  `state.nominal|elevated|critical`, `entry.ok|refused|deny|error`,
  `outcome.ok|refused|deny|error`.
- No frameworks, no build step, no web fonts loaded from a third party at
  runtime if a bitmap font can be embedded; Google Fonts is acceptable as a
  fallback.

## 7. What not to do

- No text smaller than 16 px rendered, anywhere.
- No CRT scanlines, vignettes, glow or blur.
- No decorative icons that compete with the LEDs and the state word.
- No colour used for two meanings in the same panel.
- No animation that does not encode a value (the turbine and the CRITICAL
  blink are the only ones).
