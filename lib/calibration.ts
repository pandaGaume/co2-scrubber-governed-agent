/**
 * The calibration of the confidence, offline (2026-10-01, docs/evaluateur.fr.md, E5.3 for E5.4): the dataset's diagnoses
 * (lib/diagnosis-dataset.ts) joined with the labels, the confidence computed for each lead under a configuration, and how often a
 * diagnosis is right in each band of confidence and above each threshold. No model is called: a calibration is changed, and
 * measured again, on what was recorded.
 *
 * A diagnosis is right when it says what the label says: its verdict on the lead, its class and its currency (each told apart, so a
 * near miss shows where). A lead counts once, by the diagnosis weighed first; two that disagree are never sent on, whatever their
 * confidence.
 */
import type { Label } from "./evaluator-labels.js";
import { confidenceOf, diagnosisConfig, type Confidence, type Diagnosed, type DiagnosisConfig } from "./confidence.js";
import type { DatasetEntry } from "./diagnosis-dataset.js";
import type { HarnessGraph } from "./harness-graph.js";
import type { PredicateContext } from "./predicates.js";
import { diagnosisCheck, diagnosisRecord, type Diagnosis, type DiagnosisAsked } from "../harness/topics/diagnosis/index.js";

/**
 * A recorded diagnosis checked again as the code is now (its predicates, its guard), on the graph of the corpus it was made on: what
 * the model sent is kept, so a change of the harness is measured without a model. Null with why when the guard would now refuse it.
 */
export function recheck(e: DatasetEntry, g: HarnessGraph, ctx: PredicateContext): { record: Diagnosed["record"] } | { why: string } {
    const sent = e.submissions.filter((s) => !s.refused).at(-1)?.diagnosis as Diagnosis | undefined;
    if (!sent) return { why: "no diagnosis was accepted in this task" };
    const { problems, results } = diagnosisCheck(sent, e.asked as DiagnosisAsked, g, ctx);
    if (problems.length) return { why: problems.join("; ") };
    return { record: diagnosisRecord(e.asked as DiagnosisAsked, sent, results) as unknown as Diagnosed["record"] };
}

/** The diagnoses of the dataset by lead (corpus|lead), each with its model, the station's check required unless said otherwise. */
export function diagnosesOfDataset(entries: DatasetEntry[], options: { unchecked?: boolean; record?: (e: DatasetEntry) => Diagnosed["record"] | null } = {}): Map<string, Diagnosed[]> {
    const out = new Map<string, Diagnosed[]>();
    for (const e of entries) {
        if (!e.accepted || (!options.unchecked && e.station?.status !== "diagnosed")) continue;
        const record = options.record ? options.record(e) : (e.accepted as Diagnosed["record"]);
        if (!record) continue;
        const key = `${e.corpus ?? "?"}|${e.lead}`;
        out.set(key, [...(out.get(key) ?? []), { taskId: e.key, model: e.model, family: e.family, record }]);
    }
    return out;
}

export interface CalibrationRow {
    corpus: string;
    lead: string;
    label: Pick<Label, "verdict" | "class" | "current" | "certainty"> | null;
    said: { verdict: string; class: string; current: string };
    matches: { verdict: boolean; class: boolean; current: boolean };
    right: boolean | null;
    confidence: Confidence;
}

/** Each lead's confidence under a configuration, and whether its diagnosis says what the label says. */
export function calibrationRows(diagnoses: Map<string, Diagnosed[]>, labels: Label[], cfg: DiagnosisConfig = diagnosisConfig()): CalibrationRow[] {
    const rows: CalibrationRow[] = [];
    for (const [key, ds] of diagnoses) {
        const [corpus, lead] = [key.slice(0, key.indexOf("|")), key.slice(key.indexOf("|") + 1)];
        const confidence = confidenceOf(ds, (ds[0].record.lead.tasks ?? []).length, cfg);
        const first = ds.find((d) => d.taskId === confidence.weighed[0].taskId)!.record as Diagnosed["record"] & { verdict?: string };
        const l = labels.find((x) => x.corpus === corpus && x.lead === lead) ?? null;
        const said = { verdict: String(first.verdict ?? ""), class: first.class, current: first.current };
        const matches = { verdict: l ? said.verdict === l.verdict : false, class: l ? said.class === l.class : false, current: l ? said.current === l.current : false };
        rows.push({ corpus, lead, label: l ? { verdict: l.verdict, class: l.class, current: l.current, certainty: l.certainty } : null, said, matches, right: l && l.verdict !== "unsure" ? matches.verdict && matches.class && matches.current : null, confidence });
    }
    return rows.sort((a, b) => b.confidence.confidence - a.confidence.confidence);
}

export interface Band {
    from: number;
    to: number;
    leads: number;
    right: number;
    precision: number | null;
}

/** How often a diagnosis is right in each band of confidence (labels a reader can rely on only: established, or likely too). */
export function bands(rows: CalibrationRow[], edges: number[] = [0, 0.25, 0.5, 0.75, 1.0001], certainty: "established" | "likely" = "established"): Band[] {
    const judged = rows.filter((r) => r.right !== null && (r.label!.certainty === "established" || (certainty === "likely" && r.label!.certainty === "likely")));
    return edges.slice(0, -1).map((from, i) => {
        const to = edges[i + 1];
        const inside = judged.filter((r) => r.confidence.confidence >= from && r.confidence.confidence < to);
        const right = inside.filter((r) => r.right).length;
        return { from, to: Math.min(to, 1), leads: inside.length, right, precision: inside.length ? right / inside.length : null };
    });
}

/** Above each threshold, what would be sent on (two models agreeing) and how often it is right: the curve E5.4 chooses on. */
export function thresholds(rows: CalibrationRow[], steps = 20, certainty: "established" | "likely" = "established"): Array<{ threshold: number; sent: number; right: number; precision: number | null; coverage: number }> {
    const judged = rows.filter((r) => r.right !== null && (r.label!.certainty === "established" || (certainty === "likely" && r.label!.certainty === "likely")));
    return Array.from({ length: steps + 1 }, (_, i) => i / steps).map((t) => {
        const sent = judged.filter((r) => r.confidence.confidence >= t && !(r.confidence.agreement && !r.confidence.agreement.agree));
        const right = sent.filter((r) => r.right).length;
        return { threshold: t, sent: sent.length, right, precision: sent.length ? right / sent.length : null, coverage: judged.length ? sent.length / judged.length : 0 };
    });
}
