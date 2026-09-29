// The conditions of the memory's experiment (2026-09-29, Guillaume's matrix): forks cloned from the frozen trained fork, the same
// recipes, the same long-term memory file, the same training tasks in the workshop (the working memory's previous episodes),
// and nothing different but what each condition reads (specs/harness/memory.json of the fork):
//
//   A  control            previous tasks' working memory off, consolidated long-term memory off
//   B  working memory     previous tasks' working memory on,  long-term memory off
//   C  long-term memory   previous tasks' working memory off, long-term memory on
//   D  the whole system   both on
//
// Learning stays off in every one: their servers run without --learn and the driver never reflects in a validation.
//
//   npm run build
//   node scripts/learning-experiment/conditions.mjs <trained fork> <prefix> [A B C D]
import { fileURLToPath, pathToFileURL } from "node:url";
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createFork, forkPath, snapshotFork } = await import(pathToFileURL(path.join(ROOT, "dist", "lib", "fork.js")).href);
const [trained, prefix, ...only] = process.argv.slice(2);
const CONDITIONS = {
    A: { previousTasks: false, read: false, what: "control: no previous tasks' episodes, no long-term memory" },
    B: { previousTasks: true, read: false, what: "working memory: the previous tasks' episodes, no long-term memory" },
    C: { previousTasks: false, read: true, what: "long-term memory: the consolidated entries, no previous tasks' episodes" },
    D: { previousTasks: true, read: true, what: "the whole system: both" },
};
const sha = (file) => (existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex") : null);
const from = path.join(forkPath(trained), "outputs", "factory");
const record = {};
for (const [id, c] of Object.entries(CONDITIONS)) {
    if (only.length && !only.includes(id)) continue;
    const fork = `${prefix}-${id.toLowerCase()}`;
    createFork(fork, { from: trained });
    const dir = forkPath(fork);
    // The training tasks, whose manifests the working memory reads (the fork's history does not carry them).
    for (const t of readdirSync(from).filter((d) => /^t-/.test(d))) cpSync(path.join(from, t), path.join(dir, "outputs", "factory", t), { recursive: true });
    const file = path.join(dir, "specs", "harness", "memory.json");
    const settings = JSON.parse(readFileSync(file, "utf8"));
    settings.workingMemory.previousTasks = c.previousTasks;
    settings.longTerm = { ...(settings.longTerm ?? {}), read: c.read };
    writeFileSync(file, `${JSON.stringify(settings, null, 4)}\n`);
    snapshotFork(fork, `condition ${id}, ${c.what} (previousTasks ${c.previousTasks}, longTerm.read ${c.read})`);
    record[id] = {
        fork,
        ...c,
        memory: sha(path.join(dir, "outputs", "factory", "memory", "procedure.json")),
        ledger: sha(path.join(dir, "outputs", "factory", "adaptations", "ledger.json")),
        recipes: sha(path.join(dir, "outputs", "factory", "_recipes", "procedure.json")),
        trainingTasks: readdirSync(path.join(dir, "outputs", "factory")).filter((d) => /^t-/.test(d)).length,
    };
    console.log(`${id} ${fork}: previousTasks ${c.previousTasks}, longTerm.read ${c.read}; memory ${record[id].memory?.slice(0, 12)}, ledger ${record[id].ledger?.slice(0, 12)}, recipes ${record[id].recipes?.slice(0, 12)}, ${record[id].trainingTasks} training task(s)`);
}
const same = (k) => new Set(Object.values(record).map((r) => r[k])).size === 1;
console.log(`the same memory, ledger, recipes and training tasks in every condition: ${same("memory") && same("ledger") && same("recipes") && same("trainingTasks")}`);
process.stdout.write(`${JSON.stringify(record)}\n`);
