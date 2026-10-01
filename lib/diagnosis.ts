/**
 * From a lead to what the diagnosis factory is given (2026-10-01, docs/evaluateur.fr.md, E5.2): read from the harness's graph, never
 * written by a model. The lead whole (the finding as the detectors wrote it, its form and its tasks by their ids); its neighbourhood,
 * the nodes two links away; the rules of the register it touches, what the guard checks and where each is stated today; the state of
 * today (the repository's commit, the signatures of the documents it names, the profiles its tasks ran with as they are now); and
 * the hypotheses already refuted for it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { JsonValue } from "@spiky-panda/harness";
import { fromRoot } from "./paths.js";
import { H, shortSha, type HarnessGraph, type HarnessNode } from "./harness-graph.js";
import type { Finding } from "./evaluator.js";
import { stated, type Statement } from "./rules-register.js";
import type { Prediction } from "./predicates.js";
import { signatureOf } from "../harness/lib/signatures.js";
import { DIAGNOSIS_FORMAT, type DiagnosisAsked, type LeadRef } from "../harness/topics/diagnosis/index.js";

/** A diagnosis's id: one per lead, the same whenever the lead is found again. */
export const diagnosisIdOf = (lead: Pick<Finding, "id">): string => `diag-${shortSha(lead.id)}`;

const short = (bag: unknown, max = 400): JsonValue | undefined => {
    if (!bag || typeof bag !== "object" || !Object.keys(bag).length) return undefined;
    const text = JSON.stringify(bag);
    return (text.length <= max ? bag : `${text.slice(0, max)}…`) as JsonValue;
};

/** The lead as the factory reads it: the finding whole, its tasks by their node ids. */
export const leadOf = (f: Finding): LeadRef => ({ id: f.id, detector: f.detector, class: f.class, title: f.title, settledBy: f.settledBy, form: f.form, path: f.path, about: f.about, tasks: f.tasks, models: f.models, evidence: f.evidence as JsonValue, recommend: f.recommend });

/** The nodes two links away from the lead's, breadth first, at most so many; the links among them. */
function neighbourhood(g: HarnessGraph, start: string[], hops: number, max: number): DiagnosisAsked["neighbourhood"] {
    const seen = new Map<string, HarnessNode>();
    let frontier = start.map((id) => g.get(id)).filter((n): n is HarnessNode => Boolean(n));
    for (const n of frontier) seen.set(n.id, n);
    for (let h = 0; h < hops && frontier.length && seen.size < max; h++) {
        const next: HarnessNode[] = [];
        for (const n of frontier)
            for (const other of [...g.out(n).map((l) => l.ofin), ...g.in(n).map((l) => l.oini)] as HarnessNode[]) {
                if (!other || seen.has(other.id) || seen.size >= max) continue;
                seen.set(other.id, other);
                next.push(other);
            }
        frontier = next;
    }
    const links: DiagnosisAsked["neighbourhood"]["links"] = [];
    for (const n of seen.values()) for (const l of g.out(n)) if (l.ofin && seen.has((l.ofin as HarnessNode).id)) links.push({ from: n.id, type: String(l.type), to: (l.ofin as HarnessNode).id });
    const cut = DIAGNOSIS_FORMAT.neighbourhood.bagChars;
    return { nodes: [...seen.values()].map((n) => ({ id: n.id, type: String(n.type), ...(short(n.bag, cut) ? { bag: short(n.bag, cut) } : {}) })), links };
}

const statementOf = (n: HarnessNode): Statement => ({ ...(n.bag?.library ? { library: String(n.bag.library) } : { file: String(n.bag?.file) }), ...(n.bag?.pointer ? { pointer: String(n.bag.pointer) } : {}), phrase: String(n.bag?.phrase) });
const where = (s: Statement): string => `${s.library ? `library ${s.library}` : s.file}${s.pointer ? `#${s.pointer}` : ""}`;

/** What the factory is given for a lead of the graph. */
export function diagnosisAskedFor(g: HarnessGraph, f: Finding, forks: string[] | null, refuted: Array<{ prediction: Prediction; observed: string }> = []): DiagnosisAsked {
    const about = f.about.map((id) => g.get(id)).filter((n): n is HarnessNode => Boolean(n));
    const ofRule = (n: HarnessNode): HarnessNode[] => (n.type === H.rule ? [n] : n.type === H.form ? g.out(n, H.of).map((l) => l.ofin as HarnessNode).filter((x) => x.type === H.rule) : []);
    const rules = [...new Map([...about, ...(f.form ? [g.get(f.form.id)].filter((n): n is HarnessNode => Boolean(n)) : [])].flatMap(ofRule).map((r) => [r.id, r])).values()];
    const today = { cwd: fromRoot(), commit: null };
    const everything = { has: () => true } as unknown as ReadonlySet<string>;
    const documents = [...new Set(((f.evidence as { documents?: unknown }).documents as unknown[] | undefined ?? []).map(String))];
    const profiles = [...new Set(f.tasks.map((t) => (g.get(t)?.bag?.profile as { file?: string } | null)?.file).filter((x): x is string => Boolean(x)))];
    let commit: string | null = null;
    try {
        commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: fromRoot(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
        commit = null;
    }
    return {
        id: diagnosisIdOf(f),
        forks,
        lead: leadOf(f),
        // Its own nodes first, its tasks with them: a form refused in many tasks would fill the neighbourhood before them.
        neighbourhood: neighbourhood(g, [...f.about, ...(f.form ? [f.form.id] : []), ...f.tasks], DIAGNOSIS_FORMAT.neighbourhood.hops, DIAGNOSIS_FORMAT.neighbourhood.maxNodes),
        rules: rules.map((r) => ({
            code: String(r.bag?.code),
            status: String(r.bag?.status),
            signed: r.bag?.signed === true,
            ...(r.bag?.says ? { says: String(r.bag.says) } : {}),
            ...(r.bag?.check ? { check: r.bag.check as JsonValue } : {}),
            ...(r.bag?.note ? { note: String(r.bag.note) } : {}),
            statedToday: g.in(r, H.states).map((l) => statementOf(l.oini as HarnessNode)).map((s) => ({ where: where(s), holds: stated(s, today, everything) === true })),
        })),
        today: {
            commit,
            signatures: Object.fromEntries(documents.map((d) => {
                try {
                    const s = signatureOf(d);
                    return [d, s ? { by: s.by, at: s.at, valid: s.valid } : null];
                } catch {
                    return [d, null];
                }
            })) as Record<string, JsonValue>,
            profiles: Object.fromEntries(profiles.map((p) => {
                const file = fromRoot(...p.split("/"));
                const tier3 = existsSync(file) ? ((JSON.parse(readFileSync(file, "utf8")) as { tier3?: Record<string, unknown> }).tier3 ?? null) : null;
                // What runs the model, not how it is reached: the key's name stays out.
                const { apiKey: _key, ...settings } = tier3 ?? {};
                return [p, tier3 ? (settings as JsonValue) : null];
            })),
        },
        refuted,
    };
}
