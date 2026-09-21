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
import { build } from "esbuild";
import { copyFile } from "node:fs/promises";
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
            {
                name: "studio-globals",
                setup(b) {
                    b.onResolve({ filter: /^@spiky-panda\/core$/ }, () => ({ path: "core", namespace: "studio" }));
                    b.onResolve({ filter: /^@spiky-panda\/harness$/ }, () => ({ path: "harness", namespace: "studio" }));
                    b.onLoad({ filter: /^core$/, namespace: "studio" }, () => ({
                        contents: 'if (!globalThis.SpikypandaCore) throw new Error("the studio did not load spikypanda-core.js"); module.exports = globalThis.SpikypandaCore;',
                        loader: "js",
                    }));
                    b.onLoad({ filter: /^harness$/, namespace: "studio" }, () => ({
                        contents: 'if (!globalThis.SpkPluginHarness?.harness) throw new Error("the studio did not load SpkPluginHarness.js"); module.exports = globalThis.SpkPluginHarness.harness;',
                        loader: "js",
                    }));
                },
            },
        ],
    });
    console.log(`${relativeToRoot(outDir)}: tier3.js, SpkPluginHarness.js (from @spiky-panda/plugin-harness), page.js, audio-output.js built`);
}

if (isMain(import.meta.url)) {
    buildAgentPage().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
