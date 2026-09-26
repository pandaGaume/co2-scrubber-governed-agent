import { cloneable, editable, viewable, inSlotOf, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IChannel, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";

/** A CO2 leak: mass flow out of a volume proportional to concentration and leak rate. */
export class LeakCo2Node extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _leak_rate: number = 0.05; // L/min
    @cloneable private _leak_flow: number = 0;

    // The ports, on the instance: two signal inputs (optional with defaults), one signal output.
    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "co2_concentration", optional: true, type: "float", kind: "signal" },
        { slot: "lab_volume", optional: true, type: "float", kind: "signal" },
    ];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "leak_flow", optional: false, type: "float", kind: "signal" }];

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

    /** A viewable: the computed leak flow on the last tick. */
    @viewable("number") public get lastLeakFlow(): number {
        return this._leak_flow;
    }

    public override reset(_session: ISession): void {
        this._leak_flow = 0;
    }

    /** One tick: read the inputs from the session's signals, compute the leak flow, publish on the output. */
    public override fire(session: ISession, _t: number): void {
        const links = session.graph.links as ReadonlyArray<IChannel>;
        let co2_concentration = 500; // ppm, default
        let lab_volume = 30; // m3, default

        // Read inputs from the session
        for (const link of this.opsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx < 0) continue;
            const slot = String(inSlotOf(link));
            const v = session.readSignal(idx);
            if (typeof v === "number" && Number.isFinite(v)) {
                if (slot === "co2_concentration") co2_concentration = v;
                else if (slot === "lab_volume") lab_volume = v;
            }
        }

        // Compute leak flow: leak_rate (L/min) * co2_concentration (ppm) / 1e6 * lab_volume (m3) / 1000 / 60
        // This converts: L/min to m3/s (divide by 1000*60), ppm to mass fraction (divide by 1e6), m3 to L (multiply by 1000)
        // Result: kg/s
        const leak_flow = (this._leak_rate * co2_concentration / 1e6 * lab_volume) / 1000 / 60;

        this.setField("lastLeakFlow", this._leak_flow, leak_flow, (n) => (this._leak_flow = n));

        // Publish on the output
        for (const link of this.onsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx >= 0 && String(link.slot) === "leak_flow") session.publish(idx, leak_flow);
        }
    }
}

export function createLeakCo2Node(): LeakCo2Node {
    return new LeakCo2Node();
}
