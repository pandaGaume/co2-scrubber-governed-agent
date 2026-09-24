/**
 * `npm run example:commissioning`: the whole commissioning on the real
 * model, from the device plugged in to the twin accepted, with every loop
 * of the harness recorded (docs/exemple-mise-en-service.fr.md).
 *
 *   1  registration        code      the devices register; Mother opens the commissioning
 *   2  procedure factory   model     the factory writes the test procedure (the model behind the reasoner slot)
 *   3  relay               code      Mother checks it again and asks the commander
 *   4  authorisation       human     the commander authorises (this script stands for the human)
 *   5  execution           code      the agent runs the procedure, one command at a time
 *   6  report              code      Mother closes the monitoring and computes the volume
 *   7  observer            model     from the description and the telemetry, what the twin must do
 *   8  graph factory       model     candidates, residuals, the loop on the gap
 *   9  proposal            code      the accepted twin proposed to the station
 *
 * The room is the stand-in world of two zones (`harness/stand-in`),
 * stepped a minute at a time under the speed the board actually took, so the
 * telemetry answers the commands the agent really sent. Its constants are
 * the truth the graph factory has to find; the journal keeps them to compare.
 *
 * The journal is written as JSON and as markdown under
 * `outputs/examples/<stamp>/`. It needs the reasoner's key (`.env`); without
 * it the model loops fail and say why.
 *
 *     node --env-file=.env dist/scripts/commissioning-example.js
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot, isMain, relativeToRoot } from "../lib/paths.js";
import { errorMessage } from "../lib/files.js";
import { startAll } from "../slots/run-all.js";
import { Broker, type CallResult } from "../harness/lib/broker.js";
import { ReasonerProvider } from "../harness/providers/reasoner.js";
import { observe, OBSERVER_PROMPT } from "../harness/observer/observer.js";
import { factoryContractOf } from "../harness/observer/request.js";
import { LAB_WORLD, TwoZoneWorldSim, type TelemetryRow } from "../harness/stand-in/two-zone-world.js";
import { runProcedure } from "../tier3/procedure.js";
import { taskDir } from "../slots/tools/lib/workshop.js";
import { evaluateCandidate, stationReference, type Candidate } from "../harness/topics/graph/evaluate.js";
import { compareGraphs, compareParameters, referenceOfSpec } from "../harness/topics/graph/reference.js";
import { labCandidate } from "../harness/scripted/graph.js";
import type { Spec } from "../harness/topics/graph/params.js";
import type { TaskFile } from "../harness/core/task.js";
import type { MotherLine } from "../slots/station/provider.js";

/** A client of the broker that counts what it calls: the tools of a loop, read off the wire. */
class CountingBroker extends Broker {
    counts: Record<string, number> = {};
    override async call(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<CallResult> {
        const key = `${slot}.${tool}`;
        this.counts[key] = (this.counts[key] ?? 0) + 1;
        return super.call(slot, tool, args);
    }
    take(): Record<string, number> {
        const c = this.counts;
        this.counts = {};
        return c;
    }
}

export interface LoopRecord {
    n: number;
    name: string;
    kind: "code" | "model" | "human (stood in by the script)";
    who: string;
    goal: string;
    tools: Record<string, number>;
    decisions: number | null;
    modelCalls: number | null;
    tokens: { input: number; output: number } | null;
    refusals: Array<{ step: number; what: string; why: string }>;
    steps: Array<{ n: number; source: string; capability: string | null; outcome: string; note: string }>;
    output: unknown;
    mother: string[];
    ms: number;
}

const short = (s: unknown, n = 240) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);

