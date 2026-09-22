/**
 * slot `reasoner`. The language model behind the agent, as a provider of the
 * broker: the key stays in this process, the agent (the Node runner or the
 * studio page) asks `decide` through the broker like any other tool, and
 * the call to the model is an MCP call in the broker's trace, shown raw.
 *
 * `decide` takes what the harness hands its fallback (the intention, the
 * state, the allowed capabilities, the learned candidates it did not trust,
 * the recent failures) and answers one decision, with what the model
 * proposed before any substitution, the model and family, latency and
 * tokens, and the raw exchange. One conversation per `conversationId` (the
 * runner uses the intention's id): the model sees its own previous calls
 * and their results across the steps of one event.
 *
 * The profile comes from `REASONER_PROFILE` (a path under the repository,
 * default `profiles/anthropic.json`); the key from the environment variable
 * the profile names (`.env` is read by `npm run server`). Without a key the
 * slot still publishes: `describe` says it is not ready and `decide`
 * refuses with the reason, so the page and the runner can say so.
 */
import type { CapabilityDescriptor, Experience, Intention, PolicyCandidate, PolicyFallbackInput, State } from "@spiky-panda/harness";
import { errorMessage, readJson, sha256File } from "../../lib/files.js";
import { composeText } from "../../harness/lib/compose.js";
import { SYSTEM_PROMPT_FILE, fromRoot, relativeToRoot } from "../../lib/paths.js";
import { objectSchema as obj, publishSlot, type PublishedSlot } from "../lib/slot-server.js";
import type { Provider, ProviderProfile } from "../../harness/lib/provider.js";
import { familyOf } from "../../harness/lib/llm-common.js";
import { existsSync, readFileSync } from "node:fs";
import { oneLine, runtimeEvents } from "../lib/events.js";

export interface ReasonerState {
    profileFile: string;
    conversations: number;
    calls: number;
}

/** The answer of `decide`: the decision and everything the trace keeps about how it was made. */
export interface DecideResult {
    decision: unknown;
    proposedCapabilityId: string;
    proposedInput: unknown;
    model: string;
    family: string;
    wire: string;
    latencyMs: number;
    tokens: { prompt: number; completion: number; total: number } | null;
    exchange: { request: unknown; response: unknown };
}

const MAX_CONVERSATIONS = 16;

