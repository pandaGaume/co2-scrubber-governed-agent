/**
 * The signatures of the library's documents (2026-09-28): a person's word
 * that a document was reviewed and holds, bound to the document as it was
 * read. A safety procedure's limits are justified only by the facts of a
 * signed document; a value a model found, computed or assumed is not a
 * safety limit ("otherwise we rewrite Chernobyl").
 *
 * A signature is a file, `docs/library/signatures/<id>.json` (the directory
 * is LIBRARY_SIGNATURES_DIR when set), written by `npm run library:sign`, a
 * command a person runs, or by the commander's answer to Mother's question
 * in the control room (`library.sign`, called back by the station; no
 * standing order answers it, and no harness or night agent has the tool):
 * no model can sign. A scenario run may sign in a directory of its own,
 * empty at its start (`library.signatures_scope`). It holds who signed,
 * when, for what scope, and the digest of the document and of its facts as
 * they were signed. A document changed since no longer matches its digest:
 * its signature is kept, and said no longer valid.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fromRoot } from "../../lib/paths.js";

export const LIBRARY_DOCS_DIR = fromRoot("docs", "library");

/** Where the signatures are kept: LIBRARY_SIGNATURES_DIR when set (the tests sign in their own), the library's own directory otherwise. */
export const signaturesDir = (): string => process.env.LIBRARY_SIGNATURES_DIR || path.join(LIBRARY_DOCS_DIR, "signatures");

export interface Signature {
    document: string;
    digest: string;
    signedBy: string;
    signedAt: string;
    scope: string;
    note?: string;
}

export interface SignatureStatus {
    by: string;
    at: string;
    scope: string;
    /** The document and its facts are as they were signed. */
    valid: boolean;
}

/** The digest of a document as a signature binds it: its text and its facts' sidecar, when it has one. */
export function documentDigest(id: string, dir: string = LIBRARY_DOCS_DIR): string {
    const md = path.join(dir, `${id}.md`);
    if (!existsSync(md)) throw new Error(`no document "${id}" in ${dir}`);
    // The text, not the bytes: a checkout that turns LF into CRLF changes no word of what was signed, and must not void the signature.
    const text = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const hash = createHash("sha256").update(text(md));
    const facts = path.join(dir, `${id}.facts.json`);
    hash.update("\n--facts--\n");
    if (existsSync(facts)) hash.update(text(facts));
    // The guard's rules, when the document holds some (2026-09-28): signed with the facts they cite, and a rule changed voids the signature as a fact changed does.
    const rules = path.join(dir, `${id}.rules.json`);
    if (existsSync(rules)) {
        hash.update("\n--rules--\n");
        hash.update(text(rules));
    }
    // The playbook, when the document is one (2026-09-29): what conducts is signed as what judges is, and a stage changed voids the signature.
    const playbook = path.join(dir, `${id}.playbook.json`);
    if (existsSync(playbook)) {
        hash.update("\n--playbook--\n");
        hash.update(text(playbook));
    }
    return hash.digest("hex");
}

/** A person signs a document as reviewed: the signature file, with the digest of what they reviewed. */
export function signDocument(id: string, signedBy: string, options: { dir?: string; sigDir?: string; scope?: string; note?: string } = {}): Signature {
    if (!signedBy.trim()) throw new Error("a signature names the person who signs");
    const dir = options.dir ?? LIBRARY_DOCS_DIR;
    const sigDir = options.sigDir ?? signaturesDir();
    const signature: Signature = { document: id, digest: documentDigest(id, dir), signedBy: signedBy.trim(), signedAt: new Date().toISOString(), scope: options.scope ?? "safety", ...(options.note ? { note: options.note } : {}) };
    mkdirSync(sigDir, { recursive: true });
    writeFileSync(path.join(sigDir, `${id}.json`), `${JSON.stringify(signature, null, 4)}\n`, "utf8");
    return signature;
}

/** A document's signature as it stands now: who, when, and whether the document is still what was signed; null when unsigned. */
export function signatureOf(id: string, dir: string = LIBRARY_DOCS_DIR, sigDir: string = signaturesDir()): SignatureStatus | null {
    const file = path.join(sigDir, `${id}.json`);
    if (!existsSync(file)) return null;
    const s = JSON.parse(readFileSync(file, "utf8")) as Signature;
    let valid = false;
    try {
        valid = s.digest === documentDigest(id, dir);
    } catch {
        valid = false;
    }
    return { by: s.signedBy, at: s.signedAt, scope: s.scope, valid };
}
