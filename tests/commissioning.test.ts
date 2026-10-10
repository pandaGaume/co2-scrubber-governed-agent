/**
 * The commissioning's deterministic core (docs/mise-en-service.fr.md,
 * sections 5, 8 and 15 to 17), without a model and without a key:
 *
 *   the guard of a procedure, alone: the stop-the-scrubber protocol refused
 *   as a plan, the diligence rule (the occupancy read in the task), the
 *   monitoring floor (an occupied volume monitors every occupant and reads
 *   their verdict), the bounds, the duration, the aborts, the predictions;
 *   the register's written rule, the inventory, the decay fit;
 *
 *   then the chain through the broker, with the scripted builder the
 *   factory uses only when asked by name: the five devices register, Mother
 *   opens one commissioning and says so; the factory reads the inventory;
 *   the builder's first procedure stops the scrubber and is refused before
 *   any command, the correction at 30 % is accepted and relayed to the
 *   commander with the occupants Mother read; the run cannot begin
 *   unauthorised; the commander authorises and the monitoring opens; the
 *   agent executes, one command at a time, and the report gives the served
 *   volume from the decay; a second commissioning, whose builder forgot to
 *   read who was there, is refused for it, corrected, authorised, and
 *   aborted when a third person walks into the volume under test.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { McpGrammar } from "@cyanmycelium/mcp-core";
import { fromRoot } from "../lib/paths.js";
import type { TaskFile } from "../harness/core/task.js";
import type { JsonValue } from "@spiky-panda/harness";
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import { runTask, type BuilderContext } from "../harness/core/runner.js";
import { ScriptedProcedureBuilder, type ScriptedProcedureOptions } from "../stand-ins/builders/procedure.js";
import { checkProcedure, envelopeOf, FORMAT, safetyProblems, type MeasuredStart, type PresenceRead, type SignedFact } from "../harness/topics/procedure/check.js";
import { factsBounding, type RulesDocument } from "../harness/core/rules.js";
import { loadFacts, loadRules, LIBRARY_DIR } from "../slots/tools/library/provider.js";
import type { Procedure } from "../lib/procedure/format.js";
import { decayVolume } from "../lib/procedure/report.js";
import { commandsOf, descriptorProblems, needsCommissioning, type Device } from "../slots/station/registry.js";
import { inventoryOf, type Inventory } from "../slots/factory/inventory.js";
import type { Commissioning, MotherLine } from "../slots/station/provider.js";
import { taskDir } from "../slots/tools/lib/workshop.js";
import { standingOrder } from "../slots/station/questions.js";
import { runProcedure } from "../tier3/procedure.js";
import { loadLibrary, searchLibrary } from "../slots/tools/library/provider.js";
import { briefOf, constantsOf, draftOf, justificationProblems, PROCEDURE_TOPIC, requirementsOf, reviseDraft, stateOfTopic } from "../harness/topics/procedure/index.js";
import { newProgress } from "../harness/core/workspace-observer.js";

const PORT = 3121;

const SCENE = JSON.parse(readFileSync(fromRoot("specs", "commissioning-devices.json"), "utf8")) as { devices: Array<{ path: string; descriptor: Device["descriptor"] }> };
const deviceOf = (d: (typeof SCENE.devices)[number]): Device => ({ ...d, registeredAt: "", simulator: null, readings: {} });

/** The procedure of section 15, two steps, as the corrected one. */
const PROCEDURE: Procedure = {
    version: 1,
    id: "decay-test-01",
    method: "concentration-decay",
    volume: "/habitat/lab",
    device: "/habitat/lab/eclss/scrubber-1",
    quantities: [{ name: "V_lab", quantity: "Volume", unit: "m3" }],
    limits: { co2MaxPpm: 2800, co2AbortPpm: 3200, minSpeedPercent: 30, maxMinutes: 24 },
    occupancy: { module: "lab", occupants: 2 },
    monitoring: { subjects: ["fe-1", "fe-2"] },
    steps: [
        { n: 1, hatch: "closed", speedPercent: 30, minutes: 12 },
        { n: 2, hatch: "closed", speedPercent: 100, minutes: 12 },
    ],
    abort: [
        { id: "co2", source: "scrubber.motor.state", when: "CO2 at or above co2AbortPpm" },
        { id: "refused", source: "scrubber.motor.set_speed", when: "a step refused" },
        { id: "vitals", source: "biomed.verdict", when: "an occupant out of band" },
    ],
    expected: { step2: "the CO2 decays" },
};
const LAB_OCCUPIED: PresenceRead = { at: "now", modules: [{ module: "lab", occupants: 2, subjects: [{ id: "fe-1", callsign: "FE-1" }, { id: "fe-2", callsign: "FE-2" }] }] };
const LAB_EMPTY: PresenceRead = { at: "now", modules: [{ module: "lab", occupants: 0, subjects: [] }] };
/** The safety card's facts and rules as the library serves them, signed: what the guard judges by. */
const CARD = loadFacts(LIBRARY_DIR, FORMAT.rulesDocument);
const FACTS: SignedFact[] = CARD.map((f) => ({ ...f, source: FORMAT.rulesDocument, signed: { by: "reviewer", at: "2026-09-28", valid: true } }));
const RULES: RulesDocument = { document: FORMAT.rulesDocument, ...loadRules(LIBRARY_DIR, FORMAT.rulesDocument)!, signed: { by: "reviewer", at: "2026-09-28", valid: true } } as RulesDocument;
const check = (p: unknown, presence: PresenceRead | null, measured: MeasuredStart | null = null) => checkProcedure(p, presence, RULES, FACTS, measured);
const kinds = (p: unknown, presence: PresenceRead | null) => [...new Set(check(p, presence).problems.map((x) => x.kind))].sort();

