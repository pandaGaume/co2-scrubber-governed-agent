/**
 * The register of a guard's rules (2026-09-30, docs/evaluateur.fr.md, E2): `specs/<topic>/rules.contract.json` read, with the rules of
 * the signed document the topic's format names (their ids, recognised by their own words). For each rule, the code a refusal's
 * problem is recognised by (the model reads nothing new: the refusals as they were written, of before as of now), the texts of the
 * contract that state it, the conventions it assumes, and whether a text a task was given held the statement: its file at the
 * version the task ran under (the workshop's store for the words, git at its commit otherwise), a library document only if the
 * task read it before its first submission.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot } from "./paths.js";

/** A text of the contract that states a rule: a file (a JSON Pointer into it) or a library document, and the phrase it must hold. */
export interface Statement {
    file?: string;
    pointer?: string;
    library?: string;
    phrase: string;
}

export type RuleStatus = "stated" | "tacit" | "gap";

export interface RegisteredRule {
    code: string;
    /** The kind its problems start with, for a rule of the signed document. */
    kind?: string;
    /** Patterns over one problem of a refusal (its kind included). */
    match: RegExp[];
    /** The words of a signed rule, which its problems end with. */
    says?: string;
    example?: string;
    /** Refusals as the guard wrote them before the rules were the signed document's, recognised by the older patterns. */
    examples?: string[];
    states: Statement[];
    applies: string[];
    status: RuleStatus;
    note?: string;
    signed: boolean;
    /** What it is about when it is the library rather than the contract (D7). */
    concerns?: "library";
}

export interface Register {
    topic: string;
    file: string;
    rules: RegisteredRule[];
    conventions: Record<string, { note?: string; states: Statement[] }>;
}

interface RegisterFile {
    topic: string;
    conventions?: Record<string, { note?: string; states: Statement[] }>;
    signed?: Record<string, { states?: Statement[]; status?: RuleStatus; note?: string; applies?: string[]; older?: string[]; examples?: string[] }>;
    rules: Array<{ code: string; match: string[]; example?: string; states?: Statement[]; status?: RuleStatus; note?: string; applies?: string[]; concerns?: "library" }>;
}

interface SignedRuleFile {
    id: string;
    kind: string;
    says?: string;
    watch?: { unread?: { kind: string; says?: string }; blocked?: { kind?: string; says: string } };
}

export const registerFileOf = (topic: string): string => `specs/${topic}/rules.contract.json`;

const readJson = <T>(file: string): T | null => {
    try {
        return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
        return null;
    }
};

/** The first clause of a signed rule's words: a refusal is cut on its "; ", so what it ends with is that. */
const firstClause = (says: string): string => says.split("; ")[0];
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A topic's register, with the rules of the signed document its format names; none when the topic has no register. */
export function loadRegister(topic: string): Register | null {
    const file = registerFileOf(topic);
    const spec = readJson<RegisterFile>(fromRoot(...file.split("/")));
    if (!spec) return null;
    const rules: RegisteredRule[] = spec.rules.map((r) => ({
        code: r.code,
        match: r.match.map((m) => new RegExp(m)),
        ...(r.example ? { example: r.example } : {}),
        states: r.states ?? [],
        applies: r.applies ?? [],
        status: r.status ?? "stated",
        ...(r.note ? { note: r.note } : {}),
        signed: false,
        ...(r.concerns ? { concerns: r.concerns } : {}),
    }));
    const format = readJson<{ rulesDocument?: string }>(fromRoot("specs", topic, "format.json"));
    const document = format?.rulesDocument ? readJson<{ rules: SignedRuleFile[] }>(fromRoot("docs", "library", `${format.rulesDocument}.rules.json`)) : null;
    const signed = (code: string, kind: string, says: string | undefined): RegisteredRule => {
        const entry = spec.signed?.[code];
        return {
            code,
            kind,
            match: [...(says ? [new RegExp(`^${escape(kind)}: .*${escape(firstClause(says))}`)] : []), ...(entry?.older ?? []).map((m) => new RegExp(m))],
            ...(says ? { says } : {}),
            ...(entry?.examples ? { examples: entry.examples } : {}),
            states: entry?.states ?? [],
            applies: entry?.applies ?? [],
            status: entry?.status ?? (entry?.states?.length ? "stated" : "gap"),
            ...(entry?.note ? { note: entry.note } : {}),
            signed: true,
        };
    };
    for (const r of document?.rules ?? []) {
        rules.push(signed(r.id, r.kind, r.says));
        if (r.watch?.unread) rules.push(signed(`${r.id}.unread`, r.watch.unread.kind, r.watch.unread.says));
        if (r.watch?.blocked) rules.push(signed(`${r.id}.blocked`, r.watch.blocked.kind ?? r.kind, r.watch.blocked.says));
    }
    return { topic, file, rules, conventions: spec.conventions ?? {} };
}

