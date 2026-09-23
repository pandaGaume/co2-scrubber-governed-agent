# Running the demo in a room

How to set the demo up in a room with several machines: one laptop that runs
it, PCs and Macs that show its pages on their screens, tablets and phones
that open a page by scanning a code. What to install where, how the pieces
talk to each other, and what to check before the audience comes in.

*Written on 2026-09-23. The story of the demo is in the `README.md`; the
tiers and the broker's policy in `docs/ARCHITECTURE.md`; the event log and
its push in `docs/runtime-events.md`.*

## 1. The architecture in one page

One machine runs everything. The others only open web pages.

```
                       THE SERVER (one laptop, Windows or Mac)
  +-------------------------------------------------------------------------+
  |  npm run server: one Node process                                        |
  |                                                                          |
  |   mcp-broker :3001  <-- the only way in: policy, audit, routing          |
  |     |   serves dashboard/ (the pages) and /studio (SpikyPanda's editor)  |
  |     |                                                                    |
  |     +-- slots: scrubber  twin  station  factory  reasoner  agent         |
  |                scenario  speech  biomed  qr  screens  workspace  model   |
  |                                                                          |
  |   discovery   UDP :41234  <-- "where is the demo?" answered here         |
  +-------------------------------------------------------------------------+
        ^  HTTP (MCP calls)          |  SSE (pushes: what changed)
        |                            v
  +------------+   +------------+   +------------+   +------------------+
  | control    |   | screen A   |   | screen B   |   | tablet / phone   |
  | room       |   | agent loop |   | twin graph |   | the night, the   |
  | (server's  |   | (a PC)     |   | (a Mac)    |   | medical module   |
  | own screen)|   |            |   |            |   | (scanned a code) |
  +------------+   +------------+   +------------+   +------------------+
```

**The broker** (`@cyanmycelium/mcp-broker`) is the only door. Every call a
page, the agent or a script makes goes through it, is checked against the
policy and lands in the audit log. It also serves the pages, so there is one
address to reach and one port to open.

