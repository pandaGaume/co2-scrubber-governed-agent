/**
 * Every constant a factory sets is justified, the same way in every factory
 * (`harness/core/justify.ts`, 2026-09-28): what a call read is noted, the
 * constants of a graph candidate and of a fit spec are found by path, and
 * the rules judge them (a source this task can cite; a safety constant, a
 * signed fact respected).
 *
 *     node --test dist/tests/justify.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { JsonValue } from "@spiky-panda/harness";
import { checkJustifications, justificationProblems, justificationsFor, noteSources, numbersOf, safetyProblems, type ReadSources, type SignedFact } from "../harness/core/justify.js";
import { candidateConstants } from "../harness/topics/graph/index.js";
import { ONNX_TOPIC } from "../harness/topics/onnx/index.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import type { Broker } from "../harness/lib/broker.js";
import { createBuilderGuard } from "../harness/core/builder-guard.js";
import { GRAPH_TOPIC } from "../harness/topics/graph/index.js";

const ok = (id: string, input: JsonValue, output: JsonValue) => ({ id, input, result: { ok: true, outcome: "completed" as const, output } }) as never;

describe("the justification of constants, common to every factory", () => {
    it("notes what a call read: the library's documents and facts (a graph of the shelf too), the pages a web search returned", () => {
        const read: ReadSources = { library: [], web: [] };
        noteSources(read, ok("library.facts", { id: "commissioning-test-safety" }, { facts: [{ id: "test.speedFloorPercent" }] }));
        noteSources(read, ok("library.graphs", {}, { graphs: [{ id: "habitat" }] }));
        noteSources(read, ok("web.search", { query: "x" }, { results: [{ url: "https://www.nasa.gov/crew-co2" }] }));
        noteSources(read, { id: "library.read", input: { id: "unread" }, result: { ok: false, outcome: "refused" } } as never);
        assert.deepEqual(read, { library: ["commissioning-test-safety", "test.speedFloorPercent", "habitat"], web: ["https://www.nasa.gov/crew-co2"] });
    });

    it("a graph candidate's constants: the variables held, each bound as a range, the settings, the parameters' numbers; not the estimator's knobs", () => {
        const constants = candidateConstants({ label: "c", graph: "habitat", variables: { g: 0.42 }, fit: { V: { min: 10, max: 100 } }, settings: { labOccupants: 2 }, add: { nodes: [{ id: "leak", typeId: "Generated.X:leak", params: { rate: 0, label: "x" } }], connections: [] }, maxRuns: 40, levels: 5 });
        assert.deepEqual(constants, [
            { constant: "variables.g", value: 0.42 },
            { constant: "settings.labOccupants", value: 2 },
            { constant: "fit.V", value: [10, 100] },
            { constant: "add.leak.rate", value: 0 },
        ]);
    });

    it("a fit spec's constants: every number but its version", () => {
        const spec = { version: 1, job: "fit", fullScale: { duty: 100, current: 4 }, domain: { dutyMin: 0.2 }, monitor: { residual: { threshold: 0.04, alarm: "drift" } } };
        assert.deepEqual(ONNX_TOPIC.justified!.constants({ spec } as never).map((c) => c.constant), ["fullScale.duty", "fullScale.current", "domain.dutyMin", "monitor.residual.threshold"]);
        assert.deepEqual(numbersOf({ a: { b: 1, c: "x" } }, "p"), [{ constant: "p.a.b", value: 1 }]);
    });

    it("the rules: unjustified, a value that is not the one sent, a source not read, a range; a safety constant only by a signed fact respected", () => {
        const read: ReadSources = { library: ["habitat"], web: [] };
        const constants = [{ constant: "variables.g", value: 0.42 }, { constant: "fit.V", value: [10, 100] as [number, number] }];
        assert.match(justificationProblems(constants, [], read, { measured: false }).join("; "), /variables\.g = 0\.42 has no justification.*fit\.V = \[10, 100\] has no justification/);
        const given = [
            { constant: "variables.g", value: 0.42, source: "library", reference: "habitat", reason: "the reference graph" },
            { constant: "fit.V", value: [10, 100], source: "assumed", reference: "no volume in the register", reason: "wide bounds" },
        ];
        assert.deepEqual(justificationProblems(constants, given, read, { measured: false }), []);
        assert.match(justificationProblems(constants, [{ ...given[0], reference: "unread" }, { ...given[1], value: [10, 90] }], read, { measured: false }).join("; "), /"unread" is not a library document or fact read in this task.*fit\.V: the justification says \[10, 90\], what you sent sets \[10, 100\]/);
        assert.match(justificationProblems([{ constant: "settings.n", value: 2 }], [{ constant: "settings.n", value: 2, source: "measured", reference: "x", reason: "y" }], read, { measured: false }).join(), /the task gives no measurement to cite/);
        const floor = { id: "test.speedFloorPercent", value: 30, unit: "percent", bound: "lower", source: "card", signed: { by: "a person", at: "", valid: true } } as unknown as SignedFact;
        const speed = [{ constant: "steps.1.speedPercent", value: 20 }];
        assert.match(safetyProblems(speed, [{ constant: "steps.1.speedPercent", value: 20, source: "library", reference: "test.speedFloorPercent", reason: "r" }], [floor]).join(), /does not respect test\.speedFloorPercent = 30 percent \(at or above it\)/);
        assert.match(safetyProblems(speed, [{ constant: "steps.1.speedPercent", value: 20, source: "assumed", reference: "x", reason: "r" }], [floor]).join(), /is a safety constant: it is justified by a fact of a signed library document, not by an assumption/);
    });

    it("the check of a call reads the library's facts only when it sets a safety constant, and the scripts justify as a model must", async () => {
        let asked = 0;
        const broker = { call: async () => { asked++; return { ok: true, outcome: "completed", output: { facts: [] } }; } } as unknown as Broker;
        const progress = newProgress();
        progress.sources.library.push("habitat");
        const input = { label: "c", variables: { g: 0.42 }, justifications: justificationsFor([{ constant: "variables.g", value: 0.42 }], [[/^variables\./, { source: "library", reference: "habitat", reason: "the reference graph" }]]) } as unknown as JsonValue;
        assert.deepEqual(await checkJustifications({ capability: /^graph\.evaluate$/, constants: candidateConstants }, input, { broker, task: { observations: {}, data: [] } as never, progress }), []);
        assert.equal(asked, 0, "no safety constant: the library is not asked");
        const problems = await checkJustifications({ capability: /^x$/, constants: () => [{ constant: "limit", value: 1 }], safety: /^limit$/ }, { justifications: [] } as unknown as JsonValue, { broker, task: { observations: {}, data: [] } as never, progress });
        assert.equal(asked, 1);
        assert.match(problems.join(), /limit = 1 is a safety constant with no justification/);
        // A constant no rule of the script names is said assumed, and said to have no stated source.
        assert.deepEqual(justificationsFor([{ constant: "z", value: 1 }], []), [{ constant: "z", value: 1, source: "assumed", reference: "no rule of the script", reason: "set by the script without a stated source" }]);
    });

    it("the constructor's guard refuses a candidate whose numbers are not justified, before it runs", async () => {
        const broker = { call: async () => ({ ok: true, outcome: "completed", output: {} }) } as unknown as Broker;
        const progress = newProgress();
        const guard = createBuilderGuard({ broker, task: { objective: { required_outputs: [], constraints: {} }, observations: {}, data: [] } as never, topic: GRAPH_TOPIC, taskId: "t-justify", progress } as never);
        const decision = (input: JsonValue) => ({ action: { id: "graph.evaluate", description: "" }, invocation: { actionId: "graph.evaluate", capabilityId: "graph.evaluate", input }, rationale: "" }) as never;
        const refused = await guard.validate(decision({ label: "c", graph: "habitat", variables: { g: 0.42 } }), {} as never);
        assert.equal(refused.allowed, false);
        assert.match(String(refused.reason), /^justification: variables\.g = 0\.42 has no justification/);
        const allowed = await guard.validate(decision({ label: "c", graph: "habitat", variables: { g: 0.42 }, justifications: [{ constant: "variables.g", value: 0.42, source: "assumed", reference: "a rate", reason: "the operators' rate" }] }), {} as never);
        assert.equal(allowed.allowed, true, String(allowed.reason));
    });
});
