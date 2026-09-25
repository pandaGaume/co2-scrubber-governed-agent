/**
 * The `supervisor` slot: the Contract Supervisor (2026-09-25, night),
 * reachable through the broker like the Observer. It runs the same model as
 * the reasoner slot with its own fixed prompt (`harness/supervisor/prompt.md`),
 * reads typed facts and a deterministic contract report, never a transcript,
 * and answers a typed verdict checked by code before it counts.
 *
 *   review          the facts, the report, the assumptions, the symbols as given
 *   review_request  a TWIN_FACTORY_REQUEST against the register's devices and
 *                   the library's typed facts: the input built here, then the verdict
 *
 * Without a key, it says no model is ready rather than answering in its
 * place; the deterministic report is still returned, so a caller can act on
 * what code alone found.
 */
import { fromRoot } from "../../lib/paths.js";
import { Broker } from "../../harness/lib/broker.js";
import type { Provider } from "../../harness/lib/provider.js";
import { ReasonerProvider } from "../../harness/providers/reasoner.js";
import { reviewContracts, type ContractReport, type Fact, type LibraryFact } from "../../harness/core/contracts.js";
import { supervise, supervisionOfRequest, SUPERVISOR_PROMPT, type SuperviseResult, type SupervisionInput, type Verdict } from "../../harness/supervisor/supervisor.js";
import { objectSchema, publishSlot, type PublishedSlot, type SlotTool } from "../lib/slot-server.js";

const VERSION = "0.1.0";
const VERDICTS_URI = "supervisor://verdicts";

export interface SupervisorState {
    verdicts: Array<{ id: string; at: string; status: string; report: ContractReport; verdict: Verdict | null; attempts: number; provider: SuperviseResult["provider"] | null }>;
}

export interface SupervisorSlotOptions {
    /** The model to supervise with; by default the reasoner slot with the supervisor's prompt, in the state mode. */
    provider?: (broker: Broker) => Promise<Provider>;
}

const FACT = { type: "object", properties: { id: { type: "string" }, semantic: { type: "string" }, quantity: { type: "string" }, unit: { type: "string" }, value: { type: "number" }, min: { type: "number" }, max: { type: "number" }, status: { type: "string" }, source: { type: "string" }, producer: { type: "string" } }, required: ["id", "unit", "value", "status", "source", "producer"] } as const;

export function supervisorSlot(wsBase: string, log: (line: string) => void, options: SupervisorSlotOptions = {}): PublishedSlot<SupervisorState> {
    const httpBase = wsBase.replace(/^ws(s?):\/\//, "http$1://");
    const state: SupervisorState = { verdicts: [] };
    const modelOf =
        options.provider ??
        (async (broker: Broker): Promise<Provider> => {
            const reasoner = await ReasonerProvider.connect(broker);
            if (!reasoner.description.ready) throw new Error(`the reasoner is not ready: ${reasoner.description.reason ?? "no reason given"}`);
            reasoner.usePrompt(SUPERVISOR_PROMPT);
            reasoner.useContext("state");
            return reasoner;
        });
    const run = async (broker: Broker, input: SupervisionInput, s: SupervisorState) => {
        const result = await supervise({ provider: await modelOf(broker), input });
        const entry = { id: `v${(s.verdicts.length + 1).toString().padStart(4, "0")}`, at: new Date().toISOString(), status: result.verdict?.status ?? input.report.status, report: input.report, verdict: result.verdict, attempts: result.attempts.length, provider: result.provider };
        s.verdicts.push(entry);
        log(`[supervisor] ${entry.id}: ${entry.status}${result.verdict ? ` (${result.verdict.findings.length} finding(s))` : " (no verdict accepted; the deterministic report stands)"} after ${result.attempts.length} attempt(s)`);
        return { ...entry, attempts: result.attempts };
    };
    const tools: SlotTool<SupervisorState>[] = [
        {
            name: "review",
            inputSchema: objectSchema({ facts: { type: "array", items: FACT }, assumptions: { type: "array", items: { type: "string" } }, hypotheses: { type: "array", items: { type: "string" } }, symbols: { type: "object", additionalProperties: { type: "string" } }, fitted: { type: "array", items: { type: "string" } }, required: { type: "array", items: { type: "string" } } }, ["facts"]),
            handle: async (args, s) => {
                const facts = (Array.isArray(args.facts) ? args.facts : []) as Fact[];
                const required = Array.isArray(args.required) ? (args.required as string[]) : [];
                const input: SupervisionInput = { facts, report: reviewContracts(facts, required), assumptions: Array.isArray(args.assumptions) ? (args.assumptions as string[]) : [], hypotheses: Array.isArray(args.hypotheses) ? (args.hypotheses as string[]) : [], symbols: (args.symbols as Record<string, string> | undefined) ?? {}, fitted: Array.isArray(args.fitted) ? (args.fitted as string[]) : [], required };
                const broker = new Broker(httpBase, { name: "supervisor", version: VERSION, locale: "en" });
                try {
                    return await run(broker, input, s);
                } finally {
                    await broker.close();
                }
            },
        },
        {
            name: "review_request",
            inputSchema: objectSchema({ request: { type: "object" }, devices: { type: "array", items: { type: "object" } }, required: { type: "array", items: { type: "string" } } }, ["request"]),
            handle: async (args, s) => {
                const broker = new Broker(httpBase, { name: "supervisor", version: VERSION, locale: "en" });
                try {
                    const r = await broker.call("library", "facts", {});
                    const libraryFacts = r.ok ? ((r.output as { facts?: Array<LibraryFact & { source: string }> }).facts ?? []) : [];
                    const input = supervisionOfRequest((args.request ?? {}) as never, Array.isArray(args.devices) ? args.devices : [], libraryFacts, Array.isArray(args.required) ? (args.required as string[]) : []);
                    return await run(broker, input, s);
                } finally {
                    await broker.close();
                }
            },
        },
    ];
    return publishSlot<SupervisorState>({
        slot: "supervisor",
        tools,
        resources: [{ uri: VERDICTS_URI, read: (s) => s.verdicts }],
        state,
        wsBase,
        log,
        stub: false,
        version: VERSION,
        grammarsDir: fromRoot("slots", "supervisor", "grammars"),
    });
}
