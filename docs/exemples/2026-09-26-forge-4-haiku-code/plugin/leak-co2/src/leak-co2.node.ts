import { cloneable, editable, viewable, inSlotOf, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IChannel, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";

/** A CO2 leak: the command times a negative rate at full opening. */
export class LeakCo2Node extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _rateAtFullOpening: number = 0.002;
    @cloneable private _lastCo2Delta: number = 0;

    // The ports, on the instance: a signal input (optional, defaults to 1 when unwired), a signal output.
    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "command", optional: true, type: "float", kind: "signal" }];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "co2Delta", optional: false, type: "float", kind: "signal" }];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** An editable parameter: the leak rate at full opening (kg/s). */
    @editable("number") public get rateAtFullOpening(): number {
        return this._rateAtFullOpening;
    }
    public set rateAtFullOpening(v: number) {
        this.setField("rateAtFullOpening", this._rateAtFullOpening, Number.isFinite(v) && v >= 0 ? v : this._rateAtFullOpening, (n) => (this._rateAtFullOpening = n));
    }

    /** A viewable: what the node computed on the last tick (a probe of session_run reads it by this name). */
    @viewable("number") public get lastCo2Delta(): number {
        return this._lastCo2Delta;
    }

    public override reset(_session: ISession): void {
        this._lastCo2Delta = 0;
    }

    /** One tick: read the command from the session's signals, compute the CO2 delta, publish on the output. */
    public override fire(session: ISession, _t: number): void {
        const links = session.graph.links as ReadonlyArray<IChannel>;
        let command = 1; // Default to 1 when unwired
        let commandWired = false;
        
        for (const link of this.opsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx < 0 || String(inSlotOf(link)) !== "command") continue;
            const v = session.readSignal(idx);
            if (typeof v === "number" && Number.isFinite(v)) {
                command = Math.max(0, Math.min(1, v)); // Clamp to [0, 1]
                commandWired = true;
            }
        }
        
        // If not wired, command stays at 1
        const co2Delta = -command * this._rateAtFullOpening;
        this.setField("lastCo2Delta", this._lastCo2Delta, co2Delta, (n) => (this._lastCo2Delta = n));
        
        for (const link of this.onsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx >= 0 && String(link.slot) === "co2Delta") session.publish(idx, co2Delta);
        }
    }
}

export function createLeakCo2Node(): LeakCo2Node {
    return new LeakCo2Node();
}
