/**
 * `Physics.Habitat:duct` and `Physics.Habitat:hatch`: the air exchanged between
 * two volumes, as the CO2 it carries.
 *
 * Physical thesis (library `co2-mass-balance`, two volumes): a ventilation
 * that takes a flow Q from volume A to volume B and returns the same flow
 * moves no net air, but it moves CO2 from the richer side to the poorer:
 *
 *     flux     = Q * (co2MassPerM3(ppmA) - co2MassPerM3(ppmB))        [kg/s], positive from A to B
 *     co2DeltaA = -flux        co2DeltaB = +flux
 *
 * with the CO2 per cubic metre from the concentration each side publishes
 * and the shared pressure and temperature. The two deltas go into the two
 * atmospheres' `delta_CO2_<k>` inputs; what leaves one enters the other,
 * so the CO2 of the two volumes together changes only by the crew and the
 * scrubber. This is the substrate's atmosphere gate written for a closed
 * loop (its `hvac_forced` mode moves air one way) and driven by a signal,
 * so a fan's delivered flow sets it: a fouled filter shows here as less
 * exchange.
 *
 * The duct takes the flow from its `flow` input (a fan). The hatch is the
 * same exchange through an opening: `open` (0 or 1, a signal) selects an
 * exchange flow through the open hatchway, else the leak of the closed
 * one, both editables; it needs no fan.
 *
 * Only CO2 is exchanged: the other species are the same on both sides of
 * a habitat at one pressure, and the CO2 is a thousandth of the air, so
 * the mass the exchange moves does not change either side's pressure.
 */
import { cloneable, editable, viewable, RuntimeNode } from "@spiky-panda/core";
import type { ICartesian, IDeclaresPorts, IOlink, IPortDescriptor, ISession, Nullable } from "@spiky-panda/core";
import { co2MassPerM3, numberOr, publishOutputs, readInputs } from "./signals.js";

const EXCHANGE_INPUTS: ReadonlyArray<IPortDescriptor> = [
    { slot: "ppmA", optional: true, type: "float", kind: "signal" },
    { slot: "ppmB", optional: true, type: "float", kind: "signal" },
    { slot: "pressure", optional: true, type: "float", kind: "signal" },
    { slot: "temperature", optional: true, type: "float", kind: "signal" },
];
const EXCHANGE_OUTPUTS: ReadonlyArray<IPortDescriptor> = [
    { slot: "co2DeltaA", optional: false, type: "float", kind: "signal" },
    { slot: "co2DeltaB", optional: false, type: "float", kind: "signal" },
    { slot: "exchangeFlow", optional: false, type: "float", kind: "signal" },
];

export class HabitatDuctNode extends RuntimeNode implements IDeclaresPorts {
    @cloneable private _defaultPressurePa: number = 101325;
    @cloneable private _defaultTemperatureK: number = 295.15;
    @cloneable private _exchangeFlow: number = 0;
    @cloneable private _flux: number = 0;

