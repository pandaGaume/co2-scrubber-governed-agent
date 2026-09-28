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
    /** How the test is played on the stand-in world: seconds of real time per minute of the station's clock (0: as fast as it computes). */
    execution?: { secondsPerMinute?: number };
    /** fresh: the run starts with signatures of its own, empty, whatever the repository signed (a demonstration of the signature). */
    library?: { signatures?: "repository" | "fresh"; safetyCard?: string };
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
    /** Mother tells the room where the run stands: said, not awaited; a station that does not answer never holds the run back. */
    const said: Array<Promise<unknown>> = [];
    const narrate = (text: string): void => {
        said.push(operator.call("station", "narrate", { text, from: "scenario", ...(run.commissioningId ? { commissioningId: run.commissioningId } : {}) }).catch(() => undefined));
    };
    /** How often a factory at work is given news of, seconds. */
    const everyMs = Number(process.env.SCENARIO_NEWS_SECONDS ?? 30) * 1000;
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
    /** A task followed to its end; with a label, Mother gives news of it every so often, from its steps as the manifest records them. */
    const taskEnded = async (taskId: string, label?: string): Promise<TaskStatus> => {
        const t0 = Date.now();
        let told = Date.now();
        let steps = 0;
        for (;;) {
            const s = await call<TaskStatus>("factory", "task", { taskId });
            if (s.run?.ended) return s;
            if (Date.now() - t0 > waitMs) throw new Error(`task ${taskId} did not end in ${waitMs} ms`);
            if (label && Date.now() - told >= everyMs) {
                const all = s.manifest?.steps ?? [];
                const last = all.at(-1);
                const what = last?.capability ? `${last.capability.replace(/[._]/g, " ")}, ${last.outcome}` : "";
                narrate(all.length > steps && last ? `${label}: step ${all.length}, ${what}.` : `${label}: still at work, step ${all.length}.`);
                steps = all.length;
                told = Date.now();
            }
            await sleep(1000);
        }
    };
    const summary = (s: TaskStatus) => ({ state: s.state, ended: s.manifest?.ended ?? null, steps: s.manifest?.steps?.length ?? 0, builder: s.run?.builder ?? null, tools: [...new Set((s.manifest?.steps ?? []).map((x) => x.capability).filter(Boolean))] }) as JsonValue;
    const builder = run.options.builder;
    let fresh = false;
    try {
        narrate(`Scenario: ${doc.title}. I will tell you where we are.`);
        const card = doc.library?.safetyCard ?? "commissioning-test-safety";
        if (doc.library?.signatures === "fresh") {
            await call("library", "signatures_scope", { scope: "run", runId: run.id });
            fresh = true;
            narrate(`This run starts with the library unsigned: the safety card ${card} has no signature yet.`);
        }
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

        // The stand-in world, from here: its CO2 is on the device before the procedure is written, so the factory is given the CO2 the test will start from (2026-09-28).
        const world = new TwoZoneWorldSim(run.options.world === "hidden-occupant" ? { ...LAB_WORLD, labOccupants: 3 } : LAB_WORLD);
        await call("scrubber", "debug.set_co2", { state: "NOMINAL", ppm: Math.round(world.labPpm) });
        const sensor = devices.find((d) => d.descriptor["@type"] === "Co2Sensor" && /\/lab\//.test(d.path))?.path ?? null;
        const measured = { co2Ppm: Math.round(world.labPpm), source: sensor ? `${sensor} (co2)` : "scrubber.motor.state", at: new Date().toISOString() };
        if (sensor) await call("station", "registry_report", { path: sensor, readings: { co2: measured.co2Ppm } }).catch(() => undefined);

        // 2. the procedure factory.
        begin(2, builder === "scripted" ? "the script stands in for the model" : undefined);
        loop(2).nature = builder === "scripted" ? "script" : "model";
        const reqP = await call<{ taskId: string; builder: string }>("factory", "request", { objective: { required_outputs: [doc.procedure.requiredOutput] }, observations: { device: scrubberPath, measured }, topics: ["procedure"], builder, budget: doc.procedure.budget, requestedBy: "scenario" });
        loop(2).taskId = reqP.taskId;
        run.tasks.push(reqP.taskId);
        notify();
        narrate(`The procedure factory is writing the test for the scrubber: ${builder === "scripted" ? "the script" : "a model"} at work, the harness checking each step.`);
        let p = await taskEnded(reqP.taskId, "The procedure factory");
        // A procedure refused because its safety limits cite an unsigned card: Mother asks the commander to sign it, then the factory writes again (2026-09-28, the signature's demonstration).
        const unsigned = async (): Promise<boolean> => {
            const f = await call<{ facts: Array<{ signed?: { valid: boolean } | null }> }>("library", "facts", { id: card }).catch(() => ({ facts: [] }));
            return f.facts.length > 0 && !f.facts[0].signed?.valid;
        };
        if (p.state !== "proposed" && (await unsigned())) {
            const facts = (await call<{ facts: Array<{ id: string; value: number; unit: string; bound?: string; kind?: string; reference?: string; says?: string }> }>("library", "facts", { id: card })).facts;
            narrate(`The procedure factory could not justify its safety limits: the safety card ${card} is not signed. Commander, review it in my chat and sign it, or not.`);
            const asked = await call<{ questionId: string }>("station", "ask", {
                from: "scenario",
                kind: "sign",
                question: `The safety card ${card} is not signed: no procedure's safety limits can be justified by it. Review its values and sign it as valid?`,
                options: [{ id: "sign", label: "sign it as valid" }, { id: "not-now", label: "not now" }],
                context: { document: card, facts: facts.map((f) => ({ id: f.id, value: f.value, unit: f.unit, bound: f.bound ?? null, kind: f.kind ?? null, reference: f.reference ?? null, says: f.says ?? null })) },
                resume: { slot: "library", tool: "sign", args: { id: card } },
            });
            wait(2, `the commander's signature of ${card} (Mother's question in her chat)`);
            const t0 = Date.now();
            for (;;) {
                if (!(await unsigned())) break;
                const read = await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://questions" });
                const mine = (JSON.parse(read.contents[0].text) as Array<{ id: string; status: string; answer?: { choice?: string } | null }>).find((x) => x.id === asked.questionId);
                if (mine && mine.status !== "open" && mine.answer?.choice !== "sign") throw new Error(`the commander did not sign ${card}: no procedure can pass`);
                if (Date.now() - t0 > waitMs) throw new Error(`the commander did not decide on ${card} in ${waitMs} ms`);
                await sleep(1000);
            }
            narrate(`The safety card ${card} is signed. The procedure factory writes the test again.`);
            loop(2).status = "running";
            loop(2).waitingFor = undefined;
            notify();
            const again = await call<{ taskId: string; builder: string }>("factory", "request", { objective: { required_outputs: [doc.procedure.requiredOutput] }, observations: { device: scrubberPath, measured }, topics: ["procedure"], builder, budget: doc.procedure.budget, requestedBy: "scenario" });
            loop(2).taskId = again.taskId;
            run.tasks.push(again.taskId);
            notify();
            p = await taskEnded(again.taskId, "The procedure factory");
        }
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
        const telemetry: TelemetryRow[] = [];
        const speedNow = async () => (await call<{ speedPercent: number }>("scrubber", "motor.state")).speedPercent;
        await call("scrubber", "debug.set_co2", { state: "NOMINAL", ppm: Math.round(world.labPpm) });
        telemetry.push(world.row(await speedNow()));
        // The test is played at a pace a room can follow (2026-09-28: sixty minutes in one second closed the medical monitoring as it opened, with two samples per person);
        // the monitoring the authorisation opened stays open until the test ends, and Mother says where the CO2 stands every ten minutes of the station's clock.
        const secondsPerMinute = Number(process.env.SCENARIO_SECONDS_PER_MINUTE ?? doc.execution?.secondsPerMinute ?? 2);
        const planned = c1.commissioning.procedure?.minutes ?? null;
        if (secondsPerMinute > 0) narrate(`The test starts${planned ? `: ${planned} minutes on the station's clock` : ""}, played at one minute every ${secondsPerMinute} seconds. The medical monitoring stays open until it ends.`);
        let minute = 0;
        const executed = await runProcedure({
            broker: agent,
            commissioningId,
            waitMinute: async () => {
                // The station keeps the test's clock: where it is on the station's time, and at what pace.
                const tick = (m: number) => void operator.call("station", "procedure_run", { commissioningId, action: "clock", minute: m, secondsPerMinute, ...(planned ? { planned } : {}) }).catch(() => undefined);
                if (minute === 0) tick(0);
                if (secondsPerMinute > 0) await sleep(secondsPerMinute * 1000);
                const speed = await speedNow();
                world.step(speed);
                await call("scrubber", "debug.set_co2", { state: "NOMINAL", ppm: Math.round(world.labPpm) });
                telemetry.push(world.row(speed));
                minute++;
                tick(minute);
                if (secondsPerMinute > 0 && minute % 10 === 0) narrate(`Minute ${minute}${planned ? ` of ${planned}` : ""}: the Lab's CO2 at ${Math.round(world.labPpm)} ppm, the scrubber at ${speed} percent.`);
            },
        });
        end(5, { steps: executed.report?.steps?.length ?? 0, minutes: telemetry.length - 1, aborted: (executed as { aborted?: unknown }).aborted ?? null } as JsonValue);

        // 6. the report.
        begin(6);
        const report = executed.report as { result?: { value?: number | null; why?: string } } | null;
        end(6, (report ?? null) as JsonValue, report?.result?.value != null ? `apparent volume ${report.result.value} m3` : report?.result?.why);

        // 7 and 8. the Observer, then the graph factory; a request the graph factory ends on a conflict the Observer must revise goes back to the Observer once, with the reason.
        let g!: TaskStatus;
        let reqG!: { taskId: string; builder: string };
        let feedback: string | null = null;
        for (let round = 1; round <= 2; round++) {
            // 7. the Observer: what the twin must do, from the document's words and the telemetry; or the request the caller gave.
            begin(7);
            narrate(feedback ? "The Observer revises its request, with the reason it was refused." : `The test is done. The Observer now writes what the twin must do, from the description and the ${telemetry.length - 1} minutes of telemetry.`);
            let request: TwinFactoryRequest;
            let reviewedMark: Record<string, unknown> | null = null;
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
                const description = [...doc.observer.description.map((line) => line.replace(/\{(test|apparentVolume|why|controls)\}/g, (_m, k: string) => filled[k] ?? "")), ...(feedback ? [`Review of your previous request, to revise: ${feedback}`] : [])].join("\n");
                // The Observer takes several model calls, longer than a broker call may wait: asked without waiting, read until done.
                const opened = await call<{ id: string; status: string }>("observer", "observe", { description, telemetry, wait: false, attempts: doc.observer.attempts });
                loop(7).note = `observation ${opened.id}`;
                notify();
                const t2 = Date.now();
                let observed: { ok: boolean; request: TwinFactoryRequest | null; attempts: unknown[]; status: string; error?: string; reviewed?: Record<string, unknown> | null };
                for (;;) {
                    observed = await call("observer", "request", { id: opened.id });
                    if (observed.status !== "running") break;
                    if (Date.now() - t2 > waitMs) throw new Error(`the Observer did not answer in ${waitMs} ms`);
                    if (Date.now() - t2 >= everyMs && (Date.now() - t2) % everyMs < 2000) narrate(`The Observer is still writing: attempt ${Math.max(1, observed.attempts?.length ?? 1)}.`);
                    await sleep(2000);
                }
                if (observed.status === "failed") throw new Error(`the Observer failed: ${observed.error ?? "no reason"}`);
                if (!observed.ok || !observed.request) throw new Error(`the Observer's request was not accepted after ${observed.attempts.length} attempt(s)`);
                request = observed.request;
                reviewedMark = observed.reviewed ?? null;
                end(7, { attempts: observed.attempts.length, outputs: request.outputs.map((o) => `${o.name} (${o.quantity}, ${o.unit})`), known: (request.known ?? []).length } as JsonValue);
                narrate(`The Observer's request is accepted after ${observed.attempts.length} attempt${observed.attempts.length === 1 ? "" : "s"}: the twin must give ${request.outputs.map((o) => o.name).join(", ")}.`);
            }

            // 8. the graph factory, on the twin's catalogue; the document's threshold.
            begin(8, builder === "scripted" ? "the script stands in for the model" : undefined);
            loop(8).nature = builder === "scripted" ? "script" : "model";
            const contract = factoryContractOf(request);
            const register = (await call<{ devices: unknown[] }>("station", "registry_list")).devices;
            const presence = (await call<{ modules: Array<{ module: string; subjects: Array<{ id: string; callsign: string; name: string | null }> }> }>("biomed", "presence")).modules;
            const persons = presence.flatMap((m) => m.subjects.map((s) => ({ id: s.id, callsign: s.callsign, name: s.name ?? "", module: m.module, activity: m.module === "lab" ? "light_work" : "rest" })));
            reqG = await call<{ taskId: string; builder: string }>("factory", "request", {
                ...contract,
                observations: { ...(contract.observations as Record<string, unknown>), devices: register, persons, ...(run.observations ?? {}) },
                ...(reviewedMark ? { requirements: { ...(contract.requirements as unknown as Record<string, unknown>), reviewed: reviewedMark } } : {}),
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
            narrate("The graph factory is building the twin from the catalogue and fitting it to the test's telemetry. Each simulator it tries, I will tell you.");
            g = await taskEnded(reqG.taskId, "The graph factory");
            end(8, summary(g));
            if (/^MISSING_CAPABILITY/.test(g.manifest?.ended ?? "")) narrate("The graph factory needs a node the catalogue does not have. It wrote the contract that node must meet; the decision is yours.");


            const conflict = /^(SOURCE_CONFLICT|UNBUILDABLE_OUTPUT)/.test(g.manifest?.ended ?? "") && /REQUIRE_RESOLUTION: [^;]*\bobserver\b/.test(g.manifest?.ended ?? "");
            if (!conflict || round === 2 || (run.options.builder === "scripted" && run.request)) break;
            feedback = String(g.manifest?.ended ?? "");
            narrate(/^UNBUILDABLE_OUTPUT/.test(feedback) ? "The graph factory cannot build one of the outputs the Observer asked for. I send the request back to the Observer with the reason, once." : "The graph factory found the request in conflict with the documentation. I send it back to the Observer with the reason, once.");
            for (const n of [7, 8]) {
                const l = loop(n);
                l.status = "pending";
                l.note = `round 2: ${feedback.slice(0, 120)}`;
            }
            notify();
        }
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
                narrate("The code factory is writing the missing node against its contract. The forge will build it, test it and judge it.");
                const code = await taskEnded(codeId, "The code factory");
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
                        narrate("The forge accepted the new node. The graph factory replays the request with it.");
                        const replay = await taskEnded(replayId, "The graph factory, replayed");
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
        narrate(proposed ? "Scenario complete. The twin is proposed to the station." : `Scenario ended without a twin: ${String(run.ended).slice(0, 160)}.`);
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
        narrate(`Scenario stopped: ${reason.slice(0, 160)}.`);
    } finally {
        // A run that signed in its own scope gives the repository's signatures back: a demonstration never signs for the repository.
        if (fresh) await operator.call("library", "signatures_scope", { scope: "repository" }).catch(() => undefined);
        run.endedAt = new Date().toISOString();
        for (const l of run.loops) if (l.status === "pending") l.status = "skipped";
        notify();
        // The last lines are said before the session closes.
        await Promise.allSettled(said);
        await operator.close();
        await agent.close();
    }
}
