import { cloneable, editable, viewable, inSlotOf, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IChannel, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";

/** A passive leak from a sealed volume: mass flow driven by pressure difference, proportional to conductance and density. */
export class LeakCo2Node extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _conductance: number = 1e-11;
    @cloneable private _pressure_reference: number = 101325;
    @cloneable private _leak_co2: number = 0;

    // The ports, on the instance: three signal inputs (optional with defaults), one signal output.
    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "pressure_source", optional: true, type: "float", kind: "signal" },
        { slot: "pressure_sink", optional: true, type: "float", kind: "signal" },
        { slot: "density", optional: true, type: "float", kind: "signal" },
    ];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "leak_co2", optional: false, type: "float", kind: "signal" },
    ];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** Conductance: an editable parameter in m3/s. */
    @editable("number") public get conductance(): number {
        return this._conductance;
    }
    public set conductance(v: number) {
        this.setField("conductance", this._conductance, Number.isFinite(v) && v >= 0 ? v : this._conductance, (n) => (this._conductance = n));
    }

    /** Reference pressure: not editable, fixed at 101325 Pa. */
    @editable("number") public get pressure_reference(): number {
        return this._pressure_reference;
    }
    public set pressure_reference(v: number) {
        // Not editable: ignore attempts to change it
        this.setField("pressure_reference", this._pressure_reference, this._pressure_reference, (n) => (this._pressure_reference = n));
    }

    /** A viewable: the last computed leak mass flow. */
    @viewable("number") public get lastLeakCo2(): number {
        return this._leak_co2;
    }

    public override reset(_session: ISession): void {
        this._leak_co2 = 0;
    }

    /** One tick: read the inputs from the session's signals, compute the leak, publish on the output. */
    public override fire(session: ISession, _t: number): void {
        const links = session.graph.links as ReadonlyArray<IChannel>;
        
        // Read inputs with defaults from the contract
        let pressure_source = 101325;
        let pressure_sink = 101000;
        let density = 1.2;

        for (const link of this.opsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx < 0) continue;
            const slot = String(inSlotOf(link));
            const v = session.readSignal(idx);
            if (typeof v === "number" && Number.isFinite(v)) {
                if (slot === "pressure_source") pressure_source = v;
                else if (slot === "pressure_sink") pressure_sink = v;
                else if (slot === "density") density = v;
            }
        }

        // Compute leak: conductance * (pressure_source - pressure_sink) / pressure_reference * density
        const leak = this._conductance * (pressure_source - pressure_sink) / this._pressure_reference * density;
        this.setField("lastLeakCo2", this._leak_co2, leak, (n) => (this._leak_co2 = n));

        // Publish on the output
        for (const link of this.onsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx >= 0 && String(link.slot) === "leak_co2") session.publish(idx, leak);
        }
    }
}

export function createLeakCo2Node(): LeakCo2Node {
    return new LeakCo2Node();
}
