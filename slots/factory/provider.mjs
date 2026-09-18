/**
 * slot `factory`, stub. The offline means of production (usine-jobs.fr.md, 4.1):
 * `run_sweep`, `run_fit`, `run_evaluate` take the job spec itself and answer
 * with a job id and a plan; `job_status`; `get_artifact`. The stub validates
 * nothing and runs nothing: it mints an id, remembers the spec, and reports
 * the job as completed at once. The real slot wraps `spikypanda-job` and the
 * runner the profile binds (Nebius Serverless Jobs, Qualcomm AI Hub, local).
 */
import { randomUUID } from "node:crypto";
import { publishStub } from "../lib/stub-provider.mjs";

const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const SPEC = { type: "object", description: "A job specification, identical to the file spikypanda-job reads" };

function runTool(kind) {
    return {
        name: `run_${kind}`,
        description: `Start a ${kind} job from its specification; returns a job id and the plan. Stub: nothing runs, the job completes at once.`,
        inputSchema: obj({ spec: SPEC }, ["spec"]),
        handle: ({ spec }, s) => {
            if (spec?.job !== kind) throw new Error(`spec.job is "${spec?.job}", this tool runs "${kind}" jobs`);
            const jobId = randomUUID();
            s.jobs[jobId] = { kind, name: spec.name, state: "completed", exit: 0, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), spec, files: ["manifest.json"] };
            return { jobId, accepted: true, plan: { kind, name: spec.name, note: "stub: no plan computed, nothing ran" } };
        },
    };
}

export function factorySlot(wsBase, log) {
    return publishStub({
        slot: "factory",
        description: "The factory (stub): sweep, fit and evaluate jobs by specification, job status, artifacts by location",
        wsBase,
        log,
        state: { runner: "stub", jobs: {} },
        tools: [
            runTool("sweep"),
            runTool("fit"),
            runTool("evaluate"),
            {
                name: "job_status",
                description: "State of a job: queued, running, completed, failed or refused, with its exit code and times.",
                inputSchema: obj({ jobId: { type: "string" } }, ["jobId"]),
                handle: ({ jobId }, s) => {
                    const j = s.jobs[jobId];
                    if (!j) throw new Error(`unknown job ${jobId}`);
                    const { spec, ...rest } = j;
                    return { jobId, ...rest, specName: spec.name };
                },
            },
            {
                name: "get_artifact",
                description: "A job's file: small files inline with their sha256, large ones by location and sha256, never the bytes. Stub: a placeholder manifest.",
                inputSchema: obj({ jobId: { type: "string" }, path: { type: "string" } }, ["jobId", "path"]),
                handle: ({ jobId, path }, s) => {
                    const j = s.jobs[jobId];
                    if (!j) throw new Error(`unknown job ${jobId}`);
                    if (path !== "manifest.json") throw new Error(`job ${jobId} has no file "${path}" (stub jobs write only manifest.json)`);
                    return { path, inline: { name: j.name, job: j.kind, stub: true }, sha256: null, location: null };
                },
            },
        ],
        resources: [{ uri: "factory://jobs", name: "Jobs", description: "Every job this slot accepted", read: (s) => Object.fromEntries(Object.entries(s.jobs).map(([id, j]) => [id, { kind: j.kind, name: j.name, state: j.state }])) }],
    });
}
