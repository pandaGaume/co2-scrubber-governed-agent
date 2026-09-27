/**
 * The commissioning chain as a scenario the `scenario` slot plays (2026-09-27,
 * on Guillaume's word: a commissioning is a scenario, not a slot). The
 * document is under `specs/` like the night (`scenario-commissioning.json`,
 * `-leak`, `-hidden-occupant`), reviewed, its sha256 said when it is played;
 * this module is the player of documents of kind `commissioning`: the ten
 * loops the document lists, with the human at every decision:
 *
 *   1  registration     the scene's devices register; Mother's written rule opens the commissioning
 *   2  procedure        the procedure factory (a model, or the script) writes the test; Mother re-checks it
 *   3  relay            Mother relays the procedure and asks the commander (a question of the station's own)
 *   4  authorisation    WAITS for the commander (Mother's chat: a chip, a word typed or spoken, a standing order)
 *   5  execution        the executor runs the procedure one command at a time on the stand-in world
 *   6  report           the decay fit: the apparent volume
 *   7  observer         the Observer (a model) formulates what the twin must do, from the words the document holds
 *   8  graph factory    the graph factory (a model, or the script) builds the twin; a capability it
 *                       cannot express is declared missing with its contract, and the task ends on it
 *   9  hand-off         WAITS for the commander's answers (Mother's chat): open the code factory on the
 *                       contract; the code factory writes the node; replay the request
 *   10 proposal         the twin proposed to the station
 *
 * Every loop is recorded as it goes (`scenario://run`): who acts, of what
 * nature (code, a model, the script, the human), the tasks opened, what it
 * waits for. The story list of the control page shows it under the step.
 */
import { readFileSync } from "node:fs";
import type { JsonValue } from "@spiky-panda/harness";
import { fromRoot } from "../../lib/paths.js";
import { Broker } from "../../harness/lib/broker.js";
import { runProcedure } from "../../tier3/procedure.js";
import { LAB_WORLD, TwoZoneWorldSim, type TelemetryRow } from "../../harness/stand-in/two-zone-world.js";
import { factoryContractOf, type TwinFactoryRequest } from "../../harness/observer/request.js";
import { inventoryOf } from "../factory/inventory.js";
import type { Device } from "../station/registry.js";
import { errorMessage } from "../../lib/files.js";

const VERSION = "0.1.0";

export type LoopNature = "code" | "model" | "script" | "human";
export type LoopStatus = "pending" | "running" | "waiting" | "done" | "failed" | "skipped";

export interface Loop {
    n: number;
    name: string;
    nature: LoopNature;
    who: string;
    status: LoopStatus;
    /** What it waits for, when it waits: the commander's authorisation, a question's answer. */
    waitingFor?: string;
    note?: string;
    taskId?: string;
    startedAt?: string;
    endedAt?: string;
    output?: JsonValue;
}

/** A scenario document of kind `commissioning`, as `specs/scenario-commissioning*.json` is written. */
export interface CommissioningDocument {
    title: string;
    version: number;
    status: string;
    kind: "commissioning";
    note?: string;
    world: "lab" | "hidden-occupant";
    leak: boolean;
    /** The scene's devices, a file under the repository. */
    devices: string;
    procedure: { requiredOutput: { name: string; quantity: string; unit: string }; budget: Record<string, number> };
    /** The words the Observer is given, one line each; `{test}`, `{apparentVolume}`, `{why}` and `{controls}` are filled by the player from the test. */
    observer: { attempts: number; description: string[] };
    graph: { rmsePpmMax: number; budget: Record<string, number> };
    loops: Array<Pick<Loop, "name" | "nature" | "who">>;
}

export interface Run {
    id: string;
    /** The document played: its id under specs/ (scenario-<id>.json), its sha256 as read. */
    scenario: string;
    sha256: string;
    startedAt: string;
    endedAt: string | null;
    status: "running" | "done" | "failed";
    options: { world: string; leak: boolean; builder: string };
    commissioningId: string | null;
    loops: Loop[];
    tasks: string[];
    ended: string | null;
    /** With the scripted builder: the twin request the caller gave (no script stands in for the Observer), and observations for the scripts' hooks. */
    request?: TwinFactoryRequest;
    observations?: Record<string, unknown>;
}

