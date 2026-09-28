/**
 * A factory's words (2026-09-28, zero domain in the harness): every sentence
 * a topic says to its model (its intention, its brief stage by stage, what a
 * requirement asks, its open questions) is a template in the factory's spec
 * (`specs/<topic>/words.json`), not a string of the code. A template names
 * its holes `{name}`; the code fills them from what the task read and
 * decided, and says nothing of its own. A key the code asks for and the file
 * does not hold is a startup problem, said with the file.
 *
 * Also here, the one reshaping a spec may ask of a read before it goes into
 * the state (`viewOf`): some of an object's fields kept, and lists picked
 * from others by a flag, so the state carries what the model needs and not a
 * device's every property.
 */
import { readFileSync } from "node:fs";
import { fromRoot } from "../../lib/paths.js";

export interface Words {
    file: string;
    templates: Record<string, string>;
}

/** Nested objects flattened to dotted keys: { brief: { plan: "..." } } is "brief.plan". */
function flatten(value: unknown, prefix: string, out: Record<string, string>): void {
    if (typeof value === "string") out[prefix] = value;
    else if (value && typeof value === "object" && !Array.isArray(value)) for (const [k, v] of Object.entries(value)) if (k !== "note") flatten(v, prefix ? `${prefix}.${k}` : k, out);
}

/** A factory's words, from a file of the repository (`specs/<topic>/words.json`). */
export function loadWords(file: string): Words {
    const templates: Record<string, string> = {};
    flatten(JSON.parse(readFileSync(fromRoot(...file.split("/")), "utf8")), "", templates);
    return { file, templates };
}

/** A template filled: `{name}` by the value given, a hole left unfilled refused so a sentence never reaches a model half written. */
export function say(words: Words, key: string, vars: Record<string, string | number> = {}): string {
    const template = words.templates[key];
    if (template === undefined) throw new Error(`${words.file}: no words for "${key}"`);
    // A hole is a name: `{...}` or `{"kind": ...}` in a template is text.
    return template.replace(/\{([A-Za-z][A-Za-z0-9_.]*)\}/g, (hole, name: string) => {
        if (!(name in vars)) throw new Error(`${words.file}: "${key}" has a hole {${name}} nothing fills`);
        return String(vars[name]);
    });
}

/** The keys a topic asks for that the file does not hold: what the conformance test reads. */
export const missingWords = (words: Words, keys: string[]): string[] => keys.filter((k) => words.templates[k] === undefined);

/** A read reshaped for the state, as a spec asks: `keep` the fields named, and each of `lists` picked from a list by a flag, with some of its fields. */
export interface View {
    keep?: string[];
    lists?: Record<string, { from: string; where?: string; fields?: string[] }>;
}

export function viewOf(value: unknown, view: View | undefined): unknown {
    if (!view || !value || typeof value !== "object" || Array.isArray(value)) return value;
    const v = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of view.keep ?? []) out[k] = v[k] ?? [];
    for (const [name, pick] of Object.entries(view.lists ?? {})) {
        const list = Array.isArray(v[pick.from]) ? (v[pick.from] as Array<Record<string, unknown>>) : [];
        out[name] = list.filter((x) => x && typeof x === "object" && (!pick.where || Boolean(x[pick.where]))).map((x) => (pick.fields ? Object.fromEntries(pick.fields.filter((f) => f in x).map((f) => [f, x[f]])) : x));
    }
    return out;
}
