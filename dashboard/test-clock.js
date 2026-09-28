/**
 * The test's clock, on the control room (2026-09-28).
 *
 * A test is played faster than real time on the stand-in world: sixty minutes
 * of the station's clock in two real minutes. Without a clock the room cannot
 * tell the test's time from the time it takes to run. The station keeps the
 * test's clock (station://commissionings: run.clock, the minute reached, the
 * pace, when); this badge shows the test's time running, interpolated between
 * two minutes, the factor, and the real time it has taken. Only for a test:
 * the twin's runs and the factories' tasks have no clock of the station's.
 *
 * Since 2026-09-28 it shows from the commissioning's opening, before any
 * test: "procedure being written" while the scenario's procedure factory
 * works, "not run" for a few minutes when the scenario ended before the test
 * (a room that saw no clock took it for broken).
 */
import { connectMcp } from "./vendor/mcp-http-client.js";

const two = (n) => String(Math.floor(n)).padStart(2, "0");
const clock = (seconds) => `${two(seconds / 60)}:${two(seconds % 60)}`;

export function mountTestClock(badge) {
    if (!badge) return;
    let station = null;
    let scenario = null;
    let running = null;
    /** The scenario's run, when one plays or ended in the last five minutes: the commissioning it opened, and how it ended. */
    let scene = null;
    const read = async () => {
        try {
            scenario ??= await connectMcp(location.origin, "scenario", { headers: {} });
            const run = JSON.parse((await scenario.request("resources/read", { uri: "scenario://run" })).contents[0].text);
            scene = run && run.commissioningId && (run.status === "running" || Date.now() - Date.parse(run.endedAt ?? run.startedAt) < 5 * 60000) ? run : null;
        } catch {
            scenario = null;
            scene = null;
        }
        try {
            station ??= await connectMcp(location.origin, "station", { headers: {} });
            const r = await station.request("resources/read", { uri: "station://commissionings" });
            const list = JSON.parse(r.contents[0].text);
            // Running first; else a test awaiting its authorisation; else one that ended in the last five minutes.
            running =
                list.find((c) => c.status === "running" && c.run?.clock) ??
                list.find((c) => c.status === "awaiting-authorisation" && c.procedure) ??
                list.find((c) => ["done", "aborted"].includes(c.status) && c.run?.clock && Date.now() - Date.parse(c.run.clock.at) < 5 * 60000) ??
                // Before any test: the commissioning the scenario opened, its procedure not yet relayed.
                (scene ? list.find((c) => c.id === scene.commissioningId && !c.run) : null) ??
                null;
        } catch {
            station = null;
            running = null;
        }
    };
    const draw = () => {
        const c = running;
        if (!c) {
            badge.hidden = true;
            return;
        }
        if (!c.run && c.status !== "awaiting-authorisation") {
            const elapsed = clock((Date.now() - Date.parse(scene?.startedAt ?? c.openedAt)) / 1000);
            badge.textContent = scene?.status === "running" ? `test --:-- · procedure being written · ${elapsed}` : `test --:-- · not run`;
            badge.title = scene?.status === "running" ? "the commissioning is open: the procedure factory writes the test; the clock starts when the commander authorises it" : `the scenario ended before the test: ${scene?.ended ?? c.status}`;
            badge.hidden = false;
            return;
        }
        if (c.status === "awaiting-authorisation") {
            badge.textContent = `test 00:00 / ${two(c.procedure.minutes ?? 0)}:00 \u00b7 awaiting authorisation`;
            badge.hidden = false;
            return;
        }
        const k = c.run.clock;
        if (c.status !== "running") {
            badge.textContent = `test ${clock(k.minute * 60)}${k.planned ? ` / ${two(k.planned)}:00` : ""} \u00b7 ${c.status === "done" ? "done" : "aborted"}`;
            badge.hidden = false;
            return;
        }
        const spm = Number(k.secondsPerMinute) || 0;
        const since = (Date.now() - Date.parse(k.at)) / 1000;
        // Between two minutes the clock runs at the pace, never past the next minute the station has not reached.
        const onStation = k.minute * 60 + (spm > 0 ? Math.min(59, (since / spm) * 60) : 0);
        const real = (Date.now() - Date.parse(c.run.startedAt)) / 1000;
        const factor = spm > 0 ? `x${Math.round(60 / spm)}` : "as fast as computed";
        badge.textContent = `test ${clock(onStation)}${k.planned ? ` / ${two(k.planned)}:00` : ""} \u00b7 ${factor} \u00b7 ${clock(real)} real`;
        badge.hidden = false;
    };
    void read();
    setInterval(() => void read(), 1000);
    setInterval(draw, 250);
}
