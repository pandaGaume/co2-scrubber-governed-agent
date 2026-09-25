/**
 * Builds the loop pages under `dashboard/agent/`: the files the studio
 * fetches from the demo's own mount, none from the substrate checkout.
 *
 * - `tier3.js`, the agent's extension (`?ext=/agent/tier3.js`), from
 *   `tier3/browser/loader.ts`: loads the plugin, opens the document, imports
 *   the page; `factory.js`, the factory's (`?ext=/agent/factory.js`), from
 *   `harness/browser/factory-loader.ts`, the same way;
 * - `factory-page.js`, the factory's page (`harness/browser/factory-page.ts`):
 *   it runs nothing, it reads the factory's tasks and replays their steps;
 * - `factory-voice.js`, the words about a factory task for the Control Board
 *   (`harness/browser/factory-voice.ts`; the sentences themselves are in
 *   `dashboard/words/factory/<locale>.json`);
 * - `twin.js` and `twin-page.js`, the twin's extension and page
 *   (`harness/browser/twin-loader.ts`, `twin-page.ts`): the cabin's graph,
 *   and the twin's answers replayed on it;
 * - `habitat.js`, the habitat reference's extension (`?ext=/agent/habitat.js`,
 *   `harness/browser/habitat-loader.ts`): the habitat plugin, then the
 *   reference graph, to inspect; `SpkPluginHabitat.js`, that plugin for the
 *   studio (`plugins/habitat/studio.ts`, the studio's core as its core),
 *   with the nodes' cards under `habitat-docs/`;
 * - `pushes.js`, what a slot pushes to a page (`harness/browser/pushes.ts`),
 *   for the control room;
 * - `SpkPluginHarness.js`, the harness studio plugin, copied from
 *   `@spiky-panda/plugin-harness` (its `bundle/SpkPluginHarness.studio.js`);
 * - `audio-output.js`, the audio output alone, for the Control Board;
 * - `page.js`, the page itself, from `tier3/browser/agent-page.ts` and the
 *   same Tier 3 modules the Node runner uses. Two packages are not bundled
 *   into it but taken from the page that loads it: `@spiky-panda/core` is
 *   `globalThis.SpikypandaCore` (the studio's), and `@spiky-panda/harness`
 *   is `globalThis.SpkPluginHarness.harness`, the copy the plugin brought
 *   with its nodes. The nodes the studio instantiated and the runtime that
 *   executes them must be one harness.
 *
 *     node dist/scripts/build-agent-page.js
 */
import { build, type Plugin } from "esbuild";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fromRoot, isMain, relativeToRoot } from "../lib/paths.js";

const PLUGIN_BUNDLE = "SpkPluginHarness.studio.js";

export async function buildAgentPage(outDir = fromRoot("dashboard", "agent")): Promise<void> {
    for (const [entry, out] of [
        [fromRoot("tier3", "browser", "loader.ts"), "tier3.js"],
        [fromRoot("harness", "browser", "factory-loader.ts"), "factory.js"],
        [fromRoot("harness", "browser", "factory-voice.ts"), "factory-voice.js"],
        [fromRoot("harness", "browser", "factory-page.ts"), "factory-page.js"],
        [fromRoot("harness", "browser", "twin-loader.ts"), "twin.js"],
        [fromRoot("harness", "browser", "twin-page.ts"), "twin-page.js"],
        [fromRoot("harness", "browser", "habitat-loader.ts"), "habitat.js"],
        // What a slot pushes, alone, for the control room (plain JS): the same code as the studio pages'.
        [fromRoot("harness", "browser", "pushes.ts"), "pushes.js"],
    ] as const) {
        await build({
            entryPoints: [entry],
            outfile: join(outDir, out),
            bundle: true,
            format: "esm",
            target: "es2022",
            sourcemap: true,
            logLevel: "warning",
        });
    }
    // The habitat plugin for the studio: a global the studio's plugin loader reads, on the studio's core.
    await build({
        entryPoints: [fromRoot("plugins", "habitat", "studio.ts")],
        outfile: join(outDir, "SpkPluginHabitat.js"),
        bundle: true,
        format: "iife",
        globalName: "SpkPluginHabitat",
        target: "es2022",
        sourcemap: true,
        logLevel: "warning",
        plugins: [studioCore()],
    });
    const cards = fromRoot("plugins", "habitat", "docs");
    await mkdir(join(outDir, "habitat-docs"), { recursive: true });
    for (const file of await readdir(cards)) if (file.endsWith(".md")) await copyFile(join(cards, file), join(outDir, "habitat-docs", file));
    // The plugin's package root, wherever npm put it (a tarball today).
    const pluginPackage = dirname(createRequire(import.meta.url).resolve("@spiky-panda/plugin-harness/package.json"));
    for (const suffix of ["", ".map"]) {
        await copyFile(join(pluginPackage, "bundle", PLUGIN_BUNDLE + suffix), join(outDir, "SpkPluginHarness.js" + suffix));
    }
    // The audio output alone, for the Control Board (plain JS, its own broker client): the same code as the studio page's.
    await build({
        entryPoints: [fromRoot("tier3", "browser", "audio-output.ts")],
        outfile: join(outDir, "audio-output.js"),
        bundle: true,
        format: "esm",
        target: "es2022",
        sourcemap: true,
        logLevel: "warning",
    });
    const outfile = join(outDir, "page.js");
    await build({
        entryPoints: [fromRoot("tier3", "browser", "agent-page.ts")],
        outfile,
        bundle: true,
        format: "esm",
        target: "es2022",
        sourcemap: true,
        logLevel: "warning",
        plugins: [
            studioCore(),
            {
                name: "studio-harness",
                setup(b) {
                    b.onResolve({ filter: /^@spiky-panda\/harness$/ }, () => ({ path: "harness", namespace: "studio" }));
                    b.onLoad({ filter: /^harness$/, namespace: "studio" }, () => ({
                        contents: 'if (!globalThis.SpkPluginHarness?.harness) throw new Error("the studio did not load SpkPluginHarness.js"); module.exports = globalThis.SpkPluginHarness.harness;',
                        loader: "js",
                    }));
                },
            },
        ],
    });
    console.log(`${relativeToRoot(outDir)}: tier3.js, SpkPluginHarness.js (from @spiky-panda/plugin-harness), habitat.js, SpkPluginHabitat.js, page.js, audio-output.js built`);
}

/** `@spiky-panda/core` is the studio's own copy (`globalThis.SpikypandaCore`), never bundled a second time. */
function studioCore(): Plugin {
    return {
        name: "studio-core",
        setup(b) {
            b.onResolve({ filter: /^@spiky-panda\/core$/ }, () => ({ path: "core", namespace: "studio" }));
            b.onLoad({ filter: /^core$/, namespace: "studio" }, () => ({
                contents: 'if (!globalThis.SpikypandaCore) throw new Error("the studio did not load spikypanda-core.js"); module.exports = globalThis.SpikypandaCore;',
                loader: "js",
            }));
        },
    };
}

if (isMain(import.meta.url)) {
    buildAgentPage().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