export function reasonerSlot(wsBase: string, log: (line: string) => void): PublishedSlot<ReasonerState> {
    const profileFile = fromRoot(process.env.REASONER_PROFILE ?? "profiles/anthropic.json");
    const profile = readJson<ProviderProfile>(profileFile);
    const wire = profile.tier3?.wire ?? "openai-compatible";
    const systemPrompt = existsSync(SYSTEM_PROMPT_FILE) ? readFileSync(SYSTEM_PROMPT_FILE, "utf8") : "";
    const conversations = new Map<string, Provider>();
    let notReady: string | null = null;

    /** A provider instance per conversation: the adapters keep one conversation each. */
    async function providerFor(conversationId: string, intentionId: string): Promise<Provider> {
        const existing = conversations.get(conversationId);
        if (existing) return existing;
        let provider: Provider;
        try {
            if (wire === "anthropic-messages") {
                const { AnthropicProvider } = await import("../../harness/providers/anthropic.js");
                provider = new AnthropicProvider(profile, { systemPrompt });
            } else {
                const { OpenAiCompatibleProvider } = await import("../../harness/providers/openai-compatible.js");
                provider = new OpenAiCompatibleProvider(profile, { systemPrompt });
            }
        } catch (e) {
            notReady = errorMessage(e);
            throw new Error(`the reasoner is not ready: ${notReady}`);
        }
        notReady = null;
        provider.begin?.(intentionId);
        conversations.set(conversationId, provider);
        while (conversations.size > MAX_CONVERSATIONS) {
            const oldest = conversations.keys().next().value as string;
            conversations.delete(oldest);
        }
        return provider;
    }

    /** What describe answers without a conversation: the model and family the profile names. */
    const identity = () => ({ model: profile.tier3?.model ?? "?", family: familyOf(profile, profile.tier3?.model ?? ""), wire });

    return publishSlot<ReasonerState>({
        slot: "reasoner",
        description: "The language model behind the agent, as a governed provider: one decision per call, the key never leaves this process",
        instructions: {
            en: "The agent's reasoner. decide answers one decision for one step of the harness loop; describe says which model and family answer. Not a tool the agent chooses: it is what chooses.",
            fr: "Le raisonneur de l'agent. decide rend une décision pour une étape de la boucle du harnais ; describe dit quel modèle et quelle famille répondent. Ce n'est pas un outil que l'agent choisit : c'est ce qui choisit.",
        },
        wsBase,
        log,
        stub: false,
        state: { profileFile: relativeToRoot(profileFile), conversations: 0, calls: 0 },
        tools: [
            {
                name: "describe",
                title: "Which model answers",
                description: "The model, its family (what the slots' grammars key on), the wire, whether a key is present, and the profile file with its sha256.",
                inputSchema: obj({}),
                handle: async () => {
                    let ready = notReady === null;
                    let reason: string | null = notReady;
                    if (ready && conversations.size === 0) {
                        // Probe the key without spending a call: constructing the adapter reads the environment.
                        try {
                            await providerFor("__probe__", "probe");
                            conversations.delete("__probe__");
                        } catch (e) {
                            ready = false;
                            reason = errorMessage(e);
                        }
                    }
                    return { ...identity(), ready, reason, profile: { file: relativeToRoot(profileFile), sha256: sha256File(profileFile) }, promptSha256: existsSync(SYSTEM_PROMPT_FILE) ? sha256File(SYSTEM_PROMPT_FILE) : null };
                },
            },
            {
                name: "compose",
                title: "One text, no tools",
                description: "A text from the model with no tool call and no conversation: instructions (what to write, for whom, how long) and a context (the facts to phrase, which the text must not go beyond). Returns the text, the model, latency, tokens. For the station's spoken lines that are not decisions (a welcome from the boot report).",
                inputSchema: obj({ instructions: { type: "string", description: "what to write, for whom, how long" }, context: { type: "string", description: "the facts to phrase; the text must not add any" }, maxTokens: { type: "number", description: "default 300" } }, ["instructions"]),
                handle: async (args, s) => {
                    // Said before the wait, so a reader watching the log sees the
                    // question standing while the model is still thinking.
                    const asked = oneLine(args.instructions);
                    runtimeEvents.append("model.asked", { ...identity(), kindOfCall: "compose", asked });
                    const started = Date.now();
                    try {
                        const composition = await composeText(profile, { instructions: String(args.instructions ?? ""), context: typeof args.context === "string" ? args.context : undefined, maxTokens: typeof args.maxTokens === "number" ? args.maxTokens : undefined });
                        s.calls++;
                        runtimeEvents.append("model.answered", { ...identity(), kindOfCall: "compose", asked, answered: oneLine(composition.text), latencyMs: composition.latencyMs, tokens: composition.tokens ?? null });
                        return { ...composition, family: identity().family };
                    } catch (e) {
                        runtimeEvents.append("model.failed", { ...identity(), kindOfCall: "compose", asked, reason: oneLine(errorMessage(e)), latencyMs: Date.now() - started });
                        throw e;
                    }
                },
            },
            {
                name: "decide",
                title: "One decision",
                description: "One decision of the model for one step: give the intention, the observed state, the allowed capabilities (id, description, inputSchema), the learned candidates and the recent failures; get the decision, what the model proposed, the model, latency, tokens and the raw exchange. Same conversationId across the steps of one event.",
                inputSchema: {
                    type: "object",
                    properties: {
                        conversationId: { type: "string", description: "one conversation per event: the model sees its previous steps" },
                        decisionId: { type: "string", description: "the harness's decision id, echoed in the exchange" },
                        intention: { type: "object", description: "{ id, description?, parameters? }" },
                        state: { type: "object", description: "{ id, features }" },
                        allowedCapabilities: { type: "array", description: "[{ id, description, inputSchema?, replayPolicy? }]" },
                        candidates: { type: "array", description: "learned decisions the harness considered" },
                        recentFailures: { type: "array", description: "recent experiences that failed" },
                    },
                    required: ["conversationId", "intention", "state", "allowedCapabilities"],
                },
                handle: async (args, s) => {
                    const conversationId = String(args.conversationId);
                    const intention = args.intention as Intention;
                    if (!intention?.id) throw new Error("intention.id is required");
                    const provider = await providerFor(conversationId, intention.id);
                    const input: PolicyFallbackInput = {
                        decisionId: typeof args.decisionId === "string" ? args.decisionId : undefined,
                        intention,
                        state: args.state as State,
                        allowedCapabilities: (args.allowedCapabilities ?? []) as CapabilityDescriptor[],
                        candidates: (args.candidates ?? []) as PolicyCandidate[],
                        recentFailures: (args.recentFailures ?? []) as Experience[],
                    };
                    const asked = oneLine(intention.description ?? intention.id);
                    runtimeEvents.append("model.asked", { model: provider.model, family: provider.family, wire, kindOfCall: "decide", conversationId, decisionId: input.decisionId ?? null, asked });
                    const started = Date.now();
                    const before = provider.exchanges.length;
                    let decision: Awaited<ReturnType<typeof provider.resolve>>;
                    try {
                        decision = await provider.resolve(input);
                    } catch (e) {
                        runtimeEvents.append("model.failed", { model: provider.model, family: provider.family, wire, kindOfCall: "decide", conversationId, decisionId: input.decisionId ?? null, asked, reason: oneLine(errorMessage(e)), latencyMs: Date.now() - started });
                        throw e;
                    }
                    s.calls++;
                    s.conversations = conversations.size;
                    const x = provider.exchanges[before] ?? provider.exchanges[provider.exchanges.length - 1];
                    const result: DecideResult = {
                        decision,
                        proposedCapabilityId: x?.proposedCapabilityId ?? decision.invocation.capabilityId,
                        proposedInput: x?.proposedInput ?? decision.invocation.input,
                        model: provider.model,
                        family: provider.family,
                        wire,
                        latencyMs: x?.latencyMs ?? 0,
                        tokens: x?.tokens ?? null,
                        exchange: { request: x?.request ?? null, response: x?.response ?? null },
                    };
                    // What the model proposed against what the harness will run.
                    // When the two differ the governance overrode the model, and
                    // that is the one line worth showing above all the others.
                    runtimeEvents.append("model.answered", {
                        model: provider.model,
                        family: provider.family,
                        wire,
                        kindOfCall: "decide",
                        conversationId,
                        decisionId: input.decisionId ?? null,
                        asked,
                        answered: oneLine(decision.invocation.capabilityId),
                        proposedCapabilityId: result.proposedCapabilityId,
                        ranCapabilityId: decision.invocation.capabilityId,
                        latencyMs: result.latencyMs,
                        tokens: result.tokens,
                    });
                    return result;
                },
            },
        ],
        resources: [{ uri: "reasoner://profile", name: "Profile", description: "The profile the reasoner runs with (no key in it)", read: () => profile }],
    });
}

