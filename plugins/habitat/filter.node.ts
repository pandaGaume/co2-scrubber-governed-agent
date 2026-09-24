/**
 * `Physics.Habitat:filter`: an air filter on a duct, and its fouling.
 *
 * Physical thesis: a filter is a resistance to the flow that rises as the
 * dust it captures loads its medium. Its pressure drop grows with the
 * square of the flow (turbulent, like the duct), with a coefficient that
 * grows with the loading; the loading grows with the dust the air carries
 * through it:
 *
 *     resistance    = cleanResistance * (1 + loading / loadingDoublingKg)     [Pa per (m3/s)^2]
 *     pressureDrop  = resistance * flow^2                                        [Pa]
 *     d(loading)/dt = captureEfficiency * dustConcentration * flow               [kg/s], the one integrated state
 *
 * The loading is the fault: `initialLoadingKg` sets a filter that is
 * already fouled when the run starts (a clogged filter is a filter with a
 * loading), and `clogging` says where it stands against its end of life.
 * A fan wired to `resistance` delivers less as the filter loads; nothing
 * else in the graph knows the filter exists.
 *
 * The dust concentration is a signal when something produces it, else the
 * editable ambient value (a habitat's air carries some dust; NASA limits
 * total dust to 3 mg/m3, library `nasa-co2-limits`).
 */
