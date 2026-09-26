/**
 * A passage of the hand-off on the model (docs/observateur-et-usines.fr.md,
 * section 6.5): one graph request whose required outputs include one no
 * node of the catalogue produces; the graph factory's model declares it
 * missing with a contract it writes; the factory opens the code task on
 * that contract; the code factory's model writes the node; the forge runs
 * the contract on it; the request is replayed on the forge's catalogue.
 * Three tasks, watched until they end, their journals and traces kept.
 *
 *   node dist/scripts/handoff-example.js --out <dir>
 *
 * The request is written here whole. The telemetry is the stand-in world's
 * (the two-zone habitat during a decay test). Nothing in the request names
 * a contract: the graph factory's model writes it, and that is what the
 * passage measures.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
    run?: { builder?: string; ended?: string | null; handoff?: { codeTask?: string; replayTask?: string; parent?: string; reason?: string } } | null;
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
    try {
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
        const codeId = parent.run?.handoff?.codeTask ?? null;
        let code: Status | null = null;
        let codeTrace: string | null = null;
        let replayId: string | null = null;
        let replay: Status | null = null;
        let replayTrace: string | null = null;
        if (codeId) {
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
            replayId = (await call<Status>("factory", "task", { taskId: req.taskId })).run?.handoff?.replayTask ?? null;
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
            `- seconds: ${seconds}`,
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
