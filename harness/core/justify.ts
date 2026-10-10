/**
 * Every number a factory sets is justified, the same way in every factory (2026-09-28; first written for the procedure, the day a
 * test's CO2 limits came from an Earth baseline nobody gave), and since 2026-10-10 by whoever holds what justifies it:
 *
 *   a safety constant (a constant the signed rules name: what bounds the air people breathe, a speed, an exposure, an abort, a
 *   watch) is set by the model and justified by the harness: the guard checks its value against every fact of a signed document
 *   the rules bound it by, and the artifact accepted records that justification, written by code (`safetyJustifications`); a
 *   safety constant no signed fact bounds is not set at all;
 *
 *   any other number the model chose (a duration, an assumption, a bound searched) is justified by the model, so a reviewer can
 *   challenge it: its path, its source, the reference and why:
 *
 *   library    a document or a fact of the library read in this task
 *   web        a page a web search returned in this task
 *   measured   what the task observed (a sensor, the telemetry, the presence)
 *   envelope   a bound of the guard's own envelope, by name
 *   derived    a calculation from other constants, its formula as reference
 *   assumed    an assumption, said as such
 *
 * A justification does not repeat the value it justifies: the harness reads it at the path. Before (runs xykl and pzeq,
 * 2026-10-10), a value changed without its double in the justification was refused as "the justification says 30, what you sent
 * sets 15", and Nemotron Nano moved values to fit their justifications; the model also copied, for each safety constant, the fact
 * the signed rules already name, and every copying error had become a rule of its own.
 *
 * A topic says where its constants are (`TopicDefinition.justified`): which call carries them, how to read them, which are safety
 * constants. The constructor's guard checks them (`builder-guard.ts`), or the topic's own guard when it reports them with its
 * other checks (the procedure's, to Mother). What was read is noted on every call (`noteSources`), whoever decided the step.
 */
import type { JsonValue } from "@spiky-panda/harness";
import type { LibraryFact } from "./contracts.js";
import type { CapabilityCall } from "./capabilities.js";
import type { TaskFile } from "./task.js";
import type { TopicContext } from "./topic.js";

export type JustificationSource = "library" | "web" | "measured" | "envelope" | "derived" | "assumed";
export const JUSTIFICATION_SOURCES: ReadonlyArray<JustificationSource> = ["library", "web", "measured", "envelope", "derived", "assumed"];

/** A constant's value: a number, or a range given as [min, max] (a variable's bounds). */
export type ConstantValue = number | [number, number];

/** A justification as the model gives it: the number's path, its source, the reference and why; never its value, read at the path. */
export interface Justification {
    /** The constant's path in what was sent (steps.1.minutes, variables.g, fit.V_lab, fullScale.current). */
    constant: string;
    source: JustificationSource;
    /** The document or fact id, the URL, the envelope's bound, the formula; what the assumption rests on. */
    reference: string;
    reason: string;
}

/** A justification as an accepted artifact records it: with the value read at its path, and who wrote it (the model, or the harness for a safety constant). */
export interface RecordedJustification extends Justification {
    value: ConstantValue;
    by: "model" | "harness";
}

export interface Constant {
    constant: string;
    value: ConstantValue;
}

/** What a justification may cite, as read in this task. */
export interface ReadSources {
    library: string[];
    web: string[];
}

/** A library fact as the library serves it: its document, and that document's signature as it stands. */
export type SignedFact = LibraryFact & { source: string; signed?: { by: string; at: string; valid: boolean } | null };

