/**
 * A first trial of the diagnosis by a reasoner (2026-10-01, docs/evaluateur.fr.md, before E5.1): one call per lead, no tools, no
 * predicates run by the harness yet. For each finding of the two labelled corpora whose label is established, a pack of evidence
 * built by script (the finding as the detectors give it; its tasks' refused submissions, the refusal in full and the submission that
 * followed; the register's rules those refusals fall under, with what their statements say today; the library's facts; the
 * repository's commit), never the label; the model answers a verdict on the lead, a cause, a class, whether it is still true, and the
 * evidence it rests on. Its answers are compared with the labels (verdict, class, current; the causes are read by a person), and
 * written to outputs/evaluator-trials/<stamp>/. Built code only (npm run build first).
 *
 *     node --env-file=.env scripts/evaluator/diagnose-trial.mjs [--profile profiles/anthropic-sonnet.json] [--only D2:8cba194716f8] [--packs-only]
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const load = (p) => import(pathToFileURL(path.join(root, "dist", p)).href);
const { HarnessGraph } = await load("lib/harness-graph.js");
const { evaluate } = await load("lib/evaluator.js");
const { guardWordsOf } = await load("lib/working-memory.js");
const { loadRegister, codesOf, statementFile, statementText } = await load("lib/rules-register.js");
const { loadLabels } = await load("lib/evaluator-labels.js");
const { problemsOfReason } = await load("harness/core/problems.js");
const { composeText } = await load("harness/lib/compose.js");
const { PROCEDURE_TOPIC } = await load("harness/topics/procedure/index.js");

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const profileFile = option("--profile") ?? "profiles/anthropic-sonnet.json";
const only = option("--only");
const packsOnly = args.includes("--packs-only");

const register = loadRegister("procedure");
const readings = { procedure: { judges: PROCEDURE_TOPIC.judges, digest: PROCEDURE_TOPIC.digest, guardWords: guardWordsOf(path.join(root, "specs", "procedure", "words.json")), register } };
const corpora = {};
for (const corpus of ["evaluator", "evaluator-repository"]) {
    const dir = path.join(root, "tests", "fixtures", corpus);
    const forks = readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({ name: d.name, dir: path.join(dir, d.name), createdAt: JSON.parse(readFileSync(path.join(dir, d.name, "fork.json"), "utf8")).createdAt }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    corpora[corpus] = { dir, evaluation: evaluate(new HarnessGraph(forks, readings)) };
}
const labels = loadLabels(path.join(root, "tests", "fixtures", "evaluator", "labels.json"));

const cut = (s, max) => {
    const t = typeof s === "string" ? s : JSON.stringify(s);
    return t === undefined ? "" : t.length > max ? `${t.slice(0, max)} [... ${t.length - max} more characters cut]` : t;
};
const head = execFileSync("git", ["log", "-1", "--format=%h, %ad", "--date=format:%Y-%m-%d %H:%M"], { encoding: "utf8" }).trim();
const facts = readdirSync(path.join(root, "docs", "library"))
    .filter((f) => f.endsWith(".facts.json"))
    .flatMap((f) => {
        const d = JSON.parse(readFileSync(path.join(root, "docs", "library", f), "utf8"));
        return (d.facts ?? []).map((x) => `${x.id} = ${x.value}${x.unit ? ` ${x.unit}` : ""}${x.bound ? ` (${x.bound} bound)` : ""} [${d.document}]: ${x.says ?? ""}`);
    });

/** A task of the finding read from its manifest: who ran it, its steps, and each step that was not completed with the step after it. */
function taskPart(corpus, taskId, codes) {
    const [workshop, task] = String(taskId).replace(/^task:/, "").split("/");
    const file = path.join(corpora[corpus].dir, workshop, task, "manifest.json");
    if (!existsSync(file)) return `TASK ${taskId}: its manifest is not in the corpus\n`;
    const m = JSON.parse(readFileSync(file, "utf8"));
    const lines = [`TASK ${workshop}/${task}`, `  model ${m.provider?.model ?? "?"}, settings ${JSON.stringify(m.provider?.settings ?? null)}, profile ${m.profile?.name ?? JSON.stringify(m.profile ?? null)}, started ${m.startedAt}, ended ${m.ended ?? m.state}`];
    lines.push("  steps: " + m.steps.map((s) => `${s.n} ${s.capability} ${s.outcome}${s.tokens ? ` (${s.tokens.prompt}/${s.tokens.completion} tokens)` : ""}`).join("; "));
    const notDone = m.steps.filter((s) => s.outcome !== "completed").slice(0, 3);
    for (const s of notDone) {
        const next = m.steps.find((x) => x.n > s.n && x.capability.split(".")[0] === s.capability.split(".")[0] && x.input !== undefined);
        lines.push(`  STEP ${s.n} ${s.capability}: ${s.outcome}`);
        lines.push(`    reason: ${cut(s.reason, 4000)}`);
        if (s.input !== undefined) lines.push(`    what was sent: ${cut(s.input, 7000)}`);
        if (next) {
            lines.push(`  STEP ${next.n} ${next.capability} (the next one): ${next.outcome}${next.outcome !== "completed" ? `, reason: ${cut(next.reason, 2000)}` : ""}`);
            lines.push(`    what was sent: ${cut(next.input, 7000)}`);
        }
        for (const p of problemsOfReason(String(s.reason ?? ""))) for (const text of [p.kind ? `${p.kind}: ${p.says}` : p.says, p.says]) for (const c of codesOf(register, text)) codes.add(c);
    }
    return lines.join("\n") + "\n";
}

