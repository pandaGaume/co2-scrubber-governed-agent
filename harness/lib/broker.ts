/**
 * The Tier client's view of the broker: one MCP session per slot, opened
 * as the agent's identity (its family and locale, which the slots' grammars
 * answer to; the tier3 token once the broker's authorization is on), and
 * the classification of what comes back. Three outcomes exist in the
 * architecture and the harness sees them as a capability result:
 *
 *   completed       { ok: true,  output }                        the policy allowed it and the device did it
 *   device refused  { ok: false, error: "device refused: ..." }  the device's envelope or MIN-FLOW said no (isError)
 *   policy deny     { ok: false, error: "policy deny: ..." }     the broker's authorization said no (rpc -32001)
 *
 * plus `error` (no answer: the slot is down or the arguments are wrong).
 */
import type { McpTool } from "@cyanmycelium/mcp-core";
import { McpRpcError, connectMcp, grammarOf, toolText, type ClientIdentity, type McpSession } from "./mcp-http.js";
import { brokerAuth, type BrokerRole } from "./broker-auth.js";

export type Outcome = "completed" | "refused" | "deny" | "error";
export const OUTCOMES: readonly Outcome[] = ["completed", "refused", "deny", "error"];

export interface CallResult {
    ok: boolean;
    outcome: Outcome;
    output?: unknown;
    error?: string;
}

/** What a slot said at `initialize`: the wording it chose for this client. */
export interface SlotSession {
    slot: string;
    serverInfo: McpSession["serverInfo"];
    instructions: string | undefined;
    grammar: string | null;
}

interface ProvidersListed {
    providers?: Array<string | { name: string }>;
}

export class Broker {
    private readonly sessions = new Map<string, Promise<McpSession>>();
    private readonly headers: Record<string, string>;

    /**
     * @param base      http://host:port of the broker
     * @param identity  the agent as the slots see it: `clientInfo.name` (its family) and locale
     * @param auth      the role it calls as (its token read from `BROKER_TOKEN_<ROLE>`, harness/lib/broker-auth.ts),
     *                  or the headers themselves, e.g. { Authorization: "Bearer <token>" }; none when the broker's authorization is off
     */
    constructor(
        public readonly base: string,
        public readonly identity: ClientIdentity,
        auth: BrokerRole | Record<string, string> = {},
    ) {
        this.headers = typeof auth === "string" ? brokerAuth(auth) : auth;
    }

    session(slot: string): Promise<McpSession> {
        let s = this.sessions.get(slot);
        if (!s) {
            const opening = connectMcp(this.base, slot, this.identity, this.headers);
            // A session that could not be opened is not kept (2026-10-01): a slot not yet published when a client first asks for it
            // (the station at startup, before the library) failed every later call of that client with the same "fetch failed".
            // The next call opens it again; a tool call is never sent twice for it.
            opening.catch(() => {
                if (this.sessions.get(slot) === opening) this.sessions.delete(slot);
            });
            s = opening;
            this.sessions.set(slot, s);
        }
        return s;
    }

    /** What each opened slot answered at `initialize`. */
    async describeSessions(): Promise<SlotSession[]> {
        const out: SlotSession[] = [];
        for (const [slot, p] of this.sessions) {
            const s = await p;
            out.push({ slot, serverInfo: s.serverInfo, instructions: s.instructions, grammar: grammarOf(s) });
        }
        return out;
    }

    /** Provider slots the broker lists (the reserved `_all` and `_broker` excluded). */
    async slots(): Promise<string[]> {
        const broker = await this.session("_broker");
        const listed = await broker.callTool("providers_list", {});
        let providers: unknown;
        try {
            providers = JSON.parse(toolText(listed));
        } catch {
            providers = [];
        }
        const list = Array.isArray(providers) ? (providers as Array<string | { name: string }>) : ((providers as ProvidersListed)?.providers ?? []);
        return list.filter((p) => typeof p === "string" || (p as { connected?: boolean }).connected !== false).map((p) => (typeof p === "string" ? p : p.name)).filter((n) => n && !n.startsWith("_"));
    }

    /** The tools of one slot, as `tools/list` reports them to this identity. */
    async tools(slot: string): Promise<McpTool[]> {
        return (await this.session(slot)).listTools();
    }

    /** Calls a tool and classifies the answer. Never throws for a refusal or a deny: those are results the agent must see and the trace must keep. */
    async call(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<CallResult> {
        try {
            const s = await this.session(slot);
            const result = await s.callTool(tool, args);
            const text = toolText(result);
            let payload: Record<string, unknown> | undefined;
            try {
                payload = JSON.parse(text) as Record<string, unknown>;
            } catch {
                payload = { text };
            }
            if (result?.isError) {
                const reason = payload?.refused ?? payload?.error ?? text;
                return { ok: false, outcome: "refused", error: `device refused: ${String(reason)}`, output: payload };
            }
            return { ok: true, outcome: "completed", output: payload && "result" in payload ? payload.result : payload };
        } catch (error) {
            // "fetch failed" says nothing alone: its cause (a socket closed by the other side, a refused connection) is what to read.
            const cause = error instanceof Error && error.cause instanceof Error ? `${error.cause.message}${(error.cause as { code?: string }).code ? ` (${(error.cause as { code?: string }).code})` : ""}` : null;
            const message = `${error instanceof Error ? error.message : String(error)}${cause ? `: ${cause}` : ""}`;
            const code = error instanceof McpRpcError ? error.rpc.code : undefined;
            if (code === -32001 || /forbidden|not allowed|unauthori[sz]ed/i.test(message)) return { ok: false, outcome: "deny", error: `policy deny: ${message}` };
            return { ok: false, outcome: "error", error: `error: ${message}` };
        }
    }

    async close(): Promise<void> {
        for (const p of this.sessions.values()) {
            try {
                await (await p).close();
            } catch {
                // the broker frees the session by itself
            }
        }
        this.sessions.clear();
    }
}
