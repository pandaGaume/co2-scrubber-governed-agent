/**
 * The Observer: from the description of a physical system and its
 * telemetry, the TWIN_FACTORY_REQUEST, and nothing else.
 *
 *     description / telemetry
 *               |
 *            OBSERVER     (a language model, its prompt, this guard)
 *               |
 *     "what the twin must be able to do"
 *               |
 *      TWIN_FACTORY_REQUEST  -> the factory, with the node catalogue
 *
 * It runs on the same `reasoner` slot as the factory's builder: one model,
 * two roles, and the role is the prompt. The Observer's prompt
 * (`harness/observer/prompt.md`) is generic and fixed, the same bytes for
 * every system, so the provider keeps it in its cache; what changes from one
 * call to the next (the description, the summary of the telemetry, the
 * reasons of a refusal) is the observation, sent after it.
 *
 * The model is offered one capability, `observer.request`, whose schema is
 * the request's. What it proposes is checked by code (`request.ts`: shape,
 * separation from the catalogue, facts of the telemetry); a refused request
 * goes back to it with the reasons, three attempts at most. The catalogue
 * is read here, by the guard, to refuse a request that names a node type;
 * the model is never shown it.
 */
import type { PolicyFallbackInput } from "@spiky-panda/harness";
import type { Broker } from "../lib/broker.js";
import type { Provider } from "../lib/provider.js";
import { checkTwinRequest, TWIN_REQUEST_SCHEMA, type TwinFactoryRequest } from "./request.js";
import { summarizeTelemetry, type TelemetrySummary } from "./telemetry.js";

export const OBSERVER_PROMPT = "harness/observer/prompt.md";
export const OBSERVER_CAPABILITY = "observer.request";

export interface ObserveOptions {
    /** The model: a `ReasonerProvider` on the `reasoner` slot with `OBSERVER_PROMPT`, in the demo. */
    provider: Provider;
    /** Where the guard reads the catalogue's type ids from (`twin.registry_list_nodes`); without it only the id pattern is refused. */
    broker?: Broker;
    runtimeSlot?: string;
    description: string;
    telemetry?: Array<Record<string, unknown>>;
    attempts?: number;
}

export interface ObserveAttempt {
    n: number;
    ok: boolean;
    problems: string[];
    proposed: string;
}

export interface ObserveResult {
    ok: boolean;
    request: TwinFactoryRequest | null;
    attempts: ObserveAttempt[];
    telemetry: TelemetrySummary | null;
    provider: { name: string; model: string; family: string };
}

async function catalogueTypes(broker: Broker | undefined, slot: string): Promise<string[]> {
    if (!broker) return [];
    const r = await broker.call(slot, "registry_list_nodes", {});
    const types = r.ok ? (r.output as { types?: Array<{ type: string }> }).types : undefined;
    return Array.isArray(types) ? types.map((t) => t.type) : [];
}

export async function observe({ provider, broker, runtimeSlot = "twin", description, telemetry, attempts = 3 }: ObserveOptions): Promise<ObserveResult> {
    const summary = telemetry?.length ? summarizeTelemetry(telemetry) : null;
    const columns = summary ? summary.columns.map((c) => c.column) : [];
    const types = await catalogueTypes(broker, runtimeSlot);
    const intention = { id: "observe", description: "Formulate the TWIN_FACTORY_REQUEST for the system described in the observation." };
    const allowed = [{ id: OBSERVER_CAPABILITY, description: "Hand over the TWIN_FACTORY_REQUEST: what the twin must represent, receive, simulate, expose, and how it will be judged. It is checked before it reaches the factory; a refused request comes back with its reasons.", inputSchema: TWIN_REQUEST_SCHEMA as never, replayPolicy: "automatic" as const }];
    const done: ObserveAttempt[] = [];
    provider.begin?.(`observe#${Date.now().toString(36)}`);
    for (let n = 1; n <= attempts; n++) {
        const last = done.at(-1);
        const input: PolicyFallbackInput = {
            decisionId: `observe-${n}`,
            intention,
            // The variable part: the system, its telemetry as computed facts, and why the last attempt was refused.
            state: {
                id: `observe:${n}`,
                features: {
                    description,
                    telemetry: summary ? (summary as never) : "none supplied",
                    lastOutcome: last ? "refused" : "",
                    lastOutput: last ? last.problems.join("; ") : "",
                    lastRefusal: last ? `${OBSERVER_CAPABILITY}: ${last.problems.join("; ")}` : "",
                },
            },
            allowedCapabilities: allowed,
            candidates: [],
            recentFailures: [],
        } as unknown as PolicyFallbackInput;
        const decision = await provider.resolve(input);
        if (decision.invocation.capabilityId !== OBSERVER_CAPABILITY) {
            done.push({ n, ok: false, problems: [`the answer was not a call to ${OBSERVER_CAPABILITY} (${decision.invocation.capabilityId})`], proposed: JSON.stringify(decision.invocation.input).slice(0, 2000) });
            continue;
        }
        const check = checkTwinRequest(decision.invocation.input, { catalogueTypes: types, telemetryColumns: summary ? columns : undefined });
        done.push({ n, ok: check.ok, problems: check.problems, proposed: JSON.stringify(decision.invocation.input).slice(0, 2000) });
        if (check.ok) return { ok: true, request: decision.invocation.input as unknown as TwinFactoryRequest, attempts: done, telemetry: summary, provider: { name: provider.name, model: provider.model, family: provider.family } };
    }
    return { ok: false, request: null, attempts: done, telemetry: summary, provider: { name: provider.name, model: provider.model, family: provider.family } };
}
