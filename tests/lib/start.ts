/**
 * The tests need every slot: a slot that is not published is a failure
 * here, named, and the broker is stopped before the error leaves the hook,
 * so the runner ends with the message instead of waiting. The server itself
 * treats the same case as a degraded mode (`slots/run-all.ts`).
 */
import { startAll } from "../../slots/run-all.js";
import type { LocalBroker } from "../../slots/lib/local-broker.js";
import type { PublishedSlot } from "../../slots/lib/slot-server.js";

const quiet = () => undefined;

export async function startAllOrFail(port: number): Promise<{ broker: LocalBroker; slots: PublishedSlot<object>[] }> {
    const started = await startAll(port, quiet, "ignore");
    if (started.failures.length) {
        await started.stop();
        throw new Error(`${started.failures.map((f) => `slot "${f.slot}" is not published: ${f.reason}`).join("; ")}; the broker on port ${port} was stopped`);
    }
    return { broker: started.broker, slots: started.slots };
}
