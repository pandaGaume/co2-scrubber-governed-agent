/**
 * What the harness's core knows of the application it serves, read from
 * `specs/harness/application.json` (2026-09-28, zero domain in the
 * harness): the slot and the tools a result is handed over to and a person
 * asked through, the capabilities a model's plain text becomes, the reads of
 * the application a recipe may replay, how a task's residual thresholds and
 * observations are named, how an application read is reduced for the state,
 * and the core's own sentences. The core names none of them itself.
 */
import type { View } from "./words.js";
// Imported, not read from the disk: the loop's page in the browser speaks through the same core (llm-common), and a browser has no file system.
import application from "../../specs/harness/application.json" with { type: "json" };

export const APPLICATION_FILE = "specs/harness/application.json";

interface Call {
    slot: string;
    tool: string;
}

export interface Application {
    authority: { propose: Call; ask: Call; resume: Call };
    text: { report: string; reportDescription: string; ask: string };
    reads: string[];
    thresholds: { rmse: string[]; absolute: string[]; unit: string };
    observed: Record<string, string>;
    compact: Record<string, View>;
    words: Record<string, string>;
}

const strip = (v: unknown): unknown => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "note").map(([k, x]) => [k, strip(x)])) : v);

export const APP: Application = strip(application) as Application;

/** A sentence of the core, its holes `{name}` filled; a hole nothing fills is left as written. */
export const appSays = (key: string, vars: Record<string, string | number> = {}): string => {
    const template = APP.words[key];
    if (template === undefined) throw new Error(`${APPLICATION_FILE}: no words for "${key}"`);
    return template.replace(/\{([A-Za-z0-9_]+)\}/g, (hole, name: string) => (name in vars ? String(vars[name]) : hole));
};

/** An observation said in one line, by the application's template for its field; the fields the template names, from the item. */
export const observedLine = (field: string, item: Record<string, unknown>): string | null => {
    const template = APP.observed[field];
    if (!template) return null;
    return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_hole, name: string) => (item[name] === undefined || item[name] === null ? "?" : String(item[name])));
};
