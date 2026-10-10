/**
 * The `observer` topic (2026-10-10): the Observer on the factories' harness. From the description of a physical system
 * and the summary of its telemetry (the task's `observations.observer`), the TWIN_FACTORY_REQUEST, and nothing else.
 *
 * Until then the Observer ran a loop of its own (`harness/observer/observer.ts`): its own state, its own brief, its own
 * count of reads and attempts. What the factories' harness gives every factory it did not have: the marching order, a
 * refusal and its points in the next prompt, the interpreter, the batches, the session's memory, the manifest and the
 * run log. Run xykl showed it: the Observer on Nemotron Nano was refused four times on the same missing fact ids, and
 * nothing of the harness that would have caught it was there.
 *
 * Its conduct is a playbook (`specs/observer/playbook.json`): read, the request, the hand-over. Its guard is the
 * request's (`harness/observer/request.ts`: the shape, the separation from the catalogue, the facts of the telemetry and
 * of the library), then the Contract Supervisor's review when the caller gives one (`registerReview`, by task: a function
 * is not a task's data). The catalogue is read by the guard and never shown; the vocabulary of quantities its signatures
 * speak is, so what the twin must expose is named the way a factory can match it.
 */
import type { CapabilityResult, Intention, JsonValue } from "@spiky-panda/harness";
import { readFileSync } from "node:fs";
import { fromRoot } from "../../../lib/paths.js";
import type { Broker } from "../../lib/broker.js";
import { BASE_CAPABILITIES, withBase } from "../../core/base.js";
import type { LocalCapability } from "../../core/capabilities.js";
import { conductView, loadPlaybook, sayingText, type Evidence, stageToolsOf } from "../../core/conduct.js";
import { addClaim, transition, type ClaimStatus } from "../../core/claims.js";
import type { LibraryFact } from "../../core/contracts.js";
import { physics } from "../../core/physics.js";
import type { TopicState } from "../../core/reasoning-state.js";
import type { TaskFile } from "../../core/task.js";
import type { TopicContext, TopicDefinition, Validation } from "../../core/topic.js";
import type { DoneClaim, Progress, WorkshopFile } from "../../core/workspace-observer.js";
import { loadWords, say } from "../../core/words.js";
import { checkTwinRequest, TWIN_REQUEST_SCHEMA, withFactIds, withVocabularyForm, type TwinFactoryRequest, type VocabularyEntry } from "../../observer/request.js";
import type { TelemetrySummary } from "../../observer/telemetry.js";

/** What the Observer's harness says to its model: the spec's words (`specs/observer/words.json`). */
export const OBSERVER_WORDS = loadWords("specs/observer/words.json");
const w = (key: string, vars?: Record<string, string | number>): string => say(OBSERVER_WORDS, key, vars);

export const OBSERVER_PROMPT = "specs/observer/prompt.md";
export const OBSERVER_CAPABILITY = "observer.submit";
/** The selection (2026-10-10, run 10): what the twin needs as numbers, then the library's fact chosen for each. */
export const OBSERVER_NEEDS = "observer.needs";
export const OBSERVER_CHOOSE = "observer.choose";
/** How many facts the library gives back for a need: the nearest, the best first. */
const CANDIDATES = 5;
/** Where an accepted request is written in the task's workshop, the artifact handed over. */
export const OBSERVER_REQUEST_FILE = "requests/twin-request.json";
/** The field of the task's observations the topic reads and shows itself. */
export const OBSERVER_OBSERVATION = "observer";

/** The library's documents the Observer is not shown, and why (specs/observer/library.json): the factories' cards, which name the catalogue. */
export const OBSERVER_LIBRARY = JSON.parse(readFileSync(fromRoot("specs", "observer", "library.json"), "utf8")) as { notShown: Array<{ id: string; why: string }> };
const NOT_SHOWN = OBSERVER_LIBRARY.notShown.map((d) => d.id);

/** The Observer's own conduct, run once per step. */
export const OBSERVER_CONDUCT = loadPlaybook("specs/observer/playbook.json");

