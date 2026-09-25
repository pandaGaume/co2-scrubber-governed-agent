/**
 * The Contract Supervisor (2026-09-25, night): a small model that reads the
 * typed facts of a task, the deterministic contract report, the assumptions
 * and hypotheses of the request, and nothing else (never a transcript), and
 * answers a typed verdict: CONSISTENT, CONFLICT, MISSING, AMBIGUOUS or
 * UNSUPPORTED, with findings that name a fact, a producer, a reason and
 * the action required (REVISE, COMPLETE, INSPECT, REJECT).
 *
 *   producers' facts + deterministic report
 *               |
 *          SUPERVISOR      (a model, its fixed prompt, this guard)
 *               |
 *        typed verdict  -> the harness sends the producer named back into
 *                          its loop (the Observer's `review` hook, the
 *                          graph factory's `sourcesConsistent`)
 *
 * It corrects nothing itself: a producer revises, and the provenance stays
 * clean. The deterministic layer (`contracts.ts`) answers what is
 * objectively inconsistent; the supervisor answers what rules on numbers
 * cannot see (an assumption against a fact, a symbol for the wrong thing, a
 * claim without support). What the deterministic layer found is not the
 * supervisor's to overturn: a verdict that drops a computed conflict is
 * refused by the guard, and comes back to the model with the reason.
 *
 * Generic: nothing here knows a scrubber. The domain is in the facts.
 */
import type { JsonValue, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Provider } from "../lib/provider.js";
import { reviewContracts, taskFacts, type ContractReport, type Fact, type LibraryFact } from "../core/contracts.js";

export const SUPERVISOR_PROMPT = "harness/supervisor/prompt.md";
export const SUPERVISOR_CAPABILITY = "supervisor.verdict";

export type VerdictStatus = "CONSISTENT" | "CONFLICT" | "MISSING" | "AMBIGUOUS" | "UNSUPPORTED";
export type RequiredAction = "REVISE" | "COMPLETE" | "INSPECT" | "REJECT";
export const VERDICT_STATUSES: ReadonlyArray<VerdictStatus> = ["CONSISTENT", "CONFLICT", "MISSING", "AMBIGUOUS", "UNSUPPORTED"];
export const REQUIRED_ACTIONS: ReadonlyArray<RequiredAction> = ["REVISE", "COMPLETE", "INSPECT", "REJECT"];

export interface Finding {
    /** What kind of inconsistency: conflict, missing, assumption, symbol, unsupported, or the model's own word. */
    kind: string;
    /** A fact id of the input, `assumption:<n>` or `symbol:<s>`. */
    fact: string;
    /** The producer to act, among the input's. */
    producer: string;
    reason: string;
    required_action: RequiredAction;
}

export interface Verdict {
    status: VerdictStatus;
    findings: Finding[];
    note?: string;
}

export const VERDICT_SCHEMA = {
    type: "object",
    properties: {
        status: { type: "string", enum: [...VERDICT_STATUSES], description: "CONSISTENT (no finding), CONFLICT, MISSING, AMBIGUOUS or UNSUPPORTED: the worst of the findings." },
        findings: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    kind: { type: "string", description: "conflict, missing, assumption, symbol, unsupported" },
                    fact: { type: "string", description: "a fact id of the list, or assumption:<n>, or symbol:<s>" },
                    producer: { type: "string", description: "who acts, among the producers listed" },
                    reason: { type: "string", description: "one sentence, with the values or the sentence it rests on" },
                    required_action: { type: "string", enum: [...REQUIRED_ACTIONS] },
                },
                required: ["kind", "fact", "producer", "reason", "required_action"],
            },
            description: "Every conflict the deterministic layer listed, carried; plus what the rules on numbers cannot see. Empty when consistent.",
        },
        note: { type: "string", description: "One sentence at most, when something is worth saying beyond the findings." },
    },
    required: ["status", "findings"],
} as const;

