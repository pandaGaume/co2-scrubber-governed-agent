/**
 * The scripted constructor of the `recommendation` topic (2026-10-01, E3): plays the model's lines without a language model, so a
 * recommendation is written, checked by the guard, proposed to the station and put before an authorised signatory without a key.
 *
 * What it knows how to write, from the finding alone (a script does not write prose):
 *
 *   a memory entry the contract now states   retire it, the statements that state its rule as the reason;
 *   a document of the library in question    a person reads it and signs it;
 *   a rule of the signed document said       its own words added to the first text the state offers, a sentence of their own;
 *   nowhere, or said and not followed
 *   a schema's refusal by the harness        what the schema asks (data/<field> must be <type>) added to the capability's
 *                                            description, a sentence of its own
 *   anything else                            task.fail: nothing a script can write.
 *
 * The task's observations may give it the whole proposal instead (`script.recommendation`), as the playbook script's hook.
 *
 *   plan, nothing done     task.plan: the recommendation is written here, the output missing, to the topic "recommendation";
 *   build, after the plan  recommendation.propose, its verification the finding's cases, five tasks at least, justified;
 *   after a refusal        task.fail with the guard's reasons;
 *   after the acceptance   task.done with the accepted file.
 */
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import { decide, ScriptedBuilderBase, valueOf, type ScriptContext } from "../../harness/core/scripted-base.js";
import { askedOf, kindsFor, RECOMMENDATION_FORMAT, textNow, type Asked, type Proposal } from "../../harness/topics/recommendation/index.js";

/** A rule's own words as a sentence of a contract: its first letter up, its end a full stop. */
const sentence = (says: string): string => {
    const s = says.trim().replace(/[.;:,]+$/, "");
    return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
};

/** What the script proposes for a finding, without its verification; null when it has nothing to write. */
export function scriptedProposal(asked: Asked): Omit<Proposal, "verification" | "justifications" | "id"> | null {
    const kinds = kindsFor(asked.finding);
    const evidence = (asked.finding.evidence ?? {}) as { statedNow?: string[] };
    if (asked.memory && kinds.includes("memory"))
        return {
            kind: "memory",
            target: { memory: asked.memory.id },
            action: "retire",
            current: null,
            proposed: `Retire the entry: the contract states its rule now (${(evidence.statedNow ?? []).join("; ") || "see the finding"}), so the memory no longer has to.`,
            why: asked.finding.title,
            effect: "the rule is read in the contract by every model, with or without the memory; the entry's mistake stays at zero",
            changesAcceptance: false,
        };
    if (asked.library?.documents.length && kinds.includes("library"))
        return {
            kind: "library",
            target: { library: asked.library.documents[0] },
            action: "sign",
            current: null,
            proposed: `A person reads ${asked.library.documents[0]} and signs it, or says which of its facts must change first.`,
            why: asked.finding.title,
            effect: "the facts of the document can be cited; the refusals for its signature stop",
            changesAcceptance: false,
        };
    const target = asked.targets.find((t) => t.text !== null && (t.pointer || t.file.endsWith(".md")));
    const schema = asked.measures.map((m) => /data\/(\S+) must be (\w+)/.exec(m)).find(Boolean);
    const described = asked.targets.find((t) => t.text !== null && /^\/capabilities\//.test(t.pointer ?? ""));
    if (!asked.rule && schema && described && kinds.includes("contract"))
        return {
            kind: "contract",
            target: { file: described.file, pointer: described.pointer },
            action: "append",
            current: textNow(described.file, described.pointer),
            proposed: ` In its arguments, ${schema[1].split("/").join(".")} is ${schema[2] === "array" ? "an array, even of one element" : `a value of type ${schema[2]}`}.`,
            why: asked.finding.title,
            effect: `the harness refuses the arguments of this capability no more for ${schema[1]}`,
            changesAcceptance: false,
        };
    if (asked.rule?.says && target && kinds.includes("contract"))
        return {
            kind: "contract",
            target: { file: target.file, ...(target.pointer ? { pointer: target.pointer } : {}) },
            action: "append",
            current: textNow(target.file, target.pointer),
            proposed: ` ${sentence(asked.rule.says)}`,
            why: asked.finding.title,
            effect: `the rule ${asked.rule.code} said where the models read it: refused at no first try`,
            changesAcceptance: false,
        };
    return null;
}

export class ScriptedRecommendationBuilder extends ScriptedBuilderBase {
    constructor(options: ScriptContext) {
        super("recommendation", options);
    }

    protected next(state: PolicyFallbackInput["state"]): PolicyDecision {
        const { task } = this.options;
        const asked = askedOf(task);
        const after = `${String(state.features.phase)}:${String(state.features.lastCapability)}`;
        const last = this.last;
        switch (after) {
            case "plan:":
                return decide(
                    "task.plan",
                    { selected_nodes: [], missing_capabilities: task.objective.required_outputs.map((o) => ({ required_output: o.name, quantity: o.quantity, ...(o.unit ? { unit: o.unit } : {}), reason: "a recommendation is written, not taken from the catalogue", topic: "recommendation" })) },
                    "the recommendation is written here",
                );
            case "build:task.plan": {
                const hook = ((task.observations ?? {}) as { script?: { recommendation?: Partial<Proposal> } }).script?.recommendation;
                const drafted = scriptedProposal(asked);
                if (!drafted && !hook) return decide("task.fail", { reason: `nothing a script can write for the finding ${asked.finding.id} (${asked.finding.class})` }, "no recommendation a script writes");
                const tasks = Math.max(RECOMMENDATION_FORMAT.verification.minTasks, asked.cases.length);
                const verification = { replay: asked.cases.slice(0, Math.max(1, asked.cases.length)), models: asked.models, tasks, measure: `${asked.measures[0] ?? asked.finding.id} at the first try` };
                const justifications = [{ constant: "verification.tasks", value: tasks, source: "derived", reference: `tasks = max(${RECOMMENDATION_FORMAT.verification.minTasks}, the ${asked.cases.length} case(s) of the finding)`, reason: "every case of the finding, five at least" }];
                const proposal = { id: asked.id, ...drafted, verification, justifications, ...hook };
                return decide("recommendation.propose", proposal as unknown as JsonValue, `a recommendation of kind ${String(proposal.kind)}`);
            }
            default: {
                const accepted = valueOf(last) as { path?: string; value?: { path?: string } };
                const path = accepted.value?.path ?? accepted.path;
                if (!path) return decide("task.fail", { reason: `the recommendation was not accepted: ${String(last?.result.error ?? "no acceptance")}` }, "the guard refused the recommendation");
                return decide("task.done", { summary: `the recommendation ${asked.id}, accepted by the guard`, artifacts: [{ kind: "recommendation", path }] }, "the recommendation is accepted");
            }
        }
    }
}