export const OBSERVER_WORD_KEYS = [
    "intention", "capability", "capabilities.needs", "capabilities.choose", "read", "readNothing", "brief.read", "brief.needs", "brief.choose", "brief.request", "brief.handOver", "brief.giveUp",
    "guard.refused", "guard.readFirst", "guard.needsFirst", "guard.chooseFirst", "guard.choiceMissing", "guard.choiceUnknown", "guard.accepted", "guard.noAttemptLeft",
    "doneWhen.read", "doneWhen.needs", "doneWhen.chosen", "doneWhen.accepted", "doneWhen.handedOver", "openQuestions.read", "openQuestions.needs", "openQuestions.choose", "openQuestions.request", "openQuestions.handOver",
    "validate.none", "validate.notAccepted", "validate.notTheFile", "schema.factIdExample", "schema.known",
];

export const OBSERVER_TOOLS: ReadonlyArray<RegExp> = withBase([/^observer\.(submit|needs|choose)$/]);

/** What the task is given (`observations.observer`): the system, its telemetry made facts, the shared vocabulary, the library's documents, the attempts. */
export interface ObserverObservation {
    description: string;
    telemetry: TelemetrySummary | null;
    quantities: VocabularyEntry[];
    documents: Array<{ id: string; title: string; summary?: string }>;
    attempts: number;
    /** The runtime whose catalogue a request must not name (`twin`). */
    runtimeSlot?: string;
}

export function observationOf(task: TaskFile["task"]): ObserverObservation {
    const o = (((task.observations ?? {}) as Record<string, unknown>)[OBSERVER_OBSERVATION] ?? {}) as Partial<ObserverObservation>;
    return {
        description: typeof o.description === "string" ? o.description : "",
        telemetry: o.telemetry ?? null,
        quantities: Array.isArray(o.quantities) ? o.quantities : [],
        documents: Array.isArray(o.documents) ? o.documents : [],
        attempts: typeof o.attempts === "number" && o.attempts >= 1 ? o.attempts : 3,
        ...(typeof o.runtimeSlot === "string" ? { runtimeSlot: o.runtimeSlot } : {}),
    };
}

/** One request the Observer handed over, and what the guard (or the review) said of it. */
export interface ObserveAttempt {
    n: number;
    ok: boolean;
    problems: string[];
    proposed: string;
}

/** A fact of the library as the selection shows it: what it is, its value, where it is stated. */
export interface CandidateFact {
    id: string;
    semantic?: string;
    value: number;
    unit: string;
    min?: number;
    max?: number;
    source: string;
    says?: string;
}

/** A need the Observer said, the library's facts nearest it, and the one it chose (null: none answers it). */
export interface Need {
    name: string;
    candidates: CandidateFact[];
    chosen?: { factId: string | null; why: string; fact: CandidateFact | null };
}

interface ObserverTopicState {
    attempts: ObserveAttempt[];
    accepted: { path: string; sha256: string } | null;
    needs: Need[];
}

function stateOf(progress: Progress): ObserverTopicState {
    const current = progress.topic.observer as unknown as ObserverTopicState | undefined;
    if (current) return current;
    const fresh: ObserverTopicState = { attempts: [], accepted: null, needs: [] };
    progress.topic.observer = fresh as unknown as JsonValue;
    return fresh;
}

/**
 * What a caller follows of a task while it runs (`observe`): the Contract Supervisor's review after the guard, and the
 * attempts as they are judged. By task id; a task the factory runs without a caller has none, and is judged by the guard alone.
 */
interface Session {
    review?: (request: TwinFactoryRequest) => Promise<string[]>;
    attempts: ObserveAttempt[];
}
const SESSIONS = new Map<string, Session>();

export function openSession(taskId: string, review?: Session["review"]): Session {
    const session: Session = { ...(review ? { review } : {}), attempts: [] };
    SESSIONS.set(taskId, session);
    return session;
}
export const closeSession = (taskId: string): void => void SESSIONS.delete(taskId);

