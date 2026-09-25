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
 * the model is never shown it. It is shown the vocabulary of quantities the
 * catalogue's signatures speak (Concentration in ppm...), so what the twin
 * must expose is named the way a factory can match it.
 *
 * Before writing, the model may read the library (the devices' datasheets,
 * the station's topology and metrics), a few reads at most: what the
 * description leaves open is often documented there, and an assumption the
 * documentation contradicts is not an assumption.
 *
 * With a provider in the `state` context mode (2026-09-25) nothing is
 * replayed: each step is one message carrying the whole of what the
 * Observer needs, rebuilt here. The description, the telemetry's summary
 * and the vocabulary; the documents it read, the last one whole and the
 * earlier ones by the lines that carry a number (a constant with its unit
 * is what a datasheet is read for); the last refused request whole with
 * its reasons, so the model corrects it rather than writes it again; and
 * the harness's brief. The provider's mode decides, not this loop.
 */
import type { JsonValue, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Broker } from "../lib/broker.js";
import type { Provider } from "../lib/provider.js";
import { checkTwinRequest, TWIN_REQUEST_SCHEMA, type TwinFactoryRequest, type VocabularyEntry } from "./request.js";
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
    /** What the Observer read in the library before writing, in order. */
    reads: string[];
    telemetry: TelemetrySummary | null;
    provider: { name: string; model: string; family: string };
}

interface Signed {
    type: string;
    signature?: { inputs?: Record<string, { quantity?: string; unit?: string }>; outputs?: Record<string, { quantity?: string; unit?: string }> } | null;
}

/**
 * What the guard reads from the catalogue: its type ids, to refuse a request
 * that names one, and the quantities its signatures speak of, the shared
 * vocabulary. The model is shown the vocabulary (the names of quantities and
 * their units), never the types.
 */
async function catalogueOf(broker: Broker | undefined, slot: string): Promise<{ types: string[]; vocabulary: VocabularyEntry[] }> {
    if (!broker) return { types: [], vocabulary: [] };
    const r = await broker.call(slot, "registry_list_nodes", {});
    const listed = r.ok ? (r.output as { types?: Signed[] }).types : undefined;
    const types = Array.isArray(listed) ? listed : [];
    const units = new Map<string, Set<string>>();
    for (const t of types) {
        for (const port of [...Object.values(t.signature?.inputs ?? {}), ...Object.values(t.signature?.outputs ?? {})]) {
            if (!port?.quantity) continue;
            const set = units.get(port.quantity) ?? new Set<string>();
            if (port.unit) set.add(port.unit);
            units.set(port.quantity, set);
        }
    }
    return { types: types.map((t) => t.type), vocabulary: [...units].map(([quantity, u]) => ({ quantity, units: [...u].sort() })).sort((a, b) => a.quantity.localeCompare(b.quantity)) };
}

/** The library: the documentation of the devices and of the station, where the Observer checks what the description leaves open. Read-only, never the catalogue. */
const LIBRARY_TOOLS = ["list", "search", "read"] as const;
export const OBSERVER_MAX_READS = 6;
/** Characters of the last document read kept whole in the state; the earlier ones keep only their numeric lines. */
const READ_WHOLE_CHARS = 8000;
const READ_LINES_CHARS = 2000;

/** The lines of a text that carry a number: what a datasheet or a topology is read for, with the unit beside it. */
export function numericLines(text: string, limit = READ_LINES_CHARS): string {
    const kept: string[] = [];
    let size = 0;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!/\d/.test(line) || /^#/.test(line)) continue;
        if (size + line.length + 1 > limit) {
            kept.push("...");
            break;
        }
        kept.push(line);
        size += line.length + 1;
    }
    return kept.join("\n");
}

/** What a read is kept as in the state: a document whole (the last one) or by its numeric lines, a search or a list as its answer, bounded. */
function evidenceOf(id: string, output: unknown, whole: boolean): string {
    const o = output && typeof output === "object" ? (output as Record<string, unknown>) : {};
    if (id === "library.read" && typeof o.text === "string") return whole ? o.text.slice(0, READ_WHOLE_CHARS) : numericLines(o.text);
    const text = JSON.stringify(output ?? null);
    return text.length <= READ_LINES_CHARS ? text : `${text.slice(0, READ_LINES_CHARS)}...`;
}

