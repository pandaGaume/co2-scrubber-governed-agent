/**
 * The biomed monitor: presence, the session the commander authorises, the
 * readings, and the three reasons a procedure has to stop.
 *
 * No broker and no radio here: the service is the part that decides, and it
 * decides the same way whether the beats come from a chest strap or from the
 * simulated provider. What is tested is the judgement, not the transport.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CrewService, type Subject } from "../slots/biomed/service.js";
import { SimulatedProvider } from "../slots/biomed/providers/simulated.js";
import { BridgeProvider } from "../slots/biomed/providers/bridge.js";

const ROSTER: Subject[] = [
    { id: "fe-1", callsign: "FE-1", module: "lab", restingBpm: 64 },
    { id: "fe-2", callsign: "FE-2", module: "lab", restingBpm: 58 },
    { id: "cdr", callsign: "CDR", module: "hab-b", restingBpm: 60 },
];

const sample = (subjectId: string, bpm: number, at: Date) => ({ subjectId, bpm, rrMs: [Math.round(60000 / bpm)], at: at.toISOString(), source: "polar-h10" });

const service = (options = {}) => new CrewService(ROSTER.map((s) => ({ ...s })), { sustainedBreachSeconds: 10, signalLostAfterSeconds: 15, ...options });

describe("the biomed monitor", () => {
    it("says who is in which module before anything is opened", () => {
        const lab = service().presence().find((m) => m.module === "lab");
        assert.equal(lab?.occupants, 2, "the two operators of the commissioning scene are in the Lab");
        assert.deepEqual(
            lab?.subjects.map((s) => s.callsign),
            ["FE-1", "FE-2"],
        );
    });

    it("monitors the occupants of the module under test, and refuses an empty one", async () => {
        const s = service();
        const session = await s.start(new SimulatedProvider({ periodMs: 60_000 }), { reason: "decay test", procedureId: "decay-01", modules: ["lab"] });
        assert.deepEqual(session.subjectIds, ["fe-1", "fe-2"], "the commander authorised over the people in the Lab");
        assert.equal(session.live, false, "a simulated heartbeat is a rehearsal and the session says so");
        await s.stop("test over");
        await assert.rejects(() => s.start(new SimulatedProvider(), { reason: "x", modules: ["airlock"] }), /nobody is in airlock/);
    });

    it("calls for an abort only once a breach is sustained", async () => {
        const s = service();
        const bridge = new BridgeProvider();
        await s.start(bridge, { reason: "decay test", modules: ["lab"] });
        const t0 = new Date("2026-10-14T21:10:00Z");
        bridge.accept(sample("fe-1", 70, t0));
        bridge.accept(sample("fe-2", 62, t0));
        assert.equal(s.verdict(t0.getTime()).abort, false, "two nominal rates are not a reason to stop");

        // FE-1 goes over the band; the breach is recorded at once, but a
        // procedure does not stop on a single beat out of place.
        const t1 = new Date(t0.getTime() + 2000);
        bridge.accept(sample("fe-1", 148, t1));
        assert.equal(s.state(t1.getTime()).find((x) => x.subjectId === "fe-1")?.status, "out-of-band");
        assert.equal(s.verdict(t1.getTime()).abort, false, "two seconds out of band is not sustained");

        const t2 = new Date(t0.getTime() + 14_000);
        bridge.accept(sample("fe-1", 150, t2));
        const verdict = s.verdict(t2.getTime());
        assert.equal(verdict.abort, true);
        assert.match(verdict.reason, /FE-1: 150 bpm outside 45 to 120 for 1[0-9] s/);
        assert.equal((await s.stop("aborted")).events.length, 1, "the session keeps the record of what was not nominal");
    });

    it("treats a silent source as a reason to stop, not as a nominal reading", async () => {
        const s = service();
        const bridge = new BridgeProvider();
        await s.start(bridge, { reason: "decay test", modules: ["lab"] });
        const t0 = new Date("2026-10-14T21:10:00Z");
        bridge.accept(sample("fe-1", 70, t0));
        bridge.accept(sample("fe-2", 62, t0));
        const late = t0.getTime() + 20_000;
        assert.equal(s.state(late).find((x) => x.subjectId === "fe-1")?.status, "signal-lost");
        assert.match(s.verdict(late).reason, /medical monitoring lost/);
        assert.equal(s.verdict(late).abort, true);
    });

    it("ends the authorisation when someone else walks into the module under test", async () => {
        const s = service();
        const bridge = new BridgeProvider();
        await s.start(bridge, { reason: "decay test", modules: ["lab"] });
        const t0 = new Date("2026-10-14T21:10:00Z");
        bridge.accept(sample("fe-1", 70, t0));
        bridge.accept(sample("fe-2", 62, t0));
        assert.equal(s.verdict(t0.getTime()).abort, false);
        s.move("cdr", "lab");
        const verdict = s.verdict(t0.getTime());
        assert.equal(verdict.abort, true, "the commander authorised the test over the people who were in the room");
        assert.match(verdict.reason, /CDR entered lab/);
    });

    it("refuses a reading for someone nobody asked to watch, and a rate no heart has", async () => {
        const s = service();
        const bridge = new BridgeProvider();
        await s.start(bridge, { reason: "decay test", modules: ["lab"] });
        const t0 = new Date("2026-10-14T21:10:00Z");
        assert.throws(() => bridge.accept(sample("cdr", 70, t0)), /not under monitoring in this session/);
        assert.throws(() => bridge.accept(sample("fe-1", 900, t0)), /outside what this slot accepts/);
    });
});
