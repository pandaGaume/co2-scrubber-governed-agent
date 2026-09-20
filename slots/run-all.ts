/**
 * `npm run server`: one process for the whole local demo.
 *
 * Starts the broker as a child process (it reads `.mcp-broker/config.json`
 * next to this repository's root, which mounts `dashboard/` as its static
 * site), waits until its `_broker` slot answers, then publishes the four
 * slots on the shared tunnel. Ctrl-C stops everything.
 *
 *   node dist/slots/run-all.js                 broker + slots, http://localhost:3001/
 *   node dist/slots/run-all.js --no-broker     slots only, against a broker already running
 *   node dist/slots/run-all.js --port 3100     another port (the broker is told through its env)
 */
import { isMain } from "../lib/paths.js";
import { startBroker, type LocalBroker } from "./lib/local-broker.js";
import { scrubberSlot } from "./scrubber/provider.js";
import { twinSlot } from "./twin/provider.js";
import { stationSlot } from "./station/provider.js";
import { factorySlot } from "./factory/provider.js";
import { reasonerSlot } from "./reasoner/provider.js";
import { speechSlot } from "./speech/provider.js";
import type { PublishedSlot } from "./lib/slot-server.js";

/** The port `.mcp-broker/config.json` declares; the same default here, so the dashboard's allowed origins match. */
export const DEFAULT_PORT = 3001;

const log = (line: string) => console.log(`${new Date().toLocaleTimeString()}  ${line}`);

/** Publishes the slots on a broker; returns them, opened. */
export async function publishAll(wsBase: string, logger: (line: string) => void = log): Promise<PublishedSlot<object>[]> {
    const slots: PublishedSlot<object>[] = [scrubberSlot(wsBase, logger), twinSlot(wsBase, logger), stationSlot(wsBase, logger), factorySlot(wsBase, logger), reasonerSlot(wsBase, logger), speechSlot(wsBase, logger)];
    for (const s of slots) await s.open();
    return slots;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const flag = (name: string) => args.includes(name);
    const option = (name: string, fallback: string) => {
        const i = args.indexOf(name);
        return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
    };
    const port = Number(option("--port", String(DEFAULT_PORT)));
    const httpBase = `http://localhost:${port}`;
    const wsBase = `ws://localhost:${port}`;

    let broker: LocalBroker | null = null;
    if (!flag("--no-broker")) {
        broker = await startBroker(port);
        broker.process.on("exit", (code) => {
            log(`broker exited with code ${code}`);
            process.exit(code ?? 1);
        });
    }

    const slots = await publishAll(wsBase);
    log(`dashboard: ${httpBase}/   slots: ${slots.map((s) => s.slot).join(", ")}   introspection: ${httpBase}/_broker/mcp`);

    const stop = async () => {
        for (const s of slots) await s.close().catch(() => undefined);
        broker?.stop();
        process.exit(0);
    };
    process.on("SIGINT", () => void stop());
    process.on("SIGTERM", () => void stop());
}

if (isMain(import.meta.url)) {
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