function noteAttempt(context: TopicContext, attempt: Omit<ObserveAttempt, "n">): void {
    const state = stateOf(context.progress);
    const n = state.attempts.length + 1;
    state.attempts.push({ n, ...attempt });
    SESSIONS.get(context.taskId)?.attempts.push({ n, ...attempt });
}

interface Signed {
    type: string;
    signature?: { inputs?: Record<string, { quantity?: string; unit?: string }>; outputs?: Record<string, { quantity?: string; unit?: string }> } | null;
}

/**
 * What the guard reads from the catalogue: its type ids, to refuse a request that names one, and the quantities its
 * signatures speak of, the shared vocabulary. The model is shown the vocabulary (the names of quantities and their
 * units), never the types.
 */
export async function catalogueOf(broker: Broker, slot: string): Promise<{ types: string[]; vocabulary: VocabularyEntry[] }> {
    const r = await broker.call(slot, "registry_list_nodes", {});
    const listed = r.ok ? (r.output as { types?: Signed[] }).types : undefined;
    const types = Array.isArray(listed) ? listed : [];
    const units = new Map<string, Set<string>>();
    for (const t of types) {
        for (const port of [...Object.values(t.signature?.inputs ?? {}), ...Object.values(t.signature?.outputs ?? {})]) {
            // A quantity the units service does not know cannot be asked of a factory: nothing could produce it, and no contract could be written in it (2026-09-28: "ConcentrationRate" asked, a graph task spent its budget on it).
            if (!port?.quantity || !physics().canonicalQuantity(port.quantity)) continue;
            const set = units.get(port.quantity) ?? new Set<string>();
            if (port.unit) set.add(port.unit);
            units.set(port.quantity, set);
        }
    }
    return { types: types.map((t) => t.type), vocabulary: [...units].map(([quantity, u]) => ({ quantity, units: [...u].sort() })).sort((a, b) => a.quantity.localeCompare(b.quantity)) };
}

/** The library's typed facts, by document: what the guard judges a known constant against. */
async function libraryFacts(broker: Broker): Promise<Record<string, LibraryFact[]>> {
    const r = await broker.call("library", "facts", {});
    const facts = r.ok ? (r.output as { facts?: Array<LibraryFact & { source: string }> }).facts : undefined;
    const out: Record<string, LibraryFact[]> = {};
    for (const f of Array.isArray(facts) ? facts : []) out[f.source] = [...(out[f.source] ?? []), f];
    return out;
}

/** The library's documents, each with its title and what it says: given up front, so the model knows a datasheet exists before it thinks of searching for one. */
export async function libraryDocuments(broker: Broker): Promise<ObserverObservation["documents"]> {
    const r = await broker.call("library", "list", { exclude: NOT_SHOWN });
    const docs = r.ok ? (r.output as { documents?: Array<{ id: string; title: string; summary?: string }> }).documents : undefined;
    return Array.isArray(docs) ? docs.map((d) => ({ id: d.id, title: d.title, ...(d.summary ? { summary: d.summary.slice(0, 160) } : {}) })) : [];
}

const candidateOf = (f: LibraryFact & { source: string }): CandidateFact => ({
    id: f.id,
    ...(f.semantic ? { semantic: f.semantic } : {}),
    value: f.value,
    unit: f.unit,
    ...(typeof f.min === "number" ? { min: f.min } : {}),
    ...(typeof f.max === "number" ? { max: f.max } : {}),
    source: f.source,
    ...(f.says ? { says: f.says.slice(0, 200) } : {}),
});

/** The library's facts nearest a need said in words (the library's search over its facts, library.facts with a query). */
async function factsNear(broker: Broker, need: string): Promise<CandidateFact[]> {
    const r = await broker.call("library", "facts", { query: need, limit: CANDIDATES });
    const facts = r.ok ? (r.output as { facts?: Array<LibraryFact & { source: string }> }).facts : undefined;
    return Array.isArray(facts) ? facts.map(candidateOf) : [];
}

