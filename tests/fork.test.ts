/**
 * Forks of the context (2026-09-29, P3 of docs/comportement-en-donnees.fr.md): an environment set apart, where the
 * agents change the library, the specs, the graphs, and where what they change is observed, never reaching the
 * repository's.
 *
 *   the fork: the context taken whole with the commit it was taken from; a snapshot a commit of what changed; the
 *             history the evolution; the divergence against the repository; a fork of a fork a clone, with its history.
 *   the tightness: a server in a fork, its agents changing its roles, a factory writing a playbook, the station
 *             proposing it, a signatory of the fork signing it; everything lands in the fork, marked as the fork's,
 *             and the repository's library, specs and graphs are byte for byte what they were.
 *
 * The modules that read where the data is are imported once FORK_DIR is set: a server of a fork is a process of its
 * own, as this test file is (node --test runs each file in its own).
 *
 *     node --test dist/tests/
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { COPIED, createFork, forkDivergence, forkHistory, forkPath, listForks, readFork, removeFork, snapshotFork } from "../lib/fork.js";
import { fromRepository, fromRoot } from "../lib/paths.js";
import { Broker } from "../harness/lib/broker.js";

const PORT = 3161;
/** Who asks for the fork's task: what finds its workshop wherever it is. A task's id is the first free number of its own
 * workshop, so the fork's first task and another test's in the repository may share a name: the name proves nothing. */
const REQUESTED_BY = `the fork's test ${process.pid}`;

/** The repository's workshops of tasks asked by someone: none, for the fork's. */
function repositoryTasksBy(requestedBy: string): string[] {
    const root = fromRepository("outputs", "factory");
    if (!existsSync(root)) return [];
    return readdirSync(root).filter((d) => {
        const file = path.join(root, d, "task.json");
        if (!existsSync(file)) return false;
        try {
            return (JSON.parse(readFileSync(file, "utf8")) as { task?: { requestedBy?: string } }).task?.requestedBy === requestedBy;
        } catch {
            return false;
        }
    });
}

/** Every file of the repository's context, with its sha256: what a fork must leave as it was. */
function contextHashes(): Map<string, string> {
    const out = new Map<string, string>();
    const walk = (rel: string) => {
        const full = fromRepository(...rel.split("/"));
        if (!existsSync(full)) return;
        if (statSync(full).isDirectory()) for (const name of readdirSync(full)) walk(`${rel}/${name}`);
        else out.set(rel, createHash("sha256").update(readFileSync(full)).digest("hex"));
    };
    for (const d of COPIED) walk(d);
    return out;
}

