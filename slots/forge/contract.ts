/**
 * The capability contract: what a generated node must satisfy, written by
 * the task and never by the model (2026-09-26, after the third passage on
 * Haiku: the request said "1 when unwired", the model wrote 0, its own
 * tests tested nothing of it, the harness ran precisely that case and took
 * it as a success). The model writes the code and, if it wants, tests of
 * its own; the forge derives the acceptance tests from this contract and
 * runs them itself. The model never defines the code, the acceptance tests
 * and the verdict at once.
 *
 *   inputs       by port: the quantity, the unit, the range, the value the
 *                node assumes when nothing is wired
 *   outputs      by port: the quantity, the unit, the sign
 *   parameters   by name: an editable of the node, with its quantity and
 *                unit and the value the acceptance runs set it to
 *   behaviors    one line each, `output(command=0.5) == -0.5 * rate` or
 *                `output(unwired) == -rate`: the output port (or `output`
 *                when the contract has one), the inputs wired at a value or
 *                nothing wired, a comparison with a formula over the
 *                parameters
 *
 * Nothing here knows a domain: quantities and units are the units
 * service's, formulas are the graph topic's evaluator's.
 */
import { compatibleUnits, resolveUnitRef } from "../../harness/lib/units.js";
import { evaluateExpression } from "../../harness/topics/graph/params.js";

export interface ContractPort {
    quantity: string;
    unit?: string;
    range?: [number, number];
    /** What the node takes the input to be when nothing is wired into it. */
    unwired?: number;
    sign?: "negative" | "positive" | "nonnegative" | "nonpositive";
}

export interface ContractParameter {
    quantity?: string;
    unit?: string;
    editable?: boolean;
    /** The value the acceptance runs set the parameter to (1 when absent). */
    value?: number;
}

export interface CapabilityContract {
    /** The type the plugin must register, when the task names it; otherwise the plugin's one type. */
    type?: string;
    inputs: Record<string, ContractPort>;
    outputs: Record<string, ContractPort>;
    parameters: Record<string, ContractParameter>;
    behaviors: string[];
}

export interface Behavior {
    text: string;
    /** The output port judged; null for `output`, the contract's one output. */
    output: string | null;
    /** The inputs wired at a value; null when the behavior is `unwired`. */
    inputs: Record<string, number> | null;
    op: "==" | "~=" | "<" | ">" | "<=" | ">=";
    expression: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BEHAVIOR = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*([^)]*)\)\s*(==|~=|<=|>=|<|>)\s*(.+?)\s*$/;

/** A behavior line parsed, or the reason it cannot be. */
export function parseBehavior(text: string, contract: Pick<CapabilityContract, "inputs" | "outputs">): { ok: true; behavior: Behavior } | { ok: false; reason: string } {
    const m = BEHAVIOR.exec(text);
    if (!m) return { ok: false, reason: `"${text}" is not a behavior: <output>(<input>=<number>, ... | unwired) <==|~=|<|>|<=|>=> <formula over the parameters>` };
    const [, head, args, op, expression] = m;
    const outputs = Object.keys(contract.outputs);
    let output: string | null = null;
    if (head === "output") {
        if (outputs.length !== 1) return { ok: false, reason: `"${text}": "output" names the contract's one output, and the contract has ${outputs.length}: name it (${outputs.join(", ") || "none"})` };
    } else if (!outputs.includes(head)) return { ok: false, reason: `"${text}": "${head}" is not an output of the contract (${outputs.join(", ") || "none"})` };
    else output = head;
    let inputs: Record<string, number> | null = null;
    if (args.trim() !== "unwired") {
        inputs = {};
        for (const part of args.split(",").map((p) => p.trim()).filter(Boolean)) {
            const kv = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)$/.exec(part);
            if (!kv) return { ok: false, reason: `"${text}": "${part}" is not <input>=<number>` };
            if (!contract.inputs[kv[1]]) return { ok: false, reason: `"${text}": "${kv[1]}" is not an input of the contract (${Object.keys(contract.inputs).join(", ") || "none"})` };
            inputs[kv[1]] = Number(kv[2]);
        }
    }
    return { ok: true, behavior: { text, output, inputs, op: op as Behavior["op"], expression } };
}

