/**
 * Every constant a factory sets is justified, the same way in every factory
 * (2026-09-28; first written for the procedure, the day a test's CO2 limits
 * came from an Earth baseline nobody gave). A justification says, for one
 * constant, its value, its source and why, so a reviewer can challenge it
 * against a written procedure or the literature:
 *
 *   library    a document or a fact of the library read in this task
 *   web        a page a web search returned in this task
 *   measured   what the task observed (a sensor, the telemetry, the presence)
 *   envelope   a bound of the guard's own envelope, by name
 *   derived    a calculation from other constants, its formula as reference
 *   assumed    an assumption, said as such
 *
 * A safety constant (what bounds the air people breathe, a speed, an
 * exposure, an abort, a watch) is justified only by a fact of a library
 * document a person signed, unchanged since, and respects the fact's safe
 * side; a value a model found, computed or assumed is not a safety limit.
 *
 * A topic says where its constants are (`TopicDefinition.justified`): which
 * call carries them, how to read them, which are safety constants. The
 * constructor's guard checks them (`builder-guard.ts`), or the topic's own
 * guard when it reports them with its other checks (the procedure's, to
 * Mother). What was read is noted on every call (`noteSources`), whoever
 * decided the step.
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

export interface Justification {
    /** The constant's path in what was sent (limits.co2MaxPpm, variables.g, fit.V_lab, fullScale.current). */
    constant: string;
    value: ConstantValue;
    source: JustificationSource;
    /** The document or fact id, the URL, the envelope's bound, the formula; what the assumption rests on. */
    reference: string;
    reason: string;
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
    /** The safety constants, by path: justified by a signed fact only (a pattern, or what a signed document's rules name). */
    safety?: RegExp | ((constant: string) => boolean);
    /** The guard's envelope, when a constant may cite one of its bounds. */
    envelope?: Record<string, unknown>;
    /** The facts the signed rules bound a safety constant by, by id (`rules.ts`, factsBounding): the ones its justification cites. */
    boundBy?(constant: string): string[];
    /** Does the task give a measurement to cite; any observation or data by default. */
    measured?(task: TaskFile["task"]): boolean;
    /** The topic's own guard checks them and reports them with its other checks; the constructor's guard leaves them to it. */
    inTopicGuard?: boolean;
    /** The whole a call stands for, when it carries only a part (a revision applied to a draft); the call's input by default. */
    whole?(capabilityId: string, input: JsonValue, progress: TopicContext["progress"]): JsonValue | null;
}

/**
 * What a refusal for justifications leaves the builder to do, from the call refused and what the topic declares
 * (2026-09-28: the same refusal text, read nine times, changed nothing; what is missing is now put in the context,
 * named as the guard names it, with its value, and the prompt says it differently at every repetition).
 */
export interface JustificationHelp {
    capability: string;
    /** How many refusals in a row of this capability left constants unjustified. */
    times: number;
    /** The constants set with no justification found, by path, with their values. */
    missing: Constant[];
    /** The names the justifications gave that are no constant the call set. */
    unmatched: string[];
    /**
     * The safety constants justified by no fact the signed rules bound them by, or by the wrong one, with the unit they are
     * in and the facts to cite (2026-09-28: a speed in percent justified by a flow in m3/min nineteen times in a row; the
     * guard's refusal alone did not turn the model, the next prompt says the unit and the fact).
     */
    misjustified?: Misjustified[];
}

/** A safety constant whose justification is not a fact the signed rules bound it by: the unit it is in, the facts to cite, the fact it cited. */
export interface Misjustified {
    constant: string;
    value: ConstantValue;
    /** The unit the constant is in: the one of the facts the rules compare it with. */
    unit: string;
    expected: Array<{ id: string; value: number; unit: string; side: string }>;
    cited: { id: string; value: number; unit: string } | null;
}

export function justificationHelp(justified: Justified, input: JsonValue): Pick<JustificationHelp, "missing" | "unmatched"> {
    const constants = justified.constants(input);
    const given = asJustifications(givenOf(justified, input));
    const paths = constants.map((c) => c.constant);
    const missing = constants.filter((c) => !justificationOf(given, c.constant, paths));
    const matches = (name: string) => paths.filter((p) => p === name || p.endsWith(`.${name}`)).length === 1;
    const unmatched = [...new Set(given.map((j) => String(j.constant ?? "")).filter((name) => name && !matches(name)))];
    return { missing, unmatched };
}

