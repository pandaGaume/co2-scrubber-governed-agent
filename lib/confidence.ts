/**
 * The confidence in a lead's diagnosis (2026-10-01, docs/evaluateur.fr.md, E5.3): computed by the harness from what it checked, never
 * declared by a model. A lead may be diagnosed by two models, the second blind to the first; they agree when they say the same class
 * and the same currency, and their causes rest on a node of the graph besides the lead's form and tasks (what made the lead, and
 * what both would name). Nodes are compared, never sentences.
 *
 * The parts, each between 0 and 1: the share of predictions the harness confirmed (an unknown one confirms nothing), the competing
 * hypotheses ruled out by a confirmed prediction, the tasks the lead rests on, and the agreement of two models. Weighed by
 * specs/harness/diagnosis.json, then capped when the agreement of two families is missing (a disagreement, a single diagnosis, two
 * of one family). Until calibration (E5.4) sets the threshold, every diagnosis goes to a person.
 */
import { readFileSync } from "node:fs";
import { fromRoot } from "./paths.js";

export const DIAGNOSIS_CONFIG_FILE = "specs/harness/diagnosis.json";

export interface DiagnosisConfig {
    calibrated: boolean;
    calibratedOn: string | null;
    weights: { confirmed: number; ruledOut: number; sample: number; agreement: number };
    ruledOut: { saturation: number };
    sample: { half: number };
    caps: { disagreement: number; single: number; sameFamily: number };
    threshold: number | null;
}

export const diagnosisConfig = (): DiagnosisConfig => JSON.parse(readFileSync(fromRoot(...DIAGNOSIS_CONFIG_FILE.split("/")), "utf8")) as DiagnosisConfig;

/** A diagnosis as the station keeps it: the record the factory wrote and the station checked again, and the model that made it. */
export interface Diagnosed {
    taskId: string;
    model: string;
    family: string;
    record: DiagnosisRecordLike;
}

/** What of a diagnosis record the confidence reads (harness/topics/diagnosis diagnosisRecord). */
export interface DiagnosisRecordLike {
    id: string;
    lead: { id: string; form?: { id: string } | null; about?: string[]; tasks?: string[] };
    class: string;
    current: string;
    evidence: string[];
    predictions: Array<{ role: string; expect: boolean; alternative?: string; result: { truth: string; nodes: string[] } | null }>;
}

/**
 * The nodes a diagnosis's cause rests on: its evidence, and what its confirmed cause predictions showed, less the lead's form and
 * tasks (every diagnosis of the lead names them). A rule the lead is about stays: two causes resting on it is what agreement is.
 */
export function causeNodes(d: DiagnosisRecordLike): string[] {
    const own = new Set([...(d.lead.tasks ?? []), ...(d.lead.form ? [d.lead.form.id] : [])]);
    const shown = d.predictions.filter((p) => p.role === "cause" && p.result && p.result.truth !== "unknown").flatMap((p) => p.result!.nodes);
    return [...new Set([...d.evidence, ...shown])].filter((n) => !own.has(n)).sort();
}

export interface Agreement {
    agree: boolean;
    sameClass: boolean;
    sameCurrent: boolean;
    /** The nodes both causes rest on, besides the lead's form and tasks. */
    shared: string[];
}

/** Whether two diagnoses of a lead agree: the same class, the same currency, a node of the cause in common. */
export function agreementOf(a: DiagnosisRecordLike, b: DiagnosisRecordLike): Agreement {
    const nodes = new Set(causeNodes(b));
    const shared = causeNodes(a).filter((n) => nodes.has(n));
    const sameClass = a.class === b.class;
    const sameCurrent = a.current === b.current;
    return { agree: sameClass && sameCurrent && shared.length > 0, sameClass, sameCurrent, shared };
}

