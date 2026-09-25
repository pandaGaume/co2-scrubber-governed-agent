import { cloneable, editable, viewable, inSlotOf, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IChannel, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";

/** A CO2 leak or vent: takes CO2 out of a volume at a mass flow scaled by a command. */
export class LeakCo2Node extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _rateAtFullOpening: number = 0.001; // kg/s at full opening (command = 1)
    @cloneable private _lastLeakRate: number = 0; // kg/s on the last tick

    // The ports, on the instance: a signal input for command (optional, defaults to 0), a signal output for co2Delta.
    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "command", optional: true, type: "float", kind: "signal" }];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "co2Delta", optional: false, type: "float", kind: "signal" }];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** An editable parameter: the leak rate at full opening (command = 1), in kg/s. */
    @editable("number") public get rateAtFullOpening(): number {
        return this._rateAtFullOpening;
    }
    public set rateAtFullOpening(v: number) {
        this.setField("rateAtFullOpening", this._rateAtFullOpening, Number.isFinite(v) && v >= 0 ? v : this._rateAtFullOpening, (n) => (this._rateAtFullOpening = n));
    }

    /** A viewable: the CO2 leak rate on the last tick (negative: what left the atmosphere). */
    @viewable("number") public get lastLeakRate(): number {
        return this._lastLeakRate;
    }

    public override reset(_session: ISession): void {
        this._lastLeakRate = 0;
    }

    /** One tick: read the command from the session's signals, compute the leak rate, publish on the co2Delta output. */
    public override fire(session: ISession, _t: number): void {
        const links = session.graph.links as ReadonlyArray<IChannel>;
        let command = 0;
        for (const link of this.opsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx < 0 || String(inSlotOf(link)) !== "command") continue;
            const v = session.readSignal(idx);
            if (typeof v === "number" && Number.isFinite(v)) {
                // Clamp command to [0, 1]
                command = Math.max(0, Math.min(1, v));
            }
        }
        // Leak rate is negative (CO2 leaves the atmosphere)
        const leakRate = -this._rateAtFullOpening * command;
        this.setField("lastLeakRate", this._lastLeakRate, leakRate, (n) => (this._lastLeakRate = n));
        for (const link of this.onsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx >= 0 && String(link.slot) === "co2Delta") session.publish(idx, leakRate);
        }
    }
}

export function createLeakCo2Node(): LeakCo2Node {
    return new LeakCo2Node();
}
