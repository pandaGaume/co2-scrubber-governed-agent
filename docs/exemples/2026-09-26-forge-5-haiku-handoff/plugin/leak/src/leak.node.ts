import { cloneable, editable, viewable, inSlotOf, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IChannel, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";

/** A leak: a constant CO2 mass flow source from a seal, scaled by a command fraction. */
export class LeakNode extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _leak_rate_full_opening: number = 0.001;
    @cloneable private _leak_rate: number = 0;

    // The ports, on the instance: a dimensionless command input (optional, defaults to 1 when unwired), a mass flow output.
    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "command", optional: true, type: "float", kind: "signal" }];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "leak_rate", optional: false, type: "float", kind: "signal" }];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** An editable parameter: the leak rate at full opening (kg/s). */
    @editable("number") public get leak_rate_full_opening(): number {
        return this._leak_rate_full_opening;
    }
    public set leak_rate_full_opening(v: number) {
        this.setField("leak_rate_full_opening", this._leak_rate_full_opening, Number.isFinite(v) && v >= 0 ? v : this._leak_rate_full_opening, (n) => (this._leak_rate_full_opening = n));
    }

    /** A viewable: the computed leak rate on the last tick. */
    @viewable("number") public get lastLeakRate(): number {
        return this._leak_rate;
    }

    public override reset(_session: ISession): void {
        this._leak_rate = 0;
    }

    /** One tick: read the command from the session's signals, compute the leak rate, publish on the output. */
    public override fire(session: ISession, _t: number): void {
        const links = session.graph.links as ReadonlyArray<IChannel>;
        let command = 1; // Default: fully open when unwired
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
        const leak_rate = this._leak_rate_full_opening * command;
        this.setField("lastLeakRate", this._leak_rate, leak_rate, (n) => (this._leak_rate = n));
        for (const link of this.onsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx >= 0 && String(link.slot) === "leak_rate") session.publish(idx, leak_rate);
        }
    }
}

export function createLeakNode(): LeakNode {
    return new LeakNode();
}