describe("a fork of the context", () => {
    const forks = mkdtempSync(path.join(tmpdir(), "forks-"));
    before(() => {
        process.env.FORKS_DIR = forks;
    });
    after(() => {
        delete process.env.FORKS_DIR;
        delete process.env.FORK_DIR;
        rmSync(forks, { recursive: true, force: true });
    });

    it("takes the context whole, keeps what changes as snapshots, measures its divergence, and forks again with its history", () => {
        const fork = createFork("evolve");
        assert.equal(fork.parent, null);
        assert.match(String(fork.origin.commit), /^[0-9a-f]{40}$/, "the repository commit the context was taken from");
        for (const d of COPIED) assert.ok(existsSync(path.join(forkPath("evolve"), ...d.split("/"))), `${d} is in the fork`);
        assert.deepEqual(forkDivergence("evolve"), { added: [], changed: [], removed: [] }, "a fork taken now is the context as it is");
        assert.equal(snapshotFork("evolve", "nothing"), null, "nothing changed, no snapshot");

        // An agent changes a bound of the recovery playbook, and writes a spec of its own.
        const file = path.join(forkPath("evolve"), "specs", "commissioning", "recovery.playbook.json");
        writeFileSync(file, readFileSync(file, "utf8").replace('"atLeast": 3', '"atLeast": 2'));
        writeFileSync(path.join(forkPath("evolve"), "specs", "commissioning", "note.json"), "{}\n");
        const s = snapshotFork("evolve", "the agents' first change");
        assert.deepEqual(s?.files, [
            { status: "A", path: "specs/commissioning/note.json" },
            { status: "M", path: "specs/commissioning/recovery.playbook.json" },
        ]);
        assert.deepEqual(forkHistory("evolve").map((c) => [c.label, c.files.length > 0]), [
            [`fork evolve, the context as taken from ${fork.origin.commit!.slice(0, 12)}${fork.origin.dirty ? " (with changes not committed)" : ""}`, true],
            ["the agents' first change", true],
        ]);
        assert.deepEqual(forkDivergence("evolve"), { added: ["specs/commissioning/note.json"], changed: ["specs/commissioning/recovery.playbook.json"], removed: [] });
        assert.match(readFileSync(fromRepository("specs", "commissioning", "recovery.playbook.json"), "utf8"), /"atLeast": 3/, "the repository's is untouched");

        // A fork of the fork: its parent's history, and its own from there.
        const child = createFork("evolve-again", { from: "evolve" });
        assert.equal(child.parent, "evolve");
        assert.deepEqual(forkHistory("evolve-again").map((c) => c.label).slice(0, 3), [forkHistory("evolve")[0].label, "the agents' first change", "fork evolve-again, from the fork evolve"]);
        assert.deepEqual(listForks().map((f) => f.id).sort(), ["evolve", "evolve-again"]);
        removeFork("evolve-again");
        assert.throws(() => readFork("evolve-again"), /no fork "evolve-again"/);
        // Its commits are the fork's: authored by it, signed by nobody's key.
        const log = readFileSync(path.join(forkPath("evolve"), ".git", "config"), "utf8");
        assert.match(log, /name = fork evolve/);
        assert.match(log, /gpgsign = false/);
    });

    it("is tight: a server in the fork, its agents changing its roles, writing, proposing and signing a playbook; all of it in the fork, marked as the fork's, the repository's context byte for byte as it was", async () => {
        const id = "tight";
        createFork(id);
        const dir = forkPath(id);
        const before = contextHashes();

        // The process runs in the fork from here: the modules that read where the data is are loaded now.
        for (const k of ["LIBRARY_SIGNATURES_DIR", "LIBRARY_PROPOSALS_DIR", "STATION_ROLES_FILE", "WORKSHOP_DIR", "FACTORY_RECIPES_DIR"]) process.env[k] = path.join(tmpdir(), "never-used-in-a-fork");
        process.env.FORK_DIR = dir;
        process.env.SPEECH_PROVIDER = "silent";
        process.env.STATION_VOICE = "off";
        process.env.CAD_MCP_URL = "http://127.0.0.1:1/mcp";
        assert.equal(fromRoot("docs", "library"), path.join(dir, "docs", "library"), "the library is the fork's");
        assert.equal(fromRoot("dashboard"), fromRepository("dashboard"), "the code is the repository's");

        // The agents of the fork change who may sign there: a change of the fork's roles, the repository's untouched.
        const roles = path.join(dir, "specs", "station", "roles.json");
        const r = JSON.parse(readFileSync(roles, "utf8")) as { roles: Record<string, { holders: string[] }> };
        r.roles["authorised-signatory"].holders = ["fork-signatory"];
        writeFileSync(roles, JSON.stringify(r, null, 4));

        const { startAll } = await import("../slots/run-all.js");
        const started = await startAll(PORT, () => undefined, "ignore");
        const operator = new Broker(started.broker.httpBase, { name: "fork-test", version: "0", locale: "en" });
        try {
            const ok = async <T>(slot: string, tool: string, args: Record<string, unknown> = {}): Promise<T> => {
                const x = await operator.call(slot, tool, args);
                assert.ok(x.ok, `${slot}.${tool}: ${x.error}`);
                return x.output as T;
            };
            const read = async <T>(slot: string, uri: string): Promise<T> => JSON.parse((await (await operator.session(slot)).request<{ contents: Array<{ text: string }> }>("resources/read", { uri })).contents[0].text) as T;
            assert.deepEqual((await read<{ fork: { id: string } | null }>("station", "station://environment")).fork?.id, id);

            // A factory of the fork writes a playbook; the station of the fork proposes it and asks the fork's signatory.
            const { taskId } = await ok<{ taskId: string }>("factory", "request", {
                objective: { required_outputs: [{ name: "fork-recovery", quantity: "Playbook" }] },
                observations: {
                    playbook: { id: "fork-recovery", title: "The fork's recovery", change: "two aborts, not three", base: "specs/commissioning/recovery.playbook.json", words: "specs/commissioning/words.json", actions: ["go-on", "ask", "end", "reopen"], capabilities: ["station.commissioning_reopen"] },
                    script: { bound: { node: "exhausted", atLeast: 2 } },
                },
                topics: ["playbook"],
                builder: "scripted",
                requestedBy: REQUESTED_BY,
            });
            let task: { state: string; run?: { ended?: string | null }; manifest?: { fork?: string } } = { state: "running" };
            for (let t0 = Date.now(); !task.run?.ended && Date.now() - t0 < 60_000; await new Promise((x) => setTimeout(x, 300))) task = await ok("factory", "task", { taskId });
            assert.equal(task.state, "proposed");
            assert.equal(task.manifest?.fork, id, "the task's manifest says it ran in the fork");
            assert.equal((JSON.parse(readFileSync(path.join(dir, "outputs", "factory", taskId, "task.json"), "utf8")) as { task: { requestedBy: string } }).task.requestedBy, REQUESTED_BY, "the task's workshop is the fork's");
            assert.ok(!repositoryTasksBy(REQUESTED_BY).length, "not the repository's");

            const q = (await read<Array<{ id: string; kind: string; status: string; holders?: string[]; context: { document?: string } }>>("station", "station://questions")).find((x) => x.kind === "sign" && x.context.document === "fork-recovery");
            assert.deepEqual(q?.holders, ["fork-signatory"], "the fork's roles, as its agents changed them; the variables set outside are ignored");
            await ok("station", "answer", { questionId: q!.id, choice: "sign", by: "fork-signatory", how: "script" });
            const signed = await ok<{ signed: { by: string; valid: boolean } | null }>("library", "playbook", { id: "fork-recovery" });
            assert.deepEqual([signed.signed?.by, signed.signed?.valid], ["fork-signatory", true]);
            const signature = JSON.parse(readFileSync(path.join(dir, "docs", "library", "signatures", "fork-recovery.json"), "utf8")) as { fork?: string; note?: string };
            assert.equal(signature.fork, id);
            assert.match(signature.note ?? "", /in the fork tight/);
            const mother = await read<Array<{ fork?: string }>>("station", "station://mother");
            assert.ok(mother.length > 0 && mother.every((l) => l.fork === id), "every line of Mother's there is the fork's");
        } finally {
            await operator.close();
            await started.stop();
        }

        // The evolution, observed: what the fork's agents changed, in one snapshot.
        const s = snapshotFork(id, "the fork's agents at work");
        const changed = (s?.files ?? []).map((f) => f.path);
        for (const f of ["specs/station/roles.json", "docs/library/signatures/fork-recovery.json", "outputs/factory/library-proposals/fork-recovery.md", "outputs/factory/library-proposals/fork-recovery.playbook.json"]) assert.ok(changed.includes(f), `${f} in the snapshot: ${changed.join(", ")}`);
        assert.ok(forkDivergence(id).changed.includes("specs/station/roles.json"));

        // The repository: its library, specs and graphs byte for byte; no workshop, proposal or signature of the fork's.
        delete process.env.FORK_DIR;
        const after = contextHashes();
        assert.deepEqual([...after.keys()].filter((k) => before.get(k) !== after.get(k)), [], "no file of the repository's context changed");
        assert.deepEqual([...before.keys()].filter((k) => !after.has(k)), []);
        assert.equal(after.size, before.size);
        assert.ok(!existsSync(fromRepository("docs", "library", "signatures", "fork-recovery.json")));
        assert.ok(!existsSync(fromRepository("outputs", "factory", "library-proposals", "fork-recovery.md")));
        assert.deepEqual(repositoryTasksBy(REQUESTED_BY), [], "no workshop of the fork's in the repository");
    });
});
