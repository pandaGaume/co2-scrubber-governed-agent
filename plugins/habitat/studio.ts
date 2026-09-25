/**
 * The habitat plugin for the studio (the node editor in the browser): the
 * same four registrations as `index.ts`, on the studio's own registry, so
 * `graphs/habitat.spikypanda` draws with its crew, scrubber, fan and filter
 * instead of four unknown types. Bundled by `scripts/build-agent-page.ts`
 * into `dashboard/agent/SpkPluginHabitat.js` (the global the studio's
 * plugin loader reads), the cards next to it under `habitat-docs/`. The
 * studio's core is the one the page loaded (`globalThis.SpikypandaCore`),
 * never a second copy.
 */
import type { NodeRegistry } from "@spiky-panda/core";
import { registerHabitatNodes } from "./index.js";

interface StudioPluginContext {
    readonly id: string;
    readonly nodes: NodeRegistry;
}

const plugin = {
    activate(ctx: StudioPluginContext): void {
        registerHabitatNodes(ctx.nodes, (file) => `/agent/habitat-docs/${file}`);
    },
};

export default plugin;
