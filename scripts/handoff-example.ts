/**
 * A passage of the hand-off on the model (docs/observateur-et-usines.fr.md,
 * section 6.5): one graph request whose required outputs include one no
 * node of the catalogue produces; the graph factory's model declares it
 * missing with a contract it writes; the factory opens the code task on
 * that contract; the code factory's model writes the node; the forge runs
 * the contract on it; the request is replayed on the forge's catalogue.
 * Three tasks, watched until they end, their journals and traces kept.
 *
 *   node dist/scripts/handoff-example.js --out <dir>          you are the commander: each question is put to you at the keyboard
 *   node dist/scripts/handoff-example.js --out <dir> --auto   a standing order answers every question with its first option
 *
 * The request is written here whole. The telemetry is the stand-in world's
 * (the two-zone habitat during a decay test). Nothing in the request names
 * a contract: the graph factory's model writes it, and that is what the
 * passage measures.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import * as path from "node:path";
import { fromRoot, isMain, relativeToRoot } from "../lib/paths.js";
import { startAll } from "../slots/run-all.js";
import { Broker } from "../harness/lib/broker.js";
import { taskDir } from "../slots/tools/lib/workshop.js";
import { renderTraceFile } from "./render-trace.js";
import { LAB_WORLD, twoZoneTelemetry } from "../harness/stand-in/two-zone-world.js";
import { GRAPH_PROMPT } from "../harness/topics/graph/index.js";
import { CODE_PROMPT } from "../harness/topics/code/index.js";

interface Step {
    n: number;
    capability: string | null;
    outcome: string;
    reason: string | null;
    summary?: string | null;
    tokens: { prompt: number; completion: number } | null;
}
interface Status {
    state: string;
    manifest?: { steps?: Step[]; ended?: string; artifacts?: Array<{ kind: string; path: string; sha256: string }> } | null;
    run?: { builder?: string; ended?: string | null; handoff?: { question?: string; codeTask?: string; replayTask?: string; parent?: string; reason?: string; stopped?: string } } | null;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const option = (name: string, fallback: string) => {
        const i = args.indexOf(name);
        return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
    };
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const outDir = path.resolve(option("--out", fromRoot("outputs", "examples", `handoff-${stamp}`)));
    mkdirSync(path.join(outDir, "trace"), { recursive: true });
    process.env.SPEECH_PROVIDER = "silent";
    process.env.BIOMED_PROVIDER = "simulated";
    process.env.FACTORY_RECIPES_DIR = path.join(outDir, "recipes");
    const started = await startAll(3162, () => undefined, "ignore");
    const operator = new Broker(started.broker.httpBase, { name: "operator", version: "0", locale: "en" });
    const call = async <T>(slot: string, tool: string, a: Record<string, unknown> = {}): Promise<T> => {
        const r = await operator.call(slot, tool, a);
        if (!r.ok) throw new Error(`${slot}.${tool}: ${r.error ?? r.outcome}`);
        return r.output as T;
    };
    const t0 = Date.now();
    const lines: string[] = [];
    const say = (s: string) => {
        console.log(s);
        lines.push(s);
    };
    type Question = { id: string; taskId: string | null; kind: string; status: string; question: string; options: Array<{ id: string; label: string }>; context: unknown };
    const readQuestions = async (): Promise<Question[]> => JSON.parse((await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://questions" })).contents[0].text) as Question[];
    const answered = new Set<string>();
    const rl = args.includes("--auto") ? null : readline.createInterface({ input: stdin, output: stdout });
    /** The open questions, put to the commander at the keyboard; each answer is station.answer, signed commander. */
    const commander = async (): Promise<void> => {
        for (const q of (await readQuestions()).filter((x) => x.status === "open" && !answered.has(x.id))) {
            answered.add(q.id);
            say(`question ${q.id} (${q.kind}, task ${q.taskId ?? "?"}): ${q.question}`);
            console.log(`context:\n${JSON.stringify(q.context, null, 2)}`);
            for (const o of q.options) console.log(`  ${o.id}: ${o.label}`);
            let choice = "";
            while (!q.options.some((o) => o.id === choice)) choice = (await rl!.question(`your answer (${q.options.map((o) => o.id).join(" / ")}): `)).trim();
            const note = (await rl!.question("a note, or nothing: ")).trim();
            await call("station", "answer", { questionId: q.id, choice, by: "commander", how: "script", ...(note ? { note } : {}) });
            say(`answered ${q.id}: ${choice}${note ? ` (${note})` : ""}`);
        }
    };
    try {
        if (args.includes("--auto")) {
            await call("station", "questions_policy", { mode: "auto" });
            say("standing order: every question answered with its first option");
        }
        const devices = (JSON.parse(readFileSync(fromRoot("specs", "commissioning-devices.json"), "utf8")) as { devices: unknown[] }).devices;
        const persons = [
            { id: "fe-1", callsign: "FE-1", name: "A. Pelletier", module: "lab", activity: "light_work" },
            { id: "fe-2", callsign: "FE-2", name: "M. Chen", module: "lab", activity: "light_work" },
            { id: "cdr", callsign: "CDR", name: "J. Picard", module: "hab-b", activity: "rest" },
            { id: "fe-3", callsign: "FE-3", name: "G. La Forge", module: "hab-b", activity: "rest" },
        ];
        const telemetry = twoZoneTelemetry(LAB_WORLD, [
            { speedPercent: 30, minutes: 20 },
            { speedPercent: 100, minutes: 30 },
        ]);
        const request = {
            objective: { required_outputs: [{ name: "predicted_co2", quantity: "Concentration", unit: "ppm" }, { name: "leak_co2", quantity: "MassFlow", unit: "kg/s" }], constraints: { residualPpmMax: 10 } },
            observations: { persons, devices },
            data: [{ file: "telemetry.json", rows: telemetry }],
            requirements: {
                objective: "reproduce the Lab CO2 during the decay test, and expose the CO2 that leaves the Lab through a leak in a seal: a mass flow out of the volume at a constant rate at full opening, scaled by a command between 0 and 1 (the leak fully open when nothing commands it), the rate an editable of the node",
                missing_information: ["the flow the inter-module ventilation delivers, hatch closed", "the leak's rate at full opening: not measured, to be set as an editable"],
                hypotheses: ["a seal of the Lab leaks; no node of the catalogue expresses a leak (every CO2 sink of the catalogue is a scrubber)"],
            },
            budget: { iterations: 16, twinPoints: 200 },
            builder: "reasoner",
            requestedBy: "the hand-off example",
        };
        const req = await call<{ taskId: string }>("factory", "request", request);
        say(`graph task ${req.taskId} started`);
        const watch = async (taskId: string, label: string): Promise<Status> => {
            let status: Status;
            let seen = 0;
            do {
                await new Promise((r) => setTimeout(r, 3000));
                if (rl) await commander();
                status = await call<Status>("factory", "task", { taskId });
                const steps = status.manifest?.steps ?? [];
                for (const s of steps.slice(seen)) say(`  ${label} step ${s.n}: ${s.capability ?? "?"} -> ${s.outcome}${s.reason ? ` (${s.reason.slice(0, 200)})` : ""}`);
                seen = steps.length;
            } while (!status.run?.ended && Date.now() - t0 < 40 * 60000);
            return status;
        };
        const keep = (taskId: string, label: string, promptFile: string): string | null => {
            const file = path.join(taskDir(taskId), "trace.jsonl");
            if (!existsSync(file)) return null;
            writeFileSync(path.join(outDir, "trace", `${label}.jsonl`), readFileSync(file));
            return relativeToRoot(renderTraceFile(file, path.join(outDir, "trace", `${label}.md`), { title: `${label}: task ${taskId}`, promptFile }));
        };
        const summarise = (status: Status): { steps: number; refusals: number; tokens: string } => {
            const steps = status.manifest?.steps ?? [];
            const tokens = steps.reduce((a, s) => ({ input: a.input + (s.tokens?.prompt ?? 0), output: a.output + (s.tokens?.completion ?? 0) }), { input: 0, output: 0 });
            return { steps: steps.length, refusals: steps.filter((s) => s.outcome === "refused").length, tokens: `${tokens.input}/${tokens.output}` };
        };
        // 1. The graph factory: the plan with the missing capability and its contract, then the end on it.
        const parent = await watch(req.taskId, "graph");
        const parentTrace = keep(req.taskId, "01-graph-factory", GRAPH_PROMPT);
        const planFile = path.join(taskDir(req.taskId), "plan.json");
        const plan = existsSync(planFile) ? (JSON.parse(readFileSync(planFile, "utf8")) as { missing_capabilities?: Array<{ required_output: string; contract?: unknown }> }) : null;
        say(`graph task ${req.taskId}: ${parent.state}${parent.manifest?.ended ? ` (${parent.manifest.ended})` : ""}; missing: ${(plan?.missing_capabilities ?? []).map((m) => `${m.required_output}${m.contract ? " with a contract" : " without a contract"}`).join(", ") || "none"}`);
        // The commander decides whether the code factory is opened; the factory waits for the answer.
        const until = async (read: () => Promise<string | null | undefined>, what: string): Promise<string | null> => {
            const t1 = Date.now();
            for (;;) {
                if (rl) await commander();
                const v = await read();
                if (v) return v;
                if (Date.now() - t1 > 10 * 60000) {
                    say(`${what}: not decided in ten minutes`);
                    return null;
                }
                await new Promise((r) => setTimeout(r, 2000));
            }
        };
        const decided = (id: string) => call<Status>("factory", "task", { taskId: id }).then((s) => s.run?.handoff ?? {});
        const codeId = await until(async () => {
            const h = await decided(req.taskId);
            return h.codeTask ?? (h.stopped ? "stopped" : null);
        }, "the code factory");
        if (codeId === "stopped") say(`the commander stopped the hand-off: ${(await decided(req.taskId)).stopped}`);
        let code: Status | null = null;
        let codeTrace: string | null = null;
        let replayId: string | null = null;
        let replay: Status | null = null;
        let replayTrace: string | null = null;
        if (codeId && codeId !== "stopped") {
            say(`code task ${codeId} opened on the contract`);
            code = await watch(codeId, "code");
            codeTrace = keep(codeId, "02-code-factory", CODE_PROMPT);
            say(`code task ${codeId}: ${code.state}${code.manifest?.ended ? ` (${code.manifest.ended})` : ""}`);
            // The plugin written, kept whole.
            const forgeDir = path.join(taskDir(codeId), "forge");
            if (existsSync(forgeDir)) {
                const walk = (dir: string, rel: string) => {
                    for (const entry of readdirSync(dir, { withFileTypes: true })) {
                        const full = path.join(dir, entry.name);
                        const r = rel ? `${rel}/${entry.name}` : entry.name;
                        if (entry.isDirectory()) {
                            if (entry.name !== "dist" && entry.name !== "node_modules") walk(full, r);
                        } else if (!/\.(js|map)$/.test(entry.name)) {
                            const target = path.join(outDir, "plugin", r);
                            mkdirSync(path.dirname(target), { recursive: true });
                            writeFileSync(target, readFileSync(full));
                        }
                    }
                };
                walk(forgeDir, "");
            }
            replayId = code.state === "proposed" ? await until(async () => {
                const h = await decided(req.taskId);
                return h.replayTask ?? (h.stopped ? "stopped" : null);
            }, "the replay") : null;
            if (replayId === "stopped") {
                say(`the commander stopped the hand-off: ${(await decided(req.taskId)).stopped}`);
                replayId = null;
            }
            if (replayId) {
                say(`graph task ${replayId} replayed on the forge`);
                replay = await watch(replayId, "replay");
                replayTrace = keep(replayId, "03-graph-factory-replayed", GRAPH_PROMPT);
                say(`replay ${replayId}: ${replay.state}${replay.manifest?.ended ? ` (${replay.manifest.ended})` : ""}`);
            }
        }
        const seconds = Math.round((Date.now() - t0) / 1000);
        const row = (label: string, id: string | null, s: Status | null, trace: string | null) => (s ? `| ${label} | ${id} | ${s.state} | ${summarise(s).steps} | ${summarise(s).refusals} | ${summarise(s).tokens} | ${trace ?? "-"} |` : `| ${label} | ${id ?? "-"} | not opened | - | - | - | - |`);
        const journal = [
            `# The hand-off on the model, ${stamp}`,
            "",
            `- seconds: ${seconds}; the commander: ${rl ? "at the keyboard" : "a standing order (--auto)"}`,
            `- the contract written by the graph factory's model: ${JSON.stringify((plan?.missing_capabilities ?? [])[0]?.contract ?? null, null, 2)}`,
            "",
            "| task | id | state | steps | refusals | tokens in/out | trace |",
            "|---|---|---|---|---|---|---|",
            row("graph factory", req.taskId, parent, parentTrace),
            row("code factory", codeId, code, codeTrace),
            row("graph factory, replayed on the forge", replayId, replay, replayTrace),
            "",
            "## Steps",
            "",
            ...lines.map((l) => `- ${l}`),
            "",
            "## Request",
            "",
            "```json",
            JSON.stringify({ ...request, data: [{ file: "telemetry.json", rows: `${telemetry.length} rows` }] }, null, 2),
            "```",
            "",
        ].join("\n");
        writeFileSync(path.join(outDir, "journal.md"), journal);
        console.log(`journal: ${relativeToRoot(path.join(outDir, "journal.md"))}`);
    } finally {
        rl?.close();
        await operator.close();
        await started.stop();
    }
}

if (isMain(import.meta.url)) {
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
