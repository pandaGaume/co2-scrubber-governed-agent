# Procedure card: a critical health alarm, from raised to closed

How the station handles a critical health alarm raised for a crew member, whoever raises it (the crew, the medical panel) and whatever the heart rate reads. The medical monitor (the `biomed` slot) holds the alarm through its lifecycle and escalates it on these timings; Mother says each step; a test that exposes the person stops, and no procedure may expose them, until the alarm is closed.

**Status:** to be reviewed and signed by a person, on the library page of the control room (`library.html`) or with `npm run library:sign -- health-alarm-procedure "<name>"`. Until it is signed, and as soon as it or its facts change after being signed, the monitor still escalates on these timings (an alarm is never left silent) and Mother says that the procedure is not signed.

## The lifecycle

An alarm goes through four steps, in this order; a step out of turn is refused.

1. **Raised.** Someone saw it: who, what, when. The test that exposes the person stops at its next verdict, and no procedure may expose them.
2. **Acknowledged.** Someone says they have it in hand: who, when.
3. **In treatment.** What is done for the person, by whom; recorded again as the treatment goes on.
4. **Closed.** The person is safe, said by someone who holds that authority (the commander, `mcp.tools.authorise`), with the resolution. Only then may a test expose them again.

## The escalation, and which side of each timing is safe

| Fact | Value | Safe side | What happens |
|---|---|---|---|
| `alarm.acknowledgeWithinSeconds` | 60 s | at or below | An alarm not acknowledged by then rises to level 1: Mother calls the commander. |
| `alarm.escalateAfterSeconds` | 180 s | at or below | Still not acknowledged by then, level 2: Mother calls all the crew to the module and informs Ground. |
| `alarm.treatWithinSeconds` | 300 s | at or below | Acknowledged and no treatment recorded by then: Mother reminds it, every this long. |

These timings are a first proposal (2026-10-11), to be set by the crew's medical officer: a shorter timing is safer, a longer one is not.
