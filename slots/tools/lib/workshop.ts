/**
 * The workshop: where a factory task keeps its files. One directory per
 * task under `outputs/factory/`, or under `WORKSHOP_DIR` when the host says
 * so (a container's mounted output directory, a bucket: the host maps its
 * platform's variable onto this one; nothing platform-specific lives here),
 * and every path a tool receives is relative to a task's directory: `..`,
 * absolute paths and drive letters are refused before anything touches the
 * disk. The runtime's document store (`document_build` with a name,
 * `session_run` by name) is the same directory, so a document the factory
 * builds is a file of its workshop, with its sha256.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { IDocumentStore } from "@spiky-panda/mcp/runtime";
import { fromRoot } from "../../../lib/paths.js";

export const WORKSHOP_ROOT = process.env.WORKSHOP_DIR ? path.resolve(process.env.WORKSHOP_DIR) : fromRoot("outputs", "factory");

const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function checkTaskId(taskId: unknown): string {
    const id = String(taskId ?? "").trim();
    if (!TASK_ID.test(id)) throw new Error(`taskId "${id}" is not a task identifier (letters, digits, . _ -, 64 at most)`);
    return id;
}

/** A path inside a task's directory, or a refusal: nothing above it, nothing absolute. */
export function safeRelative(p: unknown): string {
    const raw = String(p ?? "").replace(/\\/g, "/").trim();
    if (!raw || raw === ".") return "";
    if (path.isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) throw new Error(`path "${raw}" is absolute; paths are relative to the task's directory`);
    const parts = raw.split("/").filter((x) => x && x !== ".");
    if (parts.includes("..")) throw new Error(`path "${raw}" leaves the task's directory`);
    return parts.join("/");
}

export function taskDir(taskId: string): string {
    return path.join(WORKSHOP_ROOT, checkTaskId(taskId));
}

/** The absolute path of a file of a task, its directory created on demand. */
export function taskFile(taskId: string, relative: unknown, create = false): string {
    const dir = taskDir(taskId);
    if (create) mkdirSync(dir, { recursive: true });
    const rel = safeRelative(relative);
    return rel ? path.join(dir, ...rel.split("/")) : dir;
}

export const sha256Of = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

export interface WorkshopEntry {
    path: string;
    bytes: number;
    sha256: string;
    modified: string;
}

/** Every file under a directory of a task, paths relative to the task. */
export function listTaskFiles(taskId: string, relative = ""): WorkshopEntry[] {
    const base = taskDir(taskId);
    const start = taskFile(taskId, relative);
    if (!existsSync(start)) return [];
    const out: WorkshopEntry[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile()) {
                const st = statSync(full);
                out.push({ path: path.relative(base, full).split(path.sep).join("/"), bytes: st.size, sha256: sha256Of(readFileSync(full)), modified: st.mtime.toISOString() });
            }
        }
    };
    walk(start);
    return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The runtime's document store on the workshop: a name is a path relative to
 * the workshop root (`<taskId>/twin-v2.spikypanda`), so a built document is
 * a file of the task, and `session_run` by name reads it back from disk.
 */
export class WorkshopDocumentStore implements IDocumentStore {
    constructor(private readonly root: string = WORKSHOP_ROOT) {}

    private file(name: string): string {
        const rel = safeRelative(name);
        if (!rel) throw new Error("a document name is required");
        return path.join(this.root, ...(rel.endsWith(".spikypanda") ? rel : `${rel}.spikypanda`).split("/"));
    }

    list(): ReadonlyArray<string> {
        if (!existsSync(this.root)) return [];
        const out: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (entry.isFile() && entry.name.endsWith(".spikypanda")) out.push(path.relative(this.root, full).split(path.sep).join("/"));
            }
        };
        walk(this.root);
        return out.sort();
    }

    read(name: string): string | undefined {
        const file = this.file(name);
        return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    }

    write(name: string, text: string): void {
        const file = this.file(name);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, text);
    }
}
