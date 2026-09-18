/**
 * A stub provider: publishes an MCP server on a broker slot, answers the
 * handshake, lists the slot's tools with their real names and schemas, and
 * executes nothing. Every `tools/call` returns what it received, marked
 * `stub: true`, so the dashboard, the policy and the trace can be built and
 * seen before any slot has a body behind it.
 *
 * The wire is the plain JSON-RPC of the broker's multiplex tunnel: one shared
 * WebSocket to `ws://<broker>/providers`, envelopes keyed by slot name. The
 * pairing rule of the broker applies (`MultiplexTransport` with `/providers`,
 * never `/provider/<name>`), see mcp-broker's docs/endpoints.md.
 *
 * A stub can hold a little state (`state`) and let a tool change it, so the
 * dashboard shows something that moves; that state is the only thing that is
 * not a pure echo, and it is declared per slot.
 */
import { MultiplexTransport } from "@cyanmycelium/mcp-broker-provider";

export const PROTOCOL_VERSION = "2025-06-18";

/**
 * @typedef {object} StubTool
 * @property {string} name
 * @property {string} description
 * @property {object} inputSchema JSON schema of the arguments
 * @property {(args: Record<string, unknown>, state: Record<string, unknown>) => unknown} [handle]
 *   Optional: computes a result from the arguments and the slot state; may mutate the state.
 *   Without it, the tool echoes its arguments.
 */

/**
 * @param {object} options
 * @param {string} options.slot            Slot name on the broker.
 * @param {string} options.description     One line, shown by `_broker` and by the dashboard.
 * @param {StubTool[]} options.tools
 * @param {Array<{ uri: string, name: string, description: string, read: (state) => unknown }>} [options.resources]
 * @param {Record<string, unknown>} [options.state]
 * @param {string} options.wsBase          e.g. "ws://localhost:3000"
 * @param {(line: string) => void} [options.log]
 */
export function publishStub({ slot, description, tools, resources = [], state = {}, wsBase, log = console.log }) {
    const transport = MultiplexTransport.create(slot, `${wsBase}/providers`, { aggregate: true });
    const send = (frame) => transport.send(JSON.stringify(frame));
    const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
    const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

    transport.onMessage = (raw) => {
        let frame;
        try {
            frame = JSON.parse(raw);
        } catch {
            return;
        }
        if (frame.id === undefined || frame.id === null) return; // a notification: nothing to answer
        switch (frame.method) {
            case "initialize":
                return reply(frame.id, {
                    protocolVersion: PROTOCOL_VERSION,
                    capabilities: { tools: {}, resources: {} },
                    serverInfo: { name: slot, version: "0.1.0-stub", description },
                });
            case "ping":
                return reply(frame.id, {});
            case "tools/list":
                return reply(frame.id, { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
            case "tools/call": {
                const name = frame.params?.name;
                const args = frame.params?.arguments ?? {};
                const tool = tools.find((t) => t.name === name);
                if (!tool) return fail(frame.id, -32602, `unknown tool "${name}" on slot "${slot}"`);
                let result;
                try {
                    result = tool.handle ? tool.handle(args, state) : { echo: args };
                } catch (e) {
                    log(`[${slot}] ${name} refused: ${e.message}`);
                    return reply(frame.id, { isError: true, content: [{ type: "text", text: JSON.stringify({ slot, tool: name, refused: e.message, stub: true }) }] });
                }
                log(`[${slot}] ${name} ${JSON.stringify(args)}`);
                return reply(frame.id, { content: [{ type: "text", text: JSON.stringify({ slot, tool: name, arguments: args, result, stub: true, at: new Date().toISOString() }) }] });
            }
            case "resources/list":
                return reply(frame.id, { resources: resources.map(({ uri, name, description }) => ({ uri, name, description, mimeType: "application/json" })) });
            case "resources/read": {
                const uri = frame.params?.uri;
                const res = resources.find((r) => r.uri === uri);
                if (!res) return fail(frame.id, -32602, `unknown resource "${uri}" on slot "${slot}"`);
                return reply(frame.id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(res.read(state)) }] });
            }
            default:
                return fail(frame.id, -32601, `Method not found: ${frame.method}`);
        }
    };
    transport.onOpen = () => log(`[${slot}] published on ${wsBase}/providers`);
    transport.onError = (err) => log(`[${slot}] error: ${err.message}`);
    transport.onClose = () => log(`[${slot}] socket closed`);

    return {
        slot,
        state,
        open: () => transport.connect(),
        close: () => transport.close(),
        get isOpen() {
            return transport.isOpen;
        },
    };
}