async function libraryCapabilities(broker: Broker | undefined): Promise<Array<{ id: string; description: string; inputSchema: never; replayPolicy: "automatic" }>> {
    if (!broker) return [];
    try {
        const tools = await broker.tools("library");
        return tools.filter((t) => (LIBRARY_TOOLS as readonly string[]).includes(t.name)).map((t) => ({ id: `library.${t.name}`, description: t.description ?? `library.${t.name}`, inputSchema: t.inputSchema as never, replayPolicy: "automatic" as const }));
    } catch {
        return [];
    }
}

/** The library's documents in one line each: id, title, what it says. */
async function libraryShelf(broker: Broker): Promise<string> {
    const r = await broker.call("library", "list", {});
    const docs = r.ok ? (r.output as { documents?: Array<{ id: string; title: string; summary?: string }> }).documents : undefined;
    if (!Array.isArray(docs) || !docs.length) return "";
    return `The library holds: ${docs.map((d) => `${d.id} (${d.title}${d.summary ? `: ${d.summary.slice(0, 160)}` : ""})`).join("; ")}. `;
}

/** The harness's brief to the Observer at a step: where it stands, what it read, why its last request was refused. Deterministic. */
export function observerBrief(x: { step: number; attemptsLeft: number; readsLeft: number; read: string[]; last?: ObserveAttempt }): string {
    const read = x.read.length ? `You read ${x.read.join(", ")} (the state holds them under evidence: the last one whole, the earlier ones by their lines with a number); read nothing twice.` : "You read nothing yet.";
    const reads = x.readsLeft > 0 ? `${x.readsLeft} read(s) left.` : "No read left: hand over the request.";
    if (x.last) return `Step ${x.step}. Your request ${x.last.n} was refused: ${x.last.problems.join("; ")}. The state holds it whole (lastAttempt.proposed): change what these reasons name and hand it over again with ${OBSERVER_CAPABILITY}; ${x.attemptsLeft} attempt(s) left. ${read} ${reads}`;
    return `Step ${x.step}. Read in the library what the description leaves open (the datasheets, the topology, the metabolic loads), then hand over the request with ${OBSERVER_CAPABILITY}; ${x.attemptsLeft} attempt(s). ${read} ${reads}`;
}