export const NEEDS_SCHEMA = {
    type: "object",
    properties: {
        needs: {
            type: "array",
            minItems: 1,
            items: { type: "object", properties: { name: { type: "string", minLength: 1, description: "a number the twin needs, said in words (the flow between two modules with the hatch closed)" } }, required: ["name"] },
        },
    },
    required: ["needs"],
} as const;

export const CHOOSE_SCHEMA = {
    type: "object",
    properties: {
        choices: {
            type: "array",
            minItems: 1,
            items: {
                type: "object",
                properties: {
                    need: { type: "string", description: "the need, as you said it" },
                    factId: { type: "string", description: "the id of the fact that answers it; empty when none does" },
                    why: { type: "string", description: "in a few words" },
                },
                required: ["need", "factId", "why"],
            },
        },
    },
    required: ["choices"],
} as const;

/** The documents read in this task, by id, in order (the runner's evidence: `library.read <id>`). */
const documentsReadOf = (progress: Progress): string[] => [...new Set(Object.keys(progress.evidence).map((k) => /^library\.read (\S+)$/.exec(k)?.[1]).filter((x): x is string => Boolean(x)))];

/**
 * The request against everything the guard knows and the model is never shown: the catalogue, the telemetry's columns,
 * the library's facts and the texts of the documents read; then the Contract Supervisor's review, only on a request the
 * rules accepted (what the rules on numbers cannot see).
 */
async function requestProblems(sent: JsonValue, context: TopicContext): Promise<string[]> {
    const o = observationOf(context.task);
    const broker = context.broker;
    const { types, vocabulary } = await catalogueOf(broker, o.runtimeSlot ?? context.runtimeSlot ?? "twin");
    const facts = await libraryFacts(broker);
    // The fact ids the harness reads itself, the same way here and at execution: what is judged is what will be written.
    const input = withVocabularyForm(withFactIds(sent, facts).input, vocabulary.length ? vocabulary : o.quantities).input as JsonValue;
    const ids = new Set(o.documents.map((d) => d.id));
    // What was read: the documents read whole, and those whose facts a read listed (their ids are among the task's sources).
    const documentsRead = [...new Set([...documentsReadOf(context.progress), ...context.progress.sources.library.filter((id) => ids.has(id))])];
    const cited = [...new Set(((input as { known?: Array<{ source?: unknown }> } | null)?.known ?? []).map((k) => k?.source).filter((s): s is string => typeof s === "string" && documentsRead.includes(s) && !facts[s]?.length))];
    const documents: Record<string, string> = {};
    for (const id of cited) {
        const r = await broker.call("library", "read", { id });
        const text = r.ok ? (r.output as { text?: unknown }).text : undefined;
        if (typeof text === "string") documents[id] = text;
    }
    const columns = o.telemetry ? o.telemetry.columns.map((c) => c.column) : undefined;
    const check = checkTwinRequest(input, { catalogueTypes: types, telemetryColumns: columns, vocabulary: vocabulary.length ? vocabulary : o.quantities, description: o.description, documentsRead, documents, facts });
    if (!check.ok) return check.problems;
    const review = SESSIONS.get(context.taskId)?.review;
    const found = review ? await review(input as unknown as TwinFactoryRequest) : [];
    // An assumption the review finds contradicted enters the registry as what it is: inferred by the Observer, then contradicted, with why.
    const assumptions = ((input as { assumptions?: unknown[] } | null)?.assumptions ?? []).map(String);
    for (const finding of found) {
        const n = Number(/\bon assumption:(\d+)/.exec(finding)?.[1] ?? 0);
        if (!n || !assumptions[n - 1]) continue;
        const claim = addClaim(context.progress.claims, { subject: `assumption ${n}`, text: assumptions[n - 1], status: "INFERRED", source: { kind: "model", ref: "observer", step: context.progress.iteration }, by: "observer" });
        transition(claim, "CONTRADICTED", finding);
    }
    return found;
}

