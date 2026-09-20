/**
 * Builds the agent page under `dashboard/agent/`: three files the studio
 * fetches from the demo's own mount, none from the substrate checkout.
 *
 * - `tier3.js`, the extension the URL names (`?ext=/agent/tier3.js`), from
 *   `tier3/browser/loader.ts`: loads the plugin, opens the document, imports
 *   the page;
 * - `SpkPluginHarness.js`, the harness studio plugin, copied from
 *   `@spiky-panda/plugin-harness` (its `bundle/SpkPluginHarness.studio.js`);
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
    await build({
        entryPoints: [fromRoot("tier3", "browser", "loader.ts")],
        outfile: join(outDir, "tier3.js"),
        bundle: true,
        format: "esm",
        target: "es2022",
        sourcemap: true,
        logLevel: "warning",
    });
    // The plugin's package root, wherever npm put it (a tarball today).
    const pluginPackage = dirname(createRequire(import.meta.url).resolve("@spiky-panda/plugin-harness/package.json"));
    for (const suffix of ["", ".map"]) {
        await copyFile(join(pluginPackage, "bundle", PLUGIN_BUNDLE + suffix), join(outDir, "SpkPluginHarness.js" + suffix));
    }
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
    console.log(`${relativeToRoot(outDir)}: tier3.js, SpkPluginHarness.js (from @spiky-panda/plugin-harness), page.js built`);
}

if (isMain(import.meta.url)) {
    buildAgentPage().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
