/**
 * The agent executes an authorised procedure (docs/mise-en-service.fr.md,
 * section 8, step 6): one command at a time, with its own rights, and the
 * abort conditions read before every step and every minute of it.
 *
 * This is deterministic code on the agent's side, on the agent's client of
 * the broker: every `scrubber.motor.set_speed` it sends goes through the
 * broker's policy as the agent's and is judged by the board, which may
 * still refuse it (step 7). What it is not: a model's decision. The model
 * does not choose to skip a step, to hold one longer, or to clear an abort;
 * the run control (`station.procedure_run`) is kept from its catalogue for
 * that reason, and this executor is the only caller of it on the agent's
 * side. The factory, which wrote the procedure, has no way to run it at
 * all; the commander, who authorised it, runs nothing either.
 *
 * The abort conditions it knows how to read:
 *
 *   co2       `scrubber.motor.state`, the CO2 at or above the procedure's
 *             `co2AbortPpm`;
 *   refused   the board refused a step's command;
 *   battery   `station.registry_list`, the battery's last `stateOfCharge`
 *             under the condition's threshold (35 by default);
 *   vitals    `biomed.verdict`, and, when the volume is occupied, the
 *             monitoring session itself: no open session is a lost one.
 *
 * A condition it cannot read, whether its source does not answer, the
 * battery never reported, or its id is one it does not know, is a tripped
 * condition, like a lost signal: a test does not go on because an abort
 * condition was silent.
 *
 * The time is the caller's: `waitMinute` is awaited once per minute of a
 * step (the page plays the 24 minutes in seconds, the tests in no time),
 * and the CO2 is sampled after each, which is what the report's decay fit
 * reads.
 */
import type { Broker } from "../harness/lib/broker.js";
import type { AbortCondition, Procedure } from "../harness/topics/procedure/procedure.js";
import type { Co2Sample, ProcedureReport, StepRecord } from "../harness/topics/procedure/report.js";

export interface RunProcedureOptions {
    /** The agent's client of the broker: its identity, its rights. */
    broker: Broker;
    commissioningId: string;
    /** Awaited once per minute of a step; by default a real minute divided by `PROCEDURE_TIME_SCALE` (1 when unset). */
    waitMinute?: (step: number, minute: number) => Promise<void>;
    log?: (line: string) => void;
}

export interface RunProcedureResult {
    status: "done" | "aborted";
    report: ProcedureReport | null;
    aborted: Tripped | null;
}

interface Tripped {
    condition: string;
    reason: string;
    ppm?: number;
    threshold?: number;
}

const realMinute = (): Promise<void> => {
    const scale = Number(process.env.PROCEDURE_TIME_SCALE) || 1;
    return new Promise((resolve) => setTimeout(resolve, 60000 / scale));
};

