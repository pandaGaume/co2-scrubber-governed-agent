/**
 * The `commissioning` slot: the commissioning chain as something the control
 * post can play and the commander can decide in (2026-09-27). What
 * `scripts/commissioning-example.ts` plays in one go with the commander
 * stood in by the script, this slot plays with the human at every decision:
 *
 *   1  registration     the scene's devices register; Mother's written rule opens the commissioning
 *   2  procedure        the procedure factory (a model, or the script) writes the test; Mother re-checks it
 *   3  relay            Mother relays the procedure and asks the commander
 *   4  authorisation    WAITS for the commander (station.commissioning_authorise, on the page)
 *   5  execution        the executor runs the procedure one command at a time on the stand-in world
 *   6  report           the decay fit: the apparent volume
 *   7  observer         the Observer (a model) formulates what the twin must do
 *   8  graph factory    the graph factory (a model, or the script) builds the twin; a capability it
 *                       cannot express is declared missing with its contract, and the task ends on it
 *   9  hand-off         WAITS for the commander's answers (station.answer, on the page): open the code
 *                       factory on the contract; the code factory writes the node; replay the request
 *   10 proposal         the twin proposed to the station
 *
 * Every loop is recorded as it goes (`commissioning://run`): who acts, of
 * what nature (code, a model, the script, the human), the tasks opened, what
 * it waits for. The page reads it and gives the commander the buttons.
 *
 * Options of `start`: the world (`lab`, or `hidden-occupant` for a third
 * person the monitor does not list), `leak` (the twin must also expose a
 * leak no node of the catalogue produces: the hand-off and its questions
 * happen), `builder` (`reasoner` by default; `scripted` for a run without a
 * key, which then also needs `request`, the twin request the Observer would
 * write, since no script stands in for the Observer).
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import type { JsonValue } from "@spiky-panda/harness";
import { fromRoot } from "../../lib/paths.js";
import { Broker } from "../../harness/lib/broker.js";
import { runProcedure } from "../../tier3/procedure.js";
import { LAB_WORLD, TwoZoneWorldSim, type TelemetryRow } from "../../harness/stand-in/two-zone-world.js";
import { factoryContractOf, type TwinFactoryRequest } from "../../harness/observer/request.js";
import { inventoryOf } from "../factory/inventory.js";
import type { Device } from "../station/registry.js";
import { objectSchema as obj, publishSlot, type PublishedSlot } from "../lib/slot-server.js";
import { errorMessage } from "../../lib/files.js";
import { taskDir } from "../tools/lib/workshop.js";

const VERSION = "0.1.0";
export const RUN_URI = "commissioning://run";

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

export interface Run {
    id: string;
    startedAt: string;
    endedAt: string | null;
    status: "running" | "done" | "failed";
    options: { world: string; leak: boolean; builder: string };
    commissioningId: string | null;
    loops: Loop[];
    tasks: string[];
    ended: string | null;
}

export interface CommissioningState {
    runs: Run[];
    current: Run | null;
}

export interface CommissioningSlotOptions {
    /** How long a wait for the commander may last, milliseconds (30 minutes by default). */
    waitMs?: number;
}

