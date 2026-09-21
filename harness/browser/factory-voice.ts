/**
 * The words about a factory task, for the Control Board's voice and the
 * factory's page: the sentences are the `phrases` of the factory slot's
 * grammar (`slots/factory/grammars/default/<locale>.json`, one file per
 * language, the same keys and holes in each, checked when the slot
 * publishes), and a page reads them on its own MCP session with the slot,
 * as `grammar://phrases` (mcp-core 1.2.0), in the language it announced.
 * This module holds no sentence (`words.ts` reads the resource): it knows
 * which key a step, an end or a stage calls for and which values fill its
 * holes. A value the manifest does not hold reads "?"; a key the wording
 * lacks reads as the key.
 *
 * Built as `dashboard/agent/factory-voice.js` for the board (plain JS) and
 * bundled into the factory's page.
 */
import type { Words } from "./words.js";

export { loadWords, NO_WORDS, type PhrasesSession, type Words } from "./words.js";

/** A step of the manifest, as the readers see it over the wire (`harness/core/manifest.ts`, `ManifestStep`). */
export interface ManifestStepLike {
    n?: number;
    source?: string;
    capability?: string | null;
    input?: unknown;
    outcome?: string;
    summary?: unknown;
    reward?: number | null;
    reason?: string | null;
    ms?: number;
    tokens?: { total?: number } | null;
}

export interface TaskStatusLike {
    state?: string;
    /** Lists may arrive as arrays or as the manifest's `[N items]` mark when the summary did not keep them. */
    manifest?: { steps?: unknown[] | string; artifacts?: unknown[] | string; proposal?: { proposalId?: string } | null; ended?: string | null } | null;
}

const num = (v: unknown, digits = 4): string => (typeof v === "number" && Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(digits).replace(/\.?0+$/, "")) : "?");
/** A count, from an array or from the manifest's `[N items]` mark for a list it did not keep. */
const count = (v: unknown): string => {
    if (Array.isArray(v)) return String(v.length);
    const m = typeof v === "string" ? /^\[(\d+) items\]$/.exec(v) : null;
    return m ? m[1] : "?";
};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const valueOf = (step: ManifestStepLike): Record<string, unknown> => record(record(step.summary).value);
/** A tool's reason without the wire's prefix (`device refused: ...`): the sentence already says who refused. */
const plainReason = (reason: unknown, fallback: string): string => (typeof reason === "string" && reason ? reason.replace(/^(device refused|policy deny|error):\s*/i, "") : fallback);

/** One sentence for one step of the manifest. */
export function stepSentence(words: Words, step: ManifestStepLike | undefined): string {
    if (!step) return "";
    const p = (key: string, values: Record<string, unknown> = {}) => words.phrase(key, values);
    const noReason = p("noReason");
    const capability = step.capability ?? p("aCall");
    const replayed = step.source === "policy" ? p("replayed") : "";
    if (step.source === "refused") return p("step.refused", { capability, reason: plainReason(step.reason, noReason) });
    if (step.source === "failed") return p("step.failed", { reason: plainReason(step.reason, noReason) });
    if (step.outcome !== "completed") return p("step.notCompleted", { capability, outcome: step.outcome ?? "?", reason: plainReason(step.reason, noReason) });
    const v = valueOf(step);
    const input = record(step.input);
    switch (step.capability) {
        case "twin.registry_search":
            return p("step.twin.registry_search", { matches: count(v.matches), signed: num(v.signed), total: num(v.total), replayed });
        case "task.plan": {
            const selected = list(input.selected_nodes).map(String);
            const missing = list(input.missing_capabilities).map((m) => String(record(m).required_output ?? "?"));
            return p("step.task.plan", {
                selectedCount: selected.length,
                selectedList: selected.length ? p("step.task.plan.selectedList", { selected: selected.join(", ") }) : "",
                missing: missing.length ? p("step.task.plan.missing", { missing: missing.join(", ") }) : p("step.task.plan.nothingMissing"),
                recipe: replayed ? p("step.task.plan.recipe") : "",
            });
        }
        case "workspace.list":
            return p("step.workspace.list", { files: count(v.files), replayed });
        case "workspace.read":
            return p("step.workspace.read", { path: input.path ?? p("aFile"), replayed });
        case "workspace.write":
            return p("step.workspace.write", { path: input.path ?? p("aFile"), replayed });
        case "model.fit": {
            const q = record(v.quality);
            return p("step.model.fit", { rows: num(q.rows), kept: num(q.kept), rmse: num(q.rmse), worst: num(q.worstCaseError), parity: record(v.parity).ok ? p("parity.ok") : p("parity.notOk"), replayed });
        }
        case "model.inspect":
            return p("step.model.inspect", { inputs: count(v.inputs), outputs: count(v.outputs), bytes: num(v.bytes), replayed });
        case "model.contract":
            return v.ok ? p("step.model.contract.ok", { replayed }) : p("step.model.contract.refused", { error: v.error ?? noReason });
        case "task.fail":
            // The reason was said by the call that failed just before; saying it again is noise.
            return p("step.task.fail");
        case "task.done":
            if (step.reward === -1) return p("step.task.done.disputed", { problems: String(step.reason ?? "").replace(/^contract not held:\s*/, "") || noReason });
            return p("step.task.done", { replayed, summary: input.summary ?? "" });
        default:
            return p("step.default", { capability, replayed });
    }
}

/** When the task ends: what `factory.task` says of it. */
export function endSentence(words: Words, status: TaskStatusLike | undefined): string {
    const m = status?.manifest ?? {};
    const p = (key: string, values: Record<string, unknown> = {}) => words.phrase(key, values);
    switch (status?.state) {
        case "proposed":
            return p("end.proposed", { proposalId: m.proposal?.proposalId ?? "?", artifacts: count(m.artifacts), steps: count(m.steps) });
        case "done":
            return p("end.done", { steps: count(m.steps) });
        case "failed": {
            // A builder that gave up said why in its last step: the end does not repeat it.
            const steps = Array.isArray(m.steps) ? (m.steps as ManifestStepLike[]) : [];
            if (steps.at(-1)?.capability === "task.fail") return p("end.failed.gaveUp");
            return p("end.failed", { ended: m.ended ?? p("noReason") });
        }
        default:
            return p("end.other", { state: status?.state ?? "?" });
    }
}

/** The sentence of a stage as it lights on the factory's page, and its short form: `stage.<stage>` and `stage.<stage>.now`, the gate by the branch taken. */
export function stageSentence(words: Words, stage: string, values: Record<string, unknown>, next?: string): [string, string] {
    const key = stage === "gate" ? (next === "merge" ? "stage.gate.replayed" : "stage.gate.ask") : `stage.${stage}`;
    if (words.getPhrase(key) === undefined) return [stage, stage];
    return [words.phrase(key, values), words.phrase(`${key}.now`, values)];
}
