/**
 * What a studio extension of the demo does when the page URL names it
 * (`?ext=/agent/<name>.js`): it brings the domain in, in the order the
 * studio needs it: the harness plugin (the `Harness.*` node types, from
 * `@spiky-panda/plugin-harness`, served next to the extension), then the
 * loop's document, then the page itself, which reads the document the
 * studio just drew. The studio stays generic: it knows neither the plugin
 * nor the graph. Each extension (`tier3/browser/loader.ts`,
 * `factory-loader.ts`, `twin-loader.ts`) names its document and its page; `&graph=<url>`
 * opens another document (the studio's own `&doc=` is not used, because it
 * is read before any extension has loaded its plugin). The studio takes the
 * control room's skin (`room-skin.ts`) first, the same for every loop, before
 * the plugin and the document are fetched.
 */
import { applyRoomSkin, roomMonitor } from "./room-skin.js";
import type { StudioViewer } from "./studio-loop.js";

export interface LoaderStudio {
    loadPlugin(spec: { url: string; globalName: string; id?: string }): Promise<unknown>;
    openDocument(json: string): void;
    getViewer(): StudioViewer;
}

export interface LoopExtension {
    /** The studio plugin the graph needs, next to the extension file; none for a graph the studio's own plugins draw (the cabin's). */
    pluginUrl?: string;
    /** The global the plugin bundle publishes itself under, and its id in the studio; the harness plugin's when unsaid. */
    pluginGlobal?: string;
    pluginId?: string;
    /** The document the page runs on, when the URL names none. */
    defaultGraph: string;
    /** The page module, next to the extension file; none when the extension only opens the document to inspect it. */
    pageUrl?: string;
    /** What the page adds to the document before the studio draws it (the twin's tiles), in the browser only. */
    prepare?: (json: string) => string;
}

export async function loadLoopExtension(studio: LoaderStudio, { pluginUrl, pluginGlobal, pluginId, defaultGraph, pageUrl, prepare }: LoopExtension): Promise<void> {
    // The skin first: every loop page is the same studio page, and it wears the Control Board's skin before anything is fetched.
    applyRoomSkin(studio.getViewer());
    if (pluginUrl) await studio.loadPlugin({ url: pluginUrl, globalName: pluginGlobal ?? "SpkPluginHarness", id: pluginId ?? "harness" });
    const graphUrl = new URLSearchParams(location.search).get("graph") ?? defaultGraph;
    const res = await fetch(graphUrl);
    if (!res.ok) throw new Error(`could not open ${graphUrl}: HTTP ${res.status}`);
    const json = await res.text();
    studio.openDocument(prepare ? prepare(json) : json);
    roomMonitor(studio.getViewer());
    if (!pageUrl) return;
    const page = (await import(/* webpackIgnore: true */ pageUrl)) as { default: (studio: unknown) => Promise<void> };
    await page.default(studio);
}
