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
import { checkJustifications, factOf, justificationHelp, justificationNote, justificationOf, justificationProblems, justificationsFor, noteSources, numbersOf, safetyProblems, safetyReview, type ReadSources, type SignedFact } from "../harness/core/justify.js";
import { compactOutput, fitted } from "../harness/core/compact.js";
import { CANDIDATE_JUSTIFIED, candidateConstants } from "../harness/topics/graph/index.js";
import { reasoningStateOf } from "../harness/core/reasoning-state.js";
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
        // A graph read: the graph and the documents its variables cite, never the ids of its nodes (2026-09-28: "person-fe-1, scene, solver" were taken for documents read).
        const graph = { library: [] as string[], web: [] as string[] };
        noteSources(graph, ok("library.graph", { id: "habitat" }, { id: "habitat", nodes: [{ id: "person-fe-1" }, { id: "scene" }], template: { spec: { nodes: [{ id: "solver" }] } }, variables: { g: { source: "nasa-crew-metabolic-loads: a crewmember awake" }, Vh: { source: "not documented as built (library station-topology)" }, V: { source: "the commissioning: the volume the scrubber serves" }, eta: { factId: "scrubber.singlePassEfficiency" } } }));
        assert.deepEqual(graph.library, ["habitat", "nasa-crew-metabolic-loads", "station-topology", "scrubber.singlePassEfficiency"]);
    });

    it("a summary over its limit is fitted, its fields and identifiers kept, its prose and then its lists shortened; never the raw answer's first characters (2026-09-28)", () => {
        const long = "a sentence of prose that says a great deal ".repeat(20);
        const summary = { id: "habitat", description: long, types: Array.from({ length: 12 }, (_, i) => `Physics.Habitat:type-${i}`), variables: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`v${i}`, { status: "fitted", description: long }])) };
        const fit = fitted(summary, 2200) as typeof summary;
        assert.ok(JSON.stringify(fit).length <= 2200);
        assert.deepEqual(fit.types, summary.types, "identifiers whole");
        assert.equal(fit.variables.v9.status, "fitted", "the fields kept");
        assert.ok(fit.description.length < long.length);
        assert.equal(fitted({ ids: Array.from({ length: 2000 }, (_, i) => `an-identifier-far-too-long-to-cut-and-still-fit-${i}`) }, 200), null, "nothing fits: the caller falls back to a head");
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

    it("the facts as a model reads them: keyed by id, the safe side, signed or not; a reference that names one fact is that fact (2026-09-28, the first run on the socle)", () => {
        const served = { facts: [
            { id: "test.speedFloorPercent", value: 30, unit: "percent", bound: "lower", semantic: "TestScrubberSpeedFloor", source: "commissioning-test-safety", signed: { by: "a person", at: "", scope: "safety", valid: true } },
            { id: "scrubber.minimumSpeedElevated", value: 40, unit: "percent", semantic: "X", source: "scrubber-1-datasheet", signed: null },
        ] };
        const summary = compactOutput("library.facts", {}, served as never).summary as { facts: Record<string, string> };
        assert.deepEqual(summary.facts, { "test.speedFloorPercent": "at least 30 percent; in commissioning-test-safety, signed", "scrubber.minimumSpeedElevated": "40 percent; in scrubber-1-datasheet, not signed" });
        const facts = served.facts as unknown as SignedFact[];
        assert.equal(factOf(facts, "test.speedFloorPercent")?.id, "test.speedFloorPercent");
        assert.equal(factOf(facts, "test.speedFloorPercent = 30 percent [TestScrubberSpeedFloor, commissioning-test-safety]")?.id, "test.speedFloorPercent", "the line as it was once shown");
        assert.equal(factOf(facts, "testXspeedFloorPercent"), undefined, "a dot is a dot");
        assert.equal(factOf(facts, "test.speedFloorPercent or scrubber.minimumSpeedElevated"), undefined, "two facts named: none chosen");
        // An unsigned fact leads to a signed one first, task.fail only when there is none.
        const unsigned = safetyProblems([{ constant: "steps.1.speedPercent", value: 40 }], [{ constant: "steps.1.speedPercent", value: 40, source: "library", reference: "scrubber.minimumSpeedElevated", reason: "r" }], facts).join();
        assert.match(unsigned, /cite instead a fact of a signed document that bounds this constant.*only if no signed document has one, end with task\.fail/);
    });

    it("a justification may name a constant by the end of its path when that is unambiguous; otherwise the refusal says the path to write (2026-09-28: \"V\" for fit.V, refused nine times)", () => {
        const read: ReadSources = { library: ["habitat"], web: [] };
        const why = (constant: string, value: number | [number, number]) => ({ constant, value, source: "library", reference: "habitat", reason: "the reference graph" });
        const constants = [{ constant: "fit.V", value: [10, 200] as [number, number] }, { constant: "variables.g", value: 0.4 }];
        assert.deepEqual(justificationProblems(constants, [why("V", [10, 200]), why("g", 0.4)], read, { measured: false }), [], "the end of the path, alone");
        const two = [{ constant: "fit.V", value: 10 }, { constant: "variables.V", value: 10 }];
        assert.match(justificationProblems(two, [why("V", 10)], read, { measured: false }).join(), /fit\.V = 10 has no justification \(a justification names it by its path, constant "fit\.V"\)/);
        assert.equal(justificationOf([{ constant: "it.V" }], "fit.V"), undefined, "a dot boundary, not any suffix");
    });

    it("a refusal for justifications is put in the context: the constants without one by path and value, the names that are no constant, a skeleton in the state, and a brief that changes at each repetition (2026-09-28)", () => {
        const input = { label: "c", fit: { V: { min: 10, max: 200 } }, variables: { g: 0.4 }, justifications: [{ constant: "volume", value: [10, 200], source: "assumed", reference: "x", reason: "y" }, { constant: "g", value: 0.4, source: "assumed", reference: "x", reason: "y" }] } as unknown as JsonValue;
        const help = justificationHelp(CANDIDATE_JUSTIFIED, input);
        assert.deepEqual(help, { missing: [{ constant: "fit.V", value: [10, 200] }], unmatched: ["volume"] });
        const first = justificationNote({ capability: "graph.evaluate", times: 1, ...help });
        assert.match(first, /^Your last graph\.evaluate was refused for its justifications\. 1 constant\(s\) you set have none under their path: fit\.V = \[10, 200\]\. Your justifications named volume, which is no constant you set/);
        assert.doesNotMatch(first, /refusal number/);
        assert.match(justificationNote({ capability: "graph.evaluate", times: 3, ...help }), /This is refusal number 3 for the same reason/);
        assert.equal(justificationNote(null), "");
        const progress = newProgress();
        progress.justify = { capability: "graph.evaluate", times: 2, ...help };
        const state = reasoningStateOf({ task: { objective: { required_outputs: [], constraints: {} }, observations: {}, data: [] } as never, progress, budget: { iterations: 10, minutes: 5 }, nextActions: [], shelf: [], telemetry: null });
        assert.deepEqual(state.justify, { refused: "graph.evaluate", times: 2, namesThatAreNoConstant: ["volume"], skeleton: [{ constant: "fit.V", value: [10, 200], source: "", reference: "", reason: "" }] });
    });

    it("a safety constant justified by a fact of another unit: refused, and the next prompt says its unit and the fact the signed rules bound it by, the skeleton filled (2026-09-28: a speed in percent justified nineteen times by a flow in m3/min)", () => {
        const signed = { by: "reviewer", at: "2026-09-28", valid: true };
        const facts: SignedFact[] = [
            { id: "test.speedFloorPercent", semantic: "S", quantity: "Ratio", unit: "percent", value: 30, bound: "lower", source: "commissioning-test-safety", signed },
            { id: "scrubber.effectiveFlowAtFull", semantic: "Q", quantity: "VolumetricFlow", unit: "m3/min", value: 1, source: "scrubber-1-datasheet", signed },
        ];
        const constants = [{ constant: "steps.2.speedPercent", value: 100 }];
        const boundBy = (c: string) => (c.endsWith(".speedPercent") ? ["test.speedFloorPercent"] : []);
        const review = safetyReview(constants, [{ constant: "steps.2.speedPercent", value: 100, source: "library", reference: "scrubber.effectiveFlowAtFull", reason: "full flow" }], facts, boundBy);
        assert.equal(review.problems.length, 1);
        assert.deepEqual(review.misjustified, [{ constant: "steps.2.speedPercent", value: 100, unit: "percent", expected: [{ id: "test.speedFloorPercent", value: 30, unit: "percent", side: "at or above it" }], cited: { id: "scrubber.effectiveFlowAtFull", value: 1, unit: "m3/min" } }]);
        // The fact the rules name, cited: accepted.
        assert.deepEqual(safetyReview(constants, [{ constant: "steps.2.speedPercent", value: 100, source: "library", reference: "test.speedFloorPercent", reason: "above the floor" }], facts, boundBy), { problems: [], misjustified: [] });
        // One fact named among other words: accepted, as before (the contract said, not tightened).
        assert.deepEqual(safetyReview(constants, [{ constant: "steps.2.speedPercent", value: 100, source: "library", reference: "test.speedFloorPercent (commissioning-test-safety, signed)", reason: "above the floor" }], facts, boundBy).problems, []);
        // Two facts in one reference: refused as before, and said by what it is (2026-09-29, the baseline).
        const two = safetyReview(constants, [{ constant: "steps.2.speedPercent", value: 100, source: "library", reference: "test.speedFloorPercent; scrubber.effectiveFlowAtFull 1 m3/min", reason: "full flow" }], facts, boundBy);
        assert.equal(two.problems.length, 1);
        assert.match(two.problems[0], /names 2 facts of the library \(test\.speedFloorPercent, scrubber\.effectiveFlowAtFull\), not one \(INVALID_REFERENCE_CARDINALITY\): a reference is exactly one signed library fact, by its id; the facts that support it and the engineering rationale go in reason/);
        assert.doesNotMatch(two.problems[0], /is not a fact of the library/);
        // The next prompt: the unit, the fact to cite, the wrong one named as another quantity.
        const help = { capability: "procedure.revise", times: 2, missing: [], unmatched: [], misjustified: review.misjustified };
        assert.match(justificationNote(help), /steps\.2\.speedPercent = 100 is in percent: cite test\.speedFloorPercent \(30 percent, at or above it\), not scrubber\.effectiveFlowAtFull \(1 m3\/min: another unit, another quantity\)/);
        assert.match(justificationNote(help), /This is refusal number 2/);
        const progress = newProgress();
        progress.justify = help;
        const state = reasoningStateOf({ task: { objective: { required_outputs: [], constraints: {} }, observations: {}, data: [] } as never, progress, budget: { iterations: 10, minutes: 5 }, nextActions: [], shelf: [], telemetry: null });
        assert.deepEqual((state.justify as { skeleton: unknown[] }).skeleton, [{ constant: "steps.2.speedPercent", value: 100, unit: "percent", source: "library", reference: "test.speedFloorPercent", reason: "" }]);
    });
});

