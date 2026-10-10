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

/**
 * What a role reads after its mission when it is not what every factory reads (2026-10-10, the Observer on the factories'
 * harness): the Observer the kernel only, since its numbers are its known constants, each cited by its document and its fact
 * in the request's own schema, never justified in `justifications`; the Contract Supervisor nothing, since it reviews a
 * report and calls none of the socle's tools.
 */
const SOCLE_OF_ROLE: Readonly<Record<string, ReadonlyArray<string>>> = { observer: ["harness/core/kernel.md"], supervisor: [] };

/** The socle's files a role reads after its mission, by the role its prompt file names (`specs/<role>/prompt.md`). */
export function socleOf(promptFile: string): ReadonlyArray<string> {
    const role = /^specs\/([a-z0-9-]+)\/prompt\.md$/.exec(promptFile)?.[1] ?? "";
    return SOCLE_OF_ROLE[role] ?? SOCLE_PROMPTS;
}

/** A role's prompt as the model reads it: the mission, then its socle (every factory: the kernel, then the policy). */
export function promptWithSocle(topicPrompt: string, socle: ReadonlyArray<string> = SOCLE_PROMPTS): string {
    return [topicPrompt.trimEnd(), ...socle.map((file) => readFileSync(fromRoot(file), "utf8").trim())].join("\n\n") + "\n";
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

/**
 * What every stage of a conduct offers beside its own tools (2026-10-10): reading the library, justifying a number, converting a
 * unit, failing, asking. A step sends its stage's tools and these, never the whole catalogue: run 11 sent 18 to 31 tools at every
 * call, 4 000 to 9 000 tokens, more than half of what the model read, for a stage that used 2 to 4. A way out offers its own alone.
 */
export const STAGE_SUPPORT: ReadonlyArray<string> = ["library.read", "library.facts", "library.search", "library.justify", "physics.units_convert", "task.fail", "task.ask"];

/** The socle as tool patterns, one per capability. */
export const BASE_TOOLS: ReadonlyArray<RegExp> = BASE_CAPABILITIES.map((id) => new RegExp(`^${id.replace(/\./g, "\\.")}$`));

/** A topic's tools: the socle's, then its own. */
export const withBase = (own: ReadonlyArray<RegExp>): ReadonlyArray<RegExp> => [...BASE_TOOLS, ...own];
