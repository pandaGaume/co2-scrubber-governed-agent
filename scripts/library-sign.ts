/**
 * A person signs a library document as reviewed (2026-09-28):
 *
 *   npm run library:sign -- <document id> "<your name>"
 *   npm run library:sign -- commissioning-test-safety "Guillaume Pelletier"
 *
 * The signature is written to docs/library/signatures/<id>.json with the
 * digest of the document and of its facts as they are now; commit it, the
 * commit is the record. A document changed after it was signed is no longer
 * valid until someone reviews it and signs it again. Without an argument the
 * command lists the documents, where each signature stands, and who may sign.
 *
 * Since 2026-09-29 the terminal asks what the control room asks: the person
 * who signs holds the role authorised-signatory (specs/station/roles.json),
 * or nothing is signed.
 */
import { readdirSync } from "node:fs";
import { isMain } from "../lib/paths.js";
import { notHolder, roleOf, ROLES_FILE, SIGNATORY } from "../lib/roles.js";
import { LIBRARY_DOCS_DIR, signatureOf, signaturesDir, signDocument, type Signature } from "../harness/lib/signatures.js";

/** A signature by a person the role authorised-signatory names; refused for anyone else, before anything is written. */
export function signAsSignatory(id: string, name: string, options: { dir?: string; note?: string } = {}): Signature {
    const refused = notHolder(SIGNATORY, name);
    if (refused) throw new Error(`${id} is not signed: ${refused}`);
    return signDocument(id, name.trim(), { ...(options.dir ? { dir: options.dir } : {}), ...(options.note ? { note: options.note } : {}) });
}

function list(): void {
    const ids = readdirSync(LIBRARY_DOCS_DIR)
        .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
        .map((f) => f.replace(/\.md$/, ""))
        .sort();
    for (const id of ids) {
        const s = signatureOf(id);
        console.log(`${id.padEnd(40)} ${s ? `signed by ${s.by} on ${s.at.slice(0, 10)}${s.valid ? "" : " (NO LONGER VALID: the document changed since)"}` : "not signed"}`);
    }
    const holders = roleOf(SIGNATORY)?.holders ?? [];
    console.log(`\nwho may sign: the role ${SIGNATORY} (${ROLES_FILE}): ${holders.length ? holders.join(", ") : "nobody holds it yet"}`);
    console.log(`sign one: npm run library:sign -- <document id> "<your name>"  (signatures in ${signaturesDir()})`);
}

if (isMain(import.meta.url)) {
    const [id, name, ...note] = process.argv.slice(2);
    if (!id) list();
    else if (!name) {
        console.error(`who signs? npm run library:sign -- ${id} "<your name>"`);
        process.exit(1);
    } else {
        try {
            const s = signAsSignatory(id, name, note.length ? { note: note.join(" ") } : {});
            console.log(`${s.document} signed by ${s.signedBy} on ${s.signedAt}, digest ${s.digest.slice(0, 12)}; commit ${signaturesDir()}/${id}.json to record it`);
        } catch (e) {
            console.error(e instanceof Error ? e.message : String(e));
            process.exit(1);
        }
    }
}
