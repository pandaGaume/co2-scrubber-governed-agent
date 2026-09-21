/**
 * The loop's capabilities are a broker's tools. Every tool of every slot the
 * broker exposes to this agent becomes a harness capability `<slot>.<tool>`
 * with the tool's own input schema (the harness validates the model's
 * arguments with Ajv before anything is called) and the description the
 * slot's grammar chose for this agent. A profile says what differs between
 * the agents of the demo (docs/harness-stages.fr.md, section 1):
 *
 *   included      when given, the only tools the loop sees (the factory sees
 *                 its topic's tools and nothing else);
 *   excluded      tools the loop never sees (the habitat agent never sees
 *                 the workshop);
 *   replayPolicy  the harness's own levels per tool: `automatic`,
 *                 `approval-required` (the host approves every call, replays
 *                 included), `never` (the harness refuses to propose or run
 *                 it; it is not in the allowed list);
 *   bindings      what the host completes in a tool's input before the call:
 *                 constants the model never sees (the factory's task id) and
 *                 a rewrite (a document name prefixed by the task);
 *   local         capabilities in process, not on the broker (`crew.report`
 *                 at the station, `task.plan` at the factory).
 *
 * Every call, on the broker or in process, is reported through `onCall`
 * with its outcome and latency: that is what the trace, the manifest and
 * the station's voice read.
 */
import { CapabilityRegistry, type CapabilityDescriptor, type CapabilityRegistryOptions, type CapabilityResult, type ExecutionContext, type JsonValue, type ReplayPolicy } from "@spiky-panda/harness";
import type { Broker, CallResult, Outcome } from "../lib/broker.js";

export interface CapabilityCall {
    id: string;
    slot: string;
    tool: string;
    input: JsonValue;
    result: CallResult;
    latencyMs: number;
    decisionId: string;
}

export interface CatalogueEntry {
    id: string;
    slot: string;
    tool: string;
    replayPolicy: ReplayPolicy;
    /** The description this agent was given (the slot's grammar), kept for the trace. */
    description: string;
    /** Where the capability runs: on the broker, or in this process. */
    origin: "broker" | "local";
}

/** What the host completes in a tool's input before the call. */
export interface CapabilityBinding {
    match: RegExp;
    /** Set by the host on every call; removed from the schema the model is given. */
    constants?: Record<string, JsonValue>;
    /** Applied to the input after the constants, before the call. */
    rewrite?: (input: Record<string, JsonValue>) => Record<string, JsonValue>;
}

/** A capability that runs in this process. */
export interface LocalCapability {
    id: string;
    description: string;
    inputSchema: JsonValue;
    replayPolicy?: ReplayPolicy;
    execute(input: JsonValue, context: ExecutionContext): Promise<CapabilityResult> | CapabilityResult;
}

export interface CapabilityProfile {
    included?: ReadonlyArray<RegExp>;
    excluded?: ReadonlyArray<RegExp>;
    replayPolicy?: (id: string) => ReplayPolicy;
    bindings?: ReadonlyArray<CapabilityBinding>;
    local?: ReadonlyArray<LocalCapability>;
}

export interface BuildCapabilitiesOptions {
    profile?: CapabilityProfile;
    approve?: CapabilityRegistryOptions["approve"];
    onCall?: (call: CapabilityCall) => void;
}

const outcomeInOutput = (output: unknown): Outcome | undefined => (output && typeof output === "object" ? ((output as { outcome?: Outcome }).outcome ?? undefined) : undefined);

/** The schema without the properties the host sets itself. */
function schemaWithout(schema: JsonValue, keys: string[]): JsonValue {
    if (!keys.length || !schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
    const s = schema as { properties?: Record<string, JsonValue>; required?: JsonValue[] };
    const properties = s.properties ? Object.fromEntries(Object.entries(s.properties).filter(([k]) => !keys.includes(k))) : undefined;
    const required = Array.isArray(s.required) ? s.required.filter((k) => typeof k !== "string" || !keys.includes(k)) : undefined;
    return { ...(schema as Record<string, JsonValue>), ...(properties ? { properties } : {}), ...(required ? { required } : {}) };
}

/** Registers the broker's tools and the profile's local capabilities. */
export async function buildCapabilities(broker: Broker, { profile = {}, approve, onCall }: BuildCapabilitiesOptions = {}): Promise<{ registry: CapabilityRegistry; catalogue: CatalogueEntry[] }> {
    const registry = new CapabilityRegistry({ approve });
    const catalogue: CatalogueEntry[] = [];
    const excluded = profile.excluded ?? [];
    const policyOf = profile.replayPolicy ?? (() => "automatic" as const);
    for (const slot of await broker.slots()) {
        for (const tool of await broker.tools(slot)) {
            const id = `${slot}.${tool.name}`;
            if (profile.included && !profile.included.some((r) => r.test(id))) continue;
            if (excluded.some((r) => r.test(id))) continue;
            const bindings = (profile.bindings ?? []).filter((b) => b.match.test(id));
            const constants = Object.assign({}, ...bindings.map((b) => b.constants ?? {})) as Record<string, JsonValue>;
            const replayPolicy = policyOf(id);
            const description = tool.description ?? "";
            const descriptor: CapabilityDescriptor = { id, description, inputSchema: schemaWithout((tool.inputSchema ?? { type: "object" }) as JsonValue, Object.keys(constants)), replayPolicy };
            registry.register({
                descriptor,
                async execute(input: JsonValue, context: ExecutionContext): Promise<CapabilityResult> {
                    context.signal?.throwIfAborted();
                    const started = Date.now();
                    let args = { ...((input ?? {}) as Record<string, JsonValue>), ...constants };
                    for (const b of bindings) if (b.rewrite) args = b.rewrite(args);
                    const result = await broker.call(slot, tool.name, args);
                    onCall?.({ id, slot, tool: tool.name, input: args, result, latencyMs: Date.now() - started, decisionId: context.decisionId });
                    // The harness keeps `ok`, `output` and `error`; the outcome rides in the output for the trace.
                    return result.ok ? { ok: true, output: { outcome: result.outcome, value: (result.output ?? null) as JsonValue } } : { ok: false, error: result.error, output: { outcome: result.outcome } };
                },
            });
            catalogue.push({ id, slot, tool: tool.name, replayPolicy, description, origin: "broker" });
        }
    }
    for (const local of profile.local ?? []) {
        const [slot, ...rest] = local.id.split(".");
        const tool = rest.join(".");
        const replayPolicy = local.replayPolicy ?? "automatic";
        registry.register({
            descriptor: { id: local.id, description: local.description, inputSchema: local.inputSchema, replayPolicy },
            async execute(input: JsonValue, context: ExecutionContext): Promise<CapabilityResult> {
                context.signal?.throwIfAborted();
                const started = Date.now();
                const r = await local.execute(input, context);
                const outcome: Outcome = outcomeInOutput(r.output) ?? (r.ok ? "completed" : "error");
                onCall?.({ id: local.id, slot, tool, input, result: { ok: r.ok, outcome, output: r.output, error: r.error }, latencyMs: Date.now() - started, decisionId: context.decisionId });
                return r;
            },
        });
        catalogue.push({ id: local.id, slot, tool, replayPolicy, description: local.description, origin: "local" });
    }
    return { registry, catalogue };
}
