/**
 * Where the repository is, from wherever this code runs (the TypeScript
 * sources or their `dist/` copies sit at different depths): the nearest
 * ancestor directory whose package.json is this package's. The reviewable
 * files (parameters, scenario, document) are named here once.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "co2-scrubber-governed-agent";

function findRoot(from: string): string {
    let dir = from;
    for (;;) {
        const pkg = path.join(dir, "package.json");
        if (existsSync(pkg)) {
            try {
                if ((JSON.parse(readFileSync(pkg, "utf8")) as { name?: string }).name === PACKAGE_NAME) return dir;
            } catch {
                // not ours, keep climbing
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir) throw new Error(`the ${PACKAGE_NAME} root was not found above ${from}`);
        dir = parent;
    }
}

export const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
export const PARAMETERS_FILE = path.join(ROOT, "specs", "cabin-parameters.json");
export const DEFAULT_SCENARIO_FILE = path.join(ROOT, "specs", "scenario-night-9.json");
export const CABIN_DOCUMENT_FILE = path.join(ROOT, "graphs", "cabin.spikypanda");
/** The physical reference of the habitat (`lib/habitat.ts`): what the graph factory starts from. */
export const HABITAT_DOCUMENT_FILE = path.join(ROOT, "graphs", "habitat.spikypanda");
export const SYSTEM_PROMPT_FILE = path.join(ROOT, "tier3", "prompts", "system.md");

/** An absolute path under the repository. */
export const fromRoot = (...segments: string[]): string => path.resolve(ROOT, ...segments);

/** A path as the manifests write it: relative to the root, forward slashes. */
export const relativeToRoot = (file: string): string => path.relative(ROOT, file).split(path.sep).join("/");

/** True when the module at `importMetaUrl` is the script node was started with. */
export function isMain(importMetaUrl: string): boolean {
    return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(importMetaUrl);
}
