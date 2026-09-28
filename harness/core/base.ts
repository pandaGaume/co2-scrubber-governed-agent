/**
 * The socle every factory shares (2026-09-28): what a builder may always
 * reach, whatever the topic. Each topic adds its own tools; these are the
 * same everywhere, so a rule given to one factory (a fact of the library, a
 * page of the web, a conversion between quantities) reaches the others.
 *
 *   the library        the documents, their methods and their typed facts, and
 *                      which of them a person signed
 *   the web            a page nobody chose, cited as such
 *   the units          a unit resolved, converted, checked, and the relations
 *                      between quantities (a volume flow as a mass flow)
 *   the task           its plan, its claim, its failure, its question
 *
 * A model is told of them once, in `socle.md`, which the reasoner adds to
 * every factory's prompt. `tests/conformance.test.ts` checks every topic
 * against it.
 */
import { readFileSync } from "node:fs";
import { fromRoot } from "../../lib/paths.js";

export const SOCLE_PROMPT = "harness/core/socle.md";

/** A factory's prompt as the model reads it: the topic's own, then what every factory reaches. */
export function promptWithSocle(topicPrompt: string): string {
    return `${topicPrompt.trimEnd()}\n\n${readFileSync(fromRoot(SOCLE_PROMPT), "utf8").trim()}\n`;
}

export const BASE_CAPABILITIES: ReadonlyArray<string> = [
    "library.list",
    "library.methods",
    "library.search",
    "library.read",
    "library.facts",
    "web.search",
    "physics.units_normalize",
    "physics.units_convert",
    "physics.units_compatible",
    "physics.units_validate_connection",
    "physics.units_relations",
    "physics.units_relate",
    "physics.units_knowledge",
    "task.plan",
    "task.done",
    "task.fail",
    "task.ask",
];

/** The socle as tool patterns, one per capability. */
export const BASE_TOOLS: ReadonlyArray<RegExp> = BASE_CAPABILITIES.map((id) => new RegExp(`^${id.replace(/\./g, "\\.")}$`));

/** A topic's tools: the socle's, then its own. */
export const withBase = (own: ReadonlyArray<RegExp>): ReadonlyArray<RegExp> => [...BASE_TOOLS, ...own];
