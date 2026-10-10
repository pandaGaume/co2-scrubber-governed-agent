/**
 * The documents a task read (2026-10-10, run 24: 76 reads, the same documents three times over as they fell out of the evidence's last
 * ten answers): kept in the progress, shown in the state, the last whole and the earlier by their lines with a number; not read again.
 *
 *     node --test dist/tests/read-documents.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PolicyDecision } from "@spiky-panda/harness";
import { numericLines, readDocumentsOf } from "../harness/core/reasoning-state.js";
import { createBuilderGuard } from "../harness/core/builder-guard.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import { OBSERVER_TOPIC } from "../harness/topics/observer/index.js";

describe("the documents a task read", () => {
    it("shown whole for the last, by their lines with a number for the earlier", () => {
        const docs = [
            { id: "scrubber-1-datasheet", title: "Datasheet", text: "# Datasheet\nA variable-speed scrubber.\nAir flow at full speed: 3.3 m3/min\nEfficiency 0.3", step: 2 },
            { id: "station-topology", title: "Topology", text: "# Topology\nThe ventilation keeps running, hatch closed: 3 m3/min.", step: 3 },
        ];
        const shown = readDocumentsOf(docs) as Record<string, { title: string; step: number; text?: string; lines?: string }>;
        assert.equal(shown["scrubber-1-datasheet"].lines, "Air flow at full speed: 3.3 m3/min\nEfficiency 0.3");
        assert.equal(shown["scrubber-1-datasheet"].text, undefined);
        assert.match(String(shown["station-topology"].text), /^# Topology\nThe ventilation keeps running/);
        assert.equal(numericLines("a 1\nb 2\nc 3", 4), "a 1\n...");
    });

    it("a document read is not read again: the guard says where it is", async () => {
        const progress = newProgress();
        progress.documents.push({ id: "station-topology", title: "Topology", text: "...", step: 3 });
        const guard = createBuilderGuard({ broker: {} as never, task: { objective: { required_outputs: [], constraints: {} }, observations: {}, data: [] } as never, topic: OBSERVER_TOPIC, taskId: "t", progress } as never);
        const decide = (id: string): PolicyDecision => ({ action: { id: "library.read", description: "" }, invocation: { actionId: "library.read", capabilityId: "library.read", input: { id } }, rationale: "" });
        const again = await guard.validate(decide("station-topology"), {} as never);
        assert.equal(again.allowed, false);
        assert.match(String(again.reason), /"station-topology" was read at step 3: it is in the state \(readDocuments/);
        assert.equal((await guard.validate(decide("scrubber-1-datasheet"), {} as never)).allowed, true);
    });
});
