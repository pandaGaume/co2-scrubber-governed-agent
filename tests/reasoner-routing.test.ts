/**
 * Which model answers which use (2026-10-08, specs/reasoner/routing.json): the agent, a role named by its prompt file, compose;
 * a use the table leaves null or does not name takes the server's profile. The suite's own table, never the repository's.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { Broker } from "../harness/lib/broker.js";
import { ReasonerProvider } from "../harness/providers/reasoner.js";
import { startAllOrFail } from "./lib/start.js";

const PORT = 3217;
const quiet = (): undefined => undefined;

// This file runs in a process of its own: its table routes two uses, the rest takes the server's profile.
const table = path.join(mkdtempSync(path.join(tmpdir(), "routing-")), "routing.json");
writeFileSync(table, JSON.stringify({ uses: { agent: "profiles/nvidia-nebius-ultra.json", procedure: "profiles/nvidia-nebius-super.json", observer: null } }));
process.env.REASONER_ROUTING = table;
process.env.REASONER_PROFILE = "profiles/nvidia-nebius.json";

describe("the reasoner routes each use to its model", () => {
    let broker: LocalBroker;
    let slots: PublishedSlot<object>[];
    let client: Broker;

    before(async () => {
        ({ broker, slots } = await startAllOrFail(PORT));
        client = new Broker(broker.httpBase, { name: "routing-test", version: "0" }, {});
    });
    after(async () => {
        await client.close().catch(quiet);
        for (const s of slots) await s.close().catch(quiet);
        broker.stop();
    });

    it("the agent, a routed role, a role left null, a role not named, and the whole table", async () => {
        const agent = await ReasonerProvider.connect(client);
        assert.equal(agent.model, "nvidia/Nemotron-3-Ultra-550b-a55b");
        const procedure = await ReasonerProvider.connect(client, "specs/procedure/prompt.md");
        assert.equal(procedure.model, "nvidia/nemotron-3-super-120b-a12b");
        assert.match(String(procedure.profile?.file), /nvidia-nebius-super\.json$/);
        const observer = await ReasonerProvider.connect(client, "specs/observer/prompt.md");
        assert.equal(observer.model, "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", "null takes the server's profile");
        const graph = await ReasonerProvider.connect(client, "specs/graph/prompt.md");
        assert.equal(graph.model, "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", "a role not named takes the server's profile");
        const routes = (agent.description as unknown as { routes: Record<string, string> }).routes;
        assert.equal(routes.agent, "nvidia/Nemotron-3-Ultra-550b-a55b");
        assert.equal(routes.compose, "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B");
    });

    it("Nemotron keeps each role prompt, available tools and source results across decisions", async () => {
        const originalFetch = globalThis.fetch;
        const originalKey = process.env.NEBIUS_API_KEY;
        process.env.NEBIUS_API_KEY = "offline-regression-fixture";
        const requests: any[] = [];
        // Intercept only model traffic. MCP still traverses the real local broker and reasoner slot.
        globalThis.fetch = async (url, init) => {
            if (!String(url).startsWith("https://api.tokenfactory.nebius.com/")) return originalFetch(url, init);
            const request = JSON.parse(String(init?.body));
            requests.push(request);
            return new Response(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", tool_calls: [{ id: `offline-${requests.length}`, type: "function", function: { name: "source__read", arguments: JSON.stringify({ id: "record", _mother: "" }) } }] } }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } }), { status: 200 });
        };
        try {
            const allowedCapabilities = Array.from({ length: 8 }, (_, i) => ({ id: i === 0 ? "source.read" : `source.tool${i}`, description: `Read source ${i}`, inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } }));
            for (const role of ["agent", "observer", "procedure"]) {
                const prompt = `specs/${role}/prompt${role === "agent" ? ".mission" : ""}.md`;
                const source = `EXACT_RESULT_${role} ` + "source evidence ".repeat(300);
                for (let turn = 0; turn < 2; turn++) {
                    const result = await client.call("reasoner", "decide", {
                        conversationId: `restore-role-${role}`, prompt, contextMode: "state",
                        intention: { id: `role-${role}`, description: "Inspect the actual source and continue from its result." },
                        state: { id: `state-${turn}`, features: turn === 0 ? {} : { lastCapability: "source.read", lastOutcome: "completed", lastOutput: source, state: { evidence: source } } },
                        allowedCapabilities, candidates: [], recentFailures: [],
                    });
                    assert.equal(result.ok, true, JSON.stringify(result));
                    assert.equal(requests.length, (["agent", "observer", "procedure"].indexOf(role) * 2) + turn + 1, "one model call per decision, no hidden paging loop");
                    const sent = requests.at(-1);
                    assert.ok(sent.messages[0].content.includes(readFileSync(prompt, "utf8").trim()), "the actual role prompt reaches the model");
                    assert.equal(sent.tools.length, allowedCapabilities.length, "all allowed tool schemas are immediately available");
                    assert.ok(!sent.tools.some((t: any) => t.function.name.startsWith("context__")));
                    if (turn) assert.ok(JSON.stringify(sent.messages).includes(source), "the entire previous source result remains readable");
                }
            }
        } finally {
            globalThis.fetch = originalFetch;
            if (originalKey === undefined) delete process.env.NEBIUS_API_KEY;
            else process.env.NEBIUS_API_KEY = originalKey;
        }
    });
});
