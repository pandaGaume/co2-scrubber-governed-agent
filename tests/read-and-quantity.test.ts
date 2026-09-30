/**
 * The two failures left after the contract of a reference was said (2026-09-30), each answered where it came from:
 *   a model looking for a detail of a JSON file was given its keys again and again, and ended stuck: a field is read by pointer;
 *   a speed in percent declared as Speed (a velocity) was refused and dropped: the refusal says what the register declares.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fieldAt } from "../slots/tools/workspace/provider.js";
import { compactOutput } from "../harness/core/compact.js";
import { declaredQuantity } from "../harness/topics/procedure/index.js";
import { newProgress } from "../harness/core/workspace-observer.js";

describe("a detail of a JSON file, read by pointer", () => {
    it("the value at a JSON Pointer, and what the document holds where the pointer goes wrong", () => {
        const doc = { steps: [{ n: 1, reason: "rise" }, { n: 2, reason: "decay" }], "a/b": 3 };
        assert.equal(fieldAt(doc, "/steps/1/reason", "p.json"), "decay");
        assert.equal(fieldAt(doc, "/a~1b", "p.json"), 3);
        assert.throws(() => fieldAt(doc, "/steps/5", "p.json"), /a list of 2 item\(s\), no item 5/);
        assert.throws(() => fieldAt(doc, "/stepz", "p.json"), /has no field "stepz" \(its fields: steps, a\/b\)/);
    });

    it("what the model reads: the field itself when asked by pointer; the keys, with how to read a field, when not", () => {
        const field = compactOutput("workspace.read", { path: "manifest.json", pointer: "/steps/1" }, { path: "manifest.json", pointer: "/steps/1", value: { n: 2, reason: "decay" } });
        assert.deepEqual((field.summary as { value: unknown }).value, { n: 2, reason: "decay" });
        const whole = compactOutput("workspace.read", { path: "manifest.json" }, { path: "manifest.json", text: JSON.stringify({ steps: [], state: "x" }) });
        assert.match(String((whole.summary as { note: string }).note), /read one field with pointer \(a JSON Pointer: \/steps\/0\/reason\)/);
    });
});

describe("a quantity refused: what the register declares for the property it is named after", () => {
    it("read in the installation the task read, by a word of the quantity's name", () => {
        const progress = newProgress();
        progress.reads["factory.inventory"] = { at: "", value: { devices: [{ path: "/habitat/lab/eclss/scrubber-1", measures: [{ property: "speed", quantity: "Ratio", unit: "percent" }, { property: "current", quantity: "Current", unit: "A" }] }] } };
        assert.deepEqual(declaredQuantity(progress, "scrubber_speed_command"), { device: "/habitat/lab/eclss/scrubber-1", property: "speed", quantity: "Ratio", unit: "percent" });
        assert.equal(declaredQuantity(progress, "co2_lab"), null);
    });
});
