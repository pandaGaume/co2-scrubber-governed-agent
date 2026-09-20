// tier3/browser/loader.ts
var PLUGIN_URL = new URL("./SpkPluginHarness.js", import.meta.url).href;
var PAGE_URL = new URL("./page.js", import.meta.url).href;
var DEFAULT_GRAPH = "/graphs/tier3-agent.spikypanda";
async function load(studio) {
  await studio.loadPlugin({ url: PLUGIN_URL, globalName: "SpkPluginHarness", id: "harness" });
  const graphUrl = new URLSearchParams(location.search).get("graph") ?? DEFAULT_GRAPH;
  const res = await fetch(graphUrl);
  if (!res.ok) throw new Error(`could not open ${graphUrl}: HTTP ${res.status}`);
  studio.openDocument(await res.text());
  const page = await import(
    /* webpackIgnore: true */
    PAGE_URL
  );
  await page.default(studio);
}
export {
  load as default
};
//# sourceMappingURL=tier3.js.map
