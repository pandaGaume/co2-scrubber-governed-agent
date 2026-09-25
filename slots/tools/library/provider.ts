/**
 * The `library` slot: the documents a builder may read before it reasons,
 * so that a number, a method or a limit it is unsure of is looked up
 * rather than guessed. Four tools: `list` (the catalogue), `methods` (the
 * method cards that measure a quantity: a model does not invent ASTM E741,
 * it finds the method from what it lacks, and the card carries the rules
 * of application), `search` (the documents a query's words appear in, with
 * the lines they appear on), `read` (one document whole, with its sha256).
 * Since 25 September, the graphs too: `graphs` (the reference graphs a
 * harness may instantiate on the twin, each with its words: what it is,
 * its variables and settings, its probes) and `graph` (one whole, its
 * template included). A graph's words are an mcp-core grammar of its own
 * (`graphs/<id>.grammars/<family>/<locale>.json`, `lib/graph-library.ts`),
 * resolved for the caller's wording key (`grammar`, the key the caller's
 * own session got in `_meta.grammar`), the baseline when none.
 *
 * Why a library and not the web, first: the documents are chosen, they are
 * files of this repository (`docs/library/*.md`), each read is a call in the
 * broker's trace with the sha256 of what was read, the room needs no
 * network, and it answers the same way whatever model asks (Claude today,
 * Nemotron on Nebius tomorrow). A page of the web is content nobody chose,
 * landing in the context of a builder; that is a later decision, with its
 * own guard.
 *
 * What the library holds is knowledge, never a conclusion about the task:
 * the physics of a scrubber and of a volume of air, the standard methods of
 * measurement, what CO2 does to people, the installation. What to do with
 * it is the builder's to reason out, and the guard's to check.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot } from "../../../lib/paths.js";
import { objectSchema, publishSlot, type PublishedSlot, type SlotTool } from "../../lib/slot-server.js";
import { sha256Of } from "../lib/workshop.js";
import { describeGraph, loadGraphLibrary, type GraphLibraryEntry } from "../../../lib/graph-library.js";

export interface LibraryDocument {
    id: string;
    title: string;
    summary: string;
    /** For a method card: the quantities it measures (its `**Measures:**` line); empty for a document of knowledge. */
    measures: string[];
    sha256: string;
    bytes: number;
    text: string;
}

export interface LibraryState {
    dir: string;
    documents: LibraryDocument[];
    /** The reference graphs on the shelf, with their grammars. */
    graphs: GraphLibraryEntry[];
    reads: Array<{ id: string; sha256: string; at: string }>;
}

export const LIBRARY_DIR = fromRoot("docs", "library");

/** A document's title is its first heading, its summary the first paragraph after it. */
export function loadLibrary(dir: string = LIBRARY_DIR): LibraryDocument[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
        .sort()
        .map((file) => {
            const bytes = readFileSync(path.join(dir, file));
            const text = bytes.toString("utf8");
            const lines = text.split(/\r?\n/);
            const title = (lines.find((l) => l.startsWith("# ")) ?? file).replace(/^#\s+/, "");
            const after = lines.slice(lines.findIndex((l) => l.startsWith("# ")) + 1);
            const summary = after.join("\n").trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, " ") ?? "";
            const measures = (lines.find((l) => l.startsWith("**Measures:**")) ?? "")
                .replace("**Measures:**", "")
                .split(",")
                .map((q) => q.trim())
                .filter(Boolean);
            return { id: file.replace(/\.md$/, ""), title, summary, measures, sha256: sha256Of(bytes), bytes: bytes.length, text };
        });
}

