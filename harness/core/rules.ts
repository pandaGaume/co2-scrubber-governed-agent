/**
 * The guard's rules, as data (2026-09-28: "zero métier dans le harness").
 * A document of the library holds the rules a proposal is checked against,
 * beside the facts they cite (`<id>.rules.json`), and a person signs the
 * whole: the text, the facts, the rules. This module evaluates them; it knows
 * no quantity, no device, no domain word. What it knows is how to read a
 * proposal by path, compare a value, and require what a rule requires.
 *
 * A proposal is read by path: `a.b.c`; a list is entered by its key when the
 * format declares one (`steps` by `n`, so `steps.1.minutes`), by its index
 * otherwise; `*` stands for one segment in a pattern, `$last` for the last
 * element of the list before it (`steps.$last.speedPercent`).
 *
 * The forms of a rule (each carries an id, a kind the refusal is filed
 * under, and what it says, in the document's words):
 *
 *   compare    every value at `subject` (or the `sum` of them) against a
 *              value, a fact, another constant, or a measurement (plus a
 *              fact): `op` is one of >=, >, <=, <, =
 *   present    every path named holds a number
 *   fields     every element of a list has the fields named
 *   nonEmpty   a field holds at least one non-empty text
 *   match      a field matches a pattern
 *   require    a list holds an element with each key named
 *   readable   every element of a list has a key the executor can read
 *   watch      where people are, as read: what must watch them
 *
 * A comparison whose subject is absent is not judged (`present` says it is
 * missing); a comparison with a measurement is judged only when there is one.
 */
import type { SignedFact } from "./justify.js";

/** How a proposal is read: the key of each list, the constants by pattern, the list of steps, where its place and its measurement are. */
export interface ProposalFormat {
    keys: Record<string, string>;
    constants: string[];
    /** The list whose elements are the steps (a problem about one names it). */
    steps?: string;
    /** The field that names the place under test, an ISA-95 path whose last segment is the module. */
    place?: string;
    /** What the executor can read, by the key of a stop condition, and how. */
    readers?: Record<string, string>;
}

export type Op = ">=" | ">" | "<=" | "<" | "=";

interface Base {
    id: string;
    kind: string;
    says?: string;
}
export type Rule =
    | (Base & { compare: { subject?: string; sum?: string; op: Op; value?: number; fact?: string; constant?: string; measured?: string; plusFact?: string } })
    | (Base & { present: string[] })
    | (Base & { fields: { list: string; fields: string[] } })
    | (Base & { nonEmpty: string })
    | (Base & { match: { path: string; pattern: string } })
    | (Base & { require: { list: string; key: string; values: string[] } })
    | (Base & { readable: { list: string; key: string } })
    | (Base & { watch: { place: string; subjects: string; declared?: string; stop: { list: string; key: string; value: string; source?: string }; unread: { kind: string; says?: string }; blocked?: { flag: string; kind?: string; says: string } } });

/** A document's rules, as the library serves them, with the document's signature as it stands. */
export interface RulesDocument {
    document: string;
    /** The constants a person must justify by a signed fact: patterns of paths. */
    safety: string[];
    rules: Rule[];
    signed?: { by: string; at: string; valid: boolean } | null;
}

/** Who is where, as read in this task (a presence read), or nothing. */
export interface PeopleRead {
    /** Each subject as the presence read gives it; a flag the rules may name (`blocked`), such as a raised alarm, travels with it. */
    modules: Array<{ module: string; occupants: number; subjects: Array<{ id: string; callsign?: string; [flag: string]: unknown }> }>;
    at: string;
}

export interface RuleProblem {
    kind: string;
    message: string;
    /** The step it is about, by the steps' key, when it is about one. */
    step?: number;
    /** The path of the proposal it is about, what is expected there, what was sent (`problems.ts`: what the next prompt says of it). */
    path?: string;
    expected?: string;
    got?: string;
}