async function main(): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outDir = fromRoot("outputs", "examples", stamp);
    mkdirSync(outDir, { recursive: true });
    process.env.SPEECH_PROVIDER = "silent";
    process.env.BIOMED_PROVIDER = "simulated";
    process.env.FACTORY_RECIPES_DIR = path.join(outDir, "recipes");
    const started = await startAll(3160, () => undefined, "ignore");
    const operator = new CountingBroker(started.broker.httpBase, { name: "operator", version: "0", locale: "fr" });
    const agent = new CountingBroker(started.broker.httpBase, { name: "agent", version: "0", locale: "en" });
    const loops: LoopRecord[] = [];
    const telemetry: TelemetryRow[] = [];
    const call = async <T>(b: Broker, slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const r = await b.call(slot, tool, args);
        if (!r.ok) throw new Error(`${slot}.${tool}: ${r.error ?? r.outcome}`);
        return r.output as T;
    };
    const motherLines = async (): Promise<MotherLine[]> => {
        const r = await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://mother" });
        return JSON.parse(r.contents[0].text) as MotherLine[];
    };
    let said = 0;
    const newLines = async () => {
        const all = await motherLines();
        const fresh = all.slice(said).map((l) => l.text.fr);
        said = all.length;
        return fresh;
    };
    const record = async (partial: Omit<LoopRecord, "n" | "mother" | "ms" | "tools"> & { tools?: Record<string, number> }, t0: number, counter: CountingBroker = operator) => {
        const loop: LoopRecord = { n: loops.length + 1, ...partial, tools: partial.tools ?? counter.take(), mother: await newLines(), ms: Date.now() - t0 } as LoopRecord;
        loops.push(loop);
        console.log(`loop ${loop.n} ${loop.name}: ${loop.decisions ?? "-"} decision(s), ${Object.values(loop.tools).reduce((a, b) => a + b, 0)} call(s), ${Math.round(loop.ms / 1000)} s`);
        return loop;
    };
    /** A factory task, run by the model, read back from its manifest: the steps, the refusals, the tokens. */
    const factoryLoop = async (taskId: string) => {
        const t0 = Date.now();
        let task: { state: string; manifest?: { steps?: Array<{ n: number; source: string; capability: string | null; outcome: string; reason: string | null; tokens: { prompt: number; completion: number } | null; input: unknown }>; ended?: string; provider?: unknown; artifacts?: unknown[] } };
        do {
            await new Promise((r) => setTimeout(r, 3000));
            task = await call(operator, "factory", "task", { taskId });
        } while ((task.state === "running" || task.state === "created") && Date.now() - t0 < 20 * 60000);
        const steps = task.manifest?.steps ?? [];
        const tools: Record<string, number> = {};
        for (const s of steps) if (s.capability) tools[s.capability] = (tools[s.capability] ?? 0) + 1;
        const tokens = steps.reduce((a, s) => ({ input: a.input + (s.tokens?.prompt ?? 0), output: a.output + (s.tokens?.completion ?? 0) }), { input: 0, output: 0 });
        return { task, steps, tools, tokens };
    };

    try {
        // ── 1. registration: the devices plug in; Mother's written rule opens the commissioning.
        let t0 = Date.now();
        const scene = JSON.parse(readFileSync(fromRoot("specs", "commissioning-devices.json"), "utf8")) as { devices: Array<Record<string, unknown>> };
        const opened: Array<string | null> = [];
        for (const d of scene.devices) opened.push((await call<{ commissioning: string | null }>(operator, "station", "registry_register", d)).commissioning);
        await call(operator, "station", "registry_report", { path: "/habitat/power/battery-1", readings: { stateOfCharge: 80 } });
        const commissioningId = opened.find((x) => x) as string;
        await record({ name: "registration", kind: "code", who: "the station (Mother), a written rule", goal: "register the five devices; open a commissioning for a device that acts without a qualified simulator", decisions: null, modelCalls: null, tokens: null, refusals: [], steps: [], output: { devices: scene.devices.length, commissioning: commissioningId } }, t0);

        // ── 2. the procedure factory: the model writes the test.
        t0 = Date.now();
        const reqP = await call<{ taskId: string; builder: string }>(operator, "factory", "request", {
            objective: { required_outputs: [{ name: "V_lab", quantity: "Volume", unit: "m3" }] },
            observations: { device: "/habitat/lab/eclss/scrubber-1" },
            topics: ["procedure"],
            budget: { iterations: 25, minutes: 15 },
            requestedBy: "station",
        });
        operator.take();
        const p = await factoryLoop(reqP.taskId);
        operator.take(); // the polling of the task is the script's, not the loop's
        const scorecard = JSON.parse(readFileSync(path.join(taskDir(reqP.taskId), "scorecard.json"), "utf8"));
        await record(
            {
                name: "procedure factory",
                kind: "model",
                who: `the factory, builder ${reqP.builder}`,
                goal: "write the test procedure that measures the served volume of the Lab, and have the guard accept it",
                tools: p.tools,
                decisions: p.steps.length,
                modelCalls: p.steps.filter((s) => s.source === "fallback" || s.source === "refused").length,
                tokens: p.tokens,
                refusals: p.steps.filter((s) => s.source === "refused").map((s) => ({ step: s.n, what: s.capability ?? "?", why: short(s.reason, 400) })),
                steps: p.steps.map((s) => ({ n: s.n, source: s.source, capability: s.capability, outcome: s.outcome, note: short(s.reason) })),
                output: { state: p.task.state, ended: p.task.manifest?.ended, scorecard, procedure: p.steps.filter((s) => s.capability === "procedure.submit" && s.outcome === "completed").map((s) => s.input).at(-1) ?? null },
            },
            t0,
        );
        if (p.task.state !== "proposed") throw new Error(`the procedure factory ended ${p.task.state}: ${p.task.manifest?.ended}`);

        // ── 3. the relay: Mother re-checked it when it was proposed (in loop 2's proposal); the commissioning now waits.
        t0 = Date.now();
        const c1 = (await call<{ commissioning: { status: string; procedure: { procedureId: string; occupants: unknown[]; minutes: number; content: { steps: unknown[] } } } }>(operator, "station", "commissioning_state", { commissioningId })).commissioning;
        await record({ name: "relay", kind: "code", who: "the station (Mother)", goal: "check the proposed procedure again with the occupancy she reads, and ask the commander", decisions: null, modelCalls: null, tokens: null, refusals: [], steps: [], output: { status: c1.status, procedure: c1.procedure?.procedureId, occupants: c1.procedure?.occupants, minutes: c1.procedure?.minutes } }, t0);

        // ── 4. the commander authorises (the human, stood in by this script); the monitoring opens.
        t0 = Date.now();
        const auth = await call<{ status: string; monitoring: unknown }>(operator, "station", "commissioning_authorise", { commissioningId, decision: "authorise", by: "commander", note: "example run" });
        await record({ name: "authorisation", kind: "human (stood in by the script)", who: "the commander", goal: "authorise the test; Mother opens the medical monitoring of the occupants", decisions: 1, modelCalls: null, tokens: null, refusals: [], steps: [], output: auth }, t0);

        // ── 5. the agent executes, the stand-in world answering the commands the board took.
        t0 = Date.now();
        const world = new TwoZoneWorldSim(LAB_WORLD);
        const speedNow = async () => (await call<{ speedPercent: number }>(operator, "scrubber", "motor.state")).speedPercent;
        await call(operator, "scrubber", "debug.set_co2", { state: "NOMINAL", ppm: Math.round(world.labPpm) });
        telemetry.push(world.row(await speedNow()));
        operator.take();
        const run = await runProcedure({
            broker: agent,
            commissioningId,
            waitMinute: async () => {
                const speed = await speedNow();
                world.step(speed);
                await call(operator, "scrubber", "debug.set_co2", { state: "NOMINAL", ppm: Math.round(world.labPpm) });
                telemetry.push(world.row(speed));
            },
        });
        operator.take();
        writeFileSync(path.join(outDir, "telemetry.json"), JSON.stringify(telemetry, null, 1));
        await record({ name: "execution", kind: "code", who: "the agent's executor (tier3/procedure.ts), under the agent's rights", goal: "run the procedure one command at a time, reading the abort conditions every minute", decisions: null, modelCalls: null, tokens: null, refusals: [], steps: [], output: { status: run.status, aborted: run.aborted, minutes: telemetry.length - 1 } }, t0, agent);

        // ── 6. the report.
        t0 = Date.now();
        const report = run.report;
        await record({ name: "report", kind: "code", who: "the station (Mother), the decay fit", goal: "close the monitoring, compute the apparent volume from the decay (one room assumed)", decisions: null, modelCalls: null, tokens: null, refusals: [], steps: [], output: { volume: report?.result, steps: report?.steps.map((s) => ({ n: s.n, speed: s.speedPercent, co2: [s.co2StartPpm, s.co2EndPpm] })), vitalEvents: report?.vitalEvents } }, t0);

        // ── 7. the Observer: from the description and the telemetry, what the twin must do.
        t0 = Date.now();
        const description = [
            "SYSTEM DESCRIPTION",
            "Asset: the CO2 scrubber of the Lab module of a lunar habitat, just installed and commissioned.",
            "Purpose: keep the CO2 of the air the crew breathes within limits; its twin will be asked what if questions about scrubber speed strategies at night.",
            "Physical components: the Lab module (a volume of air); the scrubber, variable speed; a CO2 sensor in the Lab; a hatch between the Lab and Hab-B, closed during the test; a CO2 sensor in Hab-B; the crew (two operators in the Lab, two people in Hab-B).",
            `Test just run: ${report?.steps.map((s) => `${s.speedPercent} % for ${s.minutes} min`).join(", then ")}, hatch closed. Apparent volume from the decay, one room assumed: ${report?.result.value ?? "not computed"} m3 (${report?.result.why ?? ""}).`,
            "Available telemetry: see the summary.",
            "Controllable: scrubber speed.",
            "Objective: the twin must reproduce the CO2 of the Lab well enough to evaluate scrubber speed strategies.",
        ].join("\n");
        const model = await ReasonerProvider.connect(operator);
        model.usePrompt(OBSERVER_PROMPT);
        const obs = await observe({ provider: model, broker: operator, description, telemetry: telemetry as unknown as Array<Record<string, unknown>> });
        const obsTokens = model.exchanges.reduce((a, x) => ({ input: a.input + (x.tokens?.prompt ?? 0), output: a.output + (x.tokens?.completion ?? 0) }), { input: 0, output: 0 });
        await record(
            {
                name: "observer",
                kind: "model",
                who: `the Observer, ${model.name} with harness/observer/prompt.md`,
                goal: "from the description and the telemetry, formulate what the twin must do (the TWIN_FACTORY_REQUEST), without seeing the catalogue",
                tools: { "reasoner.decide": model.exchanges.length, ...operator.take() },
                decisions: obs.attempts.length + obs.reads.length,
                modelCalls: model.exchanges.length,
                tokens: obsTokens,
                refusals: obs.attempts.filter((a) => !a.ok).map((a) => ({ step: a.n, what: "observer.request", why: short(a.problems.join("; "), 400) })),
                steps: obs.attempts.map((a) => ({ n: a.n, source: "model", capability: "observer.request", outcome: a.ok ? "accepted" : "refused", note: short(a.problems.join("; ")) })),
                output: { accepted: obs.ok, libraryReads: obs.reads, request: obs.request, description },
            },
            t0,
        );
        if (!obs.ok || !obs.request) throw new Error("the Observer's request was not accepted");

        // ── 8. the graph factory: candidates, residuals, the loop on the gap. The threshold is the operator's.
        t0 = Date.now();
        const contract = factoryContractOf(obs.request);
        const reqG = await call<{ taskId: string; builder: string }>(operator, "factory", "request", {
            ...contract,
            objective: { ...contract.objective, constraints: { ...contract.objective.constraints, residualPpmMax: 25 } },
            data: [{ file: "telemetry.json", rows: telemetry }],
            budget: { iterations: 30, minutes: 20, twinPoints: 600 },
            requestedBy: "observer",
        });
        operator.take();
        const g = await factoryLoop(reqG.taskId);
        operator.take();
        // No candidate file when no evaluation ran: the journal says so rather than stopping.
        const candidatesFile = path.join(taskDir(reqG.taskId), "candidates.json");
        const candidates = existsSync(candidatesFile) ? JSON.parse(readFileSync(candidatesFile, "utf8")) : [];
        await record(
            {
                name: "graph factory",
                kind: "model",
                who: `the graph factory, builder ${reqG.builder}`,
                goal: "build the twin from the catalogue and make it evolve by its gap to the telemetry until the residual is under 25 ppm",
                tools: g.tools,
                decisions: g.steps.length,
                modelCalls: g.steps.filter((s) => s.source === "fallback" || s.source === "refused").length,
                tokens: g.tokens,
                refusals: g.steps.filter((s) => s.source === "refused" || s.outcome !== "completed").map((s) => ({ step: s.n, what: s.capability ?? "?", why: short(s.reason, 400) })),
                steps: g.steps.map((s) => ({ n: s.n, source: s.source, capability: s.capability, outcome: s.outcome, note: short(s.reason) })),
                output: { state: g.task.state, ended: g.task.manifest?.ended, candidates, truth: LAB_WORLD },
            },
            t0,
        );

        // ── 8b. the references: the graphs written by hand, run on the same telemetry with what the model was given, and every candidate compared with them.
        t0 = Date.now();
        const task = (JSON.parse(readFileSync(path.join(taskDir(reqG.taskId), "task.json"), "utf8")) as TaskFile).task;
        const rows = telemetry as unknown as Array<Record<string, number>>;
        // What the documentation gives, and nothing the world alone knows: the crew's rate is NASA's band, not the world's value.
        const given = { N: 2, Qe: 1.0, lag: 3.33 };
        const compare = [{ node: "lab", property: "co2Ppm", column: "co2_lab_ppm" }];
        const byHand: Array<{ name: string; spec: Spec; fit: Record<string, { min: number; max: number }> }> = [
            { name: "by hand: the Lab alone", spec: labCandidate(false) as unknown as Spec, fit: { V: { min: 10, max: 200 }, g: { min: 0.26, max: 0.45 } } },
            { name: "by hand: the Lab and the exchange through the hatch", spec: labCandidate(true) as unknown as Spec, fit: { V: { min: 10, max: 200 }, g: { min: 0.26, max: 0.45 }, q: { min: 0, max: 2 } } },
        ];
        const references: Array<{ name: string; rmse: number | null; variables: Record<string, number> | null; error?: string }> = [];
        let handFit: Record<string, number> | null = null;
        for (const [i, h] of byHand.entries()) {
            try {
                const r = await evaluateCandidate({ label: h.name, spec: h.spec, compare, variables: given, fit: h.fit, maxRuns: 60 }, { broker: operator, taskId: reqG.taskId, task: { ...task, requirements: undefined }, rows, remaining: 200, n: 100 + i });
                references.push({ name: h.name, rmse: Math.max(...r.candidate.residuals.map((x) => x.rmse)), variables: r.candidate.variables });
                if (i === 1) handFit = r.candidate.variables;
            } catch (e) {
                references.push({ name: h.name, rmse: null, variables: null, error: errorMessage(e) });
            }
        }
        const handGraph = referenceOfSpec(labCandidate(true) as unknown as Spec, "the commissioning graph written by hand");
        const station = stationReference();
        const comparisons = (candidates as Candidate[]).map((c) => ({
            n: c.n,
            label: c.label,
            rmse: Math.max(...c.residuals.map((x) => x.rmse)),
            variables: c.variables,
            againstStationTwin: c.structure && station ? compareGraphs(c.structure, station) : null,
            againstHandGraph: c.structure ? compareGraphs(c.structure, handGraph) : null,
            // The numbers, once both graphs are resolved at their fitted variables: a matching structure can hide a rate off by ten.
            numbersAgainstHandGraph: c.spec && handFit ? compareParameters({ spec: c.spec, variables: c.variables }, { spec: labCandidate(true) as unknown as Spec, variables: handFit }, rows).filter((p) => !(p.ratio > 0.8 && p.ratio < 1.25)) : null,
        }));
        await record(
            {
                name: "references",
                kind: "code",
                who: "the script: the graphs written by hand, and the comparison",
                goal: "run the hand-written graphs on the same telemetry with only what the model was given (the crew's rate as NASA's band), and compare every candidate with them and with the station's twin",
                tools: operator.take(),
                decisions: null,
                modelCalls: null,
                tokens: null,
                refusals: [],
                steps: [],
                output: { truth: { V: LAB_WORLD.VLab, q: LAB_WORLD.q, g: LAB_WORLD.gLabPerson }, references, stationTwin: station, handGraph, comparisons },
            },
            t0,
        );

        // ── 9. the proposal (made by the factory's runner at the end of loop 8).
        t0 = Date.now();
        const proposals = JSON.parse((await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://proposals" })).contents[0].text);
        await record({ name: "proposal", kind: "code", who: "the factory's runner, then the station", goal: "propose the accepted twin to the station, which receives it for the judge", decisions: null, modelCalls: null, tokens: null, refusals: [], steps: [], output: proposals.at(-1) ?? null }, t0);
    } catch (e) {
        console.error(`the example stopped: ${errorMessage(e)}`);
        loops.push({ n: loops.length + 1, name: "stopped", kind: "code", who: "the script", goal: "", tools: {}, decisions: null, modelCalls: null, tokens: null, refusals: [], steps: [], output: errorMessage(e), mother: await newLines().catch(() => []), ms: 0 });
    } finally {
        const journal = { stamp, world: LAB_WORLD, loops, telemetry };
        writeFileSync(path.join(outDir, "journal.json"), JSON.stringify(journal, null, 2));
        writeFileSync(path.join(outDir, "journal.md"), markdownOf(journal));
        console.log(`journal: ${relativeToRoot(path.join(outDir, "journal.md"))}`);
        await operator.close();
        await agent.close();
        await started.stop();
    }
}

/** The journal as a table per loop, for a reader. */
export function markdownOf(journal: { stamp: string; loops: LoopRecord[] }): string {
    const out = [`# Commissioning example, ${journal.stamp}`, "", "| # | loop | kind | decisions | model calls | tokens in/out | calls | seconds |", "|---|---|---|---|---|---|---|---|"];
    for (const l of journal.loops) out.push(`| ${l.n} | ${l.name} | ${l.kind} | ${l.decisions ?? "-"} | ${l.modelCalls ?? "-"} | ${l.tokens ? `${l.tokens.input}/${l.tokens.output}` : "-"} | ${Object.values(l.tools).reduce((a, b) => a + b, 0)} | ${Math.round(l.ms / 1000)} |`);
    for (const l of journal.loops) {
        out.push("", `## ${l.n}. ${l.name}`, "", `- who: ${l.who}`, `- goal: ${l.goal}`, `- tools: ${Object.entries(l.tools).map(([k, v]) => `${k} x${v}`).join(", ") || "none"}`);
        if (l.steps.length) {
            out.push("", "| step | source | capability | outcome | note |", "|---|---|---|---|---|");
            for (const s of l.steps) out.push(`| ${s.n} | ${s.source} | ${s.capability ?? "-"} | ${s.outcome} | ${s.note.replace(/\|/g, "/")} |`);
        }
        if (l.refusals.length) out.push("", "Refusals:", ...l.refusals.map((r) => `- step ${r.step}, ${r.what}: ${r.why}`));
        if (l.mother.length) out.push("", "Mother:", ...l.mother.map((m) => `> ${m}`));
        out.push("", "Output:", "", "```json", JSON.stringify(l.output, null, 2).slice(0, 6000), "```");
    }
    return out.join("\n") + "\n";
}

if (isMain(import.meta.url)) {
    main().then(
        () => process.exit(0),
        (e) => {
            console.error(e);
            process.exit(1);
        },
    );
}
