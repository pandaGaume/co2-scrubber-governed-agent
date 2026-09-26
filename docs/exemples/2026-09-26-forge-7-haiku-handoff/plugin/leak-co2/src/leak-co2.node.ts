import { cloneable, editable, viewable, inSlotOf, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IChannel, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";

/** A CO2 leak from a seal: a constant leak rate scaled by a command fraction. */
export class LeakCo2Node extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _leak_rate: number = 0.05; // L/min, default
    @cloneable private _leak_co2: number = 0;

    // The ports: pressure (optional), volume (optional), command (optional, defaults to 1), and leak_co2 output.
    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "pressure", optional: true, type: "float", kind: "signal" },
        { slot: "volume", optional: true, type: "float", kind: "signal" },
        { slot: "command", optional: true, type: "float", kind: "signal" }
    ];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "leak_co2", optional: false, type: "float", kind: "signal" }
    ];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** An editable parameter: the leak rate in L/min. */
    @editable("number") public get leak_rate(): number {
        return this._leak_rate;
    }
    public set leak_rate(v: number) {
        this.setField("leak_rate", this._leak_rate, Number.isFinite(v) && v >= 0 ? v : this._leak_rate, (n) => (this._leak_rate = n));
    }

    /** A viewable: the computed leak CO2 mass flow on the last tick. */
    @viewable("number") public get lastLeakCo2(): number {
        return this._leak_co2;
    }

    public override reset(_session: ISession): void {
        this._leak_co2 = 0;
    }

    /** One tick: read inputs, compute leak mass flow, publish output. */
    public override fire(session: ISession, _t: number): void {
        const links = session.graph.links as ReadonlyArray<IChannel>;
        let command = 1; // Default: fully open

        // Read the command input (0 to 1 fraction)
        for (const link of this.opsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx < 0 || String(inSlotOf(link)) !== "command") continue;
            const v = session.readSignal(idx);
            if (typeof v === "number" && Number.isFinite(v)) {
                command = Math.max(0, Math.min(1, v)); // Clamp to [0, 1]
            }
        }

        // Convert leak_rate from L/min to kg/s
        // CO2 density at standard conditions: ~1.98 kg/m³
        // 1 L/min = 1e-3 m³/min = 1e-3/60 m³/s
        // mass flow = density * volumetric flow
        // mass flow (kg/s) = 1.98 * (leak_rate L/min) * (1e-3 m³/L) * (1/60 s/min)
        // mass flow (kg/s) = leak_rate * 1.98 / 60000
        const leak_co2 = (this._leak_rate * 1.98 / 60000) * command;

        this.setField("lastLeakCo2", this._leak_co2, leak_co2, (n) => (this._leak_co2 = n));

        // Publish the output
        for (const link of this.onsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx >= 0 && String(link.slot) === "leak_co2") session.publish(idx, leak_co2);
        }
    }
}

export function createLeakCo2Node(): LeakCo2Node {
    return new LeakCo2Node();
}
