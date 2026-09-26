/**
 * A passage of the `code` topic on the model (docs/observateur-et-usines.fr.md,
 * section 6.3): one task opened on the factory with the topic `code`, the
 * builder behind the `reasoner` slot, the forge as the sandbox; the task
 * watched until it ends, its journal and its trace kept under
 * `docs/exemples/<date>-forge-<n>-<model>-code/`.
 *
 *   node dist/scripts/code-example.js                 the leak of CO2 (the gap of the fixture)
 *   node dist/scripts/code-example.js --out <dir>     where to write the journal and the trace
 *
 * Nothing is hard to reproduce: the request is written here whole, the
 * model reads the topic's prompt and the harness's briefs, the forge
 * refuses what it refuses. The journal says what happened, step by step,
 * with the tokens.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot, isMain, relativeToRoot } from "../lib/paths.js";
import { startAll } from "../slots/run-all.js";
import { Broker } from "../harness/lib/broker.js";
import { taskDir } from "../slots/tools/lib/workshop.js";
import { renderTraceFile } from "./render-trace.js";
import { CODE_PROMPT } from "../harness/topics/code/index.js";

interface Step {
    n: number;
    source: string;
    capability: string | null;
    outcome: string;
    reason: string | null;
    summary?: string | null;
    tokens: { prompt: number; completion: number } | null;
    ms?: number;
}

interface TaskStatus {
    state: string;
    manifest?: { steps?: Step[]; ended?: string; provider?: { name?: string; model?: string }; artifacts?: Array<{ kind: string; path: string; sha256: string }>; claims?: Record<string, unknown> };
    run?: { builder?: string; ended?: string | null } | null;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const option = (name: string, fallback: string) => {
        const i = args.indexOf(name);
        return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
    };
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const outDir = path.resolve(option("--out", fromRoot("outputs", "examples", `code-${stamp}`)));
    mkdirSync(outDir, { recursive: true });
    process.env.SPEECH_PROVIDER = "silent";
    process.env.BIOMED_PROVIDER = "simulated";
    process.env.FACTORY_RECIPES_DIR = path.join(outDir, "recipes");
    const started = await startAll(3161, () => undefined, "ignore");
    const operator = new Broker(started.broker.httpBase, { name: "operator", version: "0", locale: "en" });
    const call = async <T>(slot: string, tool: string, a: Record<string, unknown> = {}): Promise<T> => {
        const r = await operator.call(slot, tool, a);
        if (!r.ok) throw new Error(`${slot}.${tool}: ${r.error ?? r.outcome}`);
        return r.output as T;
    };
    const t0 = Date.now();
    try {
        // The request: what a graph factory would hand over when no node of the catalogue produces a required output.
        const request = {
            objective: { required_outputs: [{ name: "leak_co2", quantity: "MassFlow", unit: "kg/s" }] },
            observations: {
                gap: "the graph factory found no node of the catalogue that takes CO2 out of a volume at a constant mass flow scaled by a command (a leak through a seal, a vent held open): the atmosphere's delta_CO2 inputs take a mass flow in kg/s from any source, but every source of the catalogue is a person, a crew or a scrubber",
                wanted: "one node: an input command (Dimensionless, ratio, 0 to 1, 1 when unwired), an editable rate in kg/s at full opening, an output co2Delta (MassFlow, kg/s, negative: what leaves) for an atmosphere's delta_CO2 input, and a viewable of what left on the last tick",
            },
            // The capability contract, the task's and never the model's: the forge runs it on whatever the model writes (the third passage wrote "0 when unwired" where the prose said 1, and nothing had checked it).
            requirements: {
                capability: {
                    inputs: { command: { quantity: "Dimensionless", unit: "ratio", range: [0, 1], unwired: 1 } },
                    outputs: { co2Delta: { quantity: "MassFlow", unit: "kg/s", sign: "nonpositive" } },
                    parameters: { rateAtFullOpening: { quantity: "MassFlow", unit: "kg/s", editable: true, value: 0.002 } },
                    behaviors: ["output(command=0) == 0", "output(command=0.5) == -0.5 * rateAtFullOpening", "output(command=1) == -rateAtFullOpening", "output(unwired) == -rateAtFullOpening"],
                },
            },
            topics: ["code"],
            builder: "reasoner",
            requestedBy: "graph-factory (the example)",
            budget: { iterations: 24, minutes: 20, twinPoints: 10 },
        };
        const req = await call<{ taskId: string; started: boolean }>("factory", "request", request);
        console.log(`task ${req.taskId} started: ${req.started}`);
        let status: TaskStatus;
        let lastCount = 0;
        do {
            await new Promise((r) => setTimeout(r, 3000));
            status = await call<TaskStatus>("factory", "task", { taskId: req.taskId });
            const steps = status.manifest?.steps ?? [];
            for (const s of steps.slice(lastCount)) console.log(`  step ${s.n}: ${s.capability ?? "?"} -> ${s.outcome}${s.reason ? ` (${s.reason.slice(0, 160)})` : ""}`);
            lastCount = steps.length;
        } while ((status.state === "running" || status.state === "created") && Date.now() - t0 < 25 * 60000);
        const steps = status.manifest?.steps ?? [];
        const tools: Record<string, number> = {};
        for (const s of steps) if (s.capability) tools[s.capability] = (tools[s.capability] ?? 0) + 1;
        const tokens = steps.reduce((a, s) => ({ input: a.input + (s.tokens?.prompt ?? 0), output: a.output + (s.tokens?.completion ?? 0) }), { input: 0, output: 0 });
        const refusals = steps.filter((s) => s.outcome === "refused").map((s) => `${s.capability}: ${s.reason ?? ""}`);
        const seconds = Math.round((Date.now() - t0) / 1000);
        // The trace, rendered next to the journal.
        const traceDir = path.join(outDir, "trace");
        mkdirSync(traceDir, { recursive: true });
        const traceFile = path.join(taskDir(req.taskId), "trace.jsonl");
        let rendered: string | null = null;
        if (existsSync(traceFile)) {
            writeFileSync(path.join(traceDir, "01-code-factory.jsonl"), readFileSync(traceFile));
            rendered = relativeToRoot(renderTraceFile(traceFile, path.join(traceDir, "01-code-factory.md"), { title: `The code factory on the forge: task ${req.taskId}`, promptFile: CODE_PROMPT }));
        }
        // The plugin as written, kept whole: what the model wrote is the point of the passage.
        const pluginDir = path.join(taskDir(req.taskId), "forge");
        const written: string[] = [];
        if (existsSync(pluginDir)) {
            const walk = (dir: string, rel: string) => {
                for (const entry of readdirSync(dir, { withFileTypes: true })) {
                    const full = path.join(dir, entry.name);
                    const r = rel ? `${rel}/${entry.name}` : entry.name;
                    if (entry.isDirectory()) {
                        if (entry.name === "dist" || entry.name === "node_modules") continue;
                        walk(full, r);
                    } else if (entry.isFile() && !/\.(js|map)$/.test(entry.name)) {
                        const target = path.join(outDir, "plugin", r);
                        mkdirSync(path.dirname(target), { recursive: true });
                        writeFileSync(target, readFileSync(full));
                        written.push(r);
                    }
                }
            };
            walk(pluginDir, "");
        }
        const journal = [
            `# The code factory on the forge, ${stamp}`,
            "",
            `- task: ${req.taskId}`,
            `- builder: ${status.run?.builder ?? status.manifest?.provider?.name ?? "reasoner"}`,
            `- state: ${status.state}${status.manifest?.ended ? ` (${status.manifest.ended})` : ""}`,
            `- steps: ${steps.length}, refusals: ${refusals.length}, tokens in/out: ${tokens.input}/${tokens.output}, seconds: ${seconds}`,
            `- tools: ${Object.entries(tools).map(([k, v]) => `${k} x${v}`).join(", ") || "none"}`,
            `- artifacts: ${(status.manifest?.artifacts ?? []).map((a) => `${a.kind} ${a.path} (${a.sha256.slice(0, 12)})`).join(", ") || "none"}`,
            `- trace: ${rendered ?? "none"}`,
            `- plugin files kept: ${written.join(", ") || "none"}`,
            "",
            "## Steps",
            "",
            "| # | capability | outcome | tokens in/out | reason or summary |",
            "|---|---|---|---|---|",
            ...steps.map((s) => `| ${s.n} | ${s.capability ?? "?"} | ${s.outcome} | ${s.tokens ? `${s.tokens.prompt}/${s.tokens.completion}` : "-"} | ${String(s.reason ?? s.summary ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 300)} |`),
            "",
            "## Request",
            "",
            "```json",
            JSON.stringify(request, null, 2),
            "```",
            "",
        ].join("\n");
        writeFileSync(path.join(outDir, "journal.md"), journal);
        console.log(`\n${status.state}${status.manifest?.ended ? ` (${status.manifest.ended})` : ""}: ${steps.length} step(s), ${refusals.length} refusal(s), ${tokens.input}/${tokens.output} tokens, ${seconds} s`);
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
