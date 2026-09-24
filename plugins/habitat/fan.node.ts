/**
 * `Physics.Habitat:fan`: a ventilation fan on a duct, from a command to a flow.
 *
 * Physical thesis: a fan at a speed ratio s (0 to 1 of its rated speed)
 * gives a pressure that falls with the flow, from its shutoff pressure to
 * its free delivery, both scaling with the fan laws (pressure with s^2,
 * flow with s); the duct and the filter downstream take a pressure that
 * rises with the square of the flow. The fan settles where the two meet:
 *
 *     fan      dp = k * s^2 * (1 - (Q / (Qfree * s))^2)      k = capacityFactor * shutoffPressure
 *     system   dp = R * Q^2                                   R = ductResistance + resistance (the filter's, wired)
 *     so       Q  = s * sqrt(k / (R + k / Qfree^2))          [m3/s]
 *
 * With a clean filter Q is the design flow; as the filter loads, R grows
 * and Q falls at the same command: that is how a fouled filter shows in a
 * commissioning, as a delivered flow below the design's. The speed
 * follows the command with a short first-order spin-up, the one
 * integrated state. Power is the air power over the fan's efficiency plus
 * a standby draw. A `capacityFactor` below one is a degraded fan (a
 * slipping belt, fouled blades): the same curve, lower.
 *
 * Later, a motor node will drive `speedRatio` from its shaft speed instead
 * of the command; the operating point is the same computation.
 */
