/**
 * `Physics.Habitat:scrubber`: the CO2 sink of a volume, in mass, with the
 * machine's own constants and nothing of the room's.
 *
 * Physical thesis (library `co2-scrubbers`): a fan draws the volume's air
 * through absorbent beds at a flow Q set by the command; a fraction eta of
 * the CO2 in that air stays in the beds. The flow follows the command with
 * a first-order lag (the datasheet's 3.33 min), the one integrated state:
 *
 *     d(flow)/dt = (flowAtFull * command - flow) / lag                     [m3/s]
 *     removal    = efficiency * flow * co2MassPerM3(ppm, P, T)              [kg/s]
 *     power      = supplyVolts * (interceptAmps + slopeAmps * command) * habitatScale   [W]
 *
 * where co2MassPerM3 is the CO2 in a cubic metre of the air drawn, from
 * the concentration the volume publishes (`ppm_CO2`) and its pressure and
 * temperature. The node publishes minus the removal on `co2Delta`, for
 * an atmosphere's `delta_CO2_<k>` input.
 *
 * This is the substrate's `Physics.LifeSupport:scrubber` written without a
 * volume folded into its rate: its constants are the datasheet's (a flow
 * in m3/s, an efficiency), the same wherever it is installed, so a
 * commissioning fits nothing here that the bench already measured, and a
 * twin of another room takes the node as it is.
 */
