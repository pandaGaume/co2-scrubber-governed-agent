/** A scenario supplies initial conditions and one objective, not the supervisor's workflow. */
import { readFileSync } from "node:fs";
import { Broker } from "../../harness/lib/broker.js";
import { fromRoot } from "../../lib/paths.js";
import { cabinReading } from "../../lib/cabin-co2.js";
import { resetBoard } from "../../tier3/lib/board-start.js";
import type { Run } from "./commissioning.js";

export interface InitialMissionDocument {
    kind: "mission";
    mission: string;
    devices: string;
    world: "lab";
    initial: { speedPercent: number; co2Ppm: number; batteryStateOfCharge: number };
    testFixture?: string;
    completion?: { procedure: import("../agent/procedure-completion.js").ProcedureCompletionRequirement };
}

export function initialMissionProblems(doc: InitialMissionDocument): string[] {
    const problems: string[] = [];
    if (doc.kind !== "mission" || typeof doc.mission !== "string" || !doc.mission.trim()) problems.push("a mission has one nonempty initial prompt");
    if (doc.world !== "lab" || typeof doc.devices !== "string") problems.push("initial world and device registry are required");
    for (const [key, max] of [["speedPercent", 100], ["co2Ppm", Infinity], ["batteryStateOfCharge", 100]] as const) {
        const value = doc.initial?.[key];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) problems.push(`initial.${key} must be in [0, ${max}]`);
    }
    if ("loops" in doc || "events" in doc) problems.push("a mission supplies no prescribed loop or event sequence");
    if (doc.completion) {
        const p = doc.completion.procedure;
        if (!p || !Array.isArray(p.requiredSpeedsPercent) || !p.requiredSpeedsPercent.length || p.requiredSpeedsPercent.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) problems.push("completion.procedure requires finite speed percentages in [0, 100]");
        if (!p || !Number.isFinite(p.minimumObservedSeconds) || p.minimumObservedSeconds < 0 || !Number.isFinite(p.speedTolerancePercent) || p.speedTolerancePercent < 0) problems.push("completion.procedure requires finite nonnegative observation duration and speed tolerance");
    }
    return problems;
}

export function initialRunOf(id: string, sha256: string, doc: InitialMissionDocument, n: number): Run {
    return { id: `R${n.toString().padStart(3, "0")}`, scenario: id, sha256, startedAt: new Date().toISOString(), endedAt: null, status: "running", options: { world: doc.world, leak: false, builder: "reasoner" }, commissioningId: null, loops: [], tasks: [], ended: null };
}

export async function deliverInitialMission(doc: InitialMissionDocument, run: Run, httpBase: string, notify: () => void): Promise<void> {
    const broker = new Broker(httpBase, { name: "scenario-initial-state", version: "0.1.0", locale: "en" }, "station");
    const call = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
        const result = await broker.call(slot, tool, args);
        if (!result.ok) throw new Error(`${slot}.${tool}: ${result.error ?? result.outcome}`);
        return result.output as T;
    };
    // These are environmental facts. No factory, observer or validation is selected here.
    run.loops = [];
    run.mission = { id: `scenario:${run.id}`, status: "delivering" };
    notify();
    try {
        // Check availability before changing the scene. This read does not start a mission.
        const agentState = await call<{ mission?: { status: string }; mode?: string }>("agent", "state");
        if ((agentState.mission && agentState.mission.status !== "completed") || agentState.mode === "playing") throw new Error("the supervisor already has an open mission or a running test");
        const reasoner = await call<{ ready: boolean; reason?: string }>("reasoner", "describe", { prompt: "specs/agent/prompt.mission.md" });
        if (!reasoner.ready) throw new Error(reasoner.reason ?? "the mission reasoner is unavailable");
        const scene = JSON.parse(readFileSync(fromRoot(doc.devices), "utf8")) as { devices: Array<{ path: string; descriptor: Record<string, unknown> }> };
        const registered = (await call<{ devices: Array<{ path: string }> }>("station", "registry_list")).devices;
        const suffix = registered.some((d) => d.path === scene.devices[0].path) ? `-${run.id.toLowerCase()}` : "";
        const devices: typeof scene.devices = scene.devices.map((device) => ({ ...device, path: `${device.path}${suffix}`, descriptor: { ...device.descriptor, links: ((device.descriptor.links as Array<{ rel: string; href: string }>) ?? []).map((link) => ({ ...link, href: `${link.href}${suffix}` })) } }));
        const resetNotes = await resetBoard(broker, { speedPercent: doc.initial.speedPercent, ppm: doc.initial.co2Ppm, reading: cabinReading(doc.initial.co2Ppm) });
        for (const device of devices) {
            const result = await call<{ commissioning: string | null }>("station", "registry_register", device);
            if (result.commissioning) run.commissioningId = result.commissioning;
        }
        const battery = devices.find((device) => device.descriptor["@type"] === "Battery");
        if (battery) await call("station", "registry_report", { path: battery.path, readings: { stateOfCharge: doc.initial.batteryStateOfCharge } });
        const result = await call<{ mission?: { id: string; status: string } }>("agent", "mission_start", {
            missionId: run.mission.id,
            objective: doc.mission!,
            observation: { scenario: run.scenario, runId: run.id, commissioningId: run.commissioningId, devices: devices.map((d) => d.path), resetNotes, atmosphere: "simulated", world: run.options.world, ...(doc.completion ? { completion: doc.completion } : {}) },
        });
        run.mission.status = "delivered";
        run.status = "done";
        run.ended = `initial conditions and one prompt delivered to ${result.mission?.id ?? run.mission.id}; this is not mission completion`;
    } catch (error) {
        run.status = "failed";
        run.mission.status = "delivery-failed";
        run.ended = error instanceof Error ? error.message : String(error);
    } finally {
        run.endedAt = new Date().toISOString();
        notify();
        await broker.close();
    }
}
