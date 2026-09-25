/**
 * The habitat twin as a function: the library's habitat graph, instantiated
 * for a question and run for some story minutes. What a question changes
 * without touching the structure:
 *
 *   who is on board       `persons`, each by module and activity (the
 *                         medical monitor's presence, or a what-if: one more
 *                         person in the Lab, everyone asleep); the roster of
 *                         the reference when absent;
 *   the scrubber's numbers  `devices`, the register's, so the twin of this
 *                         scrubber runs with its own effective flow,
 *                         efficiency and lag; the datasheet's when absent;
 *   the installation's    `variables`: the volumes, the filter's loading,
 *                         the operators' rate, as a commissioning fitted them
 *                         (an accepted candidate's variables); the template's
 *                         defaults when absent;
 *   the command           the scrubber's speed over the run, and the two
 *                         volumes' CO2 at the start.
 *
 * The same template the graph factory instantiates (`lib/graph-library.ts`),
 * resolved on rows the question writes (the command as the speed column,
 * the starting CO2 as the sensors' first reading), built through the real
 * registry and run a minute at a time (`lib/habitat.ts`). Every answer says
 * which template it ran, with its sha256, and what it took by default.
 */
import { buildRegistry, type Registry } from "../../lib/registry.js";
import { loadFactory } from "../../lib/factory.js";
import { instantiateTemplate, loadGraphLibrary, type DeviceLike, type GraphLibraryEntry, type PersonSpec } from "../../lib/graph-library.js";
import { HABITAT_GRAPH_ID, readHabitatParameters, runHabitat, type CommandStep, type HabitatRow } from "../../lib/habitat.js";
import { param } from "../../lib/factory.js";
import { resolveSpec, type Spec } from "../../harness/topics/graph/params.js";
import { HABITAT_ACTIVITIES } from "../../plugins/habitat/activity.js";

export interface HabitatQuestion {
    persons?: PersonSpec[];
    devices?: DeviceLike[];
    variables?: Record<string, number>;
    /** The scrubber's command over the run, in story minutes, 0 to 1. */
    command: CommandStep[];
    minutes: number;
    labPpm?: number;
    habbPpm?: number;
}

export interface HabitatAnswer {
    graph: { id: string; template: string; sha256: string };
    persons: PersonSpec[];
    variables: Record<string, number>;
    defaulted: string[];
    fromDevice: Record<string, { path: string; property: string; value: number }>;
    rows: HabitatRow[];
}

let shelf: { entry: GraphLibraryEntry; registry: Registry } | null = null;
function loaded(): { entry: GraphLibraryEntry; registry: Registry } {
    if (shelf) return shelf;
    const entry = loadGraphLibrary().find((g) => g.template.id === HABITAT_GRAPH_ID);
    if (!entry) throw new Error(`the library holds no graph "${HABITAT_GRAPH_ID}" (graphs/${HABITAT_GRAPH_ID}.template.json)`);
    shelf = { entry, registry: buildRegistry() };
    return shelf;
}

/** Checks a list of persons as a caller writes it: a module and an activity each. */
export function checkPersons(persons: unknown): PersonSpec[] | undefined {
    if (persons === undefined || persons === null) return undefined;
    if (!Array.isArray(persons)) throw new Error("persons must be a list of { module, activity } (id, callsign and name when known)");
    return persons.map((p, i) => {
        const x = (p ?? {}) as Partial<PersonSpec>;
        if (typeof x.module !== "string" || !x.module.trim()) throw new Error(`persons[${i}].module must name a module (lab, habB)`);
        if (!(HABITAT_ACTIVITIES as ReadonlyArray<string>).includes(String(x.activity))) throw new Error(`persons[${i}].activity must be one of ${HABITAT_ACTIVITIES.join(", ")}`);
        return { ...(x.id ? { id: String(x.id) } : {}), ...(x.callsign ? { callsign: String(x.callsign) } : {}), ...(x.name ? { name: String(x.name) } : {}), module: x.module.trim(), activity: String(x.activity) };
    });
}

/** The habitat graph run for a question: one row per story minute, the first at minute 0. */
export function runHabitatTwin(q: HabitatQuestion): HabitatAnswer {
    const { entry, registry } = loaded();
    const template = entry.template;
    const inst = instantiateTemplate(template, { persons: q.persons, devices: q.devices, variables: q.variables });
    // The rows the template resolves on: the command as the speed column, minute by minute; the starting CO2 as the sensors' first reading.
    const speedAt = (minute: number) => Math.round(100 * (q.command.find((s) => minute >= s.from && minute < s.to)?.value ?? q.command[q.command.length - 1]?.value ?? 0));
    const parameters = readHabitatParameters();
    const labPpm = q.labPpm ?? param<number>(parameters, "lab.initialCo2Ppm");
    const habbPpm = q.habbPpm ?? param<number>(parameters, "habB.initialCo2Ppm");
    const rows: Array<Record<string, number>> = [];
    for (let m = 0; m <= q.minutes; m++) rows.push({ minute: m, speed_percent: speedAt(m), co2_lab_ppm: labPpm, co2_habb_ppm: habbPpm });
    const spec = resolveSpec(inst.spec as Spec, inst.variables, rows);
    const json = loadFactory().buildDocumentJson(registry, spec.nodes as never, spec.connections as never);
    return {
        graph: { id: template.id, template: template.document, sha256: entry.templateSha256 },
        persons: inst.persons,
        variables: inst.variables,
        defaulted: inst.defaulted,
        fromDevice: inst.fromDevice,
        rows: runHabitat(json, q.minutes, q.command, registry),
    };
}
