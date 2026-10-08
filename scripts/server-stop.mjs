#!/usr/bin/env node
/**
 * Stops the demo's server wherever it was started (2026-10-08: a server started in a window nobody could find held the port, and
 * Windows' task manager names every server "Node.js JavaScript Runtime"): the processes whose command line runs this repository's
 * slots/run-all.js or its broker are found and ended, the broker with its server.
 *
 *     npm run server:stop
 *     npm run server:stop -- --list     what would be stopped, nothing stopped
 */
import { execFileSync } from "node:child_process";

const marks = ["slots/run-all.js", "slots\\run-all.js", "@cyanmycelium\\mcp-broker\\dist\\bin", "@cyanmycelium/mcp-broker/dist/bin"];

function processes() {
    if (process.platform === "win32") {
        const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"], { encoding: "utf8" });
        return out.split(/\r?\n/).filter(Boolean).map((l) => ({ pid: Number(l.split("\t")[0]), command: l.split("\t").slice(1).join("\t") }));
    }
    const out = execFileSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
    return out.split("\n").filter(Boolean).map((l) => ({ pid: Number(l.trim().split(/\s+/)[0]), command: l.trim().split(/\s+/).slice(1).join(" ") }));
}

const found = processes().filter((p) => p.pid !== process.pid && marks.some((m) => p.command.includes(m)));
if (!found.length) {
    console.log("no demo server is running");
    process.exit(0);
}
if (process.argv.includes("--list")) {
    for (const p of found) console.log(`pid ${p.pid}: ${p.command.slice(0, 120)}`);
    process.exit(0);
}
for (const p of found) {
    try {
        process.kill(p.pid);
        console.log(`stopped pid ${p.pid}: ${p.command.slice(0, 120)}`);
    } catch (e) {
        console.log(`pid ${p.pid} not stopped: ${e instanceof Error ? e.message : String(e)}`);
    }
}