**The slots** are the parts of the system, each an MCP server behind the
broker: `scrubber` (the machine), `twin` (the cabin's physics), `station`,
`factory`, `reasoner` (the language model), `agent` (the agent that runs the
night), `speech` (the voice), `biomed` (the medical module), the workshop
tools the factory builds with (`workspace`, `model`), and two for the room
itself: `qr` (codes for phones) and `screens` (the room's displays). They all
run in the same Node process as the broker.

**The pages** are plain web pages. The loop pages (the agent's loop, the
factory, the twin's graph) are the SpikyPanda studio, the node editor, opened
with an extension that draws the graph and follows what happens to it.

**Nothing polls.** When something changes, the slot that knows it pushes a
standard MCP notification (`notifications/resources/updated`), and the
broker hands it to every page that follows that slot, on a stream the page
keeps open (`/<slot>/sse`). The agent's steps, the model's calls, the twin's
answers, the factory's steps and the screens' assignments all travel this
way. A page reads by itself only when it opens, or when its stream dropped.

**The screens** are how the room is driven from one place. A machine opens
`screen.html` once; it gets a code (`A`, `B`, `C`...) and shows it large. From
the control room, any page is sent to a screen by its code, and the screen
shows it full window until it is told something else.

## 2. What to install

### 2.1 The server (one machine)

It needs the most, because it runs everything. Windows 10/11 or macOS.

| What | Why | Windows | macOS |
|---|---|---|---|
| Node.js 22 LTS (tested with 22.20) | runs the broker and the slots | `winget install OpenJS.NodeJS.LTS` | `brew install node@22`, or the installer from nodejs.org |
| Git | to get the two repositories | `winget install Git.Git` | `xcode-select --install` |
| Chrome or Edge | the control room | installed with Windows (Edge) | `brew install --cask google-chrome` |
| Python 3 (optional) | only for the medical module's heart-rate strap | `winget install Python.Python.3.12` | `brew install python` |

The two repositories side by side, because the broker serves the studio from
the SpikyPanda checkout (`.mcp-broker/config.json`, `../../../spikypanda`):

```
<some folder>/
  spikypanda/                          the substrate: the studio, its plugins
  Gaume/co2-scrubber-governed-agent/   this repository
```

Then, once:

```sh
# the studio's bundles (packages/host/www/bundle is generated, not in git)
cd spikypanda
npm install
npm run build:all

# the demo
cd ../Gaume/co2-scrubber-governed-agent
npm install
npm run build
npm test                 # every test should pass
```

The keys, in a `.env` file at the root of this repository (copy
`.env.example`; git ignores it):

| Variable | For | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY`, `NEBIUS_API_KEY` or `OPENAI_API_KEY` | the language model behind the `reasoner` slot (the profile names which one) | the agent runs scripted: same loop, no model, no cost; the control room says so |
| `ELEVENLABS_API_KEY` | the station's voice | the voice is silent; everything else works |

For the medical module's strap (Polar H10 over Bluetooth), once:
`npm run biomed:setup`, then `npm run biomed:scan` to find the strap.

### 2.2 A screen (PC or Mac)

**Only a browser.** Chrome, Edge or Safari, recent.

To open the screen page without typing an address (section 4), add
**Node.js 22 LTS** (same commands as above) and copy **one file**,
`scripts/screen.mjs`, from this repository to the machine: a USB key, a
shared folder, a message to yourself. It has no dependency and needs no
`npm install`.

### 2.3 A tablet or a phone

Nothing. Its camera reads the codes the control room shows (section 5).

## 3. The network

All the machines on **the same local network**, and one that lets them see
each other: some guest and hotel networks isolate every device ("client
isolation"), and then nothing below works. A small router of your own, or a
phone's hotspot, avoids the question.

On the server, two things must be let in:

| Port | Protocol | For |
|---|---|---|
| 3001 | TCP | the pages and every MCP call |
| 41234 | UDP | the screens asking where the demo is (`screen.mjs`) |

- **Windows**: the first time `npm run server` runs, Windows asks whether
  Node.js may accept connections. Tick **Private networks** and allow. If the
  question was dismissed: *Windows Security, Firewall & network protection,
  Allow an app through firewall*, Node.js, Private. The room's network must
  be set to *Private*, not *Public*, in the Wi-Fi settings.
- **macOS**: if the firewall is on (*System Settings, Network, Firewall*),
  macOS asks once to allow `node` to accept incoming connections. Allow.

**Keep the server's address fixed.** Screens, bookmarks and codes carry the
server's IP address (`http://192.168.x.y:3001`). If the router gives the
laptop another address on the show day, they all point at nothing. Reserve
the address in the router (a "DHCP reservation" for the laptop's MAC
address), or plug the laptop in by cable on a router of your own.

**Use the IP address, not the machine's name.** The broker lets a browser in
only from the origins it knows: `localhost` and the server's own IP
addresses, found at start. A page opened as `http://my-laptop.local:3001` is
refused (HTTP 403). The server prints the right addresses when it starts.

## 4. The day: starting it

On the server:

```sh
npm run server
```

It starts the broker and every slot, answers the screens on UDP, opens the
control room in the browser, and prints where the other devices can reach it:

```
a screen of the room (or run scripts/screen.mjs on it): http://192.168.0.127:3001/screen.html
the night, from a phone on this network:               http://192.168.0.127:3001/simulation.html
medical monitoring, on another device on this network: http://192.168.0.127:3001/biomed.html
```

The control room starts with a boot console that checks every piece. **Press
a key** when it says so: the key press is what lets the browser play sound,
and the control room is the voice's speaker.

### 4.1 Making a machine a screen

Three ways, from the easiest:

1. **With `screen.mjs`** (Node installed, section 2.2). In a terminal (on a
   Mac: *Terminal*; on Windows: *PowerShell*), in the folder where the file is:

   ```sh
   node screen.mjs
   ```

   It asks the network where the demo is, then opens the browser on the
   screen page, named after the machine. Options:

   | Option | Effect |
   |---|---|
   | `--name "left wall"` | the name shown on the screen and in the control room |
   | `--kiosk` | full screen, no browser bars (Edge on Windows, Chrome on macOS); `Alt+F4` / `Cmd+Q` to leave |
   | `--dry-run` | prints the address it found, opens nothing |
   | `--timeout 120` | seconds to keep asking (60 by default) |

2. **By hand**: open `http://<server address>:3001/screen.html` in the
   browser, once, and keep it as a bookmark or as the browser's start page.

3. **A tablet**: open the screen page from a code (section 5), or by hand.

The screen shows its code large (`A`, `B`...) and its name. **Click the name**
to rename it ("desk", "left wall"). A screen keeps its identity across
reloads; it is the same `A` tomorrow as long as the server has not restarted.

### 4.2 Sending a page to a screen

In the control room, the **Slots** strip at the bottom lists the slots. A slot
that serves a page carries three small buttons after its name:

| Button | Does |
|---|---|
| the code glyph (the row itself) | shows the page's address as a QR code, for a phone (section 5) |
| the box with an arrow | opens the page in a window of the server's own browser |
| the screen | lists the room's screens; **click one to send the page to it** |

The list shows each screen's code, name, whether it is online and what it
shows. The screen switches at once. Clicking the screen that already shows
this page takes it back to its code.

The pages that can be sent:

| Slot | Page | What it shows |
|---|---|---|
| `agent` | the agent's loop | the twelve stages of the agent's decision loop lighting up as it decides, the run monitor, the cabin's CO2 and speed |
| `twin` | the twin's graph | the cabin's physics graph; every question the agent asks the twin, replayed minute by minute, with the studio's time-series tiles |
| `factory` | the factory | the factory's loop replaying each step of a task, the reward and the time per step |
| `scenario` | the night, in hand | the night's events, to play them one by one (meant for a phone) |
| `biomed` | the medical module | the heart-rate monitoring (meant for a tablet) |

The three loop pages follow what runs on the server by themselves: a night
played from the phone lights the agent's loop on the screen that shows it,
with nobody touching that screen.

## 5. The QR codes (tablets and phones)

A phone cannot use `localhost`: that would be the phone itself. The address
it needs is the server's on the room's network, which a page opened at
`localhost` cannot know. So the control room asks the `qr` slot, which runs
on the server and knows it.

In the control room's **Slots** strip, **click a row that carries the code
glyph** (a small square of dots after the slot's name): a large code appears
above the strip, with the address under it. Point the tablet's camera at it
and open the link. Click the row again, or press `Esc`, to close it.

A tablet can also become a screen: scan the code of any page, then change
the end of the address to `/screen.html`, or open that address by hand once
and keep it on the home screen.

## 6. Before the audience comes in

- [ ] The server is on the room's network, with its reserved address; it was
      started with `npm run server` and the boot console shows every slot `OK`.
- [ ] A key was pressed in the control room (the sound is on: *SOUND ON*).
- [ ] Every screen shows its code, and the control room lists it **online**.
- [ ] Each screen was sent its page, and shows it.
- [ ] The tablets opened their pages from the codes.
- [ ] One event of the night was played from the phone, and the agent's loop
      lit up on its screen (then reset the agent from the phone).
- [ ] The laptop's sleep is off, and so is every screen's.

## 7. When something does not work

| Symptom | Likely cause | What to do |
|---|---|---|
| `screen.mjs` says "no answer" | the server's firewall blocks UDP 41234, or the network isolates devices | allow Node through the firewall (section 3); try a phone hotspot; or open `/screen.html` by hand |
| A page on another machine loads but stays empty or says "not reachable" | the page was opened with a name, not the IP address (the broker answers 403) | open it with the address the server printed |
| Every screen stopped working after a restart of the router | the server's address changed | reserve the address; restart `screen.mjs` on the screens |
| A screen shows "offline" in the control room | it has not been heard from for a minute (sleeping, closed, network) | wake it; it comes back by itself |
| Screens show different codes than before | the server restarted: it keeps the list in memory, and the screens registered again in a new order | nothing to fix; send the pages again |
| The loop pages are blank, or the studio does not open | the SpikyPanda checkout is missing, not beside this one, or not built | section 2.1: `npm run build:all` in `spikypanda/` |
| No sound | no key was pressed in the control room, or no `ELEVENLABS_API_KEY` | press a key; check `.env` |
| The control room says "scripted agent" | the model's key is missing or wrong | the demo runs scripted; add the key to `.env` and restart the server |
| A screen shows its page but it does not move | its push stream dropped; it falls back to looking every 15 s | wait, or reload the screen page |
