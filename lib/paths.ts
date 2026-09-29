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

/**
 * A fork (2026-09-29, P3 of docs/comportement-en-donnees.fr.md): an environment set apart, like a container, where
 * the agents may change the context and their changes are observed, never reaching the repository's. It holds its own
 * copy of the context's data (FORK_DATA), and a server started with FORK_DIR reads and writes that copy: every path
 * of the data goes through fromRoot, which sends it into the fork; the code stays the repository's.
 */
export const FORK_DATA: ReadonlyArray<string> = ["docs/library", "specs", "graphs", "outputs"];
/** The fork this process runs in, when it runs in one. */
export const forkDir = (): string | null => (process.env.FORK_DIR ? path.resolve(process.env.FORK_DIR) : null);
const inForkData = (rel: string): boolean => FORK_DATA.some((d) => rel === d || rel.startsWith(`${d}/`));

/** An absolute path under the repository; a path of the context's data under the fork, when this process runs in one. */
export const fromRoot = (...segments: string[]): string => {
    const fork = forkDir();
    if (fork && segments.length) {
        const rel = path.join(...segments).split(path.sep).join("/");
        if (!path.isAbsolute(rel) && inForkData(rel)) return path.resolve(fork, ...segments);
    }
    return path.resolve(ROOT, ...segments);
};

/** A path of the repository itself, whatever fork this process runs in: what a fork is made from and compared with. */
export const fromRepository = (...segments: string[]): string => path.resolve(ROOT, ...segments);

export const PARAMETERS_FILE = fromRoot("specs", "cabin-parameters.json");
export const DEFAULT_SCENARIO_FILE = fromRoot("specs", "scenario-night-9.json");
export const CABIN_DOCUMENT_FILE = fromRoot("graphs", "cabin.spikypanda");
/** The physical reference of the habitat (`lib/habitat.ts`): what the graph factory starts from. */
export const HABITAT_DOCUMENT_FILE = fromRoot("graphs", "habitat.spikypanda");
export const SYSTEM_PROMPT_FILE = fromRoot("tier3", "prompts", "system.md");

/** A path as the manifests write it: relative to the root (to the fork's, for a file of the fork), forward slashes. */
export const relativeToRoot = (file: string): string => {
    const fork = forkDir();
    const base = fork && path.resolve(file).startsWith(fork + path.sep) ? fork : ROOT;
    return path.relative(base, file).split(path.sep).join("/");
};

/** True when the module at `importMetaUrl` is the script node was started with. */
export function isMain(importMetaUrl: string): boolean {
    return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(importMetaUrl);
}

/**
 * A directory or file a host sets by its environment (the tests' own signatures, roles, workshops, recipes): ignored in a
 * fork, whose data is all its own, so that nothing set outside can send its writes out of it.
 */
export const pathFromEnv = (name: string): string | null => (forkDir() ? null : process.env[name] ? path.resolve(process.env[name]!) : null);

/** The id of the fork this process runs in (its directory's name), or null: what everything a fork produces is marked with. */
export const forkId = (): string | null => {
    const fork = forkDir();
    return fork ? path.basename(fork) : null;
};
