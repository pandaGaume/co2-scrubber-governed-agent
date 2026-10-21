import type { CapabilityDescriptor, JsonValue, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Broker } from "./broker.js";
import type { Composition } from "./compose.js";
import type { Provider } from "./provider.js";

/** A model chooses the Physics reads and the interpretation. This loop only
 * transports its calls; it has no quantity aliases or business decisions.
 */
export async function interpretWithPhysics(provider: Provider, broker: Broker, request: { capability: string; description?: string; schema: JsonValue; sent: JsonValue }, configuration: { allowed: string[]; maxCalls: number }): Promise<Composition & { interpretationReason: string }> {
    const started = Date.now();
    const available = await broker.tools("physics");
    const tools = available.filter((tool) => configuration.allowed.includes(`physics.${tool.name}`)).map((tool) => ({ id: `physics.${tool.name}`, description: tool.description ?? tool.name, inputSchema: tool.inputSchema })) as CapabilityDescriptor[];
    const finish = { id: "interpret.result", description: "Return the complete interpreted arguments as a JSON object, not a serialized JSON string, or null when meaning cannot be preserved. Never execute the target operation.", inputSchema: { type: "object", properties: { value: { anyOf: [request.schema, { type: "null" }] }, reason: { type: "string" } }, required: ["value", "reason"] } } as CapabilityDescriptor;
    const intention = { id: `interpret:${crypto.randomUUID()}`, description: `Interpret the proposed call to ${request.capability}, consulting Physics as needed. Preserve its meaning.` };
    provider.begin?.(intention.id);
    let features: Record<string, JsonValue> = { oneCall: true, target: request as unknown as JsonValue };
    let value: JsonValue = null;
    let interpretationReason = "The interpreter did not finish within its available calls";
    for (let turn = 0; turn < configuration.maxCalls; turn++) {
        const decision = await provider.resolve({ intention, state: { id: intention.id, features }, allowedCapabilities: [...tools, finish], candidates: [], recentFailures: [] } as PolicyFallbackInput);
        const id = decision.invocation.capabilityId;
        if (id === finish.id) {
            value = (decision.invocation.input as { value?: JsonValue }).value ?? null;
            interpretationReason = String((decision.invocation.input as { reason?: string }).reason ?? "");
            break;
        }
        if (!tools.some((tool) => tool.id === id)) throw new Error(`Semantic interpreter cannot execute ${id}`);
        const result = await broker.call("physics", id.slice("physics.".length), decision.invocation.input as Record<string, unknown>);
        features = { oneCall: true, lastCapability: id, lastOutcome: result.outcome, lastOutput: JSON.stringify(result.output ?? result.error ?? null), remainingCalls: configuration.maxCalls - turn - 1 };
    }
    const counted = provider.exchanges.filter((exchange) => exchange.tokens !== null);
    return { text: JSON.stringify(value), interpretationReason, model: provider.model, wire: "semantic-tool-loop", latencyMs: Date.now() - started, tokens: counted.length ? counted.reduce((total, exchange) => ({ prompt: total.prompt + exchange.tokens!.prompt, completion: total.completion + exchange.tokens!.completion, total: total.total + exchange.tokens!.total }), { prompt: 0, completion: 0, total: 0 }) : null };
}
