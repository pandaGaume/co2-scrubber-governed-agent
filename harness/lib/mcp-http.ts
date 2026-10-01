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

/**
 * A request on a connection of its own, closed after its answer (2026-10-01). The global fetch keeps a connection open between
 * requests, and the broker's server closes one idle for 5 seconds; a process whose event loop was busy longer (the station building
 * the harness's graph, synchronously, for several seconds) then wrote its next request on a connection the server had closed, and
 * read ECONNRESET: "fetch failed", at the station's first call after a long reading. Whether the server had read that request
 * cannot be told, so it is never sent again; it is sent on a connection no one closed. On the same machine a connection per call
 * costs nothing that shows. In a browser (the pages bundle this client), fetch as before: node:http is not there, and is loaded by
 * a name the bundler does not resolve.
 */
const IN_NODE = typeof process !== "undefined" && Boolean(process.versions?.node);
type NodeRequest = typeof import("node:http").request;
let modules: Promise<{ http: NodeRequest; https: NodeRequest }> | null = null;
const nodeRequests = (): Promise<{ http: NodeRequest; https: NodeRequest }> => {
    const named = (name: string) => import(/* a name the bundler leaves alone */ `node:${name}`) as Promise<{ request: NodeRequest }>;
    return (modules ??= Promise.all([named("http"), named("https")]).then(([h, s]) => ({ http: h.request, https: s.request })));
};
async function send(endpoint: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }): Promise<Response> {
    if (!IN_NODE) return fetch(endpoint, { method: init.method, headers: init.headers, ...(init.body !== undefined ? { body: init.body } : {}), ...(init.signal ? { signal: init.signal } : {}) });
    const url = new URL(endpoint);
    const requests = await nodeRequests();
    const request = url.protocol === "https:" ? requests.https : requests.http;
    return new Promise((resolve, reject) => {
        const headers = { ...init.headers, Connection: "close", ...(init.body !== undefined ? { "Content-Length": String(Buffer.byteLength(init.body)) } : {}) };
        const req = request(url, { method: init.method, headers, agent: false, ...(init.signal ? { signal: init.signal } : {}) }, (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c: Buffer) => chunks.push(c));
            res.on("error", reject);
            res.on("end", () => {
                const h = new Headers();
                for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) h.set(k, Array.isArray(v) ? v.join(", ") : v);
                const status = res.statusCode ?? 500;
                // A status that carries no body (204, 205, 304) cannot be given one.
                resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, statusText: res.statusMessage ?? "", headers: h }));
            });
        });
        req.on("error", reject);
        if (init.body !== undefined) req.write(init.body);
        req.end();
    });
}

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
    return connectMcpAt(`${baseUrl.replace(/\/$/, "")}/${slot}/mcp`, slot, identity, extraHeaders);
}

/**
 * A session on any streamable HTTP MCP endpoint, given whole (2026-09-27: Fusion 360's own server at http://127.0.0.1:27182/mcp, relayed by the
 * `fusion` slot); `slot` names it in the errors. `timeoutMs` bounds the initialize: a server that is not there answers with a refused connection
 * at once, one that hangs is not waited for.
 */
export async function connectMcpAt(endpoint: string, slot: string, identity: ClientIdentity, extraHeaders: Record<string, string> = {}, options: { timeoutMs?: number } = {}): Promise<McpSession> {
    const post = async (body: unknown, sessionId: string | null, timeoutMs?: number): Promise<Response> => {
        const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...extraHeaders };
        if (sessionId) headers["Mcp-Session-Id"] = sessionId;
        // The option's timeout bounds every request of the session (2026-09-27: a CAD add-in that stalled on tools/list hung a whole test suite for three hours).
        const bound = timeoutMs ?? options.timeoutMs;
        const response = await send(endpoint, { method: "POST", headers, body: JSON.stringify(body), ...(bound ? { signal: AbortSignal.timeout(bound) } : {}) });
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
        options.timeoutMs,
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
            await send(endpoint, { method: "DELETE", headers: sessionId ? { "Mcp-Session-Id": sessionId, ...extraHeaders } : extraHeaders }).catch(() => undefined);
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
