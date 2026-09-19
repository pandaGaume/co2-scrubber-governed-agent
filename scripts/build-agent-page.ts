/**
 * Bundles the studio extension, `dashboard/agent/tier3.js`, from
 * `tier3/browser/agent-page.ts` and the same Tier 3 modules the Node runner
 * uses. Two packages are not bundled but taken from the studio page that
 * loads the extension: `@spiky-panda/core` is `globalThis.SpikypandaCore`,
 * and `@spiky-panda/harness` is `globalThis.SpkPluginHarness.harness`, the
 * copy the harness plugin brought with its nodes. The nodes the studio
 * instantiated and the runtime that executes them must be one harness.
 *
 *     node dist/scripts/build-agent-page.js
 */
import { build } from "esbuild";
import { fromRoot, isMain, relativeToRoot } from "../lib/paths.js";

export async function buildAgentPage(outfile = fromRoot("dashboard", "agent", "tier3.js")): Promise<void> {
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
    console.log(`${relativeToRoot(outfile)} built`);
}

if (isMain(import.meta.url)) {
    buildAgentPage().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
