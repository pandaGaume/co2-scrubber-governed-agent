/**
 * The procedure's guard (docs/mise-en-service.fr.md, sections 8 and 15):
 * code, no model, read before a single command leaves. The same function
 * answers twice: the factory's builder guard runs it on every submission
 * (a refusal comes back to the builder with its reasons), and the station
 * runs it again on what the factory proposes, with an occupancy it reads
 * itself (a proposal that passed once is not trusted to pass twice).
 *
 * Since 2026-09-28 it holds no rule and no number of its own: the rules are
 * the signed card's (`<rulesDocument>.rules.json`, read through the library
 * with the card's signature), the envelope is the card's facts, the format
 * is the spec's (specs/procedure/format.json). Rules nobody signed judge
 * nothing: every proposal is refused until a person signs them. The
 * evaluator is `harness/core/rules.ts`; each refusal carries the kind its
 * rule gives (floor, start, bounds, duration, abort, expected, diligence,
 * monitoring, shape), so the scorecard and Mother can tell them apart.
 */
import { readFileSync } from "node:fs";
import { fromRoot } from "../../../lib/paths.js";
import { constantsOf as constantsByFormat, evaluateRules, factsBounding, matches, moduleOfPlace, unsignedRules, valueAt, type PeopleRead, type ProposalFormat, type RuleProblem, type RulesDocument } from "../../core/rules.js";
import { safetyProblems as commonSafetyProblems, type SignedFact } from "../../core/justify.js";

/** The format of a procedure, as the spec gives it: how the factory reads one, what it asks, where it reads the people and the measurement. */
export interface ProcedureFormat extends ProposalFormat {
    title?: string;
    schema: string;
    /** What the factory says to its model (`harness/core/words.ts`), and its prompt. */
    words: string;
    prompt: string;
    rulesDocument: string;
    minutes: string;
    /** Where a proposal's id is, and the file an accepted one is written to (`{id}` filled). */
    id: string;
    file: string;
    method: string;
    quantities: string;
    device: string;
    place: string;
    watched: string;
    measured: string;
    presence: string;
    tools: string[];
    /** The reads the state carries, by the name of their field: the tool that answers each. `methods` lists the method cards, `card` reads one. */
    reads: Record<string, string> & { methods: string; card: string; presence: string };
    /** How a read is reshaped for the state, by field (`viewOf`). */
    views?: Record<string, import("../../core/words.js").View>;
    /** The reads a submission's requirements name (`<read>Read`), and those the plan needs (`method` is the card read). */
    requirements: string[];
    planRequires: string[];
    /** Who is told of every check, and by which tool. */
    notify?: { slot: string; tool: string };
    /** The scorecard: was `readBefore` read before the first submission, and was `asked` (a path) set on the first, or after a refusal of `kind`. */
    scorecard?: { readBefore: string; asked: { name: string; path: string; kind: string } };
    /** The factory's conduct, step by step: its stages and its conduct refusals, as an executable graph (`harness/core/conduct.ts`). */
    playbook: string;
    /** The observation that carries what stopped the last test of the same work, when one was aborted (2026-09-29). */
    history?: string;
    /** The analysis a stopped test calls for before any new proposal: its schema, and the workshop file it is kept in. */
    analysis?: { schema: string; file: string };
    /** Show the factory, before its first submission, each safety constant and the signed facts its rules bound it by (a fork may turn it off to compare). */
    safetyBounds?: boolean;
}

export const PROCEDURE_FORMAT_FILE = "specs/procedure/format.json";
export const FORMAT: ProcedureFormat = JSON.parse(readFileSync(fromRoot(...PROCEDURE_FORMAT_FILE.split("/")), "utf8")) as ProcedureFormat;

export type ProblemKind = string;
export type ProcedureProblem = RuleProblem;
export type PresenceRead = PeopleRead;
/** What the task measured, by name, and where from: the rules compare with it. */
export type MeasuredStart = Record<string, unknown> & { source?: string; at?: string };

export interface ProcedureCheck {
    ok: boolean;
    problems: ProcedureProblem[];
    /** The module under test and who was read in it: what the station relays to the commander. */
    module: string;
    occupants: Array<{ id: string; callsign?: string }>;
}

/** A procedure checked against a signed document's rules and facts; rules nobody signed judge nothing. */
export function checkProcedure(input: unknown, presence: PresenceRead | null, rules: RulesDocument | null, facts: SignedFact[], measured: MeasuredStart | null = null, format: ProcedureFormat = FORMAT): ProcedureCheck {
    const problems: ProcedureProblem[] = [];
    if (!rules) problems.push({ kind: "rules", message: `the guard's rules (${format.rulesDocument}) could not be read: no proposal is judged without them` });
    else {
        const unsigned = unsignedRules(rules);
        if (unsigned) problems.push(unsigned);
        else problems.push(...evaluateRules(input, rules, { format, facts, measured, people: presence }));
    }
    const place = valueAt(input, format.place, format.keys);
    const module = typeof place === "string" ? moduleOfPlace(place) : "";
    const occupants = presence?.modules.find((m) => m.module === module)?.subjects ?? [];
    return { ok: problems.length === 0, problems, module, occupants };
}

/** The constants a procedure sets, by path, with their values, as the format declares them. */
export const constantsOf = (p: unknown, format: ProcedureFormat = FORMAT): Array<{ constant: string; value: number }> => constantsByFormat(p, format);

/** The safety constants of a document's rules: those a person must justify by a signed fact. */
export const safetyOf = (rules: RulesDocument | null) => (constant: string): boolean => Boolean(rules?.safety.some((p) => matches(constant, p)));

/** The facts the rules cite, by id and value: the guard's envelope, which a justification may cite. */
export function envelopeOf(rules: RulesDocument | null, facts: SignedFact[]): Record<string, number> {
    const ids = new Set<string>();
    for (const r of rules?.rules ?? []) {
        if ("compare" in r) {
            if (r.compare.fact) ids.add(r.compare.fact);
            if (r.compare.plusFact) ids.add(r.compare.plusFact);
        }
    }
    return Object.fromEntries(facts.filter((f) => ids.has(f.id)).map((f) => [f.id, f.value]));
}

/** The safety constants' problems, by the rule every factory shares (`justify.ts`): a fact of a signed library document, respected. */
export function safetyProblems(p: { justifications?: unknown }, facts: SignedFact[], rules: RulesDocument | null, format: ProcedureFormat = FORMAT): string[] {
    const isSafety = safetyOf(rules);
    return commonSafetyProblems(constantsOf(p, format).filter((x) => isSafety(x.constant)), Array.isArray(p.justifications) ? p.justifications : [], facts, (constant) => factsBounding(rules, constant));
}

/** The rules and the facts, through the library: what the factory's guard and the station both judge by. */
export async function rulesAndFacts(call: (slot: string, tool: string, args: Record<string, unknown>) => Promise<{ ok: boolean; output?: unknown }>, format: ProcedureFormat = FORMAT): Promise<{ rules: RulesDocument | null; facts: SignedFact[] }> {
    const r = await call("library", "rules", { id: format.rulesDocument });
    const f = await call("library", "facts", {});
    const rules = r.ok ? (r.output as RulesDocument) : null;
    const facts = f.ok ? (((f.output as { facts?: SignedFact[] }).facts ?? []) as SignedFact[]) : [];
    return { rules, facts };
}

/** The problems as one line each, the way a builder reads them at its next step. */
export const problemLines = (check: Pick<ProcedureCheck, "problems">): string[] => check.problems.map((x) => `${x.kind}: ${x.message}`);

export type { SignedFact } from "../../core/justify.js";
