/**
 * Which model answers which use (2026-10-08, specs/reasoner/routing.json): the agent, a role named by its prompt file, compose;
 * a use the table leaves null or does not name takes the server's profile. The suite's own table, never the repository's.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
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
});
