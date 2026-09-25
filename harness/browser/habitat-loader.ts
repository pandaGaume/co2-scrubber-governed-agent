/**
 * The habitat reference in the studio (`?mcp=0&ext=/agent/habitat.js`):
 * the habitat plugin (`Physics.Habitat:*`, bundled next to this file as
 * `SpkPluginHabitat.js`), then `graphs/habitat.spikypanda`, to open and
 * inspect; no page runs on it. `&graph=<url>` opens another document
 * drawn with the same plugin.
 */
import { loadLoopExtension, type LoaderStudio } from "./loader.js";

export default function load(studio: LoaderStudio): Promise<void> {
    return loadLoopExtension(studio, {
        pluginUrl: new URL("./SpkPluginHabitat.js", import.meta.url).href,
        pluginGlobal: "SpkPluginHabitat",
        pluginId: "habitat",
        defaultGraph: "/graphs/habitat.spikypanda",
    });
}
