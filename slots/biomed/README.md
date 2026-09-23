# slot `biomed`

The crew monitor: who is in which module, and how they are doing while a
procedure degrades the air they breathe.

It exists because of one line of the commissioning scenario
(`docs/mise-en-service.fr.md`): before the decay test runs, Mother has to
know that two operators are working in the Lab, ask the commander, and put
them under monitoring for the duration. Presence is what makes the
authorisation necessary; the heart rates are what make the abort conditions
real.

Named `biomed`, not `crew`, because `crew.report` and `crew.ask` were already
taken: they are the in-process capabilities through which the agent speaks to
the people on board (`tier3/lib/capabilities.ts`). `biomed` is also what the
job is called on a real crewed vehicle.

## Tools

| tool | what |
|---|---|
| `describe` | the source, the roster, the nominal band, the open session; says plainly when the readings are simulated |
| `presence` | the occupants of every module, read before anything is opened |
| `monitor_start` | opens a session over the people in the given modules, for the duration of a procedure |
| `monitor_stop` | closes it and returns the record |
| `report` | a Bluetooth gateway hands over one reading |
| `state` | every monitored subject: last rate, band, status |
| `verdict` | one line for a procedure's abort list |
| `move` | puts a subject in a module: the demo's presence sensor until there is one |

Resources: `biomed://state`, `biomed://session`, `biomed://trace/{subjectId}`.

The habitat agent may read this slot and never command it: `describe`,
`presence`, `state` and `verdict` are in its catalogue, `monitor_start`,
`monitor_stop`, `report` and `move` are excluded. Mother opens the session,
the commander authorises it, a gateway feeds it. Whoever watches is not
whoever acts.

## It never stops anything

`verdict` says `abort: true` with a reason; the procedure reads it and
decides. A slot that both measured and commanded would be the exact mistake
this repository is about.

Three reasons, and the third is the one people forget:

1. a monitored subject out of the nominal band for longer than
   `sustainedBreachSeconds` (a single beat out of place is recorded, not
   acted on);
2. monitoring lost for longer than `signalLostAfterSeconds`; silence is not
   a nominal reading;
3. someone who was not in the module when the commander authorised the test
   walks into it. The authorisation covered the people who were there.

## The source

`profiles/biomed.json`, section `biomed`: the roster, the band,
`provider`. `BIOMED_PROVIDER` overrides it; the tests run on `simulated`.

| provider | what is behind it |
|---|---|
| `simulated` | a resting rate that drifts and breathes, deterministic for a seed. `live: false`, so **the slot publishes itself as a stub** and every sample carries `source: "simulated"`. A rehearsal cannot be passed off as a measurement |
| `polar` | a real chest strap, read by a Python sidecar the slot spawns itself, one process per person (`scripts/polar-h10-bridge.py`, `npm run biomed:setup` for `bleak`). `live: true`, the stub flag is gone |
| `bridge` | a real strap read by something else entirely (a phone, an MQTT client), pushing each reading through `report`. Same honesty, another transport |

The band is 45 to 120 bpm: a working adult at a bench, not asleep and not
running. Wide enough that moving about does not cry wolf, narrow enough that
a real problem leaves it. One number in one place so a reviewer can argue
with it; the roster overrides it per person.

## The strap, and why the radio is not in here

A Polar H10 publishes the standard BLE Heart Rate Service (`0x180D`,
characteristic `0x2A37`): a rate in beats per minute and, when the device
sends them, the beat-to-beat intervals. That is what this slot holds.

It does **not** give an ECG waveform. The H10 has one, but on Polar's own
service at 130 Hz, which is a different job and is not this. So anything
drawn on a screen is drawn from beats and intervals: a real tachogram, one
tick per beat at its real spacing. Drawing a plausible ECG squiggle from a
number would be inventing data, which is the one thing this repository does
not do.

A BLE peripheral has no address a server can dial, so something has to hold
the connection. On Windows the usual Node BLE packages want a WinUSB driver
swapped under the Bluetooth adapter, which takes the adapter away from
everything else on the machine. `bleak` talks to the operating system's own
stack with nothing installed and no driver touched, so the radio lives in a
Python sidecar the slot spawns and reads line by line. From outside, the slot
owns its radio; inside, the machine keeps its Bluetooth.

    npm run biomed:setup      pip install -r requirements.txt, which is bleak
    npm run biomed:strap      the decoder, against frames from the specification
    npm run biomed:scan       the straps in range, with their addresses

With `polar`, the slot asks the interpreter for `bleak` when it comes up
(`python`, or `BIOMED_PYTHON`). Without it the slot is not ready,
`monitor_start` refuses, and the page says why on its standby screen, with the
command to run: otherwise a missing package would show only as a signal lost
a few seconds into a session, which reads like a strap that slipped off.

`biomed:strap` needs neither a radio nor `bleak`: it checks the decoding of
the Heart Rate Measurement characteristic against frames built from the
specification (8 and 16 bit rates, sensor contact, energy expended, one and
two intervals, an empty frame). Worth running before trusting a number: a
wrong shift shows a plausible heart rate that is simply false, which is the
one failure this project cannot afford.

Binding a strap to a person is `straps` in `profiles/biomed.json`. Without an
address the sidecar takes the first strap it finds, which is fine for one
person and wrong for two; `npm run biomed:scan` prints the addresses. A Polar
H10 advertises only when it is worn and damp at the electrodes, and it talks
to one host at a time, so a phone app holding it will keep the sidecar from
finding it.

## The words

The panel speaks en-US and holds no text of its own. Every sentence is a keyed
phrase in `grammars/default/en.json` (the reference locale, phrases only: the
tools' English stays inline in `provider.ts`, which is its one place) and
`grammars/default/fr.json`, same keys and same holes, checked at publish.
`?locale=fr` picks the French one, as on every other page of the demo.
Numbers are formatted for the locale, which is why 2,800 reads 2 800 in
French.

`dashboard/prototypes/vitals-panel.html` is the style prototype. It carries a
copy of the dictionary so it runs on its own; wired to the broker,
`harness/browser/words.ts` reads `grammar://phrases` off the page's session
and that copy goes away.

## Status

Built on 2026-09-22: the service, the three providers, the slot, the grammars
(five families plus the panel phrases in two locales), 6 tests, the page
(`dashboard/biomed.html`) and the Python sidecar with its decoder self-test
(7/7). Not built: the abort conditions wired into the `procedure` topic, and
the commander's authorisation on the Control Board, which is what should open
a session instead of `npm run biomed:start`.
