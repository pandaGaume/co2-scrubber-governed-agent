/**
 * Forks (2026-09-29, P3 of docs/comportement-en-donnees.fr.md; Guillaume: "un environnement volontairement mis à
 * part, comme un container, où les modifications n'impactent pas les librairies, graphes et autres données du
 * contexte", "ça permet de laisser les agents s'auto-modifier et d'observer l'évolution", "une sorte de fork").
 *
 * A fork is a git repository of its own under `outputs/forks/<id>/` (FORKS_DIR when set), holding a copy of the
 * context's data (`FORK_DATA`: the library with its signatures, the specs, the graphs) and its own outputs (the
 * workshops, the recipes, the library's proposals). A server started in it (`FORK_DIR`, `lib/paths.ts`) reads and
 * writes that copy only: what its agents change stays there.
 *
 * Its history is the evolution: the first commit is the context as the fork took it (and the repository commit it
 * was taken from), every snapshot a commit of what changed since; a fork of a fork is a clone, with the history of
 * its parent. The divergence is the fork's data against the repository's as it is now.
 *
 * Its commits are the fork's, not a person's: authored "fork <id>", and not signed with anyone's key (a person's
 * signature on what agents changed would say that person made it).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { FORK_DATA, fromRepository } from "./paths.js";

/** The data a fork copies from the repository: its context, less its outputs, which a fork starts without. */
export const COPIED = FORK_DATA.filter((d) => d !== "outputs");

/** What a fork's history keeps of its outputs: what the agents learn and propose, and the scenario runs, not every task's workshop. */
const IGNORE = ["/outputs/*", "!/outputs/factory/", "/outputs/factory/*", "!/outputs/factory/_recipes/", "!/outputs/factory/library-proposals/", "!/outputs/factory/runs/", "!/outputs/factory/adaptations/", "!/outputs/factory/memory/", ""].join("\n");

export interface ForkRecord {
    id: string;
    createdAt: string;
    /** The repository commit the context was taken from, and whether its data had changes not committed. */
    origin: { commit: string | null; dirty: boolean };
    /** The fork it was cloned from, when it is a fork of a fork. */
    parent: string | null;
}

export const forksRoot = (): string => (process.env.FORKS_DIR ? path.resolve(process.env.FORKS_DIR) : fromRepository("outputs", "forks"));
export const forkPath = (id: string): string => {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) throw new Error(`a fork's id is lowercase words and dashes, not "${id}"`);
    return path.join(forksRoot(), id);
};

const git = (cwd: string, args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const gitOr = (cwd: string, args: string[]): string | null => {
    try {
        return git(cwd, args);
    } catch {
        return null;
    }
};

function configure(dir: string, id: string): void {
    git(dir, ["config", "user.name", `fork ${id}`]);
    git(dir, ["config", "user.email", `fork-${id}@forks.local`]);
    // The fork's commits are what its agents changed: never signed with a person's key.
    git(dir, ["config", "commit.gpgsign", "false"]);
    git(dir, ["config", "core.autocrlf", "false"]);
}

export function readFork(id: string): ForkRecord {
    const file = path.join(forkPath(id), "fork.json");
    if (!existsSync(file)) throw new Error(`no fork "${id}" in ${forksRoot()}`);
    return JSON.parse(readFileSync(file, "utf8")) as ForkRecord;
}

/** A fork of the repository's context, or of another fork (a clone, its history with it). */
export function createFork(id: string, options: { from?: string } = {}): ForkRecord & { commit: string } {
    const dir = forkPath(id);
    if (existsSync(dir)) throw new Error(`the fork "${id}" exists already (${dir})`);
    mkdirSync(forksRoot(), { recursive: true });
    let record: ForkRecord;
    if (options.from) {
        const parent = readFork(options.from);
        git(forksRoot(), ["clone", "--quiet", forkPath(options.from), dir]);
        configure(dir, id);
        record = { id, createdAt: new Date().toISOString(), origin: parent.origin, parent: options.from };
    } else {
        mkdirSync(dir, { recursive: true });
        for (const d of COPIED) cpSync(fromRepository(...d.split("/")), path.join(dir, ...d.split("/")), { recursive: true });
        mkdirSync(path.join(dir, "outputs"), { recursive: true });
        writeFileSync(path.join(dir, ".gitignore"), IGNORE, "utf8");
        git(dir, ["init", "--quiet"]);
        configure(dir, id);
        const repo = fromRepository();
        // Dirty: a file of the context changed and not committed; the signatures, a person's and kept out of git on purpose, do not count.
        const changes = (gitOr(repo, ["status", "--porcelain", "--", ...COPIED]) ?? "").split("\n").filter((l) => l.trim() && !/docs\/library\/signatures\//.test(l));
        record = { id, createdAt: new Date().toISOString(), origin: { commit: gitOr(repo, ["rev-parse", "HEAD"]), dirty: changes.length > 0 }, parent: null };
    }
    writeFileSync(path.join(dir, "fork.json"), `${JSON.stringify(record, null, 4)}\n`, "utf8");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "--quiet", "-m", options.from ? `fork ${id}, from the fork ${options.from}` : `fork ${id}, the context as taken from ${record.origin.commit?.slice(0, 12) ?? "the repository"}${record.origin.dirty ? " (with changes not committed)" : ""}`]);
    return { ...record, commit: git(dir, ["rev-parse", "HEAD"]) };
}

