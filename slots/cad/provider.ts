/**
 * The `cad` slot, CAD: Autodesk Fusion 360's own MCP server (its add-in, the
 * "MCP Server Adapter" on a streamable HTTP endpoint of this machine), published
 * on the broker as one more slot, so a factory can read a 3D model, execute an
 * operation in it, or undo one, through the same broker, the same policy and
 * the same trace as every other capability.
 *
 * Where Fusion listens is a setting, never a constant: `FUSION_MCP_URL` in the
 * environment (`.env`), `http://127.0.0.1:27182/mcp` when nothing says otherwise,
 * and `connect {url}` changes it while the server runs (another machine, another
 * port, another CAD's MCP server on the same shape). `cad://status` says
 * which address is in use and whether it answers.
 *
 * Two layers of tools:
 *   - the slot's own, always there: `status`, `connect`, `tools` (what Fusion
 *     exposes, with its schemas), `call {name, arguments}` (one of them),
 *     `resources` and `resource {uri}` (Fusion's schemas of its entities);
 *   - Fusion's tools mirrored under their own names when Fusion answered at
 *     start (`fusion_mcp_read`, `fusion_mcp_execute`, ...), each with the
 *     description and the schema Fusion gives, so a catalogue reads them as it
 *     reads any tool. Fusion absent at start: the mirror is empty, `call`
 *     still reaches whatever `connect` finds later.
 *
 * Kept out of the night's agent's catalogue (`tier3/lib/capabilities.ts`): a
 * CAD model is the factories' business, not a cabin capability.
 */
import type { McpTool } from "@cyanmycelium/mcp-core";
import { connectMcpAt, toolText, type McpSession } from "../../harness/lib/mcp-http.js";
import { objectSchema as obj, publishSlot, type PublishedSlot, type SlotTool } from "../lib/slot-server.js";
import { fromRoot } from "../../lib/paths.js";

export const DEFAULT_CAD_MCP_URL = "http://127.0.0.1:27182/mcp";

/** How long the slot waits for Fusion at start and at `connect`: a CAD that is not running answers with a refused connection at once; one that hangs is not waited for. */
const CONNECT_TIMEOUT_MS = Number(process.env.CAD_MCP_TIMEOUT_MS ?? process.env.FUSION_MCP_TIMEOUT_MS ?? 4000);

export interface FusionState {
    /** The endpoint in use. */
    url: string;
    connected: boolean;
    serverInfo: { name?: string; version?: string } | null;
    /** The tools Fusion listed at the last connection, by name. */
    tools: McpTool[];
    /** The last connection error, when not connected. */
    lastError: string | null;
    /** The calls relayed, the latest last (twenty kept). */
    calls: Array<{ name: string; at: string; ok: boolean; ms: number }>;
}

export interface FusionSlotOptions {
    /** The endpoint to start on; `FUSION_MCP_URL` then the default when absent. */
    url?: string;
    /** The tools mirrored at publish: Fusion's, when it answered; given here by a test. */
    mirror?: McpTool[];
}

const IDENTITY = { name: "co2-scrubber-governed-agent", version: "0.1.0" };

/** Fusion's tool names are its own; the slot's own tools keep short names, so a mirrored name never shadows one. */
const OWN_TOOLS = new Set(["status", "connect", "tools", "call", "resources", "resource"]);

