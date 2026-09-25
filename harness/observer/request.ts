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
 *                invent a measurement;
 *   vocabulary   an output names its quantity and unit in the vocabulary
 *                the factories share (Concentration in ppm, not "CO2 mole
 *                fraction"): the names of the quantities, never the nodes
 *                that produce them. A factory matches a required output by
 *                its quantity; a name of its own makes the request
 *                unbuildable for a reason that is only words;
 *   provenance   a constant given as known names the library document it
 *                comes from, one the Observer read; and no constraint,
 *                required behaviour or known constant cites a number the
 *                description gives under an assumption (an "apparent"
 *                volume, "one room assumed"): the result of an assumption
 *                is an assumption, and the factory must stay free to find
 *                it false.
 */

import { checkAgainstDocument, compatibleUnits } from "../lib/units.js";
import { checkKnownAgainstFact, type LibraryFact } from "../core/contracts.js";

export interface Quantity {
    name: string;
    quantity: string;
    unit: string;
}

/** A constant the documentation gives: the factory holds it, never fits it. */
export interface KnownConstant {
    /** The short symbol the factory will use as its variable (Qe, tau). */
    symbol: string;
    name: string;
    value: number;
    unit: string;
    /** The quantity, when the unit alone is ambiguous (VolumetricFlow, MassFlow, Concentration). */
    quantity?: string;
    /** The id of the library document that states it. */
    source: string;
    /** The fact's id in the library's typed facts (`library.facts`), when the document states its facts by id: what tells an efficiency from a speed. */
    factId?: string;
    /** The band the documentation gives, when it gives one (a crew's metabolic rate, 5th to 95th percentile): the factory may place the value within it, never outside. */
    min?: number;
    max?: number;
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
    known?: KnownConstant[];
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
        known: {
            type: "array",
            items: { type: "object", properties: { symbol: { type: "string", description: "a short symbol, the variable's name in the twin (Qe, tau)" }, name: { type: "string" }, value: { type: "number" }, unit: { type: "string" }, factId: { type: "string", description: "the fact's id in the library's typed facts (library.facts, or the facts a read document lists), when the document states them: scrubber.singlePassEfficiency, never a symbol of your own" }, source: { type: "string", description: "the id of the library document that states it, one you read" }, min: { type: "number", description: "the low end of the band the documentation gives, when it gives one" }, max: { type: "number", description: "the high end of that band" } }, required: ["symbol", "name", "value", "unit", "source"] },
            description: "The constants the documentation gives (a device's datasheet, the station's metrics), each with its source: the factory holds them and never fits them.",
        },
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
/** A quantity of the shared vocabulary and the units it is written in. */
export interface VocabularyEntry {
    quantity: string;
    units: string[];
}

export interface CheckContext {
    catalogueTypes?: string[];
    telemetryColumns?: string[];
    vocabulary?: VocabularyEntry[];
    /** The library documents the Observer read: a known constant's source must be one of them. */
    documentsRead?: string[];
    /** The text of the documents read, by id: a known constant is checked against what its source states, by the unit system (2026-09-25). */
    documents?: Record<string, string>;
    /** The library's typed facts, by document id: where a document states its facts, a known constant cites one (factId) and is judged against it. */
    facts?: Record<string, LibraryFact[]>;
    /** The description it was given, where a number stated under an assumption is found. */
    description?: string;
}

/** The sentences of a description that state a result under an assumption. */
const HEDGED = /\b(apparent|assum(e|ed|ing)|one room|if there is no|not documented)\b/i;

/** The numbers a description gives only under an assumption: small integers (a count, a step) are left out, they say nothing by themselves. */
export function hedgedNumbers(description: string): number[] {
    const out = new Set<number>();
    for (const sentence of description.split(/(?<=[.;])\s+|\n/)) {
        if (!HEDGED.test(sentence)) continue;
        for (const m of sentence.matchAll(/(?<![\w.])(\d+(?:[.,]\d+)?)/g)) {
            const v = Number(m[1].replace(",", "."));
            if (Number.isFinite(v) && (v >= 10 || !Number.isInteger(v))) out.add(v);
        }
    }
    return [...out];
}

const numbersIn = (text: string): number[] => [...text.matchAll(/(?<![\w.])(\d+(?:[.,]\d+)?)/g)].map((m) => Number(m[1].replace(",", "."))).filter(Number.isFinite);

export function checkTwinRequest(input: unknown, context: CheckContext = {}): RequestCheck {
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

    // Vocabulary: what the twin must expose, named as the factories name quantities.
    const vocabulary = list(context.vocabulary);
    if (vocabulary.length) {
        const names = vocabulary.map((v) => `${v.quantity} (${v.units.join(", ")})`).join("; ");
        for (const o of list(r.outputs)) {
            if (!o?.quantity) continue;
            const entry = vocabulary.find((v) => v.quantity.toLowerCase() === String(o.quantity).toLowerCase());
            if (!entry) problems.push(`vocabulary: output "${String(o.name)}" is a "${o.quantity}", which is not a quantity of the shared vocabulary; name it with one of: ${names}`);
            else if (entry.units.length && o.unit && !entry.units.includes(o.unit)) {
                // Another unit of the same quantity converts (the units service, 2026-09-25): a flow in m3/min where the catalogue writes m3ps is the factory's to convert; a unit of another quantity is not.
                const c = compatibleUnits({ quantity: entry.quantity, unit: o.unit }, { quantity: entry.quantity, unit: entry.units[0] });
                if (!c.ok || !c.compatible) problems.push(`vocabulary: output "${String(o.name)}" is a ${entry.quantity} in "${o.unit}", which is not a unit of that quantity${c.ok ? "" : ` (${c.reason})`}; the shared vocabulary writes it in ${entry.units.join(" or ")}, or any unit that converts to them`);
            }
        }
    }

    // Provenance: a known constant says where it is written, and the Observer read it there.
    for (const k of list(r.known)) {
        if (!k?.symbol || !k?.source || typeof k.value !== "number" || !k.unit) problems.push(`provenance: known constant "${String(k?.name ?? k?.symbol)}" needs its symbol, value, unit and source`);
        else if ((k.min !== undefined || k.max !== undefined) && !(typeof k.min === "number" && typeof k.max === "number" && k.min <= k.value && k.value <= k.max)) problems.push(`provenance: known constant "${k.symbol}" gives a band that does not hold its value (${k.min} to ${k.max} around ${k.value}); a band is a min and a max around the documented value`);
        else if (context.documentsRead && !context.documentsRead.includes(k.source)) problems.push(`provenance: known constant "${k.symbol}" cites "${k.source}", a document you did not read (${context.documentsRead.join(", ") || "none read"}); read it, or put the constant under missing information`);
        else if (context.facts?.[k.source]?.length) {
            // The document states its facts by id: the constant cites one, and is judged against that fact alone (an efficiency is never compared with a speed because both are ratios).
            const facts = context.facts[k.source];
            const fact = k.factId ? facts.find((f) => f.id === k.factId) : undefined;
            if (!k.factId) problems.push(`facts: known constant "${k.symbol}" cites "${k.source}", which states its facts by id: give factId, one of ${facts.map((f) => `${f.id} (${f.semantic}, ${f.value} ${f.unit})`).join(", ")}`);
            else if (!fact) problems.push(`facts: known constant "${k.symbol}" cites fact "${k.factId}", which "${k.source}" does not state; its facts are ${facts.map((f) => f.id).join(", ")}`);
            else {
                const verdict = checkKnownAgainstFact({ value: k.value, unit: k.unit, ...(k.quantity ? { quantity: k.quantity } : {}) }, fact);
                // The same fact stated by the document in another quantity (a crew rate in mass beside the one in volume): the id to cite instead, when the unit written is that one's.
                const twin = /does not convert/.test(verdict.reason) ? facts.find((f) => f.id !== fact.id && f.semantic === fact.semantic && checkKnownAgainstFact({ value: k.value, unit: k.unit }, f).verdict === "OK") : undefined;
                if (verdict.verdict === "CONFLICT") problems.push(`facts: known constant "${k.symbol}" = ${k.value} ${k.unit} conflicts with the fact it cites: ${verdict.reason}; ${twin ? `the document states that fact in ${k.unit} as "${twin.id}" (${twin.value} ${twin.unit}): cite that id` : "copy the fact's value in its unit, or convert it with physics.units_convert"}`);
                else if (verdict.verdict === "UNKNOWN_UNIT") problems.push(`units: known constant "${k.symbol}" is written in "${k.unit}", a unit the unit system does not know (${verdict.reason}); write it in a UCUM unit of its quantity`);
            }
        } else if (context.documents?.[k.source] !== undefined) {
            // A document without typed facts: the value against what the document states, by the unit system; a constant copied in another unit must agree once converted.
            const verdict = checkAgainstDocument({ value: k.value, unit: k.unit, ...(k.quantity ? { quantity: k.quantity } : {}) }, context.documents[k.source]);
            if (verdict.verdict === "INVALID_CONVERSION") problems.push(`units: known constant "${k.symbol}" = ${k.value} ${k.unit} is an INVALID_CONVERSION of what "${k.source}" states: ${verdict.reason}; copy the document's value in the document's unit, or convert it with physics.units_convert`);
            else if (verdict.verdict === "UNKNOWN_UNIT") problems.push(`units: known constant "${k.symbol}" is written in "${k.unit}", a unit the unit system does not know (${verdict.reason}); write it in a UCUM unit of its quantity`);
        }
    }
    // Semantics the documentation settles: an assumption that the modules do not exchange air with the hatch closed contradicts the station's ventilation, documented as running through the ducts alone.
    const ventilation = Object.entries(context.facts ?? {}).flatMap(([doc, facts]) => facts.filter((f) => /InterModuleVentilation/.test(f.semantic)).map((f) => ({ doc, f })))[0];
    if (ventilation) {
        const isolated = /\b(no|zero|without|negligible)\b[^.;]{0,50}\b(air )?(exchange|coupling|ventilation|mixing|transfer)\b[^.;]{0,80}\b(between|modules?|lab|hab)\b/i;
        for (const [section, items] of [["assumptions", list(r.assumptions)], ["required_behaviors", list(r.required_behaviors)], ["constraints", list(r.constraints)]] as const) {
            for (const text of items) {
                const t = String(text);
                if (isolated.test(t) && !/through the hatch(way)?\b/i.test(t)) problems.push(`facts: ${section} "${t.slice(0, 120)}" treats the modules as isolated with the hatch closed; the station documents the opposite (${ventilation.doc}, ${ventilation.f.id}: ${ventilation.f.says ?? `${ventilation.f.value} ${ventilation.f.unit}`}); say what the ventilation delivers is unknown, not that it is zero`);
            }
        }
    }
    // And the result of an assumption is not a constraint.
    const hedged = context.description ? hedgedNumbers(context.description) : [];
    if (hedged.length) {
        const cites = (text: string) => numbersIn(text).filter((v) => hedged.includes(v));
        for (const [section, items] of [["constraints", list(r.constraints)], ["required_behaviors", list(r.required_behaviors)]] as const) {
            for (const text of items) {
                const found = cites(String(text));
                if (found.length) problems.push(`provenance: ${section} "${String(text).slice(0, 120)}" cites ${found.join(", ")}, which the description gives only under an assumption; say it under assumptions, the factory will test it`);
            }
        }
        for (const k of list(r.known)) if (typeof k?.value === "number" && hedged.includes(k.value)) problems.push(`provenance: known constant "${k.symbol}" = ${k.value} is a value the description gives only under an assumption; it is not known`);
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
