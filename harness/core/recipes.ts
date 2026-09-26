/**
 * The recipes: the constructor's memory across tasks (nodes 2, 3 and 12 of
 * docs/harness-stages.fr.md). A task is keyed by its signature, the kind of
 * task rather than the task: the topic, the required outputs by quantity
 * and unit, the names of the constraints. Never the task's id, never the
 * data. The intention the loop is stepped with carries that signature, so
 * the learned decisions of one task are the candidates of the next task of
 * the same kind at the same phase; the harness promotes a decision to a
 * replay after three successful experiences (`plasticity.ts` defaults).
 *
 * The memory is a `PolicyGraph`, loaded from `<recipes dir>/<topic>.json`
 * when the task starts and written back when it ends; the snapshot is the
 * harness's own format.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { PolicyGraph, type Intention, type PolicySnapshot } from "@spiky-panda/harness";
import type { TaskFile, Topic } from "./task.js";

export interface TaskSignature {
    topic: Topic;
    outputs: Array<{ quantity: string; unit: string | null }>;
    constraints: string[];
    /** sha256 (12 hex) of the three above, the id the intention carries. */
    id: string;
}

export function taskSignature(task: TaskFile["task"], topic: Topic): TaskSignature {
    const outputs = task.objective.required_outputs.map((o) => ({ quantity: o.quantity, unit: o.unit ?? null })).sort((a, b) => `${a.quantity}/${a.unit}`.localeCompare(`${b.quantity}/${b.unit}`));
    const constraints = Object.keys(task.objective.constraints ?? {}).sort();
    // A request replayed with generated types in the catalogue is another situation than the same request without them (2026-09-26): a plan learned short of the node must not replay once the node exists, nor the reverse.
    const generated = (Array.isArray((task.observations as { generated?: unknown } | undefined)?.generated) ? ((task.observations as { generated: Array<{ type?: unknown }> }).generated ?? []) : []).map((g) => String(g?.type ?? "")).filter(Boolean).sort();
    const id = createHash("sha256").update(JSON.stringify({ topic, outputs, constraints, ...(generated.length ? { generated } : {}) })).digest("hex").slice(0, 12);
    return { topic, outputs, constraints, id };
}

/** The intention of a task: one per task, the signature as its parameters (the context key), the objective as its description (for a model). */
export function intentionFor(task: TaskFile["task"], signature: TaskSignature): Intention {
    const outputs = task.objective.required_outputs.map((o) => `${o.name} (${o.quantity}${o.unit ? `, ${o.unit}` : ""}${o.horizonMinutes ? `, ${o.horizonMinutes} min ahead` : ""})`).join("; ");
    const constraints = Object.entries(task.objective.constraints ?? {})
        .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
        .join(", ");
    return {
        id: "build",
        description: `Build what produces ${outputs}${constraints ? ` under ${constraints}` : ""}, from the task's data, on topic ${signature.topic}.`,
        parameters: { topic: signature.topic, signature: signature.id },
    };
}

const recipesFile = (dir: string, topic: Topic): string => path.join(dir, `${topic}.json`);

/** The memory of a topic: what earlier tasks learned, or a new one. */
export function loadRecipes(dir: string, topic: Topic): { policy: PolicyGraph; file: string; loaded: boolean; experiences: number } {
    const file = recipesFile(dir, topic);
    if (!existsSync(file)) return { policy: new PolicyGraph(), file, loaded: false, experiences: 0 };
    const snapshot = JSON.parse(readFileSync(file, "utf8")) as PolicySnapshot;
    return { policy: PolicyGraph.fromSnapshot(snapshot), file, loaded: true, experiences: snapshot.experiences.length };
}

export function saveRecipes(dir: string, topic: Topic, policy: PolicyGraph): { file: string; sha256: string; experiences: number } {
    const file = recipesFile(dir, topic);
    mkdirSync(dir, { recursive: true });
    const snapshot = policy.snapshot();
    const text = JSON.stringify(snapshot);
    writeFileSync(file, text + "\n");
    return { file, sha256: createHash("sha256").update(text).digest("hex"), experiences: snapshot.experiences.length };
}