    public readonly inputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "flow", optional: true, type: "float", kind: "signal" }, ...EXCHANGE_INPUTS];
    public readonly outputPorts: ReadonlyArray<IPortDescriptor> = EXCHANGE_OUTPUTS;

    public constructor(onsc: Nullable<IOlink[]> = null, opsc: Nullable<IOlink[]> = null, position?: ICartesian) {
        super(onsc, opsc, position);
    }

    /** Pressure of the exchanged air when no `pressure` signal is wired, Pa. */
    @editable("number") public get defaultPressurePa(): number {
        return this._defaultPressurePa;
    }
    public set defaultPressurePa(v: number) {
        this.setField("defaultPressurePa", this._defaultPressurePa, Math.max(0, v), (n) => (this._defaultPressurePa = n));
    }
    /** Temperature of the exchanged air when no `temperature` signal is wired, K. */
    @editable("number") public get defaultTemperatureK(): number {
        return this._defaultTemperatureK;
    }
    public set defaultTemperatureK(v: number) {
        this.setField("defaultTemperatureK", this._defaultTemperatureK, Math.max(1, v), (n) => (this._defaultTemperatureK = n));
    }

    /** The air exchanged on the last tick, m3/s each way. */
    @viewable("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } }) public get exchangeFlowM3ps(): number {
        return this._exchangeFlow;
    }
    /** The CO2 carried from A to B on the last tick, kg/s (negative: from B to A). */
    @viewable("number") public get co2FluxKgps(): number {
        return this._flux;
    }

    /** The exchange flow this tick, m3/s: the duct reads its `flow` input. */
    protected exchangeFlowOf(inputs: Map<string, unknown>): number {
        return Math.max(0, numberOr(inputs.get("flow"), 0));
    }

    public override reset(_session: ISession): void {
        this._exchangeFlow = 0;
        this._flux = 0;
    }

    public override fire(session: ISession, _t: number): void {
        const inputs = readInputs(this, session);
        const flow = this.exchangeFlowOf(inputs);
        const pressure = numberOr(inputs.get("pressure"), this._defaultPressurePa);
        const temperature = numberOr(inputs.get("temperature"), this._defaultTemperatureK);
        const a = co2MassPerM3(numberOr(inputs.get("ppmA"), 0), pressure, temperature);
        const b = co2MassPerM3(numberOr(inputs.get("ppmB"), 0), pressure, temperature);
        const flux = flow * (a - b);
        this.setField("exchangeFlowM3ps", this._exchangeFlow, flow, (n) => (this._exchangeFlow = n));
        this.setField("co2FluxKgps", this._flux, flux, (n) => (this._flux = n));
        publishOutputs(this, session, { co2DeltaA: -flux, co2DeltaB: flux, exchangeFlow: flow });
    }
}

export class HabitatHatchNode extends HabitatDuctNode {
    @cloneable private _openExchangeM3ps: number = 0.066;
    @cloneable private _closedLeakM3ps: number = 0;
    @cloneable private _open: boolean = false;

    public override readonly inputPorts: ReadonlyArray<IPortDescriptor> = [{ slot: "open", optional: true, type: "float", kind: "signal" }, ...EXCHANGE_INPUTS];

    /** Air exchanged through the open hatchway, m3/s each way (an inter-module ventilation's order, 140 cfm on the ISS). */
    @editable("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } }) public get openExchangeM3ps(): number {
        return this._openExchangeM3ps;
    }
    public set openExchangeM3ps(v: number) {
        this.setField("openExchangeM3ps", this._openExchangeM3ps, Math.max(0, v), (n) => (this._openExchangeM3ps = n));
    }
    /** Air exchanged through the closed hatch, m3/s: its seals' leak, 0 when nothing is known. */
    @editable("number", { unit: { quantity: "VolumetricFlow", unit: "m3ps" } }) public get closedLeakM3ps(): number {
        return this._closedLeakM3ps;
    }
    public set closedLeakM3ps(v: number) {
        this.setField("closedLeakM3ps", this._closedLeakM3ps, Math.max(0, v), (n) => (this._closedLeakM3ps = n));
    }
    /** The hatch's state when no `open` signal is wired. */
    @editable("boolean") public get open(): boolean {
        return this._open;
    }
    public set open(v: boolean) {
        this.setField("open", this._open, Boolean(v), (n) => (this._open = n));
    }

    protected override exchangeFlowOf(inputs: Map<string, unknown>): number {
        const open = inputs.has("open") ? numberOr(inputs.get("open"), 0) > 0.5 : this._open;
        return open ? this._openExchangeM3ps : this._closedLeakM3ps;
    }
}

export function createHabitatDuctNode(): HabitatDuctNode {
    return new HabitatDuctNode();
}

export function createHabitatHatchNode(): HabitatHatchNode {
    return new HabitatHatchNode();
}
