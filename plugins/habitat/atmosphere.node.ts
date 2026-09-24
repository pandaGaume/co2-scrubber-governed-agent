/**
 * `Physics.Habitat:atmosphere`: the substrate's atmosphere (a per-species mass
 * inventory in a volume, ideal gas), with the CO2 wiring a habitat graph
 * needs declared as ports.
 *
 * The substrate's `Physics.Scene:atmosphere` already integrates the mass of
 * every species and sums whatever is published into slots named
 * `delta_<species>_<k>` (kg/s) into dm/dt; it publishes `ppm_<species>`,
 * `mass_<species>` and `partial_pressure_<species>` on links that carry
 * those slot names. But it declares none of them as ports (its species
 * schema is composition-driven, so it does not want phantom ports), and a
 * document built headless can only connect declared ports. This node is
 * that atmosphere with four CO2 sinks/sources declared (`delta_CO2_0` to
 * `delta_CO2_3`) and the CO2 observables declared, so a crew, a scrubber,
 * a duct and a hatch can be wired to it in a saved document.
 *
 * It adds one editable, the initial CO2 concentration in ppm: the base
 * seeds the masses from a preset (Earth air, 420 ppm); a habitat starts
 * where its sensor reads. Everything else (volume, temperature, the ideal
 * gas, the gate contract) is the substrate's, unchanged.
 *
 * Time base: the base asks for 100 Hz, a rate for fast chemistry; a
 * habitat's air moves in minutes and this node asks for one sample per
 * six seconds, like the substrate's cabin.
 */
import { cloneable, editable, viewable } from "@spiky-panda/core";
import type { IPortDescriptor, ISession } from "@spiky-panda/core";
import { AtmosphereNode } from "@spiky-panda/plugin-physics";
import { CO2_MOLAR_MASS, GAS_CONSTANT_R } from "./signals.js";

export const CO2_DELTA_SLOTS = ["delta_CO2_0", "delta_CO2_1", "delta_CO2_2", "delta_CO2_3"] as const;

export class HabitatAtmosphereNode extends AtmosphereNode {
    @cloneable private _initialCo2Ppm: number = 1500;

    protected override computeRequiredHz(): number {
        return 1 / 6;
    }

    protected override _buildInputPorts(): IPortDescriptor[] {
        return [...super._buildInputPorts(), ...CO2_DELTA_SLOTS.map((slot) => ({ slot, optional: true, type: "float", kind: "signal" as const }))];
    }

    protected override _buildOutputPorts(): IPortDescriptor[] {
        return [
            ...super._buildOutputPorts(),
            { slot: "ppm_CO2", optional: true, type: "float", kind: "signal" },
            { slot: "mass_CO2", optional: true, type: "float", kind: "signal" },
            { slot: "partial_pressure_CO2", optional: true, type: "float", kind: "signal" },
        ];
    }

    /** The CO2 concentration the volume starts at, in ppm (what its sensor read). */
    @editable("number", { unit: { quantity: "Concentration", unit: "ppm" } }) public get initialCo2Ppm(): number {
        return this._initialCo2Ppm;
    }
    public set initialCo2Ppm(v: number) {
        this.setField("initialCo2Ppm", this._initialCo2Ppm, Math.max(0, v), (n) => {
            this._initialCo2Ppm = n;
            this._seedCo2();
        });
    }

    /** The CO2 concentration right now, in ppm (mole fraction times a million). */
    @viewable("number", { unit: { quantity: "Concentration", unit: "ppm" } }) public get co2Ppm(): number {
        return this.getMoleFraction("CO2") * 1e6;
    }

    /** The mass of CO2 in the volume right now, kg. */
    @viewable("number") public get co2MassKg(): number {
        return this.getMassKg("CO2");
    }

    public override reset(session: ISession): void {
        super.reset(session);
        this._seedCo2();
    }

    /**
     * Set the CO2 mass so that its mole fraction is the initial ppm, the
     * other species untouched: n_CO2 = x / (1 - x) times the moles of the
     * rest. Called after the base seeded every species from its preset,
     * and whenever the initial ppm is edited. During the base constructor
     * this class's fields do not exist yet, and nothing is seeded.
     */
    private _seedCo2(): void {
        const ppm = this._initialCo2Ppm;
        if (typeof ppm !== "number" || !Number.isFinite(ppm) || ppm < 0) return;
        const T = this.temperatureK;
        const V = this.volume;
        if (!(T > 0) || !(V > 0)) return;
        const nTotal = (this.pressurePa * V) / (GAS_CONSTANT_R * T);
        const nOld = this.getMassKg("CO2") / CO2_MOLAR_MASS;
        const nOthers = Math.max(0, nTotal - nOld);
        const x = Math.min(0.999, ppm * 1e-6);
        const nNew = (x / (1 - x)) * nOthers;
        this.applyMassDelta("CO2", (nNew - nOld) * CO2_MOLAR_MASS);
    }
}

export function createHabitatAtmosphereNode(): HabitatAtmosphereNode {
    return new HabitatAtmosphereNode();
}
