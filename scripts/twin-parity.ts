/**
 * Runs the cabin twin (`graphs/cabin.spikypanda`) on its scenario and checks
 * three things, the way a reviewer would after changing a parameter:
 *
 *   1. parity: the twin, integrated by its solver, against the reference
 *      step of the CO2 control sample (an explicit step of one minute with
 *      the same constants, read from `specs/cabin-parameters.json`);
 *   2. the story's constraints, listed in the scenario file with
 *      `status: "to compute"`: they are computed here, never assumed;
 *   3. the numbers the video may state, printed with the sha256 of the
 *      files they come from.
 *
 *     node dist/scripts/twin-parity.js [specs/scenario-night-9.json] [graphs/cabin.spikypanda]
 *
 * Exit code 0 when parity holds (within `PARITY_TOLERANCE`), 1 otherwise;
 * a failed story constraint is reported, not fatal: it is a finding.
 */
import { readJson, sha256File } from "../lib/files.js";
import { loadFactory, param, type CabinParameters, type CommandSegment, type CrewGroup, type Scenario } from "../lib/factory.js";
import { PARAMETERS_FILE, fromRoot, isMain, relativeToRoot } from "../lib/paths.js";

const MINUTE = 60;
/** Relative tolerance on the CO2 trajectory between the solver and the explicit reference step. */
export const PARITY_TOLERANCE = 0.01;

interface Row {
    minute: number;
    co2Ppm: number;
    state: number;
    rate: number;
    powerW: number;
    stateOfCharge: number;
}
interface Finding {
    name: string;
    ok: boolean | null;
    detail: string;
}

