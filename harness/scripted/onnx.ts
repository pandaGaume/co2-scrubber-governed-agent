/**
 * The scripted constructor of the `onnx` topic: plays the model's lines
 * without a language model, so the whole loop (the guard, the workshop's
 * tools over the broker, the evaluator, the manifest, the proposal) runs
 * and can be watched before any provider key exists (node 6 of
 * docs/harness-stages.fr.md, without a model).
 *
 * It implements the harness's `PolicyFallback` like a real provider would:
 * `resolve(input)` receives the state, the intention and the allowed
 * capabilities and returns one decision. Like a model, it decides from what
 * it observes: the phase and the last step (`state.id`), and the last call's
 * answer when a line needs a path or a number. It keeps no counter, so a
 * step the harness replays from the recipes is simply not asked of it.
 *
 * The lines, for a task whose data is a telemetry file with a duty column
 * (duty, speed or command in its name) and a current column:
 *   plan, nothing done      registry_search on the task's required outputs;
 *   plan, after the search  task.plan: the types found, one per output; the
 *                           outputs no type produces declared missing, to fit;
 *   build, after the plan   workspace.list;
 *   after the listing       model.fit (affine-residual on the telemetry);
 *   after the fit           model.inspect on the model written;
 *   after the inspection    model.contract with the model's sha256 and its
 *                           output count;
 *   after the check         task.done with the model and the numbers of the fit;
 *   after a failed call     task.fail with the tool's own reason (the affine fit
 *                           on one speed only, a file that is not there).
 */
import type { JsonValue, PolicyDecision, PolicyFallbackInput } from "@spiky-panda/harness";
import type { Provider, ProviderExchange } from "../lib/provider.js";
import type { CapabilityCall } from "../core/capabilities.js";
import type { TaskFile } from "../core/task.js";

export interface ScriptedBuilderOptions {
    task: TaskFile["task"];
    /** The last call of the loop, as the runner records it (what a model would read in `lastOutput`). */
    lastCall: () => CapabilityCall | null;
}

const decide = (capabilityId: string, input: JsonValue, rationale: string): PolicyDecision => ({ action: { id: capabilityId, description: capabilityId }, invocation: { actionId: capabilityId, capabilityId, input }, rationale });

/** A number as a summary states it: three significant digits. */
const short = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? Number(v.toPrecision(3)).toString() : "?");

const valueOf = (call: CapabilityCall | null): Record<string, JsonValue> => (call?.result.ok && call.result.output && typeof call.result.output === "object" ? (call.result.output as Record<string, JsonValue>) : {});

export class ScriptedBuilder implements Provider {
    readonly name = "scripted:onnx";
    readonly model = "scripted/onnx";
    readonly family = "scripted";
    readonly exchanges: ProviderExchange[] = [];
    calls = 0;
    private fit: Record<string, JsonValue> = {};
    private inspect: Record<string, JsonValue> = {};

    constructor(private readonly options: ScriptedBuilderOptions) {}

    begin(): void {
        this.fit = {};
        this.inspect = {};
    }

