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
 *   node dist/slots/run-all.js --no-open       do not open the browser on the dashboard
 */
import { exec } from "node:child_process";
import { isMain } from "../lib/paths.js";
import { startBroker, type LocalBroker } from "./lib/local-broker.js";
import { scrubberSlot } from "./scrubber/provider.js";
import { twinSlot } from "./twin/provider.js";
import { stationSlot } from "./station/provider.js";
import { factorySlot } from "./factory/provider.js";
import { reasonerSlot } from "./reasoner/provider.js";
import { agentSlot } from "./agent/provider.js";
import { scenarioSlot } from "./scenario/provider.js";
import { qrSlot } from "./tools/qr/provider.js";
import { speechSlot } from "./speech/provider.js";
import { biomedSlot } from "./biomed/provider.js";
import { workspaceSlot } from "./tools/workspace/provider.js";
import { modelSlot } from "./tools/model/provider.js";
import { librarySlot } from "./tools/library/provider.js";
import { screensSlot } from "./screens/provider.js";
import { startDiscovery } from "./lib/discovery.js";
import type { PublishedSlot } from "./lib/slot-server.js";

/** The port `.mcp-broker/config.json` declares; the same default here, so the dashboard's allowed origins match. */
export const DEFAULT_PORT = 3001;

const log = (line: string) => console.log(`${new Date().toLocaleTimeString()}  ${line}`);

const SLOTS: Array<[string, (wsBase: string, logger: (line: string) => void) => PublishedSlot<object>]> = [
    ["scrubber", scrubberSlot],
    ["twin", twinSlot],
    ["station", stationSlot],
    ["factory", factorySlot],
    ["reasoner", reasonerSlot],
    ["agent", agentSlot],
    ["scenario", scenarioSlot],
    ["qr", qrSlot],
    ["speech", speechSlot],
    ["biomed", biomedSlot],
    ["workspace", workspaceSlot],
    ["model", modelSlot],
    ["library", librarySlot],
    ["screens", screensSlot],
];

/** A slot that could not be published: its name and the reason, said once at start and kept for whoever asks. */
export interface SlotFailure {
    slot: string;
    reason: string;
}

export interface Published {
    slots: PublishedSlot<object>[];
    failures: SlotFailure[];
}

/**
 * Publishes every slot it can on a broker. A slot that cannot be built or
 * opened is a degraded mode, not a failure: it is reported with its name and
 * reason (the log line starts with `DEGRADED`), it stays absent from the
 * broker (red on the board), and the other slots run. The caller decides
 * what an absence means to it: the server keeps going, a test that needs the
 * slot fails on `failures`.
 */
export async function publishAll(wsBase: string, logger: (line: string) => void = log): Promise<Published> {
    const slots: PublishedSlot<object>[] = [];
    const failures: SlotFailure[] = [];
    for (const [name, make] of SLOTS) {
        try {
            const slot = make(wsBase, logger);
            await slot.open();
            slots.push(slot);
        } catch (e) {
            const raw = e instanceof Error ? e.message : String(e);
            const reason = raw.replace(new RegExp(`^slot "${name}" cannot be published: `), "");
            failures.push({ slot: name, reason });
            logger(`DEGRADED: slot "${name}" is not published: ${reason}`);
        }
    }
    return { slots, failures };
}

/** A broker and every slot it could publish; the failures listed, the broker running regardless. */
export async function startAll(port: number, logger: (line: string) => void = log, stdio: "inherit" | "ignore" = "inherit"): Promise<{ broker: LocalBroker; slots: PublishedSlot<object>[]; failures: SlotFailure[]; stop(): Promise<void> }> {
    const broker = await startBroker(port, stdio);
    const { slots, failures } = await publishAll(broker.wsBase, logger);
    return {
        broker,
        slots,
        failures,
        async stop() {
            for (const s of slots) await s.close().catch(() => undefined);
            broker.stop();
        },
    };
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

    const { slots, failures } = await publishAll(wsBase);
    if (failures.length) log(`DEGRADED: ${failures.length} slot(s) not published (${failures.map((f) => f.slot).join(", ")}); the others run, the board shows the missing ones red`);
    log(`dashboard: ${httpBase}/   slots: ${slots.map((s) => s.slot).join(", ")}   introspection: ${httpBase}/_broker/mcp`);
    // The medical monitoring page is meant to be held in someone's hands, on a
    // tablet, away from the machine. Say where to point it rather than making
    // anyone look the address up on a filming day.
    // The simulation is driven from a phone in someone's hand, beside the room.
    for (const base of broker?.lanBases ?? []) {
        log(`medical monitoring, on another device on this network: ${base}/biomed.html`);
        log(`the night, from a phone on this network:               ${base}/simulation.html`);
        log(`a screen of the room (or run scripts/screen.mjs on it): ${base}/screen.html`);
    }
    // The room's other machines find this one by asking on the network (`scripts/screen.mjs`), not by an address typed in.
    const discovery = broker ? startDiscovery(port, log) : null;
    // The board opens the factory's window itself, beside it, on the key press that ends its boot (a second window opened
    // here would cover the board, and a covered page is a hidden page: its timers slow down and the sound with them).
    if (!flag("--no-open") && !flag("--no-broker")) openBrowser(`${httpBase}/`);

    const stop = async () => {
        discovery?.close();
        for (const s of slots) await s.close().catch(() => undefined);
        broker?.stop();
        process.exit(0);
    };
    process.on("SIGINT", () => void stop());
    process.on("SIGTERM", () => void stop());
}

/** Opens the operator's browser on the dashboard: the demo starts by itself. */
function openBrowser(url: string): void {
    const command = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
    exec(command, (error) => {
        if (error) log(`could not open the browser (${error.message}); open ${url} yourself`);
    });
}

if (isMain(import.meta.url)) {
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
