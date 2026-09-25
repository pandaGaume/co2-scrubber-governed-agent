/**
 * `Physics.Habitat:crew`: people as a CO2 source, in mass.
 *
 * Physical thesis: a person exhales CO2 at a rate set by the metabolic
 * rate, so by the activity; NASA gives it per activity and per body size
 * as a band (library `nasa-crew-metabolic-loads`: awake in the cabin, 0.26
 * to 0.45 L/min from the 5th to the 95th percentile, 0.38 for the reference
 * crewmember; asleep, 0.17 to 0.28). The rate is a volume of CO2 per
 * minute at cabin conditions; this node turns it into a mass flow with the
 * density of CO2 at those conditions.
 *
 * A crew is two things added together:
 *
 *   - the persons wired into it, one per `person_<k>` input (a
 *     `Physics.Habitat:person`, each at their own activity, their own
 *     rates, their own name): the pool grows as persons are wired, the
 *     next input appearing when the last one is taken (a variadic pool,
 *     `person_0`, `person_1`, ...; the studio adds the port, a document
 *     names it);
 *   - a head count at one activity, for the people nobody names
 *     (`count` at `activity`), the way the reference of 24 September
 *     wrote its crews.
 *
 *     co2Delta = sum_k person_k + count * litresPerMinute(activity) * 1e-3 / 60 * co2DensityKgPerM3   [kg/s]
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
import { activityOf, HABITAT_ACTIVITIES, kgpsToLitresPerMinute, litresPerMinuteToKgps, rateOf, REFERENCE_RATES, type ActivityRates, type HabitatActivity } from "./activity.js";
import { numberOr, publishOutputs, readInputs } from "./signals.js";

export { HABITAT_ACTIVITIES };
export type { HabitatActivity };

/** The prefix of the persons' pool: `person_0`, `person_1`, ... */
export const CREW_PERSON_PREFIX = "person_";

export class HabitatCrewNode extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _count: number = 2;
    @cloneable private _activity: HabitatActivity = "light_work";
    @cloneable private _sleep: number = REFERENCE_RATES.sleep;
    @cloneable private _rest: number = REFERENCE_RATES.rest;
    @cloneable private _lightWork: number = REFERENCE_RATES.lightWork;
    @cloneable private _heavyWork: number = REFERENCE_RATES.heavyWork;
    @cloneable private _co2Density: number = 1.8176;
    @cloneable private _co2Delta: number = 0;
    @cloneable private _litresPerMinute: number = 0;
    @cloneable private _headcount: number = 0;
    @cloneable private _persons: number = 0;

    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "count", optional: true, type: "float", kind: "signal" },
        { slot: "activity", optional: true, type: "any", kind: "signal" },
        // The first of the persons' pool; the others (`person_1`, ...) are the variadic group the registration declares.
        { slot: `${CREW_PERSON_PREFIX}0`, optional: true, type: "float", kind: "signal" },
    ];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "co2Delta", optional: false, type: "float", kind: "signal" },
        { slot: "litresPerMinute", optional: false, type: "float", kind: "signal" },
        { slot: "headcount", optional: false, type: "float", kind: "signal" },
    ];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** People nobody names, all at `activity`, when no signal drives it; the persons wired in are counted on top. */
    @editable("number") public get count(): number {
        return this._count;
    }
    public set count(v: number) {
        this.setField("count", this._count, Math.max(0, v), (n) => (this._count = n));
    }
    /** The unnamed people's activity (sleep, rest, light_work, heavy_work), when no signal drives it. */
    @editable("string") public get activity(): HabitatActivity {
        return this._activity;
    }
    public set activity(v: HabitatActivity) {
        this.setField("activity", this._activity, activityOf(v, this._activity), (n) => (this._activity = n));
    }
    /** CO2 per unnamed person asleep, litres per minute at cabin conditions. */
    @editable("number") public get sleepLitresPerMinute(): number {
        return this._sleep;
    }
    public set sleepLitresPerMinute(v: number) {
        this.setField("sleepLitresPerMinute", this._sleep, Math.max(0, v), (n) => (this._sleep = n));
    }
    /** CO2 per unnamed person at rest, seated. */
    @editable("number") public get restLitresPerMinute(): number {
        return this._rest;
    }
    public set restLitresPerMinute(v: number) {
        this.setField("restLitresPerMinute", this._rest, Math.max(0, v), (n) => (this._rest = n));
    }
    /** CO2 per unnamed person at light work, standing and handling equipment. */
    @editable("number") public get lightWorkLitresPerMinute(): number {
        return this._lightWork;
    }
    public set lightWorkLitresPerMinute(v: number) {
        this.setField("lightWorkLitresPerMinute", this._lightWork, Math.max(0, v), (n) => (this._lightWork = n));
    }
    /** CO2 per unnamed person at heavy work or exercise. */
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

    /** The crew's CO2 on the last tick, kg/s: the persons wired in and the unnamed count. */
    @viewable("number") public get co2Delta(): number {
        return this._co2Delta;
    }
    /** The same, litres per minute. */
    @viewable("number") public get litresPerMinute(): number {
        return this._litresPerMinute;
    }
    /** People in the crew on the last tick: the persons wired in plus the count. */
    @viewable("number") public get headcount(): number {
        return this._headcount;
    }
    /** How many persons are wired in. */
    @viewable("number") public get personsWired(): number {
        return this._persons;
    }

    public get rates(): ActivityRates {
        return { sleep: this._sleep, rest: this._rest, lightWork: this._lightWork, heavyWork: this._heavyWork };
    }

    /** The per-person rate of an activity, L/min. */
    public rateOf(activity: string): number {
        return rateOf(this.rates, activity);
    }

    public override reset(_session: ISession): void {
        this._co2Delta = 0;
        this._litresPerMinute = 0;
        this._headcount = 0;
        this._persons = 0;
    }

    public override fire(session: ISession, _t: number): void {
        const inputs = readInputs(this, session);
        const count = Math.max(0, numberOr(inputs.get("count"), this._count));
        const activity = inputs.has("activity") ? activityOf(inputs.get("activity"), this._activity) : this._activity;
        // The persons: every `person_<k>` wired in, a mass flow each; a person at no signal yet counts as present at zero.
        let persons = 0;
        let fromPersons = 0;
        for (const [slot, value] of inputs) {
            if (!slot.startsWith(CREW_PERSON_PREFIX)) continue;
            persons++;
            fromPersons += Math.max(0, numberOr(value, 0));
        }
        const unnamed = litresPerMinuteToKgps(count * this.rateOf(activity), this._co2Density);
        const delta = fromPersons + unnamed;
        const litres = kgpsToLitresPerMinute(delta, this._co2Density);
        const headcount = persons + count;
        this._persons = persons;
        this.setField("headcount", this._headcount, headcount, (n) => (this._headcount = n));
        this.setField("litresPerMinute", this._litresPerMinute, litres, (n) => (this._litresPerMinute = n));
        this.setField("co2Delta", this._co2Delta, delta, (n) => (this._co2Delta = n));
        publishOutputs(this, session, { co2Delta: delta, litresPerMinute: litres, headcount });
    }
}

export function createHabitatCrewNode(): HabitatCrewNode {
    return new HabitatCrewNode();
}
