/**
 * The scientific loop of the graph factory, drawn under the twelve stages
 * of the factory's page (`graphs/factory-agent.spikypanda`, the nodes
 * `loop-*` the builder adds for the factory) and lit as a task's steps are
 * replayed: observe, hypothesize, build, execute, evaluate, then pass, or
 * diagnose into a parameter problem, a structural one or an invalid
 * evaluation, and revise. The states are the harness's own
 * (`harness/topics/graph/evaluate.ts`, `diagnose`): what lights here is
 * what the harness decided, read from the step's summary, never guessed
 * from the sentence.
 */
import type { StudioNode, StudioViewer } from "./studio-loop.js";

export const LOOP_PREFIX = "loop-";

/** The states of the loop, in the order the happy path walks them; the diagnosis branches below. */
export const LOOP_STATES = ["observe", "hypothesize", "build", "execute", "evaluate", "pass", "diagnose", "parameter", "structural", "invalid", "revise", "experiment", "done"] as const;
export type LoopState = (typeof LOOP_STATES)[number];

/** The first word of a loop node's label, as the builder writes it, to its state. */
const BY_WORD: Readonly<Record<string, LoopState>> = { OBSERVE: "observe", HYPOTHESIZE: "hypothesize", BUILD: "build", EXECUTE: "execute", EVALUATE: "evaluate", PASS: "pass", DONE: "done", DIAGNOSE: "diagnose", PARAMETER: "parameter", STRUCTURAL: "structural", INVALID: "invalid", REVISE: "revise", INSUFFICIENT: "experiment" };

/** The nodes of the loop on the canvas, by state: the studio gives the instances its own ids (`node_15`), so they are found by the label the builder wrote, whose first word names the state. */
export function loopNodes(viewer: StudioViewer): Map<LoopState, StudioNode> {
    const out = new Map<LoopState, StudioNode>();
    for (const n of viewer.nodes) {
        const word = String(n.label ?? "").trim().split(/\s+/)[0];
        const state = BY_WORD[word];
        if (state && !out.has(state)) out.set(state, n);
    }
    return out;
}

/** A manifest step as this page reads it. */
export interface LoopStepLike {
    capability?: string | null;
    source?: string;
    outcome?: string;
    reward?: number | null;
    summary?: unknown;
}

const diagnosisOf = (step: LoopStepLike): string | null => {
    const s = step.summary && typeof step.summary === "object" ? (step.summary as { value?: unknown }).value ?? step.summary : null;
    const d = s && typeof s === "object" ? (s as { diagnosis?: unknown }).diagnosis : undefined;
    return typeof d === "string" ? d : null;
};

/**
 * The states a step walks, from what it called and what the harness made
 * of it: a read is an observation, a plan a hypothesis, an evaluation goes
 * through build, execute and evaluate and ends where the diagnosis says, a
 * hand-over is done. A refused step ends its last state in error.
 */
export function loopStatesOf(step: LoopStepLike): Array<{ state: LoopState; error?: string }> {
    const id = step.capability ?? "";
    const refused = step.source === "refused" || step.source === "failed" || step.outcome === "refused" || step.reward === -1;
    const error = refused ? String(step.outcome ?? step.source ?? "refused") : undefined;
    const last = (states: LoopState[]): Array<{ state: LoopState; error?: string }> => states.map((state, i) => (error && i === states.length - 1 ? { state, error } : { state }));
    if (/^(workspace|library|twin\.registry|factory\.inventory|station\.registry)/.test(id)) return last(["observe"]);
    if (id === "task.plan") return last(["hypothesize"]);
    if (id === "graph.evaluate") {
        if (refused) return last(["build", "execute", "evaluate"]);
        switch (diagnosisOf(step)) {
            case "PASS":
                return last(["build", "execute", "evaluate", "pass"]);
            case "INVALID_EVALUATION":
                return last(["build", "execute", "evaluate", "diagnose", "invalid", "revise"]);
            case "PARAMETER_MISMATCH":
                return last(["build", "execute", "evaluate", "diagnose", "parameter", "revise"]);
            case "STRUCTURAL_MISMATCH":
                return last(["build", "execute", "evaluate", "diagnose", "structural", "revise"]);
            case "INSUFFICIENT_INFORMATION":
                return last(["build", "execute", "evaluate", "diagnose", "experiment"]);
            default:
                return last(["build", "execute", "evaluate"]);
        }
    }
    if (id === "task.done") return last(["done"]);
    if (id === "task.fail") return [{ state: "diagnose", error: error ?? "the builder gave up" }];
    return [];
}

export interface LoopLights {
    /** Lights a state (or marks it failed), the previous lit one settling as done. */
    mark(state: LoopState, error?: string): void;
    /** A new cycle: everything unlit except the states already passed in this task, which stay done. */
    reset(): void;
    /** Everything unlit: a new task. */
    clear(): void;
}

export function createLoopLights(byState: () => Map<LoopState, StudioNode>): LoopLights {
    let lit: StudioNode | null = null;
    const settle = (n: StudioNode) => {
        n.el.classList.remove("hx-lit");
        n.el.classList.add("hx-done");
    };
    return {
        mark(state, error) {
            const n = byState().get(state);
            if (!n) return;
            if (lit && lit !== n) settle(lit);
            n.el.classList.remove("hx-done", "hx-failed", "hx-lit");
            n.el.classList.add(error ? "hx-failed" : "hx-lit");
            lit = error ? null : n;
        },
        reset() {
            if (lit) settle(lit);
            lit = null;
        },
        clear() {
            for (const n of byState().values()) n.el.classList.remove("hx-lit", "hx-done", "hx-failed");
            lit = null;
        },
    };
}