/** What the supervisor reads: the facts, the deterministic report, and what a request says beside its facts. */
export interface SupervisionInput {
    facts: Fact[];
    report: ContractReport;
    assumptions?: string[];
    hypotheses?: string[];
    /** The symbols a request uses for its known constants, each with the fact id it cites (or "" when it cites none). */
    symbols?: Record<string, string>;
    /** The variables a downstream producer fitted, by fact id when they map to one: a known fact fitted downstream is a conflict. */
    fitted?: string[];
    /** The fact ids the task requires. */
    required?: string[];
}

export interface VerdictCheck {
    ok: boolean;
    problems: string[];
}

const list = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);

/** The guard of a verdict: its shape, its names among the input's, and the deterministic conflicts carried, never dropped. */
export function checkVerdict(input: unknown, context: SupervisionInput): VerdictCheck {
    const problems: string[] = [];
    const v = (input && typeof input === "object" ? input : {}) as Partial<Verdict>;
    if (!VERDICT_STATUSES.includes(v.status as VerdictStatus)) problems.push(`shape: status must be one of ${VERDICT_STATUSES.join(", ")}`);
    if (!Array.isArray(v.findings)) problems.push("shape: findings is a list (empty when consistent)");
    const findings = list(v.findings as Finding[]);
    const factIds = new Set(context.facts.map((f) => f.id));
    const producers = new Set(context.facts.map((f) => f.producer));
    const assumptions = list(context.assumptions);
    const symbols = Object.keys(context.symbols ?? {});
    for (const [i, f] of findings.entries()) {
        const where = `finding ${i + 1}`;
        if (!f || typeof f !== "object") {
            problems.push(`${where}: not an object`);
            continue;
        }
        if (!REQUIRED_ACTIONS.includes(f.required_action)) problems.push(`${where}: required_action must be one of ${REQUIRED_ACTIONS.join(", ")}`);
        if (!f.reason || !String(f.reason).trim()) problems.push(`${where}: no reason`);
        if (!f.producer || !producers.has(f.producer)) problems.push(`${where}: producer "${String(f.producer)}" is not one of the producers (${[...producers].join(", ")})`);
        const fact = String(f.fact ?? "");
        if (fact.startsWith("assumption:")) {
            const n = Number(fact.slice("assumption:".length));
            if (!Number.isInteger(n) || n < 1 || n > assumptions.length) problems.push(`${where}: "${fact}" names no assumption (${assumptions.length} listed)`);
            else {
                // An assumption is unsupported by nature: a finding on one says which fact or document contradicts it, by name, or it is not a finding (the fifth passage asked for a density nobody states).
                const reason = String(f.reason ?? "");
                const sources = new Set(context.facts.map((x) => x.source));
                const names = [...factIds, ...sources].some((id) => reason.includes(id));
                if (/unsupported|missing/i.test(String(f.kind)) || f.required_action === "COMPLETE" || !names) problems.push(`${where}: an assumption is unsupported by nature; a finding on ${fact} names the fact or the document that contradicts it (one of ${[...factIds].slice(0, 8).join(", ")}, ${[...sources].join(", ")}) in its reason, with REVISE, or is not a finding`);
            }
        } else if (fact.startsWith("symbol:")) {
            if (!symbols.includes(fact.slice("symbol:".length))) problems.push(`${where}: "${fact}" names no symbol (${symbols.join(", ") || "none"})`);
        } else if (!factIds.has(fact)) problems.push(`${where}: "${fact}" is not a fact of the list (${[...factIds].slice(0, 12).join(", ")}${factIds.size > 12 ? ", ..." : ""}); name a fact by its id exactly as the state's factIds writes it, or assumption:<n>, or symbol:<s>`);
        else if (/conflict|value|number|mismatch|disagree/i.test(String(f.kind)) && !context.report.conflicts.some((c) => c.id === fact)) {
            // A numeric disagreement the deterministic layer already weighed and found within the tolerance is not the supervisor's to reopen (the first passage declared 0.3 against 0.30303).
            const stated = context.facts.filter((x) => x.id === fact);
            if (stated.length >= 2) problems.push(`${where}: the deterministic layer compared ${fact} across ${stated.map((x) => `${x.producer} (${x.value} ${x.unit})`).join(", ")} and found them consistent within the tolerance; a numeric disagreement is not yours to declare. What you add is an assumption against a fact (assumption:<n>), a symbol for the wrong thing (symbol:<s>), or a claim without support`);
        }
    }
    // The deterministic layer's conflicts are carried, whoever revises: a verdict that drops one is refused.
    for (const c of context.report.conflicts) {
        if (!findings.some((f) => f && String(f.fact) === c.id)) problems.push(`carried: the deterministic layer found ${c.id} in conflict (${c.revise} to revise); the verdict must carry it as a finding`);
    }
    if (context.report.conflicts.length && v.status === "CONSISTENT") problems.push("status: the deterministic layer found a conflict; the verdict cannot be CONSISTENT");
    if (v.status === "CONSISTENT" && findings.some((f) => f && (f.required_action === "REVISE" || f.required_action === "REJECT"))) problems.push("status: CONSISTENT with a finding that asks to revise or reject");
    if (v.status !== "CONSISTENT" && VERDICT_STATUSES.includes(v.status as VerdictStatus) && !findings.length) problems.push(`status: ${String(v.status)} with no finding: say what, and who acts`);
    return { ok: problems.length === 0, problems };
}