/** Opens a session on the endpoint, or says why it cannot, within the timeout. */
export async function probeFusion(url: string, timeoutMs = CONNECT_TIMEOUT_MS): Promise<{ session: McpSession; tools: McpTool[] }> {
    const session = await connectMcpAt(url, "cad", IDENTITY, {}, { timeoutMs });
    const tools = await session.listTools();
    return { session, tools };
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function cadSlot(wsBase: string, log: (line: string) => void, options: FusionSlotOptions = {}): PublishedSlot<FusionState> {
    const state: FusionState = { url: options.url ?? process.env.CAD_MCP_URL ?? process.env.FUSION_MCP_URL ?? DEFAULT_CAD_MCP_URL, connected: false, serverInfo: null, tools: options.mirror ?? [], lastError: null, calls: [] };
    let session: McpSession | null = null;

    /** The session in use, opened on demand; a session that fails is dropped and the next call opens another. */
    const connect = async (url = state.url): Promise<McpSession> => {
        if (session && url === state.url) return session;
        if (session) await session.close().catch(() => undefined);
        session = null;
        try {
            const probed = await probeFusion(url);
            session = probed.session;
            state.url = url;
            state.connected = true;
            state.serverInfo = probed.session.serverInfo ?? null;
            state.tools = probed.tools;
            state.lastError = null;
            log(`[cad] connected to ${url}: ${probed.session.serverInfo?.name ?? "an MCP server"} ${probed.session.serverInfo?.version ?? ""}, ${probed.tools.length} tool(s)`);
            return probed.session;
        } catch (e) {
            state.connected = false;
            state.lastError = errorText(e);
            throw new Error(`Fusion does not answer at ${url}: ${state.lastError}. Start Fusion 360 with its MCP add-in, or connect {url} to where it listens`);
        }
    };

    /** One tool of Fusion, relayed; a session that fails once is reopened once. */
    const relay = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
        const t0 = Date.now();
        const attempt = async (): Promise<unknown> => {
            const s = await connect();
            const result = await s.callTool(name, args);
            const text = toolText(result);
            if (result.isError) throw new Error(text || `Fusion refused ${name}`);
            let parsed: unknown = text;
            try {
                parsed = text ? JSON.parse(text) : null;
            } catch {
                parsed = text;
            }
            return { tool: name, result: parsed, content: result.content.filter((c) => c.type !== "text") };
        };
        try {
            const out = await attempt().catch(async (e) => {
                // A session Fusion dropped (its add-in restarted) is reopened once; a refusal by the tool is not retried.
                if (!/HTTP 4\d\d|session|ECONNRESET|fetch failed/i.test(errorText(e))) throw e;
                session = null;
                return attempt();
            });
            state.calls.push({ name, at: new Date().toISOString(), ok: true, ms: Date.now() - t0 });
            while (state.calls.length > 20) state.calls.shift();
            return out;
        } catch (e) {
            state.calls.push({ name, at: new Date().toISOString(), ok: false, ms: Date.now() - t0 });
            while (state.calls.length > 20) state.calls.shift();
            throw e;
        }
    };

    const own: SlotTool<FusionState>[] = [
        // The slot's own wording is in grammars/default/{en,fr}.json, as the workshop slots'; the mirrored tools carry Fusion's inline.
        {
            name: "status",
            inputSchema: obj({}),
            handle: async (_args, s) => {
                await connect().catch(() => undefined);
                return { url: s.url, connected: s.connected, serverInfo: s.serverInfo, tools: s.tools.map((t) => t.name), lastError: s.lastError, calls: s.calls.slice(-5) };
            },
        },
        {
            name: "connect",
            inputSchema: obj({ url: { type: "string" } }),
            handle: async (args, s) => {
                const url = typeof args.url === "string" && args.url.trim() ? args.url.trim() : s.url;
                if (!/^https?:\/\//.test(url)) throw new Error(`"${url}" is not an http(s) endpoint`);
                if (url !== s.url) session = null;
                const opened = await connect(url);
                return { url: s.url, connected: true, serverInfo: opened.serverInfo ?? null, tools: s.tools.map((t) => t.name) };
            },
        },
        {
            name: "tools",
            inputSchema: obj({}),
            handle: async (_args, s) => {
                const opened = await connect();
                s.tools = await opened.listTools();
                return { url: s.url, tools: s.tools };
            },
        },
        {
            name: "call",
            inputSchema: obj({ name: { type: "string" }, arguments: { type: "object" } }, ["name"]),
            handle: async (args) => {
                const name = String(args.name ?? "").trim();
                if (!name) throw new Error("name is needed: one of Fusion's tools (tools lists them)");
                const arg = args.arguments && typeof args.arguments === "object" && !Array.isArray(args.arguments) ? (args.arguments as Record<string, unknown>) : {};
                return relay(name, arg);
            },
        },
        {
            name: "resources",
            inputSchema: obj({}),
            handle: async () => {
                const opened = await connect();
                const listed = await opened.request<{ resources?: unknown[] }>("resources/list", {});
                return { url: state.url, resources: listed.resources ?? [] };
            },
        },
        {
            // The argument is not named `uri`: mcp-core's server routes a tools/call whose arguments carry `uri` to a resource instance of its own.
            name: "resource",
            inputSchema: obj({ resourceUri: { type: "string" } }, ["resourceUri"]),
            handle: async (args) => {
                const uri = String(args.resourceUri ?? "").trim();
                if (!uri) throw new Error("resourceUri is needed: one of Fusion's resources (resources lists them)");
                const opened = await connect();
                const read = await opened.request<{ contents?: Array<{ uri?: string; mimeType?: string; text?: string; blob?: string }> }>("resources/read", { uri });
                const contents = (read.contents ?? []).map((c) => {
                    if (typeof c.text !== "string") return c;
                    try {
                        return { ...c, json: JSON.parse(c.text) };
                    } catch {
                        return c;
                    }
                });
                return { uri, contents };
            },
        },
    ];

    // Fusion's tools mirrored under their own names, each relayed as it is: the description and the schema are Fusion's.
    const mirrored: SlotTool<FusionState>[] = (options.mirror ?? state.tools)
        .filter((t) => !OWN_TOOLS.has(t.name))
        .map((t) => ({
            name: t.name,
            description: t.description ?? `Fusion's ${t.name}`,
            ...(t.title ? { title: t.title } : {}),
            inputSchema: (t.inputSchema as object | undefined) ?? { type: "object", properties: {} },
            handle: (args) => relay(t.name, args as Record<string, unknown>),
        }));

    return publishSlot<FusionState>({
        slot: "cad",
        stub: false,
        version: "0.1.0",
        wsBase,
        log,
        state,
        tools: [...own, ...mirrored],
        grammarsDir: fromRoot("slots", "cad", "grammars"),
        resources: [
            {
                uri: "cad://status",
                read: (s) => ({ url: s.url, connected: s.connected, serverInfo: s.serverInfo, tools: s.tools.map((t) => t.name), lastError: s.lastError, calls: s.calls }),
            },
        ],
    });
}

/**
 * The slot as `run-all` publishes it: Fusion is probed first so its tools are
 * mirrored when it answers; absent, the slot is published with its own tools
 * only and says so in the log, and `connect` reaches Fusion later.
 */
export async function cadSlotProbed(wsBase: string, log: (line: string) => void): Promise<PublishedSlot<FusionState>> {
    const url = process.env.CAD_MCP_URL ?? process.env.FUSION_MCP_URL ?? DEFAULT_CAD_MCP_URL;
    try {
        const { session, tools } = await probeFusion(url);
        await session.close().catch(() => undefined);
        log(`[cad] ${session.serverInfo?.name ?? "an MCP server"} answers at ${url}: ${tools.length} tool(s) mirrored (${tools.map((t) => t.name).join(", ")})`);
        return cadSlot(wsBase, log, { url, mirror: tools });
    } catch (e) {
        log(`[cad] nothing answers at ${url} (${errorText(e)}): published with its own tools only; connect {url} when Fusion is up`);
        return cadSlot(wsBase, log, { url });
    }
}