function evidenceOf(progress: Progress, task: TaskFile["task"]): Evidence {
    const state = stateOf(progress);
    return {
        documentRead: progress.reads["library.read"] !== undefined,
        needsListed: state.needs.length > 0,
        needsChosen: state.needs.length > 0 && state.needs.every((n) => n.chosen !== undefined),
        requestAccepted: state.accepted !== null,
        attemptsLeft: state.attempts.filter((a) => !a.ok).length < observationOf(task).attempts,
    };
}

function viewsOf(progress: Progress, task: TaskFile["task"]): Record<string, () => Record<string, string | number>> {
    const state = stateOf(progress);
    const used = state.attempts.filter((a) => !a.ok).length;
    const read = (): string => {
        const ids = documentsReadOf(progress);
        return ids.length ? w("read", { read: ids.join(", ") }) : w("readNothing");
    };
    return {
        accepted: () => ({ path: state.accepted?.path ?? "" }),
        read: () => ({ read: read() }),
        request: () => ({ attempts: Math.max(0, observationOf(task).attempts - used), used, read: read() }),
        choose: () => ({ open: state.needs.filter((n) => n.chosen === undefined).map((n) => `"${n.name}"`).join(", ") || "none" }),
    };
}

export function briefOf(progress: Progress, task: TaskFile["task"]): string {
    return sayingText(OBSERVER_CONDUCT.evaluate(evidenceOf(progress, task)).stage, w, viewsOf(progress, task));
}

async function guardObserver(capabilityId: string, input: JsonValue, context: TopicContext): Promise<string[]> {
    const views = viewsOf(context.progress, context.task);
    const { stage, refusing } = OBSERVER_CONDUCT.evaluate(evidenceOf(context.progress, context.task));
    const refused = refusing.filter((g) => g.capabilities.includes(capabilityId)).map((g) => sayingText(g, w, views));
    // A way out entered: its tools only.
    if (stage.exit && !(stage.tools ?? []).includes(capabilityId)) refused.push(sayingText(stage, w, views));
    if (refused.length) return refused;
    // A document the Observer is not shown, read by its id: refused with why (its list and its searches leave it out already).
    if (/^library\.(read|facts)$/.test(capabilityId)) {
        const id = String((input as { id?: unknown } | null)?.id ?? "");
        const hidden = OBSERVER_LIBRARY.notShown.find((d) => d.id === id);
        return hidden ? [`"${id}" is not shown to the Observer: ${hidden.why}`] : [];
    }
    if (capabilityId === OBSERVER_CHOOSE) return chooseProblems(input, context);
    if (capabilityId !== OBSERVER_CAPABILITY) return [];
    const problems = await requestProblems(input, context);
    if (!problems.length) return [];
    noteAttempt(context, { ok: false, problems, proposed: JSON.stringify(input).slice(0, 2000) });
    // Each problem with its kind, the word before its colon (shape, separation, facts, provenance, vocabulary, scope, units).
    context.progress.pendingProblems = problems.map((says) => ({ says, kind: /^([a-z]+):/.exec(says)?.[1] ?? "request" }));
    return [w("guard.refused", { problems: problems.join("; ") })];
}

/** A choice names a need said and a fact of the library, or none; every need said is chosen for. */
async function chooseProblems(input: JsonValue, context: TopicContext): Promise<string[]> {
    const state = stateOf(context.progress);
    const choices = Array.isArray((input as { choices?: unknown } | null)?.choices) ? ((input as { choices: Array<{ need?: unknown; factId?: unknown }> }).choices) : [];
    const facts = Object.values(await libraryFacts(context.broker)).flat();
    const problems: string[] = [];
    for (const c of choices) {
        const id = typeof c.factId === "string" ? c.factId.trim() : "";
        if (id && !facts.some((f) => f.id === id)) problems.push(w("guard.choiceUnknown", { need: String(c.need), id }));
    }
    const said = new Set(choices.map((c) => String(c.need ?? "").trim().toLowerCase()));
    const open = state.needs.filter((n) => n.chosen === undefined && !said.has(n.name.trim().toLowerCase()));
    if (open.length) problems.push(w("guard.choiceMissing", { needs: open.map((n) => `"${n.name}"`).join(", ") }));
    return problems;
}