/** The codes one problem of a refusal is recognised by (none: a check the register does not hold). */
export function codesOf(register: Register, problem: string): string[] {
    return register.rules.filter((r) => r.match.some((m) => m.test(problem))).map((r) => r.code);
}

/** Where a task's texts are read: a git repository and the commit it ran under (null: the working tree), and its words as stored. */
export interface TextVersion {
    cwd: string;
    commit: string | null;
    /** The words file as the workshop's store kept it for the task: the exact text, adaptations in a fork included. */
    words?: { file: string; text: string };
}

const shown = new Map<string, string | null>();
/** A file of the contract at a version: git at its commit, or the working tree. */
export function textAt(version: TextVersion, file: string): string | null {
    if (version.words && version.words.file === file) return version.words.text;
    if (!version.commit) {
        const full = path.join(version.cwd, ...file.split("/"));
        return existsSync(full) ? readFileSync(full, "utf8") : null;
    }
    const key = `${version.cwd}|${version.commit}|${file}`;
    if (!shown.has(key)) {
        try {
            shown.set(key, execFileSync("git", ["show", `${version.commit}:${file}`], { cwd: version.cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 }));
        } catch {
            shown.set(key, null);
        }
    }
    return shown.get(key) ?? null;
}

/** A value in a JSON document by a JSON Pointer (~1 a slash, ~0 a tilde); undefined when absent. */
function at(document: unknown, pointer: string): unknown {
    let v = document;
    for (const raw of pointer.split("/").slice(1)) {
        const k = raw.replace(/~1/g, "/").replace(/~0/g, "~");
        if (v === null || typeof v !== "object") return undefined;
        v = (v as Record<string, unknown>)[k];
    }
    return v;
}

/** The text a statement points at in a file's content: the whole, or the value at its pointer. */
export function statementText(stmt: Statement, content: string | null): string | null {
    if (content === null) return null;
    if (!stmt.pointer) return content;
    try {
        const v = at(JSON.parse(content), stmt.pointer);
        return v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
    } catch {
        return null;
    }
}

/** The file a statement is read from. */
export const statementFile = (stmt: Statement): string => (stmt.library ? `docs/library/${stmt.library}.md` : stmt.file!);

/** A statement's id in the graph: where it is and what it must say. */
export const statementKey = (stmt: Statement): string => `${stmt.library ? `library:${stmt.library}` : stmt.file}${stmt.pointer ? `#${stmt.pointer}` : ""}|${stmt.phrase}`;

/**
 * Whether a task was given a statement: its phrase in the text at the task's version, and, for a library document, the document read
 * before its first submission. Null when the task's version is not known.
 */
export function stated(stmt: Statement, version: TextVersion | null, libraryRead: ReadonlySet<string>): boolean | null {
    if (!version) return null;
    if (stmt.library && !libraryRead.has(stmt.library)) return false;
    return statementText(stmt, textAt(version, statementFile(stmt)))?.includes(stmt.phrase) ?? false;
}
