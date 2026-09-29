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
import type { LibraryFact } from "../../../harness/core/contracts.js";
import { documentDigest, signatureOf, signaturesDir, signDocument } from "../../../harness/lib/signatures.js";
import { execSync } from "node:child_process";
import { WORKSHOP_ROOT } from "../lib/workshop.js";
import { notHolder, roleOf, SIGNATORY } from "../../../lib/roles.js";

export interface LibraryDocument {
    id: string;
    title: string;
    summary: string;
    /** For a method card: the quantities it measures (its `**Measures:**` line); empty for a document of knowledge. */
    measures: string[];
    sha256: string;
    bytes: number;
    text: string;
    /** The facts the document states, typed (`<id>.facts.json` beside it): id, semantic, quantity, unit, value, the register property that carries the same fact. */
    facts: LibraryFact[];
    /** The rules a guard checks against these facts (`<id>.rules.json` beside it), signed with them; none when the document has none. */
    rules: { safety: string[]; rules: unknown[] } | null;
}

export interface LibraryState {
    dir: string;
    /** Where the signatures are read and written: the repository's (a person's, by npm run library:sign), or a scenario run's own, empty at its start, so a demonstration signs without touching the repository's (2026-09-28). */
    sigDir: string;
    sigScope: { scope: "repository" | "run"; runId?: string };
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
            const id = file.replace(/\.md$/, "");
            return { id, title, summary, measures, sha256: sha256Of(bytes), bytes: bytes.length, text, facts: loadFacts(dir, id), rules: loadRules(dir, id) };
        });
}

