/**
 * The interpreter (2026-10-08, harness/core/interpreter.ts): a call whose form does not fit its schema is read toward it before the
 * guard judges it; the schema-guided reading first, a model's extraction next, the call left as sent when neither makes it fit.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { JsonValue } from "@spiky-panda/harness";
import { asFileId, coerce, FILE_ID_PATTERN, interpret, readMeaning, readingNote, schemaError, unmoved } from "../harness/core/interpreter.js";
import { PROCEDURE_SCHEMA } from "../harness/topics/procedure/index.js";

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

    it("an identifier that names a file, written another way, is read in the file's form (2026-10-10, run 5: an underscore refused twice)", async () => {
        const schema = { type: "object", properties: { id: { type: "string", pattern: FILE_ID_PATTERN } }, required: ["id"] } as unknown as JsonValue;
        const r = await interpret({ id: "procedure.submit", inputSchema: schema }, { id: "v_lab-measure-2026-10-14-01" });
        assert.deepEqual(r.input, { id: "v-lab-measure-2026-10-14-01" });
        assert.equal(r.reading?.how, "coerced");
        assert.deepEqual(r.reading?.changes, ['id: "v_lab-measure-2026-10-14-01" -> "v-lab-measure-2026-10-14-01"']);
        assert.equal(asFileId("Décroissance  CO2 / Lab_01"), "decroissance-co2-lab-01");
        // Nothing in it to name a file by: left as sent, the schema's words refuse it.
        assert.equal((await interpret({ id: "procedure.submit", inputSchema: schema }, { id: "___" })).error !== null, true);
        // A procedure's id is that form, in its schema.
        assert.equal(((PROCEDURE_SCHEMA as { properties: Record<string, { pattern?: string }> }).properties.id.pattern), FILE_ID_PATTERN);
    });

    it("a connection written as a pair of pairs is read as {from, to} (2026-10-10, run 20)", async () => {
        const pairOf = { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 };
        const schema = { type: "object", properties: { connections: { type: "array", items: { type: "object", properties: { from: pairOf, to: pairOf }, required: ["from", "to"] } } }, required: ["connections"] } as unknown as JsonValue;
        const r = await interpret({ id: "graph.evaluate", inputSchema: schema }, { connections: [[["generated-1", "co2Ppm"], ["lab", "delta_CO2_2"]]] });
        assert.deepEqual(r.input, { connections: [{ from: ["generated-1", "co2Ppm"], to: ["lab", "delta_CO2_2"] }] });
        assert.equal(r.reading?.how, "coerced");
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

describe("the meaning: a call whose form passed but moved nothing refused", () => {
    const refusedBefore = { key: "limits.co2MaxPpm", problems: [{ path: "limits.co2MaxPpm", got: "3200", expected: "below limits.co2AbortPpm = 3200", says: "bounds" }] };
    const nanoRevise = { changes: { "limits.co2MaxPpm": { value: 3199, source: "library", reference: "test.co2AbortCeilingPpm", reason: "must be below abort threshold" } } };

    it("is seen: refused again at a path whose value did not move, the same call sent again included", () => {
        const still = unmoved(refusedBefore, { problems: [...refusedBefore.problems, { path: "steps.1.minutes", got: "10", says: "x" }] });
        assert.deepEqual(still.map((p) => p.path), ["limits.co2MaxPpm"], "only the points refused both times");
        assert.equal(unmoved(refusedBefore, { problems: [{ ...refusedBefore.problems[0], got: "3199" }] }).length, 0, "the value moved");
        assert.equal(unmoved(null, refusedBefore).length, 0, "a first refusal");
    });

    it("is read by a model into the tool's form, checked by the schema, and differs from what was sent", async () => {
        const schema = { type: "object", properties: { changes: { type: "object" }, justifications: { type: "array" } }, required: ["changes"] } as unknown as JsonValue;
        let asked: unknown = null;
        const read = await readMeaning({ capability: "procedure.revise", description: "revise", schema, sent: nanoRevise as unknown as JsonValue, refused: refusedBefore.problems, intent: "must be below abort threshold" }, async (q) => {
            asked = q;
            return { value: { changes: { limits: { co2MaxPpm: 3199 } }, justifications: [{ constant: "limits.co2MaxPpm", value: 3199, source: "library", reference: "test.co2AbortCeilingPpm" }] }, model: "super" };
        });
        assert.ok(asked, "the reader was asked");
        assert.ok("input" in read);
        assert.equal(read.reading.how, "meant");
        assert.equal(read.reading.model, "super");
        assert.equal(read.outcome.result, "read");
        assert.deepEqual((read.input as { changes: unknown }).changes, { limits: { co2MaxPpm: 3199 } });
        assert.match(readingNote(read.reading), /had the right form but did not change what was refused/);
        const same = await readMeaning({ capability: "procedure.revise", description: "", schema, sent: nanoRevise as unknown as JsonValue, refused: [], intent: "" }, async () => ({ value: nanoRevise as unknown as JsonValue }));
        assert.ok(!("input" in same), "a reading that says what was sent changes nothing");
        assert.equal(same.outcome.result, "same");
    });
});
