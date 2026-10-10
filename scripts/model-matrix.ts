/**
 * The configuration matrix (2026-10-10): the commissioning example run on each configuration of scripts/model-matrix.json, one after the
 * other, with the full logs (.logs/<test>/log.md), then a table of the results: for each configuration, whether the chain went through,
 * each harness task with its model, its state, its steps and its refusals, and the calls and tokens of each model.
 *
 *     npm run build && node dist/scripts/model-matrix.js [scripts/model-matrix.json] [--only id,id]
 *
 * Writes outputs/matrix/<stamp>/report.md and results.json, and each run's console output beside them. The keys are read from .env; the
 * broker's security file is left out, as the example runs its own broker. A provider added later is a profile and an entry in the file.
 */
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot } from "../lib/paths.js";

interface Config {
    id: string;
    provider: string;
    label: string;
    profile: string;
    routing?: Record<string, string>;
}

interface TaskResult {
    taskId: string;
    topic: string;
    model: string;
    state: string;
    steps: number;
    refused: number;
    ended: string;
}

interface RunResult {
    config: Config;
    log: string | null;
    complete: boolean;
    stopped: string | null;
    minutes: number;
    tasks: TaskResult[];
    models: Array<{ model: string; calls: number; prompt: number; cached: number; completion: number }>;
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? "scripts/model-matrix.json";
const only = (() => {
    const i = args.indexOf("--only");
    return i >= 0 ? new Set(String(args[i + 1] ?? "").split(",").filter(Boolean)) : null;
})();
const configs = (JSON.parse(readFileSync(fromRoot(file), "utf8")) as { configs: Config[] }).configs.filter((c) => !only || only.has(c.id));

/** The keys of .env, the broker's security file left out (the example runs its own broker, without it). */
function dotenv(): Record<string, string> {
    const out: Record<string, string> = {};
    const env = fromRoot(".env");
    if (!existsSync(env)) return out;
    for (const line of readFileSync(env, "utf8").split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && m[1] !== "MCP_BROKER_SECURITY_FILE") out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = fromRoot("outputs", "matrix", stamp);
mkdirSync(dir, { recursive: true });
const routingBase = JSON.parse(readFileSync(fromRoot("specs", "reasoner", "routing.json"), "utf8")) as { uses: Record<string, string | null> };
const keys = dotenv();
const results: RunResult[] = [];

for (const config of configs) {
    // Every use on the configuration's profile, but those it routes elsewhere.
    const uses = Object.fromEntries(Object.keys(routingBase.uses).map((k) => [k, config.routing?.[k] ?? null]));
    const routing = path.join(dir, `routing-${config.id}.json`);
    writeFileSync(routing, JSON.stringify({ ...routingBase, uses }, null, 2) + "\n");
    const env: Record<string, string> = { ...(process.env as Record<string, string>), ...keys, REASONER_PROFILE: config.profile, REASONER_ROUTING: routing };
    delete env.MCP_BROKER_SECURITY_FILE;
    delete env.DEBUG;
    console.log(`[matrix] ${config.id} (${config.provider} ${config.label}) starts`);
    const started = Date.now();
    // The console output written as it comes, so a run can be watched while it goes.
    const outFile = path.join(dir, `${config.id}.out.txt`);
    const fd = openSync(outFile, "w");
    const run = spawnSync(process.execPath, [fromRoot("dist", "scripts", "commissioning-example.js")], { cwd: fromRoot("."), env, stdio: ["ignore", fd, fd], timeout: 60 * 60 * 1000 });
    closeSync(fd);
    const out = readFileSync(outFile, "utf8");
    const log = /test log: (\S+)/.exec(out)?.[1]?.replace(/\/$/, "") ?? null;
    const stopped = /the example stopped: (.*)/.exec(out)?.[1] ?? (run.error ? String(run.error.message) : null);
    const readme = log && existsSync(fromRoot(log, "README.md")) ? readFileSync(fromRoot(log, "README.md"), "utf8") : "";
    const taskIds = [...new Set([...readme.matchAll(/^- (t-[0-9-]+) \(/gm)].map((m) => m[1]))];
    const tasks: TaskResult[] = taskIds.map((taskId) => {
        const manifest = fromRoot("outputs", "factory", taskId, "manifest.json");
        if (!existsSync(manifest)) return { taskId, topic: "?", model: "?", state: "?", steps: 0, refused: 0, ended: "" };
        const m = JSON.parse(readFileSync(manifest, "utf8")) as { topic: string; state: string; provider?: { model?: string }; ended?: string; steps: Array<{ outcome: string }> };
        return { taskId, topic: m.topic, model: m.provider?.model ?? "?", state: m.state, steps: m.steps.length, refused: m.steps.filter((s) => s.outcome === "refused").length, ended: String(m.ended ?? "") };
    });
    const models = [...readme.matchAll(/^\| ([^|]+?) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|$/gm)].map((m) => ({ model: m[1].trim(), calls: Number(m[2]), prompt: Number(m[3]), cached: Number(m[4]), completion: Number(m[5]) }));
    const complete = !stopped && tasks.length >= 3 && tasks.every((t) => t.state === "done" || t.state === "proposed");
    results.push({ config, log, complete, stopped, minutes: Math.round((Date.now() - started) / 6000) / 10, tasks, models });
    console.log(`[matrix] ${config.id}: ${complete ? "complete" : `not complete${stopped ? `: ${stopped.slice(0, 160)}` : ""}`} (${log ?? "no log"})`);
    writeFileSync(path.join(dir, "results.json"), JSON.stringify(results, null, 2) + "\n");
}

// The report: one line per configuration, then each one's tasks.
const n = (x: number): string => x.toLocaleString("fr-FR");
const taskOf = (r: RunResult, topic: string): string => {
    const t = r.tasks.find((x) => x.topic === topic);
    if (!t) return "pas atteinte";
    const state = t.state === "done" || t.state === "proposed" ? "faite" : t.state === "waiting" ? "en attente" : "échouée";
    return `${state}, ${t.steps} pas, ${t.refused} refus`;
};
const total = (r: RunResult, k: "calls" | "prompt" | "cached" | "completion"): number => r.models.reduce((s, m) => s + m[k], 0);
const lines = [
    `# Matrice de configurations, ${stamp.replace("T", " ")}`,
    "",
    `L'exemple de mise en service joué sur chaque configuration de \`${file}\`, avec le journal complet. Une configuration fait jouer tous les rôles par le même modèle, sauf ce que sa ligne route ailleurs.`,
    "",
    "| Configuration | Chaîne | Procédure | Observer | Fabrique de graphes | Appels | Jetons d'entrée (dont cache) | Jetons de sortie | Minutes | Journal |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.config.provider} ${r.config.label} | ${r.complete ? "**complète**" : "non"} | ${taskOf(r, "procedure")} | ${taskOf(r, "observer")} | ${taskOf(r, "graph")} | ${total(r, "calls")} | ${n(total(r, "prompt"))} (${n(total(r, "cached"))}) | ${n(total(r, "completion"))} | ${r.minutes} | ${r.log ? `[log.md](../../../${r.log}/log.md)` : "-"} |`),
    "",
    "## Le détail",
    "",
    ...results.flatMap((r) => [
        `### ${r.config.provider} ${r.config.label}`,
        "",
        `- profil : \`${r.config.profile}\`${r.config.routing ? `, routé ailleurs : ${Object.entries(r.config.routing).map(([k, v]) => `${k} → \`${v}\``).join(", ")}` : ""}`,
        `- journal : ${r.log ? `\`${r.log}/log.md\`` : "aucun"}`,
        ...(r.stopped ? [`- arrêt : ${r.stopped}`] : []),
        ...r.tasks.map((t) => `- ${t.taskId} (${t.topic}, ${t.model}) : ${t.state}, ${t.steps} pas, ${t.refused} refus${t.state === "done" || t.state === "proposed" ? "" : ` : ${t.ended.slice(0, 300)}`}`),
        ...r.models.map((m) => `- ${m.model} : ${m.calls} appels, ${n(m.prompt)} jetons d'entrée (${n(m.cached)} servis du cache), ${n(m.completion)} de sortie`),
        "",
    ]),
];
writeFileSync(path.join(dir, "report.md"), lines.join("\n"));
console.log(`[matrix] report: ${path.relative(fromRoot("."), path.join(dir, "report.md"))}`);