function rulesPart(codes) {
    const out = [];
    for (const code of codes) {
        const r = register.rules.find((x) => x.code === code);
        if (!r) continue;
        out.push(`RULE ${r.code}: status ${r.status}${r.signed ? ", a rule of the signed document" : ""}${r.concerns ? `, about the ${r.concerns}` : ""}${r.note ? `; note: ${r.note}` : ""}`);
        if (r.says) out.push(`  its words: ${r.says}`);
        for (const c of r.applies) {
            const conv = register.conventions[c];
            out.push(`  assumes the convention ${c}${conv?.note ? `: ${conv.note}` : ""}`);
            for (const s of conv?.states ?? []) out.push(`    stated today in ${statementFile(s)}${s.pointer ? `#${s.pointer}` : ""}: ${statementPresent(s)}`);
        }
        if (!r.states.length) out.push("  stated in no text of the contract today");
        for (const s of r.states) out.push(`  stated today in ${statementFile(s)}${s.pointer ? `#${s.pointer}` : ""}: ${statementPresent(s)}`);
    }
    return out.join("\n");
}
function statementPresent(s) {
    const f = path.join(root, ...statementFile(s).split("/"));
    const text = existsSync(f) ? statementText(s, readFileSync(f, "utf8")) : null;
    if (!text) return `the phrase "${s.phrase}" is absent today`;
    // A whole file (no pointer) is shown around the phrase, not from its start.
    const at = text.indexOf(s.phrase);
    return at < 0 || text.length <= 600 ? `"${cut(text, 600)}"` : `"... ${text.slice(Math.max(0, at - 250), at + s.phrase.length + 250)} ..."`;
}

function packOf(label) {
    const { evaluation } = corpora[label.corpus];
    const f = evaluation.findings.find((x) => x.id === label.lead);
    if (!f) return null;
    const codes = new Set();
    const tasks = f.tasks.slice(0, 3).map((t) => taskPart(label.corpus, t, codes)).join("\n");
    return [
        `LEAD ${f.id} (detector ${f.detector})`,
        `what the detector says: ${f.title}`,
        `the class it proposes: ${f.class}; it asks for a recommendation: ${f.recommend}; settled later by: ${f.settledBy ?? "nothing"}`,
        `its path in the graph: ${f.path.join(" / ")}`,
        `its evidence: ${cut(f.evidence, 5000)}`,
        `its tasks: ${f.tasks.length} (${Object.entries(f.models).map(([m, n]) => `${m} ${n}`).join(", ")}); the first three follow`,
        "",
        tasks,
        "RULES OF THE GUARD THESE REFUSALS FALL UNDER (the register, as of today)",
        rulesPart(codes) || "  none recognised",
        "",
        "FACTS OF THE LIBRARY (today)",
        facts.join("\n"),
        "",
        `TODAY: the repository is at ${head}; the tasks above ran earlier, under the texts of their own time.`,
    ].join("\n");
}

const instructions = `You diagnose leads raised by a scripted evaluator over the tasks of a governed agent harness. Models write commissioning procedures for a CO2 scrubber; a deterministic guard refuses what breaks the contract and says why; the model then revises. The evaluator's detectors read these refusals and corrections and raise leads, for example "a rule the models learn by being refused" or "a call cut at the output limit". A lead is a hypothesis, not a verdict.

Read the evidence pack and say what really happened. Rules:
- Compare what was sent before and after a refusal field by field, constant by constant. A justification is keyed by its path (constant): check that the path names the constant its value and reason describe, and whether paths were renumbered between two submissions.
- Read the refusal's words as the model received them, and say whether they were true and sufficient.
- Separate what you see in the pack from what you infer. Never invent a value or a cause the pack does not support; say unsure instead.
- Judge whether the problem is still true today from the rules' statements of today and the facts of today, not from the time of the tasks.

Answer with one JSON object and nothing else:
{
  "verdict": "right | wrong | stale | unsure",
  "cause": "what really happened and why, in a few sentences",
  "class": "contract-gap | model-error | harness-artefact | library-gap | improvement | mixed | none | unknown",
  "current": "still | closed | unknown",
  "evidence": [{ "claim": "one thing you rest on", "where": "task id and step, or rule code, or fact id" }],
  "doubts": "what the pack does not let you settle"
}
verdict: right when the detector's reading is correct and points at something real; wrong when its reading is incorrect (the cause is not what it says); stale when it was true but has been fixed since, so acting on it now would ask for what is done; unsure when the pack does not let you tell.
class: contract-gap, a rule the guard enforces that the texts the model read did not state (or stated misleadingly, the refusal's own words included); model-error, the texts stated it and the model did not follow; harness-artefact, the harness itself caused it (a cut, a lost session, a wrong message of the harness before any guard); library-gap, a fact or document of the library missing or unsigned; improvement, a change that made things better; mixed, several of these at once; none, nothing to act on; unknown.`;

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const outDir = path.join(root, "outputs", "evaluator-trials", `${stamp}-${path.basename(profileFile, ".json")}`);
mkdirSync(outDir, { recursive: true });
const profile = JSON.parse(readFileSync(path.join(root, profileFile), "utf8"));

const chosen = labels.filter((l) => l.certainty === "established" && corpora[l.corpus].evaluation.findings.some((f) => f.id === l.lead) && (!only || l.lead === only));
const parse = (text) => {
    const m = text.match(/\{[\s\S]*\}/);
    try {
        return m ? JSON.parse(m[0]) : null;
    } catch {
        return null;
    }
};
const results = [];
await Promise.all(
    [0, 1, 2, 3].map(async (lane) => {
        for (let i = lane; i < chosen.length; i += 4) {
            const l = chosen[i];
            const pack = packOf(l);
            const name = `${l.corpus}__${l.lead.replace(/[^A-Za-z0-9_.-]/g, "-")}`;
            writeFileSync(path.join(outDir, `${name}.pack.txt`), pack);
            if (packsOnly) {
                results.push({ corpus: l.corpus, lead: l.lead, packChars: pack.length });
                continue;
            }
            let answer = null, raw = "", error = null, tokens = null, model = null;
            try {
                const c = await composeText(profile, { instructions, context: pack, maxTokens: 12000, timeoutMs: 300000 });
                raw = c.text;
                tokens = c.tokens;
                model = c.model;
                answer = parse(raw);
            } catch (e) {
                error = String(e?.message ?? e);
            }
            writeFileSync(path.join(outDir, `${name}.answer.txt`), raw || error || "");
            results.push({ corpus: l.corpus, lead: l.lead, model, tokens, packChars: pack.length, error, answer, label: { verdict: l.verdict, class: l.class, current: l.current, cause: l.cause } });
            console.log(`${l.lead.padEnd(28)} ${error ? `error: ${error}` : `${answer?.verdict ?? "?"} / label ${l.verdict}`}`);
        }
    }),
);
results.sort((a, b) => `${a.corpus}${a.lead}`.localeCompare(`${b.corpus}${b.lead}`));
writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ profile: profileFile, head, instructions, results }, null, 2));
if (!packsOnly) {
    const answered = results.filter((r) => r.answer);
    const same = (k) => answered.filter((r) => r.answer[k] === r.label[k]).length;
    const tokens = results.reduce((s, r) => ({ prompt: s.prompt + (r.tokens?.prompt ?? 0), completion: s.completion + (r.tokens?.completion ?? 0) }), { prompt: 0, completion: 0 });
    console.log(`\n${answered.length} answered of ${results.length}; verdict as the label ${same("verdict")}, class ${same("class")}, current ${same("current")}; tokens ${tokens.prompt} in, ${tokens.completion} out`);
    const rightAsJudged = answered.filter((r) => r.answer.verdict === "right").length;
    console.log(`the reasoner says right ${rightAsJudged} times; the detectors are right ${results.filter((r) => r.label.verdict === "right").length} times in ${results.length}`);
}
console.log(outDir);
