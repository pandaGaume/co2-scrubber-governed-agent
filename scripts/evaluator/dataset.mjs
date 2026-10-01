/**
 * The diagnoses' dataset swept from the workshops (2026-10-01, docs/evaluateur.fr.md, E5.3): every diagnosis task that has ended,
 * in the repository's workshop and in the forks', written to datasets/diagnosis/ once (lib/diagnosis-dataset.ts). The factory writes
 * an entry when a diagnosis task ends; this finds the ones it missed (a task of before, a fork's workshop read from here). An entry
 * kept is never overwritten. Built code only (npm run build first).
 *
 *     node scripts/evaluator/dataset.mjs                 the repository's workshop and every fork's
 *     node scripts/evaluator/dataset.mjs <dir> [<dir>]   these workshops only (a fork's outputs/factory, a copy)
 */
import { existsSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const { recordDiagnosisTask, datasetDir } = await import(pathToFileURL(path.join(root, "dist", "lib", "diagnosis-dataset.js")).href);

const given = process.argv.slice(2);
const workshops = given.length
    ? given.map((d) => ({ name: path.basename(path.resolve(d, "..", "..")) || "workshop", dir: path.resolve(d) }))
    : [
          { name: "repository", dir: path.join(root, "outputs", "factory") },
          ...(existsSync(path.join(root, "outputs", "forks")) ? readdirSync(path.join(root, "outputs", "forks")).map((id) => ({ name: id, dir: path.join(root, "outputs", "forks", id, "outputs", "factory") })) : []),
      ];
let seen = 0;
let written = 0;
for (const { name, dir } of workshops.filter((w) => existsSync(w.dir))) {
    for (const t of readdirSync(dir).filter((d) => d.startsWith("t-"))) {
        if (!existsSync(path.join(dir, t, "manifest.json"))) continue;
        const r = recordDiagnosisTask(path.join(dir, t), { workshop: name });
        if (!r) continue;
        seen++;
        if (r.written) {
            written++;
            console.log(`${name}/${t} -> ${path.relative(root, r.file)}`);
        }
    }
}
console.log(`${seen} diagnosis task(s) seen, ${written} written to ${path.relative(root, datasetDir())}`);
