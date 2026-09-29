/**
 * The tests need every slot: a slot that is not published is a failure
 * here, named, and the broker is stopped before the error leaves the hook,
 * so the runner ends with the message instead of waiting. The server itself
 * treats the same case as a degraded mode (`slots/run-all.ts`).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { startAll } from "../../slots/run-all.js";
import { signDocument } from "../../harness/lib/signatures.js";
import type { LocalBroker } from "../../slots/lib/local-broker.js";
import type { PublishedSlot } from "../../slots/lib/slot-server.js";

const quiet = () => undefined;

export async function startAllOrFail(port: number): Promise<{ broker: LocalBroker; slots: PublishedSlot<object>[] }> {
    // The suite never probes a real CAD: the cad slot is pointed at a closed port (refused at once) unless a test says otherwise; tests/cad.test.ts brings its own stand-in.
    process.env.CAD_MCP_URL ??= "http://127.0.0.1:1/mcp";
    // The station speaks every line of Mother's on the control room; the suite asserts the lines, not the voice.
    process.env.STATION_VOICE ??= "off";
    process.env.SCENARIO_SECONDS_PER_MINUTE ??= "0";
    process.env.STATION_REMIND_SECONDS ??= "0";
    // The suite's roles are its own: the signatories and commanders its tests answer as, never the repository's people.
    if (!process.env.STATION_ROLES_FILE) {
        process.env.STATION_ROLES_FILE = path.join(mkdtempSync(path.join(tmpdir(), "roles-")), "roles.json");
        writeFileSync(process.env.STATION_ROLES_FILE, JSON.stringify({ roles: { "authorised-signatory": { does: "signs for the tests", holders: ["signatory-test", "a reviewer"] }, commander: { does: "decides for the tests", holders: ["commander-test"] } } }));
    }
    // What a factory proposes to the library goes on the suite's own shelf, never beside the repository's workshops.
    process.env.LIBRARY_PROPOSALS_DIR ??= mkdtempSync(path.join(tmpdir(), "library-proposals-"));
    // The suite signs the safety card in a directory of its own: the repository's signatures are a person's, never a test's.
    if (!process.env.LIBRARY_SIGNATURES_DIR) {
        process.env.LIBRARY_SIGNATURES_DIR = mkdtempSync(path.join(tmpdir(), "signatures-"));
        signDocument("commissioning-test-safety", "the test suite", { note: "signed for the tests only" });
    }
    const started = await startAll(port, quiet, "ignore");
    if (started.failures.length) {
        await started.stop();
        throw new Error(`${started.failures.map((f) => `slot "${f.slot}" is not published: ${f.reason}`).join("; ")}; the broker on port ${port} was stopped`);
    }
    return { broker: started.broker, slots: started.slots };
}