import { cloneable, editable, viewable, IntegrableRuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IDeclaresPorts, IIntegrable, IIntegrationInputs, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";
import { co2MassPerM3, numberOr, publishOutputs, readInputs } from "./signals.js";

export class HabitatScrubberNode extends IntegrableRuntimeNode implements IDeclaresPorts, IIntegrable {
    public readonly stateSize = 1;
    public readonly stateNames: ReadonlyArray<string> = ["flowM3ps"];

    @cloneable private _flowAtFull: number = 0.055;
    @cloneable private _efficiency: number = 0.3;
    @cloneable private _lagMinutes: number = 3.33;
    @cloneable private _initialFlow: number = 0;
    @cloneable private _supplyVolts: number = 6;
    @cloneable private _interceptAmps: number = 0.0879;
    @cloneable private _slopeAmps: number = 0.1611;
    @cloneable private _habitatScale: number = 300;
    @cloneable private _defaultPressurePa: number = 101325;
    @cloneable private _defaultTemperatureK: number = 295.15;

    @cloneable private _flow: number = 0;
    @cloneable private _command: number = 0;
    @cloneable private _removal: number = 0;
    @cloneable private _power: number = 0;
    @cloneable private _inletPpm: number = 0;

    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "command", optional: true, type: "float", kind: "signal" },
        { slot: "ppm", optional: true, type: "float", kind: "signal" },
        { slot: "pressure", optional: true, type: "float", kind: "signal" },
        { slot: "temperature", optional: true, type: "float", kind: "signal" },
    ];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = [
        { slot: "co2Delta", optional: false, type: "float", kind: "signal" },
        { slot: "flow", optional: false, type: "float", kind: "signal" },
        { slot: "effectiveFlow", optional: false, type: "float", kind: "signal" },
        { slot: "power", optional: false, type: "float", kind: "signal" },
    ];

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** The lag is minutes long; ten samples per time constant is plenty. */
    protected override computeRequiredHz(): number {
        return Math.max(0.01, 10 / Math.max(1, this._lagMinutes * 60));
    }

    /** Air flow through the beds at full command, m3/s (the datasheet's anemometer). */
    @editable("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } }) public get flowAtFullM3ps(): number {
        return this._flowAtFull;
    }
    public set flowAtFullM3ps(v: number) {
        this.setField("flowAtFullM3ps", this._flowAtFull, Math.max(0, v), (n) => (this._flowAtFull = n));
    }
    /** Single-pass removal efficiency, 0 to 1 (the datasheet's bench, at nominal bed temperature). */
    @editable("number") public get efficiency(): number {
        return this._efficiency;
    }
    public set efficiency(v: number) {
        this.setField("efficiency", this._efficiency, Math.max(0, Math.min(1, v)), (n) => (this._efficiency = n));
    }
    /** First-order response of the flow to a change of command, minutes. */
    @editable("number") public get lagTimeConstantMinutes(): number {
        return this._lagMinutes;
    }
    public set lagTimeConstantMinutes(v: number) {
        this.setField("lagTimeConstantMinutes", this._lagMinutes, Math.max(1e-3, v), (n) => (this._lagMinutes = n));
        this.notifyComputedRequiredHzMayHaveChanged();
    }
    /** Flow at reset, m3/s (0: the scrubber starts stopped). */
    @editable("number") public get initialFlowM3ps(): number {
        return this._initialFlow;
    }
    public set initialFlowM3ps(v: number) {
        this.setField("initialFlowM3ps", this._initialFlow, Math.max(0, v), (n) => (this._initialFlow = n));
    }
    @editable("number", { unit: { quantity: "Voltage", unit: "V" } }) public get supplyVolts(): number {
        return this._supplyVolts;
    }
    public set supplyVolts(v: number) {
        this.setField("supplyVolts", this._supplyVolts, Math.max(0, v), (n) => (this._supplyVolts = n));
    }
    @editable("number", { unit: { quantity: "Current", unit: "A" } }) public get interceptAmps(): number {
        return this._interceptAmps;
    }
    public set interceptAmps(v: number) {
        this.setField("interceptAmps", this._interceptAmps, v, (n) => (this._interceptAmps = n));
    }
    @editable("number", { unit: { quantity: "Current", unit: "A" } }) public get slopeAmps(): number {
        return this._slopeAmps;
    }
    public set slopeAmps(v: number) {
        this.setField("slopeAmps", this._slopeAmps, v, (n) => (this._slopeAmps = n));
    }
    /** The bench's motor scaled to the habitat's machine. */
    @editable("number") public get habitatScale(): number {
        return this._habitatScale;
    }
    public set habitatScale(v: number) {
        this.setField("habitatScale", this._habitatScale, Math.max(0, v), (n) => (this._habitatScale = n));
    }
    /** Pressure of the air drawn when no `pressure` signal is wired, Pa. */
    @editable("number") public get defaultPressurePa(): number {
        return this._defaultPressurePa;
    }
    public set defaultPressurePa(v: number) {
        this.setField("defaultPressurePa", this._defaultPressurePa, Math.max(0, v), (n) => (this._defaultPressurePa = n));
    }
    /** Temperature of the air drawn when no `temperature` signal is wired, K. */
    @editable("number") public get defaultTemperatureK(): number {
        return this._defaultTemperatureK;
    }
    public set defaultTemperatureK(v: number) {
        this.setField("defaultTemperatureK", this._defaultTemperatureK, Math.max(1, v), (n) => (this._defaultTemperatureK = n));
    }

    /** Air flow through the beds right now, m3/s. */
    @viewable("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } }) public get flowM3ps(): number {
        return this._flow;
    }
    /** Effective flow, the air cleaned per second: efficiency times the flow, m3/s. */
    @viewable("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } }) public get effectiveFlowM3ps(): number {
        return this._efficiency * this._flow;
    }
    /** CO2 removed on the last tick, kg/s (positive). */
    @viewable("number") public get removalKgps(): number {
        return this._removal;
    }
    /** Electrical power drawn on the last tick, W. */
    @viewable("number", { unit: { quantity: "Power", unit: "watt" } }) public get power(): number {
        return this._power;
    }
    /** The command read on the last tick, 0 to 1. */
    @viewable("number") public get command(): number {
        return this._command;
    }
    /** The studio's live binder writes a connected source's value here when the cable is drawn; the tick reads the wire itself. */
    public set command(v: number) {
        const n = Number(v);
        if (Number.isFinite(n)) this._command = Math.max(0, Math.min(1, n));
    }
    /** The concentration of the air drawn on the last tick, ppm. */
    @viewable("number") public get inletPpm(): number {
        return this._inletPpm;
    }

    public powerAt(command: number): number {
        const u = Math.max(0, Math.min(1, command));
        return this._supplyVolts * (this._interceptAmps + this._slopeAmps * u) * this._habitatScale;
    }

    public gatherState(y: Float64Array, offset: number): void {
        y[offset] = this._flow;
    }

    public writeState(y: Float64Array, offset: number): void {
        this.setField("flowM3ps", this._flow, Math.max(0, y[offset]), (n) => (this._flow = n));
    }

    public rhs(_t: number, y: Float64Array, offset: number, inputs: IIntegrationInputs, dydt: Float64Array): void {
        const flow = y[offset];
        const command = Math.max(0, Math.min(1, inputs.get("command") ?? 0));
        dydt[offset] = (this._flowAtFull * command - flow) / (this._lagMinutes * 60);
    }

    public override reset(session: ISession): void {
        super.reset(session);
        this.setField("flowM3ps", this._flow, this._initialFlow, (n) => (this._flow = n));
        this._command = 0;
        this._removal = 0;
        this._power = 0;
        this._inletPpm = 0;
    }

    public override fire(session: ISession, _t: number): void {
        const inputs = readInputs(this, session);
        const command = Math.max(0, Math.min(1, numberOr(inputs.get("command"), 0)));
        const ppm = Math.max(0, numberOr(inputs.get("ppm"), 0));
        const pressure = numberOr(inputs.get("pressure"), this._defaultPressurePa);
        const temperature = numberOr(inputs.get("temperature"), this._defaultTemperatureK);
        const removal = this._efficiency * this._flow * co2MassPerM3(ppm, pressure, temperature);
        const power = this.powerAt(command);
        this.setField("command", this._command, command, (n) => (this._command = n));
        this.setField("inletPpm", this._inletPpm, ppm, (n) => (this._inletPpm = n));
        this.setField("removalKgps", this._removal, removal, (n) => (this._removal = n));
        this.setField("power", this._power, power, (n) => (this._power = n));
        publishOutputs(this, session, { co2Delta: -removal, flow: this._flow, effectiveFlow: this._efficiency * this._flow, power });
    }
}

export function createHabitatScrubberNode(): HabitatScrubberNode {
    return new HabitatScrubberNode();
}
