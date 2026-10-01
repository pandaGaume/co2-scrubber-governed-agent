/**
 * The evaluator measured against what its leads really are (2026-10-01, docs/evaluateur.fr.md, E5.0): the labels of
 * tests/fixtures/evaluator/labels.json, each a lead of a corpus (a finding of the scripted detectors, or a form they leave
 * unclassified) with its verdict (right, wrong, stale, unsure), its true cause and class, whether it is still true, and how certain
 * the label is. What the detectors say is right when the label says so; a stale finding said something true once and asks for
 * what is fixed. Precision counts the labels a reader can rely on (established, and with likely ones apart), and unsure ones are
 * counted, never guessed. A finding without a label, or a label whose lead is no longer found, is said: labels follow the detectors.
 */
import { readFileSync } from "node:fs";
import type { Evaluation } from "./evaluator.js";

export type Verdict = "right" | "wrong" | "stale" | "unsure";
export type Certainty = "established" | "likely" | "unknown";

export interface Label {
    corpus: string;
    lead: string;
    kind?: "finding" | "unclassified";
    about: string;
    verdict: Verdict;
    cause: string;
    class: string;
    current: "still" | "closed" | "unknown";
    certainty: Certainty;
    confirmed: boolean;
    by: string;
    how: string;
    note?: string;
}

export const loadLabels = (file: string): Label[] => (JSON.parse(readFileSync(file, "utf8")) as { labels: Label[] }).labels;

export interface Tally {
    right: number;
    wrong: number;
    stale: number;
    unsure: number;
    /** right / (right + wrong + stale): null when nothing is judged. */
    precision: number | null;
}

const tally = (ls: Label[]): Tally => {
    const n = (v: Verdict) => ls.filter((l) => l.verdict === v).length;
    const [right, wrong, stale, unsure] = [n("right"), n("wrong"), n("stale"), n("unsure")];
    const judged = right + wrong + stale;
    return { right, wrong, stale, unsure, precision: judged ? right / judged : null };
};

export interface Measure {
    /** Labels whose lead the detectors no longer give: to be labelled again. */
    missing: Label[];
    /** Findings, and unclassified forms, without a label. */
    unlabeled: Array<{ corpus: string; lead: string; title: string }>;
    /** Every finding labelled, as its label says; established only, then established and likely. */
    findings: { established: Tally; likely: Tally; all: Tally };
    /** The findings the detectors ask a recommendation for (recommend true): what a person would be asked to act on. */
    actionable: { established: Tally; likely: Tally; all: Tally };
    byDetector: Record<string, Tally>;
    /** The forms left unclassified, as their labels say: wrong is a known cause the detectors missed. */
    unclassified: Tally;
}

/** What the detectors say on each corpus, measured against the labels. */
export function measure(evaluations: Record<string, Evaluation>, labels: Label[]): Measure {
    const found = new Map<string, { recommend: boolean; detector: string; title: string; unclassified: boolean }>();
    for (const [corpus, e] of Object.entries(evaluations)) {
        for (const f of e.findings) found.set(`${corpus}|${f.id}`, { recommend: f.recommend, detector: f.detector, title: f.title, unclassified: false });
        for (const u of e.unclassified) found.set(`${corpus}|${u.form}`, { recommend: false, detector: "unclassified", title: u.shape, unclassified: true });
    }
    const labelled = new Map(labels.map((l) => [`${l.corpus}|${l.lead}`, l]));
    const missing = labels.filter((l) => l.corpus in evaluations && !found.has(`${l.corpus}|${l.lead}`));
    const unlabeled = [...found.entries()].filter(([k]) => !labelled.has(k)).map(([k, v]) => ({ corpus: k.split("|")[0], lead: k.split("|")[1], title: v.title }));
    const present = labels.filter((l) => found.has(`${l.corpus}|${l.lead}`));
    const ofFindings = present.filter((l) => !found.get(`${l.corpus}|${l.lead}`)!.unclassified);
    const actionable = ofFindings.filter((l) => found.get(`${l.corpus}|${l.lead}`)!.recommend);
    const three = (ls: Label[]) => ({ established: tally(ls.filter((l) => l.certainty === "established")), likely: tally(ls.filter((l) => l.certainty !== "unknown")), all: tally(ls) });
    const byDetector: Record<string, Tally> = {};
    for (const d of [...new Set(ofFindings.map((l) => found.get(`${l.corpus}|${l.lead}`)!.detector))].sort()) byDetector[d] = tally(ofFindings.filter((l) => found.get(`${l.corpus}|${l.lead}`)!.detector === d && l.certainty !== "unknown"));
    const left = present.filter((l) => found.get(`${l.corpus}|${l.lead}`)!.unclassified);
    return { missing, unlabeled, findings: three(ofFindings), actionable: three(actionable), byDetector, unclassified: tally(left) };
}
