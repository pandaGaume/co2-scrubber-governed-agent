/**
 * The report of a procedure that ran (docs/mise-en-service.fr.md, section
 * 10): who authorised it and when, who was in the volume and whether they
 * stayed nominal, every step with what the device answered and the CO2 at
 * both ends, the abort if there was one, the predictions quoted as they
 * were written (with the sha256 of the file that carried them), and the
 * number the test was for.
 *
 * The number comes from a fit written here, not from a model: at full
 * speed the Lab's CO2 decays towards an equilibrium (the crew keeps
 * producing), C(t) = Ceq + (C0 - Ceq) e^(-t/tau), and the served volume is
 * the scrubber's flow times the time constant, V = Q tau. The fit scans the
 * equilibrium and regresses the logarithm for each candidate; the one with
 * the smallest residual wins. When the step did not give enough samples,
 * or no flow is known, the report says the volume is not computed and why:
 * a missing number is written as missing.
 *
 * The number is an apparent volume, and said so: the fit reads one room.
 * Air exchanged with a neighbouring volume during the decay changes the
 * time constant and the equilibrium together, and the one-room fit
 * compensates one with the other; the volume it gives is then not the
 * room's. Separating the two (the volume, the exchange) is the twin's
 * identification, done by the graph factory on the whole telemetry.
 */
import type { Procedure } from "./procedure.js";

export interface Co2Sample {
    /** Minutes since the start of the step. */
    minute: number;
    ppm: number;
}

export interface DecayFit {
    volumeM3: number;
    tauMinutes: number;
    equilibriumPpm: number;
    rmsePpm: number;
    samples: number;
}

/** The served volume from the decay of step samples at a known flow (m3 per minute); null when the samples cannot give one. */
export function decayVolume(samples: Co2Sample[], flowM3PerMinute: number): DecayFit | null {
    const pts = samples.filter((s) => Number.isFinite(s.minute) && Number.isFinite(s.ppm)).sort((a, b) => a.minute - b.minute);
    if (pts.length < 4 || !(flowM3PerMinute > 0)) return null;
    const low = Math.min(...pts.map((s) => s.ppm));
    if (!(pts[0].ppm - low > 1)) return null;
    let best: { tau: number; ceq: number; sse: number; a: number } | null = null;
    // The equilibrium lies under the lowest sample; scan it in 1 ppm steps up to 2000 ppm below.
    for (let ceq = low - 1; ceq >= Math.max(0, low - 2000); ceq -= 1) {
        const xs = pts.map((s) => s.minute);
        const ys = pts.map((s) => Math.log(s.ppm - ceq));
        const n = xs.length;
        const mx = xs.reduce((a, b) => a + b, 0) / n;
        const my = ys.reduce((a, b) => a + b, 0) / n;
        let sxy = 0;
        let sxx = 0;
        for (let i = 0; i < n; i++) {
            sxy += (xs[i] - mx) * (ys[i] - my);
            sxx += (xs[i] - mx) ** 2;
        }
        if (sxx === 0) return null;
        const slope = sxy / sxx;
        if (!(slope < 0)) continue;
        const a = my - slope * mx;
        const sse = pts.reduce((sum, s) => sum + (ceq + Math.exp(a + slope * s.minute) - s.ppm) ** 2, 0);
        if (!best || sse < best.sse) best = { tau: -1 / slope, ceq, sse, a };
    }
    if (!best) return null;
    return { volumeM3: flowM3PerMinute * best.tau, tauMinutes: best.tau, equilibriumPpm: best.ceq, rmsePpm: Math.sqrt(best.sse / pts.length), samples: pts.length };
}

export interface StepRecord {
    n: number;
    speedPercent: number;
    minutes: number;
    /** What the device answered to the step's command. */
    accepted: boolean;
    refusal?: string;
    co2StartPpm: number | null;
    co2EndPpm: number | null;
    samples: Co2Sample[];
}