/** The brief's words for it: said at the top of the brief, differently at each repetition. */
export function justificationNote(help: JustificationHelp | null | undefined): string {
    const wrong = help?.misjustified ?? [];
    if (!help || (!help.missing.length && !wrong.length)) return "";
    const again = help.times > 1 ? ` This is refusal number ${help.times} for the same reason: sending the same justifications again gets it again.` : "";
    const parts: string[] = [];
    if (help.missing.length) {
        const list = help.missing.slice(0, 12).map((c) => `${c.constant} = ${shown(c.value)}`).join(", ") + (help.missing.length > 12 ? `, and ${help.missing.length - 12} more` : "");
        const names = help.unmatched.length ? ` Your justifications named ${help.unmatched.slice(0, 12).join(", ")}, which is no constant you set: a justification names its constant by the path listed here, exactly.` : "";
        parts.push(`${help.missing.length} constant(s) you set have none under their path: ${list}.${names} The state lists them under justify.skeleton, path and value filled: give each its source, reference and reason.`);
    }
    if (wrong.length) {
        // Said with the unit: the rules compare the constant with a fact in that unit, so a fact in another unit (another quantity) never justifies it.
        const list = wrong
            .slice(0, 12)
            .map((m) => `${m.constant} = ${shown(m.value)} is in ${m.unit}: cite ${m.expected.map((e) => `${e.id} (${e.value} ${e.unit}, ${e.side})`).join(" or ")}${m.cited ? `, not ${m.cited.id} (${m.cited.value} ${m.cited.unit}${m.cited.unit !== m.unit ? `: another unit, another quantity` : ""})` : ""}`)
            .join("; ");
        parts.push(`${wrong.length} safety constant(s) must cite the fact of the signed rules that bounds them, a fact in their own unit: ${list}. The state's justify.skeleton has them with source "library" and the reference to cite already filled.`);
    }
    return `Your last ${help.capability} was refused for its justifications. ${parts.join(" ")} Send again with these.${again} `;
}

