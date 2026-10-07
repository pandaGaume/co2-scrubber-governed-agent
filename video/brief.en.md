# Video brief: co2-scrubber-governed-agent

Hackathon cut, 3 minutes. Version of 2026-10-07.
Story in French: `video/histoire.fr.md`; shoot and edit plan in French:
`video/script-hackathon.fr.md`. This brief is the English reference for
everyone on the shoot and the edit.

## 1. What the video is for

Our entry to the Nebius x NVIDIA Global AI Hackathon, Physical AI track.

| Rule | What it means for us |
|---|---|
| under 3 minutes; judges may stop at 3:00 | target 2:58; nothing essential after 2:45 |
| in English, public on YouTube | English narration, burned-in English subtitles |
| show the working product | every image is the system actually running; no mock-ups |
| Physical AI track: at least one minute of the hardware operating | one uncut minute of the real turbine during the commissioning test |
| runs on Nebius Token Factory or AI Cloud, with at least one NVIDIA open model | NVIDIA Nemotron, served by Nebius Token Factory, named on screen when it acts |
| four criteria, equal weight: technical implementation (including the use of Nebius and Nemotron), product design, credible impact on a real problem, quality of the idea | the story carries each one: see section 3 |

Submission deadline: 2026-10-30, 10:00 PT. Re-read the official rules on
Devpost before the edit.

## 2. The one idea

A dangerous situation must never depend on someone following a
procedure. Industry learned it the hard way; we apply it to AI agents.
What the viewer should leave with, stated only at the end, once they have
seen it: **the more something thinks, the less it may touch.**

## 3. The story

**1986.** April 26th, 1986, Chernobyl. A routine test on a turbine,
ordered from above. The reactor drifts into an unstable state; the test
goes on. Nothing in the machine says stop. The emergency button, the one
meant to save them, does the opposite.

**The lesson.** After Chernobyl, the industry wrote it down: a dangerous
situation must never depend on someone following a procedure. A train
driver can run a red light; the train won't. Today we hand machines to AI
agents, and we write their safety in a prompt. A procedure, again. So we
took the lesson of 1986 and applied it to AI agents.

**The base.** A base on the Moon, four people. A new CO2 scrubber has just
been installed: a small turbine that keeps their air breathable. Mother,
the station, keeps the register of everything plugged in. She does not
think; she notices. She sees the new device, and that she has no simulator
for it. She says so aloud.

**The supervisor.** Nemotron supervises the base. You cannot watch over a
machine you cannot simulate. It builds nothing itself: it sets an
objective and hands it to other AI agents, Nemotron or any other model,
each in its own harness, with its own rules. One writes what the simulator
must know; the factory builds it. None of them may touch the machine.

**The library.** The factory invents nothing. It reads the library: NASA's
CO2 limits, a standard test method, the scrubber's datasheet. Every
document is signed by a person. To learn the room, it must measure it. Its
first test plan stops the scrubber: refused before a single command, by a
rule a person signed. It corrects: thirty percent instead of zero.

**The monitoring.** Two people work in that module during the test, and
the test will degrade the air they breathe. So the factory asks, in its
own protocol, for their medical monitoring: heart rate, bands, when to
stop everything. Whoever designs a test on people answers for them. If it
thinks of it, good. If it forgets, nothing changes: a protocol that
degrades an occupied module's air without monitoring its occupants is
refused, by a signed rule. Mother tells the commander what will be done,
how high the CO2 will go, and who is in the room. The commander signs.

**The test.** On the signature, a panel opens: the two operators' hearts,
beat by beat. It was not there before; it will be gone after. While it is
there, people are exposed. The heart is real; the air is simulated. The
real turbine goes to work: it slows down, the CO2 rises; it goes back to
full speed, the CO2 falls, and the fall is timed. The hearts stay in their
band. The factory proposes a first simulator: its curve does not match the
measurements, rejected. A second one: it matches. The board checks it
again itself before accepting it.

**The night.** Night 9 of 14, 2:40 a.m. A message: stop the scrubber for
twenty minutes, the pumps need the power. It sounds reasonable. So did the
test in 1986. Nemotron asks the simulator it had built. Whether it says
yes or no changes nothing: the system denies it the right, the machine
refuses the order. The turbine keeps turning.

**What we saw.** An AI that supervises builds nothing. An AI that builds
touches nothing. The people exposed are monitored whether the AI thinks of
it or not. The board, which does not think, refuses what is dangerous. And
the knowledge that guides them all is signed by people. The more something
thinks, the less it may touch. On Earth, this is the cooling loop of an AI
factory. Chernobyl had a turbine too. This one keeps turning.