import { cloneable, editable, viewable, IntegrableRuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IDeclaresPorts, IIntegrable, IIntegrationInputs, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";
import { numberOr, publishOutputs, readInputs } from "./signals.js";

export class HabitatFanNode extends IntegrableRuntimeNode implements IDeclaresPorts, IIntegrable {
    public readonly stateSize = 1;
    public readonly stateNames: ReadonlyArray<string> = ["speedRatio"];

    @cloneable private _shutoffPressurePa: number = 250;
    @cloneable private _freeDeliveryM3ps: number = 0.09;
    @cloneable private _ductResistance: number = 20000;
    @cloneable private _spinUpSeconds: number = 5;
    @cloneable private _fanEfficiency: number = 0.5;
    @cloneable private _standbyPowerW: number = 2;
    @cloneable private _capacityFactor: number = 1;
    @cloneable private _initialSpeedRatio: number = 0;

    @cloneable private _speed: number = 0;
    @cloneable private _flow: number = 0;
    @cloneable private _pressureRise: number = 0;
    @cloneable private _power: number = 0;
    @cloneable private _command: number = 0;
    @cloneable private _systemResistance: number = 0;

    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "command", optional: true, type: "float", kind: "signal" },
        { slot: "resistance", optional: true, type: "float", kind: "signal" },
    ];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "flow", optional: false, type: "float", kind: "signal" },
        { slot: "pressureRise", optional: false, type: "float", kind: "signal" },
        { slot: "power", optional: false, type: "float", kind: "signal" },
        { slot: "speedRatio", optional: false, type: "float", kind: "signal" },
    ];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    protected override computeRequiredHz(): number {
        return Math.max(0.01, 10 / Math.max(1, this._spinUpSeconds));
    }

    /** Pressure at zero flow and full speed, Pa (the fan curve's left end). */
    @editable("number") public get shutoffPressurePa(): number {
        return this._shutoffPressurePa;
    }
    public set shutoffPressurePa(v: number) {
        this.setField("shutoffPressurePa", this._shutoffPressurePa, Math.max(0, v), (n) => (this._shutoffPressurePa = n));
    }
    /** Flow at zero pressure and full speed, m3/s (the curve's right end). */
    @editable("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } }) public get freeDeliveryM3ps(): number {
        return this._freeDeliveryM3ps;
    }
    public set freeDeliveryM3ps(v: number) {
        this.setField("freeDeliveryM3ps", this._freeDeliveryM3ps, Math.max(1e-9, v), (n) => (this._freeDeliveryM3ps = n));
    }
    /** The duct's own resistance, Pa per (m3/s)^2, without the filter. */
    @editable("number") public get ductResistance(): number {
        return this._ductResistance;
    }
    public set ductResistance(v: number) {
        this.setField("ductResistance", this._ductResistance, Math.max(0, v), (n) => (this._ductResistance = n));
    }
    /** Time constant of the speed's response to the command, seconds. */
    @editable("number") public get spinUpSeconds(): number {
        return this._spinUpSeconds;
    }
    public set spinUpSeconds(v: number) {
        this.setField("spinUpSeconds", this._spinUpSeconds, Math.max(1e-3, v), (n) => (this._spinUpSeconds = n));
        this.notifyComputedRequiredHzMayHaveChanged();
    }
    /** Air power over electrical power, 0 to 1. */
    @editable("number") public get fanEfficiency(): number {
        return this._fanEfficiency;
    }
    public set fanEfficiency(v: number) {
        this.setField("fanEfficiency", this._fanEfficiency, Math.max(0.01, Math.min(1, v)), (n) => (this._fanEfficiency = n));
    }
    /** Power drawn with the fan stopped, W (electronics). */
    @editable("number", { unit: { quantity: "Power", unit: "watt" } }) public get standbyPowerW(): number {
        return this._standbyPowerW;
    }
    public set standbyPowerW(v: number) {
        this.setField("standbyPowerW", this._standbyPowerW, Math.max(0, v), (n) => (this._standbyPowerW = n));
    }
    /** 1 for a healthy fan; below 1 the whole pressure curve is lower (a fault). */
    @editable("number") public get capacityFactor(): number {
        return this._capacityFactor;
    }
    public set capacityFactor(v: number) {
        this.setField("capacityFactor", this._capacityFactor, Math.max(0, Math.min(1, v)), (n) => (this._capacityFactor = n));
    }
    /** Speed ratio at reset (1: already at the command's full speed). */
    @editable("number") public get initialSpeedRatio(): number {
        return this._initialSpeedRatio;
    }
    public set initialSpeedRatio(v: number) {
        this.setField("initialSpeedRatio", this._initialSpeedRatio, Math.max(0, Math.min(1, v)), (n) => (this._initialSpeedRatio = n));
    }

    /** Delivered flow on the last tick, m3/s. */
    @viewable("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } }) public get flowM3ps(): number {
        return this._flow;
    }
    /** The same flow in cubic metres per minute, as the station documents it. */
    @viewable("number") public get flowM3PerMinute(): number {
        return this._flow * 60;
    }
    @viewable("number") public get pressureRisePa(): number {
        return this._pressureRise;
    }
    @viewable("number", { unit: { quantity: "Power", unit: "watt" } }) public get power(): number {
        return this._power;
    }
    @viewable("number") public get speedRatio(): number {
        return this._speed;
    }
    @viewable("number") public get command(): number {
        return this._command;
    }
    /** The resistance the fan worked against on the last tick, Pa per (m3/s)^2. */
    @viewable("number") public get systemResistance(): number {
        return this._systemResistance;
    }

    /** The operating point: the flow at a speed ratio against a system resistance, m3/s. */
    public flowAt(speedRatio: number, systemResistance: number): number {
        const s = Math.max(0, Math.min(1, speedRatio));
        const k = this._capacityFactor * this._shutoffPressurePa;
        if (k <= 0 || s <= 0) return 0;
        const denominator = Math.max(0, systemResistance) + k / (this._freeDeliveryM3ps * this._freeDeliveryM3ps);
        return s * Math.sqrt(k / denominator);
    }

    public gatherState(y: Float64Array, offset: number): void {
        y[offset] = this._speed;
    }

    public writeState(y: Float64Array, offset: number): void {
        this.setField("speedRatio", this._speed, Math.max(0, Math.min(1, y[offset])), (n) => (this._speed = n));
    }

    public rhs(_t: number, y: Float64Array, offset: number, inputs: IIntegrationInputs, dydt: Float64Array): void {
        const command = Math.max(0, Math.min(1, inputs.get("command") ?? 0));
        dydt[offset] = (command - y[offset]) / this._spinUpSeconds;
    }

    public override reset(session: ISession): void {
        super.reset(session);
        this.setField("speedRatio", this._speed, this._initialSpeedRatio, (n) => (this._speed = n));
        this._flow = 0;
        this._pressureRise = 0;
        this._power = 0;
        this._command = 0;
        this._systemResistance = 0;
    }

    public override fire(session: ISession, _t: number): void {
        const inputs = readInputs(this, session);
        const command = Math.max(0, Math.min(1, numberOr(inputs.get("command"), 0)));
        const resistance = this._ductResistance + Math.max(0, numberOr(inputs.get("resistance"), 0));
        const flow = this.flowAt(this._speed, resistance);
        const pressureRise = resistance * flow * flow;
        const power = this._standbyPowerW + (pressureRise * flow) / this._fanEfficiency;
        this.setField("command", this._command, command, (n) => (this._command = n));
        this.setField("systemResistance", this._systemResistance, resistance, (n) => (this._systemResistance = n));
        this.setField("flowM3ps", this._flow, flow, (n) => (this._flow = n));
        this.setField("pressureRisePa", this._pressureRise, pressureRise, (n) => (this._pressureRise = n));
        this.setField("power", this._power, power, (n) => (this._power = n));
        publishOutputs(this, session, { flow, pressureRise, power, speedRatio: this._speed });
    }
}

export function createHabitatFanNode(): HabitatFanNode {
    return new HabitatFanNode();
}
