import { cloneable, editable, viewable, inSlotOf, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IChannel, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";

/** A CO2 leak: mass flow out proportional to opening fraction and an editable rate. */
export class LeakNode extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _rate: number = 0.0001; // kg/s at full opening
    @cloneable private _leak_co2: number = 0;

    // The ports, on the instance: pressure and opening inputs (both optional with defaults), leak_co2 output.
    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "pressure", optional: true, type: "float", kind: "signal" },
        { slot: "opening", optional: true, type: "float", kind: "signal" },
    ];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "leak_co2", optional: false, type: "float", kind: "signal" },
    ];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** An editable parameter: the leak rate at full opening (kg/s). */
    @editable("number") public get rate(): number {
        return this._rate;
    }
    public set rate(v: number) {
        this.setField("rate", this._rate, Number.isFinite(v) && v >= 0 ? v : this._rate, (n) => (this._rate = n));
    }

    /** A viewable: the last computed leak mass flow. */
    @viewable("number") public get lastLeakCO2(): number {
        return this._leak_co2;
    }

    public override reset(_session: ISession): void {
        this._leak_co2 = 0;
    }

    /** One tick: read pressure and opening from inputs, compute leak mass flow, publish on output. */
    public override fire(session: ISession, _t: number): void {
        const links = session.graph.links as ReadonlyArray<IChannel>;
        
        // Default values
        let pressure = 101325; // Pa
        let opening = 0; // dimensionless, 0 to 1

        // Read inputs from the session's signals
        for (const link of this.opsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx < 0) continue;
            const slot = String(inSlotOf(link));
            const v = session.readSignal(idx);
            if (typeof v === "number" && Number.isFinite(v)) {
                if (slot === "pressure") {
                    pressure = v;
                } else if (slot === "opening") {
                    opening = Math.max(0, Math.min(1, v)); // clamp to [0, 1]
                }
            }
        }

        // Compute leak: proportional to opening fraction and rate
        // The pressure input is available but the behavior shows linear scaling with opening
        const leak = opening * this._rate;

        this.setField("lastLeakCO2", this._leak_co2, leak, (n) => (this._leak_co2 = n));

        // Publish on output links
        for (const link of this.onsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx >= 0 && String(link.slot) === "leak_co2") {
                session.publish(idx, leak);
            }
        }
    }
}

export function createLeakNode(): LeakNode {
    return new LeakNode();
}