export interface RuleContext {
    format: ProposalFormat;
    facts: SignedFact[];
    /** What the task measured, by name (`co2Ppm`), and where from. */
    measured: Record<string, unknown> | null;
    people: PeopleRead | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Every leaf of a value, by path; a list entered by its key when the format declares one. */
export function leavesOf(value: unknown, keys: Record<string, string>, prefix = ""): Array<{ path: string; value: unknown }> {
    const out: Array<{ path: string; value: unknown }> = [];
    const walk = (v: unknown, at: string, name: string) => {
        if (Array.isArray(v)) {
            const key = keys[name];
            v.forEach((item, i) => walk(item, `${at}.${key && isObject(item) && (typeof item[key] === "string" || typeof item[key] === "number") ? String(item[key]) : String(i)}`, name));
        } else if (isObject(v)) {
            for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k, k);
        } else out.push({ path: at, value: v });
    };
    walk(value, prefix, prefix);
    return out;
}

/** Does a path match a pattern, segment by segment, `*` standing for one. */
export const matches = (path: string, pattern: string): boolean => {
    const a = path.split(".");
    const b = pattern.split(".");
    return a.length === b.length && b.every((s, i) => s === "*" || s === a[i]);
};

/** The constants a proposal sets, by path, with their values, in the order it sets them. */
export function constantsOf(value: unknown, format: ProposalFormat): Array<{ constant: string; value: number }> {
    return leavesOf(value, format.keys)
        .filter((l) => num(l.value) && format.constants.some((p) => matches(l.path, p)))
        .map((l) => ({ constant: l.path, value: l.value as number }));
}

/** The value at a path, whatever it holds. */
export function valueAt(value: unknown, path: string, keys: Record<string, string>): unknown {
    let at: unknown = value;
    let name = "";
    for (const seg of path.split(".")) {
        if (Array.isArray(at)) {
            const key = keys[name];
            at = key ? at.find((x) => isObject(x) && String(x[key]) === seg) : at[Number(seg)];
        } else if (isObject(at)) {
            at = at[seg];
            name = seg;
        } else return undefined;
    }
    return at;
}

/** Sets the value at a path, in the same path language as valueAt (a list's element by its key); false when the path does not lead anywhere. */
export function setAt(value: unknown, path: string, keys: Record<string, string>, v: unknown): boolean {
    const segs = path.split(".");
    let at: unknown = value;
    let name = "";
    for (let i = 0; i < segs.length; i++) {
        const seg = segs[i]!;
        const last = i === segs.length - 1;
        if (Array.isArray(at)) {
            const key = keys[name];
            const index = key ? at.findIndex((x) => isObject(x) && String(x[key]) === seg) : Number(seg);
            if (index < 0 || index >= at.length || !Number.isInteger(index)) return false;
            if (last) at[index] = v;
            else at = at[index];
        } else if (isObject(at)) {
            if (last) at[seg] = v;
            else {
                if (at[seg] === undefined) at[seg] = {};
                at = at[seg];
                name = seg;
            }
        } else return false;
    }
    return true;
}

const OP_WORDS: Record<Op, string> = { ">=": "at least", ">": "above", "<=": "at most", "<": "below", "=": "equal to" };
const holds = (a: number, op: Op, b: number): boolean => (op === "=" ? Math.abs(a - b) < 1e-9 : op === ">=" ? a >= b : op === ">" ? a > b : op === "<=" ? a <= b : a < b);

/** A pattern with `$last` resolved: the key (or index) of the last element of the list it follows; null when that list is empty or absent. */
function resolveLast(input: unknown, pattern: string, keys: Record<string, string>): string | null {
    const at = pattern.split(".").indexOf("$last");
    if (at < 0) return pattern;
    const segments = pattern.split(".");
    const listPath = segments.slice(0, at).join(".");
    const list = valueAt(input, listPath, keys);
    if (!Array.isArray(list) || list.length === 0) return null;
    const key = keys[segments[at - 1]];
    const last = list[list.length - 1];
    const name = key && isObject(last) && last[key] !== undefined ? String(last[key]) : String(list.length - 1);
    return [...segments.slice(0, at), name, ...segments.slice(at + 1)].join(".");
}
const shown = (n: number): string => String(Number(n.toPrecision(6)));