/** The `justifications` field of a call's input, as a schema a tool adds to its own. */
export const JUSTIFICATIONS_SCHEMA = {
    type: "array",
    description:
        "One per constant you set: its path (constant), its value (a number, or [min, max] for bounds), its source (library: a document or fact id read in this task; web: a URL a search returned; measured: what the task observed; envelope: a bound of the guard's envelope; derived: the formula; assumed: what the assumption rests on), the reference, and why.",
    items: {
        type: "object",
        properties: {
            constant: { type: "string" },
            value: { anyOf: [{ type: "number" }, { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }] },
            source: { type: "string", enum: [...JUSTIFICATION_SOURCES] },
            // The contract said, not tightened (2026-09-29, the baseline: 17 references naming two facts, a rule said nowhere before the refusal): what the guard accepts is unchanged.
            reference: { type: "string", description: "Exactly one: for library, one id as library.facts lists it (a safety constant's is the one signed fact that bounds it), nothing joined to it; for web, one URL; for derived, the formula; else what was observed or assumed. The facts that support it and the engineering rationale go in reason." },
            reason: { type: "string", description: "Why, in a few words (a dozen at most), with any fact that supports it: the reviewer reads the source, not an essay." },
        },
        required: ["constant", "value", "source", "reference", "reason"],
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

const same = (a: unknown, b: ConstantValue): boolean =>
    Array.isArray(b) ? Array.isArray(a) && a.length === 2 && a[0] === b[0] && a[1] === b[1] : typeof a === "number" && a === b;
const shown = (v: unknown): string => (Array.isArray(v) ? `[${v.join(", ")}]` : String(v));
const asJustifications = (given: unknown[]): Array<Partial<Justification>> => given.filter((j): j is Partial<Justification> => Boolean(j) && typeof j === "object");

/** The problems of the constants that are not safety constants: none unjustified, each value the one set, each source one this task can cite. */
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
        if (!same(j.value, c.value)) problems.push(`${c.constant}: the justification says ${shown(j.value)}, what you sent sets ${shown(c.value)}`);
        if (!String(j.reason ?? "").trim()) problems.push(`${c.constant}: the justification gives no reason`);
        const ref = String(j.reference ?? "").trim();
        switch (j.source) {
            case "library":
                if (!read.library.includes(ref)) problems.push(`${c.constant}: "${ref}" is not a library document or fact read in this task (${read.library.slice(0, 12).join(", ") || "none read"}): read it, or cite another source`);
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

/** The fact a reference names: its id exactly, or the one fact id the reference contains (a model may cite the fact as the state shows it). */
export function factOf(facts: SignedFact[], reference: string): SignedFact | undefined {
    const exact = facts.find((f) => f.id === reference);
    if (exact) return exact;
    const named = factsNamedIn(facts, reference);
    return named.length === 1 ? named[0] : undefined;
}

/** The facts of the library a reference names by their ids, whatever text surrounds them. */
export function factsNamedIn(facts: SignedFact[], reference: string): SignedFact[] {
    return facts.filter((f) => new RegExp(`(^|[^A-Za-z0-9_.])${f.id.replace(/\./g, "\\.")}($|[^A-Za-z0-9_])`).test(reference));
}

/** A fact's safe side, in words. */
const sideOf = (fact: SignedFact): string => (fact.bound === "upper" ? "at or below it" : fact.bound === "lower" ? "at or above it" : "equal to it");

/**
 * The problems of the safety constants: each cites a fact of a signed library document, unchanged since, and respects its
 * safe side. When the signed rules say which facts bound a constant (`boundBy`), a refusal names them, and a fact they do
 * not bound it by is refused as such (2026-09-28: a speed justified by the scrubber's flow in m3/min was refused nineteen
 * times as "100 is not 1 m3/min", and the model never learnt that the rules bound a speed by the card's floor).
 */
export function safetyProblems(constants: Constant[], given: unknown[], facts: SignedFact[], boundBy?: (constant: string) => string[]): string[] {
    return safetyReview(constants, given, facts, boundBy).problems;
}

/** The problems of the safety constants, and those justified by no fact the rules bound them by, structured for the next prompt. */
export function safetyReview(constants: Constant[], given: unknown[], facts: SignedFact[], boundBy?: (constant: string) => string[]): { problems: string[]; misjustified: Misjustified[] } {
    const problems: string[] = [];
    const misjustified: Misjustified[] = [];
    const list = asJustifications(given);
    const signing = "a person reviews it and signs it on the library page of the control room (library.html), or: npm run library:sign -- <document> \"<name>\"";
    const paths = constants.map((x) => x.constant);
    for (const c of constants) {
        const bounding = (boundBy?.(c.constant) ?? []).map((id) => facts.find((f) => f.id === id)).filter((f): f is SignedFact => f !== undefined);
        const cite = bounding.length ? `; the signed rules bound it by ${bounding.map((f) => `${f.id} = ${f.value} ${f.unit} (${sideOf(f)})`).join(" and ")}: cite ${bounding.length > 1 ? "one of them" : "it"} (source "library", reference "${bounding[0].id}")` : "";
        const j = justificationOf(list, c.constant, paths);
        // What the next prompt says of this constant when its justification is not a fact the rules bound it by: its unit, the facts to cite.
        const wrong = (cited: SignedFact | null) => {
            if (bounding.length) misjustified.push({ constant: c.constant, value: c.value, unit: bounding[0].unit, expected: bounding.map((f) => ({ id: f.id, value: f.value, unit: f.unit, side: sideOf(f) })), cited: cited ? { id: cited.id, value: cited.value, unit: cited.unit } : null });
        };
        if (!j) {
            wrong(null);
            problems.push(`${c.constant} = ${shown(c.value)} is a safety constant with no justification ${named(c.constant)}: cite the fact of a signed library document it respects (source "library", the fact's id as reference)${cite}`);
            continue;
        }
        if (j.source !== "library") {
            wrong(null);
            problems.push(`${c.constant} = ${shown(c.value)} is a safety constant: it is justified by a fact of a signed library document, not by ${j.source === "web" ? "a web page" : j.source === "assumed" ? "an assumption" : j.source === "derived" ? "a calculation" : j.source === "measured" ? "a measurement" : `"${String(j.source)}"`} (${String(j.reference)})${cite}`);
            continue;
        }
        const fact = factOf(facts, String(j.reference));
        if (!fact) {
            wrong(null);
            // Refused the same way whatever the cause, and said by what it is (2026-09-29, the baseline: references naming two facts of
            // the library were told they were "no fact of the library").
            const named = factsNamedIn(facts, String(j.reference));
            problems.push(
                named.length > 1
                    ? `${c.constant}: "${String(j.reference)}" names ${named.length} facts of the library (${named.map((f) => f.id).join(", ")}), not one (INVALID_REFERENCE_CARDINALITY): a reference is exactly one signed library fact, by its id; the facts that support it and the engineering rationale go in reason${cite}`
                    : `${c.constant}: "${String(j.reference)}" is not a fact of the library (a safety constant cites a fact by its id, as library.facts lists them)${cite}`,
            );
            continue;
        }
        // A fact the rules do not bound this constant by is not its justification, whatever its value (another quantity, another unit).
        if (bounding.length && !bounding.some((f) => f.id === fact.id)) {
            wrong(fact);
            problems.push(`${c.constant} = ${shown(c.value)} cites ${fact.id} (${fact.value} ${fact.unit}), which the signed rules do not bound it by${cite}`);
            continue;
        }
        // A signed fact first (2026-09-28: told to end with task.fail, a model gave up while the signed card held the fact it needed).
        if (!fact.signed) problems.push(`${c.constant}: the fact ${fact.id} is in "${fact.source}", which no person has signed as valid: cite instead a fact of a signed document that bounds this constant (library.facts says which are signed); only if no signed document has one, end with task.fail naming the document a person must sign (${signing})`);
        else if (!fact.signed.valid) problems.push(`${c.constant}: "${fact.source}" was signed by ${fact.signed.by} and has changed since; ${signing}`);
        const values = Array.isArray(c.value) ? c.value : [c.value];
        const ok = values.every((v) => (fact.bound === "upper" ? v <= fact.value : fact.bound === "lower" ? v >= fact.value : Math.abs(v - fact.value) <= 1e-9 * Math.max(1, Math.abs(fact.value))));
        if (!ok) problems.push(`${c.constant} = ${shown(c.value)} does not respect ${fact.id} = ${fact.value} ${fact.unit} (${sideOf(fact)})${bounding.length ? "" : cite}`);
    }
    return { problems, misjustified };
}

/** The given justifications of a call: its `justifications` field, unless the topic reads them elsewhere. */
export const givenOf = (justified: Justified, input: JsonValue): unknown[] => {
    const given = justified.given ? justified.given(input) : (input as { justifications?: unknown } | null)?.justifications;
    return Array.isArray(given) ? given : [];
};

/** Every problem of a call's constants, safety ones included; the library's facts are read only when a safety constant is set. */
export async function checkJustifications(justified: Justified, input: JsonValue, context: Pick<TopicContext, "broker" | "task" | "progress">): Promise<string[]> {
    const constants = justified.constants(input);
    const given = givenOf(justified, input);
    const isSafety = (c: Constant) => (typeof justified.safety === "function" ? justified.safety(c.constant) : Boolean(justified.safety?.test(c.constant)));
    const safety = constants.filter(isSafety);
    let facts: SignedFact[] = [];
    if (safety.length) {
        const served = await context.broker.call("library", "facts", {});
        facts = served.ok ? (((served.output as { facts?: SignedFact[] }).facts ?? []) as SignedFact[]) : [];
    }
    const measured = justified.measured ? justified.measured(context.task) : Object.keys(context.task.observations ?? {}).length > 0 || (context.task.data ?? []).length > 0;
    const review = safetyReview(safety, given, facts, justified.boundBy);
    // Handed to the runner, which puts it in the next prompt with the refusal (the call is refused: nothing executes, the state may move).
    if (review.misjustified.length) context.progress.misjustified = review.misjustified;
    return [...review.problems, ...justificationProblems(constants.filter((c) => !isSafety(c)), given, context.progress.sources, { measured, envelope: justified.envelope })];
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
export function justificationsFor(constants: Constant[], rules: Array<[RegExp, Omit<Justification, "constant" | "value">]>): Justification[] {
    return constants.map((c) => {
        const rule = rules.find(([r]) => r.test(c.constant))?.[1] ?? { source: "assumed" as const, reference: "no rule of the script", reason: "set by the script without a stated source" };
        return { constant: c.constant, value: c.value, ...rule };
    });
}
