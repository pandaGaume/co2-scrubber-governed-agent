/**
 * The scripted constructor of the `playbook` topic (2026-09-29): plays the model's lines without a language model,
 * so a playbook is written, checked by the guard, proposed to the station and put before an authorised signatory
 * without a key.
 *
 * The change it knows how to make is the one the task's observations give its hook (`script.bound`: a bound of the
 * base playbook set to another number, with why), as the graph script's `declareMissing`: a script does not read a
 * change written in words.
 *
 *   plan, nothing done     task.plan: the playbook is written here, the output missing, to the topic "playbook";
 *   build, after the plan  playbook.submit: the base, its bound changed, the bound's number justified by the change asked;
 *   after a refusal        task.fail with the guard's reasons;
 *   after the acceptance   task.done with the accepted file.
 */
import { readFileSync } from "node:fs";
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import { fromRoot } from "../../lib/paths.js";
import { decide, ScriptedBuilderBase, valueOf, type ScriptContext } from "../../harness/core/scripted-base.js";
import { askedOf, boundsOf } from "../../harness/topics/playbook/index.js";
import type { PlaybookFile } from "../../harness/core/conduct.js";

export class ScriptedPlaybookBuilder extends ScriptedBuilderBase {
    constructor(options: ScriptContext) {
        super("playbook", options);
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
                    { selected_nodes: [], missing_capabilities: task.objective.required_outputs.map((o) => ({ required_output: o.name, quantity: o.quantity, ...(o.unit ? { unit: o.unit } : {}), reason: "a playbook is written, not taken from the catalogue", topic: "playbook" })) },
                    "the playbook is written here",
                );
            case "build:task.plan": {
                const base = (asked.base ? JSON.parse(readFileSync(fromRoot(...asked.base.split("/")), "utf8")) : { nodes: [], links: [] }) as PlaybookFile;
                const hook = ((task.observations ?? {}) as { script?: { bound?: { node: string; atLeast: number; why?: string } } }).script?.bound;
                const playbook: PlaybookFile = {
                    ...base,
                    nodes: base.nodes.map((n) => (hook && n.id === hook.node ? { ...n, bag: { ...(n.bag ?? {}), atLeast: hook.atLeast, ...(hook.why ? { why: hook.why } : {}) } } : n)),
                };
                const submission = { id: asked.id, title: asked.title, summary: `${asked.title}: the base ${asked.base ?? "(none)"}${hook ? `, its bound ${hook.node} at ${hook.atLeast}` : ""}.`, playbook };
                const justifications = boundsOf(submission).map((c) => ({ constant: c.constant, value: c.value, source: "assumed", reference: `the change asked: ${asked.change}`, reason: hook && c.constant === `nodes.${hook.node}.atLeast` ? "the number the change asks" : "kept from the base playbook" }));
                return decide("playbook.submit", { ...submission, justifications } as unknown as JsonValue, hook ? `the base with ${hook.node} at ${hook.atLeast}` : "the base as it is");
            }
            default: {
                const accepted = valueOf(last) as { path?: string; value?: { path?: string } };
                const path = accepted.value?.path ?? accepted.path;
                if (!path) return decide("task.fail", { reason: `the playbook was not accepted: ${String(last?.result.error ?? "no acceptance")}` }, "the guard refused the playbook");
                return decide("task.done", { summary: `the playbook ${asked.id}, accepted by the guard`, artifacts: [{ kind: "playbook", path }] }, "the playbook is accepted");
            }
        }
    }
}
