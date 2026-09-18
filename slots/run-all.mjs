/**
 * `npm run server`: one process for the whole local demo.
 *
 * Starts the broker as a child process (it reads `.mcp-broker/config.json`
 * next to this repository's root, which mounts `dashboard/` as its static
 * site), waits until its `_broker` slot answers, then publishes the four stub
 * slots on the shared tunnel. Ctrl-C stops everything.
 *
 *   node slots/run-all.mjs                 broker + slots, http://localhost:3000/
 *   node slots/run-all.mjs --no-broker     slots only, against a broker already running
 *   node slots/run-all.mjs --port 3100     another port (the broker is told through its env)
 */
import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { scrubberSlot } from "./scrubber/provider.mjs";
import { twinSlot } from "./twin/provider.mjs";
import { stationSlot } from "./station/provider.mjs";
import { factorySlot } from "./factory/provider.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const port = Number(option("--port", "3000"));
const httpBase = `http://localhost:${port}`;
const wsBase = `ws://localhost:${port}`;

const log = (line) => console.log(`${new Date().toLocaleTimeString()}  ${line}`);

/**
 * The broker's CLI entry, resolved from the installed package. Its exports map
 * hides package.json, so the package directory is taken from the main entry's
 * path and the bin is the one the package declares, `dist/bin.js`.
 */
function brokerBin() {
    const main = fileURLToPath(import.meta.resolve("@cyanmycelium/mcp-broker"));
    const marker = path.join("node_modules", "@cyanmycelium", "mcp-broker");
    const at = main.indexOf(marker);
    if (at < 0) throw new Error(`cannot locate the mcp-broker package from ${main}`);
    return path.join(main.slice(0, at + marker.length), "dist", "bin.js");
}

async function waitForBroker(timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const r = await fetch(`${httpBase}/_broker/mcp`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "run-all", version: "0" } } }),
            });
            if (r.ok) return true;
        } catch {
            // not up yet
        }
        await new Promise((res) => setTimeout(res, 250));
    }
    return false;
}

let broker = null;
if (!flag("--no-broker")) {
    broker = spawn(process.execPath, [brokerBin()], {
        cwd: ROOT, // so the broker finds .mcp-broker/config.json
        stdio: "inherit",
        env: { ...process.env, MCP_BROKER_PORT: String(port) },
    });
    broker.on("exit", (code) => {
        log(`broker exited with code ${code}`);
        process.exit(code ?? 1);
    });
    if (!(await waitForBroker())) {
        log(`the broker did not answer on ${httpBase} within 15 s`);
        broker.kill();
        process.exit(1);
    }
}

const slots = [scrubberSlot(wsBase, log), twinSlot(wsBase, log), stationSlot(wsBase, log), factorySlot(wsBase, log)];
for (const s of slots) s.open();

log(`dashboard: ${httpBase}/   slots: ${slots.map((s) => s.slot).join(", ")}   introspection: ${httpBase}/_broker/mcp`);

const stop = () => {
    for (const s of slots) s.close();
    if (broker) broker.kill("SIGINT");
    process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