/** The module a place names: its last segment. */
export const moduleOfPlace = (place: string): string => place.replace(/\/+$/, "").split("/").pop() ?? "";

/** Every problem of a proposal against a document's rules. */
export function evaluateRules(input: unknown, doc: RulesDocument, ctx: RuleContext): RuleProblem[] {
    const problems: RuleProblem[] = [];
    const { keys } = ctx.format;
    const leaves = leavesOf(input, keys);
    const stepOf = (path: string): number | undefined => {
        const [list, key] = path.split(".");
        return ctx.format.steps && list === ctx.format.steps && num(Number(key)) ? Number(key) : undefined;
    };
    const add = (rule: Base, message: string, path?: string, kind = rule.kind, at: { expected?: string; got?: string } = {}) => {
        const step = path ? stepOf(path) : undefined;
        problems.push({ kind, message, ...(step === undefined ? {} : { step }), ...(path ? { path } : {}), ...(at.expected ? { expected: at.expected } : {}), ...(at.got !== undefined ? { got: at.got } : {}) });
    };
    const says = (rule: Base) => (rule.says ? `: ${rule.says}` : "");
    const factOf = (id: string) => ctx.facts.find((f) => f.id === id);
    for (const rule of doc.rules) {
        if ("compare" in rule) {
            const c = rule.compare;
            const subjects = c.sum ? (() => {
                const values = leaves.filter((l) => matches(l.path, c.sum!) && num(l.value)).map((l) => l.value as number);
                return values.length ? [{ path: `the sum of ${c.sum}`, value: values.reduce((a, b) => a + b, 0) }] : [];
            })() : (() => {
                const subject = resolveLast(input, c.subject ?? "", keys);
                return subject === null ? [] : leaves.filter((l) => matches(l.path, subject) && num(l.value)).map((l) => ({ path: l.path, value: l.value as number }));
            })();
            let ref: number | undefined;
            let refText = "";
            if (num(c.value)) {
                ref = c.value;
                refText = shown(c.value);
            } else if (c.fact) {
                const f = factOf(c.fact);
                if (!f) {
                    add(rule, `rule ${rule.id} cites the fact ${c.fact}, which the library does not hold`, undefined, "shape");
                    continue;
                }
                ref = f.value;
                refText = `${f.id} = ${shown(f.value)} ${f.unit}`;
            } else if (c.constant) {
                const v = valueAt(input, c.constant, keys);
                if (!num(v)) continue;
                ref = v;
                refText = `${c.constant} = ${shown(v)}`;
            } else if (c.measured) {
                const m = ctx.measured?.[c.measured];
                if (!num(m)) continue;
                const plus = c.plusFact ? factOf(c.plusFact) : undefined;
                if (c.plusFact && !plus) {
                    add(rule, `rule ${rule.id} cites the fact ${c.plusFact}, which the library does not hold`, undefined, "shape");
                    continue;
                }
                const from = typeof ctx.measured?.source === "string" ? ` (${ctx.measured.source})` : "";
                ref = m + (plus?.value ?? 0);
                refText = `${c.measured} measured now, ${shown(m)}${from}${plus ? `, plus ${plus.id} = ${shown(plus.value)} ${plus.unit}` : ""}`;
            }
            if (ref === undefined) continue;
            for (const s of subjects) if (!holds(s.value, c.op, ref)) add(rule, `${s.path} = ${shown(s.value)} is not ${OP_WORDS[c.op]} ${refText}${says(rule)}`, c.sum ? undefined : s.path, rule.kind, { expected: `${OP_WORDS[c.op]} ${refText}`, got: shown(s.value) });
        } else if ("present" in rule) {
            for (const p of rule.present) if (!leaves.some((l) => matches(l.path, p) && num(l.value))) add(rule, `${p} is missing${says(rule)}`, p, rule.kind, { expected: "a number" });
        } else if ("fields" in rule) {
            const list = valueAt(input, rule.fields.list, keys);
            const items = Array.isArray(list) ? list : [];
            if (!items.length) add(rule, `${rule.fields.list} is empty${says(rule)}`);
            const key = keys[rule.fields.list];
            items.forEach((item, i) => {
                const name = key && isObject(item) ? String(item[key]) : String(i);
                for (const f of rule.fields.fields) if (!isObject(item) || item[f] === undefined || item[f] === null) add(rule, `${rule.fields.list}.${name} has no ${f}${says(rule)}`, `${rule.fields.list}.${name}.${f}`, rule.kind, { expected: rule.says ?? `its ${f}` });
            });
        } else if ("nonEmpty" in rule) {
            const v = valueAt(input, rule.nonEmpty, keys);
            const texts = isObject(v) ? Object.values(v) : Array.isArray(v) ? v : [v];
            if (!texts.some((t) => typeof t === "string" && t.trim())) add(rule, `${rule.nonEmpty} says nothing${says(rule)}`, rule.nonEmpty, rule.kind, { expected: rule.says ?? "something said" });
        } else if ("match" in rule) {
            const v = valueAt(input, rule.match.path, keys);
            if (typeof v !== "string" || !new RegExp(rule.match.pattern).test(v)) add(rule, `${rule.match.path} "${String(v)}" does not match ${rule.match.pattern}${says(rule)}`, rule.match.path, rule.kind, { expected: rule.says ?? `a value matching ${rule.match.pattern}`, got: String(v) });
        } else if ("require" in rule) {
            const list = valueAt(input, rule.require.list, keys);
            const items = Array.isArray(list) ? list : [];
            for (const value of rule.require.values) if (!items.some((x) => isObject(x) && x[rule.require.key] === value)) add(rule, `no element of ${rule.require.list} with ${rule.require.key} "${value}"${ctx.format.readers?.[value] ? ` (${ctx.format.readers[value]})` : ""}${says(rule)}`, `${rule.require.list}.${value}`, rule.kind, { expected: `an element with ${rule.require.key} "${value}"` });
        } else if ("readable" in rule) {
            const readers = ctx.format.readers ?? {};
            const list = valueAt(input, rule.readable.list, keys);
            for (const x of Array.isArray(list) ? list : []) {
                const k = isObject(x) ? String(x[rule.readable.key]) : "";
                if (!readers[k]) add(rule, `${rule.readable.list} "${k}" cannot be read by the executor, which reads ${Object.keys(readers).join(", ")}${says(rule)}`, `${rule.readable.list}.${k}`, rule.kind, { expected: `${rule.readable.key} one of ${Object.keys(readers).join(", ")}`, got: k });
            }
        } else if ("watch" in rule) {
            const w = rule.watch;
            const place = valueAt(input, w.place, keys);
            const module = typeof place === "string" ? moduleOfPlace(place) : "";
            const read = ctx.people?.modules.find((m) => m.module === module);
            if (!ctx.people) {
                add(rule, `who is in ${module || "the place"} was not read in this task${w.unread.says ? `: ${w.unread.says}` : ""}`, undefined, w.unread.kind, { expected: w.unread.says ?? "the presence read first" });
                continue;
            }
            if (!read) {
                if (module) add(rule, `the presence read names no module "${module}"`, undefined, w.unread.kind);
                continue;
            }
            if (read.occupants <= 0) continue;
            // Someone the read flags (a critical health alarm raised and not cleared) is exposed by no test, whatever else the proposal says (2026-09-29).
            if (w.blocked) {
                const flagged = read.subjects.filter((s) => Boolean(s[w.blocked!.flag]));
                if (flagged.length) add(rule, `${module} holds ${flagged.map((s) => s.callsign ?? s.id).join(", ")} under ${w.blocked.flag}: ${w.blocked.says}`, w.place, w.blocked.kind ?? rule.kind, { expected: `no one under ${w.blocked.flag} in ${module}` });
            }
            const named = valueAt(input, w.subjects, keys);
            // An element that is not an id is shown as sent, never as "[object Object]" (2026-10-08: the model read its own ids refused).
            const watched = new Set(Array.isArray(named) ? named.map((x) => (typeof x === "string" ? x : JSON.stringify(x))) : []);
            const unwatched = read.subjects.filter((s) => !watched.has(s.id));
            const everyone = read.subjects.map((s) => `"${s.id}"`).join(", ");
            if (!Array.isArray(named) || !named.length) add(rule, `${module} is occupied (${read.occupants}) and ${w.subjects} names no one${says(rule)}`, w.subjects, rule.kind, { expected: `every occupant read: ${everyone}` });
            else if (unwatched.length) add(rule, `${module} is occupied and ${unwatched.map((s) => s.callsign ?? s.id).join(", ")} ${unwatched.length > 1 ? "are" : "is"} not in ${w.subjects}${says(rule)}`, w.subjects, rule.kind, { expected: `every occupant read: ${everyone}`, got: [...watched].join(", ") });
            const stops = valueAt(input, w.stop.list, keys);
            if (!(Array.isArray(stops) ? stops : []).some((x) => isObject(x) && (x[w.stop.key] === w.stop.value || (w.stop.source !== undefined && x.source === w.stop.source)))) add(rule, `${module} is occupied and no element of ${w.stop.list} has ${w.stop.key} "${w.stop.value}"${w.stop.source ? ` (source "${w.stop.source}")` : ""}${says(rule)}`, `${w.stop.list}.${w.stop.value}`, rule.kind, { expected: `an element with ${w.stop.key} "${w.stop.value}"${w.stop.source ? ` (source "${w.stop.source}")` : ""}` });
            if (w.declared) {
                const declared = valueAt(input, w.declared, keys);
                if (num(declared) && declared !== read.occupants) add(rule, `${w.declared} says ${declared}; ${read.occupants} were read in ${module}`, w.declared, rule.kind, { expected: String(read.occupants), got: String(declared) });
            }
        }
    }
    return problems;
}