/** What the twin needs as numbers, said in words: the library's facts nearest each, given back and kept in the state. */
function needsCapability(context: TopicContext): LocalCapability {
    return {
        id: OBSERVER_NEEDS,
        description: w("capabilities.needs", { n: CANDIDATES }),
        inputSchema: NEEDS_SCHEMA as unknown as JsonValue,
        async execute(input: JsonValue): Promise<CapabilityResult> {
            const state = stateOf(context.progress);
            const asked = ((input as { needs?: Array<{ name?: unknown }> }).needs ?? []).map((n) => String(n?.name ?? "").trim()).filter(Boolean);
            for (const name of asked) {
                if (state.needs.some((n) => n.name.toLowerCase() === name.toLowerCase())) continue;
                state.needs.push({ name, candidates: await factsNear(context.broker, name) });
            }
            return { ok: true, output: { outcome: "completed", value: { needs: state.needs.map((n) => ({ need: n.name, facts: n.candidates.map((f) => `${f.id} = ${f.value} ${f.unit}${typeof f.min === "number" ? ` (${f.min} to ${f.max})` : ""} (${f.source})`) })) } } };
        },
    };
}

/** For each need, the fact chosen, or none: the chosen facts go into the state with their values. */
function chooseCapability(context: TopicContext): LocalCapability {
    return {
        id: OBSERVER_CHOOSE,
        description: w("capabilities.choose"),
        inputSchema: CHOOSE_SCHEMA as unknown as JsonValue,
        async execute(input: JsonValue): Promise<CapabilityResult> {
            const state = stateOf(context.progress);
            const facts = Object.values(await libraryFacts(context.broker)).flat() as Array<LibraryFact & { source: string }>;
            for (const c of (input as { choices: Array<{ need: string; factId: string; why: string }> }).choices) {
                const need = state.needs.find((n) => n.name.trim().toLowerCase() === String(c.need).trim().toLowerCase());
                if (!need) continue;
                const id = String(c.factId ?? "").trim();
                const fact = id ? facts.find((f) => f.id === id) : undefined;
                need.chosen = { factId: fact ? fact.id : null, why: String(c.why ?? ""), fact: fact ? candidateOf(fact) : null };
                // Into the registry: the fact chosen, verified when its document is signed; a need no fact answers, unknown.
                const signed = Boolean((fact as { signed?: { valid?: boolean } | null } | undefined)?.signed?.valid);
                const status: ClaimStatus = signed ? "VERIFIED" : "OBSERVED";
                if (fact) addClaim(context.progress.claims, { subject: need.name, value: fact.value, unit: fact.unit, status, source: { kind: "fact", ref: fact.id, document: fact.source, signed, step: context.progress.iteration }, by: "observer", cause: String(c.why ?? "") });
                else addClaim(context.progress.claims, { subject: need.name, status: "UNKNOWN", source: { kind: "model", ref: "observer", step: context.progress.iteration }, by: "observer", cause: String(c.why ?? "no fact answers it") });
            }
            return { ok: true, output: { outcome: "completed", value: { chosen: state.needs.map((n) => ({ need: n.name, fact: n.chosen?.fact ? `${n.chosen.fact.id} = ${n.chosen.fact.value} ${n.chosen.fact.unit} (${n.chosen.fact.source})` : n.chosen ? "none" : "not chosen yet" })) } } };
        },
    };
}

