/**
 * The node registry every twin of the demo is built and run against: the
 * substrate's plugins (`buildJobRegistry` of the factory library) plus the
 * repository's own plugin, `plugins/habitat`. One function, so the twin
 * slot's catalogue, the scripts that build documents and the tests all
 * see the same types; the factory's container (`spikypanda-job`) builds
 * its own registry and does not have the local plugin until it is told.
 */
import { loadFactory, type FactoryLibrary } from "./factory.js";
import { fromRoot } from "./paths.js";
import { registerHabitatNodes } from "../plugins/habitat/index.js";

export type Registry = ReturnType<FactoryLibrary["buildJobRegistry"]>;

/** The substrate's registry with the habitat plugin registered on it. */
export function buildRegistry(): Registry {
    const registry = loadFactory().buildJobRegistry();
    registerHabitatNodes(registry as never, (file) => fromRoot("plugins", "habitat", "docs", file));
    return registry;
}
