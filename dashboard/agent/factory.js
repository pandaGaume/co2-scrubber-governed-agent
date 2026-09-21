// harness/browser/loader.ts
async function loadLoopExtension(studio, { pluginUrl, defaultGraph, pageUrl }) {
  await studio.loadPlugin({ url: pluginUrl, globalName: "SpkPluginHarness", id: "harness" });
  const graphUrl = new URLSearchParams(location.search).get("graph") ?? defaultGraph;
  const res = await fetch(graphUrl);
  if (!res.ok) throw new Error(`could not open ${graphUrl}: HTTP ${res.status}`);
  studio.openDocument(await res.text());
  const page = await import(
    /* webpackIgnore: true */
    pageUrl
  );
  await page.default(studio);
}

// harness/browser/factory-loader.ts
function load(studio) {
  return loadLoopExtension(studio, {
    pluginUrl: new URL("./SpkPluginHarness.js", import.meta.url).href,
    defaultGraph: "/graphs/factory-agent.spikypanda",
    pageUrl: new URL("./factory-page.js", import.meta.url).href
  });
}
export {
  load as default
};
//# sourceMappingURL=factory.js.map