export interface PlayerDeps {
    httpBase: string;
    log: (line: string) => void;
    /** How long a wait for the commander may last, milliseconds. */
    waitMs: number;
    notify: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The problems of a document that is not a commissioning scenario the player can play. */
export function commissioningDocumentProblems(doc: unknown): string[] {
    const d = (doc && typeof doc === "object" ? doc : {}) as Partial<CommissioningDocument>;
    const problems: string[] = [];
    if (d.kind !== "commissioning") problems.push(`kind is "${String(d.kind)}", not "commissioning"`);
    if (d.world !== "lab" && d.world !== "hidden-occupant") problems.push(`world is "${String(d.world)}": lab or hidden-occupant`);
    if (typeof d.devices !== "string") problems.push("devices names the scene's file");
    if (!d.procedure?.requiredOutput?.name) problems.push("procedure.requiredOutput names what the test measures");
    if (!Array.isArray(d.observer?.description) || !d.observer.description.length) problems.push("observer.description holds the words the Observer is given");
    if (!Array.isArray(d.loops) || d.loops.length !== 10) problems.push(`loops lists the ten loops (${Array.isArray(d.loops) ? d.loops.length : 0} given)`);
    return problems;
}

/** The run of a document, before it plays: every loop pending. */
export function runOf(id: string, sha256: string, doc: CommissioningDocument, n: number, builder: "reasoner" | "scripted", extra: { request?: TwinFactoryRequest; observations?: Record<string, unknown> } = {}): Run {
    return {
        id: `R${n.toString().padStart(3, "0")}`,
        scenario: id,
        sha256,
        startedAt: new Date().toISOString(),
        endedAt: null,
        status: "running",
        options: { world: doc.world, leak: doc.leak === true, builder },
        commissioningId: null,
        loops: doc.loops.map((l, i) => ({ n: i + 1, name: l.name, nature: l.nature, who: l.who, status: "pending" as LoopStatus })),
        tasks: [],
        ended: null,
        ...(extra.request ? { request: extra.request } : {}),
        ...(extra.observations ? { observations: extra.observations } : {}),
    };
}

export async function playCommissioning(doc: CommissioningDocument, run: Run, deps: PlayerDeps): Promise<void> {
    const { httpBase, log, waitMs, notify } = deps;
    const operator = new Broker(httpBase, { name: "operator", version: VERSION, locale: "en" });
    const agent = new Broker(httpBase, { name: "agent", version: VERSION, locale: "en" });
    const call = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const r = await operator.call(slot, tool, args);
        if (!r.ok) throw new Error(`${slot}.${tool}: ${r.error ?? r.outcome}`);
        return r.output as T;
    };
    const loop = (n: number) => run.loops[n - 1];
    const begin = (n: number, note?: string) => {
        const l = loop(n);
        l.status = "running";
        l.startedAt = new Date().toISOString();
        if (note) l.note = note;
        notify();
    };
    const end = (n: number, output?: JsonValue, note?: string) => {
        const l = loop(n);
        l.status = "done";
        l.endedAt = new Date().toISOString();
        if (output !== undefined) l.output = output;
        if (note) l.note = note;
        notify();
    };
    const wait = (n: number, waitingFor: string) => {
        const l = loop(n);
        l.status = "waiting";
        l.waitingFor = waitingFor;
        notify();
    };
    type TaskStatus = { state: string; manifest?: { ended?: string; steps?: Array<{ capability: string | null; outcome: string }>; artifacts?: Array<{ kind: string; path: string }> } | null; run?: { builder?: string; ended?: string | null; handoff?: { codeTask?: string | null; replayTask?: string | null; stopped?: string | null } } | null };
    const taskEnded = async (taskId: string): Promise<TaskStatus> => {
        const t0 = Date.now();
        for (;;) {
            const s = await call<TaskStatus>("factory", "task", { taskId });
            if (s.run?.ended) return s;
            if (Date.now() - t0 > waitMs) throw new Error(`task ${taskId} did not end in ${waitMs} ms`);
            await sleep(1000);
        }
    };
    const summary = (s: TaskStatus) => ({ state: s.state, ended: s.manifest?.ended ?? null, steps: s.manifest?.steps?.length ?? 0, builder: s.run?.builder ?? null, tools: [...new Set((s.manifest?.steps ?? []).map((x) => x.capability).filter(Boolean))] }) as JsonValue;
    const builder = run.options.builder;
    try {
        // 1. registration: the scene's devices, under names of this run when the register holds them already (a server plays more than once).
        begin(1);
        const scene = JSON.parse(readFileSync(fromRoot(...doc.devices.split("/")), "utf8")) as { devices: Array<{ path: string; descriptor: Record<string, unknown> }> };
        const registered = (await call<{ devices: Array<{ path: string }> }>("station", "registry_list")).devices.map((d) => d.path);
        const suffix = registered.some((p) => p === scene.devices[0].path) ? `-${run.id.toLowerCase()}` : "";
        const devices = scene.devices.map((d) => ({ ...d, path: suffix ? d.path.replace(/(\/[a-z0-9-]+)$/, `$1${suffix}`) : d.path, descriptor: suffix ? { ...d.descriptor, links: ((d.descriptor.links as Array<{ rel: string; href: string }> | undefined) ?? []).map((l) => ({ ...l, href: l.href.replace(/(\/[a-z0-9-]+)$/, `$1${suffix}`) })) } : d.descriptor }));
        let commissioningId: string | null = null;
        for (const d of devices) {
            const r = await call<{ commissioning: string | null }>("station", "registry_register", d);
            if (r.commissioning) commissioningId = r.commissioning;
        }
        await call("station", "registry_report", { path: devices.find((d) => d.path.includes("battery"))?.path ?? devices[4].path, readings: { stateOfCharge: 80 } });
        if (!commissioningId) throw new Error("the register opened no commissioning: the scene's scrubber did not register as a device that acts");
        run.commissioningId = commissioningId;
        const scrubberPath = devices.find((d) => d.descriptor["@type"] === "Scrubber")?.path ?? devices[0].path;
        end(1, { devices: devices.length, commissioning: commissioningId }, `commissioning ${commissioningId} opened for ${scrubberPath}`);

        // 2. the procedure factory.
        begin(2, builder === "scripted" ? "the script stands in for the model" : undefined);
        loop(2).nature = builder === "scripted" ? "script" : "model";
        const reqP = await call<{ taskId: string; builder: string }>("factory", "request", { objective: { required_outputs: [doc.procedure.requiredOutput] }, observations: { device: scrubberPath }, topics: ["procedure"], builder, budget: doc.procedure.budget, requestedBy: "scenario" });
        loop(2).taskId = reqP.taskId;
        run.tasks.push(reqP.taskId);
        notify();
        const p = await taskEnded(reqP.taskId);
        end(2, summary(p));
        if (p.state !== "proposed") throw new Error(`the procedure factory ended ${p.state}: ${p.manifest?.ended ?? ""}`);

        // 3. the relay: Mother re-checked the proposed procedure with the occupancy she reads; the commissioning waits for the commander.
        begin(3);
        const c1 = await call<{ commissioning: { status: string; procedure: { procedureId: string; minutes: number; occupants: unknown[] } | null } }>("station", "commissioning_state", { commissioningId });
        end(3, { status: c1.commissioning.status, procedure: c1.commissioning.procedure?.procedureId ?? null, minutes: c1.commissioning.procedure?.minutes ?? null, occupants: c1.commissioning.procedure?.occupants.length ?? 0 } as JsonValue);
        if (c1.commissioning.status !== "awaiting-authorisation") throw new Error(`commissioning ${commissioningId} is ${c1.commissioning.status}: Mother did not relay the procedure`);

        // 4. the commander authorises, in Mother's chat; the player waits.
        begin(4);
        wait(4, `station.commissioning_authorise on ${commissioningId} (Mother's question in her chat)`);
        log(`[scenario] ${run.id}: waiting for the commander's authorisation of ${commissioningId}`);
        const t0 = Date.now();
        let status = c1.commissioning.status;
        let monitoring: JsonValue = null;
        while (status === "awaiting-authorisation") {
            if (Date.now() - t0 > waitMs) throw new Error(`the commander did not decide in ${waitMs} ms`);
            await sleep(1000);
            const c = await call<{ commissioning: { status: string; authorisation?: { decision: string; by: string } | null; monitoring?: JsonValue } }>("station", "commissioning_state", { commissioningId });
            status = c.commissioning.status;
            monitoring = c.commissioning.monitoring ?? null;
            if (status !== "awaiting-authorisation") end(4, { status, by: c.commissioning.authorisation?.by ?? null, monitoring } as JsonValue, `${c.commissioning.authorisation?.decision ?? status} by ${c.commissioning.authorisation?.by ?? "?"}`);
        }
        if (status !== "authorised") throw new Error(`the commander refused: the commissioning is ${status}`);

        // 5. the execution on the stand-in world.
        begin(5);
        const world = new TwoZoneWorldSim(run.options.world === "hidden-occupant" ? { ...LAB_WORLD, labOccupants: 3 } : LAB_WORLD);
        const telemetry: TelemetryRow[] = [];
        const speedNow = async () => (await call<{ speedPercent: number }>("scrubber", "motor.state")).speedPercent;
        await call("scrubber", "debug.set_co2", { state: "NOMINAL", ppm: Math.round(world.labPpm) });
        telemetry.push(world.row(await speedNow()));
        const executed = await runProcedure({
            broker: agent,
            commissioningId,
            waitMinute: async () => {
                const speed = await speedNow();
                world.step(speed);
                await call("scrubber", "debug.set_co2", { state: "NOMINAL", ppm: Math.round(world.labPpm) });
                telemetry.push(world.row(speed));
            },
        });
        end(5, { steps: executed.report?.steps?.length ?? 0, minutes: telemetry.length - 1, aborted: (executed as { aborted?: unknown }).aborted ?? null } as JsonValue);

        // 6. the report.
        begin(6);
        const report = executed.report as { result?: { value?: number | null; why?: string } } | null;
        end(6, (report ?? null) as JsonValue, report?.result?.value != null ? `apparent volume ${report.result.value} m3` : report?.result?.why);

        // 7. the Observer: what the twin must do, from the document's words and the telemetry; or the request the caller gave.
        begin(7);
        let request: TwinFactoryRequest;
        if (run.options.builder === "scripted" && run.request) {
            request = run.request;
            loop(7).nature = "script";
            end(7, { attempts: 0 } as JsonValue, "the request given by the caller stands in for the Observer");
        } else {
            const filled: Record<string, string> = {
                test: (executed.report?.steps ?? []).map((s: { speedPercent: number; minutes: number }) => `${s.speedPercent} % for ${s.minutes} min`).join(", then "),
                apparentVolume: String(report?.result?.value ?? "not computed"),
                why: report?.result?.why ?? "",
                controls: inventoryOf(devices as unknown as Device[]).interventions.map((i) => `${i.device} ${i.property}${i.how === "commanded" ? ` (commanded through ${i.action}${typeof i.min === "number" ? `, ${i.min} to ${i.max} ${i.unit}` : ""})` : ` (operated by a person${i.states ? `: ${i.states.join(" or ")}` : ""})`}`).join("; "),
            };
            const description = doc.observer.description.map((line) => line.replace(/\{(test|apparentVolume|why|controls)\}/g, (_m, k: string) => filled[k] ?? "")).join("\n");
            // The Observer takes several model calls, longer than a broker call may wait: asked without waiting, read until done.
            const opened = await call<{ id: string; status: string }>("observer", "observe", { description, telemetry, wait: false, attempts: doc.observer.attempts });
            loop(7).note = `observation ${opened.id}`;
            notify();
            const t2 = Date.now();
            let observed: { ok: boolean; request: TwinFactoryRequest | null; attempts: unknown[]; status: string; error?: string };
            for (;;) {
                observed = await call("observer", "request", { id: opened.id });
                if (observed.status !== "running") break;
                if (Date.now() - t2 > waitMs) throw new Error(`the Observer did not answer in ${waitMs} ms`);
                await sleep(2000);
            }
            if (observed.status === "failed") throw new Error(`the Observer failed: ${observed.error ?? "no reason"}`);
            if (!observed.ok || !observed.request) throw new Error(`the Observer's request was not accepted after ${observed.attempts.length} attempt(s)`);
            request = observed.request;
            end(7, { attempts: observed.attempts.length, outputs: request.outputs.map((o) => `${o.name} (${o.quantity}, ${o.unit})`), known: (request.known ?? []).length } as JsonValue);
        }

        // 8. the graph factory, on the twin's catalogue; the document's threshold.
        begin(8, builder === "scripted" ? "the script stands in for the model" : undefined);
        loop(8).nature = builder === "scripted" ? "script" : "model";
        const contract = factoryContractOf(request);
        const register = (await call<{ devices: unknown[] }>("station", "registry_list")).devices;
        const presence = (await call<{ modules: Array<{ module: string; subjects: Array<{ id: string; callsign: string; name: string | null }> }> }>("biomed", "presence")).modules;
        const persons = presence.flatMap((m) => m.subjects.map((s) => ({ id: s.id, callsign: s.callsign, name: s.name ?? "", module: m.module, activity: m.module === "lab" ? "light_work" : "rest" })));
        const reqG = await call<{ taskId: string; builder: string }>("factory", "request", {
            ...contract,
            observations: { ...(contract.observations as Record<string, unknown>), devices: register, persons, ...(run.observations ?? {}) },
            objective: { ...(contract.objective as { required_outputs: unknown[]; constraints?: Record<string, unknown> }), constraints: { ...((contract.objective as { constraints?: Record<string, unknown> }).constraints ?? {}), rmsePpmMax: doc.graph.rmsePpmMax } },
            data: [{ file: "telemetry.json", rows: telemetry }],
            topics: ["graph"],
            builder,
            budget: doc.graph.budget,
            requestedBy: "scenario",
        });
        loop(8).taskId = reqG.taskId;
        run.tasks.push(reqG.taskId);
        notify();
        const g = await taskEnded(reqG.taskId);
        end(8, summary(g));

        // 9. the hand-off, when the graph factory found a node missing: the commander's questions, the code factory, the replay.
        let final = g;
        let finalId = reqG.taskId;
        if (/^MISSING_CAPABILITY/.test(g.manifest?.ended ?? "")) {
            begin(9);
            const handoff = async (): Promise<NonNullable<TaskStatus["run"]>["handoff"]> => (await call<TaskStatus>("factory", "task", { taskId: reqG.taskId })).run?.handoff ?? {};
            const until = async (what: string, read: () => Promise<string | null>): Promise<string | null> => {
                const t1 = Date.now();
                for (;;) {
                    const h = await handoff();
                    if (h?.stopped) return null;
                    const v = await read();
                    if (v) return v;
                    if (Date.now() - t1 > waitMs) throw new Error(`${what}: not decided in ${waitMs} ms`);
                    await sleep(1000);
                }
            };
            wait(9, "the commander's answer: open the code factory on the contract (Mother's chat)");
            const codeId = await until("the code factory", async () => (await handoff())?.codeTask ?? null);
            if (!codeId) {
                end(9, { stopped: (await handoff())?.stopped ?? null } as JsonValue, "the commander did not open the code factory");
            } else {
                run.tasks.push(codeId);
                loop(9).taskId = codeId;
                loop(9).status = "running";
                loop(9).waitingFor = undefined;
                loop(9).note = `code task ${codeId} on the contract`;
                notify();
                const code = await taskEnded(codeId);
                if (code.state !== "proposed") {
                    end(9, { code: summary(code) } as JsonValue, `the code factory ended ${code.state}`);
                } else {
                    wait(9, "the commander's answer: replay the request with the generated node (Mother's chat)");
                    const replayId = await until("the replay", async () => (await handoff())?.replayTask ?? null);
                    if (!replayId) end(9, { code: summary(code), stopped: (await handoff())?.stopped ?? null } as JsonValue, "the commander did not replay the request");
                    else {
                        run.tasks.push(replayId);
                        loop(9).status = "running";
                        loop(9).waitingFor = undefined;
                        loop(9).note = `code task ${codeId} proposed; replay ${replayId} on the forge`;
                        notify();
                        const replay = await taskEnded(replayId);
                        end(9, { code: summary(code), replay: summary(replay) } as JsonValue);
                        final = replay;
                        finalId = replayId;
                    }
                }
            }
        } else {
            loop(9).status = "skipped";
            loop(9).note = "nothing missing: no hand-off";
            notify();
        }

        // 10. the proposal.
        begin(10);
        const proposed = final.state === "proposed";
        end(10, { task: finalId, state: final.state, artifacts: final.manifest?.artifacts ?? [] } as JsonValue, proposed ? `task ${finalId} proposed to the station` : `task ${finalId} ended ${final.state}: nothing proposed`);
        run.status = proposed ? "done" : "failed";
        run.ended = proposed ? `the twin proposed (task ${finalId})` : `${final.manifest?.ended ?? final.state}`;
    } catch (e) {
        const reason = errorMessage(e);
        const active = run.loops.find((l) => l.status === "running" || l.status === "waiting");
        if (active) {
            active.status = "failed";
            active.note = reason;
            active.endedAt = new Date().toISOString();
        }
        run.status = "failed";
        run.ended = reason;
        log(`[scenario] ${run.id}: ${reason}`);
    } finally {
        run.endedAt = new Date().toISOString();
        for (const l of run.loops) if (l.status === "pending") l.status = "skipped";
        notify();
        await operator.close();
        await agent.close();
    }
}
