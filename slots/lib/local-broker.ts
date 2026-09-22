/**
 * The broker as a child process of this repository: `run-all` and the tests
 * start it the same way. It reads `.mcp-broker/config.json` at the root
 * (which mounts `dashboard/` as its static site); the port, and the browser
 * origins that go with it, are passed through its environment.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { networkInterfaces } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "../../lib/paths.js";

export interface LocalBroker {
    process: ChildProcess;
    port: number;
    httpBase: string;
    wsBase: string;
    /** The addresses another device on the same network can open, `http://<ip>:<port>`. */
    lanBases: string[];
    stop(): void;
}

/**
 * The machine's addresses on the local network.
 *
 * The broker already listens on every interface (`host: "0.0.0.0"` in its
 * config), but a page opened from a tablet carries the origin it was served
 * from, and the broker answers 403 to an origin it was not told about. The
 * medical monitoring page is meant to be held in someone's hands, away from
 * the machine, so those origins are added at start rather than typed in by
 * hand on a filming day.
 */
export function lanAddresses(): string[] {
    const out: string[] = [];
    for (const list of Object.values(networkInterfaces())) {
        for (const n of list ?? []) {
            // `family` is "IPv4" on Node 18+ and 4 on some older typings; accept both.
            const v4 = n.family === "IPv4" || (n.family as unknown as number) === 4;
            if (v4 && !n.internal) out.push(n.address);
        }
    }
    return [...new Set(out)];
}

/**
 * The broker's CLI entry, resolved from the installed package. Its exports map
 * hides package.json, so the package directory is taken from the main entry's
 * path and the bin is the one the package declares, `dist/bin.js`.
 */
export function brokerBin(): string {
    const main = fileURLToPath(import.meta.resolve("@cyanmycelium/mcp-broker"));
    const marker = path.join("node_modules", "@cyanmycelium", "mcp-broker");
    const at = main.indexOf(marker);
    if (at < 0) throw new Error(`cannot locate the mcp-broker package from ${main}`);
    return path.join(main.slice(0, at + marker.length), "dist", "bin.js");
}

/** True once `_broker` answers `initialize` on `httpBase`. */
export async function waitForBroker(httpBase: string, timeoutMs = 15_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const r = await fetch(`${httpBase}/_broker/mcp`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "wait-for-broker", version: "0" } } }),
            });
            if (r.ok) return true;
        } catch {
            // not up yet
        }
        await new Promise((res) => setTimeout(res, 250));
    }
    return false;
}

/** Starts the broker on `port` and waits until it answers; `stdio` "inherit" shows its banner, "ignore" keeps a test quiet. */
export async function startBroker(port: number, stdio: "inherit" | "ignore" = "inherit"): Promise<LocalBroker> {
    const httpBase = `http://localhost:${port}`;
    const lanBases = lanAddresses().map((ip) => `http://${ip}:${port}`);
    // The browser origins follow the port: the config file names 3001, a page served on another port would get 403 on every call.
    // The local network addresses go in too, so a tablet on the same wifi can open the monitoring page and be answered.
    const origins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, ...lanBases].join(",");
    const child = spawn(process.execPath, [brokerBin()], { cwd: ROOT, stdio, env: { ...process.env, MCP_BROKER_PORT: String(port), MCP_BROKER_ALLOWED_ORIGINS: process.env.MCP_BROKER_ALLOWED_ORIGINS ?? origins } });
    const stop = () => {
        if (!child.killed) child.kill("SIGINT");
    };
    if (!(await waitForBroker(httpBase))) {
        stop();
        throw new Error(`the broker did not answer on ${httpBase} within 15 s`);
    }
    return { process: child, port, httpBase, wsBase: `ws://localhost:${port}`, lanBases, stop };
}