const SEVERITY: Record<VerdictStatus, number> = { CONSISTENT: 0, MISSING: 1, AMBIGUOUS: 2, UNSUPPORTED: 3, CONFLICT: 4 };

/** The report with the supervisor's verdict on it: the worse status of the two, the findings beside the computed conflicts. */
export function applyVerdict(report: ContractReport, verdict: Verdict): ContractReport & { verdict: Verdict } {
    const computed: VerdictStatus = report.status;
    const status = SEVERITY[verdict.status] > SEVERITY[computed] ? verdict.status : computed;
    return { ...report, status, verdict };
}

/** The findings a producer must answer, as the problems its guard would say. */
export function findingsFor(verdict: Verdict | null | undefined, producer: string): string[] {
    if (!verdict) return [];
    return verdict.findings.filter((f) => f.producer === producer && (f.required_action === "REVISE" || f.required_action === "COMPLETE" || f.required_action === "REJECT")).map((f) => `supervisor: ${f.kind} on ${f.fact}, ${f.required_action}: ${f.reason}`);
}

interface RequestLike {
    known?: Array<{ symbol?: string; factId?: string }>;
    assumptions?: string[];
    hypotheses?: Array<string | { statement?: string }>;
}

/** The supervision of a request as the Observer wrote it: its facts against the register's and the library's, its assumptions, its symbols. */
export function supervisionOfRequest(request: RequestLike, devices: unknown[], libraryFacts: Array<LibraryFact & { source: string }>, required: string[] = []): SupervisionInput {
    const facts = taskFacts({ requirements: request as Record<string, unknown>, observations: { devices } }, libraryFacts);
    const symbols: Record<string, string> = {};
    for (const k of list(request.known)) if (k?.symbol) symbols[k.symbol] = k.factId ?? "";
    return {
        facts,
        report: reviewContracts(facts, required),
        assumptions: list(request.assumptions).map(String),
        hypotheses: list(request.hypotheses).map((h) => (typeof h === "string" ? h : String(h?.statement ?? ""))).filter(Boolean),
        symbols,
        required,
    };
}

/** The facts as the supervisor reads them: one line each, the producer first. */
export function factLines(facts: Fact[]): string[] {
    return facts.map((f) => `${f.producer} (${f.status}, ${f.source}): ${f.id} = ${f.value} ${f.unit}${typeof f.min === "number" ? ` (band ${f.min} to ${f.max})` : ""}${f.semantic ? ` [${f.semantic}]` : ""}`);
}

export interface SuperviseOptions {
    /** The model: a `ReasonerProvider` with `SUPERVISOR_PROMPT`, in the demo. */
    provider: Provider;
    input: SupervisionInput;
    attempts?: number;
}

export interface SuperviseAttempt {
    n: number;
    ok: boolean;
    problems: string[];
    proposed: string;
}

export interface SuperviseResult {
    ok: boolean;
    verdict: Verdict | null;
    attempts: SuperviseAttempt[];
    provider: { name: string; model: string; family: string };
}

