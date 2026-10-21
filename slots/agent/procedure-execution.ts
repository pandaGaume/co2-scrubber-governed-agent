/** The supervisor requests execution; this host runs only a checked, human-authorised procedure. */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { forkDir, fromRoot } from "../../lib/paths.js";
import { sha256Of } from "../tools/lib/workshop.js";
import type { Broker } from "../../harness/lib/broker.js";
import { runProcedure } from "../../tier3/procedure.js";
import { LAB_WORLD, TwoZoneWorldSim, type TelemetryRow } from "../../stand-ins/worlds/two-zone-world.js";
import { cabinReading } from "../../lib/cabin-co2.js";
import { notHolder } from "../../lib/roles.js";
import type { Commissioning } from "../station/provider.js";
import type { Device } from "../station/registry.js";
import { runtimeEvents } from "../lib/events.js";
import { observedProfileProblem, type ProcedureCompletionRequirement, type RecordedSpeed } from "./procedure-completion.js";

export interface ProcedureExecution {
    runId: string;
    missionId: string;
    commissioningId: string;
    status: "running" | "done" | "aborted" | "failed";
    source: "simulated cabin driven by the observed motor speed";
    plannedMinutes?: number;
    speedObservations?: RecordedSpeed[];
    rows: TelemetryRow[];
    devices: Device[];
    persons: unknown[];
    report: unknown;
    error: string | null;
}

const logRoot = () => path.resolve(process.env.PROCEDURE_LOG_DIR ?? path.join(forkDir() ?? fromRoot(), "outputs", "procedure-executions"));
export function readProcedureExecution(runId: string, root = logRoot()): ProcedureExecution {
    if (!/^procedure-[0-9a-f-]{36}$/.test(runId)) throw new Error("invalid procedure run identifier");
    const file = path.join(root, `${runId}.json`);
    if (!existsSync(file)) throw new Error(`no recorded procedure execution ${runId}`);
    const saved = JSON.parse(readFileSync(file, "utf8")) as { record: ProcedureExecution; sha256: string };
    if (saved.record.runId !== runId || sha256Of(JSON.stringify(saved.record)) !== saved.sha256) throw new Error("procedure telemetry integrity check failed");
    return saved.record;
}