import { cloneable, editable, viewable, IntegrableRuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IDeclaresPorts, IIntegrable, IIntegrationInputs, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";
import { numberOr, publishOutputs, readInputs } from "./signals.js";

export class HabitatFilterNode extends IntegrableRuntimeNode implements IDeclaresPorts, IIntegrable {
    public readonly stateSize = 1;
    public readonly stateNames: ReadonlyArray<string> = ["loadingKg"];

    @cloneable private _cleanResistance: number = 49000;
    @cloneable private _loadingDoublingKg: number = 0.05;
    @cloneable private _captureEfficiency: number = 0.9;
    @cloneable private _ambientDust: number = 1e-6;
    @cloneable private _initialLoadingKg: number = 0;
    @cloneable private _endOfLifeLoadingKg: number = 0.2;

    @cloneable private _loading: number = 0;
    @cloneable private _flow: number = 0;
    @cloneable private _resistance: number = 0;
    @cloneable private _pressureDrop: number = 0;
    @cloneable private _captureRate: number = 0;

    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "flow", optional: true, type: "float", kind: "signal" },
        { slot: "dustConcentration", optional: true, type: "float", kind: "signal" },
    ];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "resistance", optional: false, type: "float", kind: "signal" },
        { slot: "pressureDrop", optional: false, type: "float", kind: "signal" },
        { slot: "loading", optional: false, type: "float", kind: "signal" },
        { slot: "clogging", optional: false, type: "float", kind: "signal" },
    ];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** Loading moves over days: a sample a minute is plenty. */
    protected override computeRequiredHz(): number {
        return 1 / 60;
    }

    /** Resistance of the clean filter, Pa per (m3/s)^2. */
    @editable("number") public get cleanResistance(): number {
        return this._cleanResistance;
    }
    public set cleanResistance(v: number) {
        this.setField("cleanResistance", this._cleanResistance, Math.max(0, v), (n) => (this._cleanResistance = n));
    }
    /** The dust loading, kg, at which the resistance is twice the clean one. */
    @editable("number") public get loadingDoublingKg(): number {
        return this._loadingDoublingKg;
    }
    public set loadingDoublingKg(v: number) {
        this.setField("loadingDoublingKg", this._loadingDoublingKg, Math.max(1e-9, v), (n) => (this._loadingDoublingKg = n));
    }
    /** Fraction of the dust carried through that the medium keeps, 0 to 1. */
    @editable("number") public get captureEfficiency(): number {
        return this._captureEfficiency;
    }
    public set captureEfficiency(v: number) {
        this.setField("captureEfficiency", this._captureEfficiency, Math.max(0, Math.min(1, v)), (n) => (this._captureEfficiency = n));
    }
    /** Dust in the air drawn when no `dustConcentration` signal is wired, kg/m3. */
    @editable("number") public get ambientDustKgPerM3(): number {
        return this._ambientDust;
    }
    public set ambientDustKgPerM3(v: number) {
        this.setField("ambientDustKgPerM3", this._ambientDust, Math.max(0, v), (n) => (this._ambientDust = n));
    }
    /** Loading at reset, kg: the fault of a filter already fouled. */
    @editable("number") public get initialLoadingKg(): number {
        return this._initialLoadingKg;
    }
    public set initialLoadingKg(v: number) {
        this.setField("initialLoadingKg", this._initialLoadingKg, Math.max(0, v), (n) => (this._initialLoadingKg = n));
    }
    /** Loading at which the filter is to be replaced, kg. */
    @editable("number") public get endOfLifeLoadingKg(): number {
        return this._endOfLifeLoadingKg;
    }
    public set endOfLifeLoadingKg(v: number) {
        this.setField("endOfLifeLoadingKg", this._endOfLifeLoadingKg, Math.max(1e-9, v), (n) => (this._endOfLifeLoadingKg = n));
    }

    /** Dust captured so far, kg. */
    @viewable("number") public get loadingKg(): number {
        return this._loading;
    }
    /** Resistance right now, Pa per (m3/s)^2. */
    @viewable("number") public get resistance(): number {
        return this._resistance;
    }
    /** Pressure drop across the filter on the last tick, Pa. */
    @viewable("number") public get pressureDropPa(): number {
        return this._pressureDrop;
    }
    /** Loading over the end-of-life loading: 0 clean, 1 to be replaced, above 1 overdue. */
    @viewable("number") public get clogging(): number {
        return this._loading / this._endOfLifeLoadingKg;
    }
    /** Dust captured on the last tick, kg/s. */
    @viewable("number") public get captureRateKgps(): number {
        return this._captureRate;
    }
    /** The flow read on the last tick, m3/s. */
    @viewable("number") public get flowM3ps(): number {
        return this._flow;
    }

    /** The resistance at a loading, Pa per (m3/s)^2. */
    public resistanceAt(loadingKg: number): number {
        return this._cleanResistance * (1 + Math.max(0, loadingKg) / this._loadingDoublingKg);
    }

    public gatherState(y: Float64Array, offset: number): void {
        y[offset] = this._loading;
    }

    public writeState(y: Float64Array, offset: number): void {
        this.setField("loadingKg", this._loading, Math.max(0, y[offset]), (n) => (this._loading = n));
    }

    public rhs(_t: number, _y: Float64Array, offset: number, inputs: IIntegrationInputs, dydt: Float64Array): void {
        const flow = Math.max(0, inputs.get("flow") ?? 0);
        const dust = Math.max(0, inputs.get("dustConcentration") ?? this._ambientDust);
        dydt[offset] = this._captureEfficiency * dust * flow;
    }

    public override reset(session: ISession): void {
        super.reset(session);
        this.setField("loadingKg", this._loading, this._initialLoadingKg, (n) => (this._loading = n));
        this._flow = 0;
        this._resistance = this.resistanceAt(this._loading);
        this._pressureDrop = 0;
        this._captureRate = 0;
    }

    public override fire(session: ISession, _t: number): void {
        const inputs = readInputs(this, session);
        const flow = Math.max(0, numberOr(inputs.get("flow"), 0));
        const dust = Math.max(0, numberOr(inputs.get("dustConcentration"), this._ambientDust));
        const resistance = this.resistanceAt(this._loading);
        const pressureDrop = resistance * flow * flow;
        const captureRate = this._captureEfficiency * dust * flow;
        this.setField("flowM3ps", this._flow, flow, (n) => (this._flow = n));
        this.setField("resistance", this._resistance, resistance, (n) => (this._resistance = n));
        this.setField("pressureDropPa", this._pressureDrop, pressureDrop, (n) => (this._pressureDrop = n));
        this.setField("captureRateKgps", this._captureRate, captureRate, (n) => (this._captureRate = n));
        publishOutputs(this, session, { resistance, pressureDrop, loading: this._loading, clogging: this.clogging });
    }
}

export function createHabitatFilterNode(): HabitatFilterNode {
    return new HabitatFilterNode();
}
