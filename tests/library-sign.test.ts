/**
 * The terminal's signature (`npm run library:sign`) asks what the control room asks (2026-09-29): the person who
 * signs holds the role authorised-signatory, or nothing is written. Signed in a directory of the test's own, with
 * roles of the test's own: the repository's signatures and people are never a test's.
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fromRoot } from "../lib/paths.js";
import { signAsSignatory } from "../scripts/library-sign.js";
import { signatureOf } from "../harness/lib/signatures.js";

describe("npm run library:sign", () => {
    let dir = "";
    const env: Record<string, string | undefined> = {};
    before(() => {
        dir = mkdtempSync(path.join(tmpdir(), "library-sign-"));
        for (const k of ["LIBRARY_SIGNATURES_DIR", "STATION_ROLES_FILE"]) env[k] = process.env[k];
        process.env.LIBRARY_SIGNATURES_DIR = path.join(dir, "signatures");
        process.env.STATION_ROLES_FILE = path.join(dir, "roles.json");
        writeFileSync(process.env.STATION_ROLES_FILE, JSON.stringify({ roles: { "authorised-signatory": { does: "signs for this test", holders: ["A. Signatory"] } } }));
    });
    after(() => {
        for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
        else process.env[k] = v;
        rmSync(dir, { recursive: true, force: true });
    });

    it("refuses a person the role does not name, and writes nothing", () => {
        assert.throws(() => signAsSignatory("station-topology", "a passer-by"), /station-topology is not signed: "a passer-by" does not hold the role authorised-signatory/);
        assert.equal(existsSync(path.join(dir, "signatures", "station-topology.json")), false);
        assert.equal(signatureOf("station-topology"), null);
    });

    it("signs for a holder of the role, whatever the case of the name", () => {
        const s = signAsSignatory("station-topology", "a. signatory ");
        assert.equal(s.signedBy, "a. signatory");
        assert.equal(signatureOf("station-topology")?.valid, true);
    });

    it("the command itself: a refusal exits 1 with the reason, and the list says who may sign", () => {
        const script = fromRoot("dist", "scripts", "library-sign.js");
        const refused = spawnSync(process.execPath, [script, "station-topology", "a passer-by"], { encoding: "utf8", env: process.env });
        assert.equal(refused.status, 1);
        assert.match(refused.stderr, /does not hold the role authorised-signatory \(specs\/station\/roles\.json: A\. Signatory\)/);
        const listed = spawnSync(process.execPath, [script], { encoding: "utf8", env: process.env });
        assert.equal(listed.status, 0);
        assert.match(listed.stdout, /who may sign: the role authorised-signatory \(specs\/station\/roles\.json\): A\. Signatory/);
    });
});
