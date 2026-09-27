/**
 * The `fusion` slot, through the broker, against a stand-in for Fusion 360's
 * MCP server (a streamable HTTP endpoint of a few lines: initialize with a
 * session id, tools/list, tools/call, resources/list, resources/read).
 *
 * What belongs to the slot, and what this checks:
 *   - where Fusion listens is a setting: the slot starts on the URL it is
 *     given and `connect {url}` moves it, a dead address refused with the
 *     reason and the previous one kept;
 *   - Fusion's tools are mirrored under their own names with Fusion's schema,
 *     and relayed as they are: the arguments reach the stand-in, the answer
 *     comes back parsed; Fusion's refusal is the slot's refusal;
 *   - `call` reaches a tool by name and `resource` reads a schema;
 *   - `fusion://status` says the address, the connection and the calls.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startBroker, type LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { fusionSlot, probeFusion, type FusionState } from "../slots/fusion/provider.js";
import { connectMcp, toolText, type McpSession } from "../harness/lib/mcp-http.js";

const PORT = 3144;
const quiet = (): undefined => undefined;

/** A stand-in for Fusion's MCP server: one tool, one resource, a session id. */
function fakeFusion(): Promise<{ url: string; server: Server; calls: Array<{ name: string; args: unknown }> }> {
    const calls: Array<{ name: string; args: unknown }> = [];
    const server = createServer((req, res) => {
        if (req.method === "DELETE") {
            res.writeHead(200).end();
            return;
        }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            const frame = JSON.parse(body) as { id?: number; method: string; params?: { name?: string; arguments?: unknown; uri?: string } };
            const reply = (result: unknown, headers: Record<string, string> = {}) => {
                res.writeHead(200, { "Content-Type": "application/json", ...headers }).end(JSON.stringify({ jsonrpc: "2.0", id: frame.id, result }));
            };
            if (frame.id === undefined) {
                res.writeHead(202).end();
                return;
            }
            switch (frame.method) {
                case "initialize":
                    return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "Fake Fusion", version: "0" } }, { "MCP-Session-Id": "s-1" });
                case "tools/list":
                    return reply({ tools: [{ name: "fusion_mcp_read", description: "Read the active model", inputSchema: { type: "object", properties: { operation: { type: "string" } } } }] });
                case "tools/call": {
                    const name = String(frame.params?.name);
                    calls.push({ name, args: frame.params?.arguments });
                    if (name === "fusion_mcp_read") return reply({ content: [{ type: "text", text: JSON.stringify({ operation: (frame.params?.arguments as { operation?: string })?.operation, bodies: 2 }) }] });
                    return reply({ content: [{ type: "text", text: `unknown tool ${name}` }], isError: true });
                }
                case "resources/list":
                    return reply({ resources: [{ uri: "resource://mcp.schema_body", name: "schema_body", mimeType: "application/json" }] });
                case "resources/read":
                    return reply({ contents: [{ uri: frame.params?.uri, mimeType: "application/json", text: JSON.stringify({ fields: ["name", "volume"] }) }] });
                default:
                    return reply({});
            }
        });
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, server, calls }));
    });
}

describe("the fusion slot, relaying an MCP server whose address is a setting", () => {
    let fake: Awaited<ReturnType<typeof fakeFusion>>;
    let broker: LocalBroker;
    let slot: PublishedSlot<FusionState>;
    let fusion: McpSession;

    before(async () => {
        fake = await fakeFusion();
        const probed = await probeFusion(fake.url);
        await probed.session.close();
        broker = await startBroker(PORT, "ignore");
        slot = fusionSlot(broker.wsBase, quiet, { url: fake.url, mirror: probed.tools });
        await slot.open();
        fusion = await connectMcp(broker.httpBase, "fusion", { name: "fusion-test", version: "0" });
    });
    after(async () => {
        await fusion.close().catch(quiet);
        await slot.close().catch(quiet);
        broker.stop();
        fake.server.close();
    });

    const call = async <T>(tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const r = await fusion.callTool(tool, args);
        const text = toolText(r);
        if (r.isError) throw new Error(text);
        const body = JSON.parse(text) as { result?: T; refused?: string };
        if (body.refused) throw new Error(body.refused);
        return (body.result ?? body) as T;
    };

    it("mirrors Fusion's tools under their own names beside its own, and says where Fusion is", async () => {
        const names = (await fusion.listTools()).map((t) => t.name);
        for (const own of ["status", "connect", "tools", "call", "resources", "resource", "fusion_mcp_read"]) assert.ok(names.includes(own), `${own} among ${names.join(", ")}`);
        const status = await call<{ url: string; connected: boolean; serverInfo: { name: string }; tools: string[] }>("status");
        assert.equal(status.url, fake.url);
        assert.equal(status.connected, true);
        assert.equal(status.serverInfo.name, "Fake Fusion");
        assert.deepEqual(status.tools, ["fusion_mcp_read"]);
    });

    it("relays a mirrored tool as it is, and Fusion's refusal is the slot's", async () => {
        const read = await call<{ tool: string; result: { operation: string; bodies: number } }>("fusion_mcp_read", { operation: "bodies" });
        assert.equal(read.result.bodies, 2);
        assert.deepEqual(fake.calls.at(-1), { name: "fusion_mcp_read", args: { operation: "bodies" } });
        const byName = await call<{ result: { operation: string } }>("call", { name: "fusion_mcp_read", arguments: { operation: "sketches" } });
        assert.equal(byName.result.operation, "sketches");
        await assert.rejects(call("call", { name: "nope" }), /unknown tool nope/);
        const resource = await call<{ contents: Array<{ json: { fields: string[] } }> }>("resource", { resourceUri: "resource://mcp.schema_body" });
        assert.deepEqual(resource.contents[0].json.fields, ["name", "volume"]);
    });

    it("moves to another address on connect, refuses a dead one with the reason and keeps the one that answered", async () => {
        await assert.rejects(call("connect", { url: "http://127.0.0.1:1/mcp" }), /Fusion does not answer at http:\/\/127\.0\.0\.1:1\/mcp/);
        const down = JSON.parse((await fusion.request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "fusion://status" })).contents[0].text) as FusionState;
        assert.equal(down.connected, false);
        assert.equal(down.url, fake.url, "the address that answered is kept");
        assert.ok(down.lastError);
        const back = await call<{ connected: boolean; url: string }>("connect", { url: fake.url });
        assert.equal(back.connected, true);
        const status = JSON.parse((await fusion.request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "fusion://status" })).contents[0].text) as FusionState;
        assert.ok(status.calls.some((c) => c.name === "fusion_mcp_read" && c.ok), "the relayed calls are on the status");
    });
});
