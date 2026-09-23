/**
 * Builds the cabin twin document, `graphs/cabin.spikypanda`, from the two
 * reviewable files: `specs/cabin-parameters.json` (every physical constant)
 * and a scenario (the crew schedule and the starting state; night 9 by
 * default). No value is typed here: the nodes take their settings from the
 * parameter file through their editable setters, the timelines take the
 * schedule, and the document is produced by the factory's builder through
 * the real node registry (the headless equivalent of building the graph in
 * the editor and saving).
 *
 *     node dist/scripts/build-cabin-graph.js [specs/scenario-night-9.json] [graphs/cabin.spikypanda]
 *
 * Alongside the document, `graphs/cabin.manifest.json` records the sha256 of
 * both inputs, so a document always names the assumptions it was built with.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { DocumentConnectionSpec, DocumentNodeSpec } from "@spiky-panda/factory";
import { readJson, sha256File } from "../lib/files.js";
import { loadFactory, param, type CabinParameters, type Scenario } from "../lib/factory.js";
import { PARAMETERS_FILE, fromRoot, isMain, relativeToRoot } from "../lib/paths.js";

const MINUTE = 60; // the session runs in seconds; the story and the files speak in minutes

export interface CabinDocumentSpec {
    nodes: DocumentNodeSpec[];
    connections: DocumentConnectionSpec[];
    preset: string;
    end: number;
}

/** The node spec of the cabin twin: type ids, parameters from the files, positions as laid out in the editor on 23 September 2026 (the twin's page, saved as a graph). */
export function cabinDocumentSpec(parameters: CabinParameters, scenario: Scenario): CabinDocumentSpec {
    const p = <T = number>(dotted: string) => param<T>(parameters, dotted);
    const activities = p<string[]>("crew.activities");
    const end = Math.max(...scenario.schedule.map((s) => s.to)) * MINUTE;

    // The schedule drives up to two crew groups: one timeline per driven quantity.
    const group = (index: number, key: "count" | "activity") =>
        scenario.schedule.map((s) => {
            const g = s.crew[index];
            const value = key === "count" ? (g ? g.count : 0) : g ? g.activity : activities[0];
            return { from: s.from * MINUTE, to: s.to * MINUTE, value };
        });
    const segments = (list: unknown[]) => JSON.stringify(list);
    const preset = p<string>("scrubber.preset");
    const presets = (parameters.parameters.scrubber as { presets: Record<string, unknown> }).presets;
    if (!(preset in presets)) throw new Error(`cabin-parameters: scrubber.preset "${preset}" is not one of ${Object.keys(presets).join(", ")}`);

    const crewParams = {
        emissionSleepPpmPerMinute: p("crew.emissionPerPerson.sleep"),
        emissionRestPpmPerMinute: p("crew.emissionPerPerson.rest"),
        emissionLightWorkPpmPerMinute: p("crew.emissionPerPerson.light_work"),
        emissionHeavyWorkPpmPerMinute: p("crew.emissionPerPerson.heavy_work"),
    };
    const nodes: DocumentNodeSpec[] = [
        { id: "scene", typeId: "Physics.Scene:moon", x: -220, y: -140, label: "Lunar habitat" },
        { id: "solver", typeId: "Control.Sim:rk4-solver", x: -520, y: -120, label: "Solver (one story minute)", params: { tolerance: 1e-6, maxStep: p("time.solverStepMinutes") * MINUTE } },
        { id: "crew-a-count", typeId: "Logic.Time:timeline", x: -220, y: 260, label: "Crew A: count", params: { segments: segments(group(0, "count")), defaultValue: 0 } },
        { id: "crew-a-activity", typeId: "Logic.Time:timeline", x: -220, y: 420, label: "Crew A: activity", params: { segments: segments(group(0, "activity")), defaultValue: 0 } },
        { id: "crew-b-count", typeId: "Logic.Time:timeline", x: -220, y: 580, label: "Crew B: count", params: { segments: segments(group(1, "count")), defaultValue: 0 } },
        { id: "crew-b-activity", typeId: "Logic.Time:timeline", x: -220, y: 740, label: "Crew B: activity", params: { segments: segments(group(1, "activity")), defaultValue: 0 } },
        { id: "crew-a", typeId: "Physics.LifeSupport:crew", x: 20, y: 340, label: "Crew A", params: crewParams },
        { id: "crew-b", typeId: "Physics.LifeSupport:crew", x: 20, y: 580, label: "Crew B", params: crewParams },
        {
            id: "command",
            typeId: "Logic.Time:timeline",
            x: 180,
            y: -60,
            label: "Scrubber command",
            params: { segments: segments([{ from: 0, to: end, value: scenario.start.scrubberCommandPercent / 100 }]), defaultValue: scenario.start.scrubberCommandPercent / 100 },
        },
        {
            id: "scrubber",
            typeId: "Physics.LifeSupport:scrubber",
            x: 400,
            y: -60,
            label: "CO2 scrubber",
            params: {
                rateAtFullCommandPerMinute: p("scrubber.rateAtFullCommand"),
                lagTimeConstantMinutes: p("scrubber.lagTimeConstantMinutes"),
                supplyVolts: p("scrubber.power.supplyVolts"),
                interceptAmps: p("scrubber.power.interceptAmps"),
                slopeAmps: p("scrubber.power.slopeAmps"),
                habitatScale: p("scrubber.power.habitatScale"),
            },
        },
        {
            id: "cabin",
            typeId: "Physics.LifeSupport:cabin-air",
            x: 780,
            y: 300,
            label: "Cabin air",
            params: {
                initialPpm: scenario.start.co2Ppm,
                leakPerMinute: p("cabin.leakPerMinute"),
                removalFloorPpm: p("scrubber.removalFloorPpm"),
                floorPpm: p("cabin.floorPpm"),
                ceilingPpm: p("cabin.ceilingPpm"),
                elevatedPpm: p("thresholds.elevatedPpm"),
                criticalPpm: p("thresholds.criticalPpm"),
            },
        },
        {
            id: "battery",
            typeId: "Physics.Electric:battery",
            x: 980,
            y: -140,
            label: "Night reserve",
            params: { capacityWh: p("battery.capacityWh"), initialStateOfChargePercent: scenario.start.stateOfChargePercent, otherLoadsW: p("battery.otherLoadsW") },
        },
    ];
    const connections: DocumentConnectionSpec[] = [
        // the config link the editor uses to hand the solver to the scene (the factory reads solver items directly)
        { from: ["solver", "solver_out"], to: ["scene", "solver_in_0"] },
        { from: ["crew-a-count", "value"], to: ["crew-a", "count"] },
        { from: ["crew-a-activity", "value"], to: ["crew-a", "activity"] },
        { from: ["crew-b-count", "value"], to: ["crew-b", "count"] },
        { from: ["crew-b-activity", "value"], to: ["crew-b", "activity"] },
        { from: ["crew-a", "co2Emission"], to: ["cabin", "emissionA"] },
        { from: ["crew-b", "co2Emission"], to: ["cabin", "emissionB"] },
        { from: ["command", "value"], to: ["scrubber", "command"] },
        { from: ["scrubber", "effectiveRate"], to: ["cabin", "scrubberRate"] },
        { from: ["scrubber", "power"], to: ["battery", "powerA"] },
    ];
    return { nodes, connections, preset, end };
}

