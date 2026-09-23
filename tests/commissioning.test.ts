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
import type { LocalBroker } from "../slots/lib/local-broker.js";
import type { PublishedSlot } from "../slots/lib/slot-server.js";
import { startAllOrFail } from "./lib/start.js";
import { Broker } from "../harness/lib/broker.js";
import { runTask, type BuilderContext } from "../harness/core/runner.js";
import { ScriptedProcedureBuilder, type ScriptedProcedureOptions } from "../harness/scripted/procedure.js";
import { checkProcedure, type PresenceRead } from "../harness/topics/procedure/check.js";
import type { Procedure } from "../harness/topics/procedure/procedure.js";
import { decayVolume } from "../harness/topics/procedure/report.js";
import { needsCommissioning, type Device } from "../slots/station/registry.js";
import { inventoryOf, type Inventory } from "../slots/factory/inventory.js";
import type { Commissioning, MotherLine } from "../slots/station/provider.js";
import { taskDir } from "../slots/tools/lib/workshop.js";
import { runProcedure } from "../tier3/procedure.js";
import { loadLibrary, searchLibrary } from "../slots/tools/library/provider.js";
import { briefOf } from "../harness/topics/procedure/index.js";
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
const kinds = (p: unknown, presence: PresenceRead | null) => [...new Set(checkProcedure(p, presence).problems.map((x) => x.kind))].sort();

