// The learning experiment (2026-09-29, Guillaume's protocol): procedure tasks driven one by one on a fork's server, each on a
// commissioning of its own (the scene registered under a suffix of its own), with its own CO2 at the start and its own occupancy of
// the Lab. For every task: the FIRST procedure submission the guard judged (a refusal before the guard, such as a submit before the
// plan, is recorded apart and never counted as the guard's). In the training phase only, the station's reflection is asked after each
// task (focused on it); learning freezes at the first adaptation adopted whose judged family is the repeated failure's form, and
// the training stops there. The validation phase never reflects: no adaptation can come of it. The fork's server runs without
// --learn (npm run fork -- run <id> --port <port> --profile <profile>), so nothing reflects but this driver. Results and the
// report of the first run: docs/experiments/2026-09-29-learning/.
//
//   npm run build
//   node scripts/learning-experiment/run.mjs <port> <phase: train|validate> <tasks.json> <out.json> [builder: reasoner|scripted]
//   node scripts/learning-experiment/report.mjs <train.json> <validation-with.json> <validation-without.json>
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as path from "node:path";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").split(path.sep).join("/");
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const { Broker } = await imp("dist/harness/lib/broker.js");
const { shapesOf } = await imp("dist/lib/reflection.js");
const { problemsOfReason } = await imp("dist/harness/core/problems.js");
const [port, phase, tasksFile, outFile, builder = "reasoner"] = process.argv.slice(2);
const variants = JSON.parse(readFileSync(tasksFile, "utf8"));
const broker = new Broker(`http://localhost:${port}`, { name: `experiment-${phase}`, version: "0", locale: "en" });
const call = async (slot, tool, args = {}) => {
    const r = await broker.call(slot, tool, args);
    if (!r.ok) throw new Error(`${slot}.${tool}: ${r.error}`);
    return r.output;
};
const read = async (slot, uri) => JSON.parse((await (await broker.session(slot)).request("resources/read", { uri })).contents[0].text);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (taskId, ms = 20 * 60_000) => {
    for (let t0 = Date.now(); Date.now() - t0 < ms; await sleep(2000)) {
        const s = await call("factory", "task", { taskId });
        if (s.run?.ended) return s;
    }
    throw new Error(`task ${taskId} did not end`);
};
const env = (await read("station", "station://environment")).fork;
const scene = JSON.parse(readFileSync(`${ROOT}/specs/commissioning-devices.json`, "utf8"));
const ledger = () => {
    try {
        return JSON.parse(readFileSync(`${env.dir}/outputs/factory/adaptations/ledger.json`, "utf8"));
    } catch {
        return [];
    }
};
// What the memory is before and after (2026-09-29, the memory's experiment): the ledger, the domain's memory file, the settings;
// a validation must leave all three as they were.
const fileOf = (...parts) => path.join(env.dir, ...parts);
const sha = (file) => {
    try {
        return createHash("sha256").update(readFileSync(file)).digest("hex");
    } catch {
        return null;
    }
};
const fingerprint = () => ({ ledger: sha(fileOf("outputs", "factory", "adaptations", "ledger.json")), memory: sha(fileOf("outputs", "factory", "memory", "procedure.json")), settings: sha(fileOf("specs", "harness", "memory.json")) });
const memoryFile = () => {
    try {
        return JSON.parse(readFileSync(fileOf("outputs", "factory", "memory", "procedure.json"), "utf8"));
    } catch {
        return null;
    }
};
const settings = JSON.parse(readFileSync(fileOf("specs", "harness", "memory.json"), "utf8"));
/** What the model's state held of the memory when it decided a step: read from the request the trace kept. */
const memorySeen = (taskId, n) => {
    try {
        const line = readFileSync(fileOf("outputs", "factory", taskId, "trace.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((l) => l.n === n);
        // The observation's text, however deeply the request kept it escaped: the line after "Reasoning state" is the state.
        const find = (v) => {
            if (typeof v === "string") {
                const lines = v.split("\n");
                const i = lines.findIndex((l) => l.startsWith("Reasoning state"));
                if (i >= 0 && lines[i + 1]) return JSON.parse(lines[i + 1]);
                if (/^[[{]/.test(v.trim())) {
                    try {
                        return find(JSON.parse(v));
                    } catch {
                        return null;
                    }
                }
                return null;
            }
            // A script's request keeps the state as it is (an object with its phase and its next actions).
            if (v && typeof v === "object" && !Array.isArray(v) && "phase" in v && "nextActions" in v) return v;
            if (v && typeof v === "object") for (const x of Object.values(v)) {
                const found = find(x);
                if (found) return found;
            }
            return null;
        };
        const state = find(line?.exchange?.request ?? null);
        if (!state) return null;
        const memory = state.memory ?? null;
        return { learned: (memory?.learned ?? []).map((e) => ({ rule: e.rule, status: e.status })), episodes: (memory?.episodes ?? []).length, previousEpisodes: (memory?.episodes ?? []).filter((e) => !e.current).length };
    } catch {
        return null;
    }
};
const out = { fork: env.id, phase, builder, settings: { workingMemory: settings.workingMemory, longTerm: settings.longTerm ?? { read: true } }, startedAt: new Date().toISOString(), fingerprintBefore: fingerprint(), memoryBefore: memoryFile(), tasks: [], reflections: [], frozen: null };
const failures = new Map();

for (const v of variants) {
    // A commissioning of its own: the scene under this task's suffix.
    const suffix = `-${v.id}`;
    const devices = scene.devices.map((d) => ({ ...d, path: d.path.replace(/(\/[a-z0-9-]+)$/, `$1${suffix}`), descriptor: { ...d.descriptor, links: (d.descriptor.links ?? []).map((l) => ({ ...l, href: l.href.replace(/(\/[a-z0-9-]+)$/, `$1${suffix}`) })) } }));
    let commissioningId = null;
    for (const d of devices) {
        const r = await call("station", "registry_register", d);
        if (r.commissioning) commissioningId = r.commissioning;
    }
    await call("station", "registry_report", { path: devices.find((d) => d.descriptor["@type"] === "Battery").path, readings: { stateOfCharge: 80 } });
    const scrubber = devices.find((d) => d.descriptor["@type"] === "Scrubber").path;
    // The Lab's occupancy and CO2 for this task.
    for (const subjectId of ["fe-1", "fe-2", "cdr", "fe-3"]) await call("biomed", "move", { subjectId, module: v.lab.includes(subjectId) ? "lab" : "hab-b" });
    await call("scrubber", "debug.set_co2", { state: "NOMINAL", ppm: v.co2Ppm });
    const sensor = devices.find((d) => d.descriptor["@type"] === "Co2Sensor" && /\/lab\//.test(d.path)).path;
    await call("station", "registry_report", { path: sensor, readings: { co2: v.co2Ppm } });
    const active = ledger().filter((e) => e.status === "adopted" || e.status === "kept").map((e) => e.n);
    const { taskId } = await call("factory", "request", {
        objective: { required_outputs: [{ name: "V_lab", quantity: "Volume", unit: "m3" }] },
        observations: { device: scrubber, measured: { co2Ppm: v.co2Ppm, source: `${sensor} (co2)`, at: new Date().toISOString() }, ...(v.previous ? { previous: v.previous } : {}) },
        topics: ["procedure"],
        builder,
        budget: { iterations: 25, minutes: 15 },
        requestedBy: `experiment ${phase} ${v.id}`,
    });
    const t = await until(taskId);
    const steps = t.manifest?.steps ?? [];
    const submits = steps.filter((s) => s.capability === "procedure.submit" || s.capability === "procedure.revise");
    // The guard's judgement is marked in the manifest (judged); a submission the harness stopped before the guard is not one.
    const judged = submits.find((s) => s.judged);
    const preGuard = submits.filter((s) => !s.judged && s.outcome === "refused" && (!judged || s.n < judged.n));
    const problems = judged?.outcome === "refused" ? problemsOfReason(judged.reason ?? "").filter((p) => p.kind) : [];
    const safetyJust = (judged?.input?.justifications ?? judged?.input?.procedure?.justifications ?? []).filter((j) => /^(limits\.|steps\.\d+\.speedPercent|abort\.|monitoring\.band\.)/.test(String(j.constant)));
    const row = {
        variant: v,
        taskId,
        state: t.manifest?.state ?? t.state,
        firstGuardSubmission: judged ? { capability: judged.capability, accepted: judged.judged === "accepted", problems: problems.map((p) => ({ kind: p.kind, path: p.path ?? null, says: p.says.slice(0, 400) })), shapes: judged.judged === "refused" ? shapesOf(judged.reason) : [], references: safetyJust.map((j) => ({ constant: j.constant, value: j.value, source: j.source, reference: j.reference })) } : null,
        preGuardRefusals: preGuard.map((s) => ({ capability: s.capability, reason: String(s.reason).slice(0, 200) })),
        steps: steps.length,
        tokens: steps.reduce((a, s) => a + (s.tokens?.total ?? 0), 0),
        inputTokens: steps.reduce((a, s) => a + (s.tokens?.prompt ?? 0), 0),
        outputTokens: steps.reduce((a, s) => a + (s.tokens?.completion ?? 0), 0),
        maxOutputTokensInOneStep: Math.max(0, ...steps.map((s) => s.tokens?.completion ?? 0)),
        truncations: steps.filter((s) => s.truncated).length,
        memorySeenAtFirstJudged: judged ? memorySeen(taskId, judged.n) : null,
        adaptationsActive: active,
    };
    out.tasks.push(row);
    const seen = row.memorySeenAtFirstJudged;
    console.log(`${v.id} ${taskId}: first guard-judged ${row.firstGuardSubmission ? (row.firstGuardSubmission.accepted ? "ACCEPTED" : `refused (${row.firstGuardSubmission.shapes.join(" + ")})`) : "none"}; pre-guard ${preGuard.length}; truncated ${row.truncations}; steps ${row.steps}; tokens in ${row.inputTokens} out ${row.outputTokens} (max ${row.maxOutputTokensInOneStep}); memory seen: ${seen ? `${seen.learned.length} learned, ${seen.previousEpisodes} previous episode(s)` : "none"}`);
    for (const s of row.firstGuardSubmission?.shapes ?? []) failures.set(s, (failures.get(s) ?? 0) + 1);
    // The commissioning closed: the procedure relayed is refused (the experiment runs no test).
    const c = (await call("station", "commissioning_state", { commissioningId }).catch(() => null))?.commissioning;
    if (c?.status === "awaiting-authorisation") await call("station", "commissioning_authorise", { commissioningId, decision: "refuse", by: "commander (the learning experiment, driven by Claude at Guillaume's request)" });
    // Training: the reflection, focused on this task, until an adaptation of the repeated failure's form is adopted; then learning freezes.
    if (phase === "train" && !out.frozen) {
        const r = await call("station", "reflect", { builder, focus: taskId });
        const entry = { after: taskId, patterns: (r.patterns ?? []).map((p) => ({ id: p.id, family: p.family, says: p.says.slice(0, 400) })), judged: r.judged ?? [], taskId: r.taskId };
        if (r.taskId) {
            const rt = await until(r.taskId);
            entry.state = rt.state;
            entry.ended = rt.manifest?.ended ?? null;
            entry.proposals = (rt.manifest?.steps ?? []).filter((s) => s.capability === "reflection.propose" || s.capability === "reflection.remember").map((s) => ({ capability: s.capability, outcome: s.outcome, input: s.input, refused: s.outcome === "refused" ? String(s.reason).slice(0, 400) : null }));
            entry.proposal = rt.manifest?.proposal ?? null;
        }
        entry.memory = ledger().filter((e) => e.memory).map((e) => ({ n: e.n, status: e.status, rule: e.memory.rule, observed: e.observed ? { failures: e.observed.failures.length, successes: e.observed.successes.length } : null, why: e.why ?? null }));
        out.reflections.push(entry);
        console.log(`   reflection: ${entry.patterns.length} pattern(s)${r.taskId ? `, task ${r.taskId} ${entry.state}, proposal ${JSON.stringify(entry.proposal)}` : ""}; memory ${JSON.stringify(entry.memory.map((e) => `${e.n}:${e.status}`))}`);
        // Frozen once an entry of the memory is consolidated: the long-term memory the validation starts from.
        const consolidated = ledger().find((e) => e.memory && e.status === "consolidated");
        if (consolidated) {
            out.frozen = { at: new Date().toISOString(), afterTask: taskId, entry: consolidated, memory: memoryFile() };
            console.log(`   FROZEN: memory entry ${consolidated.n} consolidated; learning stops here`);
        }
    }
    writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`);
    // Learning frozen: the training ends there; the tasks left are neither baseline nor validation.
    if (out.frozen) break;
}
out.endedAt = new Date().toISOString();
out.ledger = ledger();
out.fingerprintAfter = fingerprint();
out.memoryAfter = memoryFile();
if (phase === "validate") out.memoryUnchanged = JSON.stringify(out.fingerprintBefore) === JSON.stringify(out.fingerprintAfter);
writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`);
await broker.close();
process.exit(0);
