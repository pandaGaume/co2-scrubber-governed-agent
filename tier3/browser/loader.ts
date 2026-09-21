/**
 * The agent's studio extension (`?mcp=0&ext=/agent/tier3.js`): the harness
 * plugin, the agent's document (`graphs/tier3-agent.spikypanda`), then the
 * agent's page (`page.js`, from `agent-page.ts`). The mechanism is
 * `harness/browser/loader.ts`; this file only names the files.
 */
import { loadLoopExtension, type LoaderStudio } from "../../harness/browser/loader.js";

export default function load(studio: LoaderStudio): Promise<void> {
    return loadLoopExtension(studio, {
        pluginUrl: new URL("./SpkPluginHarness.js", import.meta.url).href,
        defaultGraph: "/graphs/tier3-agent.spikypanda",
        pageUrl: new URL("./page.js", import.meta.url).href,
    });
}