/** The problems of a contract's shape: ports without quantity, a unit the units service does not know, a behavior that does not parse, a formula over an unknown name. */
export function contractProblems(raw: unknown): string[] {
    const problems: string[] = [];
    const c = (raw && typeof raw === "object" ? raw : {}) as Partial<CapabilityContract>;
    for (const side of ["inputs", "outputs"] as const) {
        const ports = (c[side] && typeof c[side] === "object" ? c[side] : {}) as Record<string, Partial<ContractPort>>;
        for (const [name, p] of Object.entries(ports)) {
            if (!NAME.test(name)) problems.push(`${side}: "${name}" is not a port name`);
            if (typeof p?.quantity !== "string" || !p.quantity) problems.push(`${side} "${name}": no quantity`);
            else if (p.unit) {
                const r = resolveUnitRef({ unit: p.unit, quantity: p.quantity });
                if (!r.ok) problems.push(`${side} "${name}": ${r.reason}`);
            }
            if (p?.range && (!Array.isArray(p.range) || p.range.length !== 2 || p.range.some((x) => typeof x !== "number") || p.range[0] > p.range[1])) problems.push(`${side} "${name}": range is [min, max]`);
        }
    }
    if (!c.outputs || !Object.keys(c.outputs).length) problems.push("outputs: a capability produces at least one output");
    // The type, when the contract names one, is a generated type: the code factory names it under Generated., every catalogue says it is generated (the fifth passage named "Physics.Habitat:leak" and the code factory looped on it).
    if (c.type !== undefined && (typeof c.type !== "string" || !c.type.startsWith("Generated."))) problems.push(`type "${String(c.type)}" is not named under "Generated." (as in "Generated.Habitat:leak"): a generated node is; leave type out to let the code factory name it`);
    const parameters = (c.parameters && typeof c.parameters === "object" ? c.parameters : {}) as Record<string, Partial<ContractParameter>>;
    for (const [name, p] of Object.entries(parameters)) {
        if (!NAME.test(name)) problems.push(`parameters: "${name}" is not a parameter name`);
        if (p?.unit && p.quantity) {
            const r = resolveUnitRef({ unit: p.unit, quantity: p.quantity });
            if (!r.ok) problems.push(`parameter "${name}": ${r.reason}`);
        }
    }
    const behaviors = Array.isArray(c.behaviors) ? c.behaviors : [];
    if (!behaviors.length) problems.push("behaviors: at least one line says what the output is for given inputs");
    const vars = Object.fromEntries(Object.entries(parameters).map(([k, p]) => [k, typeof p?.value === "number" ? p.value : 1]));
    for (const b of behaviors) {
        if (typeof b !== "string") {
            problems.push("behaviors: each one is a line of text");
            continue;
        }
        const parsed = parseBehavior(b, { inputs: (c.inputs ?? {}) as Record<string, ContractPort>, outputs: (c.outputs ?? {}) as Record<string, ContractPort> });
        if (!parsed.ok) {
            problems.push(parsed.reason);
            continue;
        }
        try {
            evaluateExpression(parsed.behavior.expression, vars);
        } catch (e) {
            problems.push(`"${b}": ${e instanceof Error ? e.message : String(e)} (the formula is over the parameters: ${Object.keys(vars).join(", ") || "none"})`);
        }
    }
    return problems;
}

/** The value each parameter is set to for the acceptance runs. */
export const parameterValues = (contract: CapabilityContract): Record<string, number> => Object.fromEntries(Object.entries(contract.parameters ?? {}).map(([k, p]) => [k, typeof p.value === "number" ? p.value : 1]));

/** What a behavior expects, from the parameters' values. */
export const expectedOf = (behavior: Behavior, contract: CapabilityContract): number => evaluateExpression(behavior.expression, parameterValues(contract));

/** Does an actual value satisfy a behavior: a relative tolerance on equality, an absolute floor for values near zero. */
export function satisfies(behavior: Behavior, actual: number, expected: number, tolerance = 1e-6): boolean {
    if (!Number.isFinite(actual)) return false;
    const close = Math.abs(actual - expected) <= Math.max(tolerance * Math.abs(expected), 1e-12);
    switch (behavior.op) {
        case "==":
        case "~=":
            return close;
        case "<":
            return actual < expected;
        case ">":
            return actual > expected;
        case "<=":
            return actual <= expected || close;
        case ">=":
            return actual >= expected || close;
    }
}

interface SignaturePort {
    quantity?: string;
    unit?: string;
}

/**
 * The plugin's signature against the contract: every input and output of
 * the contract declared, its quantity the same, its unit convertible; the
 * signature may declare more. The units service judges units, not strings.
 */
export function signatureProblems(signature: { inputs?: Record<string, SignaturePort>; outputs?: Record<string, SignaturePort> } | undefined, contract: CapabilityContract): string[] {
    const problems: string[] = [];
    if (!signature) return ["no signature to judge against the contract"];
    for (const side of ["inputs", "outputs"] as const) {
        for (const [name, want] of Object.entries(contract[side] ?? {})) {
            const has = signature[side]?.[name];
            if (!has) {
                problems.push(`${side} "${name}" (${want.quantity}${want.unit ? `, ${want.unit}` : ""}) is required by the contract and not declared by the signature`);
                continue;
            }
            if (!has.quantity || has.quantity.toLowerCase() !== want.quantity.toLowerCase()) problems.push(`${side} "${name}": the contract says ${want.quantity}, the signature ${has.quantity ?? "no quantity"}`);
            else if (want.unit && has.unit) {
                const c = compatibleUnits({ quantity: want.quantity, unit: want.unit }, { quantity: has.quantity, unit: has.unit });
                if (!c.ok || !c.compatible) problems.push(`${side} "${name}": the contract says ${want.unit}, the signature ${has.unit}, which does not convert${c.ok ? "" : ` (${c.reason})`}`);
            } else if (want.unit && !has.unit) problems.push(`${side} "${name}": the contract says ${want.unit}, the signature gives no unit`);
        }
    }
    return problems;
}

/** The contract's parameters as editables of the node: a setter by that name on the instance's prototype chain. */
export function parameterProblems(instance: object | undefined, contract: CapabilityContract): string[] {
    const problems: string[] = [];
    if (!instance) return ["no instance of the node to judge its parameters"];
    for (const [name, p] of Object.entries(contract.parameters ?? {})) {
        let proto: object | null = instance;
        let found = false;
        while (proto && proto !== Object.prototype) {
            const d = Object.getOwnPropertyDescriptor(proto, name);
            if (d && (typeof d.set === "function" || (p.editable === false && typeof d.get === "function"))) {
                found = true;
                break;
            }
            proto = Object.getPrototypeOf(proto);
        }
        if (!found) problems.push(`parameter "${name}" is required by the contract and the node has no ${p.editable === false ? "getter" : "setter"} by that name (an @editable getter and setter)`);
    }
    return problems;
}