function requestCapability(context: TopicContext): LocalCapability {
    return {
        id: OBSERVER_CAPABILITY,
        description: w("capability", { file: OBSERVER_REQUEST_FILE }),
        inputSchema: TWIN_REQUEST_SCHEMA as unknown as JsonValue,
        async execute(sent: JsonValue): Promise<CapabilityResult> {
            // The request as the guard judged it: the fact ids one fact alone holds, read by the harness and said in the answer.
            const ids = withFactIds(sent, await libraryFacts(context.broker));
            const o = observationOf(context.task);
            const { vocabulary } = await catalogueOf(context.broker, o.runtimeSlot ?? context.runtimeSlot ?? "twin");
            const forms = withVocabularyForm(ids.input, vocabulary.length ? vocabulary : o.quantities);
            const input = forms.input as JsonValue;
            const read = [...ids.read, ...forms.read];
            const text = JSON.stringify(input, null, 2) + "\n";
            const r = await context.broker.call("workspace", "write", { taskId: context.taskId, path: OBSERVER_REQUEST_FILE, text });
            if (!r.ok) return { ok: false, error: r.error ?? `could not write ${OBSERVER_REQUEST_FILE}`, output: { outcome: r.outcome } };
            noteAttempt(context, { ok: true, problems: [], proposed: JSON.stringify(input).slice(0, 2000) });
            const state = stateOf(context.progress);
            state.accepted = { path: OBSERVER_REQUEST_FILE, sha256: (r.output as { sha256: string }).sha256 };
            // Into the registry: each known constant by the fact it cites (a constant citing none is the Observer's inference), each assumption as inferred.
            const request = input as unknown as TwinFactoryRequest;
            const facts = Object.values(await libraryFacts(context.broker)).flat();
            const step = context.progress.iteration;
            for (const k of request.known ?? []) {
                const fact = k.factId ? facts.find((f) => f.id === k.factId) : undefined;
                const signed = Boolean((fact as { signed?: { valid?: boolean } | null } | undefined)?.signed?.valid);
                if (fact) addClaim(context.progress.claims, { subject: k.name ?? k.symbol, value: k.value, unit: k.unit, status: signed ? "VERIFIED" : "OBSERVED", source: { kind: "fact", ref: fact.id, document: k.source, signed, step }, by: "observer" });
                else addClaim(context.progress.claims, { subject: k.name ?? k.symbol, value: k.value, unit: k.unit, status: "INFERRED", source: { kind: "model", ref: "observer", step }, by: "observer", cause: `cites ${k.source} without a fact id` });
            }
            (request.assumptions ?? []).forEach((a, i) => addClaim(context.progress.claims, { subject: `assumption ${i + 1}`, text: String(a), status: "INFERRED", source: { kind: "model", ref: "observer", step }, by: "observer", cause: "an assumption, said as such" }));
            return { ok: true, output: { outcome: "completed", value: { accepted: true, path: OBSERVER_REQUEST_FILE, sha256: state.accepted.sha256, ...(read.length ? { read } : {}) } } };
        },
    };
}

export function stateOfTopic(progress: Progress, task: TaskFile["task"]): TopicState {
    const o = observationOf(task);
    const state = stateOf(progress);
    const e = evidenceOf(progress, task);
    const last = state.attempts.at(-1);
    return {
        hypothesis: {
            description: o.description,
            // The telemetry as facts computed by code (counts, ends, range, mean, whether a column moves), never its rows.
            telemetry: (o.telemetry ?? "none supplied") as unknown as JsonValue,
            // The shared vocabulary as it is: each quantity and its units, never a label to copy (run 25: "Concentration (ppm)" written as a quantity).
            quantities: o.quantities.map((v) => ({ quantity: v.quantity, units: v.units })) as unknown as JsonValue,
            documents: o.documents.map((d) => `${d.id} (${d.title}${d.summary ? `: ${d.summary}` : ""})`).join("; "),
            // The selection: each need with the facts the library found nearest, and the one chosen; the chosen facts with their values are what the request cites.
            needs: state.needs.map((n) => ({ need: n.name, candidates: n.candidates, ...(n.chosen ? { chosen: n.chosen.fact ?? "none answers it" } : {}) })) as unknown as JsonValue,
            accepted: state.accepted as unknown as JsonValue,
        },
        evaluation: last ? ({ request: last.n, ok: last.ok, problems: last.problems } as JsonValue) : null,
        openQuestions: [w(e.requestAccepted ? "openQuestions.handOver" : e.needsChosen ? "openQuestions.request" : e.needsListed ? "openQuestions.choose" : e.documentRead ? "openQuestions.needs" : "openQuestions.read")],
        requirements: e as Record<string, boolean>,
    };
}

