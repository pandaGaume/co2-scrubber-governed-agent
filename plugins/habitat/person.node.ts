/**
 * `Physics.Habitat:person`: one person as a CO2 source, in mass.
 *
 * A crew is people, and people do not all do the same thing at the same
 * time: one sleeps while another works. This node is one of them, by name,
 * at an activity of their own, with their own rates (NASA gives the rate
 * per activity as a band by body size, library `nasa-crew-metabolic-loads`;
 * the defaults are the reference crewmember's, a bigger or smaller person
 * edits them):
 *
 *     co2Delta = litresPerMinute(activity) * 1e-3 / 60 * co2DensityKgPerM3   [kg/s]
 *
 * The activity is an editable and a signal input: a timeline schedules a
 * day (a number is the rung of the ladder, 0 asleep to 3 at heavy work; a
 * word names it). The output goes to a crew's `person_<k>` input, which
 * sums its people, or straight to an atmosphere's `delta_CO2_<k>`.
 *
 * The name is the medical monitor's (`biomed`'s roster, a callsign and a
 * name): a person on a graph is a person the station knows.
 */
import { cloneable, editable, viewable, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";
import { activityLevel, activityOf, HABITAT_ACTIVITIES, litresPerMinuteToKgps, rateOf, REFERENCE_RATES, type ActivityRates, type HabitatActivity } from "./activity.js";
import { publishOutputs, readInputs } from "./signals.js";

export class HabitatPersonNode extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _name: string = "";
    @cloneable private _callsign: string = "";
    @cloneable private _activity: HabitatActivity = "rest";
    @cloneable private _sleep: number = REFERENCE_RATES.sleep;
    @cloneable private _rest: number = REFERENCE_RATES.rest;
    @cloneable private _lightWork: number = REFERENCE_RATES.lightWork;
    @cloneable private _heavyWork: number = REFERENCE_RATES.heavyWork;
    @cloneable private _co2Density: number = 1.8176;
    @cloneable private _co2Delta: number = 0;
    @cloneable private _litresPerMinute: number = 0;
    @cloneable private _current: HabitatActivity = "rest";

    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "activity", optional: true, type: "any", kind: "signal" }];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "co2Delta", optional: false, type: "float", kind: "signal" },
        { slot: "litresPerMinute", optional: false, type: "float", kind: "signal" },
        { slot: "activityLevel", optional: false, type: "float", kind: "signal" },
    ];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** Who this is, as the medical monitor names them. */
    @editable("string") public get name(): string {
        return this._name;
    }
    public set name(v: string) {
        this.setField("name", this._name, String(v ?? ""), (n) => (this._name = n));
    }
    /** Their callsign on board (CDR, FE-1). */
    @editable("string") public get callsign(): string {
        return this._callsign;
    }
    public set callsign(v: string) {
        this.setField("callsign", this._callsign, String(v ?? ""), (n) => (this._callsign = n));
    }
    /** What they do (sleep, rest, light_work, heavy_work), when no signal drives it. */
    @editable("string") public get activity(): HabitatActivity {
        return this._activity;
    }
    public set activity(v: HabitatActivity) {
        this.setField("activity", this._activity, activityOf(v, this._activity), (n) => (this._activity = n));
    }
    /** Their CO2 asleep, litres per minute at cabin conditions. */
    @editable("number") public get sleepLitresPerMinute(): number {
        return this._sleep;
    }
    public set sleepLitresPerMinute(v: number) {
        this.setField("sleepLitresPerMinute", this._sleep, Math.max(0, v), (n) => (this._sleep = n));
    }
    /** Their CO2 at rest, seated. */
    @editable("number") public get restLitresPerMinute(): number {
        return this._rest;
    }
    public set restLitresPerMinute(v: number) {
        this.setField("restLitresPerMinute", this._rest, Math.max(0, v), (n) => (this._rest = n));
    }
    /** Their CO2 at light work, standing and handling equipment. */
    @editable("number") public get lightWorkLitresPerMinute(): number {
        return this._lightWork;
    }
    public set lightWorkLitresPerMinute(v: number) {
        this.setField("lightWorkLitresPerMinute", this._lightWork, Math.max(0, v), (n) => (this._lightWork = n));
    }
    /** Their CO2 at heavy work or exercise. */
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

    /** Their CO2 on the last tick, kg/s. */
    @viewable("number") public get co2Delta(): number {
        return this._co2Delta;
    }
    /** Their CO2 on the last tick, litres per minute. */
    @viewable("number") public get litresPerMinute(): number {
        return this._litresPerMinute;
    }
    /** What they were doing on the last tick. */
    @viewable("string") public get currentActivity(): HabitatActivity {
        return this._current;
    }
    /** The same as a rung of the ladder, 0 to 3. */
    @viewable("number") public get activityLevel(): number {
        return activityLevel(this._current);
    }

    public get rates(): ActivityRates {
        return { sleep: this._sleep, rest: this._rest, lightWork: this._lightWork, heavyWork: this._heavyWork };
    }

    /** Their rate at an activity, L/min. */
    public rateOf(activity: string): number {
        return rateOf(this.rates, activity);
    }

    public override reset(_session: ISession): void {
        this._co2Delta = 0;
        this._litresPerMinute = 0;
        this._current = this._activity;
    }

    public override fire(session: ISession, _t: number): void {
        const inputs = readInputs(this, session);
        const activity = inputs.has("activity") ? activityOf(inputs.get("activity"), this._activity) : this._activity;
        const litres = this.rateOf(activity);
        const delta = litresPerMinuteToKgps(litres, this._co2Density);
        this._current = activity;
        this.setField("litresPerMinute", this._litresPerMinute, litres, (n) => (this._litresPerMinute = n));
        this.setField("co2Delta", this._co2Delta, delta, (n) => (this._co2Delta = n));
        publishOutputs(this, session, { co2Delta: delta, litresPerMinute: litres, activityLevel: activityLevel(activity) });
    }
}

export { HABITAT_ACTIVITIES };

export function createHabitatPersonNode(): HabitatPersonNode {
    return new HabitatPersonNode();
}
