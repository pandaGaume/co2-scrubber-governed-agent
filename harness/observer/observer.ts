/**
 * The Observer: from the description of a physical system and its
 * telemetry, the TWIN_FACTORY_REQUEST, and nothing else.
 *
 *     description / telemetry
 *               |
 *            OBSERVER     (a language model, its prompt, the factories' harness)
 *               |
 *     "what the twin must be able to do"
 *               |
 *      TWIN_FACTORY_REQUEST  -> the factory, with the node catalogue
 *
 * Since 2026-10-10 the Observer is a topic of the factories' harness
 * (`harness/topics/observer/index.ts`): a task of the factory, run by
 * `runTask` like every factory, with its marching order, its guard, the
 * refusal and its points in the next prompt, the interpreter, the batches,
 * the session's memory, the manifest and the run log. Before, it ran a loop
 * of its own here, and none of that reached it.
 *
 * `observe` keeps its contract for its callers (the observer slot, the
 * commissioning): it computes what the task is given (the telemetry's
 * summary, the vocabulary of quantities the catalogue's signatures speak,
 * the library's documents), opens the task without starting it, runs it on
 * the caller's model, and reads the outcome back (the request accepted, the
 * attempts and what the guard or the Contract Supervisor said of each, the
 * library reads). The model runs on the `reasoner` slot as the factories'
 * builders do, with the Observer's prompt and the kernel of the socle.
 */
import type { Broker } from "../lib/broker.js";
import type { Provider } from "../lib/provider.js";
import { runTask } from "../core/runner.js";
import { summarizeTelemetry, type TelemetrySummary } from "./telemetry.js";
import type { TwinFactoryRequest } from "./request.js";
import { catalogueOf, closeSession, libraryDocuments, OBSERVER_OBSERVATION, OBSERVER_PROMPT, OBSERVER_REQUEST_FILE, openSession, type ObserveAttempt, type ObserverObservation } from "../topics/observer/index.js";

export { OBSERVER_CAPABILITY, OBSERVER_PROMPT, OBSERVER_WORDS, type ObserveAttempt } from "../topics/observer/index.js";

export interface ObserveOptions {
    /** The model: a `ReasonerProvider` on the `reasoner` slot with `OBSERVER_PROMPT`, in the state mode, in the demo. */
    provider: Provider;
    /** The broker the task runs through: the factory opens it, the guard reads the catalogue and the library through it. */
    broker: Broker;
    runtimeSlot?: string;
    description: string;
    telemetry?: Array<Record<string, unknown>>;
    /** How many requests the guard may refuse before the task ends; three when absent. */
    attempts?: number;
    /**
     * A review after the guard (2026-09-25, night): the Contract Supervisor, asked once the deterministic
     * guard accepted a request; its findings for the Observer refuse the request like the guard's problems,
     * and the model corrects. Nothing when absent.
     */
    review?: (request: TwinFactoryRequest) => Promise<string[]>;
    /** The task's step budget; twenty decisions when absent, as every factory's. */
    iterations?: number;
    /** Where the recipes of the topics live; `_recipes/` next to the workshops when absent (a test keeps its own). */
    recipesDir?: string;
    log?: (line: string) => void;
}

export interface ObserveResult {
    ok: boolean;
    request: TwinFactoryRequest | null;
    attempts: ObserveAttempt[];
    /** What the Observer read in the library before writing, in order. */
    reads: string[];
    telemetry: TelemetrySummary | null;
    provider: { name: string; model: string; family: string };
    /** The factory task the Observer ran as: its workshop holds the manifest, the trace and the request. */
    observerTask: string;
    /** How the task ended (`proposed`, `failed`...), and why when it says. */
    state: string;
    ended: string | null;
}

export async function observe({ provider, broker, runtimeSlot = "twin", description, telemetry, attempts = 3, review, iterations, recipesDir, log }: ObserveOptions): Promise<ObserveResult> {
    const summary = telemetry?.length ? summarizeTelemetry(telemetry) : null;
    const { vocabulary } = await catalogueOf(broker, runtimeSlot);
    const observation: ObserverObservation = { description, telemetry: summary, quantities: vocabulary, documents: await libraryDocuments(broker), attempts, runtimeSlot };
    const opened = await broker.call("factory", "request", {
        objective: { required_outputs: [{ name: "twin-request", quantity: "TwinFactoryRequest" }] },
        observations: { [OBSERVER_OBSERVATION]: observation },
        topics: ["observer"],
        ...(iterations ? { budget: { iterations } } : {}),
        requestedBy: "observer",
        run: false,
    });
    if (!opened.ok) throw new Error(`the factory did not open the Observer's task: ${opened.error ?? opened.outcome}`);
    const taskId = (opened.output as { taskId: string }).taskId;
    const session = openSession(taskId, review);
    try {
        const r = await runTask({ broker, provider, taskId, topic: "observer", runtimeSlot, promptFile: OBSERVER_PROMPT, ...(recipesDir ? { recipesDir } : {}), ...(log ? { log } : {}) });
        const accepted = session.attempts.some((a) => a.ok);
        let request: TwinFactoryRequest | null = null;
        if (accepted) {
            const read = await broker.call("workspace", "read", { taskId, path: OBSERVER_REQUEST_FILE });
            if (read.ok) request = JSON.parse((read.output as { text: string }).text) as TwinFactoryRequest;
        }
        // The library reads, as the manifest recorded them: each by its document or its query.
        const reads = r.manifest.steps
            .filter((s) => s.capability?.startsWith("library.") && s.outcome === "completed")
            .map((s) => {
                const args = (s.input ?? {}) as { id?: unknown; query?: unknown };
                return `${s.capability}${typeof args.id === "string" ? ` ${args.id}` : typeof args.query === "string" ? ` "${args.query}"` : ""}`;
            });
        return {
            ok: request !== null,
            request,
            attempts: session.attempts,
            reads,
            telemetry: summary,
            provider: { name: provider.name, model: provider.model, family: provider.family },
            observerTask: taskId,
            state: r.state,
            ended: (r.manifest as { ended?: string | null }).ended ?? null,
        };
    } finally {
        closeSession(taskId);
    }
}