export function validateObserver(claim: DoneClaim, files: WorkshopFile[], progress: Progress): Validation {
    const problems: string[] = [];
    const claimed = claim.artifacts.filter((a) => a.kind === "request");
    const { accepted } = stateOf(progress);
    if (!claimed.length) problems.push(w("validate.none"));
    if (!accepted) problems.push(w("validate.notAccepted"));
    for (const c of claimed) {
        const file = files.find((f) => f.path === c.path);
        if (!file || !accepted || file.path !== accepted.path || file.sha256 !== accepted.sha256) problems.push(w("validate.notTheFile", { path: c.path, accepted: accepted ? `${accepted.path}, sha256 ${accepted.sha256.slice(0, 12)}` : "none" }));
    }
    return { ok: problems.length === 0, problems };
}

function intentionOf(_task: TaskFile["task"], generic: Intention): Intention {
    return { ...generic, description: w("intention") };
}

export const OBSERVER_TOPIC: TopicDefinition = {
    // The marching order the state shows first (conduct.ts, conductView), and what must hold before handing over.
    marchingOrder: (progress, task) => {
        const e = evidenceOf(progress, task);
        return {
            ...conductView(OBSERVER_CONDUCT, e, w, viewsOf(progress, task), Object.keys(progress.reads)),
            doneWhen: [
                { item: w("doneWhen.read"), met: Boolean(e.documentRead) },
                { item: w("doneWhen.needs"), met: Boolean(e.needsListed) },
                { item: w("doneWhen.chosen"), met: Boolean(e.needsChosen) },
                { item: w("doneWhen.accepted"), met: Boolean(e.requestAccepted) },
                { item: w("doneWhen.handedOver"), met: progress.done !== null },
            ],
        } as unknown as JsonValue;
    },
    // The stage's tools only: what the conduct's gates refuse now is not shown (the guard refuses it still).
    // The stage's tools: what a step offers, with the support every stage has (base.ts, STAGE_SUPPORT).
    stageTools: (progress, task) => stageToolsOf(OBSERVER_CONDUCT, evidenceOf(progress, task)),
    closed: (progress, task) => {
        const { stage, refusing } = OBSERVER_CONDUCT.evaluate(evidenceOf(progress, task));
        // A way out entered closes every tool the Observer has but its own.
        const all = [...BASE_CAPABILITIES, OBSERVER_CAPABILITY, OBSERVER_NEEDS, OBSERVER_CHOOSE];
        return stage.exit ? all.filter((id) => !(stage.tools ?? []).includes(id)) : refusing.flatMap((g) => g.capabilities);
    },
    name: "observer",
    tools: OBSERVER_TOOLS,
    // The library as the Observer sees it: its searches and lists leave out the factories' cards.
    bindings: [{ match: /^library\.(search|list)$/, constants: { exclude: NOT_SHOWN } }],
    // A request is made of this task's description and readings, never replayed from another's.
    neverReplayed: [/^observer\.(submit|needs|choose)$/, /^task\.done$/],
    judges: [/^observer\.submit$/],
    replayedActions: [/^task\.plan$/],
    validate: (claim, files, progress) => validateObserver(claim, files, progress),
    local: (context) => [needsCapability(context), chooseCapability(context), requestCapability(context)],
    guard: guardObserver,
    state: stateOfTopic,
    key: (progress) => stateOf(progress).attempts.map((a) => (a.ok ? "ok" : "refused")).join(","),
    intention: intentionOf,
    prompt: OBSERVER_PROMPT,
    words: { words: OBSERVER_WORDS, keys: OBSERVER_WORD_KEYS },
    brief: briefOf,
    observation: OBSERVER_OBSERVATION,
    // No graph is built: the reference graphs are not shown.
    shelf: false,
    // A request is a document: its output is named, not a quantity.
    quantities: false,
};
