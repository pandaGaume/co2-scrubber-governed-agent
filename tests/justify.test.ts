/**
 * Every number a factory sets is accounted for, the same way in every factory (`harness/core/justify.ts`, 2026-09-28; since
 * 2026-10-10 by whoever holds what justifies it): what a call read is noted, the constants of a graph candidate and of a fit spec
 * are found by path, the numbers the model chose are justified by it (a source this task can cite, never the value, read at the
 * path), and the safety constants are judged and justified by the harness against the facts of signed documents.
 *
 *     node --test dist/tests/justify.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { JsonValue } from "@spiky-panda/harness";
import { checkJustifications, helpForRefusal, justificationHelp, librarySourceOf, justificationNote, justificationOf, justificationProblems, justificationsFor, noteSources, numbersOf, recordedJustifications, safetyJustifications, safetyProblems, type Justified, type ReadSources, type SignedFact } from "../harness/core/justify.js";
import { compactOutput, fitted } from "../harness/core/compact.js";
import { CANDIDATE_JUSTIFIED, candidateConstants } from "../harness/topics/graph/index.js";
import { reasoningStateOf } from "../harness/core/reasoning-state.js";
import { ONNX_TOPIC } from "../harness/topics/onnx/index.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import type { Broker } from "../harness/lib/broker.js";
import { createBuilderGuard } from "../harness/core/builder-guard.js";
import { GRAPH_TOPIC } from "../harness/topics/graph/index.js";

const ok = (id: string, input: JsonValue, output: JsonValue) => ({ id, input, result: { ok: true, outcome: "completed" as const, output } }) as never;
const signed = { by: "reviewer", at: "2026-09-28", valid: true };
const FLOOR = { id: "test.speedFloorPercent", semantic: "S", quantity: "Ratio", unit: "percent", value: 30, bound: "lower", source: "commissioning-test-safety", signed } as unknown as SignedFact;
const FLOW = { id: "scrubber.effectiveFlowAtFull", semantic: "Q", quantity: "VolumetricFlow", unit: "m3/min", value: 1, source: "scrubber-1-datasheet", signed } as unknown as SignedFact;
const boundBy = (c: string) => (c.endsWith(".speedPercent") ? ["test.speedFloorPercent"] : []);

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

    it("a number the model chose: unjustified, a source not read, no measurement; never its value, which a justification no longer repeats (2026-10-10)", () => {
        const read: ReadSources = { library: ["habitat"], web: [] };
        const constants = [{ constant: "variables.g", value: 0.42 }, { constant: "fit.V", value: [10, 100] as [number, number] }];
        assert.match(justificationProblems(constants, [], read, { measured: false }).join("; "), /variables\.g = 0\.42 has no justification.*fit\.V = \[10, 100\] has no justification/);
        const given = [
            { constant: "variables.g", source: "library", reference: "habitat", reason: "the reference graph" },
            { constant: "fit.V", source: "assumed", reference: "no volume in the register", reason: "wide bounds" },
        ];
        assert.deepEqual(justificationProblems(constants, given, read, { measured: false }), []);
        assert.match(justificationProblems(constants, [{ ...given[0], reference: "unread" }, given[1]], read, { measured: false }).join("; "), /"unread" is not a library document or fact read in this task/);
        // A value written in a justification, as before 2026-10-10, is not read: the value is the one at the path.
        assert.deepEqual(justificationProblems(constants, [given[0], { ...given[1], value: [10, 90] }], read, { measured: false }), []);
        assert.match(justificationProblems([{ constant: "settings.n", value: 2 }], [{ constant: "settings.n", source: "measured", reference: "x", reason: "y" }], read, { measured: false }).join(), /the task gives no measurement to cite/);
    });

    it("a safety constant: judged by the harness against the facts the signed rules bound it by, whatever a justification says; one nothing signed bounds is left out (2026-10-10)", () => {
        assert.deepEqual(safetyProblems([{ constant: "steps.2.speedPercent", value: 100 }], [FLOOR, FLOW], boundBy), [], "above the signed floor");
        assert.match(safetyProblems([{ constant: "steps.1.speedPercent", value: 20 }], [FLOOR], boundBy).join(), /^steps\.1\.speedPercent = 20 does not respect test\.speedFloorPercent = 30 percent, a fact of a signed document: set it at or above it$/);
        assert.match(safetyProblems([{ constant: "abort.co2.threshold", value: 3200 }], [FLOOR], boundBy).join(), /^abort\.co2\.threshold = 3200 is a safety constant no signed fact bounds: leave out the field threshold alone: abort.co2 stays, without it/);
        // The fact that bounds it in a document nobody signed: task.fail naming it, only a person signs.
        const unsigned = { ...FLOOR, source: "scrubber-1-datasheet", signed: null } as unknown as SignedFact;
        assert.match(safetyProblems([{ constant: "steps.1.speedPercent", value: 40 }], [unsigned], boundBy).join(), /the fact test\.speedFloorPercent is in "scrubber-1-datasheet", which no person has signed as valid: a safety constant is bounded by a signed document only; if none bounds it, end with task\.fail/);
    });

    it("the justifications an accepted artifact records: the model's for the numbers it chose with their values, the harness's for the safety constants; a model's for a safety constant is not read", () => {
        assert.deepEqual(safetyJustifications([{ constant: "steps.2.speedPercent", value: 100 }], [FLOOR], boundBy), [{ constant: "steps.2.speedPercent", value: 100, source: "library", reference: "test.speedFloorPercent", reason: "at or above it: test.speedFloorPercent = 30 percent, signed by reviewer", by: "harness" }]);
        const justified = { capability: /^procedure\.submit$/, constants: () => [{ constant: "steps.2.minutes", value: 12 }, { constant: "steps.2.speedPercent", value: 100 }], safety: /speedPercent$/, boundBy };
        const input = { justifications: [{ constant: "steps.2.minutes", source: "assumed", reference: "one time constant", reason: "the decay" }, { constant: "steps.2.speedPercent", source: "library", reference: "scrubber.effectiveFlowAtFull", reason: "full flow" }] } as unknown as JsonValue;
        assert.deepEqual(recordedJustifications(justified, input, [FLOOR, FLOW]), [
            { constant: "steps.2.minutes", value: 12, source: "assumed", reference: "one time constant", reason: "the decay", by: "model" },
            { constant: "steps.2.speedPercent", value: 100, source: "library", reference: "test.speedFloorPercent", reason: "at or above it: test.speedFloorPercent = 30 percent, signed by reviewer", by: "harness" },
        ]);
        // What is left to justify after a refusal: the numbers the model chose, never a safety one.
        assert.deepEqual(justificationHelp(justified, { justifications: [] } as unknown as JsonValue), { missing: [{ constant: "steps.2.minutes", value: 12 }], unmatched: [] });
    });

    it("a library reference names a source read by its id, or by its id and a path inside it (2026-10-10, run 8: habitat.variables.V)", () => {
        const read = ["habitat", "station-topology", "nasa-crew-metabolic-loads", "scrubber.flowAtFull"];
        assert.equal(librarySourceOf("habitat", read), "habitat");
        assert.equal(librarySourceOf("habitat.variables.V", read), "habitat");
        assert.equal(librarySourceOf("station-topology#volumes", read), "station-topology");
        assert.equal(librarySourceOf("scrubber.flowAtFull", read), "scrubber.flowAtFull");
        // The tool's name before it is not part of the reference (run 26).
        assert.equal(librarySourceOf("library.graph.habitat.variables.V", read), "habitat");
        assert.equal(librarySourceOf("library.graphs.habitat.variables.V.bounds", read), "habitat");
        // A name that only begins like one read is not it, nor a source never read.
        assert.equal(librarySourceOf("habitat-b", read), null);
        assert.equal(librarySourceOf("co2-scrubbers.flow", read), null);
        const problems = justificationProblems([{ constant: "fit.V", value: 35 }], [{ constant: "fit.V", source: "library", reference: "habitat.variables.V", reason: "the graph's volume" }], { library: read, web: [] }, { measured: false });
        assert.deepEqual(problems, []);
    });

    it("after a refusal, what is left to justify is what the guard refused as unjustified, never a constant the topic's declaration cannot tell is a safety one (2026-10-10, run 6)", () => {
        // The topic's declaration without the signed rules: every number looks like the model's.
        const declared: Justified = { capability: /^p\.submit$/, constants: () => [{ constant: "limits.co2AbortPpm", value: 3000 }, { constant: "steps.1.minutes", value: 30 }, { constant: "abort.co2.threshold", value: 3000 }] };
        const sent = { limits: { co2AbortPpm: 3000 }, steps: { "1": { minutes: 30 } }, abort: { co2: { threshold: 3000 } }, justifications: [] } as unknown as JsonValue;
        // Refused on the unbounded threshold alone: nothing to justify, so nothing said about justifying.
        assert.equal(helpForRefusal(declared, sent, [{ says: "justification: abort.co2.threshold = 3000 is a safety constant no signed fact bounds: leave out the field threshold alone: abort.co2 stays, without it", path: "abort.co2.threshold" }]), null);
        // Refused on a duration without justification: that one, not the safety limit beside it.
        const help = helpForRefusal(declared, sent, [{ says: "justification: steps.1.minutes = 30 has no justification (a justification names it by its path)", path: "steps.1.minutes" }]);
        assert.deepEqual(help?.missing.map((c) => c.constant), ["steps.1.minutes"]);
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
        assert.match(problems.join(), /limit = 1 is a safety constant no signed fact bounds: leave out the field limit/);
        // A constant no rule of the script names is said assumed, and said to have no stated source; no value.
        assert.deepEqual(justificationsFor([{ constant: "z", value: 1 }], []), [{ constant: "z", source: "assumed", reference: "no rule of the script", reason: "set by the script without a stated source" }]);
    });

    it("the constructor's guard refuses a candidate whose numbers are not justified, before it runs", async () => {
        const broker = { call: async () => ({ ok: true, outcome: "completed", output: {} }) } as unknown as Broker;
        const progress = newProgress();
        const guard = createBuilderGuard({ broker, task: { objective: { required_outputs: [], constraints: {} }, observations: {}, data: [] } as never, topic: GRAPH_TOPIC, taskId: "t-justify", progress } as never);
        const decision = (input: JsonValue) => ({ action: { id: "graph.evaluate", description: "" }, invocation: { actionId: "graph.evaluate", capabilityId: "graph.evaluate", input }, rationale: "" }) as never;
        const refused = await guard.validate(decision({ label: "c", graph: "habitat", variables: { g: 0.42 } }), {} as never);
        assert.equal(refused.allowed, false);
        assert.match(String(refused.reason), /^justification: variables\.g = 0\.42 has no justification/);
        const allowed = await guard.validate(decision({ label: "c", graph: "habitat", variables: { g: 0.42 }, justifications: [{ constant: "variables.g", source: "assumed", reference: "a rate", reason: "the operators' rate" }] }), {} as never);
        assert.equal(allowed.allowed, true, String(allowed.reason));
    });

    it("the facts as a model reads them: keyed by id, the safe side, signed or not (2026-09-28, the first run on the socle)", () => {
        const served = { facts: [
            { id: "test.speedFloorPercent", value: 30, unit: "percent", bound: "lower", semantic: "TestScrubberSpeedFloor", source: "commissioning-test-safety", signed: { by: "a person", at: "", scope: "safety", valid: true } },
            { id: "scrubber.minimumSpeedElevated", value: 40, unit: "percent", semantic: "X", source: "scrubber-1-datasheet", signed: null },
        ] };
        const summary = compactOutput("library.facts", {}, served as never).summary as { facts: Record<string, string> };
        assert.deepEqual(summary.facts, { "test.speedFloorPercent": "at least 30 percent; in commissioning-test-safety, signed", "scrubber.minimumSpeedElevated": "40 percent; in scrubber-1-datasheet, not signed" });
    });

    it("a justification may name a constant by the end of its path when that is unambiguous; otherwise the refusal says the path to write (2026-09-28: \"V\" for fit.V, refused nine times)", () => {
        const read: ReadSources = { library: ["habitat"], web: [] };
        const why = (constant: string) => ({ constant, source: "library", reference: "habitat", reason: "the reference graph" });
        const constants = [{ constant: "fit.V", value: [10, 200] as [number, number] }, { constant: "variables.g", value: 0.4 }];
        assert.deepEqual(justificationProblems(constants, [why("V"), why("g")], read, { measured: false }), [], "the end of the path, alone");
        const two = [{ constant: "fit.V", value: 10 }, { constant: "variables.V", value: 10 }];
        assert.match(justificationProblems(two, [why("V")], read, { measured: false }).join(), /fit\.V = 10 has no justification \(a justification names it by its path, constant "fit\.V"\)/);
        assert.equal(justificationOf([{ constant: "it.V" }], "fit.V"), undefined, "a dot boundary, not any suffix");
    });

    it("a refusal for justifications is put in the context: the numbers without one by path and value, the names that are no constant, a skeleton in the state without values, and a brief that changes at each repetition (2026-09-28)", () => {
        const input = { label: "c", fit: { V: { min: 10, max: 200 } }, variables: { g: 0.4 }, justifications: [{ constant: "volume", source: "assumed", reference: "x", reason: "y" }, { constant: "g", source: "assumed", reference: "x", reason: "y" }] } as unknown as JsonValue;
        const help = justificationHelp(CANDIDATE_JUSTIFIED, input);
        assert.deepEqual(help, { missing: [{ constant: "fit.V", value: [10, 200] }], unmatched: ["volume"] });
        const first = justificationNote({ capability: "graph.evaluate", times: 1, ...help });
        assert.match(first, /^Your last graph\.evaluate was refused for its justifications\. 1 number\(s\) you chose have none under their path: fit\.V = \[10, 200\]\. Your justifications named volume, which is no number you chose/);
        assert.doesNotMatch(first, /refusal number/);
        assert.match(justificationNote({ capability: "graph.evaluate", times: 3, ...help }), /This is refusal number 3 for the same reason/);
        assert.equal(justificationNote(null), "");
        const progress = newProgress();
        progress.justify = { capability: "graph.evaluate", times: 2, ...help };
        const state = reasoningStateOf({ task: { objective: { required_outputs: [], constraints: {} }, observations: {}, data: [] } as never, progress, budget: { iterations: 10, minutes: 5 }, nextActions: [], shelf: [], telemetry: null });
        assert.deepEqual(state.justify, { refused: "graph.evaluate", times: 2, namesThatAreNoConstant: ["volume"], skeleton: [{ constant: "fit.V", source: "", reference: "", reason: "" }] });
    });
});
