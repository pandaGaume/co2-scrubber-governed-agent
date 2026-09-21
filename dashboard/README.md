# Dashboard

Two static pages, served by the broker from this folder (`www.mounts` in
`.mcp-broker/config.json`), no build step:

- `index.html`, the home: the thesis, the tier picture, the three layers that
  decide a call, the four slots, the six steps, real versus simulated, the
  licenses. Reading only; the door leads to the control room.
- `factory.html`, the factory's page: the studio on the factory's document,
  opened by the server next to the board; it replays the steps of the
  factory's tasks (`harness/browser/factory-page.ts`).
- what the station says and the factory's page shows about a task are the
  `phrases` of the factory slot's grammar files (`slots/factory/grammars/`),
  read by each page on its MCP session in its language (`grammar://phrases`);
  no sentence lives in code. `vendor/mcp-http-client.js` sends the page's
  `capabilities.locale` for that.
- `panel.html`, the control room: a 1280 x 720 stage scaled to the window,
  four regions. STORY (the six steps, one button each; the pill under a step
  shows the expected outcome, then what actually happened), CABIN (CO2 in ppm
  and its state, the turbine sprite turning at the speed, three gauges with
  their marks, the power LED), SLOTS (the providers behind the broker with
  their tools; a button calls the tool through the broker), MCP TRACE (every
  call, newest first: time, caller, tool, arguments, outcome, result).

`app.js` talks to the broker as any MCP client does, over Streamable HTTP,
with the client from the broker's own samples (`vendor/mcp-http-client.js`).
The badges come from `config.json` (the active Tier 3 profile, the gateway)
and from the broker's `serverInfo`.

## Design

1990s pixel art, from `DESIGN_BRIEF.md`: fourteen colours as CSS variables in
`style.css`, Press Start 2P for titles and VT323 for everything else, 2 px
bevels, no rounded corners, no shadows, no scanlines. The turbine sprite
(`turbine.png`, 256 x 32, eight frames of 32 x 32) is drawn at 3x and stepped
through `steps(8)`; its period follows the speed and it stops when the power
is off. Only the CRITICAL state blinks (2 Hz). The haze over the cabin
thickens with the CO2 state.

The opening scene of the home (`moon-night.png`, 448 x 200, eighteen
colours) is drawn pixel by pixel by `art/moon-night.py` (standard library
only, `python dashboard/art/moon-night.py` regenerates it): the habitat on
its legs, the dead solar array, the battery bank at 41 %, the console glow in
the first window, the crew asleep behind the other two, the Earth nearly
full. The page lays the mission strip and the message box over it, the way a
1990s adventure game shows a line of dialogue. `--card` writes the same
scene as the video's title card (`moon-night-card.png`, 1280 x 720) with the
strip and the box burned in, lettered with a 5 x 7 bitmap font; the README
opens on it.

The fonts are fetched from Google Fonts for now; both are OFL and should be
self-hosted here before the shoot, so the demo runs without a network.

## What the video needs (from `video/storyboard.md`)

Done: the permanent badge naming the active Tier 3 provider and its endpoint
host; the caller on every trace line; the three outcomes visually distinct
(green completed, orange device refused, red policy deny).

Not yet: the model name on the trace lines (needs the real Tier 3 client),
the raw request and tool call of one deliberation on demand, the profile
switch, the scorecard of the providers on the same scenario.

Status on 2026-09-18: both pages work against the local broker and the four
stub slots (`npm run server`); the policy deny outcome appears once the
broker's authorization is enabled.
