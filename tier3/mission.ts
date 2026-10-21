/** Transport around the existing decision graph. No workflow steps or domain decisions live here. */
import type { Intention, JsonValue } from "@spiky-panda/harness";
import type { LocalCapability } from "../harness/core/capabilities.js";
import { DecisionInvalidatedError } from "../harness/lib/execution-errors.js";

export interface MissionState {
    id: string;
    objective: string;
    status: "running" | "waiting" | "suspended" | "completed";
    waitingFor: "event" | "human" | null;
    decisions: number;
    note: string | null;
    outcome?: "success" | "incomplete";
    observations: JsonValue[];
}

export interface MissionDecision {
    capability: string;
    input: JsonValue;
    ok: boolean;
    /** A replay may never declare a mission completed on behalf of the reasoner. */
    reasoned: boolean;
}

export class Mission {
    readonly state: MissionState;
    private pumping = false;
    private revision = 0;
    private humanRevision = 0;
    private remaining: number;

    constructor(id: string, objective: string, observation: JsonValue, private readonly decide: (intention: Intention) => Promise<MissionDecision>, private readonly changed: () => void, private readonly budget = 40, private readonly paceMs = 1200, private readonly invalidated: () => void = () => undefined, private readonly completionProblem: (outcome: "success" | "incomplete") => Promise<string | null> = async () => null) {
        this.state = { id, objective, status: "running", waitingFor: null, decisions: 0, note: null, observations: [observation] };
        this.remaining = budget;
    }

    /** These actions are chosen by the reasoner and executed by the same harness as other tools. */
    capabilities(): LocalCapability[] {
        return ["complete", "wait"].map((action): LocalCapability => ({
            id: `mission.${action}`,
            description: action === "complete" ? "Explicitly end your mission, with your conclusion. A completed delegated task or scenario is not a completed mission. This decision must come from the reasoner." : "Wait for a delegated task or an external event. The mission remains open and resumes when a result arrives. To ask a human, use crew.ask.",
            inputSchema: { type: "object", properties: { reason: { type: "string", minLength: 1 }, ...(action === "complete" ? { outcome: { type: "string", enum: ["success", "incomplete"], description: "success requires all declared execution evidence. incomplete closes a finished test with an explicit report of unmet requirements; it never certifies commissioning success." } } : {}) }, required: ["reason"], additionalProperties: false },
            execute: async (input) => {
                const outcome = (input as { outcome?: string }).outcome === "incomplete" ? "incomplete" : "success";
                const problem = action === "complete" ? await this.completionProblem(outcome) : null;
                if (problem) return { ok: false, error: `Mission completion refused: ${problem}` };
                return { ok: true, output: { outcome: "completed", value: { requested: action } } };
            },
        }));
    }

    observe(observation: JsonValue, humanAnswer = false): void {
        if (this.state.status === "completed") throw new Error("the reasoner completed this mission; start a new mission");
        this.state.observations.push(observation);
        this.revision++;
        if (humanAnswer) this.humanRevision++;
        if (this.state.status === "waiting" && (this.state.waitingFor === "event" || humanAnswer)) this.resume(false);
        this.changed();
    }

    resume(replenishBudget = true): void {
        if (this.state.status === "completed") throw new Error("the reasoner completed this mission");
        // An external result does not grant a new budget. Only an explicit operator resume does.
        if (replenishBudget) this.remaining = this.budget;
        this.state.status = "running";
        this.state.waitingFor = null;
        this.state.note = null;
        this.changed();
        this.run();
    }

    suspend(reason: string): void {
        this.state.status = "suspended";
        this.state.waitingFor = null;
        this.state.note = reason;
        this.changed();
    }

    run(): void {
        if (this.pumping) return;
        this.pumping = true;
        void (async () => {
            try {
                while (this.state.status === "running") {
                    if (this.remaining-- <= 0) { this.suspend("decision budget reached; mission remains open"); break; }
                    const revision = this.revision;
                    const humanRevision = this.humanRevision;
                    let decision: MissionDecision;
                    try {
                        decision = await this.decide({ id: `mission:${this.state.id}`, description: this.state.objective, parameters: {} });
                    } catch (error) {
                        if (!(error instanceof DecisionInvalidatedError)) throw error;
                        this.state.decisions++;
                        if (this.state.status !== "running") break;
                        // Never dispatch the rejected proposal again. The next turn observes and reasons anew.
                        this.invalidated();
                        this.observe({ kind: "decision.invalidated", reason: error.message, executed: false });
                        if (this.paceMs) await new Promise((resolve) => setTimeout(resolve, this.paceMs));
                        continue;
                    }
                    this.state.decisions++;
                    // A pause or transport failure cannot become successful completion.
                    if (this.state.status !== "running") break;
                    if (decision.ok && decision.capability === "mission.complete") {
                        if (!decision.reasoned) { this.suspend("mission completion needs an explicit reasoner decision"); break; }
                        this.state.status = "completed";
                        this.state.outcome = (decision.input as { outcome?: string }).outcome === "incomplete" ? "incomplete" : "success";
                        this.state.note = String((decision.input as { reason?: string }).reason ?? "");
                    } else if (decision.ok && decision.capability === "crew.ask") {
                        // An immediate answer may already have returned through the station callback.
                        if (humanRevision === this.humanRevision) { this.state.status = "waiting"; this.state.waitingFor = "human"; }
                    } else if (decision.ok && decision.capability === "mission.wait" && revision === this.revision) {
                        this.state.status = "waiting";
                        this.state.waitingFor = "event";
                        this.state.note = String((decision.input as { reason?: string }).reason ?? "");
                    }
                    // crew.report, task.done and scenario completion do not complete the mission.
                    this.changed();
                    if (this.state.status === "running" && this.paceMs) await new Promise((resolve) => setTimeout(resolve, this.paceMs));
                }
            } catch (error) {
                this.suspend(`execution suspended: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
                this.pumping = false;
                if (this.state.status === "running") this.run();
            }
        })();
    }
}
