import { test } from "node:test";
import assert from "node:assert/strict";
import { toolLogLine } from "../slots/lib/tool-log.js";

test("large reasoning context remains intact while its console entry is bounded metadata", () => {
    const args = { conversationId: "build#one", decisionId: "d1", intention: { id: "build" }, prompt: "specs/procedure/prompt.md", state: { documents: "reference data ".repeat(10000) }, allowedCapabilities: [{ id: "library.read" }] };
    const original = JSON.stringify(args);
    const line = toolLogLine("reasoner", "decide", args);
    assert.ok(line.length < 1000);
    assert.match(line, /build#one/);
    assert.match(line, /payloadCharacters/);
    assert.doesNotMatch(line, /reference data/);
    assert.equal(JSON.stringify(args), original, "console filtering never rewrites the actual model request");
    assert.ok(toolLogLine("station", "ask", { question: "x".repeat(100000) }).length < 1200);
    assert.match(toolLogLine("scrubber", "motor.set_speed", { percent: 40 }), /"percent":40/);
});