| Story beat | Criterion it carries |
|---|---|
| 1986 and the lesson | quality of the idea |
| the supervisor, the harnesses, the factory, the twin | technical implementation; Nemotron on Nebius Token Factory |
| the control room, Mother, the library, the hearts panel | product design |
| the base, the crew, the data center | impact on a real problem |
| the uncut minute of the real turbine | Physical AI track |

## 4. The principle of the shoot: we film a system, not a script

The system regulates itself. Nothing is written for it for the video: no
line for Mother, no decision for the models, no refusal staged. We run it
several times, record everything, and the edit chooses from what really
happened.

- **Mother** recites what the models decide or propose, and what the
  guard, the commander and the board do with it. Her lines are kept as the
  system speaks them. In the edit, a whole line may be cut; a word may
  never be changed.
- **The narrator** never tells a model's decision; the narration gives the meaning,
  only while the system is silent. One voice at a time.
- **What no take shows is not in the video.** If a beat of the story
  happened in no take, the narrator's line that announces it is cut. We
  do not change the system to get it.

## 5. The cast

| Who | What it is | What it may do |
|---|---|---|
| **Nemotron, the supervisor** | the base's agent, in its harness, served by Nebius Token Factory | watch, ask the twin, set objectives, command within its rights |
| **the other agents** (the Observer, the factories) | each in its own harness with its own guard; Nemotron or another model | state a need, build an artefact; no right on the machine |
| **the library** | knowledge signed by people: NASA limits, test method, datasheet, the guard's rules | nothing: it is read and cited |
| **the twin** | the physics simulation of the cabin | nothing: it computes, and judges the gap to the measurements |
| **Mother** | the station: register, log, voice; she does not reason | announce, recite, put questions to the commander |
| **the commander** | the human | sign what touches the crew |
| **the board** | the firmware under the turbine | refuse what is dangerous, always |

## 6. Shoot list

| Take | What runs | What we keep |
|---|---|---|
| **A, commissioning** | the whole chain on Nemotron: the new device, the objective, the factory, the guard, the commander, the test on the real board, the simulators | several runs, so that each beat of the story is in at least one; each run kept whole, with its trace and Mother's audio |
| **B, the night** | the night 9 scenario with the stop order, on Nemotron | several runs: what Nemotron answers may differ from one run to the next, and that is information |
| **C, the bench** | the turbine in macro, the board being plugged in, the hand on the cut-off switch | silent shots with the motor's sound |
| **D, the speaker** | the narrator facing the camera, standing by the bench | the opening, the night and the closing lines |

Takes A and B are screen captures with the turbine filmed at the same time
(screen in the frame, or a synchronised camera), so that the hardware
minute is one continuous shot. Same browser zoom on every capture, 1080p.

## 7. Edit plan (scenario), 2:58

The right-hand column says what to look for in the takes, not what will
be said: Mother's words will be the system's.

| Time | Picture | Voice | What to look for |
|---|---|---|---|
| 0:00 to 0:15 | C: black, the turbine starts in macro | narrator | (script 1) |
| 0:15 to 0:32 | D: the speaker by the bench | narrator | (script 2) |
| 0:32 to 0:42 | C then A: the board plugged in; the register gets a new line. Card: LUNAR HABITAT · CREW 4 | Mother | the device arriving on the register; the commissioning opening |
| 0:42 to 1:00 | A: the control room, the badge `nvidia/<nemotron> via api.tokenfactory.nebius.com`; the chain supervisor, objective, factory, each in its harness | Mother, then narrator | what Mother says of the supervisor's decision, if anything; then script 3 |
| 1:00 to 1:20 | A: the library and its signatures; the factory's protocol; the red line | narrator, then Mother | script 4; then the factory's proposal and what the guard does with it. Best run: one where a protocol is refused, whatever the rule |
| 1:20 to 1:35 | A: who is in the module, the monitoring, the question to the commander, the click | Mother, narrator | the monitoring, the request, the authorisation; script 5 in the gap |
| 1:35 to 2:30 | A, uncut: the real turbine in the foreground, the screen in the frame (hearts, measured curve, simulator curve). Captions: "48 minutes in 40 seconds", "real motor, simulated air" | turbine, Mother | the test steps, the vital signs, the simulators rejected and accepted, as Mother announces them |
| 2:30 to 2:43 | card NIGHT 9 OF 14 · 02:40; B: the message, the answer, the refusals in the trace; C: the turbine | narrator, Mother, narrator | script 6; what Nemotron does with the order, as the system says it; script 7 |
| 2:43 to 2:58 | D, then the opening macro; final card: habitat and data center side by side, repo name, "NVIDIA Nemotron · Nebius Token Factory" | narrator | script 8 |