export function buildCabinDocument(scenarioFile: string, outFile: string): void {
    const factory = loadFactory();
    const parameters = readJson<CabinParameters>(PARAMETERS_FILE);
    const scenario = readJson<Scenario>(scenarioFile);
    const registry = factory.buildJobRegistry();
    const { nodes, connections, preset, end } = cabinDocumentSpec(parameters, scenario);
    const json = factory.buildDocumentJson(registry, nodes, connections);
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, json + "\n");
    const manifest = {
        document: relativeToRoot(outFile),
        builtOn: new Date().toISOString(),
        inputs: {
            parameters: { file: relativeToRoot(PARAMETERS_FILE), sha256: sha256File(PARAMETERS_FILE), version: parameters.version, status: parameters.status },
            scenario: { file: relativeToRoot(scenarioFile), sha256: sha256File(scenarioFile), version: scenario.version, status: scenario.status },
        },
        scrubberPreset: preset,
        durationMinutes: end / MINUTE,
        nodes: nodes.map((n) => ({ id: n.id, typeId: n.typeId })),
        sha256: sha256File(outFile),
    };
    const manifestFile = outFile.replace(/\.spikypanda$/, ".manifest.json");
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`${relativeToRoot(outFile)}: ${nodes.length} nodes, ${connections.length} connections, ${end / MINUTE} story minutes, preset ${preset}`);
    console.log(`${relativeToRoot(manifestFile)}: parameters ${manifest.inputs.parameters.sha256.slice(0, 12)}, scenario ${manifest.inputs.scenario.sha256.slice(0, 12)}`);
}

if (isMain(import.meta.url)) {
    buildCabinDocument(fromRoot(process.argv[2] ?? "specs/scenario-night-9.json"), fromRoot(process.argv[3] ?? "graphs/cabin.spikypanda"));
}