/** What the harness checked in one diagnosis: the share confirmed, the alternatives ruled out by a confirmed prediction. */
function checkedOf(d: DiagnosisRecordLike): { confirmed: number; total: number; ruledOut: string[] } {
    const confirmed = d.predictions.filter((p) => p.result && p.result.truth !== "unknown");
    return { confirmed: confirmed.length, total: d.predictions.length, ruledOut: [...new Set(confirmed.filter((p) => p.role === "rules-out").map((p) => String(p.alternative ?? "")))] };
}

export interface Confidence {
    lead: string;
    /** The diagnoses weighed: two of different models when there are, the first of each otherwise. */
    weighed: Array<{ taskId: string; model: string; family: string }>;
    agreement: Agreement | null;
    parts: { confirmed: number; ruledOut: number; sample: number; agreement: number | null };
    /** Before the cap. */
    raw: number;
    cap: { why: "disagreement" | "single" | "sameFamily"; at: number } | null;
    confidence: number;
    /** Where it goes: to the recommendation factory above the threshold, to a person below it or while nothing is calibrated. */
    decision: "recommend" | "person";
    why: string;
}

/**
 * The confidence in a lead's diagnoses. Of several, two of different models are weighed, of different families when there are (a
 * model that diagnosed twice is counted once, its first); a disagreement sends both to a person whatever the parts.
 */
export function confidenceOf(diagnoses: Diagnosed[], tasks: number, cfg: DiagnosisConfig = diagnosisConfig()): Confidence {
    if (!diagnoses.length) throw new Error("no diagnosis to weigh");
    const byModel: Diagnosed[] = [];
    for (const d of diagnoses) if (!byModel.some((x) => x.model === d.model)) byModel.push(d);
    const first = byModel[0];
    const second = byModel.find((d) => d.family !== first.family) ?? byModel.find((d) => d !== first) ?? null;
    const weighed = second ? [first, second] : [first];
    const checked = weighed.map((d) => checkedOf(d.record));
    const confirmed = checked.reduce((s, c) => s + (c.total ? c.confirmed / c.total : 0), 0) / checked.length;
    const alternatives = new Set(checked.flatMap((c) => c.ruledOut).filter(Boolean));
    const ruledOut = Math.min(alternatives.size / cfg.ruledOut.saturation, 1);
    const sample = tasks / (tasks + cfg.sample.half);
    const agreement = second ? agreementOf(first.record, second.record) : null;
    const w = cfg.weights;
    const terms: Array<[number, number]> = [
        [w.confirmed, confirmed],
        [w.ruledOut, ruledOut],
        [w.sample, sample],
        ...(agreement ? ([[w.agreement, agreement.agree ? 1 : 0]] as Array<[number, number]>) : []),
    ];
    const raw = terms.reduce((s, [wt, x]) => s + wt * x, 0) / terms.reduce((s, [wt]) => s + wt, 0);
    const cap: Confidence["cap"] = !agreement ? { why: "single", at: cfg.caps.single } : !agreement.agree ? { why: "disagreement", at: cfg.caps.disagreement } : first.family === second!.family ? { why: "sameFamily", at: cfg.caps.sameFamily } : null;
    const confidence = cap ? Math.min(raw, cap.at) : raw;
    const decision: Confidence["decision"] = cfg.calibrated && cfg.threshold !== null && confidence >= cfg.threshold && !(agreement && !agreement.agree) ? "recommend" : "person";
    const why = !cfg.calibrated || cfg.threshold === null ? "not calibrated yet: every diagnosis goes to a person" : agreement && !agreement.agree ? "two models disagree: both diagnoses go to a person" : decision === "recommend" ? `at or above the threshold ${cfg.threshold}` : `below the threshold ${cfg.threshold}`;
    return { lead: first.record.lead.id, weighed: weighed.map((d) => ({ taskId: d.taskId, model: d.model, family: d.family })), agreement, parts: { confirmed, ruledOut, sample, agreement: agreement ? (agreement.agree ? 1 : 0) : null }, raw, cap, confidence, decision, why };
}
