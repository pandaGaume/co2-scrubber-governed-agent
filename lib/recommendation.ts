/**
 * From a finding to what the recommendation factory is given (2026-10-01, docs/evaluateur.fr.md, E3): read from the harness's graph,
 * never written by a model. The texts it may change are those the graph links to the finding, each with what it holds now: the
 * statements of the finding's rules and of the conventions they assume, those of the rules of the same kind (where a rule said
 * nowhere would be said), and the description of a capability the harness refused calls of. With them, the memory entry or the
 * library documents the finding is about, its rule and the rule's own words, the cases to replay (the requests of its tasks), the
 * models, what a verification measures, and the conventions an example keeps (the keys a topic's format names its lists by).
 */
import { existsSync, readFileSync } from "node:fs";
import type { JsonValue } from "@spiky-panda/harness";
import { fromRoot } from "./paths.js";
import { H, shortSha, type HarnessGraph, type HarnessNode } from "./harness-graph.js";
import type { Finding } from "./evaluator.js";
import { signatureOf } from "../harness/lib/signatures.js";
import { textNow, type Asked, type Target } from "../harness/topics/recommendation/index.js";

/** A recommendation's id: one per finding, the same whenever the finding is found again. */
export const recommendationIdOf = (finding: Pick<Finding, "id">): string => `rec-${shortSha(finding.id)}`;

const readJson = <T>(file: string): T | null => {
    try {
        return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
        return null;
    }
};

