import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Broker } from "../harness/lib/broker.js";

test("failed resource reads and calls discard stale sessions without replaying requests", async () => {
    let generations = 0;
    let expired = false;
    let reads = 0;
    let calls = 0;
    const server = createServer(async (req, res) => {
        let text = "";
        for await (const chunk of req) text += chunk;
        if (req.method === "DELETE") { res.writeHead(200).end(); return; }
        const frame = JSON.parse(text);
        res.setHeader("Content-Type", "application/json");
        if (frame.method === "initialize") {
            generations++; expired = false;
            res.setHeader("Mcp-Session-Id", `s${generations}`);
            res.end(JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "fixture", version: "1" } } }));
            return;
        }
        if (frame.method === "resources/read") reads++;
        if (frame.method === "tools/call") calls++;
        if (expired) { res.writeHead(404).end("Session no longer exists"); return; }
        if (frame.id === undefined) { res.writeHead(202).end(); return; }
        res.end(JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: frame.method === "resources/read" ? { contents: [{ text: "audio queue" }] } : { content: [{ type: "text", text: "{}" }] } }));
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const broker = new Broker(`http://127.0.0.1:${port}`, { name: "fixture", version: "1" });
    try {
        const first = await broker.session("speech");
        expired = true;
        await assert.rejects(first.request("resources/read", { uri: "speech://queue" }), /404/);
        assert.equal(reads, 1, "a failed read was not automatically replayed");
        const second = await broker.session("speech");
        assert.notEqual(second.sessionId, first.sessionId);
        await second.request("resources/read", { uri: "speech://queue" });
        assert.equal(reads, 2);
        expired = true;
        assert.equal((await broker.call("speech", "take", {})).ok, false);
        assert.equal(calls, 1, "a call with unknown outcome must never be retried automatically");
        const third = await broker.session("speech");
        assert.notEqual(third.sessionId, second.sessionId);
        assert.equal(generations, 3);
    } finally {
        await broker.close();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});
