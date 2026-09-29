/**
 * Forks of the context (2026-09-29, P3 of docs/comportement-en-donnees.fr.md, `lib/fork.ts`): an environment set
 * apart where the agents may change the library, the specs and the graphs, and where what they change is observed.
 *
 *   npm run fork -- create <id> [--from <fork>]   the context as it is now (or another fork, with its history)
 *   npm run fork -- run <id> [--port 3003] [--learn scripted|reasoner]   a server of its own on the fork's data; a snapshot when it starts and when it stops;
 *                                                 with --learn, at every abort Mother reflects and the fork adapts itself (the reflection's builder);
 *                                                 with --profile, the model behind the reasoner (factories and reflection) is that profile's
 *   npm run fork -- snapshot <id> [label]         what changed since the last snapshot, as a commit of the fork
 *   npm run fork -- reflect <id> [--port 3003] [--builder scripted]   Mother reads the fork's traces (its server must run) and asks the reflection for an adaptation
 *   npm run fork -- log <id>                      the fork's evolution, snapshot by snapshot
 *   npm run fork -- diff <id>                     its divergence from the repository's context as it is now
 *   npm run fork -- list
 *   npm run fork -- remove <id>                   the fork thrown away, with its history
 *
 * The server of a fork is another process on another port: the variables that would send its data elsewhere (the
 * tests' signatures, roles, workshops, recipes) are not passed to it, and are ignored in it anyway (`pathFromEnv`).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fromRepository, isMain } from "../lib/paths.js";
import { Broker } from "../harness/lib/broker.js";
import { createFork, forkDivergence, forkHistory, forkPath, listForks, readFork, removeFork, snapshotFork } from "../lib/fork.js";

/** What never goes into a fork's server: where the data would be read or written instead of the fork's. */
const OUTSIDE = ["FORK_DIR", "FORK_LEARNING", "WORKSHOP_DIR", "FACTORY_RECIPES_DIR", "LIBRARY_SIGNATURES_DIR", "LIBRARY_PROPOSALS_DIR", "STATION_ROLES_FILE"];

/** The repository's .env (the keys of the models), without what would send the fork's data out of it. */
function environmentOf(id: string, learn: string | undefined, profile: string | undefined): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    const file = fromRepository(".env");
    if (existsSync(file))
        for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
            const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
            if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
        }
    for (const k of OUTSIDE) delete env[k];
    env.FORK_DIR = forkPath(id);
    if (learn) env.FORK_LEARNING = learn;
    // The model behind the reasoner (the factories and the reflection): a profile of the repository, to compare models fork by fork.
    if (profile) env.REASONER_PROFILE = profile;
    return env;
}

function run(id: string, port: number, learn: string | undefined, profile: string | undefined): void {
    readFork(id);
    if (learn && learn !== "scripted" && learn !== "reasoner") throw new Error(`--learn is scripted (the reflection's script, no key) or reasoner (a model), not "${learn}"`);
    const start = snapshotFork(id, "the server starts");
    console.log(start ? `snapshot ${start.commit.slice(0, 12)}: ${start.files.length} file(s) changed since the last` : "nothing changed since the last snapshot");
    const child = spawn(process.execPath, [fromRepository("dist", "slots", "run-all.js"), "--port", String(port), "--no-open"], { cwd: fromRepository(), env: environmentOf(id, learn, profile), stdio: "inherit" });
    const stop = () => child.kill("SIGTERM");
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    child.on("exit", (code) => {
        const end = snapshotFork(id, "the server stops");
        console.log(end ? `snapshot ${end.commit.slice(0, 12)}: ${end.files.map((f) => `${f.status} ${f.path}`).join(", ")}` : "the server stopped; nothing changed");
        process.exit(code ?? 0);
    });
}