/** The brief the supervisor reads at a step: what it is given, and why its last verdict was refused. */
export function supervisorBrief(x: { step: number; attemptsLeft: number; computed: ContractReport; last?: SuperviseAttempt }): string {
    const found = x.computed.conflicts.length ? `The deterministic layer found ${x.computed.conflicts.length} conflict(s) (${x.computed.conflicts.map((c) => `${c.id}: ${c.revise} to revise`).join("; ")}): carry them.` : x.computed.missing.length ? `The deterministic layer found required facts missing (${x.computed.missing.join(", ")}).` : "The deterministic layer found the facts it could compare consistent.";
    if (x.last) return `Step ${x.step}. Your verdict was refused: ${x.last.problems.join("; ")}. Send it again, corrected (${x.attemptsLeft} attempt(s) left). ${found}`;
    return `Step ${x.step}. Read the facts, the report, the assumptions and the symbols in the state, and hand over your verdict with ${SUPERVISOR_CAPABILITY}. ${found} Two values of one fact the report does not list as a conflict were compared and agree within the tolerance: do not weigh them again. Add only what the rules on numbers cannot see (an assumption against a fact, a symbol for the wrong thing, a claim without support); name a fact by its id as in factIds; a verdict that invents a problem costs a loop.`;
}

export async function supervise({ provider, input, attempts = 2 }: SuperviseOptions): Promise<SuperviseResult> {
    const intention = { id: "supervise", description: "Say whether the facts, the assumptions and the symbols of the task are consistent across their producers, and who must revise what." };
    const allowed = [{ id: SUPERVISOR_CAPABILITY, description: "Hand over the verdict: the status, and the findings (a fact or an assumption, a producer, a reason, the action required). Checked before it counts; a refused verdict comes back with its reasons.", inputSchema: VERDICT_SCHEMA as never, replayPolicy: "automatic" as const }];
    const done: SuperviseAttempt[] = [];
    let lastProposal: JsonValue | null = null;
    provider.begin?.(`supervise#${Date.now().toString(36)}`);
    for (let n = 1, step = 1; n <= attempts; n++, step++) {
        const last = done.at(-1);
        const state = {
            producers: [...new Set(input.facts.map((f) => f.producer))],
            factIds: [...new Set(input.facts.map((f) => f.id))],
            facts: factLines(input.facts),
            report: { status: input.report.status, conflicts: input.report.conflicts.map((c) => ({ id: c.id, revise: c.revise, reason: c.reason })), missing: input.report.missing },
            assumptions: list(input.assumptions).map((a, i) => `assumption:${i + 1} ${a}`),
            hypotheses: list(input.hypotheses),
            symbols: input.symbols ?? {},
            ...(input.fitted?.length ? { fittedDownstream: input.fitted } : {}),
            lastAttempt: last ? { n: last.n, problems: last.problems, proposed: lastProposal } : null,
            nextActions: allowed.map((c) => c.id),
        };
        const request: PolicyFallbackInput = {
            decisionId: `supervise-${step}`,
            intention,
            state: { id: `supervise:${step}`, features: { brief: supervisorBrief({ step, attemptsLeft: attempts - n + 1, computed: input.report, last }), state } },
            allowedCapabilities: allowed,
            candidates: [],
            recentFailures: [],
        } as unknown as PolicyFallbackInput;
        const decision = await provider.resolve(request);
        const id = decision.invocation.capabilityId;
        lastProposal = (decision.invocation.input ?? null) as JsonValue;
        if (id !== SUPERVISOR_CAPABILITY) {
            done.push({ n, ok: false, problems: [`the answer was not a call to ${SUPERVISOR_CAPABILITY} (${id})`], proposed: JSON.stringify(decision.invocation.input).slice(0, 2000) });
            continue;
        }
        const check = checkVerdict(decision.invocation.input, input);
        done.push({ n, ok: check.ok, problems: check.problems, proposed: JSON.stringify(decision.invocation.input).slice(0, 2000) });
        if (check.ok) return { ok: true, verdict: decision.invocation.input as unknown as Verdict, attempts: done, provider: { name: provider.name, model: provider.model, family: provider.family } };
    }
    return { ok: false, verdict: null, attempts: done, provider: { name: provider.name, model: provider.model, family: provider.family } };
}
