/**
 * `Physics.Habitat:crew`: people as a CO2 source, in mass.
 *
 * Physical thesis: a person exhales CO2 at a rate set by the metabolic
 * rate, so by the activity; NASA gives it per activity and per body size
 * as a band (library `nasa-crew-metabolic-loads`: awake in the cabin, 0.26
 * to 0.45 L/min from the 5th to the 95th percentile, 0.38 for the reference
 * crewmember; asleep, 0.17 to 0.28). The rate is a volume of CO2 per
 * minute at cabin conditions; this node turns it into a mass flow with the
 * density of CO2 at those conditions:
 *
 *     co2Delta = count * litresPerMinute(activity) * 1e-3 / 60 * co2DensityKgPerM3   [kg/s]
 *
 * and publishes it for an atmosphere's `delta_CO2_<k>` input. The
 * substrate's `Physics.LifeSupport:crew` gives the same source in ppm per
 * minute of a cabin whose volume is folded into its rates; this one gives
 * it in kg/s, which no volume is folded into, so the atmosphere's own
 * volume does the conversion. Count and activity are editables and also
 * signal inputs, so a schedule can drive them.
 */
import { cloneable, editable, viewable, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";
import { numberOr, publishOutputs, readInputs } from "./signals.js";

export const HABITAT_ACTIVITIES = ["sleep", "rest", "light_work", "heavy_work"] as const;
export type HabitatActivity = (typeof HABITAT_ACTIVITIES)[number];

export class HabitatCrewNode extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _count: number = 2;
    @cloneable private _activity: HabitatActivity = "light_work";
    @cloneable private _sleep: number = 0.24;
    @cloneable private _rest: number = 0.3;
    @cloneable private _lightWork: number = 0.38;
    @cloneable private _heavyWork: number = 1.0;
    @cloneable private _co2Density: number = 1.8176;
    @cloneable private _co2Delta: number = 0;
    @cloneable private _litresPerMinute: number = 0;

    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "count", optional: true, type: "float", kind: "signal" },
        { slot: "activity", optional: true, type: "any", kind: "signal" },
    ];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "co2Delta", optional: false, type: "float", kind: "signal" },
        { slot: "litresPerMinute", optional: false, type: "float", kind: "signal" },
    ];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** People in the group, when no signal drives it. */
    @editable("number") public get count(): number {
        return this._count;
    }
    public set count(v: number) {
        this.setField("count", this._count, Math.max(0, v), (n) => (this._count = n));
    }
    /** Their activity (sleep, rest, light_work, heavy_work), when no signal drives it. */
    @editable("string") public get activity(): HabitatActivity {
        return this._activity;
    }
    public set activity(v: HabitatActivity) {
        const next = (HABITAT_ACTIVITIES as ReadonlyArray<string>).includes(v) ? v : this._activity;
        this.setField("activity", this._activity, next, (n) => (this._activity = n));
    }
    /** CO2 per person asleep, litres per minute at cabin conditions. */
    @editable("number") public get sleepLitresPerMinute(): number {
        return this._sleep;
    }
    public set sleepLitresPerMinute(v: number) {
        this.setField("sleepLitresPerMinute", this._sleep, Math.max(0, v), (n) => (this._sleep = n));
    }
    /** CO2 per person at rest, seated. */
    @editable("number") public get restLitresPerMinute(): number {
        return this._rest;
    }
    public set restLitresPerMinute(v: number) {
        this.setField("restLitresPerMinute", this._rest, Math.max(0, v), (n) => (this._rest = n));
    }
    /** CO2 per person at light work, standing and handling equipment. */
    @editable("number") public get lightWorkLitresPerMinute(): number {
        return this._lightWork;
    }
    public set lightWorkLitresPerMinute(v: number) {
        this.setField("lightWorkLitresPerMinute", this._lightWork, Math.max(0, v), (n) => (this._lightWork = n));
    }
    /** CO2 per person at heavy work or exercise. */
    @editable("number") public get heavyWorkLitresPerMinute(): number {
        return this._heavyWork;
    }
    public set heavyWorkLitresPerMinute(v: number) {
        this.setField("heavyWorkLitresPerMinute", this._heavyWork, Math.max(0, v), (n) => (this._heavyWork = n));
    }
    /** Density of CO2 at cabin conditions, kg/m3 (1.82 at 22 C and 101.3 kPa). */
    @editable("number") public get co2DensityKgPerM3(): number {
        return this._co2Density;
    }
    public set co2DensityKgPerM3(v: number) {
        this.setField("co2DensityKgPerM3", this._co2Density, Math.max(0, v), (n) => (this._co2Density = n));
    }

    /** The group's CO2 on the last tick, kg/s. */
    @viewable("number") public get co2Delta(): number {
        return this._co2Delta;
    }
    /** The group's CO2 on the last tick, litres per minute. */
    @viewable("number") public get litresPerMinute(): number {
        return this._litresPerMinute;
    }

    /** The per-person rate of an activity, L/min. */
    public rateOf(activity: string): number {
        switch (activity) {
            case "sleep":
                return this._sleep;
            case "rest":
                return this._rest;
            case "heavy_work":
                return this._heavyWork;
            default:
                return this._lightWork;
        }
    }

    public override reset(_session: ISession): void {
        this._co2Delta = 0;
        this._litresPerMinute = 0;
    }

    public override fire(session: ISession, _t: number): void {
        const inputs = readInputs(this, session);
        const count = Math.max(0, numberOr(inputs.get("count"), this._count));
        const activity = inputs.has("activity") ? String(inputs.get("activity")) : this._activity;
        const litres = count * this.rateOf(activity);
        const delta = (litres * 1e-3 * this._co2Density) / 60;
        this.setField("litresPerMinute", this._litresPerMinute, litres, (n) => (this._litresPerMinute = n));
        this.setField("co2Delta", this._co2Delta, delta, (n) => (this._co2Delta = n));
        publishOutputs(this, session, { co2Delta: delta, litresPerMinute: litres });
    }
}

export function createHabitatCrewNode(): HabitatCrewNode {
    return new HabitatCrewNode();
}
