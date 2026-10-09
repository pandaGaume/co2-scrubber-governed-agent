/**
 * The marching order and the refusals as corrections (2026-10-09): what the state gives a model before it acts. The order of the work
 * with the current stage's tools and what must hold before handing over, read off the conduct graph; and for each refused point, what
 * depends on it, read off the signed rules, so a correction changes the point and its dependents and nothing else.
 *
 *     node --test dist/tests/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dependentsOf, type RulesDocument } from "../harness/core/rules.js";
import { loadRules, LIBRARY_DIR } from "../slots/tools/library/provider.js";
import { marchingOrderOf } from "../harness/topics/procedure/index.js";
import { newProgress } from "../harness/core/workspace-observer.js";
import type { TaskFile } from "../harness/core/task.js";

const RULES = { document: "commissioning-test-safety", ...loadRules(LIBRARY_DIR, "commissioning-test-safety")! } as unknown as RulesDocument;
const TASK = { objective: { required_outputs: [{ name: "V_lab", quantity: "Volume", unit: "m3" }], constraints: {} }, observations: {}, requirements: {}, data: [] } as unknown as TaskFile["task"];

describe("what a refused point carries: what depends on it", () => {
    it("a limit goes with its justification and with the limit the signed rules compare it with", () => {
        assert.deepEqual(dependentsOf(RULES, "limits.co2MaxPpm").sort(), ["justifications[constant=limits.co2MaxPpm]", "limits.co2AbortPpm"].sort());
        assert.ok(dependentsOf(RULES, "limits.co2AbortPpm").includes("limits.co2MaxPpm"), "and the other way round");
    });

    it("a step's duration goes with the ceiling the sum of the durations is under", () => {
        assert.deepEqual(dependentsOf(RULES, "steps.2.minutes").sort(), ["justifications[constant=steps.2.minutes]", "limits.maxMinutes"].sort());
    });

    it("a justification refused goes with the value it justifies", () => {
        assert.ok(dependentsOf(RULES, "steps.1.minutes", "justification").includes("steps.1.minutes"));
        assert.ok(!dependentsOf(RULES, "steps.1.minutes", "justification").includes("justifications[constant=steps.1.minutes]"));
    });

    it("without rules, a value goes at least with its justification", () => {
        assert.deepEqual(dependentsOf(null, "variables.V"), ["justifications[constant=variables.V]"]);
    });
});

describe("the procedure factory's marching order in the state", () => {
    it("at the start: the situation's tools allowed now, nothing met, the plan closed until the readings", () => {
        const order = marchingOrderOf(newProgress(), TASK) as unknown as { stages: Array<{ stage: string; status: string }>; allowedNow: string[]; closedNow: Array<{ tools: string[]; why: string }>; doneWhen: Array<{ item: string; met: boolean }> };
        assert.equal(order.stages.find((s) => s.status === "current")?.stage, "situation");
        assert.deepEqual(order.allowedNow, ["factory.inventory", "biomed.presence", "biomed.describe"]);
        assert.ok(order.closedNow.some((c) => c.tools.includes("task.plan")), "the plan needs the readings first");
        assert.ok(order.doneWhen.length >= 6 && order.doneWhen.every((d) => d.item && d.met === false));
    });
});
