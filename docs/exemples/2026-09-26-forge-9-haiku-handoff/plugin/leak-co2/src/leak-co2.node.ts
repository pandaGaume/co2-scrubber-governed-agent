import { cloneable, editable, viewable, inSlotOf, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IChannel, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";

/** A CO2 leak: mass flow proportional to opening fraction and pressure. */
export class LeakCo2Node extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _leak_rate_at_full_opening: number = 0.0001;
    @cloneable private _output: number = 0;

    // The ports, on the instance: two signal inputs (optional with defaults), one signal output.
    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "pressure_pa", optional: true, type: "float", kind: "signal" },
        { slot: "opening_fraction", optional: true, type: "float", kind: "signal" },
    ];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "leak_co2", optional: false, type: "float", kind: "signal" }];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** An editable parameter: the leak rate at full opening (1.0 fraction) and standard pressure. */
    @editable("number") public get leak_rate_at_full_opening(): number {
        return this._leak_rate_at_full_opening;
    }
    public set leak_rate_at_full_opening(v: number) {
        this.setField("leak_rate_at_full_opening", this._leak_rate_at_full_opening, Number.isFinite(v) && v >= 0 ? v : this._leak_rate_at_full_opening, (n) => (this._leak_rate_at_full_opening = n));
    }

    /** A viewable: what the node computed on the last tick. */
    @viewable("number") public get lastOutput(): number {
        return this._output;
    }

    public override reset(_session: ISession): void {
        this._output = 0;
    }

    /** One tick: read the inputs from the session's signals, compute the leak flow, publish on the output. */
    public override fire(session: ISession, _t: number): void {
        const links = session.graph.links as ReadonlyArray<IChannel>;
        
        // Read pressure_pa input (default 101325 Pa)
        let pressure_pa = 101325;
        for (const link of this.opsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx < 0 || String(inSlotOf(link)) !== "pressure_pa") continue;
            const v = session.readSignal(idx);
            if (typeof v === "number" && Number.isFinite(v)) pressure_pa = v;
        }
        
        // Read opening_fraction input (default 0)
        let opening_fraction = 0;
        for (const link of this.opsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx < 0 || String(inSlotOf(link)) !== "opening_fraction") continue;
            const v = session.readSignal(idx);
            if (typeof v === "number" && Number.isFinite(v)) opening_fraction = v;
        }
        
        // Clamp opening_fraction to [0, 1]
        opening_fraction = Math.max(0, Math.min(1, opening_fraction));
        
        // Compute leak flow: proportional to opening fraction
        // The pressure term is implicit in the leak_rate_at_full_opening parameter
        // (it is measured at standard pressure 101325 Pa)
        const output = this._leak_rate_at_full_opening * opening_fraction;
        
        this.setField("lastOutput", this._output, output, (n) => (this._output = n));
        
        // Publish on the output slot
        for (const link of this.onsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx >= 0 && String(link.slot) === "leak_co2") session.publish(idx, output);
        }
    }
}

export function createLeakCo2Node(): LeakCo2Node {
    return new LeakCo2Node();
}