    private next(state: PolicyFallbackInput["state"]): PolicyDecision {
        const { task } = this.options;
        const last = this.options.lastCall();
        const data = task.data[0];
        const columns = data?.columns ?? [];
        const duty = columns.find((c) => /duty|speed|command/i.test(c)) ?? columns[0] ?? "duty_percent";
        const current = columns.find((c) => /current|amp/i.test(c)) ?? columns[1] ?? "current_amps";
        // What was done last, as the observation says it (the harness may have replayed it from the recipes).
        const after = `${String(state.features.phase)}:${String(state.features.lastCapability)}`;
        if (last?.id === "model.fit") this.fit = valueOf(last);
        if (last?.id === "model.inspect") this.inspect = valueOf(last);
        // A call that failed: the script has no other way, it gives up with the tool's reason (a model would try another way, or say the same).
        if (last && !last.result.ok) return decide("task.fail", { reason: (last.result.error ?? last.result.outcome).replace(/^(device refused|error):\s*/i, "") }, `${last.id} failed: nothing else to try`);
        switch (after) {
            case "plan:":
                return decide("twin.registry_search", { requiredOutputs: task.objective.required_outputs.map((o) => ({ quantity: o.quantity, ...(o.unit ? { unit: o.unit } : {}) })) }, "ask the catalogue which node types produce the required outputs");
            case "plan:twin.registry_search": {
                const search = valueOf(last);
                const matches = (Array.isArray(search.matches) ? search.matches : []) as Array<{ type: string; produces: Array<{ quantity: string; unit?: string }> }>;
                const selected: string[] = [];
                const missing: Array<{ required_output: string; quantity: string; unit?: string; reason: string; topic: string }> = [];
                for (const o of task.objective.required_outputs) {
                    const m = matches.find((x) => x.produces.some((p) => p.quantity === o.quantity && (!o.unit || p.unit === o.unit)));
                    if (m) {
                        if (!selected.includes(m.type)) selected.push(m.type);
                    } else missing.push({ required_output: o.name, quantity: o.quantity, ...(o.unit ? { unit: o.unit } : {}), reason: `no node of the catalogue produces ${o.quantity}${o.unit ? ` in ${o.unit}` : ""}; it is fitted from the task's telemetry`, topic: "onnx" });
                }
                return decide("task.plan", { selected_nodes: selected, missing_capabilities: missing }, `${selected.length} type(s) from the catalogue, ${missing.length} to fit`);
            }
            case "build:task.plan":
                return decide("workspace.list", {}, "see the task's files before fitting");
            case "build:workspace.list":
                return decide(
                    "model.fit",
                    {
                        spec: {
                            version: 1,
                            job: "fit",
                            name: "scrubber-2",
                            model: "affine-residual",
                            dataset: { file: data?.file ?? "telemetry.json", duty: { column: duty }, current: { column: current } },
                            fullScale: { duty: 100, current: 4, senseSpan: 100 },
                            domain: { dutyMin: 0.1875, dutyMax: 0.8 },
                            monitor: { residual: { threshold: 0.04, debounceCycles: 30, severity: 350, alarm: "drift.current" } },
                            outputs: { file: "scrubber_2.onnx" },
                        },
                    },
                    "fit the affine residual model on the telemetry",
                );
            case "build:model.fit": {
                const onnx = this.fit.onnx as { path?: string } | undefined;
                return decide("model.inspect", { path: onnx?.path ?? "models/scrubber-2/scrubber_2.onnx" }, "read the model's inputs and outputs");
            }
            case "build:model.inspect": {
                const onnx = this.fit.onnx as { path?: string; sha256?: string } | undefined;
                const outputs = Array.isArray(this.inspect.outputs) ? this.inspect.outputs.length : 1;
                return decide("model.contract", { path: onnx?.path ?? "", contract: { sha256: onnx?.sha256 ?? "", expectOutputCount: outputs } }, "check the model against its contract with the board's rules");
            }
            default: {
                // After the contract check (or anything unforeseen): claim the work is done; the validator judges.
                const onnx = this.fit.onnx as { path?: string } | undefined;
                const quality = (this.fit.quality ?? {}) as { rows?: number; rmse?: number; worstCaseError?: number };
                const parity = (this.fit.parity ?? {}) as { ok?: boolean };
                return decide(
                    "task.done",
                    {
                        summary: `affine-residual model fitted on ${String(quality.rows ?? "?")} rows, rmse ${short(quality.rmse)}, worst error ${short(quality.worstCaseError)}, parity ${parity.ok ? "ok" : "not ok"}; contract checked`,
                        artifacts: [{ kind: "model", path: onnx?.path ?? "" }],
                    },
                    `the contract is held at phase ${String(state.features.phase)}`,
                );
            }
        }
    }

    async resolve(input: PolicyFallbackInput): Promise<PolicyDecision> {
        this.calls++;
        const decision = this.next(input.state);
        this.exchanges.push({
            decisionId: input.decisionId,
            model: this.model,
            request: { intention: input.intention, state: input.state, allowed: input.allowedCapabilities.map((c) => c.id) },
            response: null,
            decision,
            proposedCapabilityId: decision.invocation.capabilityId,
            proposedInput: decision.invocation.input,
            latencyMs: 0,
            tokens: null,
        });
        return decision;
    }
}