/** The typed facts of a document, from its sidecar; none when it has none. A sidecar that does not parse is a startup problem, said once. */
export function loadFacts(dir: string, id: string): LibraryFact[] {
    const file = path.join(dir, `${id}.facts.json`);
    if (!existsSync(file)) return [];
    try {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as { facts?: LibraryFact[] };
        return Array.isArray(parsed.facts) ? parsed.facts.filter((f) => f && typeof f.id === "string" && typeof f.value === "number" && typeof f.unit === "string") : [];
    } catch (e) {
        throw new Error(`${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** The rules of a document, from its sidecar; none when it has none. A sidecar that does not parse is a startup problem, said once. */
export function loadRules(dir: string, id: string): LibraryDocument["rules"] {
    const file = path.join(dir, `${id}.rules.json`);
    if (!existsSync(file)) return null;
    try {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as { safety?: unknown; rules?: unknown };
        return { safety: Array.isArray(parsed.safety) ? parsed.safety.map(String) : [], rules: Array.isArray(parsed.rules) ? parsed.rules : [] };
    } catch (e) {
        throw new Error(`${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** The files a signature binds, as they are on disk now: the document, its facts, its rules (what a person reads before signing). */
export function filesOf(dir: string, id: string): Array<{ name: string; text: string }> {
    return [`${id}.md`, `${id}.facts.json`, `${id}.rules.json`].filter((name) => existsSync(path.join(dir, name))).map((name) => ({ name, text: readFileSync(path.join(dir, name), "utf8").replace(/\r\n/g, "\n") }));
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
    const state: LibraryState = { dir: LIBRARY_DIR, sigDir: signaturesDir(), sigScope: { scope: "repository" }, documents: loadLibrary(), graphs: loadGraphLibrary(), reads: [] };
    // Who signs from the control room: the person this machine's git names, as the commander.
    const person = (() => {
        try {
            return execSync("git config user.name", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        } catch {
            return "";
        }
    })();
    for (const g of state.graphs) for (const problem of g.problems) log(`[library] graph ${g.template.id}: ${problem}`);
    const wordingOf = (args: Record<string, unknown>) => (typeof args.grammar === "string" && args.grammar.trim() ? args.grammar.trim() : null);
    const tools: SlotTool<LibraryState>[] = [
        {
            name: "list",
            inputSchema: objectSchema({}),
            handle: (_args, s) => ({
                documents: s.documents.map(({ id, title, summary, measures, sha256, bytes, facts, rules }) => ({ id, title, summary, measures, sha256, bytes, facts: facts.length, rules: rules ? rules.rules.length : 0, signature: signatureOf(id, s.dir, s.sigDir) })),
                // Who signs from the control room, and where the signatures go: what the library page says before a person signs.
                signer: person || null,
                // The role a signature is asked of, and who holds it now.
                role: { id: SIGNATORY, ...(roleOf(SIGNATORY) ?? { does: "", holders: [] }) },
                signatures: s.sigScope,
            }),
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
            // The typed facts of the library: what a request cites by id (known[].factId), what the register's properties correspond to, what a conflict is judged on.
            name: "facts",
            inputSchema: objectSchema({ id: { type: "string" } }),
            handle: (args, s) => {
                const docs = typeof args.id === "string" && args.id ? s.documents.filter((d) => d.id === args.id) : s.documents;
                if (typeof args.id === "string" && args.id && !docs.length) throw new Error(`no document "${String(args.id)}" in the library`);
                // Each fact carries whether its document is signed and still as signed: a safety limit is justified only by a signed one (2026-09-28).
                return { facts: docs.flatMap((d) => { const signature = signatureOf(d.id, s.dir, s.sigDir); return d.facts.map((f) => ({ ...f, source: d.id, signed: signature })); }) };
            },
        },
        {
            // The rules a guard checks against a document's facts, with the document's signature as it stands: a guard judges by rules a person signed, or not at all (2026-09-28).
            name: "rules",
            inputSchema: objectSchema({ id: { type: "string" } }, ["id"]),
            handle: (args, s) => {
                const d = s.documents.find((x) => x.id === args.id);
                if (!d) throw new Error(`no document "${String(args.id)}" in the library`);
                if (!d.rules) throw new Error(`the document "${d.id}" holds no rules`);
                return { document: d.id, safety: d.rules.safety, rules: d.rules.rules, signed: signatureOf(d.id, s.dir, s.sigDir) };
            },
        },
        {
            name: "read",
            inputSchema: objectSchema({ id: { type: "string" } }, ["id"]),
            handle: (args, s) => {
                const d = s.documents.find((x) => x.id === args.id);
                if (!d) throw new Error(`no document "${String(args.id)}" in the library (${s.documents.map((x) => x.id).join(", ")})`);
                s.reads.push({ id: d.id, sha256: d.sha256, at: new Date().toISOString() });
                return { id: d.id, title: d.title, sha256: d.sha256, text: d.text, facts: d.facts, signature: signatureOf(d.id, s.dir, s.sigDir) };
            },
        },
        {
            // What a person reads before signing (the library page, 2026-09-28): every file the signature binds, as it is on disk now, and the digest a signature would bind.
            name: "review",
            inputSchema: objectSchema({ id: { type: "string" } }, ["id"]),
            handle: (args, s) => {
                const d = s.documents.find((x) => x.id === args.id);
                if (!d) throw new Error(`no document "${String(args.id)}" in the library`);
                return { id: d.id, title: d.title, files: filesOf(s.dir, d.id), facts: loadFacts(s.dir, d.id), rules: loadRules(s.dir, d.id), digest: documentDigest(d.id, s.dir), signature: signatureOf(d.id, s.dir, s.sigDir), signer: person || null, signatures: s.sigScope };
            },
        },
        {
            // An authorised signatory signs a document as reviewed, from the control room: called back by the station with the answer to Mother's question (kind sign), or from the library page. Never a model's: kept out of every harness's and the night agent's tools.
            name: "sign",
            inputSchema: objectSchema({ id: { type: "string" }, by: { type: "string" }, questionId: { type: "string" }, answer: { type: "object" }, digest: { type: "string" } }, ["id"]),
            handle: (args, s) => {
                const d = s.documents.find((x) => x.id === args.id);
                if (!d) throw new Error(`no document "${String(args.id)}" in the library`);
                // A person signs what they read: the digest of what the page showed, which a document changed since no longer has.
                if (typeof args.digest === "string" && args.digest !== documentDigest(d.id, s.dir)) throw new Error(`the document "${d.id}" changed since it was read: read it again before signing`);
                const answer = args.answer && typeof args.answer === "object" ? (args.answer as { choice?: string; by?: string }) : null;
                if (answer && answer.choice !== "sign") return { id: d.id, signed: false, why: `the commander answered ${String(answer.choice)}` };
                // Who signs: the person who answered the question, or who signs on the library page; an authorised signatory, or nobody (2026-09-29).
                const who = typeof args.by === "string" && args.by.trim() ? args.by.trim() : answer?.by?.trim() || person;
                const refused = notHolder(SIGNATORY, who);
                if (refused) throw new Error(`${d.id} is not signed: ${refused}`);
                const signature = signDocument(d.id, who, { dir: s.dir, sigDir: s.sigDir, note: `${s.sigScope.scope === "run" ? `scenario run ${s.sigScope.runId}` : "repository"}${args.questionId ? `, question ${String(args.questionId)}` : ""}` });
                log(`[library] ${d.id} signed by ${who} (${s.sigScope.scope === "run" ? `run ${s.sigScope.runId}'s own signatures` : "the repository's signatures"})`);
                return { id: d.id, signed: true, by: signature.signedBy, at: signature.signedAt, scope: s.sigScope };
            },
        },
        {
            // A scenario run that starts with its documents unsigned (a demonstration): its own signatures, empty; the repository's back at its end.
            name: "signatures_scope",
            inputSchema: objectSchema({ scope: { type: "string", enum: ["repository", "run"] }, runId: { type: "string" } }, ["scope"]),
            handle: (args, s) => {
                if (args.scope === "run") {
                    const runId = String(args.runId ?? "").replace(/[^A-Za-z0-9-]/g, "");
                    if (!runId) throw new Error("a run's signatures need its runId");
                    s.sigDir = path.join(WORKSHOP_ROOT, "scenarios", `signatures-${runId}-${Date.now()}`);
                    s.sigScope = { scope: "run", runId };
                } else {
                    s.sigDir = signaturesDir();
                    s.sigScope = { scope: "repository" };
                }
                log(`[library] signatures: ${s.sigScope.scope === "run" ? `run ${s.sigScope.runId}'s own, empty at its start` : "the repository's"}`);
                return { ...s.sigScope, dir: s.sigDir };
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