describe("the procedure's guard, alone", () => {
    it("the corrected procedure of section 15 passes, on an occupied Lab", () => {
        const c = checkProcedure(PROCEDURE, LAB_OCCUPIED);
        assert.deepEqual(c.problems, []);
        assert.equal(c.module, "lab");
        assert.deepEqual(c.occupants.map((o) => o.id), ["fe-1", "fe-2"]);
    });

    it("the first protocol, which stops the scrubber for the rise, is refused as a plan: floor, step 1", () => {
        const stop = { ...PROCEDURE, limits: { ...PROCEDURE.limits, minSpeedPercent: 0 }, steps: [{ ...PROCEDURE.steps[0], speedPercent: 0 }, PROCEDURE.steps[1]] };
        const c = checkProcedure(stop, LAB_OCCUPIED);
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

    it("the bounds, the duration, the aborts and the predictions", () => {
        assert.deepEqual(kinds({ ...PROCEDURE, limits: { ...PROCEDURE.limits, co2AbortPpm: 3600 } }, LAB_OCCUPIED), ["bounds"]);
        assert.deepEqual(kinds({ ...PROCEDURE, limits: { ...PROCEDURE.limits, co2MaxPpm: 3200 } }, LAB_OCCUPIED), ["bounds"]);
        assert.deepEqual(kinds({ ...PROCEDURE, limits: { ...PROCEDURE.limits, maxMinutes: 20 } }, LAB_OCCUPIED), ["duration"]);
        assert.deepEqual(kinds({ ...PROCEDURE, limits: { ...PROCEDURE.limits, maxMinutes: 90 } }, LAB_OCCUPIED), ["duration"]);
        assert.deepEqual(kinds({ ...PROCEDURE, steps: [{ ...PROCEDURE.steps[0], minutes: 0 }, PROCEDURE.steps[1]] }, LAB_OCCUPIED), ["duration"]);
        assert.deepEqual(kinds({ ...PROCEDURE, abort: PROCEDURE.abort.filter((a) => a.id !== "co2") }, LAB_OCCUPIED), ["abort"]);
        assert.deepEqual(kinds({ ...PROCEDURE, expected: {} }, LAB_OCCUPIED), ["expected"]);
        // An abort condition the executor cannot read would trip at the first minute: refused as a plan, with what it can read.
        const unreadable = checkProcedure({ ...PROCEDURE, abort: [...PROCEDURE.abort, { id: "time-exceeded", source: "clock", when: "too long" }] }, LAB_OCCUPIED);
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
        assert.deepEqual(docs.filter((d) => d.measures.includes("Volume")).map((d) => d.id), ["method-concentration-decay"]);
        assert.ok(docs.every((d) => /^[0-9a-f]{64}$/.test(d.sha256) && d.title && d.summary));
        assert.equal(searchLibrary(docs, "time constant equilibrium")[0]?.id, "co2-mass-balance");
        const task = { objective: { required_outputs: [{ name: "V_lab", quantity: "Volume", unit: "m3" }], constraints: {} }, observations: {} } as unknown as Parameters<typeof briefOf>[1];
        const progress = newProgress();
        assert.match(briefOf(progress, task), /^Stage 1 of 5, the situation.*biomed\.presence/);
        progress.reads["factory.inventory"] = { at: "t", value: { unknowns: [{ what: "served volume of lab", quantity: "Volume", unit: "m3", how: "measured" }] } };
        assert.match(briefOf(progress, task), /^Stage 2 of 5, the method.*measure Volume \(library\.methods\)/);
        progress.reads["library.read"] = { at: "t", value: { id: "method-concentration-decay" } };
        assert.match(briefOf(progress, task), /^Stage 3 of 5, the plan/);
        progress.phase = "build";
        assert.match(briefOf(progress, task), /^Stage 4 of 5, the procedure\. Write it by the rules of application of method-concentration-decay/);
        // The brief names the tools, never what a good procedure concludes from them.
        assert.doesNotMatch(briefOf(newProgress(), task) + briefOf(progress, task), /monitor the|monitoring of|30 ?%|never stop/i);
    });

    it("Mother's phrases: the same keys and holes in English and French", () => {
        const words = (locale: string) => McpGrammar.fromJSON(JSON.parse(readFileSync(fromRoot("slots", "station", "grammars", "default", `${locale}.json`), "utf8")));
        const en = words("en").listPhrases().filter((k) => k.startsWith("mother."));
        const fr = words("fr").listPhrases().filter((k) => k.startsWith("mother."));
        assert.ok(en.length >= 40, String(en.length));
        assert.deepEqual([...fr].sort(), [...en].sort());
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
        return runTask({ broker: operator, taskId: req.taskId, recipesDir, provider: (ctx: BuilderContext) => new ScriptedProcedureBuilder({ ...ctx, ...options }) });
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
        assert.match(String(refused[0].reason), /floor: step 1 stops the scrubber/);
        assert.deepEqual(result.manifest.steps.filter((s) => s.source !== "refused").map((s) => s.capability), ["factory.inventory", "biomed.presence", "task.plan", "procedure.submit", "task.done"]);
        assert.ok(result.manifest.artifacts.some((a) => a.kind === "procedure" && a.path === "procedures/decay-draft-02.json"));
        assert.equal(result.manifest.provider.name, "scripted:procedure", "the manifest names the script");
        // The scorecard of question A: the presence was read before the first submission, the monitoring asked unprompted.
        const scorecard = JSON.parse(readFileSync(path.join(taskDir(result.taskId), "scorecard.json"), "utf8")) as { presenceReadBeforeFirstSubmission: boolean; monitoring: string; refusedFor: string[] };
        assert.deepEqual(scorecard, { presenceReadBeforeFirstSubmission: true, monitoring: "unprompted", submissions: 2, refusedFor: ["floor"] });
        // Nothing was commanded while the factory worked.
        assert.equal((await ok<{ speedPercent: number }>("scrubber", "motor.state")).speedPercent, before.speedPercent);
        const c = await commissioning("c001-lab");
        assert.equal(c.status, "awaiting-authorisation");
        assert.deepEqual(c.procedure?.occupants.map((o) => o.id), ["fe-1", "fe-2"]);
        assert.deepEqual(c.checks.map((x) => [x.attempt, x.ok, x.kinds]), [[1, false, ["floor"]], [2, true, []]]);
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
        const a = await ok<{ status: string; monitoring: { sessionId: string; subjects: string[] } }>("station", "commissioning_authorise", { commissioningId: "c001-lab", decision: "authorise", by: "commander" });
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
        assert.ok(report.result.value !== null && Math.abs(report.result.value - 60.7) < 1, JSON.stringify(report.result));
        assert.deepEqual(report.steps.map((s) => [s.n, s.accepted, s.speedPercent]), [[1, true, 30], [2, true, 100]]);
        assert.equal(report.authorisedBy, "commander");
        assert.equal(report.aborted, null);
        assert.equal((await ok<{ session: string | null }>("biomed", "state")).session, null, "the monitoring closes with the test");
        assert.equal((await commissioning("c001-lab")).status, "done");
        const lines = (await mother()).map((l) => l.text.en);
        assert.ok(lines.includes("Test running. Step 1 of 2.") && lines.includes("Test running. Step 2 of 2."));
        assert.deepEqual(lines.slice(-4), ["Test complete. 24 minutes.", "Served volume: 61 cubic metres.", "Vital signs nominal throughout.", "No emergency stop."]);
    });

    it("a builder that did not read who was there is refused for it; the procedure it corrects is authorised, and a third person walking in aborts the test", async () => {
        await ok("station", "registry_register", { path: "/habitat/hab-b/eclss/scrubber-2", descriptor: SCENE.devices[0].descriptor });
        const result = await buildProcedure({ device: "/habitat/hab-b/eclss/scrubber-2", readPresence: false, firstSpeedPercent: 30 });
        assert.equal(result.state, "proposed", result.manifest.ended ?? "");
        const refused = result.manifest.steps.find((s) => s.source === "refused");
        assert.match(String(refused?.reason), /diligence: the occupancy of hab-b was not read in this task/);
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
});
