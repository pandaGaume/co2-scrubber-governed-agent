/**
 * The studio extension the page URL names (`?ext=/agent/tier3.js`). It brings
 * the domain in, in the order the studio needs it: the harness plugin (the
 * `Harness.*` node types, from `@spiky-panda/plugin-harness`, served next to
 * this file), then the agent's document, then the page itself (`page.js`),
 * which reads the document the studio just drew. The studio stays generic:
 * it knows neither the plugin nor the graph.
 *
 * URL: `?mcp=0&ext=/agent/tier3.js` (`&graph=<url>` to open another document;
 * the studio's own `&doc=` is not used here, because it is read before any
 * extension has loaded its plugin).
 */
export interface LoaderStudio {
    loadPlugin(spec: { url: string; globalName: string; id?: string }): Promise<unknown>;
    openDocument(json: string): void;
}

const PLUGIN_URL = new URL("./SpkPluginHarness.js", import.meta.url).href;
const PAGE_URL = new URL("./page.js", import.meta.url).href;
const DEFAULT_GRAPH = "/graphs/tier3-agent.spikypanda";

export default async function load(studio: LoaderStudio): Promise<void> {
    await studio.loadPlugin({ url: PLUGIN_URL, globalName: "SpkPluginHarness", id: "harness" });
    const graphUrl = new URLSearchParams(location.search).get("graph") ?? DEFAULT_GRAPH;
    const res = await fetch(graphUrl);
    if (!res.ok) throw new Error(`could not open ${graphUrl}: HTTP ${res.status}`);
    studio.openDocument(await res.text());
    const page = (await import(/* webpackIgnore: true */ PAGE_URL)) as { default: (studio: unknown) => Promise<void> };
    await page.default(studio);
}
