/**
 * The last call's result reaches the model once and whole (2026-10-11, Test F): a library search of 7926 characters was cut at 2000 in
 * the middle of its JSON and sent twice, in the tool message and again in the observation.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PolicyFallbackInput } from "@spiky-panda/harness";
import { observationText } from "../harness/lib/llm-common.js";

const input = (lastOutput: string) =>
    ({ state: { id: "cabin:NOMINAL", features: { co2Ppm: 1500, lastCapability: "library.search", lastOutcome: "completed", lastOutput } }, candidates: [], recentFailures: [], allowedCapabilities: [], intention: { id: "energy-shortage" } }) as unknown as PolicyFallbackInput;

describe("the last call's result in the observation", () => {
    it("is not repeated when it went in a tool message", () => {
        const text = observationText(input("x".repeat(7926)), { resultSent: true });
        assert.ok(!text.includes("xxxx"));
        assert.match(text, /\(in the tool result above\)/);
    });

    it("is carried whole when no tool message carries it (the state mode, a first step)", () => {
        assert.ok(observationText(input("y".repeat(7926))).includes("y".repeat(7926)));
    });
});
