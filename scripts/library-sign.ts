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
 * command lists the documents and where each signature stands.
 */
import { readdirSync } from "node:fs";
import { isMain } from "../lib/paths.js";
import { LIBRARY_DOCS_DIR, signatureOf, signaturesDir, signDocument } from "../harness/lib/signatures.js";

function list(): void {
    const ids = readdirSync(LIBRARY_DOCS_DIR)
        .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
        .map((f) => f.replace(/\.md$/, ""))
        .sort();
    for (const id of ids) {
        const s = signatureOf(id);
        console.log(`${id.padEnd(40)} ${s ? `signed by ${s.by} on ${s.at.slice(0, 10)}${s.valid ? "" : " (NO LONGER VALID: the document changed since)"}` : "not signed"}`);
    }
    console.log(`\nsign one: npm run library:sign -- <document id> "<your name>"  (signatures in ${signaturesDir()})`);
}

if (isMain(import.meta.url)) {
    const [id, name, ...note] = process.argv.slice(2);
    if (!id) list();
    else if (!name) {
        console.error(`who signs? npm run library:sign -- ${id} "<your name>"`);
        process.exit(1);
    } else {
        const s = signDocument(id, name, note.length ? { note: note.join(" ") } : {});
        console.log(`${s.document} signed by ${s.signedBy} on ${s.signedAt}, digest ${s.digest.slice(0, 12)}; commit ${signaturesDir()}/${id}.json to record it`);
    }
}