/** A snapshot: what changed in the fork since the last one, as a commit; none when nothing changed. */
export function snapshotFork(id: string, label: string): { commit: string; files: Array<{ status: string; path: string }> } | null {
    readFork(id);
    return snapshotAt(forkPath(id), label);
}

/** A snapshot of the fork at a directory: what a server in a fork takes of itself (the station, on an adaptation it adopts). */
export function snapshotAt(dir: string, label: string): { commit: string; files: Array<{ status: string; path: string }> } | null {
    if (!existsSync(path.join(dir, "fork.json"))) throw new Error(`${dir} is no fork`);
    git(dir, ["add", "-A"]);
    const staged = git(dir, ["diff", "--cached", "--name-status"]);
    if (!staged) return null;
    git(dir, ["commit", "--quiet", "-m", label.trim() || "snapshot"]);
    return { commit: git(dir, ["rev-parse", "HEAD"]), files: staged.split("\n").map((l) => ({ status: l.split("\t")[0], path: l.split("\t").at(-1) ?? "" })) };
}

/** The fork's evolution: its snapshots, oldest first, each with the files it changed. */
export function forkHistory(id: string): Array<{ commit: string; at: string; label: string; files: string[] }> {
    const dir = forkPath(id);
    readFork(id);
    const out = git(dir, ["log", "--reverse", "--name-only", "--format=%x1e%H%x1f%aI%x1f%s"]);
    return out
        .split("\x1e")
        .filter((b) => b.trim())
        .map((b) => {
            const [head, ...files] = b.trim().split("\n");
            const [commit, at, label] = head.split("\x1f");
            return { commit, at, label, files: files.filter(Boolean) };
        });
}

const hashOf = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");
function filesUnder(base: string, rel: string): string[] {
    const dir = path.join(base, ...rel.split("/"));
    if (!existsSync(dir)) return [];
    if (!statSync(dir).isDirectory()) return [rel];
    return readdirSync(dir).flatMap((name) => filesUnder(base, `${rel}/${name}`));
}

/** The fork's divergence from the repository's context as it is now: what the fork added, changed and removed. */
export function forkDivergence(id: string): { added: string[]; changed: string[]; removed: string[] } {
    const dir = forkPath(id);
    readFork(id);
    const repo = fromRepository();
    const mine = new Set(COPIED.flatMap((d) => filesUnder(dir, d)));
    const theirs = new Set(COPIED.flatMap((d) => filesUnder(repo, d)));
    const added = [...mine].filter((f) => !theirs.has(f)).sort();
    const removed = [...theirs].filter((f) => !mine.has(f)).sort();
    const changed = [...mine].filter((f) => theirs.has(f) && hashOf(path.join(dir, f)) !== hashOf(path.join(repo, f))).sort();
    return { added, changed, removed };
}

export function listForks(): ForkRecord[] {
    if (!existsSync(forksRoot())) return [];
    return readdirSync(forksRoot())
        .filter((d) => existsSync(path.join(forksRoot(), d, "fork.json")))
        .map((d) => JSON.parse(readFileSync(path.join(forksRoot(), d, "fork.json"), "utf8")) as ForkRecord);
}

/** A fork thrown away, its history with it: what it did is not kept anywhere else. */
export function removeFork(id: string): void {
    readFork(id);
    rmSync(forkPath(id), { recursive: true, force: true });
}
