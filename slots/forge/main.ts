/**
 * The forge in a process of its own (docs/observateur-et-usines.fr.md,
 * section 6.1): what a generated plugin does at run time happens here and
 * not in the demo's process. Started against a broker already running:
 *
 *   npm run forge                      the broker of the demo on its default port
 *   node dist/slots/forge/main.js --port 3100
 *
 * When the demo's `run-all` is started with `--no-forge`, this is where the
 * forge comes from; started without it, the demo publishes the forge in its
 * own process, which is enough for the tests and the rehearsals.
 */
import { isMain } from "../../lib/paths.js";
import { DEFAULT_PORT } from "../run-all.js";
import { forgeSlot } from "./provider.js";

const log = (line: string): void => console.log(`${new Date().toISOString()} ${line}`);

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const i = args.indexOf("--port");
    const port = Number(i >= 0 && args[i + 1] ? args[i + 1] : DEFAULT_PORT);
    const wsBase = `ws://localhost:${port}`;
    const slot = forgeSlot(wsBase, log);
    await slot.open();
    log(`forge published on ${wsBase}, in its own process ${process.pid}`);
    const stop = async () => {
        await slot.close().catch(() => undefined);
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