export interface ProcedureRun {
    procedureId: string;
    procedureSha256: string;
    authorisedBy: string;
    authorisedAt: string;
    module: string;
    occupants: Array<{ id: string; callsign?: string }>;
    monitoringSessionId: string | null;
    /** Every vital-sign event of the session that was not nominal. */
    vitalEvents: number;
    steps: StepRecord[];
    aborted: { condition: string; reason: string; step: number } | null;
    startedAt: string;
    endedAt: string;
    /** The scrubber's flow at full speed, from its descriptor, m3 per minute; null when the descriptor gives none. */
    flowM3PerMinute: number | null;
}

export interface ProcedureReport extends ProcedureRun {
    minutes: number;
    expected: Procedure["expected"];
    result: { quantity: string; name: string; value: number | null; unit: string; fit: DecayFit | null; why: string };
}

/** The report of a run: the decay step fitted when it can be, said missing when it cannot. */
export function buildReport(procedure: Procedure, run: ProcedureRun): ProcedureReport {
    const minutes = run.steps.reduce((sum, s) => sum + s.minutes, 0);
    // The decay is the last step at full speed that ran whole.
    const decay = [...run.steps].reverse().find((s) => s.accepted && s.speedPercent === 100);
    const q = procedure.quantities.find((x) => x.quantity === "Volume") ?? { name: "V", quantity: "Volume", unit: "m3" };
    let fit: DecayFit | null = null;
    let why: string;
    if (run.aborted) why = `the test was aborted at step ${run.aborted.step} (${run.aborted.condition}): no decay to fit`;
    else if (!decay) why = "no full-speed step ran: no decay to fit";
    else if (run.flowM3PerMinute === null) why = "the scrubber's descriptor gives no flow at full speed: the time constant cannot become a volume";
    else {
        fit = decayVolume(decay.samples, run.flowM3PerMinute);
        why = fit ? `apparent volume, one room assumed: decay of step ${decay.n}: tau ${fit.tauMinutes.toFixed(1)} min over ${fit.samples} samples, residual ${fit.rmsePpm.toFixed(1)} ppm` : `step ${decay.n} gave ${decay.samples.length} sample(s) and no decay the fit can read`;
    }
    return { ...run, minutes, expected: procedure.expected, result: { quantity: q.quantity, name: q.name, value: fit ? Number(fit.volumeM3.toFixed(1)) : null, unit: q.unit, fit, why } };
}

/** The report as the lines of section 10, for the log and the page. */
export function reportLines(r: ProcedureReport): string[] {
    const lines = [`procedure ${r.procedureId}: ${r.steps.length} step(s), ${r.minutes} minutes`, `  authorised by the ${r.authorisedBy} at ${r.authorisedAt}`, `  occupants of ${r.module}: ${r.occupants.length}${r.monitoringSessionId ? `, monitored throughout (${r.monitoringSessionId})` : ""}`];
    for (const s of r.steps) lines.push(`  step ${s.n}  ${s.accepted ? "accepted" : `refused (${s.refusal ?? "?"})`}  ${s.speedPercent} %  CO2 ${s.co2StartPpm ?? "?"} -> ${s.co2EndPpm ?? "?"} ppm`);
    lines.push(`  ${r.result.name}: ${r.result.value === null ? `not computed (${r.result.why})` : `${r.result.value} ${r.result.unit} (${r.result.why})`}`);
    lines.push(`  vital signs: ${r.vitalEvents ? `${r.vitalEvents} event(s) out of nominal` : "nominal throughout"}`);
    lines.push(`  aborted: ${r.aborted ? `step ${r.aborted.step}, ${r.aborted.condition}: ${r.aborted.reason}` : "no"}`);
    for (const [k, v] of Object.entries(r.expected)) lines.push(`  expected (${k}, written before the run, sha256 ${r.procedureSha256.slice(0, 12)}): ${v}`);
    return lines;
}
