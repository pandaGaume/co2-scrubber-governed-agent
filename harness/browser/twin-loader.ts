/**
 * The twin's studio extension (`?mcp=0&ext=/agent/twin.js`): the cabin's
 * document (`graphs/cabin.spikypanda`, drawn by the studio's own Physics,
 * Logic and Control plugins: no plugin to load), with the twin's dashboard
 * tiles added to it (`twin-plots.ts`), then the twin's page (`twin-page.js`).
 * The mechanism is `loader.ts`; this file only names the files.
 */
import { loadLoopExtension, type LoaderStudio } from "./loader.js";
import { withTwinTiles } from "./twin-plots.js";

export default function load(studio: LoaderStudio): Promise<void> {
    return loadLoopExtension(studio, {
        defaultGraph: "/graphs/cabin.spikypanda",
        pageUrl: new URL("./twin-page.js", import.meta.url).href,
        prepare: withTwinTiles,
    });
}
