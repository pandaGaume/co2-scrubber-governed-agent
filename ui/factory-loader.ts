/**
 * The factory's studio extension (`?mcp=0&ext=/agent/factory.js`): the
 * harness plugin, the factory's document (`graphs/factory-agent.spikypanda`,
 * the same twelve stages), then the factory's page (`factory-page.js`). The
 * mechanism is `loader.ts`; this file only names the files.
 */
import { loadLoopExtension, type LoaderStudio } from "./loader.js";

export default function load(studio: LoaderStudio): Promise<void> {
    return loadLoopExtension(studio, {
        pluginUrl: new URL("./SpkPluginHarness.js", import.meta.url).href,
        defaultGraph: "/graphs/factory-agent.spikypanda",
        pageUrl: new URL("./factory-page.js", import.meta.url).href,
    });
}