/** Mother reflects in a running fork: the patterns of its traces, and the reflection's task when there are some. */
async function reflect(id: string, port: number, builder: string | undefined): Promise<void> {
    readFork(id);
    const broker = new Broker(`http://localhost:${port}`, { name: "fork-cli", version: "0", locale: "en" });
    try {
        const env = await broker
            .session("station")
            .then((s) => s.request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://environment" }))
            .catch((e: unknown) => {
                throw new Error(`no station answers on port ${port} (${e instanceof Error ? e.message : String(e)}): start the fork's server first, npm run fork -- run ${id} --port ${port}`);
            });
        const fork = (JSON.parse(env.contents[0].text) as { fork: { id: string } | null }).fork;
        if (fork?.id !== id) throw new Error(`the server on port ${port} runs ${fork ? `the fork ${fork.id}` : "the repository's context"}, not the fork ${id}: npm run fork -- run ${id} --port ${port}`);
        const r = await broker.call("station", "reflect", builder ? { builder } : {});
        if (!r.ok) throw new Error(String(r.error ?? r.outcome));
        const out = r.output as { patterns: Array<{ id: string; says: string }>; taskId: string | null };
        console.log(`${out.patterns.length} pattern(s) in the traces${out.patterns.map((p) => `
  ${p.id}: ${p.says}`).join("")}`);
        console.log(out.taskId ? `the reflection's task: ${out.taskId}; the station adopts its adaptation in the fork when it arrives (npm run fork -- log ${id})` : "nothing to adapt");
    } finally {
        await broker.close();
    }
}

function main(): void {
    const [command, id, ...rest] = process.argv.slice(2);
    const option = (name: string): string | undefined => {
        const i = rest.indexOf(name);
        return i >= 0 ? rest[i + 1] : undefined;
    };
    switch (command) {
        case "create": {
            const r = createFork(id, { ...(option("--from") ? { from: option("--from") } : {}) });
            console.log(`fork ${r.id} in ${forkPath(r.id)}${r.parent ? `, from the fork ${r.parent}` : `, from ${r.origin.commit?.slice(0, 12) ?? "the repository"}${r.origin.dirty ? " (with changes not committed)" : ""}`}; first commit ${r.commit.slice(0, 12)}`);
            console.log(`run it: npm run fork -- run ${r.id}`);
            return;
        }
        case "run":
            return run(id, Number(option("--port") ?? 3003), option("--learn"), option("--profile"));
        case "snapshot": {
            const s = snapshotFork(id, rest.filter((x) => !x.startsWith("--")).join(" ") || "snapshot");
            console.log(s ? `snapshot ${s.commit.slice(0, 12)}\n${s.files.map((f) => `  ${f.status} ${f.path}`).join("\n")}` : "nothing changed since the last snapshot");
            return;
        }
        case "reflect":
            void reflect(id, Number(option("--port") ?? 3003), option("--builder")).catch((e) => {
                console.error(e instanceof Error ? e.message : String(e));
                process.exit(1);
            });
            return;
        case "log":
            for (const c of forkHistory(id)) console.log(`${c.commit.slice(0, 12)} ${c.at} ${c.label}\n${c.files.map((f) => `  ${f}`).join("\n")}`);
            return;
        case "diff": {
            const d = forkDivergence(id);
            const show = (what: string, list: string[]) => console.log(`${what} (${list.length})${list.map((f) => `\n  ${f}`).join("")}`);
            show("added in the fork", d.added);
            show("changed in the fork, or in the repository since", d.changed);
            show("removed in the fork", d.removed);
            return;
        }
        case "list":
            for (const f of listForks()) console.log(`${f.id.padEnd(32)} ${f.createdAt} ${f.parent ? `from the fork ${f.parent}` : `from ${f.origin.commit?.slice(0, 12) ?? "?"}`}`);
            return;
        case "remove":
            removeFork(id);
            console.log(`fork ${id} removed`);
            return;
        default:
            console.log("npm run fork -- create <id> [--from <fork>] | run <id> [--port 3003] [--learn scripted|reasoner] [--profile profiles/<name>.json] | snapshot <id> [label] | reflect <id> [--port 3003] [--builder scripted] | log <id> | diff <id> | list | remove <id>");
    }
}

if (isMain(import.meta.url)) {
    try {
        main();
    } catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
    }
}