export async function observe({ provider, broker, runtimeSlot = "twin", description, telemetry, attempts = 3 }: ObserveOptions): Promise<ObserveResult> {
    const summary = telemetry?.length ? summarizeTelemetry(telemetry) : null;
    const columns = summary ? summary.columns.map((c) => c.column) : [];
    const { types, vocabulary } = await catalogueOf(broker, runtimeSlot);
    const library = await libraryCapabilities(broker);
    // What the library holds, given up front: the model knows a datasheet exists before it thinks of searching for one.
    const shelf = library.length && broker ? await libraryShelf(broker) : "";
    const intention = { id: "observe", description: "Formulate the TWIN_FACTORY_REQUEST for the system described in the observation." };
    const allowed = [{ id: OBSERVER_CAPABILITY, description: "Hand over the TWIN_FACTORY_REQUEST: what the twin must represent, receive, simulate, expose, and how it will be judged. It is checked before it reaches the factory; a refused request comes back with its reasons.", inputSchema: TWIN_REQUEST_SCHEMA as never, replayPolicy: "automatic" as const }, ...library];
    const done: ObserveAttempt[] = [];
    const reads: string[] = [];
    const documentsRead: string[] = [];
    const documents: Record<string, string> = {};
    // The state mode: what was read stays in the observation (the evidence), the last refused request whole; nothing is replayed.
    const stateMode = (provider as { contextMode?: unknown }).contextMode === "state";
    const evidence: Array<{ key: string; output: unknown; ok: boolean }> = [];
    let lastProposal: JsonValue | null = null;
    let lastRead: { id: string; ok: boolean; text: string } | null = null;
    provider.begin?.(`observe#${Date.now().toString(36)}`);
    for (let n = 1, step = 1; n <= attempts; step++) {
        const last = done.at(-1);
        const readsLeft = library.length ? OBSERVER_MAX_READS - reads.length : 0;
        const quantities = vocabulary.length ? vocabulary.map((v) => `${v.quantity} (${v.units.join(", ") || "no unit"})`).join("; ") : "";
        const libraryLine = library.length ? `${shelf}${readsLeft > 0 ? `library.read gives a document whole (${readsLeft} read(s) left)` : "no read left: hand over the request"}` : "";
        const features = stateMode
            ? {
                  brief: observerBrief({ step, attemptsLeft: attempts - n + 1, readsLeft, read: documentsRead, last }),
                  state: {
                      description,
                      telemetry: summary ? (summary as never) : "none supplied",
                      ...(quantities ? { quantities } : {}),
                      ...(libraryLine ? { library: libraryLine } : {}),
                      evidence: Object.fromEntries(evidence.map((e, i) => [e.key, e.ok ? evidenceOf(e.key.split(" ")[0], e.output, i === evidence.length - 1) : `refused: ${String(e.output)}`])),
                      lastAttempt: last ? { n: last.n, problems: last.problems, proposed: lastProposal } : null,
                      earlierAttempts: done.slice(0, -1).map((a) => ({ n: a.n, problems: a.problems })),
                      nextActions: (readsLeft > 0 ? allowed : allowed.slice(0, 1)).map((c) => c.id),
                  },
              }
            : {
                  description,
                  telemetry: summary ? (summary as never) : "none supplied",
                  ...(quantities ? { quantities } : {}),
                  ...(libraryLine ? { library: libraryLine } : {}),
                  lastOutcome: lastRead ? (lastRead.ok ? "completed" : "refused") : last ? "refused" : "",
                  lastOutput: lastRead ? lastRead.text : last ? last.problems.join("; ") : "",
                  lastRefusal: last ? `${OBSERVER_CAPABILITY}: ${last.problems.join("; ")}` : "",
              };
        const input: PolicyFallbackInput = {
            decisionId: `observe-${step}`,
            intention,
            // The variable part: the system, its telemetry as computed facts, the shared vocabulary, what the library answered, why the last attempt was refused.
            state: { id: `observe:${step}`, features },
            allowedCapabilities: readsLeft > 0 ? allowed : allowed.slice(0, 1),
            candidates: [],
            recentFailures: [],
        } as unknown as PolicyFallbackInput;
        const decision = await provider.resolve(input);
        const id = decision.invocation.capabilityId;
        if (id.startsWith("library.") && readsLeft > 0 && broker) {
            // A read is not an attempt: the model checks the documentation, then writes.
            const r = await broker.call("library", id.slice("library.".length), (decision.invocation.input ?? {}) as Record<string, unknown>);
            const args = decision.invocation.input as { id?: string; query?: string } | null;
            const key = `${id}${args?.id ? ` ${args.id}` : args?.query ? ` "${args.query}"` : ""}`;
            reads.push(key);
            if (id === "library.read" && r.ok && args?.id) {
                documentsRead.push(String(args.id));
                const text = (r.output as { text?: unknown }).text;
                if (typeof text === "string") documents[String(args.id)] = text;
            }
            lastRead = { id, ok: r.ok, text: (r.ok ? JSON.stringify(r.output) : String(r.error ?? r.outcome)).slice(0, 8000) };
            evidence.push({ key, output: r.ok ? r.output : (r.error ?? r.outcome), ok: r.ok });
            continue;
        }
        lastRead = null;
        lastProposal = (decision.invocation.input ?? null) as JsonValue;
        if (id !== OBSERVER_CAPABILITY) {
            done.push({ n: n++, ok: false, problems: [`the answer was not a call to ${OBSERVER_CAPABILITY} (${id})`], proposed: JSON.stringify(decision.invocation.input).slice(0, 2000) });
            continue;
        }
        const check = checkTwinRequest(decision.invocation.input, { catalogueTypes: types, telemetryColumns: summary ? columns : undefined, vocabulary, description, ...(library.length ? { documentsRead, documents } : {}) });
        done.push({ n: n++, ok: check.ok, problems: check.problems, proposed: JSON.stringify(decision.invocation.input).slice(0, 2000) });
        if (check.ok) return { ok: true, request: decision.invocation.input as unknown as TwinFactoryRequest, attempts: done, reads, telemetry: summary, provider: { name: provider.name, model: provider.model, family: provider.family } };
    }
    return { ok: false, request: null, attempts: done, reads, telemetry: summary, provider: { name: provider.name, model: provider.model, family: provider.family } };
}