/** Where a topic's constants are, and which are safety constants. */
export interface Justified {
    /** The call that carries the constants. */
    capability: RegExp;
    /** The constants the call sets, by path. */
    constants(input: JsonValue): Constant[];
    /** The justifications the call gives; its `justifications` field by default. */
    given?(input: JsonValue): unknown[];
    /** The safety constants, by path: set by the model, judged and justified by the harness against the signed facts (a pattern, or what a signed document's rules name). */
    safety?: RegExp | ((constant: string) => boolean);
    /** The guard's envelope, when a constant may cite one of its bounds. */
    envelope?: Record<string, unknown>;
    /** The facts the signed rules bound a safety constant by, by id (`rules.ts`, factsBounding): what its value must respect. */
    boundBy?(constant: string): string[];
    /** Does the task give a measurement to cite; any observation or data by default. */
    measured?(task: TaskFile["task"]): boolean;
    /** The topic's own guard checks them and reports them with its other checks; the constructor's guard leaves them to it. */
    inTopicGuard?: boolean;
    /** The whole a call stands for, when it carries only a part (a revision applied to a draft); the call's input by default. */
    whole?(capabilityId: string, input: JsonValue, progress: TopicContext["progress"]): JsonValue | null;
}

/** Is a constant a safety constant of this topic. */
export const safetyTest =
    (justified: Pick<Justified, "safety">) =>
    (constant: string): boolean =>
        typeof justified.safety === "function" ? justified.safety(constant) : Boolean(justified.safety?.test(constant));

/**
 * What a refusal for justifications leaves the builder to do, from the call refused and what the topic declares (2026-09-28: the
 * same refusal text, read nine times, changed nothing; what is missing is put in the context, named as the guard names it, with
 * its value, and the prompt says it differently at every repetition). Only the numbers the model justifies: never a safety one.
 */
export interface JustificationHelp {
    capability: string;
    /** How many refusals in a row of this capability left constants unjustified. */
    times: number;
    /** The numbers set with no justification found, by path, with their values. */
    missing: Constant[];
    /** The names the justifications gave that are no constant the call set. */
    unmatched: string[];
}

export function justificationHelp(justified: Justified, input: JsonValue): Pick<JustificationHelp, "missing" | "unmatched"> {
    const isSafety = safetyTest(justified);
    const all = justified.constants(input);
    const constants = all.filter((c) => !isSafety(c.constant));
    const given = asJustifications(givenOf(justified, input));
    const paths = all.map((c) => c.constant);
    const missing = constants.filter((c) => !justificationOf(given, c.constant, paths));
    const matches = (name: string) => paths.filter((p) => p === name || p.endsWith(`.${name}`)).length === 1;
    const unmatched = [...new Set(given.map((j) => String(j.constant ?? "")).filter((name) => name && !matches(name)))];
    return { missing, unmatched };
}

/**
 * What is left to justify after a refusal: what the guard refused as unjustified (its points saying a path "has no justification"),
 * and nothing else. The guard alone knows which constants the signed rules make safety ones, the harness's to justify: read from the
 * topic's declaration, the help listed eleven safety constants to justify in the brief that said to leave one out (2026-10-10, run 6),
 * and Nemotron Nano went round between the two.
 */
export function helpForRefusal(justified: Justified, whole: JsonValue | null, problems: ReadonlyArray<{ says: string; path?: string }>): Pick<JustificationHelp, "missing" | "unmatched"> | null {
    const refused = new Set(problems.filter((p) => p.path && / has no justification /.test(p.says)).map((p) => p.path!));
    if (!refused.size || whole === null) return null;
    const found = justificationHelp(justified, whole);
    const missing = found.missing.filter((c) => refused.has(c.constant));
    return missing.length ? { ...found, missing } : null;
}

/** The brief's words for it: said at the top of the brief, differently at each repetition. */
export function justificationNote(help: JustificationHelp | null | undefined): string {
    if (!help || !help.missing.length) return "";
    const again = help.times > 1 ? ` This is refusal number ${help.times} for the same reason: sending the same justifications again gets it again.` : "";
    const list = help.missing.slice(0, 12).map((c) => `${c.constant} = ${shown(c.value)}`).join(", ") + (help.missing.length > 12 ? `, and ${help.missing.length - 12} more` : "");
    const names = help.unmatched.length ? ` Your justifications named ${help.unmatched.slice(0, 12).join(", ")}, which is no number you chose: a justification names its number by the path listed here, exactly.` : "";
    return `Your last ${help.capability} was refused for its justifications. ${help.missing.length} number(s) you chose have none under their path: ${list}.${names} The state lists them under justify.skeleton, the path filled: give each its source, reference and reason. Send again with these.${again} `;
}