describe("the procedure's guard, alone", () => {
    it("the limits leave room above the CO2 measured at the start, and every constant is justified by what the task read", () => {
        // The ninth page run: a maximum of 1200 ppm and an abort at 1500 on a Lab measured at 1480 stopped the test at its first minute.
        const low = { ...PROCEDURE, limits: { ...PROCEDURE.limits, co2MaxPpm: 1200, co2AbortPpm: 1500 } };
        const start = check(low, LAB_OCCUPIED, { co2Ppm: 1480, source: "/habitat/lab/eclss/co2-1" });
        assert.ok(start.problems.some((x) => x.kind === "start"), JSON.stringify(start.problems));
        assert.deepEqual(check(PROCEDURE, LAB_OCCUPIED, { co2Ppm: 1480 }).problems, [], "2800 and 3200 leave room above 1480");
        // The constants, by path.
        assert.deepEqual(constantsOf(PROCEDURE).map((c) => c.constant), ["limits.co2MaxPpm", "limits.co2AbortPpm", "limits.minSpeedPercent", "limits.maxMinutes", "steps.1.speedPercent", "steps.1.minutes", "steps.2.speedPercent", "steps.2.minutes"]);
        const read = { library: ["method-concentration-decay"], web: ["https://ntrs.nasa.gov/citations/20150021467"] };
        assert.match(justificationProblems(PROCEDURE, read, null, RULES).join("; "), /steps\.1\.minutes = 12 has no justification/);
        assert.ok(!justificationProblems(PROCEDURE, read, null, RULES).some((x) => /limits\./.test(x)), "the safety constants are the signed rules', not these sources'");
        const justified = {
            ...PROCEDURE,
            justifications: [
                { constant: "limits.co2MaxPpm", value: 2800, source: "derived" as const, reference: "co2AbortPpm - 400", reason: "a margin under the abort" },
                { constant: "limits.co2AbortPpm", value: 3200, source: "envelope" as const, reference: "co2AbortCeilingPpm", reason: "the guard's ceiling" },
                { constant: "limits.minSpeedPercent", value: 30, source: "envelope" as const, reference: "speedFloorPercent", reason: "the floor" },
                { constant: "limits.maxMinutes", value: 24, source: "derived" as const, reference: "12 + 12", reason: "the two steps" },
                { constant: "steps.1.speedPercent", value: 30, source: "envelope" as const, reference: "speedFloorPercent", reason: "the lowest speed allowed" },
                { constant: "steps.1.minutes", value: 12, source: "library" as const, reference: "method-concentration-decay", reason: "the card's rise" },
                { constant: "steps.2.speedPercent", value: 100, source: "web" as const, reference: "https://ntrs.nasa.gov/citations/20150021467", reason: "decay at full flow" },
                { constant: "steps.2.minutes", value: 12, source: "assumed" as const, reference: "", reason: "long enough for one time constant" },
            ],
        };
        assert.deepEqual(justificationProblems(justified, read, null, RULES), []);
        const unread = justificationProblems(justified, { library: [], web: [] }, null, RULES).join("; ");
        assert.match(unread, /steps\.1\.minutes: "method-concentration-decay" is not a library document or fact read in this task/);
        // A value written in a justification, as before 2026-10-10, is not read: the value is the one at the path.
        const wrong = { ...justified, justifications: justified.justifications.map((j) => (j.constant === "steps.2.minutes" ? { ...j, value: 15 } : j)) };
        assert.deepEqual(justificationProblems(wrong, read, null, RULES), []);
    });

    it("a safety constant is judged by its value against the facts of signed documents the rules bound it by, whatever a justification says; the card's rules cite only its own facts (2026-10-10)", () => {
        const card = CARD;
        // Every fact a rule cites is a fact of the card: the envelope is the card's, nothing in the code.
        const cited = RULES.rules.flatMap((r) => ("compare" in r ? [r.compare.fact, r.compare.plusFact] : [])).filter((x): x is string => typeof x === "string");
        assert.ok(cited.length > 0);
        assert.deepEqual(Object.keys(envelopeOf(RULES, FACTS)).sort(), [...new Set(cited)].sort(), "every fact the rules cite is on the card");
        assert.ok(card.every((f) => f.kind === "context" && f.reference && f.bound), "each limit is a context fact with its origin and its safe side");
        const signed = (valid: boolean): SignedFact[] => card.map((f) => ({ ...f, source: "commissioning-test-safety", signed: { by: "reviewer", at: "2026-09-28", valid } }));
        // Within its signed bounds, with no justification at all: nothing to say.
        assert.deepEqual(safetyProblems(PROCEDURE, signed(true), RULES), []);
        // The facts the signed rules bound each constant by, through another constant too (a maximum under an abort under a ceiling).
        assert.deepEqual(factsBounding(RULES, "steps.2.speedPercent"), ["test.speedFloorPercent"]);
        assert.deepEqual(factsBounding(RULES, "limits.co2MaxPpm"), ["test.co2AbortCeilingPpm"]);
        assert.deepEqual(factsBounding(RULES, "limits.maxMinutes"), ["test.maxMinutesCeiling"]);
        // What a model writes for a safety constant is not read: a speed "justified" by the scrubber's flow is still judged by the floor alone.
        const byFlow = { ...PROCEDURE, justifications: [{ constant: "steps.2.speedPercent", source: "library" as const, reference: "scrubber.effectiveFlowAtFull", reason: "full flow" }] };
        assert.deepEqual(safetyProblems(byFlow, signed(true), RULES), []);
        // Unsigned, or changed since it was signed: refused, with how to sign.
        const unsigned = card.map((f) => ({ ...f, source: "commissioning-test-safety", signed: null }));
        assert.match(safetyProblems(PROCEDURE, unsigned, RULES).join("; "), /which no person has signed as valid: a safety constant is bounded by a signed document only; if none bounds it, end with task\.fail.*npm run library:sign/);
        assert.match(safetyProblems(PROCEDURE, signed(false), RULES).join("; "), /was signed by reviewer and has changed since/);
        // A value beyond its fact: refused with the side to keep.
        const over = { ...PROCEDURE, limits: { ...PROCEDURE.limits, co2AbortPpm: 3400 } };
        assert.match(safetyProblems(over, signed(true), RULES).join("; "), /limits\.co2AbortPpm = 3400 does not respect test\.co2AbortCeilingPpm = 3200 ppm, a fact of a signed document: set it at or below it/);
        // A safety field no signed fact bounds (a threshold on the CO2 abort, run trv7): left out.
        const threshold = { ...PROCEDURE, abort: (PROCEDURE.abort ?? []).map((x) => (x.id === "co2" ? { ...x, threshold: 3200 } : x)) };
        assert.match(safetyProblems(threshold, signed(true), RULES).join("; "), /abort\.co2\.threshold = 3200 is a safety constant no signed fact bounds: leave it out/);
    });

    it("a refused procedure stays kept whole for a few minutes: a revision sends only what changes, is applied to it and checked whole; the draft is erased once a procedure is accepted, and expires (2026-09-28)", async () => {
        const card = loadFacts(LIBRARY_DIR, "commissioning-test-safety").map((f) => ({ ...f, source: "commissioning-test-safety", signed: { by: "reviewer", at: "2026-09-28", valid: true } }));
        const calls: string[] = [];
        const broker = {
            call: async (slot: string, tool: string) => {
                calls.push(`${slot}.${tool}`);
                if (tool === "facts") return { ok: true, outcome: "completed", output: { facts: card } };
                if (tool === "rules") return { ok: true, outcome: "completed", output: RULES };
                if (tool === "write") return { ok: true, outcome: "completed", output: { sha256: "a".repeat(64) } };
                return { ok: true, outcome: "completed", output: {} };
            },
        } as unknown as Broker;
        const progress = newProgress();
        progress.reads["biomed.presence"] = { at: "now", value: { modules: LAB_OCCUPIED.modules } as unknown as JsonValue };
        progress.sources.library.push("method-concentration-decay");
        const context = { broker, taskId: "t-revise", task: { objective: { required_outputs: [], constraints: {} }, observations: {}, data: [] } as unknown as TaskFile["task"], progress, runtimeSlot: "twin" };
        const cite = (constant: string, value: number, reference: string) => ({ constant, value, source: "library" as const, reference, reason: "the card" });
        const justifications = [
            cite("limits.co2MaxPpm", 2800, "test.co2AbortCeilingPpm"),
            cite("limits.co2AbortPpm", 3200, "test.co2AbortCeilingPpm"),
            cite("limits.minSpeedPercent", 30, "test.speedFloorPercent"),
            cite("limits.maxMinutes", 24, "test.maxMinutesCeiling"),
            cite("steps.1.speedPercent", 30, "test.speedFloorPercent"),
            cite("steps.2.speedPercent", 100, "test.speedFloorPercent"),
            { constant: "steps.1.minutes", value: 12, source: "library" as const, reference: "method-concentration-decay", reason: "the card's rise" },
            { constant: "steps.2.minutes", value: 12, source: "derived" as const, reference: "maxMinutes - 12", reason: "the rest" },
        ];
        const { monitoring: _unwatched, ...withoutWatch } = PROCEDURE;
        const guard = (id: string, input: unknown) => PROCEDURE_TOPIC.guard!(id, input as JsonValue, context);
        // A revision before any procedure was checked: nothing is kept.
        assert.match((await guard("procedure.revise", { update: {} })).join(), /no procedure is kept to revise.*submit the whole procedure with procedure\.submit/);
        // The whole procedure, refused for the watch it does not ask: kept whole.
        assert.match((await guard("procedure.submit", { ...withoutWatch, justifications })).join(), /monitoring/);
        assert.equal(draftOf(progress)?.id, "decay-test-01");
        assert.equal(draftOf(progress)?.monitoring, undefined);
        // A revision carrying only the watch, and one justification changed: applied to the draft, checked whole, allowed.
        const revision = { update: { monitoring: { subjects: ["fe-1", "fe-2"] } }, justifications: [{ constant: "steps.2.minutes", value: 12, source: "assumed", reference: "one time constant", reason: "long enough" }] };
        assert.deepEqual(await guard("procedure.revise", revision), []);
        assert.equal(draftOf(progress)?.monitoring, undefined, "an accepted decision changes nothing the observation reads: the draft stays as refused until the revision executes");
        const draft = reviseDraft(draftOf(progress)!, revision.update, revision.justifications);
        assert.deepEqual(draft.monitoring, { subjects: ["fe-1", "fe-2"] });
        assert.deepEqual(draft.limits, PROCEDURE.limits, "what the revision does not name stays");
        assert.equal(draft.justifications?.length, 8, "the justifications merge by constant");
        assert.equal(draft.justifications?.find((j) => j.constant === "steps.2.minutes")?.source, "assumed");
        // A nested object merges key by key: one limit changed, the others kept.
        assert.deepEqual(reviseDraft(draft, { limits: { co2MaxPpm: 2600 } }, []).limits, { ...PROCEDURE.limits, co2MaxPpm: 2600 });
        const [submit, revise] = PROCEDURE_TOPIC.local!(context);
        assert.equal(submit.id, "procedure.submit");
        // Accepted: the same whole written, and the draft erased.
        const written = await revise.execute(revision as unknown as JsonValue, {} as never);
        assert.equal(written.ok, true, JSON.stringify(written));
        assert.equal(draftOf(progress), null, "the draft is erased once the procedure is accepted");
        // Accepted: a revision or a submission after it is told the task ends with it, not that nothing was checked (2026-09-28).
        assert.match((await guard("procedure.revise", revision)).join(), /^the procedure is already accepted \(procedures\/decay-test-01\.json\): nothing more to revise or submit; end with task\.done/);
        assert.match((await guard("procedure.submit", { ...PROCEDURE, justifications })).join(), /already accepted/);
        assert.ok(calls.includes("workspace.write"));
        // A whole procedure the schema refused, before the topic could check it, is a draft too.
        const schemaRefused = newProgress();
        schemaRefused.refusals["procedure.submit"] = { reason: "Invalid capability arguments: data/abort/1/threshold must be number", input: { ...PROCEDURE, id: "decay-test-03" } as unknown as JsonValue, at: new Date().toISOString() };
        assert.equal(draftOf(schemaRefused)?.id, "decay-test-03");
        // Expired, in another task: a refused procedure is kept for a few minutes, not longer.
        const later = newProgress();
        later.reads = progress.reads;
        later.sources = progress.sources;
        const laterContext = { ...context, progress: later };
        await PROCEDURE_TOPIC.guard!("procedure.submit", { ...withoutWatch, id: "decay-test-02", justifications } as unknown as JsonValue, laterContext);
        assert.ok(draftOf(later));
        assert.equal(draftOf(later, Date.now() + 6 * 60000), null, "kept five minutes by default");
        assert.match((await PROCEDURE_TOPIC.guard!("procedure.revise", revision as unknown as JsonValue, laterContext)).join(), /kept longer than 5 minutes/);
    });

    it("the corrected procedure of section 15 passes, on an occupied Lab", () => {
        const c = check(PROCEDURE, LAB_OCCUPIED);
        assert.deepEqual(c.problems, []);
        assert.equal(c.module, "lab");
        assert.deepEqual(c.occupants.map((o) => o.id), ["fe-1", "fe-2"]);
        // Rules nobody signed, or changed since, judge nothing: every proposal refused, with how to sign; rules that cannot be read too.
        for (const signed of [null, { by: "reviewer", at: "2026-09-28", valid: false }]) {
            const unsigned = checkProcedure(PROCEDURE, LAB_OCCUPIED, { ...RULES, signed }, FACTS);
            assert.deepEqual(unsigned.problems.map((p) => p.kind), ["rules"]);
            assert.match(unsigned.problems[0].message, /the guard's rules are in "commissioning-test-safety", which no person has signed as valid/);
        }
        assert.deepEqual(checkProcedure(PROCEDURE, LAB_OCCUPIED, null, FACTS).problems.map((p) => p.kind), ["rules"]);
    });

    it("the first protocol, which stops the scrubber for the rise, is refused as a plan: floor, step 1", () => {
        const stop = { ...PROCEDURE, limits: { ...PROCEDURE.limits, minSpeedPercent: 0 }, steps: [{ ...PROCEDURE.steps[0], speedPercent: 0 }, PROCEDURE.steps[1]] };
        const c = check(stop, LAB_OCCUPIED);
        assert.equal(c.ok, false);
        assert.ok(c.problems.every((p) => p.kind === "floor"), JSON.stringify(c.problems));
        assert.ok(c.problems.some((p) => p.step === 1 && /stops the scrubber/.test(p.message)));
        // Below the floor without stopping is refused too, and the procedure cannot lower the floor for itself.
        assert.deepEqual(kinds({ ...PROCEDURE, steps: [{ ...PROCEDURE.steps[0], speedPercent: 20 }, PROCEDURE.steps[1]] }, LAB_OCCUPIED), ["floor"]);
        assert.deepEqual(kinds({ ...PROCEDURE, limits: { ...PROCEDURE.limits, minSpeedPercent: 10 } }, LAB_OCCUPIED), ["floor"]);
        // A procedure may raise its own floor, and is then held to it.
        assert.deepEqual(kinds({ ...PROCEDURE, limits: { ...PROCEDURE.limits, minSpeedPercent: 50 } }, LAB_OCCUPIED), ["floor"]);
    });

    it("diligence: no procedure on a volume whose occupancy was not read in the task; an empty volume read owes no monitoring", () => {
        assert.deepEqual(kinds(PROCEDURE, null), ["diligence"]);
        const { monitoring: _m, occupancy: _o, ...unmonitored } = PROCEDURE;
        const noVitals = { ...unmonitored, abort: PROCEDURE.abort.filter((a) => a.id !== "vitals") };
        assert.deepEqual(kinds(noVitals, LAB_EMPTY), [], "read, found empty: nothing more is owed");
        assert.deepEqual(kinds(noVitals, null), ["diligence"], "not read: refused whatever the volume holds");
    });

    it("the monitoring floor: an occupied volume monitors every occupant read, and an abort condition reads their verdict", () => {
        const { monitoring: _m, ...unmonitored } = PROCEDURE;
        assert.deepEqual(kinds(unmonitored, LAB_OCCUPIED), ["monitoring"]);
        assert.deepEqual(kinds({ ...PROCEDURE, monitoring: { subjects: ["fe-1"] } }, LAB_OCCUPIED), ["monitoring"], "FE-2 would not be monitored");
        assert.deepEqual(kinds({ ...PROCEDURE, abort: PROCEDURE.abort.filter((a) => a.id !== "vitals") }, LAB_OCCUPIED), ["monitoring"]);
        // Judged on what was read, not on what the procedure declares.
        assert.deepEqual(kinds({ ...unmonitored, occupancy: { module: "lab", occupants: 0 } }, LAB_OCCUPIED), ["monitoring"]);
    });

    it("a person under a critical health alarm is exposed by no test: the signed rules' watch reads the flag the presence carries (2026-09-29)", () => {
        const flagged: PresenceRead = { at: "now", modules: [{ module: "lab", occupants: 2, subjects: [{ id: "fe-1", callsign: "FE-1", alarm: { what: "chest pain" } }, { id: "fe-2", callsign: "FE-2", alarm: null }] }] };
        const c = check(PROCEDURE, flagged);
        assert.deepEqual([...new Set(c.problems.map((p) => p.kind))], ["health"]);
        assert.match(c.problems[0].message, /^lab holds FE-1 under alarm: no test exposes a person under a critical health alarm/);
        assert.deepEqual(kinds(PROCEDURE, LAB_OCCUPIED), [], "the alarm cleared, the same procedure passes");
    });

    it("after an aborted test, the analysis first, tied to what stopped it, its changes fields of the procedure; then a procedure that makes them (2026-09-29: recovery after an abort)", async () => {
        const card = loadFacts(LIBRARY_DIR, "commissioning-test-safety").map((f) => ({ ...f, source: "commissioning-test-safety", signed: { by: "reviewer", at: "2026-09-28", valid: true } }));
        const written: string[] = [];
        const broker = {
            call: async (_slot: string, tool: string, args: { path?: string }) => {
                if (tool === "facts") return { ok: true, outcome: "completed", output: { facts: card } };
                if (tool === "rules") return { ok: true, outcome: "completed", output: RULES };
                if (tool === "write") {
                    written.push(String(args.path));
                    return { ok: true, outcome: "completed", output: { sha256: "a".repeat(64) } };
                }
                return { ok: true, outcome: "completed", output: {} };
            },
        } as unknown as Broker;
        const progress = newProgress();
        progress.reads["biomed.presence"] = { at: "now", value: { modules: LAB_OCCUPIED.modules } as unknown as JsonValue };
        progress.sources.library.push("method-concentration-decay");
        const previous = { procedureId: "decay-test-01", procedure: PROCEDURE, aborted: { condition: "vitals", reason: "FE-1: critical health alarm: chest pain", step: 1 }, minutesRun: 3 };
        const task = { objective: { required_outputs: [], constraints: {} }, observations: { previous }, data: [] } as unknown as TaskFile["task"];
        const context = { broker, taskId: "t-recover", task, progress, runtimeSlot: "twin" };
        const guard = (id: string, input: unknown) => PROCEDURE_TOPIC.guard!(id, input as JsonValue, context);
        const cite = (constant: string, value: number, reference: string) => ({ constant, value, source: "library" as const, reference, reason: "the card" });
        const justifications = [
            cite("limits.co2MaxPpm", 2800, "test.co2AbortCeilingPpm"),
            cite("limits.co2AbortPpm", 3200, "test.co2AbortCeilingPpm"),
            cite("limits.minSpeedPercent", 30, "test.speedFloorPercent"),
            cite("limits.maxMinutes", 24, "test.maxMinutesCeiling"),
            cite("steps.1.speedPercent", 30, "test.speedFloorPercent"),
            cite("steps.2.speedPercent", 100, "test.speedFloorPercent"),
            { constant: "steps.1.minutes", value: 12, source: "library" as const, reference: "method-concentration-decay", reason: "the card's rise" },
            { constant: "steps.2.minutes", value: 12, source: "assumed" as const, reference: "one time constant", reason: "long enough" },
        ];
        assert.equal(requirementsOf(progress, task).analysisAccepted, false, "a task that follows an aborted test requires its analysis");
        // No procedure before the analysis.
        assert.match((await guard("procedure.submit", { ...PROCEDURE, justifications })).join(), /^the last test of this commissioning was aborted \(vitals: FE-1: critical health alarm: chest pain\): analyse why with procedure\.analyse/);
        // An analysis that does not say what stopped the test, or names no field of the procedure, is refused.
        const change = { path: "monitoring.band.maxBpm", change: "120 becomes 110 bpm", prevents: "a climbing rate stops the test sooner" };
        assert.match((await guard("procedure.analyse", { cause: "the scrubber was slow", evidence: ["the log"], whyNotPrevented: "x", changes: [change] })).join(), /the cause does not say what stopped the test/);
        assert.match((await guard("procedure.analyse", { cause: "FE-1's critical alarm (chest pain) during step 1", evidence: ["vitals abort at minute 3"], whyNotPrevented: "x", changes: [{ ...change, path: "nowhere.at.all" }] })).join(), /change 1: "nowhere\.at\.all" is not a field of the procedure/);
        const analysis = { cause: "FE-1's critical alarm (chest pain) during step 1", evidence: ["vitals abort at minute 3"], whyNotPrevented: "the band watched was the card's widest", changes: [change] };
        assert.deepEqual(await guard("procedure.analyse", analysis), []);
        const [, , analyse] = PROCEDURE_TOPIC.local!(context);
        assert.equal(analyse.id, "procedure.analyse");
        assert.equal((await analyse.execute(analysis as unknown as JsonValue, {} as never)).ok, true);
        assert.ok(written.includes("analysis.json"), "the analysis is kept in the workshop, where the station reads it");
        assert.equal(requirementsOf(progress, task).analysisAccepted, true);
        // The same procedure again: the change the analysis names is not in it.
        assert.match((await guard("procedure.submit", { ...PROCEDURE, justifications })).join(), /analysis: the analysis says monitoring\.band\.maxBpm changes \(120 becomes 110 bpm\), and the new procedure keeps it as it was/);
        // The procedure that makes it: accepted.
        const tighter = { ...PROCEDURE, id: "decay-test-02", monitoring: { subjects: ["fe-1", "fe-2"], band: { minBpm: 45, maxBpm: 110 } }, justifications: [...justifications, cite("monitoring.band.minBpm", 45, "test.heartRateMinBpm"), cite("monitoring.band.maxBpm", 110, "test.heartRateMaxBpm")] };
        assert.deepEqual(await guard("procedure.submit", tighter), []);
    });

    it("the bounds, the duration, the aborts and the predictions", () => {
        assert.deepEqual(kinds({ ...PROCEDURE, limits: { ...PROCEDURE.limits, co2AbortPpm: 3600 } }, LAB_OCCUPIED), ["bounds"]);
        assert.deepEqual(kinds({ ...PROCEDURE, limits: { ...PROCEDURE.limits, co2MaxPpm: 3200 } }, LAB_OCCUPIED), ["bounds"]);
        assert.deepEqual(kinds({ ...PROCEDURE, limits: { ...PROCEDURE.limits, maxMinutes: 20 } }, LAB_OCCUPIED), ["duration"]);
        assert.deepEqual(kinds({ ...PROCEDURE, limits: { ...PROCEDURE.limits, maxMinutes: 90 } }, LAB_OCCUPIED), ["duration"]);
        assert.deepEqual(kinds({ ...PROCEDURE, steps: [{ ...PROCEDURE.steps[0], minutes: 0 }, PROCEDURE.steps[1]] }, LAB_OCCUPIED), ["duration"]);
        assert.deepEqual(kinds({ ...PROCEDURE, abort: PROCEDURE.abort.filter((a) => a.id !== "co2") }, LAB_OCCUPIED), ["abort"]);
        assert.deepEqual(kinds({ ...PROCEDURE, expected: {} }, LAB_OCCUPIED), ["expected"]);
        // An abort condition the executor cannot read would trip at the first minute: refused as a plan, with what it can read.
        const unreadable = check({ ...PROCEDURE, abort: [...PROCEDURE.abort, { id: "time-exceeded", source: "clock", when: "too long" }] }, LAB_OCCUPIED);
        assert.deepEqual(unreadable.problems.map((p) => p.kind), ["abort"]);
        assert.match(unreadable.problems[0].message, /cannot be read by the executor, which reads co2, refused, battery, vitals/);
        assert.deepEqual(kinds({ ...PROCEDURE, volume: "lab" }, LAB_OCCUPIED), ["shape"]);
    });
});

describe("the register, the inventory, the decay", () => {
    it("the written rule: a device that acts and has no qualified simulator is commissioned; a sensor is not", () => {
        const [scrubber, co2] = SCENE.devices.map(deviceOf);
        assert.equal(needsCommissioning(scrubber), true);
        assert.equal(needsCommissioning(co2), false);
        assert.equal(needsCommissioning({ ...scrubber, simulator: { sha256: "a".repeat(64), reportId: "b".repeat(64) } }), false);
    });

    it("the register says what can be acted upon: a commandable property names the action that sets it and its range; a hatch is operated, a sensor only published", () => {
        const [scrubber, co2, hatch] = SCENE.devices.map(deviceOf);
        assert.deepEqual(commandsOf(scrubber), [{ property: "speed", action: "set_speed", quantity: "Ratio", unit: "percent", min: 0, max: 100 }]);
        assert.deepEqual(commandsOf(co2), []);
        assert.deepEqual(commandsOf(hatch), []);
        // The register keeps itself consistent: a command through an action the device does not declare, a read-only command, a range upside down.
        const d = scrubber.descriptor;
        const withSpeed = (speed: Record<string, unknown>) => ({ ...d, properties: { ...d.properties, speed } });
        assert.deepEqual(descriptorProblems(scrubber.path, d), []);
        assert.deepEqual(descriptorProblems(scrubber.path, withSpeed({ quantity: "Ratio", unit: "percent", commandable: { action: "set_rpm" } })), ['property "speed" is commandable through "set_rpm", which is not among the actions the device declares (set_speed, power, set_min_flow)']);
        assert.deepEqual(descriptorProblems(scrubber.path, withSpeed({ quantity: "Ratio", unit: "percent", readOnly: true, commandable: { action: "set_speed" } })), ['property "speed" is commandable and read-only at once']);
        assert.deepEqual(descriptorProblems(scrubber.path, withSpeed({ quantity: "Ratio", unit: "percent", commandable: { action: "set_speed", min: 100, max: 0 } })), ['property "speed" is commandable in a range whose min 100 is above its max 0']);
        assert.deepEqual(descriptorProblems(scrubber.path, withSpeed({ quantity: "Ratio", unit: "percent", commandable: {} })), ['property "speed" is commandable but names no action that sets it']);
        // The inventory turns it into the interventions the installation allows: one command, one opening a person operates.
        const inv = inventoryOf(SCENE.devices.map(deviceOf));
        assert.deepEqual(inv.interventions, [
            { device: "/habitat/lab/eclss/scrubber-1", property: "speed", quantity: "Ratio", unit: "percent", how: "commanded", action: "set_speed", min: 0, max: 100 },
            { device: "/habitat/lab/hatch-1", property: "state", quantity: "State", unit: "open|closed", how: "operated", states: ["open", "closed"] },
        ]);
    });

    it("the inventory of the five lines: two volumes, one opening, the served volume to measure and the exchange a hypothesis", () => {
        const inv = inventoryOf(SCENE.devices.map(deviceOf));
        assert.equal(inv.lines.length, 5);
        assert.ok(inv.lines[0].startsWith("/habitat/hab-b/eclss/co2-2"), inv.lines[0]);
        assert.deepEqual(inv.volumes.map((v) => v.path), ["/habitat/hab-b", "/habitat/lab"]);
        assert.deepEqual(inv.openings, [{ device: "/habitat/lab/hatch-1", between: ["lab", "hab-b"] }]);
        assert.deepEqual(inv.devices.filter((d) => d.commissioning).map((d) => d.path), ["/habitat/lab/eclss/scrubber-1"]);
        assert.deepEqual(inv.unknowns.map((u) => [u.what, u.how]), [["served volume of lab", "measured"], ["exchange between lab and hab-b through /habitat/lab/hatch-1", "hypothesis"]]);
        assert.deepEqual(inv.devices.find((d) => d.type === "Co2Sensor")?.measures, [{ property: "co2", quantity: "Concentration", unit: "ppm" }]);
    });

    it("the decay fit gives the volume back: tau 18.4 min at 3.3 m3/min is 61 m3", () => {
        const samples = Array.from({ length: 13 }, (_, m) => ({ minute: m, ppm: 800 + 1940 * Math.exp(-m / 18.4) }));
        const fit = decayVolume(samples, 3.3);
        assert.ok(fit);
        assert.ok(Math.abs(fit.volumeM3 - 60.72) < 0.5, String(fit.volumeM3));
        assert.ok(Math.abs(fit.equilibriumPpm - 800) <= 2, String(fit.equilibriumPpm));
        assert.equal(decayVolume(samples.slice(0, 3), 3.3), null, "three samples are not a decay");
        assert.equal(decayVolume(samples.map((s) => ({ ...s, ppm: 1200 })), 3.3), null, "a flat line is not a decay");
    });

    it("the library finds the method from the quantity that is missing, and the harness briefs the builder stage by stage", () => {
        const docs = loadLibrary();
        assert.deepEqual(docs.filter((d) => d.measures.includes("Volume")).map((d) => d.id), ["method-concentration-decay", "nasa-scrubber-test-protocols"]);
        assert.ok(docs.every((d) => /^[0-9a-f]{64}$/.test(d.sha256) && d.title && d.summary));
        assert.equal(searchLibrary(docs, "time constant equilibrium")[0]?.id, "co2-mass-balance");
        const task = { objective: { required_outputs: [{ name: "V_lab", quantity: "Volume", unit: "m3" }], constraints: {} }, observations: {} } as unknown as Parameters<typeof briefOf>[1];
        const progress = newProgress();
        assert.match(briefOf(progress, task), /^Stage 1 of 6, the situation.*biomed\.presence/);
        progress.reads["factory.inventory"] = { at: "t", value: { unknowns: [{ what: "served volume of lab", quantity: "Volume", unit: "m3", how: "measured" }] } };
        assert.match(briefOf(progress, task), /^Stage 2 of 6, the method.*The quantity to measure: Volume\. Find the methods that measure them \(library\.methods\)/);
        // A card is one the library listed for the quantity (library.methods): a document's name says nothing of it.
        progress.reads["library.methods"] = { at: "t", value: { methods: [{ id: "method-concentration-decay" }] } };
        progress.reads["library.read"] = { at: "t", value: { id: "method-concentration-decay" } };
        assert.match(briefOf(progress, task), /^Stage 3 of 6, the plan/);
        progress.phase = "build";
        assert.match(briefOf(progress, task), /^Stage 5 of 6, the procedure\. Write it by the rules of application of method-concentration-decay/);
        // The brief names the tools, never what a good procedure concludes from them.
        assert.doesNotMatch(briefOf(newProgress(), task) + briefOf(progress, task), /monitor the|monitoring of|30 ?%|never stop/i);
    });

    it("the procedure topic's reasoning state: the installation, the presence, the method card whole, the requirements of the stages (2026-09-25)", () => {
        const task = { objective: { required_outputs: [{ name: "V_lab", quantity: "Volume", unit: "m3" }], constraints: {} }, observations: {} } as unknown as Parameters<typeof briefOf>[1];
        const progress = newProgress();
        let s = stateOfTopic(progress, task);
        assert.deepEqual(s.requirements, { installationRead: false, presenceRead: false, methodRead: false, signedNorm: false, planDeclared: false, procedureAccepted: false });
        assert.equal((s.hypothesis as { installation: unknown }).installation, null);
        assert.ok(s.openQuestions!.some((q) => /factory\.inventory/.test(q)) && s.openQuestions!.some((q) => /library\.methods/.test(q)));
        progress.reads["factory.inventory"] = {
            at: "t",
            value: {
                volumes: [{ name: "lab", path: "/habitat/lab", sensors: ["/habitat/lab/co2-1"], devices: ["/habitat/lab/co2-1", "/habitat/lab/eclss/scrubber-1"] }],
                openings: [{ device: "/habitat/lab/hatch-1", between: ["lab", "hab-b"] }],
                unknowns: [{ what: "served volume of lab", quantity: "Volume", unit: "m3", volume: "/habitat/lab", how: "measured" }],
                devices: [{ path: "/habitat/lab/eclss/scrubber-1", type: "Scrubber", title: "Scrubber 1", area: "lab", measures: [{ property: "speed", quantity: "Ratio", unit: "percent" }], acts: ["set_speed"], commissioning: true }],
            },
        };
        progress.reads["library.methods"] = { at: "t", value: { methods: [{ id: "method-concentration-decay" }] } };
        progress.reads["library.read"] = { at: "t", value: { id: "method-concentration-decay", text: "# Concentration decay\n\nRules of application: the hatch closed, the rise below the limit." } };
        progress.reads["biomed.presence"] = { at: "t", value: { modules: [{ module: "lab", occupants: 2, subjects: [{ id: "fe-1" }, { id: "fe-2" }] }] } };
        s = stateOfTopic(progress, task);
        assert.deepEqual(s.requirements, { installationRead: true, presenceRead: true, methodRead: true, signedNorm: false, planDeclared: false, procedureAccepted: false });
        const h = s.hypothesis as { installation: { unknowns: Array<{ what: string }>; underCommissioning: Array<{ path: string; measures: unknown[] }> }; presence: Array<{ module: string }>; method: { id: string; card: string } };
        assert.equal(h.installation.underCommissioning[0].path, "/habitat/lab/eclss/scrubber-1");
        assert.deepEqual(h.installation.underCommissioning[0].measures, [{ property: "speed", quantity: "Ratio", unit: "percent" }], "as the inventory gives it: the spec's view keeps fields, it rewrites nothing");
        assert.equal(h.presence[0].module, "lab");
        assert.match(h.method.card, /Rules of application/);
        assert.deepEqual(s.openQuestions, [], "everything read: what is unknown is the installation's own field (unknowns)");
        assert.equal(h.installation.unknowns[0].what, "served volume of lab");
        // A refused submission stays whole in the evaluation until one is accepted, whatever the model reads in between (the schema's refusals included).
        progress.refusals["procedure.submit"] = { reason: "Invalid capability arguments: data/abort/1/threshold must be number", input: { id: "decay-1", abort: [{ id: "co2", threshold: null }] }, at: "t" };
        const e = stateOfTopic(progress, task).evaluation as { ok: boolean; problems: string[]; procedure: { id: string } };
        assert.equal(e.ok, false);
        assert.equal(e.procedure.id, "decay-1");
        assert.match(briefOf({ ...progress, phase: "build" }, task), /under evaluation \(field "procedure"; it is not a file/);
        delete progress.refusals["procedure.submit"];
        assert.equal(requirementsOf(progress).methodRead, true);
        // The brief points into the state, and still names no rule of a good procedure.
        progress.phase = "build";
        assert.match(briefOf(progress, task), /field "method".*field "installation".*field "presence".*not files: read nothing the state already gives/);
        assert.doesNotMatch(briefOf(progress, task), /monitor the|monitoring of|30 ?%|never stop/i);
    });

    it("Mother's phrases: the same keys and holes in English and French", () => {
        const words = (locale: string) => McpGrammar.fromJSON(JSON.parse(readFileSync(fromRoot("slots", "station", "grammars", "default", `${locale}.json`), "utf8")));
        const en = words("en").listPhrases().filter((k) => k.startsWith("mother."));
        const fr = words("fr").listPhrases().filter((k) => k.startsWith("mother."));
        assert.ok(en.length >= 40, String(en.length));
        assert.deepEqual([...fr].sort(), [...en].sort());
        assert.equal(words("en").phrase("mother.procedure.refused.floorLimit", { percent: 20 }), "Procedure refused. It sets its own minimum speed at 20 percent. Below the minimum flow.");
        assert.equal(words("fr").phrase("mother.procedure.refused.floor", { step: 1, what: words("fr").phrase("mother.what.stop") }), "Protocole refusé. Pas numéro 1 : arrêt complet de l'épurateur. Sous le débit minimal.");
    });
});

describe("the commissioning, through the broker", () => {
    let local: LocalBroker;
    let slots: PublishedSlot<object>[];
    let operator: Broker;
    let agent: Broker;
    let recipesDir = "";
    const tasks: string[] = [];

    const ok = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}, who: Broker = operator): Promise<T> => {
        const r = await who.call(slot, tool, args);
        assert.ok(r.ok, `${slot}.${tool}: ${r.error}`);
        return r.output as T;
    };
    const mother = async (): Promise<MotherLine[]> => {
        const r = await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://mother" });
        return JSON.parse(r.contents[0].text) as MotherLine[];
    };
    const commissioning = async (id: string) => (await ok<{ commissioning: Commissioning }>("station", "commissioning_state", { commissioningId: id })).commissioning;
    /** The last scripted builder made, to read what it was shown. */
    let lastBuilder: ScriptedProcedureBuilder | null = null;
    const buildProcedure = async (options: Partial<ScriptedProcedureOptions> = {}) => {
        const req = await ok<{ taskId: string; started: boolean }>("factory", "request", {
            objective: { required_outputs: [{ name: "V", quantity: "Volume", unit: "m3" }] },
            observations: { device: options.device ?? "/habitat/lab/eclss/scrubber-1" },
            topics: ["procedure"],
            builder: "scripted",
            requestedBy: "station",
            run: false,
        });
        assert.equal(req.started, false);
        tasks.push(req.taskId);
        return runTask({ broker: operator, taskId: req.taskId, recipesDir, provider: (ctx: BuilderContext) => (lastBuilder = new ScriptedProcedureBuilder({ ...ctx, ...options })) });
    };

    before(async () => {
        process.env.SPEECH_PROVIDER = "silent";
        process.env.BIOMED_PROVIDER = "simulated";
        recipesDir = mkdtempSync(path.join(tmpdir(), "recipes-"));
        ({ broker: local, slots } = await startAllOrFail(PORT));
        operator = new Broker(local.httpBase, { name: "operator-test", version: "0", locale: "en" });
        agent = new Broker(local.httpBase, { name: "agent-test", version: "0", locale: "en" });
    });
    after(async () => {
        delete process.env.SPEECH_PROVIDER;
        delete process.env.BIOMED_PROVIDER;
        await operator?.close();
        await agent?.close();
        for (const s of slots ?? []) await s.close().catch(() => undefined);
        await local?.stop();
        for (const t of tasks) if (existsSync(taskDir(t))) rmSync(taskDir(t), { recursive: true, force: true });
        if (recipesDir) rmSync(recipesDir, { recursive: true, force: true });
    });

    it("the five devices register; Mother opens one commissioning, for the scrubber, and says so in both languages", async () => {
        const opened: Array<string | null> = [];
        for (const d of SCENE.devices) opened.push((await ok<{ commissioning: string | null }>("station", "registry_register", d)).commissioning);
        assert.deepEqual(opened, ["c001-lab", null, null, null, null]);
        const refused = await operator.call("station", "registry_register", SCENE.devices[1]);
        assert.equal(refused.ok, false, "a path already on the register");
        assert.equal((await operator.call("station", "registry_register", { path: "lab/scrubber", descriptor: SCENE.devices[0].descriptor })).ok, false, "not an ISA-95 path");
        await ok("station", "registry_report", { path: "/habitat/power/battery-1", readings: { stateOfCharge: 80 } });
        const said = await mother();
        assert.deepEqual(said.map((l) => l.text.en), ["New device on the register. CO2 scrubber, module lab. I have no record for it.", "Commissioning opened. No qualified simulator for this device."]);
        assert.equal(said[0].text.fr, "Nouvel appareil sur le registre. CO2 scrubber, module lab. Je n'ai pas de fiche pour lui.");
        assert.equal((await commissioning("c001-lab")).status, "open");
    });

    it("the factory reads the inventory from the register, through the broker", async () => {
        const inv = await ok<Inventory>("factory", "inventory");
        assert.equal(inv.lines.length, 5);
        assert.deepEqual(inv.unknowns.map((u) => u.how), ["measured", "hypothesis"]);
    });

    it("the first procedure stops the scrubber and is refused before any command; the correction at 30 % is relayed to the commander with the two operators", async () => {
        const before = await ok<{ speedPercent: number }>("scrubber", "motor.state");
        const result = await buildProcedure();
        assert.equal(result.state, "proposed", result.manifest.ended ?? "");
        const refused = result.manifest.steps.filter((s) => s.source === "refused");
        assert.equal(refused.length, 1);
        assert.equal(refused[0].capability, "procedure.submit");
        assert.match(String(refused[0].reason), /floor: steps\.1\.speedPercent = 0 is not above 0: the step stops the scrubber/);
        assert.deepEqual(result.manifest.steps.filter((s) => s.source !== "refused").map((s) => s.capability), ["factory.inventory", "library.methods", "library.read", "biomed.presence", "task.plan", "procedure.revise", "task.done"], "the correction is a revision of the procedure kept, not the whole again");
        assert.ok(result.manifest.artifacts.some((a) => a.kind === "procedure" && a.path === "procedures/decay-draft-02.json"));
        assert.equal(result.manifest.provider.name, "scripted:procedure", "the manifest names the script");
        // Accepted by its revision, the procedure is handed over: the brief asks for task.done, and no note of a refused submission's justifications is left in it.
        const lastBrief = String((lastBuilder!.exchanges.at(-1)?.request as { state?: { features?: { brief?: unknown } } } | undefined)?.state?.features?.brief ?? "");
        assert.match(lastBrief, /task\.done/);
        assert.doesNotMatch(lastBrief, /refused for its justifications/);
        // The scorecard of question A: the presence was read before the first submission, the monitoring asked unprompted.
        const scorecard = JSON.parse(readFileSync(path.join(taskDir(result.taskId), "scorecard.json"), "utf8")) as { presenceReadBeforeFirstSubmission: boolean; monitoring: string; refusedFor: string[] };
        // The stop breaks the guard's floor and the signed safety card's (test.speedFloorPercent): refused for both.
        assert.deepEqual(scorecard, { presenceReadBeforeFirstSubmission: true, monitoring: "unprompted", submissions: 2, refusedFor: ["floor", "justification"] });
        // Nothing was commanded while the factory worked.
        assert.equal((await ok<{ speedPercent: number }>("scrubber", "motor.state")).speedPercent, before.speedPercent);
        const c = await commissioning("c001-lab");
        assert.equal(c.status, "awaiting-authorisation");
        assert.deepEqual(c.procedure?.occupants.map((o) => o.id), ["fe-1", "fe-2"]);
        assert.deepEqual(c.checks.map((x) => [x.attempt, x.ok, x.kinds]), [[1, false, ["floor", "justification"]], [2, true, []]]);
        assert.deepEqual((await mother()).slice(2).map((l) => l.text.en), [
            "Test procedure proposed. Concentration decay. 2 steps, 24 minutes. 2 operators in module lab.",
            "Procedure refused. Step 1: full stop of the scrubber. Below the minimum flow.",
            "Procedure corrected. 30 percent.",
            "The test will raise the CO2 of the air the 2 operators breathe. Request for authorisation, commander.",
        ]);
    });

    it("the run does not begin before the commander authorises; the authorisation opens the monitoring of both operators", async () => {
        const early = await agent.call("station", "procedure_run", { commissioningId: "c001-lab", action: "begin" });
        assert.equal(early.ok, false);
        assert.match(String(early.error), /only once authorised by the commander/);
        await assert.rejects(runProcedure({ broker: agent, commissioningId: "c001-lab", waitMinute: async () => undefined }), /only an authorised procedure/);
        // The authorisation is a question of the station's own (2026-09-27), answered in Mother's chat: the answer comes back into commissioning_authorise.
        const questions = JSON.parse((await (await operator.session("station")).request<{ contents: Array<{ text: string }> }>("resources/read", { uri: "station://questions" })).contents[0].text) as Array<{ id: string; kind: string; status: string; context: { commissioningId: string }; options: Array<{ id: string }> }>;
        const asked = questions.find((q) => q.kind === "authorise" && q.status === "open" && q.context.commissioningId === "c001-lab");
        assert.ok(asked, "Mother asked the commander");
        assert.deepEqual(asked.options.map((o) => o.id), ["authorise", "refuse"]);
        const answered = await ok<{ status: string; resumed: { status: string; monitoring: { sessionId: string; subjects: string[] } } }>("station", "answer", { questionId: asked.id, choice: "authorise", by: "commander", how: "typed" });
        assert.equal(answered.status, "answered");
        const a = answered.resumed;
        assert.equal(a.status, "authorised");
        assert.deepEqual(a.monitoring.subjects, ["fe-1", "fe-2"]);
        const monitor = await ok<{ session: string | null }>("biomed", "state");
        assert.equal(monitor.session, a.monitoring.sessionId);
        assert.deepEqual((await mother()).slice(-2).map((l) => l.text.en), ["Authorisation received.", "Medical monitoring active. 2 operators."]);
        assert.equal((await operator.call("station", "commissioning_authorise", { commissioningId: "c001-lab", decision: "authorise", by: "commander" })).ok, false, "authorised once");
    });

    it("the agent executes, one command at a time; the report gives the served volume from the decay, the monitoring is closed", async () => {
        const commands: number[] = [];
        const result = await runProcedure({
            broker: agent,
            commissioningId: "c001-lab",
            // The world the scrubber stub does not simulate: the CO2 rises at 30 %, then decays at full speed.
            waitMinute: async (step, minute) => {
                const speed = (await ok<{ speedPercent: number }>("scrubber", "motor.state")).speedPercent;
                if (commands.at(-1) !== speed) commands.push(speed);
                const ppm = step === 1 ? 1480 + 105 * minute : 800 + 1940 * Math.exp(-minute / 18.4);
                await ok("scrubber", "debug.set_co2", { state: "NOMINAL", ppm });
            },
        });
        assert.equal(result.status, "done", JSON.stringify(result.aborted));
        assert.deepEqual(commands, [30, 100]);
        const report = result.report!;
        assert.ok(report.result.value !== null && Math.abs(report.result.value - 18.4) < 0.5, JSON.stringify(report.result));
        assert.deepEqual(report.steps.map((s) => [s.n, s.accepted, s.speedPercent]), [[1, true, 30], [2, true, 100]]);
        assert.equal(report.authorisedBy, "commander");
        assert.equal(report.aborted, null);
        assert.equal((await ok<{ session: string | null }>("biomed", "state")).session, null, "the monitoring closes with the test");
        assert.equal((await commissioning("c001-lab")).status, "done");
        const lines = (await mother()).map((l) => l.text.en);
        assert.ok(lines.includes("Test running. Step 1 of 2.") && lines.includes("Test running. Step 2 of 2."));
        assert.deepEqual(lines.slice(-4), ["Test complete. 24 minutes.", "Apparent volume, module lab taken as one room: 18 cubic metres. The twin will say what the air exchanged with the next module hides in it.", "Vital signs nominal throughout.", "No emergency stop."]);
    });

    it("a builder that did not read who was there is refused for it; the procedure it corrects is authorised, and a third person walking in aborts the test", async () => {
        await ok("station", "registry_register", { path: "/habitat/hab-b/eclss/scrubber-2", descriptor: SCENE.devices[0].descriptor });
        const result = await buildProcedure({ device: "/habitat/hab-b/eclss/scrubber-2", readPresence: false, firstSpeedPercent: 30 });
        assert.equal(result.state, "proposed", result.manifest.ended ?? "");
        const refused = result.manifest.steps.find((s) => s.source === "refused");
        assert.match(String(refused?.reason), /diligence: who is in hab-b was not read in this task/);
        const scorecard = JSON.parse(readFileSync(path.join(taskDir(result.taskId), "scorecard.json"), "utf8")) as { presenceReadBeforeFirstSubmission: boolean };
        assert.equal(scorecard.presenceReadBeforeFirstSubmission, false);
        const c = await commissioning("c002-hab-b");
        assert.equal(c.status, "awaiting-authorisation");
        assert.ok((await mother()).some((l) => l.text.en === "Procedure refused. The occupancy of module hab-b was not read."));
        await ok("station", "commissioning_authorise", { commissioningId: c.id, decision: "authorise", by: "commander" });
        const result2 = await runProcedure({
            broker: agent,
            commissioningId: c.id,
            waitMinute: async (step, minute) => {
                if (step === 1 && minute === 3) await ok("biomed", "move", { subjectId: "fe-1", module: "hab-b" });
            },
        });
        assert.equal(result2.status, "aborted");
        assert.equal(result2.aborted?.condition, "vitals");
        assert.match(String(result2.aborted?.reason), /FE-1 entered hab-b/);
        assert.equal(result2.report?.result.value, null);
        assert.equal((await commissioning(c.id)).status, "aborted");
        assert.equal((await ok<{ session: string | null }>("biomed", "state")).session, null);
        assert.equal((await mother()).at(-1)?.text.en, "Test aborted. Vital signs: abort condition.");
        await ok("biomed", "move", { subjectId: "fe-1", module: "lab" });
    });

    it("after the aborted test, the commissioning reopens; the factory analyses what stopped it, writes a test that changes it, and Mother tells the commander the cause and the change before she asks again (2026-09-29: recovery after an abort)", async () => {
        const aborted = await commissioning("c002-hab-b");
        assert.equal(aborted.status, "aborted");
        const reopened = (await ok<{ commissioning: Commissioning }>("station", "commissioning_reopen", { commissioningId: aborted.id, reason: "the commander asked for another test" })).commissioning;
        assert.equal(reopened.status, "open");
        assert.equal(reopened.attempts?.length, 1);
        assert.equal(reopened.attempts?.[0].aborted?.condition, "vitals");
        assert.ok((await mother()).some((l) => /^Commissioning reopened: the procedure factory writes test 2/.test(l.text.en)));
        const previous = { procedureId: aborted.procedure?.procedureId ?? null, procedure: aborted.procedure?.content ?? null, aborted: { condition: aborted.report?.aborted?.condition ?? null, reason: aborted.report?.aborted?.reason ?? null, step: aborted.report?.aborted?.step ?? null } };
        const req = await ok<{ taskId: string }>("factory", "request", { objective: { required_outputs: [{ name: "V", quantity: "Volume", unit: "m3" }] }, observations: { device: "/habitat/hab-b/eclss/scrubber-2", previous }, topics: ["procedure"], builder: "scripted", requestedBy: "station", run: false });
        tasks.push(req.taskId);
        const result = await runTask({ broker: operator, taskId: req.taskId, recipesDir, provider: (ctx: BuilderContext) => new ScriptedProcedureBuilder({ ...ctx, firstSpeedPercent: 30 }) });
        assert.equal(result.state, "proposed", result.manifest.ended ?? "");
        const done = result.manifest.steps.filter((s) => s.source !== "refused").map((s) => s.capability);
        assert.ok(done.indexOf("procedure.analyse") >= 0 && done.indexOf("procedure.analyse") < done.indexOf("procedure.submit"), `the analysis before the procedure: ${done.join(", ")}`);
        const c = await commissioning("c002-hab-b");
        assert.equal(c.status, "awaiting-authorisation");
        assert.equal(c.procedure?.content.monitoring?.band?.maxBpm, 110, "the change the analysis names is in the test relayed");
        assert.match(String(c.analysis?.cause), /vitals/);
        assert.ok((await mother()).some((l) => /^Why the last test stopped, as the factory analysed it: .*What the new test changes: 120 becomes 110 bpm/.test(l.text.en)));
        // A person decides it, never a standing order.
        assert.deepEqual(standingOrder({ mode: "auto", byKind: {} }, "recover", [{ id: "rewrite", label: "rewrite" }]), { mode: "ask" });
    });

    it("a builder refused on the same point three times in a row, whatever else it changes, ends STUCK at the third refusal, the second prompt saying only what is expected there (2026-09-28: nineteen refusals of one speed)", async () => {
        // The script keeps the stopped scrubber and changes only the purpose at each revision: another input every time, the same point refused.
        class Stubborn extends ScriptedProcedureBuilder {
            private tries = 0;
            protected override next(state: Parameters<ScriptedProcedureBuilder["resolve"]>[0]["state"]) {
                if (/procedure refused:/.test(String(state.features.lastRefusal ?? ""))) {
                    this.tries++;
                    return { action: { id: "procedure.revise", description: "procedure.revise" }, invocation: { actionId: "procedure.revise", capabilityId: "procedure.revise", input: { update: { purpose: `the same test, said again (${this.tries})` } } as JsonValue }, rationale: "insists" };
                }
                return super.next(state);
            }
        }
        const req = await ok<{ taskId: string }>("factory", "request", { objective: { required_outputs: [{ name: "V", quantity: "Volume", unit: "m3" }] }, observations: { device: "/habitat/lab/eclss/scrubber-1" }, topics: ["procedure"], builder: "scripted", requestedBy: "station", run: false });
        tasks.push(req.taskId);
        let builder: Stubborn | null = null;
        const result = await runTask({ broker: operator, taskId: req.taskId, recipesDir, provider: (ctx: BuilderContext) => (builder = new Stubborn({ ...ctx, firstSpeedPercent: 0 })) });
        assert.equal(result.state, "failed");
        const refused = result.manifest.steps.filter((s) => s.source === "refused");
        assert.deepEqual(refused.map((s) => s.capability), ["procedure.submit", "procedure.revise", "procedure.revise"], "the third refusal on the point ends it, not the budget");
        assert.match(String(result.manifest.ended), /^STUCK: procedure\.revise refused 3 times in a row on the same point\(s\), .*steps\.1\.speedPercent/);
        // What the builder read after the second refusal: the points and what is expected there, not the refusal's words again.
        const briefs = builder!.exchanges.map((e) => String((e.request as { state?: { features?: { brief?: unknown } } }).state?.features?.brief ?? ""));
        const second = briefs.find((b) => /^Refused 2 times in a row/.test(b));
        assert.ok(second, briefs.at(-1));
        assert.match(second!, /steps\.1\.speedPercent needs (above 0|at least test\.speedFloorPercent = 30 percent).*One more refusal on these points ends the task/);
    });
});
