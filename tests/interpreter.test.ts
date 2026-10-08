/**
 * The interpreter (2026-10-08, harness/core/interpreter.ts): a call whose form does not fit its schema is read toward it before the
 * guard judges it; the schema-guided reading first, a model's extraction next, the call left as sent when neither makes it fit.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { JsonValue } from "@spiky-panda/harness";
import { coerce, interpret, readingNote, schemaError } from "../harness/core/interpreter.js";

const monitoring = {
    type: "object",
    properties: {
        monitoring: {
            type: "object",
            properties: { subjects: { type: "array", items: { type: "string" } }, band: { type: "object", properties: { minBpm: { type: "number" }, maxBpm: { type: "number" } } } },
            required: ["subjects"],
        },
        speedPercent: { type: "number" },
        hatchClosed: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
    },
    required: ["monitoring"],
} as unknown as JsonValue;
const capability = { id: "procedure.submit", description: "submit", inputSchema: monitoring };

describe("the interpreter reads a call toward its schema", () => {
    it("a call that fits is left untouched", async () => {
        const sent = { monitoring: { subjects: ["fe-1"] } } as JsonValue;
        const r = await interpret(capability, sent, null);
        assert.equal(r.reading, null);
        assert.deepEqual(r.input, sent);
    });

    it("Nemotron's occupants as objects are read as their ids, the band kept where it is", async () => {
        const sent = { monitoring: { subjects: [{ id: "fe-1", bandMin: 45, bandMax: 120 }, { id: "fe-2", bandMin: 45, bandMax: 120 }], band: { minBpm: 45, maxBpm: 120 } } } as JsonValue;
        const r = await interpret(capability, sent, null);
        assert.equal(r.reading?.how, "coerced");
        assert.deepEqual((r.input as { monitoring: { subjects: string[] } }).monitoring.subjects, ["fe-1", "fe-2"]);
        assert.equal(r.reading?.changes.length, 2);
        assert.match(readingNote(r.reading!), /monitoring\.subjects\.0: .*-> "fe-1"/);
    });

    it("a number with its unit, a boolean in words, a lone value for a list", () => {
        const changes: string[] = [];
        const read = coerce(monitoring, { monitoring: { subjects: "fe-1" }, speedPercent: "30 %", hatchClosed: "true", tags: "night" }, "", changes);
        assert.deepEqual(read, { monitoring: { subjects: ["fe-1"] }, speedPercent: 30, hatchClosed: true, tags: ["night"] });
        assert.equal(schemaError(monitoring, read), null);
        assert.equal(changes.length, 4);
    });

    it("never guesses: an object with two different identifiers stays as sent", () => {
        const changes: string[] = [];
        const read = coerce({ type: "string" }, { id: "fe-1", name: "Wren" }, "", changes);
        assert.deepEqual(read, { id: "fe-1", name: "Wren" });
        assert.equal(changes.length, 0);
    });

    it("what the schema-guided reading cannot fix goes to the model's extraction, which the schema checks again", async () => {
        const sent = { watch: "the two in the lab, fe-1 and fe-2" } as JsonValue;
        let asked = 0;
        const r = await interpret(capability, sent, async (q) => {
            asked++;
            assert.equal(q.capability, "procedure.submit");
            return { value: { monitoring: { subjects: ["fe-1", "fe-2"] } }, model: "nano" };
        });
        assert.equal(asked, 1);
        assert.equal(r.reading?.how, "extracted");
        assert.equal(r.reading?.model, "nano");
        assert.deepEqual((r.input as { monitoring: { subjects: string[] } }).monitoring.subjects, ["fe-1", "fe-2"]);
    });

    it("an extraction that still does not fit leaves the call as sent, with the schema's words", async () => {
        const sent = { watch: "nobody" } as JsonValue;
        const r = await interpret(capability, sent, async () => ({ value: { monitoring: {} } }));
        assert.equal(r.reading, null);
        assert.deepEqual(r.input, sent);
        assert.match(String(r.error), /required property 'monitoring'/);
    });
});

describe("a revision is read as the model wrote it", () => {
    it("Nano's correction: a path as a key and a value with its justification set the limit and file the justification once", async () => {
        const { revised } = await import("../harness/topics/procedure/index.js");
        const draft = { limits: { co2MaxPpm: 3200, co2AbortPpm: 3200 }, steps: [{ n: 1, speedPercent: 40 }, { n: 2, speedPercent: 100 }], justifications: [] } as never;
        const justification = { value: 3199, source: "library", reference: "test.co2AbortCeilingPpm", reason: "below the abort" };
        const r = revised(draft, { "limits.co2MaxPpm": justification, "steps.2.speedPercent": 90 }, [{ constant: "limits.co2MaxPpm", ...justification }]);
        const p = r.procedure as unknown as { limits: { co2MaxPpm: number }; steps: Array<{ speedPercent: number }>; justifications: Array<{ constant: string }> };
        assert.equal(p.limits.co2MaxPpm, 3199);
        assert.equal(p.steps[1].speedPercent, 90, "steps.2 is the step whose n is 2");
        assert.equal(p.justifications.filter((j) => j.constant === "limits.co2MaxPpm").length, 1);
        assert.ok(!("limits.co2MaxPpm" in (r.procedure as object)), "no root key named after the path");
        assert.equal((draft as { limits: { co2MaxPpm: number } }).limits.co2MaxPpm, 3200, "the draft is not touched");
        assert.ok(r.changes.some((c) => c.includes("read as the path limits.co2MaxPpm")));
    });
});