export class MissionProcedureExecutor {
    private readonly root = logRoot();
    private readonly runs = new Map<string, ProcedureExecution>();
    private readonly pending = new Set<Promise<void>>();
    private readonly locks = new Set<string>();
    private stopped = false;
    private world: TwoZoneWorldSim | null = null;
    constructor(private readonly agent: Broker, private readonly station: Broker, private readonly changed: (observation: Record<string, unknown>) => void) {}
    /** Operator display only; reading progress never wakes the reasoning loop. */
    activity() {
        return [...this.runs.values()].filter((run) => run.status === "running").map((run) => ({
            runId: run.runId, source: run.source, plannedMinutes: run.plannedMinutes ?? null,
            minute: run.rows.at(-1)?.minute ?? 0, samples: run.rows.length,
            observedSpeedPercent: run.rows.at(-1)?.speed_percent ?? null,
        }));
    }
    completionProblem(requirement: ProcedureCompletionRequirement): string | null {
        const runs = [...this.runs.values()];
        if (!runs.length) return "no test has been executed by this mission";
        const problems = runs.map((run) => observedProfileProblem(requirement, run));
        return problems.some((problem) => problem === null) ? null : problems.at(-1)!;
    }
    terminalReportProblem(): string | null {
        return [...this.runs.values()].some((run) => run.status !== "running" && run.report) ? null : "no terminal test report exists; an incomplete conclusion cannot invent an executed test";
    }
    result(runId: string): ProcedureExecution {
        if (!/^procedure-[0-9a-f-]{36}$/.test(runId)) throw new Error("invalid procedure run identifier");
        const run = this.runs.get(runId) ?? readProcedureExecution(runId, this.root);
        return JSON.parse(JSON.stringify(run)) as ProcedureExecution;
    }
    async start(missionId: string, commissioningId: string, environment: { atmosphere?: string; world?: string; devices?: string[] }): Promise<ProcedureExecution> {
        if (this.stopped || this.locks.size) throw new Error("a procedure executor is closed or already busy");
        this.locks.add(commissioningId);
        try {
            if (environment.atmosphere !== "simulated" || environment.world !== "lab") throw new Error("this mission has no configured physical telemetry logger; no measurement will be invented");
            const checked = await this.station.call("station", "commissioning_state", { commissioningId });
            if (!checked.ok) throw new Error(checked.error ?? checked.outcome);
            const c = (checked.output as { commissioning: Commissioning }).commissioning;
            if (c.status !== "authorised" || !c.procedure || c.authorisation?.decision !== "authorise") throw new Error("the station has no authorised procedure for this commissioning");
            if (c.scientificApproval?.decision !== "approve" || c.scientificApproval.procedureSha256 !== c.procedure.sha256 || notHolder("scientific-officer", c.scientificApproval.by)) throw new Error("this exact procedure has no current scientific approval");
            if (notHolder("commander", c.authorisation.by)) throw new Error("the recorded authorisation is not from a current commander");
            if (!environment.devices?.includes(c.device)) throw new Error("the authorised device is outside this mission's initial environment");
            if (c.procedure.module !== "lab" || c.procedure.content.steps.some((s) => s.hatch !== "closed")) throw new Error("the configured cabin environment supports Lab tests with the hatch closed only");
            const registered = await this.station.call("station", "registry_list", {});
            if (!registered.ok) throw new Error(registered.error ?? registered.outcome);
            const devices = (registered.output as { devices: Device[] }).devices.filter((d) => environment.devices!.includes(d.path));
            const presence = await this.station.call("biomed", "presence", {});
            const persons = presence.ok ? ((presence.output as { modules?: Array<{ module: string; subjects: Array<Record<string, unknown>> }> }).modules ?? []).flatMap((m) => m.subjects.map((p) => ({ ...p, module: m.module }))) : [];
            const motor = await this.agent.call("scrubber", "motor.state", {});
            if (!motor.ok) throw new Error(motor.error ?? motor.outcome);
            const initial = motor.output as { co2Ppm: number; speedPercent: number; targetPercent?: number };
            if (!Number.isFinite(initial.co2Ppm) || !Number.isFinite(initial.speedPercent)) throw new Error("the motor state has no finite current reading");
            this.world ??= new TwoZoneWorldSim({ ...LAB_WORLD, labStartPpm: initial.co2Ppm });
            const run: ProcedureExecution = { runId: `procedure-${randomUUID()}`, missionId, commissioningId, status: "running", source: "simulated cabin driven by the observed motor speed", plannedMinutes: c.procedure.content.steps.reduce((sum, step) => sum + step.minutes, 0), speedObservations: [], rows: [], devices, persons, report: null, error: null };
            this.runs.set(run.runId, run);
            const promise = this.execute(run, initial.targetPercent ?? initial.speedPercent).finally(() => { this.pending.delete(promise); this.locks.delete(commissioningId); });
            this.pending.add(promise);
            return this.result(run.runId);
        } catch (e) { this.locks.delete(commissioningId); throw e; }
    }
    private async execute(run: ProcedureExecution, previousSpeed: number): Promise<void> {
        const world = this.world!;
        const startMinute = world.minute;
        const secondsPerMinute = Number(process.env.SCENARIO_SECONDS_PER_MINUTE ?? 2);
        const sample = async (advance: boolean) => {
            if (this.stopped) throw new Error("procedure executor closed");
            const motor = await this.agent.call("scrubber", "motor.state", {});
            if (!motor.ok) throw new Error(`motor telemetry unavailable: ${motor.error ?? motor.outcome}`);
            const speed = (motor.output as { speedPercent: number }).speedPercent;
            run.speedObservations!.push({ at: Date.now(), speedPercent: speed });
            if (!Number.isFinite(speed)) throw new Error("motor speed is not a finite measurement");
            if (advance) {
                // The boundary row records the command that drove the following interval.
                if (run.rows.length) run.rows[run.rows.length - 1].speed_percent = speed;
                world.step(speed);
            }
            const reading = await this.station.call("scrubber", "scrubber.co2_report", cabinReading(world.labPpm));
            if (!reading.ok) throw new Error(`simulated cabin sensor feed refused: ${reading.error ?? reading.outcome}`);
            run.rows.push({ ...world.row(speed), minute: world.minute - startMinute });
        };
        try {
            if (!Number.isFinite(secondsPerMinute) || secondsPerMinute < 0) throw new Error("invalid host test clock");
            await this.station.call("station", "narrate", { from: "procedure executor", text: `Authorised test started. Cabin CO2 is simulated; motor speed comes from the device. One simulated minute takes ${secondsPerMinute} seconds.` });
            await sample(false);
            const result = await runProcedure({ broker: this.agent, commissioningId: run.commissioningId, waitMinute: async () => {
                if (secondsPerMinute > 0) await new Promise((resolve) => setTimeout(resolve, secondsPerMinute * 1000));
                await sample(true);
                const clock = await this.station.call("station", "procedure_run", { commissioningId: run.commissioningId, action: "clock", minute: world.minute - startMinute, secondsPerMinute });
                if (!clock.ok) throw new Error(clock.error ?? clock.outcome);
            } });
            run.status = result.status;
            run.report = result.report;
        } catch (e) {
            run.status = "failed";
            run.error = e instanceof Error ? e.message : String(e);
            await this.station.call("station", "procedure_run", { commissioningId: run.commissioningId, action: "abort", condition: "unreadable", reason: run.error });
            await this.station.call("station", "narrate", { from: "procedure executor", text: "The test failed. No completed calibration telemetry is available; inspect the execution result." });
        } finally {
            const restored = await this.agent.call("scrubber", "motor.set_speed", { percent: previousSpeed });
            if (!restored.ok) await this.station.call("station", "narrate", { from: "procedure executor", text: "Restoring the pre-test speed was refused. The device retains its safety authority." });
            try {
                mkdirSync(this.root, { recursive: true });
                const file = path.join(this.root, `${run.runId}.json`);
                const temp = `${file}.${randomUUID()}.tmp`;
                const record = JSON.parse(JSON.stringify(run)) as ProcedureExecution;
                writeFileSync(temp, JSON.stringify({ record, sha256: sha256Of(JSON.stringify(record)) }), { flag: "wx" });
                renameSync(temp, file);
            } catch (e) { run.status = "failed"; run.error = `telemetry could not be persisted: ${e instanceof Error ? e.message : String(e)}`; }
            const observation = { runId: run.runId, commissioningId: run.commissioningId, missionId: run.missionId, status: run.status, samples: run.rows.length, source: run.source, error: run.error };
            runtimeEvents.append("agent.procedure-ended", observation);
            this.changed(observation);
        }
    }
    async close(): Promise<void> { this.stopped = true; await Promise.all(this.pending); }
}
