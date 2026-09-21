/**
 * A small MCP client over Streamable HTTP, typed, for the agent's sessions on
 * the broker's slots (`<base>/<slot>/mcp`). It exists rather than mcp-core's
 * `McpClient` because the `initialize` handshake must carry what the slots'
 * grammar resolver reads: the agent's family in `clientInfo.name` and its
 * locale in `capabilities.locale`; `McpClient` sends empty capabilities.
 *
 * Three things about `/<slot>/mcp` that are easy to get wrong:
 *
 * 1. `initialize` opens a SESSION. The broker answers with an `Mcp-Session-Id`
 *    header, and every later request on that slot must send it back.
 * 2. `Accept` must list BOTH `application/json` and `text/event-stream`. The
 *    endpoint picks the response framing.
 * 3. A response body may be plain JSON or a one-event SSE stream. `readFrame`
 *    handles both.
 */
import type { McpTool, McpToolResult } from "@cyanmycelium/mcp-core";

export const PROTOCOL_VERSION = "2025-06-18";

export interface JsonRpcErrorShape {
    code: number;
    message: string;
    data?: unknown;
}
interface JsonRpcFrame {
    jsonrpc: "2.0";
    id?: number | string;
    result?: unknown;
    error?: JsonRpcErrorShape;
}

/** A JSON-RPC error answered by the broker or the slot; `rpc.code` -32001 is the broker's policy deny. */
export class McpRpcError extends Error {
    constructor(
        message: string,
        public readonly rpc: JsonRpcErrorShape,
    ) {
        super(message);
        this.name = "McpRpcError";
    }
}

export interface ClientIdentity {
    /** `clientInfo.name`: the agent's family is matched on it (nemotron, gpt, claude, gemini, ...). */
    name: string;
    version: string;
    /** `capabilities.locale`, e.g. "en", "fr", "fr-CA". */
    locale?: string;
}

export interface McpSession {
    endpoint: string;
    slot: string;
    sessionId: string | null;
    serverInfo: { name?: string; version?: string; description?: string } | undefined;
    /** The server's usage note, in the session's wording. */
    instructions: string | undefined;
    /** The wording the server resolved for this session (`_meta.grammar` of the initialize result), null when none. */
    grammar: string | null;
    request<T = unknown>(method: string, params?: unknown): Promise<T>;
    listTools(): Promise<McpTool[]>;
    callTool(name: string, args?: Record<string, unknown>): Promise<McpToolResult>;
    close(): Promise<void>;
}

/** Reads one JSON-RPC frame out of a Streamable HTTP response, whichever framing the endpoint chose. */
export async function readFrame(response: Response): Promise<JsonRpcFrame | undefined> {
    const text = await response.text();
    if (!text.trim()) return undefined;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/event-stream")) {
        try {
            return JSON.parse(text) as JsonRpcFrame;
        } catch {
            throw new Error(`expected JSON from ${response.url} but got ${type || "no content-type"}: ${text.slice(0, 300)}`);
        }
    }
    for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        const frame = JSON.parse(payload) as JsonRpcFrame;
        if (frame.id !== undefined) return frame;
    }
    return undefined;
}

/** Opens a session on `<baseUrl>/<slot>/mcp` and returns a client bound to it. */
export async function connectMcp(baseUrl: string, slot: string, identity: ClientIdentity, extraHeaders: Record<string, string> = {}): Promise<McpSession> {
    const endpoint = `${baseUrl.replace(/\/$/, "")}/${slot}/mcp`;

    const post = async (body: unknown, sessionId: string | null): Promise<Response> => {
        const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...extraHeaders };
        if (sessionId) headers["Mcp-Session-Id"] = sessionId;
        const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`${endpoint} answered HTTP ${response.status} ${response.statusText}. ${text.slice(0, 400)}`);
        }
        return response;
    };

    const capabilities: Record<string, unknown> = identity.locale ? { locale: identity.locale } : {};
    const initResponse = await post(
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities, clientInfo: { name: identity.name, version: identity.version } } },
        null,
    );
    const sessionId = initResponse.headers.get("mcp-session-id");
    const init = await readFrame(initResponse);
    if (init?.error) throw new McpRpcError(`initialize on slot "${slot}" was refused: ${init.error.message} (code ${init.error.code})`, init.error);
    const initResult = (init?.result ?? {}) as { serverInfo?: McpSession["serverInfo"]; instructions?: string; _meta?: { grammar?: unknown } };
    await post({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId).catch(() => undefined);

    let nextId = 2;
    const request = async <T = unknown>(method: string, params: unknown = {}): Promise<T> => {
        const response = await post({ jsonrpc: "2.0", id: nextId++, method, params }, sessionId);
        const frame = await readFrame(response);
        if (frame?.error) throw new McpRpcError(`${method} on slot "${slot}" failed: ${frame.error.message} (code ${frame.error.code})`, frame.error);
        return frame?.result as T;
    };

    return {
        endpoint,
        slot,
        sessionId,
        serverInfo: initResult.serverInfo,
        instructions: initResult.instructions,
        grammar: typeof initResult._meta?.grammar === "string" ? initResult._meta.grammar : null,
        request,
        listTools: async () => (await request<{ tools?: McpTool[] }>("tools/list", {})).tools ?? [],
        callTool: (name, args = {}) => request<McpToolResult>("tools/call", { name, arguments: args }),
        /** Ends the session. The broker frees it; skipping this only leaks a session. */
        close: async () => {
            await fetch(endpoint, { method: "DELETE", headers: sessionId ? { "Mcp-Session-Id": sessionId, ...extraHeaders } : extraHeaders }).catch(() => undefined);
        },
    };
}

/** The plain text of a `tools/call` result. */
export function toolText(result: McpToolResult | undefined): string {
    return (result?.content ?? [])
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("\n");
}

/** The grammar key of a session: what the server put in `_meta.grammar` (mcp-core 1.0.2), null when no wording matched. */
export function grammarOf(session: { grammar?: string | null } | string | undefined): string | null {
    if (!session || typeof session === "string") return null;
    return session.grammar ?? null;
}
