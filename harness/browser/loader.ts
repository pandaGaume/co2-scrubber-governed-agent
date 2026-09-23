/**
 * What a studio extension of the demo does when the page URL names it
 * (`?ext=/agent/<name>.js`): it brings the domain in, in the order the
 * studio needs it: the harness plugin (the `Harness.*` node types, from
 * `@spiky-panda/plugin-harness`, served next to the extension), then the
 * loop's document, then the page itself, which reads the document the
 * studio just drew. The studio stays generic: it knows neither the plugin
 * nor the graph. Each extension (`tier3/browser/loader.ts`,
 * `factory-loader.ts`) names its document and its page; `&graph=<url>`
 * opens another document (the studio's own `&doc=` is not used, because it
 * is read before any extension has loaded its plugin). Once the document is
 * drawn, the studio takes the control room's skin (`room-skin.ts`), the same
 * for every loop.
 */
import { applyRoomSkin } from "./room-skin.js";
import type { StudioViewer } from "./studio-loop.js";

export interface LoaderStudio {
    loadPlugin(spec: { url: string; globalName: string; id?: string }): Promise<unknown>;
    openDocument(json: string): void;
    getViewer(): StudioViewer;
}

export interface LoopExtension {
    /** The harness studio plugin, next to the extension file. */
    pluginUrl: string;
    /** The document the page runs on, when the URL names none. */
    defaultGraph: string;
    /** The page module, next to the extension file. */
    pageUrl: string;
}

export async function loadLoopExtension(studio: LoaderStudio, { pluginUrl, defaultGraph, pageUrl }: LoopExtension): Promise<void> {
    await studio.loadPlugin({ url: pluginUrl, globalName: "SpkPluginHarness", id: "harness" });
    const graphUrl = new URLSearchParams(location.search).get("graph") ?? defaultGraph;
    const res = await fetch(graphUrl);
    if (!res.ok) throw new Error(`could not open ${graphUrl}: HTTP ${res.status}`);
    studio.openDocument(await res.text());
    // Every loop page is the same studio page: it wears the Control Board's skin here, once, whichever loop it opens.
    applyRoomSkin(studio.getViewer());
    const page = (await import(/* webpackIgnore: true */ pageUrl)) as { default: (studio: unknown) => Promise<void> };
    await page.default(studio);
}
