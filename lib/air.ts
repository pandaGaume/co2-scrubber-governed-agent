/**
 * The air of a volume as the substrate's atmosphere seeds it: the initial
 * mass of each species from a composition preset of the core, the CO2
 * replaced by what a sensor read. Shared by the habitat reference
 * (`lib/habitat.ts`) and the graph factory's parametric candidates
 * (`harness/topics/graph/params.ts`, the `$initialMasses` form), so the
 * two seed a volume the same way.
 */
import { ATMOSPHERE_PRESETS, CHEMICAL_SPECIES_V1, GAS_CONSTANT_R, V1_SPECIES_ORDER } from "@spiky-panda/core";

export const DEFAULT_AIR_PRESET = "earthHumidAirSeaLevel";
export const SEA_LEVEL_PA = 101325;

/**
 * The initial mass of each species of a volume of air, kg, in the
 * atmosphere's own species order: the core's composition preset with one
 * species' mole fraction replaced by what a sensor read (a fraction, 0 to 1),
 * the other fractions scaled so the whole still sums to one, the ideal gas
 * for the moles. This is what the
 * atmosphere derives itself from a bound composition at reset; written
 * into the document (`_initialMassKg`) it holds in every path, the studio's
 * binding included.
 */
export function initialMassesKg(species: string, fraction: number, volumeM3: number, temperatureK: number, preset = DEFAULT_AIR_PRESET, pressurePa = SEA_LEVEL_PA): number[] {
    const presets = ATMOSPHERE_PRESETS as Record<string, { moleFractions: Record<string, number> }>;
    if (!presets[preset]) throw new Error(`no atmosphere preset "${preset}" (${Object.keys(presets).join(", ")})`);
    const fractions = { ...presets[preset].moleFractions } as Record<string, number>;
    if (!(V1_SPECIES_ORDER as ReadonlyArray<string>).includes(species)) throw new Error(`no species "${species}" in the atmosphere (${(V1_SPECIES_ORDER as ReadonlyArray<string>).join(", ")})`);
    const read = Math.min(1, Math.max(0, fraction));
    const others = Object.entries(fractions).filter(([s]) => s !== species);
    const sum = others.reduce((a, [, x]) => a + x, 0);
    for (const [s, x] of others) fractions[s] = (x * (1 - read)) / sum;
    fractions[species] = read;
    const moles = (pressurePa * volumeM3) / (GAS_CONSTANT_R * temperatureK);
    return (V1_SPECIES_ORDER as ReadonlyArray<string>).map((s) => (fractions[s] ?? 0) * moles * (CHEMICAL_SPECIES_V1 as Record<string, { molarMass: number }>)[s].molarMass);
}