/** The `justifications` field of a call's input, as a schema a tool adds to its own. */
export const JUSTIFICATIONS_SCHEMA = {
    type: "array",
    description:
        "One per number you chose that no signed rule bounds (a step's duration, an assumption, a bound searched, a setting): its path (constant), its source (library: a document or fact id read in this task; web: a URL a search returned; measured: what the task observed; envelope: a bound of the guard's envelope; derived: the formula; assumed: what the assumption rests on), the reference, and why. The value is read at the path, never repeated here. A safety constant the signed rules bound is checked and justified by the harness: never here.",
    items: {
        type: "object",
        properties: {
            constant: { type: "string", description: "The number's path in what you send (steps.1.minutes, variables.g)." },
            source: { type: "string", enum: [...JUSTIFICATION_SOURCES] },
            reference: { type: "string", description: "Exactly one: for library, one id as library.facts lists it, nothing joined to it; for web, one URL; for derived, the formula; else what was observed or assumed. The facts that support it and the engineering rationale go in reason." },
            reason: { type: "string", description: "Why, in a few words (a dozen at most), with any fact that supports it: the reviewer reads the source, not an essay." },
        },
        required: ["constant", "source", "reference", "reason"],
    },
} as const;

/** What a call read that a justification may cite: the library's documents and facts, a web search's pages. */
export function noteSources(sources: ReadSources, call: Pick<CapabilityCall, "id" | "input" | "result">): void {
    if (!call.result.ok) return;
    const text = JSON.stringify(call.result.output ?? null);
    const add = (id: unknown) => {
        if (typeof id === "string" && id && !sources.library.includes(id)) sources.library.push(id);
    };
    const inner = ((o: unknown) => (o && typeof o === "object" && "value" in (o as object) ? (o as { value: unknown }).value : o))(call.result.output) as Record<string, unknown> | null;
    if (/^library\.(read|facts|methods)$/.test(call.id)) {
        add((call.input as { id?: unknown } | null)?.id);
        // A document read, the facts it states, the method cards listed: their ids and the documents facts come from.
        for (const m of text.matchAll(/"id":"([a-z0-9][a-z0-9._-]*)"/gi)) add(m[1]);
        for (const m of text.matchAll(/"source":"([a-z0-9][a-z0-9-]*)"/gi)) add(m[1]);
    }
    if (/^library\.(graphs|graph)$/.test(call.id)) {
        // A graph read: the graph itself, and the documents its variables say they come from ("nasa-crew-metabolic-loads: ...",
        // "(library station-topology)"), never the ids of its nodes (2026-09-28: "person-fe-1, scene, solver" were taken for documents
        // read, and the card the graph's rate comes from was not, which cost a refusal).
        const graphs = call.id === "library.graph" ? [inner] : Array.isArray(inner?.graphs) ? (inner!.graphs as Array<Record<string, unknown>>) : [];
        add((call.input as { id?: unknown } | null)?.id);
        for (const g of graphs) {
            if (!g) continue;
            add(g.id);
            const variables = (g.variables ?? (g.template as { variables?: unknown } | undefined)?.variables ?? {}) as Record<string, { source?: unknown; factId?: unknown }>;
            for (const v of Object.values(variables)) {
                add(v?.factId);
                const source = typeof v?.source === "string" ? v.source : "";
                const cited = /^([a-z0-9][a-z0-9-]*[a-z0-9]):/.exec(source)?.[1];
                if (cited && cited.includes("-")) add(cited);
                for (const m of source.matchAll(/\blibrary ([a-z0-9][a-z0-9-]*[a-z0-9])\b/g)) add(m[1]);
            }
        }
    }
    if (call.id === "web.search") for (const m of text.matchAll(/https?:\/\/[^"\s\\]+/g)) if (!sources.web.includes(m[0])) sources.web.push(m[0]);
}

/**
 * The justification of a constant: the one that names its path, or else the one alone that names the end of it, when
 * no other constant sent ends the same way (2026-09-28: a model justified "V" for fit.V, refused nine times for a name
 * it was never told). `paths` are the constants sent; a short name two of them end with names neither.
 */
export function justificationOf(list: Array<Partial<Justification>>, constant: string, paths: string[] = [constant]): Partial<Justification> | undefined {
    const exact = list.find((x) => x.constant === constant);
    if (exact) return exact;
    const endsWith = (path: string, name: string) => path === name || path.endsWith(`.${name}`);
    const ends = list.filter((x) => typeof x.constant === "string" && x.constant.length > 0 && constant.endsWith(`.${x.constant}`) && paths.filter((p) => endsWith(p, String(x.constant))).length === 1);
    return ends.length === 1 ? ends[0] : undefined;
}

/** How to name a constant in a justification, said when none matched. */
const named = (constant: string): string => `(a justification names it by its path, constant "${constant}")`;

const shown = (v: unknown): string => (Array.isArray(v) ? `[${v.join(", ")}]` : String(v));
const asJustifications = (given: unknown[]): Array<Partial<Justification>> => given.filter((j): j is Partial<Justification> => Boolean(j) && typeof j === "object");

/**
 * The source read a library reference names: the id itself, or the id followed by a path inside it (2026-10-10, run 8: Nemotron Nano
 * cited "habitat.variables.V", the variable V of the graph habitat it had read, and was refused for it, then tried to read "habitat"
 * as a document, twice). The longest id read that the reference starts with, before a separator; null when none.
 */
export function librarySourceOf(reference: string, read: ReadonlyArray<string>): string | null {
    if (read.includes(reference)) return reference;
    const named = read.filter((id) => id && reference.length > id.length && reference.startsWith(id) && /^[.#/: (\[]/.test(reference.slice(id.length)));
    return named.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** The problems of the numbers the model justifies: none unjustified, each with a reason and a source this task can cite. Its value is the one at its path: never compared with anything a justification says. */
export function justificationProblems(constants: Constant[], given: unknown[], read: ReadSources, options: { measured: boolean; envelope?: Record<string, unknown> }): string[] {
    const problems: string[] = [];
    const list = asJustifications(given);
    const paths = constants.map((x) => x.constant);
    for (const c of constants) {
        const j = justificationOf(list, c.constant, paths);
        if (!j) {
            problems.push(`${c.constant} = ${shown(c.value)} has no justification ${named(c.constant)}: say its source (a library document or fact read, a web page found, the measurement given, the guard's envelope, a calculation from other constants, or an assumption said as such) and why`);
            continue;
        }
        if (!String(j.reason ?? "").trim()) problems.push(`${c.constant}: the justification gives no reason`);
        const ref = String(j.reference ?? "").trim();
        switch (j.source) {
            case "library":
                if (!librarySourceOf(ref, read.library)) problems.push(`${c.constant}: "${ref}" is not a library document or fact read in this task (${read.library.slice(0, 12).join(", ") || "none read"}): read it (library.read for a document, library.facts for a fact), or cite another source`);
                break;
            case "web":
                if (!read.web.includes(ref)) problems.push(`${c.constant}: "${ref}" is not a page a web search returned in this task: search, and cite a URL it returned`);
                break;
            case "measured":
                if (!options.measured) problems.push(`${c.constant}: the task gives no measurement to cite`);
                break;
            case "envelope": {
                const bounds = Object.keys(options.envelope ?? {}).filter((k) => typeof (options.envelope ?? {})[k] === "number");
                if (!bounds.includes(ref)) problems.push(`${c.constant}: "${ref}" is not a bound of the guard's envelope (${bounds.join(", ") || "this factory has none"})`);
                break;
            }
            case "derived":
                if (!ref) problems.push(`${c.constant}: a derived value gives its formula as the reference`);
                break;
            case "assumed":
                break;
            default:
                problems.push(`${c.constant}: source "${String(j.source)}" is not one of ${JUSTIFICATION_SOURCES.join(", ")}`);
        }
    }
    return problems;
}

/** A fact's safe side, in words. */
export const sideOf = (fact: Pick<SignedFact, "bound">): string => (fact.bound === "upper" ? "at or below it" : fact.bound === "lower" ? "at or above it" : "equal to it");

/** Does a value (or both ends of a range) respect a fact's safe side. */
const respects = (value: ConstantValue, fact: SignedFact): boolean =>
    (Array.isArray(value) ? value : [value]).every((v) => (fact.bound === "upper" ? v <= fact.value : fact.bound === "lower" ? v >= fact.value : Math.abs(v - fact.value) <= 1e-9 * Math.max(1, Math.abs(fact.value))));

/** The facts the signed rules bound a constant by, as the library serves them. */
const boundingOf = (constant: string, facts: SignedFact[], boundBy?: (constant: string) => string[]): { ids: string[]; facts: SignedFact[] } => {
    const ids = boundBy?.(constant) ?? [];
    return { ids, facts: ids.map((id) => facts.find((f) => f.id === id)).filter((f): f is SignedFact => f !== undefined) };
};

const SIGNING = 'a person reviews it and signs it on the library page of the control room (library.html), or: npm run library:sign -- <document> "<name>"';

/**
 * The problems of the safety constants, judged by the harness alone (2026-10-10): each value respects every fact of a signed
 * document the signed rules bound it by; a safety constant no signed fact bounds is not set. What a model wrote in its
 * justifications for them is not read: their justification is the harness's (`safetyJustifications`).
 */
/**
 * What leaving a field out means, said by its path: the field alone, the element that holds it staying (2026-10-10, run 6: "leave it
 * out" said of abort.co2.threshold, Nemotron Nano took out the abort condition co2 itself, then put it back with its threshold, three
 * times).
 */
export function leaveOut(path: string): string {
    const at = path.lastIndexOf(".");
    return at < 0 ? `leave out the field ${path}` : `leave out the field ${path.slice(at + 1)} alone: ${path.slice(0, at)} stays, without it`;
}

export function safetyProblems(constants: Constant[], facts: SignedFact[], boundBy?: (constant: string) => string[]): string[] {
    const problems: string[] = [];
    for (const c of constants) {
        const bounding = boundingOf(c.constant, facts, boundBy);
        if (!bounding.ids.length) {
            problems.push(`${c.constant} = ${shown(c.value)} is a safety constant no signed fact bounds: ${leaveOut(c.constant)} (the harness sets no safety number that nothing signed justifies)`);
            continue;
        }
        if (!bounding.facts.length) {
            problems.push(`${c.constant}: the facts the signed rules bound it by (${bounding.ids.join(", ")}) are not in the library`);
            continue;
        }
        for (const fact of bounding.facts) {
            if (!fact.signed) problems.push(`${c.constant}: the fact ${fact.id} is in "${fact.source}", which no person has signed as valid: a safety constant is bounded by a signed document only; if none bounds it, end with task.fail naming the document a person must sign (${SIGNING})`);
            else if (!fact.signed.valid) problems.push(`${c.constant}: "${fact.source}" was signed by ${fact.signed.by} and has changed since; ${SIGNING}`);
            else if (!respects(c.value, fact)) problems.push(`${c.constant} = ${shown(c.value)} does not respect ${fact.id} = ${fact.value} ${fact.unit}, a fact of a signed document: set it ${sideOf(fact)}`);
        }
    }
    return problems;
}

/** The justifications of the safety constants, written by the harness from the signed rules: what an accepted artifact records for them. */
export function safetyJustifications(constants: Constant[], facts: SignedFact[], boundBy?: (constant: string) => string[]): RecordedJustification[] {
    return constants.flatMap((c) => {
        const bounding = boundingOf(c.constant, facts, boundBy).facts;
        if (!bounding.length) return [];
        const reason = bounding.map((f) => `${sideOf(f)}: ${f.id} = ${f.value} ${f.unit}${f.signed ? `, signed by ${f.signed.by}` : ""}`).join("; ");
        return [{ constant: c.constant, value: c.value, source: "library" as const, reference: bounding[0].id, reason, by: "harness" as const }];
    });
}

/** The justifications an accepted artifact records: the model's for the numbers it chose, each with the value read at its path, and the harness's for the safety constants. */
export function recordedJustifications(justified: Justified, input: JsonValue, facts: SignedFact[]): RecordedJustification[] {
    const isSafety = safetyTest(justified);
    const constants = justified.constants(input);
    const paths = constants.map((c) => c.constant);
    const given = asJustifications(givenOf(justified, input));
    const chosen = constants
        .filter((c) => !isSafety(c.constant))
        .flatMap((c) => {
            const j = justificationOf(given, c.constant, paths);
            return j ? [{ constant: c.constant, value: c.value, source: j.source as JustificationSource, reference: String(j.reference ?? ""), reason: String(j.reason ?? ""), by: "model" as const }] : [];
        });
    return [...chosen, ...safetyJustifications(constants.filter((c) => isSafety(c.constant)), facts, justified.boundBy)];
}

/** The given justifications of a call: its `justifications` field, unless the topic reads them elsewhere. */
export const givenOf = (justified: Justified, input: JsonValue): unknown[] => {
    const given = justified.given ? justified.given(input) : (input as { justifications?: unknown } | null)?.justifications;
    return Array.isArray(given) ? given : [];
};

/** Every problem of a call's numbers: the safety ones against the signed facts, the others against their justifications; the library's facts are read only when a safety constant is set. */
export async function checkJustifications(justified: Justified, input: JsonValue, context: Pick<TopicContext, "broker" | "task" | "progress">): Promise<string[]> {
    const constants = justified.constants(input);
    const isSafety = safetyTest(justified);
    const safety = constants.filter((c) => isSafety(c.constant));
    let facts: SignedFact[] = [];
    if (safety.length) {
        const served = await context.broker.call("library", "facts", {});
        facts = served.ok ? (((served.output as { facts?: SignedFact[] }).facts ?? []) as SignedFact[]) : [];
    }
    const measured = justified.measured ? justified.measured(context.task) : Object.keys(context.task.observations ?? {}).length > 0 || (context.task.data ?? []).length > 0;
    return [...safetyProblems(safety, facts, justified.boundBy), ...justificationProblems(constants.filter((c) => !isSafety(c.constant)), givenOf(justified, input), context.progress.sources, { measured, envelope: justified.envelope })];
}

/** The numbers of an object, by path (`prefix.key`), the nested ones too; what a spec or a set of variables sets. */
export function numbersOf(value: unknown, prefix: string): Constant[] {
    const out: Constant[] = [];
    const walk = (v: unknown, at: string) => {
        if (typeof v === "number" && Number.isFinite(v)) out.push({ constant: at, value: v });
        else if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k);
    };
    walk(value, prefix);
    return out;
}

/** The justifications of a set of constants, each from the first rule whose pattern names it; a constant no rule names is said assumed, with that said. For the scripts, which justify as a model must. */
export function justificationsFor(constants: Constant[], rules: Array<[RegExp, Omit<Justification, "constant">]>): Justification[] {
    return constants.map((c) => {
        const rule = rules.find(([r]) => r.test(c.constant))?.[1] ?? { source: "assumed" as const, reference: "no rule of the script", reason: "set by the script without a stated source" };
        return { constant: c.constant, ...rule };
    });
}
