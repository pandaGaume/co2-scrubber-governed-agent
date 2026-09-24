/**
 * The TWIN_FACTORY_REQUEST: what the Observer writes, and the only thing
 * the factory receives from it. It says what the twin must represent,
 * receive, simulate and expose, and how it will be judged against the
 * real; it never says how to build it. The factory reads it with the node
 * catalogue, which the Observer never sees, so a problem is not formulated
 * in terms of what is already buildable: with the same request, a richer
 * catalogue gives a better graph.
 *
 * The guard below is code, no model, and holds three rules:
 *
 *   shape        the sections a request cannot do without (objective,
 *                entities, observables, inputs, outputs, behaviours,
 *                validation), every quantity with its unit;
 *   separation   no node type of the catalogue named anywhere in it (an id
 *                such as `Physics.LifeSupport:cabin-air`): the Observer
 *                states needs, the factory chooses nodes;
 *   facts        an observable or an input said to come from the telemetry
 *                names a column the telemetry has: the Observer does not
 *                invent a measurement.
 */

export interface Quantity {
    name: string;
    quantity: string;
    unit: string;
}

export interface TwinFactoryRequest {
    objective: string;
    entities: Array<{ name: string; kind?: string; description?: string }>;
    relationships?: Array<{ from: string; to: string; relation: string }>;
    observables: Array<Quantity & { column?: string }>;
    controls?: Array<Quantity & { column?: string; range?: [number, number] }>;
    external_influences?: Array<{ name: string; quantity?: string; unit?: string; column?: string }>;
    inputs: Array<Quantity & { column?: string }>;
    outputs: Array<Quantity & { horizonMinutes?: number }>;
    required_behaviors: string[];
    constraints?: string[];
    missing_information?: string[];
    assumptions?: string[];
    validation: { criteria: string[]; compare?: Array<{ output: string; against: string }> };
}

const Q = { type: "object", properties: { name: { type: "string" }, quantity: { type: "string" }, unit: { type: "string" }, column: { type: "string", description: "the telemetry column it is read from, when it is measured" } }, required: ["name", "quantity", "unit"] } as const;

export const TWIN_REQUEST_SCHEMA = {
    type: "object",
    properties: {
        objective: { type: "string", minLength: 1, description: "What the twin must be able to do, in one or two sentences." },
        entities: { type: "array", items: { type: "object", properties: { name: { type: "string" }, kind: { type: "string" }, description: { type: "string" } }, required: ["name"] }, description: "The physical things the twin represents." },
        relationships: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, relation: { type: "string" } }, required: ["from", "to", "relation"] }, description: "How the entities act on one another." },
        observables: { type: "array", items: Q, description: "The state variables that can be observed." },
        controls: { type: "array", items: Q, description: "What an operator or an agent can set." },
        external_influences: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "string" }, unit: { type: "string" }, column: { type: "string" } }, required: ["name"] }, description: "What acts on the system from outside it." },
        inputs: { type: "array", items: Q, description: "What the twin must receive." },
        outputs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "string" }, unit: { type: "string" }, horizonMinutes: { type: "number" } }, required: ["name", "quantity", "unit"] }, description: "What the twin must expose." },
        required_behaviors: { type: "array", items: { type: "string" }, description: "The dynamic behaviours the twin must reproduce." },
        constraints: { type: "array", items: { type: "string" }, description: "Known limits and conditions." },
        missing_information: { type: "array", items: { type: "string" }, description: "What the description and the telemetry do not say." },
        assumptions: { type: "array", items: { type: "string" }, description: "What is assumed in its place, said as assumed." },
        validation: {
            type: "object",
            properties: { criteria: { type: "array", items: { type: "string" } }, compare: { type: "array", items: { type: "object", properties: { output: { type: "string" }, against: { type: "string" } }, required: ["output", "against"] } } },
            required: ["criteria"],
            description: "How the twin will be judged against the real: criteria, and which output is compared with which measurement.",
        },
    },
    required: ["objective", "entities", "observables", "inputs", "outputs", "required_behaviors", "validation"],
} as const;

/** A node type id of the catalogue, as the runtime names them: `Category.Sub:name`. */
const NODE_ID = /\b[A-Z][A-Za-z0-9]*\.[A-Za-z0-9]+(\.[A-Za-z0-9]+)*:[a-z0-9][a-z0-9-]*\b/g;

export interface RequestCheck {
    ok: boolean;
    problems: string[];
}

/** The guard of a request: the shape, the separation from the catalogue, and the facts of the telemetry. */
export function checkTwinRequest(input: unknown, context: { catalogueTypes?: string[]; telemetryColumns?: string[] } = {}): RequestCheck {
    const problems: string[] = [];
    const r = (input && typeof input === "object" ? input : {}) as Partial<TwinFactoryRequest>;
    const list = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
    if (typeof r.objective !== "string" || !r.objective.trim()) problems.push("shape: no objective");
    for (const section of ["entities", "observables", "inputs", "outputs", "required_behaviors"] as const) if (!list(r[section] as unknown[]).length) problems.push(`shape: "${section}" is empty`);
    if (!list(r.validation?.criteria).length) problems.push("shape: no validation criterion: a twin that is not compared with the real cannot be judged");
    for (const section of ["observables", "controls", "inputs", "outputs"] as const) {
        for (const q of list(r[section] as Quantity[] | undefined)) if (!q?.quantity || !q?.unit) problems.push(`shape: ${section} "${String(q?.name)}" does not say its quantity and unit`);
    }

    // Separation: the Observer states needs, it never names what the catalogue already holds.
    const text = JSON.stringify(r);
    const named = new Set<string>([...(text.match(NODE_ID) ?? []), ...list(context.catalogueTypes).filter((t) => text.includes(t))]);
    if (named.size) problems.push(`separation: the request names node types of the catalogue (${[...named].slice(0, 5).join(", ")}); state what the twin must do, the factory chooses the nodes`);

    // Facts: a column named must be one the telemetry has.
    const columns = context.telemetryColumns;
    if (columns) {
        for (const section of ["observables", "controls", "inputs", "external_influences"] as const) {
            for (const q of list(r[section] as Array<{ name?: string; column?: string }> | undefined)) if (q?.column && !columns.includes(q.column)) problems.push(`facts: ${section} "${String(q.name)}" is read from column "${q.column}", which the telemetry does not have (${columns.join(", ") || "no column"})`);
        }
    }
    return { ok: problems.length === 0, problems };
}

/** The factory's functional contract, from a request: the outputs as required outputs, the rest carried whole as the requirements. */
export function factoryContractOf(request: TwinFactoryRequest): { objective: { required_outputs: Array<{ name: string; quantity: string; unit: string; horizonMinutes?: number }>; constraints: Record<string, unknown> }; observations: Record<string, unknown>; requirements: TwinFactoryRequest } {
    return {
        objective: { required_outputs: request.outputs.map((o) => ({ name: o.name, quantity: o.quantity, unit: o.unit, ...(o.horizonMinutes ? { horizonMinutes: o.horizonMinutes } : {}) })), constraints: { validation: request.validation } },
        observations: { entities: request.entities.map((e) => e.name), observables: request.observables.map((o) => o.name), controls: (request.controls ?? []).map((c) => c.name) },
        requirements: request,
    };
}
