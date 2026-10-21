import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decisionFrom, motherOf, shortMother, withMotherSummary } from "../harness/lib/llm-common.js";
import { validateDecision, type CapabilityDescriptor, type JsonValue } from "@spiky-panda/harness";

const allowed = [{ id: "crew.report", description: "Report", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } }] as CapabilityDescriptor[];

describe("Mother's separate spoken summary", () => {
    it("requires a short summary in the model schema without modifying the business schema", () => {
        const original = allowed[0].inputSchema!;
        const schema = withMotherSummary(original) as { required: string[]; properties: Record<string, unknown> };
        assert.deepEqual(schema.required, ["message", "_mother"]);
        assert.ok(schema.properties._mother);
        assert.equal(JSON.stringify(original).includes("_mother"), false);
    });

    it("preserves detailed content and rationale while removing spoken metadata from executed arguments", () => {
        const message = "Detailed evidence and qualifications. ".repeat(80);
        const rationale = "Full reasoning. ".repeat(100);
        const decision = decisionFrom("crew__report", { message, _mother: "I am checking the proposed twin." }, rationale, allowed);
        assert.deepEqual(decision.invocation.input, { message });
        assert.equal(decision.rationale, rationale);
        assert.equal(motherOf(decision), "I am checking the proposed twin.");
        assert.doesNotThrow(() => validateDecision(decision));
    });

    it("never falls back to speaking detailed content when the summary is absent or invalid", () => {
        for (const summary of [undefined, "", "word ".repeat(21), "x".repeat(161), "First line.\nSecond line."]) {
            assert.equal(shortMother(summary), null);
            const args: Record<string, JsonValue> = { message: "Detailed report." };
            if (summary !== undefined) args._mother = summary;
            const decision = decisionFrom("crew__report", args, "A long rationale.", allowed);
            assert.equal(motherOf(decision), null);
            assert.deepEqual(decision.invocation.input, { message: "Detailed report." });
        }
    });
});