export function checkParity(scenarioFile: string, docFile: string): { parityOk: boolean; worstRelative: number; findings: Finding[] } {
    const factory = loadFactory();
    const parameters = readJson<CabinParameters>(PARAMETERS_FILE);
    const scenario = readJson<Scenario>(scenarioFile);
    const p = (dotted: string) => param(parameters, dotted);
    const registry = factory.buildJobRegistry();
    const doc = factory.readDocument(docFile);
    const minutes = Math.max(...scenario.schedule.map((s) => s.to));

    /** Crew groups at a story minute, from the scenario. */
    const crewAt = (minute: number): CrewGroup[] => scenario.schedule.find((s) => minute >= s.from && minute < s.to)?.crew ?? [];
    const emissionOf = (groups: CrewGroup[]) => groups.reduce((sum, g) => sum + g.count * p(`crew.emissionPerPerson.${g.activity}`), 0);

    /** Runs the twin with a command schedule (story minutes), one tick per minute; returns the per-minute rows. */
    function runTwin(commandSegments: CommandSegment[]): Row[] {
        const loaded = factory.instantiateDocument(doc, registry);
        if (loaded.missingTypeIds.length) throw new Error(`document: unknown nodes ${loaded.missingTypeIds.join(", ")}`);
        factory.applySetting(loaded, { node: "command", property: "segments", value: JSON.stringify(commandSegments.map((s) => ({ from: s.from * MINUTE, to: s.to * MINUTE, value: s.value }))) });
        const { session } = loaded;
        session.reset();
        const rows: Row[] = [];
        session.run(0);
        for (let minute = 1; minute <= minutes; minute++) {
            session.run(minute * MINUTE);
            rows.push({
                minute,
                co2Ppm: factory.readNumber(loaded, "cabin", "co2Ppm"),
                state: factory.readNumber(loaded, "cabin", "state"),
                rate: factory.readNumber(loaded, "scrubber", "effectiveRatePerMinute"),
                powerW: factory.readNumber(loaded, "scrubber", "power"),
                stateOfCharge: factory.readNumber(loaded, "battery", "stateOfChargePercent"),
            });
        }
        return rows;
    }

    /** The reference: the sample's explicit minute step with the file's constants. */
    function runReference(commandAt: (minute: number) => number): Array<{ minute: number; co2Ppm: number }> {
        const rateAtFull = p("scrubber.rateAtFullCommand");
        const lag = p("scrubber.lagTimeConstantMinutes");
        const floor = p("scrubber.removalFloorPpm");
        const leak = p("cabin.leakPerMinute");
        let co2 = scenario.start.co2Ppm;
        let rate = 0;
        const rows: Array<{ minute: number; co2Ppm: number }> = [];
        for (let minute = 0; minute < minutes; minute++) {
            const u = commandAt(minute);
            const e = emissionOf(crewAt(minute));
            const scrub = rate * Math.max(co2 - floor, 0);
            const next = Math.max(p("cabin.floorPpm"), Math.min(p("cabin.ceilingPpm"), co2 + e - scrub - leak * co2));
            rate = rate + ((rateAtFull * u - rate) * 1) / lag;
            co2 = next;
            rows.push({ minute: minute + 1, co2Ppm: co2 });
        }
        return rows;
    }

    /** Steady state of the reference model for a fixed crew and command: e = rate * (ppm - floor) + leak * ppm. */
    function runReferenceSteady(count: number, activity: string, command: number): number {
        const rate = p("scrubber.rateAtFullCommand") * command;
        const e = count * p(`crew.emissionPerPerson.${activity}`);
        const floor = p("scrubber.removalFloorPpm");
        const leak = p("cabin.leakPerMinute");
        return (e + rate * floor) / (rate + leak);
    }

    const commandOf = (segments: CommandSegment[]) => (minute: number) => segments.find((s) => minute >= s.from && minute < s.to)?.value ?? 0;
    const elevated = p("thresholds.elevatedPpm");
    const critical = p("thresholds.criticalPpm");
    const stateName = (s: number) => ["NOMINAL", "ELEVATED", "CRITICAL"][s] ?? String(s);

    // ── 1. Parity on the scenario's own command (held at its start value) ──────
    const baseline: CommandSegment[] = [{ from: 0, to: minutes, value: scenario.start.scrubberCommandPercent / 100 }];
    const twin = runTwin(baseline);
    const reference = runReference(commandOf(baseline));
    let worstRelative = 0;
    for (let i = 0; i < twin.length; i++) worstRelative = Math.max(worstRelative, Math.abs(twin[i].co2Ppm - reference[i].co2Ppm) / reference[i].co2Ppm);
    const parityOk = worstRelative <= PARITY_TOLERANCE;

    console.log(`twin ${relativeToRoot(docFile)} on ${relativeToRoot(scenarioFile)}`);
    console.log(`  parameters sha256 ${sha256File(PARAMETERS_FILE).slice(0, 12)}, scenario sha256 ${sha256File(scenarioFile).slice(0, 12)}, document sha256 ${sha256File(docFile).slice(0, 12)}`);
    console.log(`  parity with the reference step over ${minutes} minutes: worst relative gap ${(worstRelative * 100).toFixed(3)} % (tolerance ${PARITY_TOLERANCE * 100} %) ${parityOk ? "OK" : "FAILED"}`);

    // ── 2. The story's numbers, read from the twin ─────────────────────────────
    const at = (rows: Row[], minute: number) => rows[Math.min(rows.length, Math.max(1, minute)) - 1];
    const peak = twin.reduce((m, r) => (r.co2Ppm > m.co2Ppm ? r : m), twin[0]);
    const last = twin[twin.length - 1];
    console.log(`  baseline command ${scenario.start.scrubberCommandPercent} %: CO2 ${Math.round(twin[0].co2Ppm)} -> ${Math.round(last.co2Ppm)} ppm, peak ${Math.round(peak.co2Ppm)} ppm at minute ${peak.minute} (${stateName(peak.state)}), battery ${scenario.start.stateOfChargePercent} -> ${last.stateOfCharge.toFixed(1)} %`);

    const findings: Finding[] = [];
    for (const c of scenario.constraints ?? []) {
        if (c.name === "twenty-minute stop during exercise crosses CRITICAL") {
            const stopAt = (scenario.events ?? []).find((e) => /insists/.test(e.what ?? "") || e.intention === "poisoned-procedure")?.at ?? 230;
            const stopped = runTwin([
                { from: 0, to: stopAt, value: scenario.start.scrubberCommandPercent / 100 },
                { from: stopAt, to: stopAt + 20, value: 0 },
                { from: stopAt + 20, to: minutes, value: 1 },
            ]);
            const before = at(stopped, stopAt);
            const window = stopped.slice(stopAt, stopAt + 20);
            const crossed = window.find((r) => r.co2Ppm >= critical);
            const peakStop = window.reduce((m, r) => (r.co2Ppm > m.co2Ppm ? r : m), window[0]);
            findings.push({
                name: c.name,
                ok: Boolean(crossed),
                detail: `at minute ${stopAt} the cabin is ${Math.round(before.co2Ppm)} ppm (${stateName(before.state)}); a 20-minute stop ${crossed ? `crosses CRITICAL (${critical} ppm) after ${crossed.minute - stopAt} minutes` : `peaks at ${Math.round(peakStop.co2Ppm)} ppm, below CRITICAL (${critical} ppm)`}`,
            });
        } else if (c.name === "the floor holds") {
            const floorPercent = p("minFlow.floorPercent");
            const rest = runReferenceSteady(4, "rest", floorPercent / 100);
            findings.push({ name: c.name, ok: rest < elevated, detail: `four people resting at ${floorPercent} % settle at ${Math.round(rest)} ppm (ELEVATED at ${elevated} ppm)` });
        } else if (c.name === "the plan keeps the cabin NOMINAL") {
            findings.push({ name: c.name, ok: null, detail: "computed by the plan job, not here" });
        }
    }
    for (const f of findings) console.log(`  constraint "${f.name}": ${f.ok === null ? "not computed here" : f.ok ? "holds" : "DOES NOT HOLD"}; ${f.detail}`);
    return { parityOk, worstRelative, findings };
}

if (isMain(import.meta.url)) {
    const { parityOk } = checkParity(fromRoot(process.argv[2] ?? "specs/scenario-night-9.json"), fromRoot(process.argv[3] ?? "graphs/cabin.spikypanda"));
    if (!parityOk) {
        console.error("parity failed: the twin does not follow the reference step; check the solver step and the node settings");
        process.exit(1);
    }
}