/** The documents a query's words appear in, the most matched first, with the lines they appear on. */
export function searchLibrary(documents: LibraryDocument[], query: string, limit = 5): Array<{ id: string; title: string; score: number; lines: string[] }> {
    const words = query
        .toLowerCase()
        .split(/[^a-z0-9.%-]+/)
        .filter((w) => w.length > 2);
    if (!words.length) return [];
    return documents
        .map((d) => {
            const lines = d.text.split(/\r?\n/).filter((l) => l.trim());
            const hits = lines.filter((l) => words.some((w) => l.toLowerCase().includes(w)));
            const score = words.reduce((sum, w) => sum + (d.text.toLowerCase().split(w).length - 1), 0);
            return { id: d.id, title: d.title, score, lines: hits.slice(0, 8).map((l) => l.trim().slice(0, 300)) };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

export function librarySlot(wsBase: string, log: (line: string) => void): PublishedSlot<LibraryState> {
    const state: LibraryState = { dir: LIBRARY_DIR, documents: loadLibrary(), graphs: loadGraphLibrary(), reads: [] };
    for (const g of state.graphs) for (const problem of g.problems) log(`[library] graph ${g.template.id}: ${problem}`);
    const wordingOf = (args: Record<string, unknown>) => (typeof args.grammar === "string" && args.grammar.trim() ? args.grammar.trim() : null);
    const tools: SlotTool<LibraryState>[] = [
        {
            name: "list",
            inputSchema: objectSchema({}),
            handle: (_args, s) => ({ documents: s.documents.map(({ id, title, summary, measures, sha256, bytes }) => ({ id, title, summary, measures, sha256, bytes })) }),
        },
        {
            name: "methods",
            inputSchema: objectSchema({ quantity: { type: "string" } }, ["quantity"]),
            handle: (args, s) => {
                const quantity = String(args.quantity ?? "").toLowerCase();
                return { quantity: String(args.quantity), methods: s.documents.filter((d) => d.measures.some((m) => m.toLowerCase() === quantity)).map(({ id, title, summary, measures, sha256 }) => ({ id, title, summary, measures, sha256 })) };
            },
        },
        {
            name: "search",
            inputSchema: objectSchema({ query: { type: "string" }, limit: { type: "number" } }, ["query"]),
            handle: (args, s) => ({ query: String(args.query), results: searchLibrary(s.documents, String(args.query ?? ""), typeof args.limit === "number" ? args.limit : 5) }),
        },
        {
            name: "graphs",
            inputSchema: objectSchema({ grammar: { type: "string" } }),
            handle: (args, s) => ({ graphs: s.graphs.map((g) => describeGraph(g, wordingOf(args))) }),
        },
        {
            name: "graph",
            inputSchema: objectSchema({ id: { type: "string" }, grammar: { type: "string" } }, ["id"]),
            handle: (args, s) => {
                const g = s.graphs.find((x) => x.template.id === args.id);
                if (!g) throw new Error(`no graph "${String(args.id)}" in the library (${s.graphs.map((x) => x.template.id).join(", ") || "none"})`);
                s.reads.push({ id: `graph:${g.template.id}`, sha256: g.templateSha256, at: new Date().toISOString() });
                return { ...describeGraph(g, wordingOf(args)), template: g.template };
            },
        },
        {
            name: "read",
            inputSchema: objectSchema({ id: { type: "string" } }, ["id"]),
            handle: (args, s) => {
                const d = s.documents.find((x) => x.id === args.id);
                if (!d) throw new Error(`no document "${String(args.id)}" in the library (${s.documents.map((x) => x.id).join(", ")})`);
                s.reads.push({ id: d.id, sha256: d.sha256, at: new Date().toISOString() });
                return { id: d.id, title: d.title, sha256: d.sha256, text: d.text };
            },
        },
    ];
    return publishSlot<LibraryState>({
        slot: "library",
        tools,
        resources: [
            { uri: "library://catalogue", read: (s) => s.documents.map(({ id, title, summary, sha256 }) => ({ id, title, summary, sha256 })) },
            { uri: "library://graphs", read: (s) => s.graphs.map((g) => describeGraph(g, null)) },
        ],
        state,
        wsBase,
        log,
        stub: false,
        version: "0.1.0",
        grammarsDir: fromRoot("slots", "tools", "library", "grammars"),
    });
}