export async function runProcedure({ broker, commissioningId, waitMinute = realMinute, log = () => undefined }: RunProcedureOptions): Promise<RunProcedureResult> {
    const state = await broker.call("station", "commissioning_state", { commissioningId });
    if (!state.ok) throw new Error(`the commissioning cannot be read: ${state.error ?? state.outcome}`);
    const c = (state.output as { commissioning: { status: string; procedure: { content: Procedure; occupants: unknown[] } | null } }).commissioning;
    if (c.status !== "authorised" || !c.procedure) throw new Error(`commissioning ${commissioningId} is ${c.status}: the agent runs only an authorised procedure`);
    const procedure = c.procedure.content;
    const occupied = c.procedure.occupants.length > 0;
    const run = async (args: Record<string, unknown>) => {
        const r = await broker.call("station", "procedure_run", { commissioningId, ...args });
        if (!r.ok) throw new Error(`station.procedure_run ${String(args.action)}: ${r.error ?? r.outcome}`);
        return r.output as { status: string; report?: ProcedureReport };
    };

    const co2 = async (): Promise<number | null> => {
        const r = await broker.call("scrubber", "motor.state", {});
        const ppm = r.ok ? (r.output as { co2Ppm?: unknown }).co2Ppm : null;
        return typeof ppm === "number" && Number.isFinite(ppm) ? ppm : null;
    };

    /** Every abort condition of the procedure, read now; the first one tripped, or null. */
    const tripped = async (): Promise<Tripped | null> => {
        for (const a of procedure.abort) {
            const t = await read(a);
            if (t) return t;
        }
        return null;
    };
    const read = async (a: AbortCondition): Promise<Tripped | null> => {
        switch (a.id) {
            case "co2": {
                const ppm = await co2();
                if (ppm === null) return { condition: "unreadable", reason: "co2: the scrubber's state does not answer" };
                return ppm >= procedure.limits.co2AbortPpm ? { condition: "co2", reason: `CO2 ${ppm} ppm at or above ${procedure.limits.co2AbortPpm} ppm`, ppm } : null;
            }
            case "refused":
                return null; // read on the command itself
            case "battery": {
                const threshold = typeof a.threshold === "number" ? a.threshold : 35;
                const r = await broker.call("station", "registry_list", {});
                const devices = r.ok ? ((r.output as { devices?: Array<{ descriptor: { "@type": string }; readings: Record<string, { value: unknown }> }> }).devices ?? []) : [];
                const soc = devices.find((d) => d.descriptor["@type"] === "Battery")?.readings.stateOfCharge?.value;
                if (typeof soc !== "number") return { condition: "unreadable", reason: "battery: no state of charge on the register" };
                return soc < threshold ? { condition: "battery", reason: `battery ${soc} % under ${threshold} %`, threshold } : null;
            }
            case "vitals": {
                if (occupied) {
                    const s = await broker.call("biomed", "state", {});
                    if (!s.ok || !(s.output as { session: string | null }).session) return { condition: "vitals", reason: "the medical monitoring is not open" };
                }
                const v = await broker.call("biomed", "verdict", {});
                if (!v.ok) return { condition: "unreadable", reason: `vitals: ${v.error ?? v.outcome}` };
                const verdict = v.output as { abort: boolean; reason: string };
                return verdict.abort ? { condition: "vitals", reason: verdict.reason } : null;
            }
            default:
                return { condition: "unreadable", reason: `${a.id}: an abort condition the executor cannot read (${a.source})` };
        }
    };

    const abort = async (t: Tripped): Promise<RunProcedureResult> => {
        log(`[agent] procedure ${procedure.id} aborted: ${t.condition}, ${t.reason}`);
        const r = await run({ action: "abort", condition: t.condition, reason: t.reason, ...(t.ppm !== undefined ? { ppm: t.ppm } : {}), ...(t.threshold !== undefined ? { threshold: t.threshold } : {}) });
        return { status: "aborted", report: r.report ?? null, aborted: t };
    };

    await run({ action: "begin" });
    for (const step of procedure.steps) {
        const before = await tripped();
        if (before) return abort(before);
        await run({ action: "step", n: step.n });
        const co2StartPpm = await co2();
        const command = await broker.call("scrubber", "motor.set_speed", { percent: step.speedPercent });
        log(`[agent] procedure ${procedure.id} step ${step.n}: set_speed ${step.speedPercent} -> ${command.outcome}`);
        if (!command.ok) {
            const record: StepRecord = { n: step.n, speedPercent: step.speedPercent, minutes: 0, accepted: false, refusal: command.error ?? command.outcome, co2StartPpm, co2EndPpm: co2StartPpm, samples: [] };
            await run({ action: "record", record });
            return abort({ condition: "refused", reason: command.error ?? command.outcome });
        }
        const samples: Co2Sample[] = co2StartPpm === null ? [] : [{ minute: 0, ppm: co2StartPpm }];
        for (let minute = 1; minute <= step.minutes; minute++) {
            await waitMinute(step.n, minute);
            const ppm = await co2();
            if (ppm !== null) samples.push({ minute, ppm });
            const t = await tripped();
            if (t) {
                await run({ action: "record", record: { n: step.n, speedPercent: step.speedPercent, minutes: minute, accepted: true, co2StartPpm, co2EndPpm: ppm, samples } satisfies StepRecord });
                return abort(t);
            }
        }
        await run({ action: "record", record: { n: step.n, speedPercent: step.speedPercent, minutes: step.minutes, accepted: true, co2StartPpm, co2EndPpm: samples.at(-1)?.ppm ?? null, samples } satisfies StepRecord });
    }
    const done = await run({ action: "finish" });
    return { status: "done", report: done.report ?? null, aborted: null };
}
