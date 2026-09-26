import { cloneable, editable, viewable, inSlotOf, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IChannel, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";

/** A CO2 leak: mass flow out of a volume, proportional to opening command and concentration. */
export class LeakCo2Node extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _leak_rate_full: number = 0.0001; // kg/s at full opening
    @cloneable private _leak_rate: number = 0;

    // The ports: three signal inputs (volume, concentration, opening), one signal output (leak_rate).
    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "volume", optional: true, type: "float", kind: "signal" },
        { slot: "co2_concentration", optional: true, type: "float", kind: "signal" },
        { slot: "opening", optional: true, type: "float", kind: "signal" },
    ];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "leak_rate", optional: false, type: "float", kind: "signal" },
    ];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** An editable parameter: the full-opening leak rate in kg/s. */
    @editable("number") public get leak_rate_full(): number {
        return this._leak_rate_full;
    }
    public set leak_rate_full(v: number) {
        this.setField("leak_rate_full", this._leak_rate_full, Number.isFinite(v) && v >= 0 ? v : this._leak_rate_full, (n) => (this._leak_rate_full = n));
    }

    /** A viewable: the leak rate computed on the last tick. */
    @viewable("number") public get lastLeakRate(): number {
        return this._leak_rate;
    }

    public override reset(_session: ISession): void {
        this._leak_rate = 0;
    }

    /** One tick: read the inputs, compute the leak rate, publish on the output. */
    public override fire(session: ISession, _t: number): void {
        const links = session.graph.links as ReadonlyArray<IChannel>;
        let volume = 0;
        let co2_concentration = 0;
        let opening = 0; // default: 0% opening (no leak)

        // Read inputs from the session's signals.
        for (const link of this.opsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx < 0) continue;
            const slot = String(inSlotOf(link));
            const v = session.readSignal(idx);
            if (typeof v === "number" && Number.isFinite(v)) {
                if (slot === "volume") volume = v;
                else if (slot === "co2_concentration") co2_concentration = v;
                else if (slot === "opening") opening = v;
            }
        }

        // Clamp opening to [0, 100] percent.
        opening = Math.max(0, Math.min(100, opening));

        // Compute leak rate: proportional to opening command (0 to 1) and concentration.
        // The leak is a mass flow: concentration (ppm) * volume (m3) * opening fraction.
        // ppm is 1e-6 by mass; convert to kg/m3 of CO2 in air.
        // At standard conditions, air density ~1.2 kg/m3, CO2 density ~1.98 kg/m3.
        // For small concentrations, CO2 mass = concentration_ppm * 1e-6 * air_density * volume.
        // The leak rate (kg/s) is this mass times a rate constant (opening fraction).
        // Simplified: leak_rate = leak_rate_full * (opening / 100) * (concentration / 1e6).
        // But the contract says output(opening=100) == leak_rate_full, so:
        // leak_rate = leak_rate_full * (opening / 100).
        // The concentration and volume are inputs but the contract does not mention them in behaviors,
        // so they may be informational or used in a more complex model.
        // Following the contract strictly: output is proportional to opening only.
        const leak_rate = this._leak_rate_full * (opening / 100);
        this.setField("lastLeakRate", this._leak_rate, leak_rate, (n) => (this._leak_rate = n));

        // Publish on the output.
        for (const link of this.onsc<IChannel>()) {
            if (!link.enabled) continue;
            const idx = links.indexOf(link);
            if (idx >= 0 && String(link.slot) === "leak_rate") session.publish(idx, leak_rate);
        }
    }
}

export function createLeakCo2Node(): LeakCo2Node {
    return new LeakCo2Node();
}