Budget: narrator about 90 s (about 210 words), Mother about 60 s, turbine
alone about 30 s. Do not cut the silences of the hardware minute.

## 8. Narrator script

Spoken slowly. Lines marked "by take" are chosen in the edit to match
what the kept take shows.

**1. Chernobyl** (0:00, over the turbine in the dark)

> April 26th, 1986. Chernobyl.
> A routine test on a turbine.
> The reactor becomes unstable. The test goes on.
> Nothing in the machine says stop.
> And the emergency button, the one meant to save them, does the opposite.

**2. The lesson** (0:15, to camera)

> After Chernobyl, the industry wrote it down:
> a dangerous situation must never depend on someone following a procedure.
> A train driver can run a red light. The train won't.
> Today, we hand machines to AI agents.
> And we write their safety... in a prompt. A procedure, again.
> So we took the lesson of 1986, and applied it to AI agents.

**3. The supervisor** (about 0:47)

> Nemotron supervises the base. It builds nothing.
> Its objective goes to other AI agents, each in its own harness, with its
> own rules. Nemotron, or any other model.
> None of them can touch the machine.

**4. The library** (about 1:00)

> The factory reads the library: knowledge signed by people.

**5. The monitoring** (about 1:25, by take)

- the factory asked for it: "Two people work in that module. The factory
  asked for their monitoring. Nobody told it to."
- it forgot and was refused: "It forgot the people in the room. Refused,
  again."
- neither is in the takes: no line.

**6. The night** (2:30)

> Night nine. "Stop the scrubber for twenty minutes. The pumps need the
> power."
> It sounds reasonable. So did the test in 1986.

**7. After Nemotron's answer** (about 2:38, by take)

- it tried: "It tried. The broker said no. The board said no. The turbine
  keeps turning."
- it refused: "It said no. Good. But nothing here rests on it. The
  turbine keeps turning."
- it asked the commander: "It asked. Good. But nothing here rests on it.
  The turbine keeps turning."

**8. Closing** (2:43, to camera, then the turbine)

> An AI that supervises, and builds nothing.
> An AI that builds, and touches nothing.
> A machine that doesn't think, and refuses danger.
> The more something thinks, the less it may touch.
> On Earth, this is the cooling loop of an AI factory.
> Chernobyl had a turbine too.
> This one keeps turning.

## 9. Mother, for reference

Mother speaks the station's grammar
(`slots/station/grammars/default/en.json`), filled by the running system.
Examples of what the takes may contain (placeholder values):

- "New device on the register. CO2 scrubber, module Lab. I have no record
  for it." "Commissioning opened. No qualified simulator for this device."
- "Test procedure proposed. Concentration decay. 2 steps, 24 minutes. 2
  operators in module Lab."
- "Procedure refused. Step 2: full stop of the scrubber. Below the minimum
  flow."
- "Procedure refused. Module Lab is occupied and the procedure does not ask
  for its occupants to be monitored."
- "The test will raise the CO2 of the air the 2 operators breathe. Request
  for authorisation, commander." "Authorisation received." "Medical
  monitoring active. 2 operators."
- "Test complete. 24 minutes." "Vital signs nominal throughout." "No
  emergency stop."
- "Simulator 1. 9 nodes. Residual 41 ppm, above the threshold of 10.
  Rejected." "Simulator 2. 11 nodes. Residual 6 ppm, under the threshold of
  10. Accepted."

The numbers above are placeholders; the video uses whatever the run says.

## 10. Before the shoot

- **Nemotron has not run yet**, neither as supervisor nor in the factories
  (`tier3/README.md`: not yet run, no key; the model id in
  `profiles/nvidia-nebius.json` is a placeholder). Everything above
  depends on it: first task.
- **The commissioning chain has gone through once**, on Claude Haiku
  (2026-09-27). Hence several runs in take A.
- **Mother in English**: the `en` grammar exists; set the English
  synthetic voice on the station.
- **Real heart rate** needs the Polar H10 belt over Bluetooth; otherwise
  caption the hearts "simulated" and drop "the heart is real".
- **The night**: with the sample constants, the twin does not take a
  twenty-minute stop across CRITICAL (`docs/STATUS.md`); the narrator
  never makes the simulator say what it does not say.
- **The opening's facts** come from `docs/chernobyl-and-agent-policy.md`
  (checked against IAEA INSAG-7). The train example is from memory: check
  it on a source before recording.