const LOOPS: Array<Pick<Loop, "name" | "nature" | "who">> = [
    { name: "registration", nature: "code", who: "the station (Mother), a written rule" },
    { name: "procedure factory", nature: "model", who: "the procedure factory" },
    { name: "relay", nature: "code", who: "the station (Mother)" },
    { name: "authorisation", nature: "human", who: "the commander" },
    { name: "execution", nature: "code", who: "the executor, under the agent's rights" },
    { name: "report", nature: "code", who: "the station, the decay fit" },
    { name: "observer", nature: "model", who: "the Observer" },
    { name: "graph factory", nature: "model", who: "the graph factory" },
    { name: "hand-off", nature: "human", who: "the commander, then the code factory, then the graph factory replayed" },
    { name: "proposal", nature: "code", who: "the station" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function commissioningSlot(wsBase: string, log: (line: string) => void, options: CommissioningSlotOptions = {}): PublishedSlot<CommissioningState> {
    const httpBase = wsBase.replace(/^ws(s?):\/\//, "http$1://");
    const waitMs = options.waitMs ?? 30 * 60000;
    const state: CommissioningState = { runs: [], current: null };
    let notify: () => void = () => undefined;

    const play = async (run: Run): Promise<void> => {
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
        type TaskStatus = { state: string; manifest?: { ended?: string; steps?: Array<{ capability: string | null; outcome: string }>; artifacts?: Array<{ kind: string; path: string }> } | null; run?: { builder?: string; ended: string | null; waiting?: string; handoff?: { question?: string; codeTask?: string; replayTask?: string; stopped?: string } } | null };
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
            const scene = JSON.parse(readFileSync(fromRoot("specs", "commissioning-devices.json"), "utf8")) as { devices: Array<{ path: string; descriptor: Record<string, unknown> }> };
            const registered = (await call<{ devices: Array<{ path: string }> }>("station", "registry_list")).devices.map((d) => d.path);
            const suffix = registered.some((p) => p === scene.devices[0].path) ? `-${run.id.toLowerCase()}` : "";
            const devices = scene.devices.map((d) => ({ ...d, path: suffix ? d.path.replace(/(\/[a-z0-9-]+)$/, `$1${suffix}`) : d.path, descriptor: suffix ? { ...d.descriptor, links: ((d.descriptor.links as Array<{ rel: string; href: string }> | undefined) ?? []) } : d.descriptor }));
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
            const reqP = await call<{ taskId: string; builder: string }>("factory", "request", { objective: { required_outputs: [{ name: "V_lab", quantity: "Volume", unit: "m3" }] }, observations: { device: scrubberPath }, topics: ["procedure"], builder, budget: { iterations: 25, minutes: 15 }, requestedBy: "commissioning" });
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

            // 4. the commander authorises, on the page; the slot waits.
            begin(4);
            wait(4, `station.commissioning_authorise on ${commissioningId} (the page's buttons)`);
            log(`[commissioning] ${run.id}: waiting for the commander's authorisation of ${commissioningId}`);
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

            // 7. the Observer: what the twin must do, from the description and the telemetry; or the request the caller gave.
            begin(7);
            let request: TwinFactoryRequest;
            if (run.options.builder === "scripted" && (run as Run & { request?: TwinFactoryRequest }).request) {
                request = (run as Run & { request: TwinFactoryRequest }).request;
                loop(7).nature = "script";
                end(7, { attempts: 0 } as JsonValue, "the request given by the caller stands in for the Observer");
            } else {
                const description = [
                    "SYSTEM DESCRIPTION",
                    "Asset: the CO2 scrubber of the Lab module of a lunar habitat, just installed and commissioned.",
                    "Purpose: keep the CO2 of the air the crew breathes within limits; its twin will be asked what if questions about scrubber speed strategies at night.",
                    "Physical components: the Lab module (a volume of air); the scrubber, variable speed, centralised: it serves Hab-B through the inter-module ventilation, which keeps running with the hatch closed (through the ducts alone; what it delivers as installed is not documented); a CO2 sensor in the Lab; a hatch between the Lab and Hab-B, closed during the test; a CO2 sensor in Hab-B; the crew (two operators in the Lab, two people in Hab-B).",
                    `Test just run: ${(executed.report?.steps ?? []).map((s: { speedPercent: number; minutes: number }) => `${s.speedPercent} % for ${s.minutes} min`).join(", then ")}, hatch closed. Apparent volume from the decay, one room assumed: ${report?.result?.value ?? "not computed"} m3 (${report?.result?.why ?? ""}).`,
                    "Available telemetry: see the summary.",
                    `Controllable, as the register says: ${inventoryOf(devices as unknown as Device[]).interventions.map((i) => `${i.device} ${i.property}${i.how === "commanded" ? ` (commanded through ${i.action}${typeof i.min === "number" ? `, ${i.min} to ${i.max} ${i.unit}` : ""})` : ` (operated by a person${i.states ? `: ${i.states.join(" or ")}` : ""})`}`).join("; ")}.`,
                    "Objective: the twin must reproduce the CO2 of the Lab well enough to evaluate scrubber speed strategies.",
                    ...(run.options.leak ? ["Also required: the twin must expose the CO2 that leaves the Lab through a leak in a seal, as a mass flow out of the volume at a constant rate at full opening scaled by a command between 0 and 1 (the leak fully open when nothing commands it), the rate an editable. No node of the catalogue is known to express a leak."] : []),
                ].join("\n");
                const observed = await call<{ ok: boolean; request: TwinFactoryRequest | null; attempts: unknown[] }>("observer", "observe", { description, telemetry });
                if (!observed.ok || !observed.request) throw new Error(`the Observer's request was not accepted after ${observed.attempts.length} attempt(s)`);
                request = observed.request;
                end(7, { attempts: observed.attempts.length, outputs: request.outputs.map((o) => `${o.name} (${o.quantity}, ${o.unit})`), known: (request.known ?? []).length } as JsonValue);
            }

            // 8. the graph factory, on the twin's catalogue; the operator's threshold.
            begin(8, builder === "scripted" ? "the script stands in for the model" : undefined);
            loop(8).nature = builder === "scripted" ? "script" : "model";
            const contract = factoryContractOf(request);
            const register = (await call<{ devices: unknown[] }>("station", "registry_list")).devices;
            const presence = (await call<{ modules: Array<{ module: string; subjects: Array<{ id: string; callsign: string; name: string | null }> }> }>("biomed", "presence")).modules;
            const persons = presence.flatMap((m) => m.subjects.map((s) => ({ id: s.id, callsign: s.callsign, name: s.name ?? "", module: m.module, activity: m.module === "lab" ? "light_work" : "rest" })));
            const extra = ((run as Run & { observations?: Record<string, unknown> }).observations ?? {}) as Record<string, unknown>;
            const reqG = await call<{ taskId: string; builder: string }>("factory", "request", {
                ...contract,
                observations: { ...(contract.observations as Record<string, unknown>), devices: register, persons, ...extra },
                objective: { ...(contract.objective as { required_outputs: unknown[]; constraints?: Record<string, unknown> }), constraints: { ...((contract.objective as { constraints?: Record<string, unknown> }).constraints ?? {}), rmsePpmMax: 10 } },
                data: [{ file: "telemetry.json", rows: telemetry }],
                topics: ["graph"],
                builder,
                budget: { iterations: 30, minutes: 20, twinPoints: 600 },
                requestedBy: "commissioning",
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
                wait(9, "the commander's answer: open the code factory on the contract (the questions panel)");
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
                        wait(9, "the commander's answer: replay the request with the generated node (the questions panel)");
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
            log(`[commissioning] ${run.id}: ${reason}`);
        } finally {
            run.endedAt = new Date().toISOString();
            for (const l of run.loops) if (l.status === "pending") l.status = "skipped";
            notify();
            await operator.close();
            await agent.close();
        }
    };

    const published = publishSlot<CommissioningState>({
        slot: "commissioning",
        tools: [
            {
                name: "start",
                inputSchema: obj(
                    {
                        world: { type: "string", enum: ["lab", "hidden-occupant"], description: "the stand-in world the test runs on; hidden-occupant puts a third person in the Lab the monitor does not list" },
                        leak: { type: "boolean", description: "true: the twin must also expose a leak no node of the catalogue produces, so the hand-off and its questions happen" },
                        builder: { type: "string", enum: ["reasoner", "scripted"], description: "the factories' builder: the model behind the reasoner slot (default), or the scripts (no key; then request is required)" },
                        request: { type: "object", description: "with builder scripted: the twin request the Observer would write, since no script stands in for the Observer" },
                        observations: { type: "object", description: "with builder scripted: observations added to the graph task (the scripts' hooks)" },
                    },
                    [],
                ),
                handle: (args, s) => {
                    if (s.current && s.current.status === "running") throw new Error(`run ${s.current.id} is still ${s.current.status}: wait for it, or reset`);
                    const builder = args.builder === "scripted" ? "scripted" : "reasoner";
                    if (builder === "scripted" && (!args.request || typeof args.request !== "object")) throw new Error("builder scripted needs request: the twin request the Observer would write (no script stands in for the Observer)");
                    const run: Run & { request?: TwinFactoryRequest; observations?: Record<string, unknown> } = {
                        id: `R${(s.runs.length + 1).toString().padStart(3, "0")}`,
                        startedAt: new Date().toISOString(),
                        endedAt: null,
                        status: "running",
                        options: { world: args.world === "hidden-occupant" ? "hidden-occupant" : "lab", leak: args.leak === true, builder },
                        commissioningId: null,
                        loops: LOOPS.map((l, i) => ({ n: i + 1, ...l, status: "pending" as LoopStatus })),
                        tasks: [],
                        ended: null,
                        ...(args.request && typeof args.request === "object" ? { request: args.request as TwinFactoryRequest } : {}),
                        ...(args.observations && typeof args.observations === "object" ? { observations: args.observations as Record<string, unknown> } : {}),
                    };
                    s.runs.push(run);
                    s.current = run;
                    log(`[commissioning] ${run.id} started (world ${run.options.world}, leak ${run.options.leak}, builder ${builder})`);
                    notify();
                    void play(run);
                    return { runId: run.id, status: run.status, loops: run.loops.map((l) => `${l.n} ${l.name}`) };
                },
            },
            {
                name: "state",
                inputSchema: obj({}),
                handle: (_args, s) => ({ current: s.current, runs: s.runs.map((r) => ({ id: r.id, status: r.status, startedAt: r.startedAt, endedAt: r.endedAt, ended: r.ended })) }),
            },
            {
                name: "reset",
                inputSchema: obj({}),
                handle: (_args, s) => {
                    // The record is dropped; a run still playing goes on and says so when it ends. The station keeps its own record (the register, the commissionings, the questions).
                    const was = s.current?.id ?? null;
                    s.current = null;
                    notify();
                    return { reset: true, was };
                },
            },
        ],
        resources: [{ uri: RUN_URI, read: (s) => s.current }],
        state,
        wsBase,
        log,
        stub: false,
        version: VERSION,
        grammarsDir: fromRoot("slots", "commissioning", "grammars"),
    });
    notify = () => {
        try {
            published.notify("notifications/resources/updated", { uri: RUN_URI });
        } catch {
            // no reader
        }
    };
    return published;
}

/** The workshop of a task of a run, for whoever reads the files. */
export const taskWorkshop = (taskId: string): string => path.relative(fromRoot(), taskDir(taskId)).split(path.sep).join("/");