/**
 * The facts a document's rules bound a constant by: those a comparison of that constant names, and, through a comparison
 * with another constant, the facts that one is bounded by (a maximum below an abort that sits under a ceiling is bounded by
 * the ceiling). What a justification of a safety constant cites (2026-09-28: a model cited the scrubber's flow for a speed
 * nineteen times, the guard answering that 100 is not 1 m3/min, never naming the floor the rules compare speeds with).
 */
export function factsBounding(doc: RulesDocument | null, constant: string, seen: Set<string> = new Set()): string[] {
    if (!doc || seen.has(constant)) return [];
    seen.add(constant);
    const out = new Set<string>();
    for (const rule of doc.rules) {
        if (!("compare" in rule) || !rule.compare.subject || !matches(constant, rule.compare.subject)) continue;
        if (rule.compare.fact) out.add(rule.compare.fact);
        if (rule.compare.constant) for (const f of factsBounding(doc, rule.compare.constant, seen)) out.add(f);
    }
    return [...out];
}

/** The problem a rules document unsigned, or changed since it was signed, makes of every proposal: nothing is judged by rules nobody signed. */
export function unsignedRules(doc: RulesDocument): RuleProblem | null {
    const signing = `a person reviews it and signs it on the library page of the control room (library.html), or: npm run library:sign -- ${doc.document} "<name>"`;
    if (!doc.signed) return { kind: "rules", message: `the guard's rules are in "${doc.document}", which no person has signed as valid: no proposal is judged by rules nobody signed; ${signing}` };
    if (!doc.signed.valid) return { kind: "rules", message: `the guard's rules are in "${doc.document}", which no person has signed as valid (signed by ${doc.signed.by}, changed since): no proposal is judged by rules nobody signed; ${signing}` };
    return null;
}
