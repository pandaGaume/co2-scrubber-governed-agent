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
 * A factory's prompt is three levels (2026-10-09), each said once:
 *
 *   the mission        the topic's own (`specs/<topic>/prompt.md`): what this factory makes, for whom, in this domain
 *   the kernel         how the harness runs any work (`kernel.md`): the marching order, the turn, the calls, the refusals, the end
 *   the policy         the engineering rules every factory keeps (`policy.md`): the safety numbers within their signed bounds,
 *                      the others justified by their source, units never converted by hand
 *
 * No tool is described in a prompt: a tool is described once, in its own definition (its slot's grammar, or the capability's
 * description), which is what the model is given with it. `tests/conformance.test.ts` checks every topic against this.
 */
import { readFileSync } from "node:fs";
import { fromRoot } from "../../lib/paths.js";

/** The kernel and the policy, in the order the model reads them after its mission. */
export const SOCLE_PROMPTS: ReadonlyArray<string> = ["harness/core/kernel.md", "harness/core/policy.md"];

/** A factory's prompt as the model reads it: the mission, then the kernel, then the policy. */
export function promptWithSocle(topicPrompt: string): string {
    return [topicPrompt.trimEnd(), ...SOCLE_PROMPTS.map((file) => readFileSync(fromRoot(file), "utf8").trim())].join("\n\n") + "\n";
}

export const BASE_CAPABILITIES: ReadonlyArray<string> = [
    "library.list",
    "library.methods",
    "library.search",
    "library.read",
    "library.facts",
    "library.justify",
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
