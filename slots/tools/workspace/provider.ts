/**
 * The `workspace` slot: where a factory task keeps its files, and nothing
 * above. One directory per task (`slots/tools/lib/workshop.ts`), three tools
 * (`list`, `read`, `write`), every path relative to the task's directory
 * and refused when it leaves it. A write that replaces a file records the
 * sha256 of what it replaced, so the trace can say what changed.
 * `docs/factory-harness.fr.md`, section 3.1.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot } from "../../../lib/paths.js";
import { objectSchema, publishSlot, type PublishedSlot, type SlotTool } from "../../lib/slot-server.js";
import { checkTaskId, listTaskFiles, sha256Of, taskFile, WORKSHOP_ROOT } from "../lib/workshop.js";

export interface WorkspaceState {
    root: string;
    writes: Array<{ taskId: string; path: string; bytes: number; sha256: string; replaced: string | null; at: string }>;
}

const MAX_READ = 256 * 1024;
const TASK = { type: "string" };
const PATH = { type: "string" };

export function workspaceSlot(wsBase: string, log: (line: string) => void): PublishedSlot<WorkspaceState> {
    const state: WorkspaceState = { root: WORKSHOP_ROOT, writes: [] };
    const tools: SlotTool<WorkspaceState>[] = [
        {
            name: "list",
            inputSchema: objectSchema({ taskId: TASK, path: PATH }, ["taskId"]),
            handle: (args) => ({ taskId: checkTaskId(args.taskId), files: listTaskFiles(checkTaskId(args.taskId), typeof args.path === "string" ? args.path : "") }),
        },
        {
            name: "read",
            inputSchema: objectSchema({ taskId: TASK, path: PATH, maxBytes: { type: "number" } }, ["taskId", "path"]),
            handle: (args) => {
                const file = taskFile(checkTaskId(args.taskId), args.path);
                if (!existsSync(file)) throw new Error(`no file "${String(args.path)}" in task ${String(args.taskId)}`);
                const bytes = readFileSync(file);
                const limit = Math.min(MAX_READ, typeof args.maxBytes === "number" ? args.maxBytes : MAX_READ);
                if (bytes.length > limit) throw new Error(`"${String(args.path)}" is ${bytes.length} bytes, ${limit} at most for one read`);
                const text = bytes.toString("utf8");
                const binary = text.includes("�");
                return { path: String(args.path), bytes: bytes.length, sha256: sha256Of(bytes), ...(binary ? { base64: bytes.toString("base64") } : { text }) };
            },
        },
        {
            name: "write",
            inputSchema: objectSchema({ taskId: TASK, path: PATH, text: { type: "string" }, base64: { type: "string" } }, ["taskId", "path"]),
            handle: (args, s) => {
                const taskId = checkTaskId(args.taskId);
                const rel = String(args.path ?? "");
                const file = taskFile(taskId, rel, true);
                if (file === taskFile(taskId, "")) throw new Error("a file path is required");
                const bytes = typeof args.base64 === "string" ? Buffer.from(args.base64, "base64") : typeof args.text === "string" ? Buffer.from(args.text, "utf8") : null;
                if (!bytes) throw new Error("give text or base64");
                const replaced = existsSync(file) ? sha256Of(readFileSync(file)) : null;
                mkdirSync(path.dirname(file), { recursive: true });
                writeFileSync(file, bytes);
                const sha256 = sha256Of(bytes);
                s.writes.push({ taskId, path: rel, bytes: bytes.length, sha256, replaced, at: new Date().toISOString() });
                return { path: rel, bytes: bytes.length, sha256, replaced };
            },
        },
    ];
    return publishSlot<WorkspaceState>({
        slot: "workspace",
        tools,
        resources: [{ uri: "workspace://writes", read: (s) => s.writes }],
        state,
        wsBase,
        log,
        stub: false,
        version: "0.1.0",
        grammarsDir: fromRoot("slots", "tools", "workspace", "grammars"),
    });
}
