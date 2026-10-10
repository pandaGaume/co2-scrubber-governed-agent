/**
 * The scripted constructor of the `observer` topic (2026-10-10): plays the Observer's first line without a language model,
 * so the topic runs through the harness without a key. A request is what a description says in words; a script does not
 * read words, so it reads the first document the description names (or the first of the library), and leaves the request
 * to a model.
 *
 *   nothing read            library.read: the document the description names, the first of the library otherwise;
 *   after the read          task.fail: the request is a model's to write.
 */
import type { PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import { decide, ScriptedBuilderBase, type ScriptContext } from "../../harness/core/scripted-base.js";
import { observationOf } from "../../harness/topics/observer/index.js";

export class ScriptedObserverBuilder extends ScriptedBuilderBase {
    constructor(options: ScriptContext) {
        super("observer", options);
    }

    protected next(_state: PolicyFallbackInput["state"]): PolicyDecision {
        const o = observationOf(this.options.task);
        if (!this.read("library.read")) {
            const doc = o.documents.find((d) => o.description.includes(d.id)) ?? o.documents[0];
            if (doc) return decide("library.read", { id: doc.id }, `what the description leaves open: ${doc.id}`);
        }
        return decide("task.fail", { reason: "a TWIN_FACTORY_REQUEST is written from the words of a description: the script reads, a model writes it (builder \"reasoner\")" }, "the request is a model's");
    }
}
