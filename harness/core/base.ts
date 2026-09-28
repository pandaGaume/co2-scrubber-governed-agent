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
 * `tests/conformance.test.ts` checks every topic against it.
 */
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
    "task.plan",
    "task.done",
    "task.fail",
    "task.ask",
];