/** What the factory is given for a finding of the graph. */
export function askedFor(g: HarnessGraph, f: Finding): Asked {
    const nodes = f.about.map((id) => g.get(id)).filter((n): n is HarnessNode => Boolean(n));
    const ofRule = (n: HarnessNode): HarnessNode[] => (n.type === H.rule ? [n] : n.type === H.form ? g.out(n, H.of).map((l) => l.ofin as HarnessNode).filter((x) => x.type === H.rule) : []);
    const rules = [...new Map(nodes.flatMap(ofRule).map((r) => [String(r.id), r])).values()];
    const tasks = f.tasks.map((id) => g.get(id)).filter((n): n is HarnessNode => Boolean(n));
    const topics = [...new Set([...tasks.map((t) => String(t.bag?.topic)), ...rules.map((r) => String(r.bag?.topic))].filter((t) => t && t !== "undefined"))];

    // The texts it may change, each once, with why it is offered and what it holds now.
    const targets = new Map<string, Target>();
    const offer = (statement: HarnessNode, why: string): void => {
        const file = statement.bag?.file ? String(statement.bag.file) : null;
        if (!file) return;
        const pointer = statement.bag?.pointer ? String(statement.bag.pointer) : undefined;
        // A text a recommendation of the contract can change: a value of a JSON file by its pointer, or a document whole. Code states
        // a rule too (a schema's description written in it), but is no text to replace; given whole, it only weighs on the model.
        if (!(pointer && file.endsWith(".json")) && !file.endsWith(".md")) return;
        const key = `${file}#${pointer ?? ""}`;
        if (!targets.has(key)) targets.set(key, { file, ...(pointer ? { pointer } : {}), text: textNow(file, pointer), why });
    };
    for (const rule of rules) {
        const code = String(rule.bag?.code);
        for (const l of g.in(rule, H.states)) offer(l.oini as HarnessNode, `states ${code}`);
        for (const c of g.out(rule, H.applies).map((l) => l.ofin as HarnessNode)) for (const l of g.in(c, H.states)) offer(l.oini as HarnessNode, `states the convention ${String(c.bag?.name)} that ${code} assumes`);
        // Where a rule said nowhere would be said: where the rules of its kind are.
        const kind = rule.bag?.kind;
        if (kind)
            for (const other of g.nodesOf(H.rule).filter((x) => x !== rule && x.bag?.kind === kind && x.bag?.topic === rule.bag?.topic))
                for (const l of g.in(other, H.states)) offer(l.oini as HarnessNode, `states ${String(other.bag?.code)}, a rule of the same kind (${String(kind)})`);
    }
    // A capability the harness refused calls of: its description, in its topic's words.
    const capabilities = Array.isArray((f.evidence as { capabilities?: unknown }).capabilities) ? ((f.evidence as { capabilities: string[] }).capabilities) : [];
    for (const cap of capabilities) {
        const [topic, name] = cap.split(".");
        const file = `specs/${topic}/words.json`;
        const pointer = `/capabilities/${name}`;
        const text = existsSync(fromRoot(...file.split("/"))) ? textNow(file, pointer) : null;
        if (text !== null && !targets.has(`${file}#${pointer}`)) targets.set(`${file}#${pointer}`, { file, pointer, text, why: `describes ${cap}` });
    }

    // The topic's prompt, last: where a rule of its conduct is said when no text states its kind (a rule said nowhere).
    if (rules.length)
        for (const t of topics) {
            const prompt = readJson<{ prompt?: string }>(fromRoot("specs", t, "format.json"))?.prompt;
            if (prompt && !targets.has(`${prompt}#`)) targets.set(`${prompt}#`, { file: prompt, text: textNow(prompt), why: `the prompt of ${t}, where a rule its texts state nowhere would be said` });
        }

    const entry = nodes.find((n) => n.type === H.memoryEntry);
    const rule = rules[0];
    // The cases to replay: the requests, when who asked tells them apart (an experiment's tasks); the tasks themselves otherwise
    // (a station or a scenario asks every task: its name is no case).
    const requests = [...new Set(tasks.map((t) => t.bag?.requestedBy).filter((x): x is string => typeof x === "string" && x.length > 0))];
    const distinct = new Set(tasks.map((t) => String(t.bag?.case ?? t.id))).size;
    const cases = requests.length === distinct ? requests : tasks.map((t) => `${t.bag?.workshop ? `${String(t.bag.workshop)}/` : ""}${String(t.bag?.taskId)}`);
    const conventions = topics.flatMap((t) => Object.entries(readJson<{ keys?: Record<string, string> }>(fromRoot("specs", t, "format.json"))?.keys ?? {}).map(([list, key]) => ({ list, key })));
    return {
        id: recommendationIdOf(f),
        finding: { id: f.id, detector: f.detector, class: f.class, title: f.title, settledBy: f.settledBy, path: f.path, about: f.about, tasks: f.tasks.length, models: f.models, evidence: f.evidence as JsonValue, recommend: f.recommend },
        targets: [...targets.values()].filter((t) => t.text !== null),
        memory: entry ? { id: String(entry.bag?.id), topic: String(entry.bag?.topic), rule: String(entry.bag?.rule ?? ""), status: String(entry.bag?.status ?? "") } : null,
        library:
            f.class === "library-gap"
                ? (() => {
                      const documents = ((f.evidence as { documents?: string[] }).documents ?? []).map(String);
                      // Whether each is signed now, and by whom: a document signed since needs no signature recommended.
                      const signatures = Object.fromEntries(documents.map((d) => { try { const s = signatureOf(d); return [d, s ? { by: s.by, at: s.at, valid: s.valid } : null]; } catch { return [d, null]; } }));
                      return { documents, signatures };
                  })()
                : null,
        // The rule, and what the guard checks: a recommendation says what is enforced, never a rule of its own.
        rule: rule
            ? {
                  code: String(rule.bag?.code),
                  status: String(rule.bag?.status),
                  ...(rule.bag?.note ? { note: String(rule.bag.note) } : {}),
                  ...(rule.bag?.says ? { says: String(rule.bag.says) } : {}),
                  ...(rule.bag?.check ? { check: rule.bag.check as JsonValue } : {}),
                  ...(rule.bag?.example ? { example: String(rule.bag.example) } : {}),
              }
            : null,
        cases,
        models: Object.keys(f.models),
        measures: [...rules.map((r) => String(r.bag?.code)), ...(f.form ? [f.form.shape] : [])],
        conventions,
    };
}

/** The order findings are recommended on: what came with a change first, then the gaps, the library, the harness's own. */
export const RECOMMEND_ORDER = ["regression", "contract-gap", "library-gap", "harness-artefact", "stated-not-followed", "contract-gap-or-policy", "learned-policy", "domain-knowledge"];
