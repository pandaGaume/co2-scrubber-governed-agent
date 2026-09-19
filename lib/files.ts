/**
 * Files the demo reads and identifies: JSON with a clear error naming the
 * file, and the sha256 every manifest and every twin answer carries.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** sha256 of a file, hex: the identity the manifests carry. */
export function sha256File(file: string): string {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Reads a JSON file with a clear error naming the file. */
export function readJson<T = unknown>(file: string): T {
    try {
        return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch (e) {
        throw new Error(`${file}: ${(e as Error).message}`);
    }
}

/** Minimal `--key value` / `--flag` parsing for the scripts. */
export function parseArgs(argv: ReadonlyArray<string>): Record<string, string | true> {
    const out: Record<string, string | true> = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--")) continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
            out[key] = next;
            i++;
        } else out[key] = true;
    }
    return out;
}

export function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
