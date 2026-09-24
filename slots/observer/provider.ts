/**
 * The `observer` slot: the Twin Requirement Observer on the broker
 * (`harness/observer/`). One tool, `observe`: a description of a physical
 * system and, when there is some, its telemetry (rows); the answer is the
 * TWIN_FACTORY_REQUEST the guard accepted, with every attempt and why the
 * refused ones were refused. With `forward`, the request becomes a factory
 * task (`factory.request`, the requirements carried whole in the task file,
 * `requestedBy: "observer"`); the task is opened, not run, until the
 * factory's `graph` topic exists.
 *
 * The model is the one behind the `reasoner` slot, reached through the
 * broker like everything else, with the Observer's prompt; this slot holds
 * no key. It never shows the model the node catalogue: the guard reads it
 * to refuse a request that names a node, the model does not.
 *
 * Every request is kept (`observer://requests`) and pushed to its readers.
 */
import { errorMessage } from "../../lib/files.js";
import { fromRoot } from "../../lib/paths.js";
import { objectSchema as obj, publishSlot, type PublishedSlot } from "../lib/slot-server.js";
import { Broker } from "../../harness/lib/broker.js";
import { ReasonerProvider } from "../../harness/providers/reasoner.js";
import type { Provider } from "../../harness/lib/provider.js";
import { observe, OBSERVER_PROMPT, type ObserveResult } from "../../harness/observer/observer.js";
import { factoryContractOf } from "../../harness/observer/request.js";

export interface ObserverState {
    requests: Array<ObserveResult & { id: string; at: string; taskId: string | null }>;
}

export const REQUESTS_URI = "observer://requests";
export const META_REQUEST = "observer/request";
const VERSION = "0.1.0";

export interface ObserverSlotOptions {
    /** The model, for a test that brings its own; the reasoner slot's otherwise. */
    provider?: (broker: Broker) => Promise<Provider>;
}

export function observerSlot(wsBase: string, log: (line: string) => void, options: ObserverSlotOptions = {}): PublishedSlot<ObserverState> {
    const httpBase = wsBase.replace(/^ws(s?):\/\//, "http$1://");
    const state: ObserverState = { requests: [] };
    const modelOf =
        options.provider ??
        (async (broker: Broker): Promise<Provider> => {
            const reasoner = await ReasonerProvider.connect(broker);
            if (!reasoner.description.ready) throw new Error(`the reasoner is not ready: ${reasoner.description.reason ?? "no reason given"}`);
            reasoner.usePrompt(OBSERVER_PROMPT);
            return reasoner;
        });
    let notify: (entry: ObserverState["requests"][number]) => void = () => undefined;
    const published = publishSlot<ObserverState>({
        slot: "observer",
        tools: [
            {
                name: "observe",
                inputSchema: obj(
                    {
                        description: { type: "string" },
                        telemetry: { type: "array", items: { type: "object" } },
                        forward: { type: "boolean" },
                    },
                    ["description"],
                ),
                handle: async (args, s) => {
                    const description = String(args.description ?? "").trim();
                    if (!description) throw new Error("a description of the system is required");
                    const broker = new Broker(httpBase, { name: "observer", version: VERSION, locale: "en" });
                    try {
                        const result = await observe({ provider: await modelOf(broker), broker, description, telemetry: Array.isArray(args.telemetry) ? (args.telemetry as Array<Record<string, unknown>>) : undefined });
                        let taskId: string | null = null;
                        if (result.ok && result.request && args.forward === true) {
                            const contract = factoryContractOf(result.request);
                            const r = await broker.call("factory", "request", { ...contract, topics: ["graph"], requestedBy: "observer", run: false });
                            if (!r.ok) throw new Error(`the request was accepted but the factory did not open a task: ${r.error ?? r.outcome}`);
                            taskId = (r.output as { taskId: string }).taskId;
                        }
                        const entry = { ...result, id: `r${(s.requests.length + 1).toString().padStart(4, "0")}`, at: new Date().toISOString(), taskId };
                        s.requests.push(entry);
                        log(`[observer] ${entry.id}: ${result.ok ? "request accepted" : "no request accepted"} after ${result.attempts.length} attempt(s)${taskId ? `, factory task ${taskId}` : ""}`);
                        notify(entry);
                        return entry;
                    } finally {
                        await broker.close();
                    }
                },
            },
        ],
        resources: [{ uri: REQUESTS_URI, read: (s) => s.requests }],
        state,
        wsBase,
        log,
        stub: false,
        version: VERSION,
        grammarsDir: fromRoot("slots", "observer", "grammars"),
    });
    notify = (entry) => {
        try {
            published.notify("notifications/resources/updated", { uri: REQUESTS_URI, _meta: { [META_REQUEST]: entry } });
        } catch (e) {
            log(`[observer] could not tell the readers of ${REQUESTS_URI} (${errorMessage(e)})`);
        }
    };
    return published;
}
