/**
 * A report read against what was done (2026-10-11, night 9 on Nemotron Super: "Scrubber speed reduced from 33% to 30%" after a
 * scrubber.check that changes nothing). The reader is a stand-in here; what is tested is what the harness does with its verdict:
 * an unfaithful report is not delivered and goes back with what was not done, the calls read are those of the report's event.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionContext, JsonValue } from "@spiky-panda/harness";
import type { Broker } from "../harness/lib/broker.js";
import type { CapabilityCall } from "../harness/core/capabilities.js";
import { buildCapabilities, type CrewConsoleEntry, type ReportReview, type ReportReviewer } from "../tier3/lib/capabilities.js";

const noBroker = { slots: async () => [], tools: async () => [] } as unknown as Broker;
const call = (id: string, intentionId: string, outcome: "completed" | "refused" = "completed"): CapabilityCall => ({ id, slot: id.split(".")[0], tool: id.split(".").slice(1).join("."), input: {}, result: { ok: outcome === "completed", outcome }, latencyMs: 1, decisionId: "d", intentionId });
const context = (intention: string): ExecutionContext => ({ decisionId: `d-${intention}`, state: { speedPercent: 33 }, intention: { id: intention, description: "" } }) as unknown as ExecutionContext;

async function report(verdict: ReportReview, calls: CapabilityCall[], intention = "energy-request") {
    const crewConsole: CrewConsoleEntry[] = [];
    const seen: CapabilityCall[][] = [];
    const review: ReportReviewer = async (_text, executed) => {
        seen.push(executed);
        return verdict;
    };
    const { registry } = await buildCapabilities(noBroker, { console: crewConsole, calls, review });
    const r = await registry.get("crew.report")!.execute({ message: "Scrubber speed reduced from 33% to 30%." } as JsonValue, context(intention));
    return { r, crewConsole, seen };
}

describe("the report read against what was done", () => {
    it("a report claiming an action not executed is not delivered, and says what was not done", async () => {
        const { r, crewConsole } = await report({ verdict: "unfaithful", claims: [{ claim: "Scrubber speed reduced from 33% to 30%", executed: false, why: "only scrubber.check was called" }], model: "m" }, [call("scrubber.scrubber.check", "energy-request")]);
        assert.equal(r.ok, false);
        assert.match(String(r.error), /report not delivered.*"Scrubber speed reduced from 33% to 30%" \(only scrubber.check was called\)/);
        assert.equal(crewConsole.length, 0);
    });

    it("a faithful report is delivered with its review", async () => {
        const { r, crewConsole } = await report({ verdict: "faithful", claims: [{ claim: "reduced to 30%", executed: true }], model: "m" }, [call("scrubber.motor.set_speed", "energy-request")]);
        assert.equal(r.ok, true);
        assert.equal(crewConsole[0].review?.verdict, "faithful");
    });

    it("a report the reader could not read is delivered, marked not reviewed", async () => {
        const { r, crewConsole } = await report({ verdict: "not reviewed", claims: [], model: null, detail: "no reader" }, []);
        assert.equal(r.ok, true);
        assert.equal(crewConsole[0].review?.verdict, "not reviewed");
    });

    it("the calls read are those of the report's event, without the crew's", async () => {
        const calls = [call("scrubber.motor.set_speed", "energy-request"), call("crew.report", "energy-request"), call("scrubber.motor.set_speed", "load-rises")];
        const { seen } = await report({ verdict: "faithful", claims: [], model: "m" }, calls, "load-rises");
        assert.deepEqual(seen[0].map((c) => `${c.id}@${c.intentionId}`), ["scrubber.motor.set_speed@load-rises"]);
    });
});
