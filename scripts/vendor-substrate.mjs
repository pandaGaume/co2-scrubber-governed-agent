/**
 * Packs the substrate packages the demo depends on into `vendor/` and points
 * `package.json` at the new archives. A developer's shortcut: the demo
 * installs from `vendor/` with a plain `npm install` (or `npm ci`), this
 * script only refreshes what is in there.
 *
 *     node scripts/vendor-substrate.mjs <repo root> [<repo root>...]
 *
 * Each argument is the root of a repository whose workspaces hold some of
 * the `@spiky-panda/*` packages listed in this demo's `dependencies`. Those
 * are packed with `npm pack` from that root (built beforehand: the archive
 * carries `dist/`, and `bundle/` for the plugins and the factory).
 *
 * One version number, one content. npm identifies a package by its name and
 * its version; a new content under a number already seen is served from the
 * cache as the old one. So an archive whose name is already in `vendor/`
 * with a different content is refused: bump the version in its repository
 * first. The previous archive of the package (other version) is removed.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendor = path.join(root, "vendor");
const packageJsonPath = path.join(root, "package.json");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const repos = process.argv.slice(2).map((a) => path.resolve(a));
if (!repos.length) {
    console.error("usage: node scripts/vendor-substrate.mjs <repo root> [<repo root>...]");
    process.exit(2);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const wanted = new Set(Object.keys(packageJson.dependencies ?? {}).filter((n) => n.startsWith("@spiky-panda/")));
if (!wanted.size) {
    console.error("package.json lists no @spiky-panda/* dependency: nothing to vendor");
    process.exit(2);
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
/** The workspaces of a repository: name, version and folder, as npm sees them. */
const workspacesOf = (repo) => {
    const r = spawnSync(npm, ["query", ".workspace"], { cwd: repo, encoding: "utf8", shell: process.platform === "win32" });
    if (r.status !== 0) throw new Error(`npm query .workspace failed in ${repo}: ${r.stderr}`);
    return JSON.parse(r.stdout).map((w) => ({ name: w.name, version: w.version, dir: w.path }));
};

mkdirSync(vendor, { recursive: true });
const staging = mkdtempSync(path.join(tmpdir(), "vendor-"));
const refused = [];
const packed = [];
try {
    for (const repo of repos) {
        for (const ws of workspacesOf(repo)) {
            if (!wanted.has(ws.name)) continue;
            const r = spawnSync(npm, ["pack", `--workspace=${ws.name}`, `--pack-destination=${staging}`, "--json"], { cwd: repo, encoding: "utf8", shell: process.platform === "win32" });
            if (r.status !== 0) throw new Error(`npm pack ${ws.name} failed in ${repo}: ${r.stderr}`);
            const [{ filename }] = JSON.parse(r.stdout);
            const fresh = path.join(staging, filename);
            const target = path.join(vendor, filename);
            if (existsSync(target) && sha256(target) !== sha256(fresh)) {
                refused.push(`${ws.name}@${ws.version}: vendor/${filename} exists with another content; bump the version in ${repo}`);
                continue;
            }
            const stem = filename.replace(/-\d+\.\d+\.\d+.*\.tgz$/, "");
            for (const old of readdirSync(vendor)) if (old !== filename && old.replace(/-\d+\.\d+\.\d+.*\.tgz$/, "") === stem) rmSync(path.join(vendor, old));
            rmSync(target, { force: true });
            renameSync(fresh, target);
            packageJson.dependencies[ws.name] = `file:vendor/${filename}`;
            packed.push({ name: ws.name, version: ws.version, filename, sha256: sha256(target) });
            wanted.delete(ws.name);
        }
    }
} finally {
    rmSync(staging, { recursive: true, force: true });
}

for (const p of packed) console.log(`${p.name}@${p.version}  vendor/${p.filename}  sha256 ${p.sha256.slice(0, 12)}`);
if (packed.length) writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + "\n");
for (const r of refused) console.error(`refused: ${r}`);
for (const n of wanted) console.error(`not found in the given repositories: ${n}`);
if (packed.length) console.log(`\n${packed.length} archive(s) in vendor/; now run: npm install`);
process.exit(refused.length || wanted.size ? 1 : 0);
