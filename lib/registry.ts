/**
 * The node registry every twin of the demo is built and run against: the
 * substrate's plugins (`buildJobRegistry` of the factory library) plus the
 * repository's own plugin, `plugins/habitat`.
 *
 * One function, so the twin slot's catalogue, the scripts that build
 * documents and the tests all see the same types; the factory's container
 * (`spikypanda-job`) builds its own registry and does not have the local
 * plugin until it is told.
 *
 * Until 25 September 2026 this file also re-registered the substrate's
 * atmosphere with its CO2 ports declared, because the substrate left them
 * runtime-only and a document could not wire them. The substrate declares
 * them since `@spiky-panda/plugin-physics` 0.1.2 (`delta_<species>_<k>`
 * inputs, `ppm_<species>`, `mass_<species>` and `partial_pressure_<species>`
 * outputs for its five species), so nothing is added here any more.
 */
import { loadFactory, type FactoryLibrary } from "./factory.js";
import { fromRoot } from "./paths.js";
import { registerHabitatNodes } from "../plugins/habitat/index.js";

export type Registry = ReturnType<FactoryLibrary["buildJobRegistry"]>;

export const ATMOSPHERE_TYPE = "Physics.Scene:atmosphere";
/** The CO2 inputs of an atmosphere this demo wires: a source positive, a sink negative, all summed by the node's own rhs. The substrate declares `delta_CO2_0` as a port and the rest as a variadic pool (`delta_CO2_<k>`), which the document builder appends as they are wired. */
export const ATMOSPHERE_CO2_INPUTS = ["delta_CO2_0", "delta_CO2_1", "delta_CO2_2", "delta_CO2_3"] as const;
/** The CO2 observables the atmosphere publishes. */
export const ATMOSPHERE_CO2_OUTPUTS = ["ppm_CO2", "mass_CO2", "partial_pressure_CO2"] as const;

/** The substrate's registry with the habitat plugin registered on it. */
export function buildRegistry(): Registry {
    const registry = loadFactory().buildJobRegistry();
    registerHabitatNodes(registry as never, (file) => fromRoot("plugins", "habitat", "docs", file));
    return registry;
}
